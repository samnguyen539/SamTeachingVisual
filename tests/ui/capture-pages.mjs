/**
 * Smoke bằng chứng UI cho nhiều trang bảng, nút mở lại thanh công cụ và lưu Drive.
 *
 *   node tests/ui/capture-pages.mjs <base-url> <out-dir>
 *
 * Mặc định KHÔNG gọi Drive thật. Thêm `--drive` để bấm "Lưu tất cả lên Drive"
 * và ghi thật vào thư mục Drive đã cấu hình trên máy chủ.
 */
import fs from "node:fs";
import path from "node:path";
import { launchWindowsGpuBrowser } from "file:///D:/New_System_AI/SamAnimationPhoto/tools/cdp-frame-capture.js";
import { dangNhapQuaGiaoDien, taoSoSach, xoaSoTheoTen } from "./dang-nhap-cdp.mjs";

const base = (process.argv[2] || "https://day.samnguyenphoto.com").replace(/\/$/, "");
const outDir = path.resolve(process.argv[3] || "report/UXQA/bang-den-trang");
const runDrive = process.argv.includes("--drive");
fs.mkdirSync(outDir, { recursive: true });

const shots = [];
const problems = [];
const measurements = {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  problems.push(message);
  console.log(`FAIL ${message}`);
}

const litCounter = () => {
  const canvas = document.getElementById("boardCanvas");
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let lit = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 16) lit += 1;
  return lit;
};

async function main() {
  const session = await launchWindowsGpuBrowser({
    profileDir: path.join(outDir, ".browser-profile"),
    width: 1440,
    height: 900
  });
  const page = session.page;
  await dangNhapQuaGiaoDien(page, base);

  async function shoot(file, expected) {
    await page.screenshot(path.join(outDir, file));
    shots.push({ file, capturedAt: new Date().toISOString(), expected });
    console.log(`shot ${file} :: ${expected}`);
  }

  const tenSoNhap = `QA trang ${Date.now().toString(36).slice(-5)}`;
  async function open({ fresh = true } = {}) {
    // Có đồng bộ máy chủ thì xoá localStorage không còn cho ra sổ trắng nữa —
    // sổ nháp riêng mới bảo đảm đếm trang bắt đầu từ "Trang 1/1".
    await page.send("Page.navigate", { url: `${base}/` });
    await page.waitForFunction(() => document.readyState === "complete", 30000);
    await page.waitForFunction(() => Boolean(document.getElementById("pageLabel")), 15000);
    await sleep(fresh ? 1200 : 500);
    if (fresh) {
      await taoSoSach(page, tenSoNhap);
      await sleep(400);
    }
  }

  async function stroke(points) {
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: points[0][0], y: points[0][1], button: "left", buttons: 1, clickCount: 1 });
    for (const [x, y] of points.slice(1)) {
      await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
    }
    const last = points.at(-1);
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: last[0], y: last[1], button: "left", buttons: 0, clickCount: 1 });
    await sleep(150);
  }

  const wave = (x0, y0, width, amplitude, steps = 36) =>
    Array.from({ length: steps }, (_, index) => {
      const t = index / (steps - 1);
      return [Math.round(x0 + width * t), Math.round(y0 + Math.sin(t * Math.PI * 2.2) * amplitude)];
    });

  const click = (id) => page.evaluate(new Function("return document.getElementById(" + JSON.stringify(id) + ").click();"));
  const lit = () => page.evaluate(litCounter);
  const label = () => page.evaluate(() => document.getElementById("pageLabel").textContent.trim());

  await open();

  // ── 1. Trang 1: vẽ, kiểm nhãn trang và nút điều hướng ở đầu sổ ─────────────
  const start = await page.evaluate(() => ({
    label: document.getElementById("pageLabel").textContent.trim(),
    prevDisabled: document.getElementById("prevPageBtn").disabled,
    nextDisabled: document.getElementById("nextPageBtn").disabled,
    restoreVisible: getComputedStyle(document.getElementById("boardRestoreBtn")).opacity !== "0"
  }));
  measurements.start = start;
  console.log("start:", JSON.stringify(start));
  if (start.label !== "Trang 1/1") fail(`nhãn trang lúc mở phải là "Trang 1/1", đo được "${start.label}"`);
  if (!start.prevDisabled || !start.nextDisabled) fail("chỉ có 1 trang mà nút qua trang vẫn bấm được");
  if (start.restoreVisible) fail("thanh công cụ đang hiện mà nút mở lại cũng hiện — thừa");

  await stroke(wave(200, 320, 800, 90));
  const litPage1 = await lit();
  if (litPage1 <= 0) fail("vẽ trên trang 1 không ra nét");
  await shoot("01-trang1-co-net.png", `Trang 1/1, một nét trắng, pixel sáng ${litPage1}`);

  // ── 2. Thêm trang mới: phải sang trang trắng ────────────────────────────────
  await click("addPageBtn");
  await sleep(400);
  const afterAdd = { label: await label(), lit: await lit() };
  measurements.afterAdd = afterAdd;
  console.log("afterAdd:", JSON.stringify(afterAdd));
  if (afterAdd.label !== "Trang 2/2") fail(`thêm trang xong nhãn phải là "Trang 2/2", đo được "${afterAdd.label}"`);
  if (afterAdd.lit !== 0) fail(`trang mới phải trắng nhưng còn ${afterAdd.lit} pixel sáng`);
  await stroke([[300, 600], [600, 480], [900, 620], [1150, 500]]);
  const litPage2 = await lit();
  await shoot("02-trang2-moi-co-net-khac.png", `Trang 2/2, nét khác hẳn trang 1, pixel sáng ${litPage2}`);

  // ── 3. Qua lại trang cũ: nét trang 1 phải còn nguyên ───────────────────────
  await click("prevPageBtn");
  await sleep(400);
  const backTo1 = { label: await label(), lit: await lit() };
  measurements.backTo1 = backTo1;
  console.log("backTo1:", JSON.stringify(backTo1));
  if (backTo1.label !== "Trang 1/2") fail(`quay lại phải là "Trang 1/2", đo được "${backTo1.label}"`);
  if (Math.abs(backTo1.lit - litPage1) > 40) fail(`nét trang 1 không khôi phục đúng: ${litPage1} -> ${backTo1.lit}`);
  await shoot("03-quay-lai-trang1.png", `Trang 1/2, nét cũ còn nguyên, pixel sáng ${backTo1.lit}`);

  // ── 4. Xem lại các trang ───────────────────────────────────────────────────
  await click("pagesBtn");
  await sleep(600);
  const overview = await page.evaluate(() => {
    const panel = document.getElementById("pageOverview");
    const canvases = [...document.querySelectorAll("#overviewGrid canvas")];
    return {
      opacity: getComputedStyle(panel).opacity,
      hidden: panel.classList.contains("ui-hidden"),
      thumbs: canvases.length,
      thumbsWithInk: canvases.filter((canvas) => {
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < data.length; index += 4) if (data[index] > 16) return true;
        return false;
      }).length,
      text: document.getElementById("overviewGrid").innerText.replace(/\s+/g, " ").slice(0, 200),
      background: getComputedStyle(panel).backgroundColor,
      toolbarOpacity: getComputedStyle(document.getElementById("boardToolbar")).opacity,
      pageBarOpacity: getComputedStyle(document.getElementById("pageBar")).opacity,
      hintOpacity: getComputedStyle(document.getElementById("boardHint")).opacity
    };
  });
  measurements.overview = overview;
  console.log("overview:", JSON.stringify(overview));
  if (overview.hidden || overview.opacity === "0") fail("bấm Các trang mà overlay không hiện");
  if (overview.thumbs !== 2) fail(`overlay phải có 2 ô xem trước, đo được ${overview.thumbs}`);
  if (overview.thumbsWithInk !== 2) fail(`cả 2 ô xem trước phải thấy nét vẽ, chỉ ${overview.thumbsWithInk} ô có nét`);
  const overlayAlpha = Number(/rgba?\([^)]*?,\s*([\d.]+)\)/.exec(overview.background)?.[1] ?? 1);
  if (overlayAlpha < 0.95) fail(`nền overlay chỉ ${overlayAlpha} — nét vẽ và thanh công cụ phía sau vẫn lộ ra`);
  if (overview.toolbarOpacity !== "0" || overview.pageBarOpacity !== "0" || overview.hintOpacity !== "0") {
    fail(`mở danh sách trang mà thanh công cụ/thanh trang/dòng gợi ý vẫn hiện (${overview.toolbarOpacity}/${overview.pageBarOpacity}/${overview.hintOpacity})`);
  }
  await shoot("04-xem-lai-cac-trang.png", `Overlay 2 ô xem trước đều có nét: "${overview.text}"`);

  // Bấm ô trang 2 phải mở đúng trang 2 và đóng overlay.
  await page.evaluate(() => {
    const tiles = [...document.querySelectorAll("#overviewGrid canvas")];
    (tiles[1].closest("button") || tiles[1].parentElement).click();
  });
  await sleep(500);
  const jumped = await page.evaluate(() => ({
    label: document.getElementById("pageLabel").textContent.trim(),
    overlayHidden: document.getElementById("pageOverview").classList.contains("ui-hidden"),
    toolbarOpacity: getComputedStyle(document.getElementById("boardToolbar")).opacity,
    pageBarOpacity: getComputedStyle(document.getElementById("pageBar")).opacity
  }));
  const jumpedLit = await lit();
  measurements.jumped = { ...jumped, lit: jumpedLit };
  console.log("jumped:", JSON.stringify(measurements.jumped));
  if (jumped.label !== "Trang 2/2") fail(`bấm ô xem trước phải mở "Trang 2/2", đo được "${jumped.label}"`);
  if (!jumped.overlayHidden) fail("mở trang từ overlay mà overlay không đóng");
  if (Math.abs(jumpedLit - litPage2) > 40) fail(`nét trang 2 không khôi phục đúng: ${litPage2} -> ${jumpedLit}`);
  if (jumped.toolbarOpacity === "0" || jumped.pageBarOpacity === "0") {
    fail(`đóng danh sách trang mà thanh công cụ/thanh trang không hiện lại (${jumped.toolbarOpacity}/${jumped.pageBarOpacity})`);
  }
  await shoot("05-mo-trang-tu-danh-sach.png", `Mở Trang 2/2 từ danh sách, pixel sáng ${jumpedLit}`);

  // ── 5. Nút mở lại thanh công cụ phải NHÌN THẤY RÕ ──────────────────────────
  await click("hideUiBtn");
  await sleep(500);
  const restore = await page.evaluate(() => {
    const button = document.getElementById("boardRestoreBtn");
    const style = getComputedStyle(button);
    const box = button.getBoundingClientRect();
    return {
      toolbarOpacity: getComputedStyle(document.getElementById("boardToolbar")).opacity,
      pageBarOpacity: getComputedStyle(document.getElementById("pageBar")).opacity,
      hintOpacity: getComputedStyle(document.getElementById("boardHint")).opacity,
      opacity: Number(style.opacity),
      width: Math.round(box.width),
      height: Math.round(box.height),
      insideViewport: box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight,
      text: button.innerText.replace(/\s+/g, " ").trim(),
      pointerEvents: style.pointerEvents
    };
  });
  measurements.restore = restore;
  console.log("restore:", JSON.stringify(restore));
  if (restore.toolbarOpacity !== "0") fail(`ẩn thanh công cụ không hiệu lực (opacity=${restore.toolbarOpacity})`);
  if (restore.pageBarOpacity !== "0") fail(`ẩn UI mà thanh trang vẫn hiện (opacity=${restore.pageBarOpacity})`);
  if (restore.hintOpacity !== "0") fail(`ẩn UI mà dòng gợi ý vẫn hiện (opacity=${restore.hintOpacity}) — không sạch để quay màn hình`);
  if (restore.opacity < 0.7) fail(`nút mở lại quá mờ (opacity=${restore.opacity}), Sam sẽ không thấy`);
  if (restore.height < 36 || restore.width < 36) fail(`nút mở lại quá nhỏ (${restore.width}x${restore.height})`);
  if (!restore.insideViewport) fail("nút mở lại nằm ngoài khung nhìn");
  if (restore.pointerEvents === "none") fail("nút mở lại không bấm được");
  if (!/☰|Hiện/.test(restore.text)) fail(`nút mở lại không có dấu hiệu nhận biết, chữ đọc được: "${restore.text}"`);
  await shoot("06-an-ui-nut-mo-lai-ro-rang.png", `UI đã ẩn, nút mở lại opacity=${restore.opacity} ${restore.width}x${restore.height} chữ "${restore.text}"`);

  await click("boardRestoreBtn");
  await sleep(500);
  const restored = await page.evaluate(() => getComputedStyle(document.getElementById("boardToolbar")).opacity);
  measurements.restoredOpacity = restored;
  if (restored === "0") fail("bấm nút mở lại mà thanh công cụ vẫn ẩn");
  await shoot("07-mo-lai-thanh-cong-cu.png", `Thanh công cụ hiện lại, opacity=${restored}`);

  // ── 6. Tải lại trang: cả sổ trang phải còn ─────────────────────────────────
  await open({ fresh: false });
  const afterReload = { label: await label(), lit: await lit() };
  measurements.afterReload = afterReload;
  console.log("afterReload:", JSON.stringify(afterReload));
  if (!/\/2$/.test(afterReload.label)) fail(`tải lại trang là mất sổ trang, nhãn còn "${afterReload.label}"`);
  if (afterReload.lit <= 0) fail("tải lại trang là mất hết nét vẽ");
  await shoot("08-tai-lai-van-con-2-trang.png", `Sau khi tải lại: "${afterReload.label}", pixel sáng ${afterReload.lit}`);

  // ── 7. Lưu tất cả lên Drive (chỉ khi có --drive) ───────────────────────────
  if (runDrive) {
    await click("saveDriveBtn");
    await page.waitForFunction(
      () => {
        const toast = document.getElementById("boardToast");
        return !toast.classList.contains("ui-hidden") && document.getElementById("toastMessage").innerText.trim().length > 0;
      },
      120000
    );
    await sleep(800);
    const drive = await page.evaluate(() => {
      const toast = document.getElementById("boardToast").getBoundingClientRect();
      const toolbar = document.getElementById("boardToolbar").getBoundingClientRect();
      const overlap = Math.max(0, Math.min(toast.bottom, toolbar.bottom) - Math.max(toast.top, toolbar.top));
      return {
        message: document.getElementById("toastMessage").innerText.replace(/\s+/g, " ").trim(),
        links: [...document.querySelectorAll("#toastActions a")].map((anchor) => anchor.href),
        actionLabels: [...document.querySelectorAll("#toastActions a, #toastActions button")].map((element) => element.innerText.trim()),
        toastClass: document.getElementById("boardToast").className,
        overlapToolbarPx: Math.round(overlap),
        insideViewport: toast.top >= 0 && toast.bottom <= window.innerHeight && toast.left >= 0 && toast.right <= window.innerWidth
      };
    });
    measurements.drive = drive;
    console.log("drive:", JSON.stringify(drive));
    if (!/Đã lưu/.test(drive.message)) fail(`lưu Drive không báo thành công: "${drive.message}"`);
    if (!drive.links.some((href) => href.includes("drive.google.com"))) fail("báo thành công nhưng không có link mở thư mục Drive");
    if (drive.overlapToolbarPx > 0) fail(`thông báo che thanh công cụ ${drive.overlapToolbarPx}px`);
    if (!drive.insideViewport) fail("thông báo nằm ngoài khung nhìn");
    await shoot("09-luu-tat-ca-len-drive.png", `Toast: "${drive.message}" · link ${drive.links.join(" ")}`);
  }

  fs.writeFileSync(
    path.join(outDir, "index.json"),
    JSON.stringify({ base, runDrive, capturedAt: new Date().toISOString(), problems, measurements, shots }, null, 2)
  );

  await xoaSoTheoTen(page, tenSoNhap);

  await session.close();
  console.log(`\n${problems.length === 0 ? "PASS" : `FAIL (${problems.length})`} — bằng chứng tại ${outDir}`);
  if (problems.length) process.exit(1);
}

await main();
