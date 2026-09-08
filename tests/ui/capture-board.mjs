/**
 * Smoke bằng chứng UI cho trang bảng đen (`board.html`).
 *
 * Lái một browser Windows thật qua raw CDP (Edge/Chrome headless, ANGLE D3D11),
 * vẽ bằng chuột thật, rồi chụp ảnh. Không dùng puppeteer.
 *
 *   node tests/ui/capture-board.mjs <base-url> <out-dir>
 *
 * Ví dụ:
 *   node tests/ui/capture-board.mjs http://127.0.0.1:4173 report/UXQA/bang-den-local
 *   node tests/ui/capture-board.mjs https://day.samnguyenphoto.com report/UXQA/bang-den-prod
 */
import fs from "node:fs";
import path from "node:path";
import { launchWindowsGpuBrowser } from "file:///D:/New_System_AI/SamAnimationPhoto/tools/cdp-frame-capture.js";

const base = (process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");
const outDir = path.resolve(process.argv[3] || "report/UXQA/bang-den");
fs.mkdirSync(outDir, { recursive: true });

const shots = [];
const problems = [];

function fail(message) {
  problems.push(message);
  console.log(`FAIL ${message}`);
}

async function main() {
  const session = await launchWindowsGpuBrowser({
    profileDir: path.join(outDir, ".browser-profile"),
    width: 1440,
    height: 900
  });
  const page = session.page;

  async function shoot(file, meta) {
    await page.screenshot(path.join(outDir, file));
    shots.push({ file, capturedAt: new Date().toISOString(), url: meta.url, viewport: meta.viewport, expected: meta.expected });
    console.log(`shot ${file} :: ${meta.expected}`);
  }

  async function open(url, viewport) {
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.dpr ?? 1,
      mobile: Boolean(viewport.mobile)
    });
    // Trang bảng flush sổ trang khi `pagehide`, nên xoá localStorage trên chính
    // nó rồi reload sẽ bị nó ghi lại. Xoá từ /studio (cùng origin) mới sạch thật.
    if (viewport.keepScene !== true) {
      await page.send("Page.navigate", { url: `${base}/studio` });
      await page.waitForFunction(() => document.readyState === "complete", 30000);
      await page.evaluate(() => {
        try {
          localStorage.removeItem("sam-bang-den-so");
          localStorage.removeItem("sam-bang-den-scene");
        } catch {}
      });
    }
    await page.send("Page.navigate", { url });
    await page.waitForFunction(() => document.readyState === "complete", 30000);
    await page.waitForFunction(() => Boolean(document.getElementById("boardCanvas")), 15000);
    await sleep(500);
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function stroke(points) {
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: points[0][0], y: points[0][1], button: "left", buttons: 1, clickCount: 1 });
    for (const [x, y] of points.slice(1)) {
      await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
    }
    const last = points.at(-1);
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: last[0], y: last[1], button: "left", buttons: 0, clickCount: 1 });
    await sleep(120);
  }

  function wave(x0, y0, width, amplitude, steps = 40) {
    return Array.from({ length: steps }, (_, index) => {
      const t = index / (steps - 1);
      return [Math.round(x0 + width * t), Math.round(y0 + Math.sin(t * Math.PI * 2.4) * amplitude)];
    });
  }

  // ── Desktop 1440x900 ────────────────────────────────────────────────────────
  const desktop = { width: 1440, height: 900 };
  await open(`${base}/`, desktop);

  const rootInfo = await page.evaluate(() => {
    const canvas = document.getElementById("boardCanvas");
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    return {
      title: document.title,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      canvasBg: getComputedStyle(canvas).backgroundColor,
      touchAction: getComputedStyle(canvas).touchAction,
      canvasPixels: `${canvas.width}x${canvas.height}`,
      canvasCss: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      coversViewport: Math.round(rect.width) >= window.innerWidth - 1 && Math.round(rect.height) >= window.innerHeight - 1,
      toolbarVisible: getComputedStyle(document.getElementById("boardToolbar")).opacity !== "0",
      hasContext: Boolean(context),
      overflowX: document.documentElement.scrollWidth - window.innerWidth
    };
  });
  console.log("root:", JSON.stringify(rootInfo));
  if (rootInfo.touchAction !== "none") fail(`canvas touch-action = ${rootInfo.touchAction}, phải là none`);
  if (!rootInfo.coversViewport) fail(`canvas không phủ hết viewport (${rootInfo.canvasCss})`);
  await shoot("01-desktop-bang-den-trong.png", { url: `${base}/`, viewport: "1440x900", expected: `Bảng đen trống, nền đen ${rootInfo.bodyBg}, thanh công cụ hiện` });

  // Ô màu nào đang sáng thì nét đầu tiên phải ra đúng màu đó.
  const activeSwatch = await page.evaluate(() => {
    const active = document.querySelector("#colorSwatches .swatch.active") || document.querySelector("#colorSwatches .swatch");
    return active?.dataset.color ?? null;
  });
  console.log(`active swatch = ${activeSwatch}`);

  // Đếm pixel sáng trước khi vẽ để chứng minh nét vẽ thật sự xuất hiện.
  const litBefore = await page.evaluate(() => {
    const canvas = document.getElementById("boardCanvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 16) lit += 1;
    return lit;
  });

  await stroke(wave(180, 300, 900, 90));
  await stroke([[300, 520], [520, 470], [740, 560], [980, 480]]);

  const dominant = await page.evaluate(() => {
    const canvas = document.getElementById("boardCanvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const tally = new Map();
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < 250) continue;
      const key = `#${[data[index], data[index + 1], data[index + 2]].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
      tally.set(key, (tally.get(key) || 0) + 1);
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  });
  console.log(`dominant stroke colour = ${JSON.stringify(dominant)}`);
  if (!dominant) fail("không tìm thấy pixel đặc nào sau khi vẽ hai nét đầu");
  else if (dominant[0].toLowerCase() !== String(activeSwatch).toLowerCase()) {
    fail(`ô màu đang sáng là ${activeSwatch} nhưng nét vẽ ra màu ${dominant[0]}`);
  }

  const litAfterWhite = await page.evaluate(() => {
    const canvas = document.getElementById("boardCanvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 16) lit += 1;
    return lit;
  });
  console.log(`lit pixels: before=${litBefore} afterWhite=${litAfterWhite}`);
  if (litAfterWhite <= litBefore) fail("kéo chuột không tạo ra nét vẽ nào trên canvas");
  await shoot("02-desktop-net-trang.png", { url: `${base}/`, viewport: "1440x900", expected: `Hai nét trắng đã vẽ, pixel sáng ${litBefore} -> ${litAfterWhite}` });

  // Đổi màu rồi vẽ tiếp — kiểm màu thật lấy từ canvas.
  await page.evaluate(() => document.querySelector('#colorSwatches [data-color="#ffd43b"]').click());
  await page.evaluate(() => { document.getElementById("widthRange").value = "22"; document.getElementById("widthRange").dispatchEvent(new Event("input", { bubbles: true })); });
  await stroke(wave(200, 700, 900, 40));
  const yellow = await page.evaluate(() => {
    const canvas = document.getElementById("boardCanvas");
    const scaleX = canvas.width / canvas.getBoundingClientRect().width;
    const scaleY = canvas.height / canvas.getBoundingClientRect().height;
    const data = canvas.getContext("2d").getImageData(0, Math.round(660 * scaleY), canvas.width, Math.round(120 * scaleY)).data;
    let found = null;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] > 200 && data[index] > 200 && data[index + 1] > 150 && data[index + 2] < 120) {
        found = `rgb(${data[index]},${data[index + 1]},${data[index + 2]})`;
        break;
      }
    }
    return { found, scaleX, scaleY };
  });
  console.log("yellow probe:", JSON.stringify(yellow));
  if (!yellow.found) fail("chọn màu vàng nhưng không tìm thấy pixel vàng trong dải vừa vẽ");
  await shoot("03-desktop-doi-mau-net-day.png", { url: `${base}/`, viewport: "1440x900", expected: `Nét thứ ba màu vàng nét dày, pixel đo được ${yellow.found}` });

  // Hoàn tác phải bỏ đúng nét cuối.
  await page.evaluate(() => document.getElementById("undoBtn").click());
  await sleep(200);
  const litAfterUndo = await page.evaluate(() => {
    const canvas = document.getElementById("boardCanvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 16) lit += 1;
    return lit;
  });
  console.log(`after undo lit=${litAfterUndo}`);
  if (litAfterUndo >= litAfterWhite + 1000) fail(`hoàn tác không xoá nét vàng (pixel sáng còn ${litAfterUndo})`);
  await shoot("04-desktop-hoan-tac.png", { url: `${base}/`, viewport: "1440x900", expected: `Hoàn tác bỏ nét vàng, còn 2 nét trắng, pixel sáng ${litAfterUndo}` });

  // Ẩn thanh công cụ.
  await page.evaluate(() => document.getElementById("hideUiBtn").click());
  await sleep(450);
  const hidden = await page.evaluate(() => {
    const toolbar = document.getElementById("boardToolbar");
    const style = getComputedStyle(toolbar);
    const restore = document.getElementById("boardRestoreBtn");
    return { opacity: style.opacity, pointerEvents: style.pointerEvents, hasRestore: Boolean(restore), restoreOpacity: restore ? getComputedStyle(restore).opacity : null };
  });
  console.log("hidden:", JSON.stringify(hidden));
  if (hidden.opacity !== "0") fail(`ẩn thanh công cụ không hiệu lực (opacity=${hidden.opacity})`);
  if (!hidden.hasRestore) fail("ẩn thanh công cụ nhưng không có nút mở lại (#boardRestoreBtn)");
  await shoot("05-desktop-an-thanh-cong-cu.png", { url: `${base}/`, viewport: "1440x900", expected: "Thanh công cụ đã ẩn, chỉ còn nét vẽ trên nền đen" });

  // `.click()` trả về undefined nên `??` sẽ chạy luôn nhánh phải và ẩn lại UI — chỉ bấm đúng nút mở lại.
  await page.evaluate(() => document.getElementById("boardRestoreBtn").click());
  await sleep(450);
  const restored = await page.evaluate(() => getComputedStyle(document.getElementById("boardToolbar")).opacity);
  if (restored === "0") fail("không mở lại được thanh công cụ sau khi ẩn");
  await shoot("06-desktop-mo-lai-thanh-cong-cu.png", { url: `${base}/`, viewport: "1440x900", expected: `Thanh công cụ hiện lại, opacity=${restored}` });

  // ── Route /bang-den và /studio ──────────────────────────────────────────────
  await open(`${base}/bang-den`, desktop);
  const bangDen = await page.evaluate(() => ({ title: document.title, hasCanvas: Boolean(document.getElementById("boardCanvas")) }));
  if (!bangDen.hasCanvas) fail("/bang-den không trả về trang bảng đen");
  await shoot("07-route-bang-den.png", { url: `${base}/bang-den`, viewport: "1440x900", expected: `Route /bang-den ra bảng đen, title="${bangDen.title}"` });

  await page.send("Page.navigate", { url: `${base}/studio` });
  await page.waitForFunction(() => document.readyState === "complete", 30000);
  await sleep(800);
  const studio = await page.evaluate(() => ({ title: document.title, hasStudioCanvas: Boolean(document.getElementById("drawingCanvas")), hasRecord: Boolean(document.getElementById("recordBtn")) }));
  console.log("studio:", JSON.stringify(studio));
  if (!studio.hasStudioCanvas || !studio.hasRecord) fail("/studio không trả về studio đầy đủ (thiếu #drawingCanvas hoặc #recordBtn)");
  await shoot("08-route-studio-khong-hong.png", { url: `${base}/studio`, viewport: "1440x900", expected: `Studio cũ vẫn chạy, title="${studio.title}"` });

  // ── Mobile 390x844 ──────────────────────────────────────────────────────────
  await open(`${base}/`, { width: 390, height: 844, mobile: true });
  const mobile = await page.evaluate(() => {
    const rect = document.getElementById("boardCanvas").getBoundingClientRect();
    const toolbarEl = document.getElementById("boardToolbar");
    const hintEl = document.getElementById("boardHint");
    const toolbar = toolbarEl.getBoundingClientRect();
    const pageBarEl = document.getElementById("pageBar");
    const controls = [...toolbarEl.querySelectorAll("button, a, input"), ...pageBarEl.querySelectorAll("button")].map((element) => {
      const box = element.getBoundingClientRect();
      return {
        label: element.id || element.getAttribute("aria-label") || element.tagName.toLowerCase(),
        visible: box.left >= -1 && box.right <= window.innerWidth + 1 && box.width > 0 && box.height > 0,
        height: Math.round(box.height),
        // Thanh trượt độ dày vốn thấp hơn nút bấm — không tính vào ngưỡng ngón tay.
        tappable: element.tagName.toLowerCase() !== "input"
      };
    });
    return {
      canvasCss: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      toolbarInside: toolbar.left >= -1 && toolbar.right <= window.innerWidth + 1,
      toolbarBottomGap: Math.round(window.innerHeight - toolbar.bottom),
      toolbarHiddenOverflow: toolbarEl.scrollWidth - toolbarEl.clientWidth,
      hintHiddenOverflow: hintEl.scrollWidth - hintEl.clientWidth,
      pageBarHiddenOverflow: pageBarEl.scrollWidth - pageBarEl.clientWidth,
      pageBarInside: (() => { const b = pageBarEl.getBoundingClientRect(); return b.left >= -1 && b.right <= window.innerWidth + 1 && b.top >= -1; })(),
      hintPageBarOverlapPx: (() => {
        const a = hintEl.getBoundingClientRect();
        const b = pageBarEl.getBoundingClientRect();
        const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return Math.round(Math.min(x, y));
      })(),
      offscreenControls: controls.filter((control) => !control.visible).map((control) => control.label),
      smallestControlHeight: Math.min(...controls.filter((control) => control.tappable).map((control) => control.height))
    };
  });
  console.log("mobile:", JSON.stringify(mobile));
  if (mobile.overflowX > 0) fail(`mobile 390 tràn ngang ${mobile.overflowX}px`);
  if (!mobile.toolbarInside) fail("thanh công cụ bị cắt ngoài khung trên mobile 390");
  if (mobile.toolbarHiddenOverflow > 1) fail(`thanh công cụ còn ${mobile.toolbarHiddenOverflow}px nội dung phải cuộn ngang mới thấy`);
  if (mobile.hintHiddenOverflow > 1) fail(`dòng gợi ý bị cắt ${mobile.hintHiddenOverflow}px`);
  if (mobile.pageBarHiddenOverflow > 1) fail(`thanh trang bị cắt ${mobile.pageBarHiddenOverflow}px`);
  if (!mobile.pageBarInside) fail("thanh trang nằm ngoài khung trên mobile 390");
  if (mobile.hintPageBarOverlapPx > 0) fail(`dòng gợi ý và thanh trang đè nhau ${mobile.hintPageBarOverlapPx}px trên mobile 390`);
  if (mobile.offscreenControls.length) fail(`nút nằm ngoài màn hình 390px: ${mobile.offscreenControls.join(", ")}`);
  if (mobile.smallestControlHeight < 32) fail(`có nút cao chỉ ${mobile.smallestControlHeight}px, quá nhỏ để bấm bằng ngón tay`);
  await stroke(wave(40, 380, 300, 60, 26));
  await shoot("09-mobile-390-co-net-ve.png", { url: `${base}/`, viewport: "390x844", expected: `Mobile 390x844 vẽ được, mọi nút nằm trong khung, tràn ngang=${mobile.overflowX}px, thanh công cụ ẩn ${mobile.toolbarHiddenOverflow}px` });

  // ── Tự lưu: nét phải sống qua lần tải lại trang ─────────────────────────────
  const litMobileBefore = await page.evaluate(() => {
    const canvas = document.getElementById("boardCanvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 16) lit += 1;
    return lit;
  });
  await open(`${base}/`, { width: 390, height: 844, mobile: true, keepScene: true });
  const litMobileAfterReload = await page.evaluate(() => {
    const canvas = document.getElementById("boardCanvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 16) lit += 1;
    return lit;
  });
  console.log(`autosave: lit before reload=${litMobileBefore} after reload=${litMobileAfterReload}`);
  if (litMobileBefore === 0) fail("nét vẽ trên mobile không xuất hiện");
  if (litMobileAfterReload === 0) fail("tải lại trang là mất hết nét vẽ (tự lưu localStorage không hoạt động)");
  await shoot("10-mobile-tu-luu-sau-khi-tai-lai.png", { url: `${base}/`, viewport: "390x844", expected: `Nét vẽ còn nguyên sau khi tải lại trang, pixel sáng ${litMobileBefore} -> ${litMobileAfterReload}` });

  // ── Xoá bảng phải làm sạch canvas ───────────────────────────────────────────
  await page.evaluate(() => { window.confirm = () => true; document.getElementById("clearBtn").click(); });
  await sleep(300);
  const litAfterClear = await page.evaluate(() => {
    const canvas = document.getElementById("boardCanvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 16) lit += 1;
    return lit;
  });
  console.log(`after clear lit=${litAfterClear}`);
  if (litAfterClear !== 0) fail(`xoá bảng nhưng canvas còn ${litAfterClear} pixel sáng`);
  await shoot("11-mobile-xoa-bang.png", { url: `${base}/`, viewport: "390x844", expected: `Xoá bảng xong canvas sạch hoàn toàn, pixel sáng = ${litAfterClear}` });

  fs.writeFileSync(
    path.join(outDir, "index.json"),
    JSON.stringify({ base, capturedAt: new Date().toISOString(), problems, measurements: { rootInfo, activeSwatch, dominant, litBefore, litAfterWhite, litAfterUndo, yellow, hidden, mobile, studio, litMobileBefore, litMobileAfterReload, litAfterClear }, shots }, null, 2)
  );

  await session.close();
  console.log(`\n${problems.length === 0 ? "PASS" : `FAIL (${problems.length})`} — bằng chứng tại ${outDir}`);
  if (problems.length) process.exit(1);
}

await main();
