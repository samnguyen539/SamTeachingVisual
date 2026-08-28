export class SessionDatabase {
  constructor(name = "sam-teaching-visual-v1") {
    this.name = name;
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
        if (!db.objectStoreNames.contains("scenes")) db.createObjectStore("scenes", { keyPath: "sessionId" });
        if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "sessionId" });
        if (!db.objectStoreNames.contains("chunks")) {
          const store = db.createObjectStore("chunks", { keyPath: "key" });
          store.createIndex("sessionId", "sessionId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
    return this.db;
  }

  async run(storeName, mode, operation) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let request;
      try {
        request = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error || request?.error);
      transaction.onabort = () => reject(transaction.error || new Error("Giao dịch IndexedDB bị hủy"));
    });
  }

  putSession(session) { return this.run("sessions", "readwrite", (store) => store.put(session)); }
  getSession(id) { return this.run("sessions", "readonly", (store) => store.get(id)); }

  async listSessions() {
    const sessions = await this.run("sessions", "readonly", (store) => store.getAll());
    return (sessions || []).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  putScene(sessionId, scene) {
    return this.run("scenes", "readwrite", (store) => store.put({ sessionId, scene, updatedAt: new Date().toISOString() }));
  }

  async getScene(sessionId) {
    return (await this.run("scenes", "readonly", (store) => store.get(sessionId)))?.scene || null;
  }

  putMedia(sessionId, media) {
    return this.run("media", "readwrite", (store) => store.put({ sessionId, ...media }));
  }

  getMedia(sessionId) { return this.run("media", "readonly", (store) => store.get(sessionId)); }

  putChunk(sessionId, index, blob, mimeType) {
    const key = `${sessionId}:${String(index).padStart(8, "0")}`;
    return this.run("chunks", "readwrite", (store) => store.put({
      key,
      sessionId,
      index,
      blob,
      size: blob.size,
      mimeType,
      createdAt: Date.now()
    }));
  }

  async getChunks(sessionId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("chunks", "readonly");
      const index = transaction.objectStore("chunks").index("sessionId");
      const request = index.getAll(IDBKeyRange.only(sessionId));
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.index - b.index));
      request.onerror = () => reject(request.error);
    });
  }

  async clearChunks(sessionId) {
    const chunks = await this.getChunks(sessionId);
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("chunks", "readwrite");
      const store = transaction.objectStore("chunks");
      chunks.forEach((chunk) => store.delete(chunk.key));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
