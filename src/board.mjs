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
const fullscreenBtn = $("#fullscreenBtn");
const hideUiBtn = $("#hideUiBtn");
const swatches = $$("#colorSwatches .swatch");

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

let saveTimeout = null;
let pendingScene = null;

function writeScene() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  if (!pendingScene) return;
  try {
    localStorage.setItem("sam-bang-den-scene", JSON.stringify(pendingScene));
  } catch {}
  pendingScene = null;
}

function handleSceneChange(scene) {
  pendingScene = scene;
  if (saveTimeout) return;
  saveTimeout = setTimeout(writeScene, 500);
}

// Rời trang trong vòng 500 ms sau nét cuối thì nét đó mất — ghi ngay khi trang bị ẩn.
window.addEventListener("pagehide", writeScene);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") writeScene();
});

const board = new DrawingBoard(canvas, handleSceneChange, {
  width: initialSize.w,
  height: initialSize.h
});

const initialSwatch = $("#colorSwatches .swatch.active") || $("#colorSwatches .swatch");
if (initialSwatch?.dataset?.color) {
  board.setColor(initialSwatch.dataset.color);
}

try {
  const saved = localStorage.getItem("sam-bang-den-scene");
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed && Array.isArray(parsed.items)) {
      board.importScene(parsed);
    }
  }
} catch {}
let resizeTimeout = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    // Nét đã vẽ được giữ nguyên theo toạ độ cũ — không xoá nét khi resize.
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

function formatTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

saveImageBtn.addEventListener("click", () => {
  try {
    const w = canvas.width;
    const h = canvas.height;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = w;
    tempCanvas.height = h;
    const ctx = tempCanvas.getContext("2d");
    if (!ctx) throw new Error("Cannot get 2d context");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, 0, 0);

    tempCanvas.toBlob((blob) => {
      if (!blob) {
        console.error("toBlob returned null");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bang-den-${formatTimestamp()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  } catch (err) {
    console.error("Lỗi khi lưu ảnh:", err);
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
