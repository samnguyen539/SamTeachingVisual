import { STUDIO_WIDTH, STUDIO_HEIGHT, chooseMimeType, containRect, qualityPreset } from "../core.mjs";

export class RecordingEngine {
  constructor({ db, canvas, image, video, webcamPreview, compositeCanvas, onChunk, onStatus }) {
    Object.assign(this, { db, canvas, image, video, webcamPreview, compositeCanvas, onChunk, onStatus });
    this.recorder = null;
    this.outputStream = null;
    this.sourceStreams = [];
    this.videoElements = [];
    this.animationFrame = null;
    this.audioContext = null;
    this.startedAt = 0;
    this.pausedAt = 0;
    this.totalPausedMs = 0;
    this.chunkIndex = 0;
    this.pendingChunkWrites = new Set();
    this.mimeType = "video/webm";
    this.sessionId = null;
  }

  elapsedSeconds() {
    if (!this.startedAt) return 0;
    const now = this.recorder?.state === "paused" ? this.pausedAt : performance.now();
    return Math.max(0, (now - this.startedAt - this.totalPausedMs) / 1000);
  }

  async start({ sessionId, source, quality, mic, systemAudio, webcam, timeslice }) {
    if (this.recorder && this.recorder.state !== "inactive") throw new Error("Đang có một bản ghi khác");
    this.sessionId = sessionId;
    this.chunkIndex = 0;
    this.pendingChunkWrites.clear();
    await this.db.clearChunks(sessionId);
    const preset = qualityPreset(quality);

    const userStream = (mic || webcam)
      ? await navigator.mediaDevices.getUserMedia({
        audio: mic ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
        video: webcam ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false
      })
      : null;

    if (userStream) this.sourceStreams.push(userStream);
    if (webcam && userStream?.getVideoTracks().length) {
      this.webcamPreview.srcObject = new MediaStream(userStream.getVideoTracks());
      this.webcamPreview.hidden = false;
      await this.webcamPreview.play();
    } else {
      this.webcamPreview.hidden = true;
      this.webcamPreview.srcObject = null;
    }

    let displayStream = null;
    let displayElement = null;
    if (source === "screen") {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: preset.fps, max: preset.fps } },
        audio: Boolean(systemAudio)
      });
      this.sourceStreams.push(displayStream);
      displayElement = document.createElement("video");
      displayElement.srcObject = new MediaStream(displayStream.getVideoTracks());
      displayElement.muted = true;
      displayElement.playsInline = true;
      await displayElement.play();
      this.videoElements.push(displayElement);
      displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (this.recorder?.state !== "inactive") this.stop().catch(() => {});
      });
    }

    const compositeStream = this.createCompositeVideoStream({
      visualElement: displayElement,
      fps: preset.fps,
      webcam: webcam ? this.webcamPreview : null
    });

    const audioTracks = await this.mixAudio([
      ...(mic && userStream ? [new MediaStream(userStream.getAudioTracks())] : []),
      ...(systemAudio && displayStream ? [new MediaStream(displayStream.getAudioTracks())] : []),
      ...(source === "studio" ? this.getMediaAudioStreams() : [])
    ]);

    this.outputStream = new MediaStream([...compositeStream.getVideoTracks(), ...audioTracks]);
    this.mimeType = chooseMimeType((type) => MediaRecorder.isTypeSupported(type));
    const options = {
      videoBitsPerSecond: preset.videoBitsPerSecond,
      audioBitsPerSecond: preset.audioBitsPerSecond
    };
    if (this.mimeType) options.mimeType = this.mimeType;

    this.recorder = new MediaRecorder(this.outputStream, options);
    this.recorder.addEventListener("dataavailable", (event) => {
      if (!event.data?.size) return;
      const index = this.chunkIndex;
      this.chunkIndex += 1;
      const write = this.db.putChunk(this.sessionId, index, event.data, this.recorder.mimeType || this.mimeType)
        .then(() => this.onChunk?.(event.data, this.chunkIndex))
        .finally(() => this.pendingChunkWrites.delete(write));
      this.pendingChunkWrites.add(write);
    });

    this.recorder.start(Math.max(1000, Number(timeslice) || 5000));
    this.startedAt = performance.now();
    this.pausedAt = 0;
    this.totalPausedMs = 0;
    this.onStatus?.("recording");
    return { mimeType: this.recorder.mimeType || this.mimeType, preset };
  }

  createCompositeVideoStream({ visualElement, fps, webcam }) {
    const canvas = this.compositeCanvas;
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = STUDIO_WIDTH;
    canvas.height = STUDIO_HEIGHT;

    const draw = () => {
      context.fillStyle = "#05090f";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const source = visualElement
        || (!this.video.hidden && this.video.readyState >= 2 ? this.video : null)
        || (!this.image.hidden && this.image.complete ? this.image : null);
      if (source) {
        const sourceWidth = source.videoWidth || source.naturalWidth || STUDIO_WIDTH;
        const sourceHeight = source.videoHeight || source.naturalHeight || STUDIO_HEIGHT;
        const rect = containRect(sourceWidth, sourceHeight, canvas.width, canvas.height);
        try { context.drawImage(source, rect.x, rect.y, rect.width, rect.height); } catch {}
      }
      context.drawImage(this.canvas, 0, 0, canvas.width, canvas.height);
      if (webcam && !webcam.hidden && webcam.readyState >= 2) {
        const width = 330;
        const height = 248;
        const padding = 34;
        context.save();
        context.shadowColor = "rgba(0,0,0,.55)";
        context.shadowBlur = 28;
        context.fillStyle = "white";
        context.fillRect(canvas.width - width - padding - 4, canvas.height - height - padding - 4, width + 8, height + 8);
        context.shadowBlur = 0;
        context.drawImage(webcam, canvas.width - width - padding, canvas.height - height - padding, width, height);
        context.restore();
      }
      this.animationFrame = requestAnimationFrame(draw);
    };

    draw();
    return canvas.captureStream(fps);
  }

  getMediaAudioStreams() {
    if (this.video.hidden || typeof this.video.captureStream !== "function") return [];
    try {
      const stream = this.video.captureStream();
      return stream.getAudioTracks().length ? [new MediaStream(stream.getAudioTracks())] : [];
    } catch {
      return [];
    }
  }

  async mixAudio(streams) {
    const usable = streams.filter((stream) => stream?.getAudioTracks().length);
    if (!usable.length) return [];
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass();
    const destination = this.audioContext.createMediaStreamDestination();
    const seenTrackIds = new Set();
    for (const stream of usable) {
      const tracks = stream.getAudioTracks().filter((track) => !seenTrackIds.has(track.id));
      tracks.forEach((track) => seenTrackIds.add(track.id));
      if (!tracks.length) continue;
      const source = this.audioContext.createMediaStreamSource(new MediaStream(tracks));
      source.connect(destination);
    }
    return destination.stream.getAudioTracks();
  }

  pause() {
    if (this.recorder?.state !== "recording") return;
    this.recorder.pause();
    this.pausedAt = performance.now();
    this.onStatus?.("paused");
  }

  resume() {
    if (this.recorder?.state !== "paused") return;
    this.totalPausedMs += performance.now() - this.pausedAt;
    this.pausedAt = 0;
    this.recorder.resume();
    this.onStatus?.("recording");
  }

  async stop() {
    if (!this.recorder || this.recorder.state === "inactive") return null;
    const recorder = this.recorder;
    const duration = this.elapsedSeconds();
    await new Promise((resolve) => {
      recorder.addEventListener("stop", resolve, { once: true });
      recorder.stop();
    });
    await Promise.all([...this.pendingChunkWrites]);
    const rows = await this.db.getChunks(this.sessionId);
    const mimeType = recorder.mimeType || this.mimeType || rows[0]?.mimeType || "video/webm";
    const blob = new Blob(rows.map((row) => row.blob), { type: mimeType });
    await this.cleanup();
    this.onStatus?.("stopped");
    return { blob, duration, mimeType, chunkCount: rows.length, size: blob.size };
  }

  async cleanup() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    for (const stream of [...this.sourceStreams, this.outputStream].filter(Boolean)) {
      stream.getTracks().forEach((track) => track.stop());
    }
    this.sourceStreams = [];
    this.outputStream = null;
    this.videoElements.forEach((video) => {
      video.pause();
      video.srcObject = null;
    });
    this.videoElements = [];
    this.webcamPreview.pause();
    this.webcamPreview.srcObject = null;
    this.webcamPreview.hidden = true;
    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
  }
}
