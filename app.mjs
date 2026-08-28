import {
  MARKER_TYPES,
  buildManifest,
  buildRenderPlan,
  createMarker,
  createSession,
  formatBytes,
  formatDuration,
  safeFilename,
  transitionSession
} from "./core.mjs";
import { SessionDatabase } from "./src/storage.mjs";
import { DrawingBoard } from "./src/drawing.mjs";
import { GoogleDriveClient } from "./src/drive.mjs";
import { RecordingEngine } from "./src/recorder.mjs";

const config = window.SAM_TEACHING_CONFIG || {};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

class TeachingStudioApp {
  constructor() {
    this.db = new SessionDatabase();
    this.session = null;
    this.lastRecording = null;
    this.mediaUrl = null;
    this.saveTimer = null;
    this.timerInterval = null;
    this.recordedBytes = 0;
    this.drive = new GoogleDriveClient({
      clientId: localStorage.getItem("sam-google-client-id") || config.googleClientId || "",
      scope: config.driveScope || "https://www.googleapis.com/auth/drive.file",
      folderName: config.driveFolderName || "SamTeachingVisual",
      chunkSize: config.uploadChunkSize || 8 * 1024 * 1024
    });
    this.board = new DrawingBoard($("#drawingCanvas"), (scene) => this.queueSceneSave(scene));
    this.recorder = new RecordingEngine({
      db: this.db,
      canvas: $("#drawingCanvas"),
      image: $("#mediaImage"),
      video: $("#mediaVideo"),
      webcamPreview: $("#webcamPreview"),
      compositeCanvas: $("#compositeCanvas"),
      onChunk: (blob) => this.onRecordingChunk(blob),
      onStatus: (status) => this.updateRecordingUi(status)
    });
  }

  async init() {
    await this.db.open();
    this.bindUi();
    await this.restoreOrCreateSession();
    await this.updateStorageEstimate();
    this.refreshUi();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  bindUi() {
    $("#newSessionBtn").addEventListener("click", () => this.newSession());
    $("#fullscreenBtn").addEventListener("click", () => this.toggleFullscreen());
    $("#sessionTitle").addEventListener("input", () => this.updateTitle());
    $("#addMediaBtn").addEventListener("click", () => $("#mediaInput").click());
    $("#emptyAddMediaBtn").addEventListener("click", () => $("#mediaInput").click());
    $("#mediaInput").addEventListener("change", (event) => this.loadMediaFile(event.target.files?.[0]));
    $("#removeMediaBtn").addEventListener("click", () => this.removeMedia());
    $("#mediaPlayBtn").addEventListener("click", () => this.toggleMedia());
    $("#mediaSeek").addEventListener("input", (event) => {
      const video = $("#mediaVideo");
      if (video.duration) video.currentTime = (Number(event.target.value) / 1000) * video.duration;
    });
    $("#mediaVideo").addEventListener("timeupdate", () => this.updateMediaProgress());
    $("#mediaVideo").addEventListener("loadedmetadata", () => this.updateMediaProgress());
    $("#mediaVideo").addEventListener("play", () => { $("#mediaPlayBtn").textContent = "Tạm dừng"; });
    $("#mediaVideo").addEventListener("pause", () => { $("#mediaPlayBtn").textContent = "Phát"; });

    $("#toolButtons").addEventListener("click", (event) => {
      const button = event.target.closest("[data-tool]");
      if (button) this.selectTool(button.dataset.tool);
    });
    $("#strokeColor").addEventListener("input", (event) => this.board.setColor(event.target.value));
    $("#strokeWidth").addEventListener("input", (event) => this.board.setWidth(event.target.value));
    $("#undoBtn").addEventListener("click", () => this.board.undo());
    $("#redoBtn").addEventListener("click", () => this.board.redo());
    $("#clearBtn").addEventListener("click", () => this.board.clear());

    $("#recordBtn").addEventListener("click", () => this.startRecording());
    $("#pauseBtn").addEventListener("click", () => this.togglePause());
    $("#stopBtn").addEventListener("click", () => this.stopRecording());
    $$('[data-marker]').forEach((button) => {
      button.addEventListener("click", () => this.addMarker(button.dataset.marker));
    });
    $("#markerList").addEventListener("click", (event) => {
      const markerId = event.target.closest("[data-remove-marker]")?.dataset.removeMarker;
      if (markerId) this.removeMarker(markerId);
    });

    $("#recoverBtn").addEventListener("click", () => this.recoverRecording());
    $("#downloadVideoBtn").addEventListener("click", () => this.downloadVideo());
    $("#downloadPackageBtn").addEventListener("click", () => this.downloadPackage());
    $("#driveConnectBtn").addEventListener("click", () => this.connectDrive());
    $("#uploadDriveBtn").addEventListener("click", () => this.uploadToDrive());
    $("#saveClientIdBtn").addEventListener("click", () => this.saveClientId());
    $("#googleClientId").value = this.drive.clientId;

    document.addEventListener("keydown", (event) => this.keyboardShortcuts(event));
    window.addEventListener("beforeunload", (event) => {
      if (this.recorder.recorder?.state === "recording") {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  async restoreOrCreateSession() {
    const currentId = localStorage.getItem("sam-current-session");
    this.session = currentId ? await this.db.getSession(currentId) : null;
    if (!this.session) this.session = (await this.db.listSessions())[0] || createSession($("#sessionTitle").value);
    if (["recording", "paused", "processing"].includes(this.session.state)) {
      this.session = { ...this.session, state: "ready", updatedAt: new Date().toISOString() };
    }
    localStorage.setItem("sam-current-session", this.session.id);
    await this.db.putSession(this.session);
    $("#sessionTitle").value = this.session.title;
    const scene = await this.db.getScene(this.session.id);
    if (scene) this.board.importScene(scene);
    const media = await this.db.getMedia(this.session.id);
    if (media?.blob) await this.displayMedia(media.blob, media.name, false);
    await this.recoverRecording(false);
  }

  async newSession() {
    if (this.recorder.recorder && this.recorder.recorder.state !== "inactive") {
      this.toast("Hãy dừng bản ghi trước khi tạo phiên mới", "error");
      return;
    }
    const title = `Buổi học ${new Date().toLocaleDateString("vi-VN")}`;
    this.session = createSession(title);
    this.lastRecording = null;
    this.board.importScene(null);
    await this.removeMedia(false);
    localStorage.setItem("sam-current-session", this.session.id);
    await this.db.putSession(this.session);
    $("#sessionTitle").value = title;
    this.refreshUi();
    this.toast("Đã tạo phiên học mới", "success");
  }

  async updateTitle() {
    if (!this.session) return;
    this.session = {
      ...this.session,
      title: $("#sessionTitle").value.trim() || "Buổi học mới",
      updatedAt: new Date().toISOString()
    };
    await this.db.putSession(this.session);
    this.markSaved();
  }

  selectTool(tool) {
    this.board.setTool(tool);
    $$('[data-tool]').forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === tool);
    });
  }

  keyboardShortcuts(event) {
    if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    const toolByKey = { p: "pen", h: "highlighter", e: "eraser", l: "line", a: "arrow", r: "rect", t: "text" };
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? this.board.redo() : this.board.undo();
      return;
    }
    if (toolByKey[event.key.toLowerCase()]) this.selectTool(toolByKey[event.key.toLowerCase()]);
  }

  queueSceneSave(scene) {
    clearTimeout(this.saveTimer);
    $("#saveState").textContent = "Đang lưu…";
    this.saveTimer = setTimeout(async () => {
      if (!this.session) return;
      await this.db.putScene(this.session.id, scene);
      this.markSaved();
      this.refreshUi();
    }, 250);
  }

  markSaved() {
    $("#saveState").textContent = `Đã lưu ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
  }

  async loadMediaFile(file) {
    if (!file) return;
    if (!(file.type.startsWith("image/") || file.type.startsWith("video/"))) {
      this.toast("Chỉ hỗ trợ tệp ảnh hoặc video", "error");
      return;
    }
    await this.db.putMedia(this.session.id, {
      blob: file,
      name: file.name,
      type: file.type,
      size: file.size,
      updatedAt: new Date().toISOString()
    });
    this.session = {
      ...this.session,
      media: { name: file.name, type: file.type, size: file.size },
      updatedAt: new Date().toISOString()
    };
    await this.db.putSession(this.session);
    await this.displayMedia(file, file.name, true);
  }

  async displayMedia(blob, name, notify = true) {
    if (this.mediaUrl) URL.revokeObjectURL(this.mediaUrl);
    this.mediaUrl = URL.createObjectURL(blob);
    const image = $("#mediaImage");
    const video = $("#mediaVideo");
    image.hidden = true;
    video.hidden = true;
    video.pause();
    video.removeAttribute("src");
    if (blob.type.startsWith("video/")) {
      video.src = this.mediaUrl;
      video.hidden = false;
      $("#mediaPlayBtn").disabled = false;
      $("#mediaSeek").disabled = false;
    } else {
      image.src = this.mediaUrl;
      image.hidden = false;
      $("#mediaPlayBtn").disabled = true;
      $("#mediaSeek").disabled = true;
    }
    $("#emptyStage").hidden = true;
    $("#removeMediaBtn").disabled = false;
    if (notify) this.toast(`Đã thêm ${name}`, "success");
  }

  async removeMedia(persist = true) {
    const image = $("#mediaImage");
    const video = $("#mediaVideo");
    image.hidden = true;
    image.removeAttribute("src");
    video.pause();
    video.hidden = true;
    video.removeAttribute("src");
    if (this.mediaUrl) URL.revokeObjectURL(this.mediaUrl);
    this.mediaUrl = null;
    $("#emptyStage").hidden = false;
    $("#removeMediaBtn").disabled = true;
    $("#mediaPlayBtn").disabled = true;
    $("#mediaSeek").disabled = true;
    if (persist && this.session) {
      await this.db.putMedia(this.session.id, { blob: null, name: null, type: null, size: 0, updatedAt: new Date().toISOString() });
      this.session = { ...this.session, media: null, updatedAt: new Date().toISOString() };
      await this.db.putSession(this.session);
    }
  }

  toggleMedia() {
    const video = $("#mediaVideo");
    if (!video.hidden) video.paused ? video.play() : video.pause();
  }

  updateMediaProgress() {
    const video = $("#mediaVideo");
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    $("#mediaSeek").value = duration ? String(Math.round((video.currentTime / duration) * 1000)) : "0";
    $("#mediaTime").textContent = `${formatDuration(video.currentTime)} / ${formatDuration(duration)}`;
  }

  async startRecording() {
    try {
      this.lastRecording = null;
      this.recordedBytes = 0;
      if (["uploaded", "failed"].includes(this.session.state)) {
        this.session = { ...this.session, state: "ready", updatedAt: new Date().toISOString() };
      }
      this.session = transitionSession(this.session, "recording");
      await this.db.putSession(this.session);
      await this.recorder.start({
        sessionId: this.session.id,
        source: $("#recordSource").value,
        quality: $("#qualitySelect").value,
        mic: $("#micToggle").checked,
        systemAudio: $("#systemAudioToggle").checked,
        webcam: $("#webcamToggle").checked,
        timeslice: config.recordingTimesliceMs || 5000
      });
      $("#recordingBadge").hidden = false;
      this.timerInterval = setInterval(() => this.updateTimer(), 200);
      this.refreshUi();
      this.toast("Đã bắt đầu ghi. Mỗi đoạn được tự lưu cục bộ.", "success");
    } catch (error) {
      if (this.session?.state === "recording") this.session = transitionSession(this.session, "ready");
      await this.db.putSession(this.session).catch(() => {});
      await this.recorder.cleanup().catch(() => {});
      this.updateRecordingUi("stopped");
      this.refreshUi();
      this.toast(this.describeMediaError(error), "error");
    }
  }

  describeMediaError(error) {
    if (error?.name === "NotAllowedError") return "Trình duyệt chưa được cấp quyền màn hình, micro hoặc camera.";
    if (error?.name === "NotFoundError") return "Không tìm thấy micro hoặc camera phù hợp.";
    return error?.message || "Không thể bắt đầu ghi hình";
  }

  togglePause() {
    if (this.recorder.recorder?.state === "recording") this.recorder.pause();
    else if (this.recorder.recorder?.state === "paused") this.recorder.resume();
  }

  async stopRecording() {
    try {
      this.session = transitionSession(this.session, "processing");
      await this.db.putSession(this.session);
      const result = await this.recorder.stop();
      if (!result) return;
      this.lastRecording = result;
      this.session = {
        ...transitionSession(this.session, "ready"),
        recording: {
          duration: result.duration,
          mimeType: result.mimeType,
          chunkCount: result.chunkCount,
          size: result.size
        }
      };
      await this.db.putSession(this.session);
      clearInterval(this.timerInterval);
      this.timerInterval = null;
      $("#recordingBadge").hidden = true;
      this.refreshUi();
      this.toast(`Đã lưu ${result.chunkCount} đoạn — ${formatBytes(result.size)}`, "success");
      await this.updateStorageEstimate();
    } catch (error) {
      this.toast(error.message || "Không thể kết thúc bản ghi", "error");
    }
  }

  onRecordingChunk(blob) {
    this.recordedBytes += blob.size;
    $("#recordSize").textContent = formatBytes(this.recordedBytes);
  }

  updateTimer() { $("#recordTimer").textContent = formatDuration(this.recorder.elapsedSeconds()); }

  updateRecordingUi(status) {
    const recording = status === "recording";
    const paused = status === "paused";
    const active = recording || paused;
    $("#recordBtn").disabled = active;
    $("#pauseBtn").disabled = !active;
    $("#pauseBtn").textContent = paused ? "Tiếp tục" : "Tạm dừng";
    $("#stopBtn").disabled = !active;
    $$("#recordSource, #qualitySelect, #micToggle, #systemAudioToggle, #webcamToggle").forEach((element) => {
      element.disabled = active;
    });
    $("#sessionState").textContent = recording ? "Đang ghi" : paused ? "Đang tạm dừng" : "Sẵn sàng";
  }

  async addMarker(type) {
    if (!MARKER_TYPES[type]) return;
    const at = this.recorder.recorder && this.recorder.recorder.state !== "inactive"
      ? this.recorder.elapsedSeconds()
      : Number($("#mediaVideo").currentTime) || 0;
    const marker = createMarker(type, at);
    this.session = {
      ...this.session,
      markers: [...(this.session.markers || []), marker],
      updatedAt: new Date().toISOString()
    };
    await this.db.putSession(this.session);
    this.renderMarkers();
    this.toast(`${MARKER_TYPES[type]} tại ${formatDuration(at)}`, "success");
  }

  async removeMarker(id) {
    this.session = {
      ...this.session,
      markers: (this.session.markers || []).filter((marker) => marker.id !== id),
      updatedAt: new Date().toISOString()
    };
    await this.db.putSession(this.session);
    this.renderMarkers();
  }

  renderMarkers() {
    const markers = [...(this.session?.markers || [])].sort((a, b) => a.at - b.at);
    $("#markerCount").textContent = String(markers.length);
    $("#markerList").innerHTML = markers.length
      ? markers.map((marker) => `<div class="marker-item"><time>${formatDuration(marker.at)}</time><span>${escapeHtml(marker.label)}</span><button data-remove-marker="${marker.id}" title="Xóa">×</button></div>`).join("")
      : "<p>Chưa có dấu mốc.</p>";
  }

  async recoverRecording(notify = true) {
    const rows = await this.db.getChunks(this.session.id);
    if (!rows.length) {
      if (notify) this.toast("Phiên này chưa có chunk ghi hình cục bộ", "error");
      return null;
    }
    const mimeType = rows[0].mimeType || this.session.recording?.mimeType || "video/webm";
    const blob = new Blob(rows.map((row) => row.blob), { type: mimeType });
    this.lastRecording = {
      blob,
      mimeType,
      size: blob.size,
      chunkCount: rows.length,
      duration: this.session.recording?.duration || 0
    };
    this.refreshUi();
    if (notify) this.toast(`Đã khôi phục ${rows.length} chunk`, "success");
    return this.lastRecording;
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async downloadVideo() {
    if (!this.lastRecording) await this.recoverRecording(false);
    if (!this.lastRecording) {
      this.toast("Chưa có video để tải", "error");
      return;
    }
    const extension = this.lastRecording.mimeType.includes("mp4") ? "mp4" : "webm";
    this.downloadBlob(this.lastRecording.blob, safeFilename(`${this.session.title}-recording`, extension));
  }

  currentArtifacts() {
    const recording = this.lastRecording || {
      duration: this.session.recording?.duration || 0,
      mimeType: this.session.recording?.mimeType || "video/webm",
      chunkCount: this.session.recording?.chunkCount || 0,
      size: this.session.recording?.size || 0
    };
    const scene = this.board.exportScene();
    const manifest = buildManifest(this.session, { ...recording, scene });
    const duration = recording.duration || Math.max(1, ...((this.session.markers || []).map((marker) => marker.at + 10)), 1);
    const renderPlan = buildRenderPlan({ duration, markers: this.session.markers || [], sessionId: this.session.id });
    return { scene, manifest, renderPlan };
  }

  downloadJson(value, filename) {
    this.downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), filename);
  }

  downloadPackage() {
    const { scene, manifest, renderPlan } = this.currentArtifacts();
    const base = safeFilename(this.session.title);
    this.downloadJson(scene, `${base}-scene.json`);
    setTimeout(() => this.downloadJson(manifest, `${base}-manifest.json`), 180);
    setTimeout(() => this.downloadJson(renderPlan, `${base}-render-plan.json`), 360);
  }

  saveClientId() {
    const value = $("#googleClientId").value.trim();
    if (value && !value.endsWith(".apps.googleusercontent.com")) {
      this.toast("Google Client ID phải kết thúc bằng .apps.googleusercontent.com", "error");
      return false;
    }
    localStorage.setItem("sam-google-client-id", value);
    this.drive.configure(value);
    this.toast("Đã lưu OAuth Client ID trên trình duyệt này", "success");
    return Boolean(value);
  }

  async connectDrive() {
    try {
      if (!this.drive.clientId && !this.saveClientId()) throw new Error("Hãy nhập OAuth Web Client ID trước");
      await this.drive.connect();
      $("#driveConnectBtn").textContent = "Drive đã kết nối";
      $("#uploadDriveBtn").disabled = false;
      this.toast("Đã kết nối Google Drive với quyền drive.file", "success");
    } catch (error) {
      this.toast(error.message, "error");
    }
  }

  async uploadToDrive() {
    try {
      if (!this.drive.accessToken) await this.connectDrive();
      if (!this.drive.accessToken) return;
      if (!this.lastRecording) await this.recoverRecording(false);
      const rootId = await this.drive.ensureRootFolder();
      const folderName = `${new Date().toISOString().slice(0, 10)} - ${this.session.title}`.slice(0, 120);
      const folder = await this.drive.createFolder(folderName, rootId);
      const artifacts = this.currentArtifacts();
      const files = [
        ...(this.lastRecording ? [{
          name: safeFilename(`${this.session.title}-recording`, this.lastRecording.mimeType.includes("mp4") ? "mp4" : "webm"),
          blob: this.lastRecording.blob,
          type: this.lastRecording.mimeType
        }] : []),
        { name: "scene.json", blob: new Blob([JSON.stringify(artifacts.scene, null, 2)], { type: "application/json" }), type: "application/json" },
        { name: "manifest.json", blob: new Blob([JSON.stringify(artifacts.manifest, null, 2)], { type: "application/json" }), type: "application/json" },
        { name: "render-plan.json", blob: new Blob([JSON.stringify(artifacts.renderPlan, null, 2)], { type: "application/json" }), type: "application/json" }
      ];
      $("#uploadProgressWrap").hidden = false;
      const uploaded = [];
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        const result = await this.drive.uploadBlob({
          blob: file.blob,
          name: file.name,
          mimeType: file.type,
          parentId: folder.id,
          onProgress: (progress) => this.setUploadProgress((fileIndex + progress) / files.length)
        });
        uploaded.push(result);
      }
      this.session = {
        ...this.session,
        state: "uploaded",
        drive: {
          folderId: folder.id,
          files: uploaded.map((file) => ({ id: file.id, name: file.name, webViewLink: file.webViewLink }))
        },
        updatedAt: new Date().toISOString()
      };
      await this.db.putSession(this.session);
      this.setUploadProgress(1);
      this.toast(`Đã lưu ${uploaded.length} tệp vào Google Drive`, "success");
      this.refreshUi();
    } catch (error) {
      this.toast(error.message || "Upload Drive thất bại", "error");
    }
  }

  setUploadProgress(progress) {
    const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
    $("#uploadProgress").style.width = `${percent}%`;
    $("#uploadProgressText").textContent = `${percent}%`;
  }

  async updateStorageEstimate() {
    try {
      if (!navigator.storage?.estimate) throw new Error("unsupported");
      const estimate = await navigator.storage.estimate();
      $("#storageEstimate").textContent = `${formatBytes(estimate.usage || 0)} / ${formatBytes(estimate.quota || 0)} cục bộ`;
    } catch {
      $("#storageEstimate").textContent = "Tự lưu bằng IndexedDB";
    }
  }

  toggleFullscreen() {
    document.fullscreenElement ? document.exitFullscreen() : $("#stageFrame").requestFullscreen?.();
  }

  refreshUi() {
    if (!this.session) return;
    $("#sessionState").textContent = this.session.state === "uploaded"
      ? "Đã lưu Drive"
      : this.recorder.recorder?.state === "recording"
        ? "Đang ghi"
        : "Sẵn sàng";
    this.renderMarkers();
    const hasRecording = Boolean(this.lastRecording || this.session.recording);
    $("#downloadVideoBtn").disabled = !hasRecording;
    $("#uploadDriveBtn").disabled = !this.drive.accessToken;
    $("#videoFileState").textContent = hasRecording
      ? `${this.session.recording?.chunkCount || this.lastRecording?.chunkCount || 0} chunk`
      : "Chưa ghi";
    $("#sceneFileState").textContent = `${this.board.items.length} đối tượng`;
    $("#manifestFileState").textContent = `${(this.session.markers || []).length} marker`;
    if (this.session.recording) {
      $("#recordTimer").textContent = formatDuration(this.session.recording.duration);
      $("#recordSize").textContent = formatBytes(this.session.recording.size);
    }
  }

  toast(message, type = "") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    $("#toastRegion").appendChild(toast);
    setTimeout(() => toast.remove(), 5200);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}

const application = new TeachingStudioApp();
application.init().catch((error) => {
  console.error(error);
  const item = document.createElement("div");
  item.className = "toast error";
  item.textContent = `Không thể khởi tạo ứng dụng: ${error.message}`;
  $("#toastRegion").appendChild(item);
});
