import { DrawingBoard } from "./drawing.mjs";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const canvas = $("#boardCanvas");
const toolbar = $("#boardToolbar");
const hint = $("#boardHint");
const restoreBtn = $("#boardRestoreBtn");
const penBtn = $("#penBtn");
const eraserBtn = $("#eraserBtn");
const widthRange = $("#widthRange");
const undoBtn = $("#undoBtn");
const clearBtn = $("#clearBtn");
const saveImageBtn = $("#saveImageBtn");
const saveDriveBtn = $("#saveDriveBtn");
const fullscreenBtn = $("#fullscreenBtn");
const hideUiBtn = $("#hideUiBtn");
const swatches = $$("#colorSwatches .swatch");

const pageBar = $("#pageBar");
const prevPageBtn = $("#prevPageBtn");
const nextPageBtn = $("#nextPageBtn");
const pageLabel = $("#pageLabel");
const addPageBtn = $("#addPageBtn");
const pagesBtn = $("#pagesBtn");

const pageOverview = $("#pageOverview");
const closeOverviewBtn = $("#closeOverviewBtn");
const overviewGrid = $("#overviewGrid");

const boardToast = $("#boardToast");
const toastMessage = $("#toastMessage");
const toastActions = $("#toastActions");
const toastCloseBtn = $("#toastCloseBtn");

function getBoardSize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return {
    w: Math.max(1, Math.round(window.innerWidth * dpr)),
    h: Math.max(1, Math.round(window.innerHeight * dpr))
  };
}

const initialSize = getBoardSize();
canvas.width = initialSize.w;
canvas.height = initialSize.h;

function createNewPage(width = initialSize.w, height = initialSize.h, scene = null) {
  const now = new Date().toISOString();
  return {
    id: `trang-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    taoLuc: now,
    suaLuc: now,
    scene: scene || { schemaVersion: 1, width, height, items: [] }
  };
}

function loadBook() {
  const STORAGE_KEY = "sam-bang-den-so";
  const OLD_KEY = "sam-bang-den-scene";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.trang) && parsed.trang.length > 0) {
        if (typeof parsed.trangHienTai !== "number" || parsed.trangHienTai < 0 || parsed.trangHienTai >= parsed.trang.length) {
          parsed.trangHienTai = 0;
        }
        return parsed;
      }
    }
    const oldRaw = localStorage.getItem(OLD_KEY);
    if (oldRaw) {
      const oldScene = JSON.parse(oldRaw);
      if (oldScene && Array.isArray(oldScene.items)) {
        const book = {
          schemaVersion: 2,
          trangHienTai: 0,
          trang: [createNewPage(oldScene.width || initialSize.w, oldScene.height || initialSize.h, oldScene)]
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
        return book;
      }
    }
  } catch (err) {
    console.error("Lỗi khi đọc dữ liệu bảng:", err);
  }
  const defaultBook = {
    schemaVersion: 2,
    trangHienTai: 0,
    trang: [createNewPage()]
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultBook));
  } catch {}
  return defaultBook;
}

const book = loadBook();
let saveTimeout = null;

function writeBook() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  try {
    if (book?.trang?.[book.trangHienTai]) {
      book.trang[book.trangHienTai].scene = board.exportScene();
      book.trang[book.trangHienTai].suaLuc = new Date().toISOString();
    }
    localStorage.setItem("sam-bang-den-so", JSON.stringify(book));
  } catch (err) {
    console.error("Lỗi khi ghi dữ liệu bảng:", err);
  }
}

function handleSceneChange(scene) {
  if (book?.trang?.[book.trangHienTai]) {
    book.trang[book.trangHienTai].scene = scene;
    book.trang[book.trangHienTai].suaLuc = new Date().toISOString();
  }
  if (saveTimeout) return;
  saveTimeout = setTimeout(writeBook, 500);
}

window.addEventListener("pagehide", writeBook);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") writeBook();
});

const board = new DrawingBoard(canvas, handleSceneChange, {
  width: initialSize.w,
  height: initialSize.h
});

const currentTrang = book.trang[book.trangHienTai];
if (currentTrang?.scene) {
  board.importScene(currentTrang.scene);
}

const initialSwatch = $("#colorSwatches .swatch.active") || $("#colorSwatches .swatch");
if (initialSwatch?.dataset?.color) {
  board.setColor(initialSwatch.dataset.color);
}

let resizeTimeout = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const { w, h } = getBoardSize();
    board.setSize(w, h);
  }, 150);
});

function selectTool(tool) {
  board.setTool(tool);
  penBtn.classList.toggle("active", tool === "pen");
  eraserBtn.classList.toggle("active", tool === "eraser");
}

penBtn.addEventListener("click", () => selectTool("pen"));
eraserBtn.addEventListener("click", () => selectTool("eraser"));

function selectColor(color, targetEl) {
  board.setColor(color);
  selectTool("pen");
  swatches.forEach((s) => s.classList.toggle("active", s === targetEl || s.dataset.color === color));
}

swatches.forEach((swatch) => {
  swatch.addEventListener("click", () => selectColor(swatch.dataset.color, swatch));
});

if (initialSwatch?.dataset?.color) {
  selectColor(initialSwatch.dataset.color, initialSwatch);
}

board.setWidth(widthRange.value);
widthRange.addEventListener("input", (e) => {
  board.setWidth(e.target.value);
});

undoBtn.addEventListener("click", () => board.undo());
clearBtn.addEventListener("click", () => board.clear());

function updatePageBar() {
  const total = book.trang.length;
  const current = book.trangHienTai;
  if (pageLabel) pageLabel.textContent = `Trang ${current + 1}/${total}`;
  if (prevPageBtn) prevPageBtn.disabled = current <= 0;
  if (nextPageBtn) nextPageBtn.disabled = current >= total - 1;
}

function goToPage(index) {
  if (index < 0 || index >= book.trang.length || index === book.trangHienTai) return;
  writeBook();
  book.trangHienTai = index;
  const targetPage = book.trang[index];
  board.importScene(targetPage.scene);
  updatePageBar();
  writeBook();
}

function addPage() {
  writeBook();
  const { w, h } = getBoardSize();
  const newP = createNewPage(w, h);
  book.trang.push(newP);
  book.trangHienTai = book.trang.length - 1;
  board.importScene(newP.scene);
  updatePageBar();
  writeBook();
}

prevPageBtn?.addEventListener("click", () => {
  if (book.trangHienTai > 0) goToPage(book.trangHienTai - 1);
});
nextPageBtn?.addEventListener("click", () => {
  if (book.trangHienTai < book.trang.length - 1) goToPage(book.trangHienTai + 1);
});
addPageBtn?.addEventListener("click", addPage);
pagesBtn?.addEventListener("click", openOverview);
updatePageBar();

function renderThumbnail(scene, targetCanvas) {
  const sw = scene?.width || canvas.width || 1920;
  const sh = scene?.height || canvas.height || 1080;
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = sw;
  tempCanvas.height = sh;
  const tempBoard = new DrawingBoard(tempCanvas, null, { width: sw, height: sh });
  if (scene) {
    tempBoard.importScene(scene);
  }
  const thumbCtx = targetCanvas.getContext("2d");
  thumbCtx.fillStyle = "#000000";
  thumbCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
  thumbCtx.drawImage(tempCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
}

function formatShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

function openOverview() {
  writeBook();
  if (!overviewGrid || !pageOverview) return;
  overviewGrid.innerHTML = "";
  book.trang.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "page-card" + (idx === book.trangHienTai ? " active" : "");

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "card-thumb-wrap";
    const thumbCanvas = document.createElement("canvas");
    const sw = p.scene?.width || 1920;
    const sh = p.scene?.height || 1080;
    thumbCanvas.width = 320;
    thumbCanvas.height = Math.round(320 * (sh / sw)) || 180;
    thumbCanvas.className = "card-thumb";
    renderThumbnail(p.scene, thumbCanvas);
    thumbWrap.appendChild(thumbCanvas);

    const info = document.createElement("div");
    info.className = "card-info";

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = `Trang ${idx + 1}`;
    const subtitle = document.createElement("div");
    subtitle.className = "card-subtitle";
    const itemCount = p.scene?.items?.length || 0;
    subtitle.textContent = `${itemCount} nét • ${formatShortDate(p.suaLuc)}`;
    meta.appendChild(title);
    meta.appendChild(subtitle);
    info.appendChild(meta);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "card-delete-btn";
    delBtn.textContent = "Xoá";
    delBtn.setAttribute("aria-label", `Xoá trang ${idx + 1}`);
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deletePage(idx);
    });
    info.appendChild(delBtn);

    card.appendChild(thumbWrap);
    card.appendChild(info);

    card.addEventListener("click", () => {
      goToPage(idx);
      closeOverview();
    });

    overviewGrid.appendChild(card);
  });
  pageOverview.classList.remove("ui-hidden");
  setChromeHidden(true);
}

// Overlay danh sách trang che toàn màn hình; để thanh công cụ và thanh trang nằm
// dưới nó chỉ gây rối mắt, nên ẩn luôn trong lúc mở.
function setChromeHidden(hidden) {
  toolbar.classList.toggle("ui-hidden", hidden);
  if (hint) hint.classList.toggle("ui-hidden", hidden);
  if (pageBar) pageBar.classList.toggle("ui-hidden", hidden);
}

function closeOverview() {
  pageOverview?.classList.add("ui-hidden");
  setChromeHidden(false);
}

function deletePage(index) {
  if (book.trang.length <= 1) {
    showToast("Không thể xoá khi chỉ còn một trang bảng.", "error");
    return;
  }
  if (!window.confirm(`Xoá trang ${index + 1}? Hành động này không thể hoàn tác.`)) {
    return;
  }
  book.trang.splice(index, 1);
  if (book.trangHienTai >= book.trang.length) {
    book.trangHienTai = book.trang.length - 1;
  } else if (book.trangHienTai > index) {
    book.trangHienTai -= 1;
  }
  board.importScene(book.trang[book.trangHienTai].scene);
  updatePageBar();
  writeBook();
  openOverview();
}

closeOverviewBtn?.addEventListener("click", closeOverview);

let toastTimer = null;
function showToast(message, type = "info", actions = []) {
  if (!boardToast || !toastMessage) return;
  clearTimeout(toastTimer);
  toastMessage.textContent = message;
  if (toastActions) {
    toastActions.innerHTML = "";
    actions.forEach((act) => {
      if (act.href) {
        const a = document.createElement("a");
        a.href = act.href;
        a.target = "_blank";
        a.rel = "noopener";
        a.className = "toast-link";
        a.textContent = act.text;
        toastActions.appendChild(a);
      } else if (act.onClick) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "toast-btn";
        btn.textContent = act.text;
        btn.addEventListener("click", () => act.onClick());
        toastActions.appendChild(btn);
      }
    });
  }

  boardToast.classList.toggle("toast-error", type === "error");
  boardToast.classList.remove("ui-hidden");

  toastTimer = setTimeout(() => {
    boardToast.classList.add("ui-hidden");
  }, 8000);
}

toastCloseBtn?.addEventListener("click", () => {
  clearTimeout(toastTimer);
  boardToast?.classList.add("ui-hidden");
});

function formatTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

async function renderPageToPngBlob(scene) {
  const sw = scene?.width || canvas.width || 1920;
  const sh = scene?.height || canvas.height || 1080;
  const drawCanvas = document.createElement("canvas");
  drawCanvas.width = sw;
  drawCanvas.height = sh;
  const drawBoard = new DrawingBoard(drawCanvas, null, { width: sw, height: sh });
  if (scene) {
    drawBoard.importScene(scene);
  }

  const outCanvas = document.createElement("canvas");
  outCanvas.width = sw;
  outCanvas.height = sh;
  const outCtx = outCanvas.getContext("2d");
  outCtx.fillStyle = "#000000";
  outCtx.fillRect(0, 0, sw, sh);
  outCtx.drawImage(drawCanvas, 0, 0);

  return new Promise((resolve) => {
    outCanvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      const base64 = typeof dataUrl === "string" ? dataUrl.slice(dataUrl.indexOf(",") + 1) : "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function downloadBlobsToDisk(files) {
  for (let i = 0; i < files.length; i++) {
    const { ten, blob } = files[i];
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = ten;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (i < files.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

saveImageBtn.addEventListener("click", async () => {
  try {
    const blob = await renderPageToPngBlob(board.exportScene());
    if (!blob) throw new Error("Không thể tạo ảnh");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bang-den-${formatTimestamp()}-trang-${String(book.trangHienTai + 1).padStart(2, "0")}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error("Lỗi khi lưu ảnh:", err);
  }
});

saveDriveBtn?.addEventListener("click", async () => {
  writeBook();
  const total = book.trang.length;
  const originalText = saveDriveBtn.textContent;
  saveDriveBtn.disabled = true;

  try {
    const ts = formatTimestamp();
    const renderedFiles = [];
    const requestPayload = [];

    for (let i = 0; i < total; i++) {
      saveDriveBtn.textContent = `Đang lưu… (${i + 1}/${total})`;
      const p = book.trang[i];
      const blob = await renderPageToPngBlob(p.scene);
      if (!blob) throw new Error(`Không thể tạo ảnh cho trang ${i + 1}`);
      const ten = `bang-den-${ts}-trang-${String(i + 1).padStart(2, "0")}.png`;
      renderedFiles.push({ ten, blob });
      const base64 = await blobToBase64(blob);
      requestPayload.push({
        ten,
        kieu: "image/png",
        base64
      });
    }

    const response = await fetch("/api/luu-drive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: requestPayload })
    });

    let resData = null;
    try {
      resData = await response.json();
    } catch {}

    if (response.ok && resData?.status === "OK") {
      const savedCount = resData.files?.length || renderedFiles.length;
      const folderUrl = resData.thuMuc?.url;
      const actions = folderUrl
        ? [{ text: "Mở thư mục Drive", href: folderUrl }]
        : [];
      showToast(`Đã lưu ${savedCount} trang lên Google Drive thành công!`, "info", actions);
    } else {
      const isMissingCreds = response.status === 503 || resData?.status === "THIEU_CREDENTIAL";
      const errorMsg = resData?.message || `Lỗi tải lên Drive (${response.status})`;
      const actions = [];
      if (isMissingCreds) {
        actions.push({
          text: "Tải tất cả về máy",
          onClick: () => downloadBlobsToDisk(renderedFiles)
        });
      }
      showToast(errorMsg, "error", actions);
    }
  } catch (err) {
    console.error("Lỗi khi lưu lên Drive:", err);
    showToast(err.message || "Không thể kết nối đến máy chủ", "error");
  } finally {
    saveDriveBtn.disabled = false;
    saveDriveBtn.textContent = originalText;
  }
});

function updateFullscreenBtn() {
  const isFull = Boolean(document.fullscreenElement);
  fullscreenBtn.textContent = isFull ? "Thoát toàn màn hình" : "Toàn màn hình";
  fullscreenBtn.setAttribute("aria-label", isFull ? "Thoát chế độ toàn màn hình" : "Toàn màn hình");
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (err) {
    console.error("Fullscreen toggle failed:", err);
  }
}

fullscreenBtn.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", updateFullscreenBtn);

function setUiHidden(hidden) {
  toolbar.classList.toggle("ui-hidden", hidden);
  if (hint) hint.classList.toggle("ui-hidden", hidden);
  if (restoreBtn) restoreBtn.classList.toggle("ui-hidden", !hidden);
  if (pageBar) pageBar.classList.toggle("ui-hidden", hidden);
}

hideUiBtn.addEventListener("click", () => setUiHidden(true));
if (restoreBtn) {
  restoreBtn.addEventListener("click", () => setUiHidden(false));
}

window.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea") return;

  const key = e.key.toLowerCase();
  const hasMetaOrCtrl = e.ctrlKey || e.metaKey;

  if (hasMetaOrCtrl && key === "z") {
    e.preventDefault();
    if (e.shiftKey) {
      board.redo();
    } else {
      board.undo();
    }
    return;
  }

  if (hasMetaOrCtrl && key === "y") {
    e.preventDefault();
    board.redo();
    return;
  }

  if (hasMetaOrCtrl || e.altKey) return;

  if (key === "escape") {
    if (pageOverview && !pageOverview.classList.contains("ui-hidden")) {
      e.preventDefault();
      closeOverview();
    }
    return;
  }

  if (key === "pageup" || e.key === "[") {
    e.preventDefault();
    if (book.trangHienTai > 0) goToPage(book.trangHienTai - 1);
    return;
  }

  if (key === "pagedown" || e.key === "]") {
    e.preventDefault();
    if (book.trangHienTai < book.trang.length - 1) goToPage(book.trangHienTai + 1);
    return;
  }

  if (key === "n") {
    e.preventDefault();
    addPage();
    return;
  }

  if (key === "h") {
    e.preventDefault();
    const isHidden = toolbar.classList.contains("ui-hidden");
    setUiHidden(!isHidden);
  } else if (key === "f") {
    e.preventDefault();
    toggleFullscreen();
  } else if (key === "e") {
    e.preventDefault();
    selectTool("eraser");
  } else if (key === "b" || key === "p") {
    e.preventDefault();
    selectTool("pen");
  }
});
