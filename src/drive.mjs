import { chunkRanges, isRetryableStatus } from "../core.mjs";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class GoogleDriveClient {
  constructor({ clientId, scope, folderName, chunkSize }) {
    this.clientId = clientId;
    this.scope = scope;
    this.folderName = folderName;
    this.chunkSize = chunkSize;
    this.accessToken = null;
    this.expiresAt = 0;
    this.folderId = localStorage.getItem("sam-drive-folder-id") || null;
  }

  configure(clientId) { this.clientId = clientId; }

  async waitForGoogle(timeout = 12000) {
    const startedAt = Date.now();
    while (!window.google?.accounts?.oauth2) {
      if (Date.now() - startedAt > timeout) throw new Error("Không tải được Google Identity Services");
      await sleep(120);
    }
  }

  async connect() {
    if (!this.clientId) throw new Error("Hãy nhập Google OAuth Web Client ID trước");
    await this.waitForGoogle();
    const token = await new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: this.scope,
        callback: (response) => response?.access_token
          ? resolve(response)
          : reject(new Error(response?.error || "Google không cấp quyền")),
        error_callback: (error) => reject(new Error(error?.message || "Không thể mở cửa sổ đăng nhập Google"))
      });
      client.requestAccessToken({ prompt: this.accessToken ? "" : "consent" });
    });
    this.accessToken = token.access_token;
    this.expiresAt = Date.now() + Math.max(60, Number(token.expires_in) || 3600) * 1000 - 60000;
    return token;
  }

  async ensureToken() {
    if (!this.accessToken || Date.now() >= this.expiresAt) await this.connect();
    return this.accessToken;
  }

  async api(url, options = {}, retry = true) {
    const accessToken = await this.ensureToken();
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) }
    });
    if (response.status === 401 && retry) {
      this.accessToken = null;
      return this.api(url, options, false);
    }
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`Google Drive ${response.status}: ${message.slice(0, 280)}`);
    }
    return response;
  }

  async createFolder(name, parentId = null) {
    const metadata = { name, mimeType: "application/vnd.google-apps.folder" };
    if (parentId) metadata.parents = [parentId];
    const response = await this.api("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata)
    });
    return response.json();
  }

  async ensureRootFolder() {
    if (this.folderId) return this.folderId;
    const folder = await this.createFolder(this.folderName);
    this.folderId = folder.id;
    localStorage.setItem("sam-drive-folder-id", folder.id);
    return folder.id;
  }

  async initiateUpload({ name, mimeType, parentId, size }) {
    const response = await this.api("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,webViewLink", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(size)
      },
      body: JSON.stringify({ name, parents: parentId ? [parentId] : undefined })
    });
    const location = response.headers.get("Location");
    if (!location) throw new Error("Google Drive không trả về resumable session URL");
    return location;
  }

  async uploadBlob({ blob, name, mimeType = blob.type || "application/octet-stream", parentId, onProgress = () => {}, sessionUrl = null }) {
    const uploadUrl = sessionUrl || await this.initiateUpload({ name, mimeType, parentId, size: blob.size });
    const ranges = chunkRanges(blob.size, this.chunkSize);
    let finalResult = null;

    for (let index = 0; index < ranges.length; index += 1) {
      const range = ranges[index];
      let attempt = 0;
      while (true) {
        try {
          const response = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${await this.ensureToken()}`,
              "Content-Type": mimeType,
              "Content-Range": `bytes ${range.start}-${range.endInclusive}/${range.total}`
            },
            body: blob.slice(range.start, range.endExclusive, mimeType)
          });
          if (response.status === 308) break;
          if (response.ok) {
            finalResult = await response.json();
            break;
          }
          if (!isRetryableStatus(response.status) || attempt >= 4) {
            throw new Error(`Upload Drive thất bại: HTTP ${response.status}`);
          }
        } catch (error) {
          if (attempt >= 4) throw error;
        }
        attempt += 1;
        await sleep(Math.min(8000, 500 * 2 ** attempt + Math.random() * 350));
      }
      onProgress((index + 1) / ranges.length, { index, total: ranges.length, sessionUrl: uploadUrl });
    }

    if (!finalResult) throw new Error("Google Drive chưa xác nhận hoàn tất upload");
    return finalResult;
  }
}
