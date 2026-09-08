import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

let cachedToken = null;
let tokenExpiresAt = 0;
const RETRY_DELAYS = [1000, 3000, 7000];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const escQuery = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function layAccessToken({ tokenPath, credentialsPath }) {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  let tokenData = {};
  let credData = {};
  try {
    if (tokenPath) tokenData = JSON.parse(await readFile(tokenPath, "utf8"));
  } catch (err) {
    const error = new Error(`Không đọc được file token Drive: ${err.message}`);
    error.code = "THIEU_CREDENTIAL";
    throw error;
  }
  try {
    if (credentialsPath) credData = JSON.parse(await readFile(credentialsPath, "utf8"));
  } catch { /* credentialsPath tuỳ chọn nếu tokenPath đủ clientId/clientSecret */ }

  const inst = credData.installed || credData.web || {};
  const clientId = tokenData.client_id || inst.client_id;
  const clientSecret = tokenData.client_secret || inst.client_secret;
  const refreshToken = tokenData.refresh_token;
  if (!refreshToken || !clientId || !clientSecret) {
    const error = new Error("Thiếu refresh_token, client_id hoặc client_secret Google Drive.");
    error.code = "THIEU_CREDENTIAL";
    throw error;
  }

  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
  let res;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params.toString()
    });
  } catch (err) {
    const error = new Error(`Lỗi mạng khi xin access_token Google Drive: ${err.message}`);
    error.code = "DRIVE_LOI";
    throw error;
  }
  if (!res.ok) {
    const error = new Error(`Không đổi được refresh_token Google Drive (HTTP ${res.status})`);
    error.code = res.status === 400 || res.status === 401 ? "THIEU_CREDENTIAL" : "DRIVE_LOI";
    throw error;
  }
  const payload = await res.json();
  cachedToken = payload.access_token;
  tokenExpiresAt = Date.now() + (Number(payload.expires_in) || 3600) * 1000;
  return cachedToken;
}

async function driveFetch(url, options = {}, accessToken) {
  const headers = { ...(options.headers || {}), authorization: `Bearer ${accessToken}` };
  for (let i = 0; i <= RETRY_DELAYS.length; i++) {
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.ok) return res;
      if ((res.status === 429 || res.status >= 500) && i < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[i]);
        continue;
      }
      const text = await res.text().catch(() => "");
      const err = new Error(`Google Drive API lỗi HTTP ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status;
      err.code = "DRIVE_LOI";
      throw err;
    } catch (err) {
      if (i < RETRY_DELAYS.length && (err.status === 429 || (err.status && err.status >= 500) || !err.status)) {
        await sleep(RETRY_DELAYS[i]);
        continue;
      }
      if (!err.code) err.code = "DRIVE_LOI";
      throw err;
    }
  }
}

async function kiemTraThuMucCha(parentId, accessToken) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(parentId)}?fields=id,name,trashed,capabilities(canAddChildren)&supportsAllDrives=true`;
  const res = await driveFetch(url, { method: "GET" }, accessToken);
  const data = await res.json();
  if (data.trashed || !data.capabilities?.canAddChildren) {
    const error = new Error(`Thư mục Drive cha (${parentId}) đã bị xóa hoặc không có quyền ghi (canAddChildren=false).`);
    error.code = "DRIVE_LOI";
    throw error;
  }
}

async function timHoacTaoThuMucCon(ten, parentId, accessToken) {
  const q = `name='${escQuery(ten)}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${escQuery(parentId)}' in parents`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true`;
  const sRes = await driveFetch(searchUrl, { method: "GET" }, accessToken);
  const data = await sRes.json();
  if (data.files && data.files.length > 0) return data.files[0].id;

  const cRes = await driveFetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: ten, mimeType: "application/vnd.google-apps.folder", parents: [parentId] })
  }, accessToken);
  const created = await cRes.json();
  return created.id;
}

async function kiemTraQuyenRiengTu(folderId, accessToken) {
  const permUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions?fields=permissions(type,role)&supportsAllDrives=true`;
  const res = await driveFetch(permUrl, { method: "GET" }, accessToken);
  const data = await res.json();
  if (data.permissions && data.permissions.some((p) => p.type === "anyone")) {
    const error = new Error("Thư mục Google Drive ở chế độ công khai (anyone), vi phạm quy định riêng tư.");
    error.code = "DRIVE_LOI";
    throw error;
  }
}

export async function luuVaoThuMucDrive({ tenThuMuc = "_VeBangDayHoc", parentId, files, tokenPath, credentialsPath }) {
  if (!parentId) {
    const err = new Error("Máy chủ chưa cấu hình thư mục Google Drive đích (SAM_DRIVE_PARENT).");
    err.code = "THIEU_CREDENTIAL";
    throw err;
  }
  const accessToken = await layAccessToken({ tokenPath, credentialsPath });
  await kiemTraThuMucCha(parentId, accessToken);
  const folderId = await timHoacTaoThuMucCon(tenThuMuc, parentId, accessToken);
  await kiemTraQuyenRiengTu(folderId, accessToken);

  const ketQua = [];
  for (const file of files) {
    const { ten, kieu = "image/png", buffer } = file;
    const bytes = buffer.length;
    const md5 = crypto.createHash("md5").update(buffer).digest("hex");

    const q = `'${escQuery(folderId)}' in parents and name='${escQuery(ten)}' and trashed=false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,md5Checksum,webViewLink)&supportsAllDrives=true`;
    const sData = await (await driveFetch(searchUrl, { method: "GET" }, accessToken)).json();
    const exist = sData.files && sData.files[0];

    let fileId;
    let trangThai;
    if (exist && Number(exist.size) === bytes && exist.md5Checksum === md5) {
      ketQua.push({ ten, id: exist.id, bytes, md5, url: exist.webViewLink || `https://drive.google.com/file/d/${exist.id}/view`, trangThai: "tai_su_dung" });
      continue;
    } else if (exist) {
      const uUrl = `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(exist.id)}?uploadType=media&supportsAllDrives=true`;
      await driveFetch(uUrl, { method: "PATCH", headers: { "content-type": kieu, "content-length": String(bytes) }, body: buffer }, accessToken);
      fileId = exist.id;
      trangThai = "cap_nhat";
    } else {
      const b = `-------SamBoundary${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
      const meta = JSON.stringify({ name: ten, parents: [folderId] });
      const p1 = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: ${kieu}\r\n\r\n`;
      const p3 = `\r\n--${b}--\r\n`;
      const body = Buffer.concat([Buffer.from(p1, "utf8"), buffer, Buffer.from(p3, "utf8")]);
      const upUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";
      const uData = await (await driveFetch(upUrl, { method: "POST", headers: { "content-type": `multipart/related; boundary=${b}` }, body }, accessToken)).json();
      fileId = uData.id;
      trangThai = "da_tai_len";
    }

    const vUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,size,md5Checksum,webViewLink&supportsAllDrives=true`;
    const vData = await (await driveFetch(vUrl, { method: "GET" }, accessToken)).json();
    if (Number(vData.size) !== bytes || vData.md5Checksum !== md5) {
      const err = new Error(`Xác minh sau upload file ${ten} thất bại (lệch size hoặc md5).`);
      err.code = "DRIVE_LOI";
      throw err;
    }
    ketQua.push({ ten, id: fileId, bytes, md5, url: vData.webViewLink || `https://drive.google.com/file/d/${fileId}/view`, trangThai });
  }

  return { thuMuc: { id: folderId, ten: tenThuMuc, url: `https://drive.google.com/drive/folders/${folderId}` }, files: ketQua };
}
