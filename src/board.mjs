import { DrawingBoard } from "./drawing.mjs";
import { hopNhatSoTay } from "./hop-nhat-so-tay.mjs";

// Service worker của studio đăng ký ở phạm vi "/" nên nó điều khiển luôn trang
// bảng. Bản v1 dùng cache-trước-mạng-sau: deploy xong Sam tải lại vẫn chạy code
// CŨ, luôn chậm một bản — đó là lý do bản vá "nhảy về trang 1" không tới được
// máy Sam. Trang bảng không cần chạy offline, nên gỡ hẳn service worker khỏi nó
// và xoá cache; nếu đang bị điều khiển thì tải lại đúng MỘT lần cho mỗi tab.
(function goBoServiceWorkerCu() {
  if (!("serviceWorker" in navigator)) return;
  const dangBiDieuKhien = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker
    .getRegistrations()
    .then((danhSach) => Promise.all(danhSach.map((dangKy) => dangKy.unregister())))
    .then(() => (window.caches ? caches.keys().then((ten) => Promise.all(ten.map((t) => caches.delete(t)))) : null))
    .then(() => {
      if (!dangBiDieuKhien) return;
      try {
        if (sessionStorage.getItem("sam-bang-den-da-go-sw")) return;
        sessionStorage.setItem("sam-bang-den-da-go-sw", "1");
      } catch {
        return;
      }
      location.reload();
    })
    .catch(() => {});
})();

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
const copyDriveLinkBtn = $("#copyDriveLinkBtn");
const syncNowBtn = $("#syncNowBtn");
const logoutBtn = $("#logoutBtn");
const fullscreenBtn = $("#fullscreenBtn");
const hideUiBtn = $("#hideUiBtn");
const swatches = $$("#colorSwatches .swatch");

const notebookBar = $("#notebookBar");
const notebookBtn = $("#notebookBtn");
const notebookName = $("#notebookName");
const syncStatusEl = $("#syncStatus");
const notebookToggleBtn = $("#notebookToggleBtn");
const notebookManager = $("#notebookManager");
const closeNotebookBtn = $("#closeNotebookBtn");
const addNotebookBtn = $("#addNotebookBtn");
const notebookList = $("#notebookList");

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

function laySoSong(data) {
  return (data?.so || []).filter((s) => !s.daXoa);
}

function layTrangSong(nb) {
  return (nb?.trang || []).filter((p) => !p.daXoa);
}

function tenSoMacDinh(danhSachSo = []) {
  let maxNum = 0;
  for (const s of danhSachSo) {
    if (s.daXoa) continue;
    const match = String(s.ten || "").match(/^SamNguyen (\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `SamNguyen ${maxNum + 1}`;
}

function createNewNotebook(ten = "SamNguyen 1") {
  const now = new Date().toISOString();
  const { w, h } = getBoardSize();
  return {
    id: `so-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ten: (ten || "SamNguyen 1").slice(0, 80),
    taoLuc: now,
    suaLuc: now,
    drive: null,
    trangHienTai: 0,
    trang: [createNewPage(w, h)]
  };
}

function loadNotebooks() {
  const STORAGE_KEY = "sam-bang-den-so-tay";
  const OLD_KEY = "sam-bang-den-so";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.so) && parsed.so.length > 0) {
        const soSong = laySoSong(parsed);
        if (soSong.length === 0) {
          const nb = createNewNotebook("SamNguyen 1");
          parsed.so.push(nb);
          parsed.soHienTai = nb.id;
        } else if (!soSong.some((s) => s.id === parsed.soHienTai)) {
          parsed.soHienTai = soSong[0].id;
        }
        for (const s of parsed.so) {
          const trangSong = layTrangSong(s);
          if (trangSong.length === 0) {
            const p = createNewPage();
            s.trang = Array.isArray(s.trang) ? s.trang : [];
            s.trang.push(p);
            s.trangHienTai = 0;
          } else if (typeof s.trangHienTai !== "number" || s.trangHienTai < 0 || s.trangHienTai >= trangSong.length) {
            s.trangHienTai = 0;
          }
        }
        return parsed;
      }
    }
    const oldRaw = localStorage.getItem(OLD_KEY);
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw);
      if (oldParsed && Array.isArray(oldParsed.trang) && oldParsed.trang.length > 0) {
        const now = new Date().toISOString();
        const initialNotebook = {
          id: `so-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ten: "SamNguyen 1",
          taoLuc: now,
          suaLuc: now,
          drive: null,
          trangHienTai: typeof oldParsed.trangHienTai === "number" && oldParsed.trangHienTai >= 0 && oldParsed.trangHienTai < oldParsed.trang.length
            ? oldParsed.trangHienTai
            : 0,
          trang: oldParsed.trang
        };
        const migrated = {
          schemaVersion: 3,
          soHienTai: initialNotebook.id,
          so: [initialNotebook]
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch (err) {
    console.error("Lỗi khi đọc dữ liệu sổ tay:", err);
  }
  const defaultNotebook = createNewNotebook("SamNguyen 1");
  const defaultData = {
    schemaVersion: 3,
    soHienTai: defaultNotebook.id,
    so: [defaultNotebook]
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
  } catch {}
  return defaultData;
}

const notebooksData = loadNotebooks();
let saveTimeout = null;

function getCurrentNotebook() {
  const soSong = laySoSong(notebooksData);
  if (soSong.length === 0) {
    const nb = createNewNotebook("SamNguyen 1");
    notebooksData.so.push(nb);
    notebooksData.soHienTai = nb.id;
    return nb;
  }
  return soSong.find((s) => s.id === notebooksData.soHienTai) || soSong[0];
}

let currentNotebook = getCurrentNotebook();

function getCurrentPage(nb = currentNotebook) {
  if (!nb) return null;
  const trangSong = layTrangSong(nb);
  if (trangSong.length === 0) {
    const { w, h } = getBoardSize();
    const p = createNewPage(w, h);
    if (!Array.isArray(nb.trang)) nb.trang = [];
    nb.trang.push(p);
    nb.trangHienTai = 0;
    return p;
  }
  if (typeof nb.trangHienTai !== "number" || nb.trangHienTai < 0 || nb.trangHienTai >= trangSong.length) {
    nb.trangHienTai = 0;
  }
  return trangSong[nb.trangHienTai];
}

function writeBook() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  try {
    currentNotebook = getCurrentNotebook();
    const curPage = getCurrentPage(currentNotebook);
    if (curPage) {
      const scene = board.exportScene();
      // `writeBook` chạy cả khi chỉ chuyển sổ, mở trình quản lý hay ngay trước
      // mỗi lượt đồng bộ. Trước đây nó luôn nhấc `suaLuc` lên, nên một máy chỉ
      // MỞ trang cũ cũng trở thành "bản mới nhất" và ghi đè nét của máy kia khi
      // hợp nhất — mất dữ liệu thật. Chỉ nhấc `suaLuc` khi nét vẽ đổi thật.
      const netCu = JSON.stringify(curPage.scene?.items ?? null);
      const netMoi = JSON.stringify(scene.items ?? null);
      curPage.scene = scene;
      if (netCu !== netMoi) {
        const now = new Date().toISOString();
        curPage.suaLuc = now;
        currentNotebook.suaLuc = now;
      }
    }
    localStorage.setItem("sam-bang-den-so-tay", JSON.stringify(notebooksData));
  } catch (err) {
    console.error("Lỗi khi ghi dữ liệu sổ tay:", err);
  }
}

function handleSceneChange(scene) {
  currentNotebook = getCurrentNotebook();
  const curPage = getCurrentPage(currentNotebook);
  if (curPage) {
    const now = new Date().toISOString();
    curPage.scene = scene;
    curPage.suaLuc = now;
    currentNotebook.suaLuc = now;
  }
  if (!saveTimeout) {
    saveTimeout = setTimeout(writeBook, 500);
  }
  baoCoThayDoi();
}

window.addEventListener("pagehide", () => {
  writeBook();
  guiPutGiuKetNoi();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    writeBook();
    guiPutGiuKetNoi();
  } else if (document.visibilityState === "visible") {
    dongBo(false);
  }
});
window.addEventListener("online", () => {
  dongBo(false);
});

const board = new DrawingBoard(canvas, handleSceneChange, {
  width: initialSize.w,
  height: initialSize.h
});

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

function updateNotebookBar() {
  currentNotebook = getCurrentNotebook();
  if (notebookName) notebookName.textContent = currentNotebook.ten;
}

function updateCopyDriveLinkBtn() {
  currentNotebook = getCurrentNotebook();
  const driveUrl = currentNotebook?.drive?.url;
  if (copyDriveLinkBtn) {
    if (driveUrl) {
      copyDriveLinkBtn.disabled = false;
      copyDriveLinkBtn.title = "Sao chép link thư mục Drive của sổ này";
    } else {
      copyDriveLinkBtn.disabled = true;
      copyDriveLinkBtn.title = "Lưu lên Drive trước đã";
    }
  }
}

function updatePageBar() {
  currentNotebook = getCurrentNotebook();
  const trangSong = layTrangSong(currentNotebook);
  const total = trangSong.length;
  if (typeof currentNotebook.trangHienTai !== "number" || currentNotebook.trangHienTai < 0 || currentNotebook.trangHienTai >= total) {
    currentNotebook.trangHienTai = 0;
  }
  const current = currentNotebook.trangHienTai;
  if (pageLabel) pageLabel.textContent = `Trang ${current + 1}/${total}`;
  if (prevPageBtn) prevPageBtn.disabled = current <= 0;
  if (nextPageBtn) nextPageBtn.disabled = current >= total - 1;
}

function goToPage(index) {
  currentNotebook = getCurrentNotebook();
  const trangSong = layTrangSong(currentNotebook);
  if (index < 0 || index >= trangSong.length || index === currentNotebook.trangHienTai) return;
  writeBook();
  currentNotebook.trangHienTai = index;
  const targetPage = trangSong[index];
  board.importScene(targetPage.scene);
  updatePageBar();
  writeBook();
}

function addPage() {
  writeBook();
  currentNotebook = getCurrentNotebook();
  const { w, h } = getBoardSize();
  const newP = createNewPage(w, h);
  const now = new Date().toISOString();
  newP.taoLuc = now;
  newP.suaLuc = now;
  currentNotebook.trang.push(newP);
  currentNotebook.suaLuc = now;
  const trangSong = layTrangSong(currentNotebook);
  currentNotebook.trangHienTai = trangSong.length - 1;
  board.importScene(newP.scene);
  updatePageBar();
  writeBook();
  baoCoThayDoi();
}

prevPageBtn?.addEventListener("click", () => {
  currentNotebook = getCurrentNotebook();
  if (currentNotebook.trangHienTai > 0) goToPage(currentNotebook.trangHienTai - 1);
});
nextPageBtn?.addEventListener("click", () => {
  currentNotebook = getCurrentNotebook();
  const trangSong = layTrangSong(currentNotebook);
  if (currentNotebook.trangHienTai < trangSong.length - 1) goToPage(currentNotebook.trangHienTai + 1);
});
addPageBtn?.addEventListener("click", addPage);
pagesBtn?.addEventListener("click", openOverview);

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

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

function openOverview() {
  writeBook();
  currentNotebook = getCurrentNotebook();
  if (!overviewGrid || !pageOverview) return;
  overviewGrid.innerHTML = "";
  const trangSong = layTrangSong(currentNotebook);
  trangSong.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "page-card" + (idx === currentNotebook.trangHienTai ? " active" : "");

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

// Sam yêu cầu thanh sổ (tên sổ + trạng thái đồng bộ) mặc định ẨN cho sạch màn
// hình, chỉ hiện khi bấm nút nhỏ dưới thanh công cụ. Trạng thái này KHÔNG được
// nhớ qua lần tải trang: mở lên là ẩn.
let hienThanhSo = false;

function apDungHienThanhSo(chromeDangAn = false) {
  if (notebookBar) notebookBar.classList.toggle("ui-hidden", chromeDangAn || !hienThanhSo);
  notebookToggleBtn?.classList.toggle("active", hienThanhSo && !chromeDangAn);
  if (notebookToggleBtn) {
    notebookToggleBtn.setAttribute("aria-pressed", String(hienThanhSo));
    notebookToggleBtn.title = hienThanhSo ? "Ẩn tên sổ và trạng thái đồng bộ" : "Hiện tên sổ và trạng thái đồng bộ";
  }
}

function setChromeHidden(hidden) {
  toolbar.classList.toggle("ui-hidden", hidden);
  if (hint) hint.classList.toggle("ui-hidden", hidden);
  if (pageBar) pageBar.classList.toggle("ui-hidden", hidden);
  apDungHienThanhSo(hidden);
}

function closeOverview() {
  pageOverview?.classList.add("ui-hidden");
  setChromeHidden(false);
}

function deletePage(index) {
  currentNotebook = getCurrentNotebook();
  const trangSong = layTrangSong(currentNotebook);
  if (trangSong.length <= 1) {
    showToast("Không thể xoá khi chỉ còn một trang bảng.", "error");
    return;
  }
  const targetPage = trangSong[index];
  if (!targetPage) return;
  if (!window.confirm(`Xoá trang ${index + 1}? Hành động này không thể hoàn tác.`)) {
    return;
  }
  const now = new Date().toISOString();
  targetPage.daXoa = true;
  targetPage.xoaLuc = now;
  targetPage.suaLuc = now;
  currentNotebook.suaLuc = now;

  const trangSongMoi = layTrangSong(currentNotebook);
  if (currentNotebook.trangHienTai >= trangSongMoi.length) {
    currentNotebook.trangHienTai = Math.max(0, trangSongMoi.length - 1);
  } else if (currentNotebook.trangHienTai > index) {
    currentNotebook.trangHienTai -= 1;
  }
  const curPage = getCurrentPage(currentNotebook);
  if (curPage?.scene) {
    board.importScene(curPage.scene);
  }
  updatePageBar();
  writeBook();
  openOverview();
  baoCoThayDoi();
}

closeOverviewBtn?.addEventListener("click", closeOverview);

function switchNotebook(notebookId) {
  writeBook();
  const soSong = laySoSong(notebooksData);
  const target = soSong.find((s) => s.id === notebookId);
  if (!target) return;
  notebooksData.soHienTai = target.id;
  currentNotebook = target;
  const curPage = getCurrentPage(currentNotebook);
  if (curPage?.scene) {
    board.importScene(curPage.scene);
  }
  updateNotebookBar();
  updatePageBar();
  updateCopyDriveLinkBtn();
  closeNotebookManager();
  writeBook();
}

function renderNotebookList() {
  if (!notebookList) return;
  notebookList.innerHTML = "";
  const soSong = laySoSong(notebooksData);
  soSong.forEach((nb) => {
    const isCurrent = nb.id === notebooksData.soHienTai;
    const item = document.createElement("div");
    item.className = "notebook-item" + (isCurrent ? " active" : "");

    const info = document.createElement("div");
    info.className = "notebook-item-info";

    const titleRow = document.createElement("div");
    titleRow.className = "notebook-item-title-row";

    const title = document.createElement("div");
    title.className = "notebook-item-title";
    title.textContent = nb.ten;
    titleRow.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "notebook-item-meta";
    const trangSong = layTrangSong(nb);
    meta.textContent = `${trangSong.length} trang • sửa lúc ${formatDateTime(nb.suaLuc)}`;
    info.appendChild(titleRow);

    if (nb.drive?.url) {
      const driveRow = document.createElement("div");
      driveRow.className = "notebook-item-drive";
      const driveText = document.createElement("span");
      const soFile = nb.drive.soFile || trangSong.length;
      driveText.textContent = `Đã lưu ${soFile} ảnh • ${formatDateTime(nb.drive.luuLuc)}`;
      driveRow.appendChild(driveText);

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "copy-link-btn";
      copyBtn.textContent = "Sao chép link";
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        saoChepLink(nb.drive.url, copyBtn);
      });
      driveRow.appendChild(copyBtn);

      const driveLink = document.createElement("a");
      driveLink.href = nb.drive.url;
      driveLink.target = "_blank";
      driveLink.rel = "noopener";
      driveLink.className = "drive-link";
      driveLink.textContent = "Mở Drive";
      driveLink.addEventListener("click", (e) => e.stopPropagation());
      driveRow.appendChild(driveLink);

      info.appendChild(driveRow);
    }

    const actions = document.createElement("div");
    actions.className = "notebook-item-actions";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "nb-action-btn";
    openBtn.textContent = "Mở";
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      switchNotebook(nb.id);
    });
    actions.appendChild(openBtn);

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "nb-action-btn";
    renameBtn.textContent = "Đổi tên";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      renameNotebook(nb.id);
    });
    actions.appendChild(renameBtn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "nb-action-btn nb-delete-btn";
    delBtn.textContent = "Xoá";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteNotebook(nb.id);
    });
    actions.appendChild(delBtn);

    item.appendChild(info);
    item.appendChild(actions);

    item.addEventListener("click", () => switchNotebook(nb.id));
    notebookList.appendChild(item);
  });
}

function openNotebookManager() {
  writeBook();
  renderNotebookList();
  notebookManager?.classList.remove("ui-hidden");
  setChromeHidden(true);
}

function closeNotebookManager() {
  notebookManager?.classList.add("ui-hidden");
  setChromeHidden(false);
}

function promptAddNotebook() {
  const soSong = laySoSong(notebooksData);
  const defaultName = tenSoMacDinh(soSong);
  const input = window.prompt("Nhập tên sổ ghi chép mới:", defaultName);
  if (input === null) return;
  const ten = (input.trim() || defaultName).slice(0, 80);
  const newNb = createNewNotebook(ten);
  notebooksData.so.push(newNb);
  switchNotebook(newNb.id);
  baoCoThayDoi();
}

function renameNotebook(notebookId) {
  const nb = notebooksData.so.find((s) => s.id === notebookId && !s.daXoa);
  if (!nb) return;
  const input = window.prompt("Đổi tên sổ ghi chép:", nb.ten);
  if (input === null) return;
  const fallbackName = tenSoMacDinh(laySoSong(notebooksData));
  const newName = (input.trim() || fallbackName).slice(0, 80);
  const now = new Date().toISOString();
  nb.ten = newName;
  nb.suaLuc = now;
  writeBook();
  updateNotebookBar();
  renderNotebookList();
  baoCoThayDoi();
}

function deleteNotebook(notebookId) {
  const soSong = laySoSong(notebooksData);
  if (soSong.length <= 1) {
    showToast("Không thể xoá khi chỉ còn một sổ ghi chép.", "error");
    return;
  }
  const nb = notebooksData.so.find((s) => s.id === notebookId && !s.daXoa);
  if (!nb) return;
  const trangSong = layTrangSong(nb);
  const ok = window.confirm(
    `Bạn có chắc muốn xoá sổ "${nb.ten}" (${trangSong.length} trang)? Toàn bộ trang trong sổ này trên máy sẽ bị mất. Ảnh đã lưu trên Google Drive vẫn được giữ nguyên không bị ảnh hưởng.`
  );
  if (!ok) return;

  const now = new Date().toISOString();
  nb.daXoa = true;
  nb.xoaLuc = now;
  nb.suaLuc = now;
  if (Array.isArray(nb.trang)) {
    nb.trang.forEach((p) => {
      if (!p.daXoa) {
        p.daXoa = true;
        p.xoaLuc = now;
        p.suaLuc = now;
      }
    });
  }

  if (notebooksData.soHienTai === notebookId) {
    const soSongConLai = laySoSong(notebooksData);
    const nextNb = soSongConLai[0];
    notebooksData.soHienTai = nextNb.id;
    currentNotebook = nextNb;
    const curPage = getCurrentPage(currentNotebook);
    if (curPage?.scene) {
      board.importScene(curPage.scene);
    }
    updateNotebookBar();
    updatePageBar();
    updateCopyDriveLinkBtn();
  }
  writeBook();
  renderNotebookList();
  baoCoThayDoi();
}

notebookBtn?.addEventListener("click", openNotebookManager);
closeNotebookBtn?.addEventListener("click", closeNotebookManager);
addNotebookBtn?.addEventListener("click", promptAddNotebook);

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
        btn.addEventListener("click", (e) => act.onClick(e));
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

async function saoChepLink(url, nutBam) {
  if (!url) return;
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      copied = true;
    }
  } catch (err) {}

  if (!copied) {
    try {
      const input = document.createElement("input");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      input.style.pointerEvents = "none";
      document.body.appendChild(input);
      input.focus();
      input.select();
      copied = document.execCommand("copy");
      document.body.removeChild(input);
    } catch (err) {
      copied = false;
    }
  }

  if (copied) {
    if (nutBam) {
      const originalText = nutBam.textContent;
      nutBam.textContent = "Đã sao chép";
      setTimeout(() => {
        nutBam.textContent = originalText;
      }, 2000);
    } else {
      showToast("Đã sao chép link vào bộ nhớ tạm!", "info");
    }
  } else {
    showToast(`Không thể tự động sao chép. Hãy sao chép link này: ${url}`, "error", [
      { text: "Mở link", href: url }
    ]);
  }
}

function getPageFileName(pageIndex) {
  const num = pageIndex + 1;
  const padLen = num >= 100 ? 3 : 2;
  return `trang-${String(num).padStart(padLen, "0")}.png`;
}

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
    currentNotebook = getCurrentNotebook();
    const blob = await renderPageToPngBlob(board.exportScene());
    if (!blob) throw new Error("Không thể tạo ảnh");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bang-den-${formatTimestamp()}-trang-${String(currentNotebook.trangHienTai + 1).padStart(2, "0")}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error("Lỗi khi lưu ảnh:", err);
  }
});

saveDriveBtn?.addEventListener("click", async () => {
  writeBook();
  currentNotebook = getCurrentNotebook();
  const trangSong = layTrangSong(currentNotebook);
  const total = trangSong.length;
  const originalText = saveDriveBtn.textContent;
  saveDriveBtn.disabled = true;

  try {
    const renderedFiles = [];
    const requestPayload = [];

    for (let i = 0; i < total; i++) {
      saveDriveBtn.textContent = `Đang lưu… (${i + 1}/${total})`;
      const p = trangSong[i];
      const blob = await renderPageToPngBlob(p.scene);
      if (!blob) throw new Error(`Không thể tạo ảnh cho trang ${i + 1}`);
      const ten = getPageFileName(i);
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
      body: JSON.stringify({
        tenSo: currentNotebook.ten,
        files: requestPayload
      })
    });

    let resData = null;
    try {
      resData = await response.json();
    } catch {}

    if (response.ok && resData?.status === "OK") {
      const folderUrl = resData.thuMuc?.url;
      const folderId = resData.thuMuc?.id;
      const fileList = Array.isArray(resData.files) ? resData.files : [];
      let moi = 0;
      let capNhat = 0;
      let khongDoi = 0;
      for (const f of fileList) {
        if (f.trangThai === "da_tai_len") moi++;
        else if (f.trangThai === "cap_nhat") capNhat++;
        else if (f.trangThai === "tai_su_dung") khongDoi++;
        else moi++;
      }

      const now = new Date().toISOString();
      currentNotebook.drive = {
        id: folderId,
        url: folderUrl,
        luuLuc: now,
        soFile: fileList.length || total
      };
      currentNotebook.suaLuc = now;
      const curPage = getCurrentPage(currentNotebook);
      if (curPage) curPage.suaLuc = now;
      writeBook();
      updateCopyDriveLinkBtn();
      baoCoThayDoi();
      let msg = `Đã lưu sổ "${currentNotebook.ten}": ${moi} trang mới, ${capNhat} trang cập nhật, ${khongDoi} trang không đổi.`;
      if (Array.isArray(resData.daChuyenVaoThung) && resData.daChuyenVaoThung.length > 0) {
        msg += ` ${resData.daChuyenVaoThung.length} ảnh của trang đã xoá được chuyển vào thùng rác Drive.`;
      }

      const actions = [];
      if (folderUrl) {
        actions.push({ text: "Mở thư mục Drive", href: folderUrl });
        actions.push({
          text: "Sao chép link",
          onClick: (e) => saoChepLink(folderUrl, e?.target)
        });
      }
      showToast(msg, "info", actions);
    } else {
      if (response.status === 401) {
        showToast(resData?.message || "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.", "error", [
          { text: "Đăng nhập lại", href: "/dang-nhap?tiep=%2F" }
        ]);
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
    }
  } catch (err) {
    console.error("Lỗi khi lưu lên Drive:", err);
    showToast(err.message || "Không thể kết nối đến máy chủ", "error");
  } finally {
    saveDriveBtn.disabled = false;
    saveDriveBtn.textContent = originalText;
  }
});

copyDriveLinkBtn?.addEventListener("click", () => {
  currentNotebook = getCurrentNotebook();
  if (currentNotebook?.drive?.url) {
    saoChepLink(currentNotebook.drive.url, copyDriveLinkBtn);
  }
});

logoutBtn?.addEventListener("click", async () => {
  try {
    await fetch("/api/dang-xuat", { method: "POST" });
  } catch (err) {
    console.warn("Lỗi khi đăng xuất:", err);
  } finally {
    location.href = "/dang-nhap";
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
  apDungHienThanhSo(hidden);
}

notebookToggleBtn?.addEventListener("click", () => {
  hienThanhSo = !hienThanhSo;
  apDungHienThanhSo(toolbar.classList.contains("ui-hidden"));
});

apDungHienThanhSo(false);

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
    if (notebookManager && !notebookManager.classList.contains("ui-hidden")) {
      e.preventDefault();
      closeNotebookManager();
      return;
    }
    if (pageOverview && !pageOverview.classList.contains("ui-hidden")) {
      e.preventDefault();
      closeOverview();
      return;
    }
    return;
  }

  currentNotebook = getCurrentNotebook();
  const trangSong = layTrangSong(currentNotebook);
  if (key === "pageup" || e.key === "[") {
    e.preventDefault();
    if (currentNotebook.trangHienTai > 0) goToPage(currentNotebook.trangHienTai - 1);
    return;
  }

  if (key === "pagedown" || e.key === "]") {
    e.preventDefault();
    if (currentNotebook.trangHienTai < trangSong.length - 1) goToPage(currentNotebook.trangHienTai + 1);
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

updateNotebookBar();
updatePageBar();
updateCopyDriveLinkBtn();

const initialTrang = getCurrentPage(currentNotebook);
if (initialTrang?.scene) {
  board.importScene(initialTrang.scene);
}

let syncDebounceTimer = null;
let syncMaxWaitTimer = null;
let syncRetryTimer = null;
let syncRetryDelay = 5000;
let isSyncing = false;
let pendingSync = false;
let authExpired = false;
let lastSyncTime = null;

function formatGioPhut(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function capNhatTrangThaiDongBo(trangThai, ghiChu = "") {
  if (!syncStatusEl) return;
  syncStatusEl.dataset.trangThai = trangThai;

  const fullEl = syncStatusEl.querySelector(".sync-text-full");
  const shortEl = syncStatusEl.querySelector(".sync-text-short");

  if (trangThai === "dang") {
    if (fullEl) fullEl.textContent = "Đang đồng bộ…";
    if (shortEl) shortEl.textContent = "Đang đồng bộ";
    syncStatusEl.title = "Đang đồng bộ dữ liệu với máy chủ…";
  } else if (trangThai === "xong") {
    const gioPhut = formatGioPhut(lastSyncTime || new Date());
    if (fullEl) fullEl.textContent = `Đã đồng bộ ${gioPhut}`;
    if (shortEl) shortEl.textContent = "Đã đồng bộ";
    syncStatusEl.title = `Đã đồng bộ lúc ${gioPhut}`;
  } else if (trangThai === "loi") {
    if (fullEl) fullEl.textContent = "Chưa đồng bộ — sẽ thử lại";
    if (shortEl) shortEl.textContent = "Chưa đồng bộ";
    syncStatusEl.title = ghiChu || "Mất kết nối máy chủ, sẽ tự động thử lại";
  } else if (trangThai === "hethan") {
    if (fullEl) fullEl.textContent = "Phiên hết hạn";
    if (shortEl) shortEl.textContent = "Hết hạn";
    syncStatusEl.title = "Phiên đăng nhập đã hết hạn. Bấm để đăng nhập lại.";
  }
}

syncStatusEl?.addEventListener("click", () => {
  if (syncStatusEl.dataset.trangThai === "hethan") {
    location.href = "/dang-nhap?tiep=%2F";
  }
});

function lenLichThuLai() {
  if (authExpired) return;
  if (syncRetryTimer) return;
  syncRetryTimer = setTimeout(() => {
    syncRetryTimer = null;
    dongBo(false);
  }, syncRetryDelay);
  syncRetryDelay = syncRetryDelay === 5000 ? 15000 : 60000;
}

function baoCoThayDoi() {
  if (authExpired) return;
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    clearTimeout(syncMaxWaitTimer);
    syncMaxWaitTimer = null;
    guiPut();
  }, 3000);

  if (!syncMaxWaitTimer) {
    syncMaxWaitTimer = setTimeout(() => {
      syncMaxWaitTimer = null;
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = null;
      guiPut();
    }, 15000);
  }
}

function apDungBanChuan(danhSachSoMoi) {
  if (!Array.isArray(danhSachSoMoi)) return;

  // `trangHienTai` là lựa chọn riêng của máy nên KHÔNG nằm trong dữ liệu máy
  // chủ. Trước đây thay nguyên mảng sổ là mất nó, `getCurrentPage` đặt lại 0 và
  // Sam đang dạy thì bảng nhảy về trang 1 sau mỗi lượt đồng bộ (3 giây một lần).
  // Nhớ theo ID của sổ và của trang, rồi đặt lại đúng chỗ cũ.
  const soDangMoId = notebooksData.soHienTai;
  const trangDangMoId = getCurrentPage(getCurrentNotebook())?.id ?? null;
  const netDangHienThi = JSON.stringify(board.exportScene().items ?? null);

  // ĐÈ nguyên mảng bằng câu trả lời của máy chủ là sai: một lượt PUT đang bay
  // được dựng từ ảnh chụp TRƯỚC khi Sam thêm trang mới, nên câu trả lời của nó
  // thiếu trang đó; đè vào là trang vừa tạo biến mất khỏi máy này. Đo được:
  // "Trang 3/3" tụt xuống "Trang 1/2" sau 2 giây rồi tải lại còn "Trang 1/1"
  // trống. Phải HỢP NHẤT bằng đúng luật máy chủ đang dùng.
  notebooksData.so = hopNhatSoTay(notebooksData.so, danhSachSoMoi);
  const soSong = laySoSong(notebooksData);
  if (soSong.length === 0) {
    const defaultNb = createNewNotebook("SamNguyen 1");
    notebooksData.so.push(defaultNb);
    notebooksData.soHienTai = defaultNb.id;
  } else if (soSong.some((s) => s.id === soDangMoId)) {
    notebooksData.soHienTai = soDangMoId;
  } else if (!soSong.some((s) => s.id === notebooksData.soHienTai)) {
    notebooksData.soHienTai = soSong[0].id;
  }

  currentNotebook = getCurrentNotebook();
  const trangSong = layTrangSong(currentNotebook);
  const viTriCu = trangSong.findIndex((trang) => trang.id === trangDangMoId);
  if (viTriCu >= 0) currentNotebook.trangHienTai = viTriCu;
  else if (trangSong.length) currentNotebook.trangHienTai = Math.min(currentNotebook.trangHienTai ?? 0, trangSong.length - 1);

  const curPage = getCurrentPage(currentNotebook);
  // Chỉ vẽ lại khi nét thật sự khác, và không bao giờ cắt ngang lúc Sam đang
  // kéo một nét dở — `board.active` khác null nghĩa là con trỏ đang xuống.
  const netMoi = JSON.stringify(curPage?.scene?.items ?? null);
  if (curPage?.scene && netMoi !== netDangHienThi && !board.active) {
    board.importScene(curPage.scene);
  }

  localStorage.setItem("sam-bang-den-so-tay", JSON.stringify(notebooksData));
  updateNotebookBar();
  updatePageBar();
  updateCopyDriveLinkBtn();
  if (notebookManager && !notebookManager.classList.contains("ui-hidden")) {
    renderNotebookList();
  }
  if (pageOverview && !pageOverview.classList.contains("ui-hidden")) {
    openOverview();
  }
}

async function dongBo(thuCong = false) {
  if (authExpired && !thuCong) return;
  if (isSyncing) {
    pendingSync = true;
    return;
  }
  isSyncing = true;
  capNhatTrangThaiDongBo("dang");

  try {
    writeBook();
    const getRes = await fetch("/api/so-tay");
    if (getRes.status === 401) {
      authExpired = true;
      capNhatTrangThaiDongBo("hethan");
      showToast("Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.", "error", [
        { text: "Đăng nhập lại", href: "/dang-nhap?tiep=%2F" }
      ]);
      return;
    }
    if (!getRes.ok) {
      throw new Error(`Máy chủ trả về ${getRes.status}`);
    }

    const getData = await getRes.json();
    // Mỗi máy mới đều tự tạo một sổ mặc định trống trước khi kịp đồng bộ. Đẩy
    // nó lên là kho tích dần "SamNguyen 1", "SamNguyen 2"… rỗng không của mỗi
    // thiết bị — đã đo được 2 sổ rác sau 2 lượt chạy thử hai máy.
    // Luật: sổ chưa từng có trên máy chủ, mang tên mặc định, và không có một
    // nét nào thì KHÔNG gửi lên. Sam vẽ nét đầu tiên là nó được gửi ngay.
    const idTrenMayChu = new Set((Array.isArray(getData?.so) ? getData.so : []).map((item) => item.id));
    const soDeGui = notebooksData.so.filter((nb) => {
      if (idTrenMayChu.has(nb.id) || nb.daXoa) return true;
      const chuaVeGiCa = layTrangSong(nb).every((trang) => (trang.scene?.items?.length || 0) === 0);
      return !(chuaVeGiCa && /^SamNguyen \d+$/.test(String(nb.ten || "").trim()));
    });

    const putRes = await fetch("/api/so-tay", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ so: soDeGui })
    });

    if (putRes.status === 401) {
      authExpired = true;
      capNhatTrangThaiDongBo("hethan");
      showToast("Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.", "error", [
        { text: "Đăng nhập lại", href: "/dang-nhap?tiep=%2F" }
      ]);
      return;
    }
    if (!putRes.ok) {
      const errData = await putRes.json().catch(() => null);
      throw new Error(errData?.message || `Lỗi đồng bộ (${putRes.status})`);
    }

    const putData = await putRes.json();
    if (Array.isArray(putData?.so)) {
      apDungBanChuan(putData.so);
    }

    lastSyncTime = new Date();
    syncRetryDelay = 5000;
    clearTimeout(syncRetryTimer);
    syncRetryTimer = null;
    authExpired = false;
    capNhatTrangThaiDongBo("xong");

    if (thuCong) {
      const tongSo = laySoSong(notebooksData).length;
      const tongTrang = laySoSong(notebooksData).reduce((sum, s) => sum + layTrangSong(s).length, 0);
      showToast(`Đã đồng bộ ${tongSo} sổ, ${tongTrang} trang.`, "info");
    }
  } catch (err) {
    console.warn("Lỗi đồng bộ sổ tay:", err);
    capNhatTrangThaiDongBo("loi", err.message);
    lenLichThuLai();
    if (thuCong) {
      // `fetch` ném "Failed to fetch" bằng tiếng Anh khi mất mạng — Sam không
      // cần đọc chuỗi đó, chỉ cần biết là mất kết nối và máy sẽ tự thử lại.
      const loiMang = err instanceof TypeError || /failed to fetch|network/i.test(String(err?.message || ""));
      showToast(
        loiMang ? "Mất kết nối máy chủ — nét vẽ vẫn nằm trong máy này, sẽ tự đồng bộ lại khi có mạng." : err.message || "Không thể đồng bộ với máy chủ",
        "error"
      );
    }
  } finally {
    isSyncing = false;
    if (pendingSync) {
      pendingSync = false;
      dongBo(false);
    }
  }
}

async function guiPut() {
  if (authExpired) return;
  if (isSyncing) {
    pendingSync = true;
    return;
  }
  isSyncing = true;
  capNhatTrangThaiDongBo("dang");

  try {
    writeBook();
    const putRes = await fetch("/api/so-tay", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ so: notebooksData.so })
    });

    if (putRes.status === 401) {
      authExpired = true;
      capNhatTrangThaiDongBo("hethan");
      showToast("Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.", "error", [
        { text: "Đăng nhập lại", href: "/dang-nhap?tiep=%2F" }
      ]);
      return;
    }
    if (!putRes.ok) {
      const errData = await putRes.json().catch(() => null);
      throw new Error(errData?.message || `Lỗi đồng bộ (${putRes.status})`);
    }

    const putData = await putRes.json();
    if (Array.isArray(putData?.so)) {
      apDungBanChuan(putData.so);
    }

    lastSyncTime = new Date();
    syncRetryDelay = 5000;
    clearTimeout(syncRetryTimer);
    syncRetryTimer = null;
    capNhatTrangThaiDongBo("xong");
  } catch (err) {
    console.warn("Lỗi gửi PUT đồng bộ:", err);
    capNhatTrangThaiDongBo("loi", err.message);
    lenLichThuLai();
  } finally {
    isSyncing = false;
    if (pendingSync) {
      pendingSync = false;
      dongBo(false);
    }
  }
}

function guiPutGiuKetNoi() {
  if (authExpired) return;
  try {
    fetch("/api/so-tay", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ so: notebooksData.so }),
      keepalive: true
    }).catch(() => {});
  } catch {}
}

syncNowBtn?.addEventListener("click", async () => {
  const originalText = syncNowBtn.textContent;
  syncNowBtn.disabled = true;
  syncNowBtn.textContent = "Đang đồng bộ…";
  try {
    await dongBo(true);
  } finally {
    syncNowBtn.disabled = false;
    syncNowBtn.textContent = originalText;
  }
});

dongBo(false);
