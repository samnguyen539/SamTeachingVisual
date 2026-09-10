/**
 * Sam báo: đang ở trang khác thì bảng tự quay về trang 1.
 *
 * Bộ này mô phỏng đúng cảnh đó và KHÔNG bấm nút đồng bộ tay: tạo 3 trang, sang
 * trang 3, vẽ, rồi ngồi im theo dõi nhãn trang trong 60 giây để bắt mọi lượt
 * đồng bộ tự động (debounce 3 s, trần 15 s, và lượt khi tab được xem lại).
 *
 *   SAM_BOARD_PASSWORD=... node tests/ui/capture-giu-trang.mjs <base-url> <out-dir>
 */
import fs from "node:fs";
import path from "node:path";
import { launchWindowsGpuBrowser } from "file:///D:/New_System_AI/SamAnimationPhoto/tools/cdp-frame-capture.js";
import { dangNhapQuaGiaoDien, taoSoSach, xoaSoTheoTen } from "./dang-nhap-cdp.mjs";

const base = (process.argv[2] || "https://day.samnguyenphoto.com").replace(/\/$/, "");
const outDir = path.resolve(process.argv[3] || "report/UXQA/giu-trang");
fs.mkdirSync(outDir, { recursive: true });

const shots = [];
const problems = [];
const measurements = {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tenSoNhap = `QA giutrang ${Date.now().toString(36).slice(-5)}`;

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
  const session = await launchWindowsGpuBrowser({ profileDir: path.join(outDir, ".browser-profile"), width: 1440, height: 900 });
  const page = session.page;

  const shoot = async (file, expected) => {
    await page.screenshot(path.join(outDir, file));
    shots.push({ file, capturedAt: new Date().toISOString(), expected });
    console.log(`shot ${file} :: ${expected}`);
  };
  const click = (id) => page.evaluate(new Function(`return document.getElementById(${JSON.stringify(id)}).click();`));
  const nhan = () => page.evaluate(() => document.getElementById("pageLabel").textContent.trim());
  const lit = () => page.evaluate(litCounter);
  const stroke = async (points) => {
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: points[0][0], y: points[0][1], button: "left", buttons: 1, clickCount: 1 });
    for (const [x, y] of points.slice(1)) await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
    const last = points.at(-1);
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: last[0], y: last[1], button: "left", buttons: 0, clickCount: 1 });
    await sleep(200);
  };
  const cung = (y) => Array.from({ length: 26 }, (_, index) => {
    const t = index / 25;
    return [Math.round(200 + 900 * t), Math.round(y - Math.sin(t * Math.PI) * 120)];
  });

  await dangNhapQuaGiaoDien(page, base);
  await page.send("Page.navigate", { url: `${base}/` });
  await page.waitForFunction(() => Boolean(document.getElementById("boardCanvas")), 20000);
  await sleep(1500);
  await taoSoSach(page, tenSoNhap);

  // Ba trang, mỗi trang một nét khác nhau.
  await stroke(cung(300));
  await click("addPageBtn");
  await sleep(500);
  await stroke(cung(450));
  await click("addPageBtn");
  await sleep(500);
  await stroke(cung(620));
  const banDau = { nhan: await nhan(), lit: await lit() };
  measurements.banDau = banDau;
  console.log("banDau:", JSON.stringify(banDau));
  if (banDau.nhan !== "Trang 3/3") fail(`chuẩn bị sai, phải đang ở "Trang 3/3", đo được "${banDau.nhan}"`);
  await shoot("01-dang-o-trang-3.png", `Đang ở "${banDau.nhan}", pixel sáng ${banDau.lit}`);

  // Ngồi im 60 giây, KHÔNG bấm gì, lấy mẫu mỗi 2 giây.
  const mau = [];
  for (let lan = 0; lan < 30; lan += 1) {
    await sleep(2000);
    mau.push({ giay: (lan + 1) * 2, nhan: await nhan(), lit: await lit() });
  }
  const lech = mau.filter((m) => m.nhan !== banDau.nhan || Math.abs(m.lit - banDau.lit) > 60);
  measurements.ngoiIm = { soMau: mau.length, lech, mauCuoi: mau.at(-1) };
  console.log("ngoiIm:", JSON.stringify(measurements.ngoiIm));
  if (lech.length) {
    fail(`ngồi im mà bảng tự đổi ${lech.length}/${mau.length} lần: ${lech.map((m) => `${m.giay}s→${m.nhan}/${m.lit}`).join(", ")}`);
  }
  await shoot("02-ngoi-im-60-giay.png", `Sau 60 giây không bấm gì: "${mau.at(-1).nhan}", pixel sáng ${mau.at(-1).lit}`);

  // Vẽ thêm rồi ngồi im 20 giây — đây là lúc vòng đồng bộ chắc chắn chạy.
  await stroke([[300, 700], [700, 640], [1100, 720]]);
  const sauVe = { nhan: await nhan(), lit: await lit() };
  const mau2 = [];
  for (let lan = 0; lan < 10; lan += 1) {
    await sleep(2000);
    mau2.push({ giay: (lan + 1) * 2, nhan: await nhan(), lit: await lit() });
  }
  const lech2 = mau2.filter((m) => m.nhan !== sauVe.nhan || Math.abs(m.lit - sauVe.lit) > 60);
  measurements.veRoiCho = { sauVe, lech: lech2, mauCuoi: mau2.at(-1) };
  console.log("veRoiCho:", JSON.stringify(measurements.veRoiCho));
  if (lech2.length) {
    fail(`vẽ xong rồi ngồi im mà bảng tự đổi: ${lech2.map((m) => `${m.giay}s→${m.nhan}/${m.lit}`).join(", ")}`);
  }
  await shoot("03-ve-roi-cho-dong-bo.png", `Vẽ thêm ở "${sauVe.nhan}" rồi chờ 20 giây: vẫn "${mau2.at(-1).nhan}", pixel sáng ${mau2.at(-1).lit}`);

  // Chuyển tab đi rồi quay lại — đường này cũng kích hoạt một lượt đồng bộ.
  await page.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sleep(1500);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sleep(4000);
  const sauDoiTab = { nhan: await nhan(), lit: await lit() };
  measurements.sauDoiTab = sauDoiTab;
  console.log("sauDoiTab:", JSON.stringify(sauDoiTab));
  if (sauDoiTab.nhan !== sauVe.nhan) fail(`rời tab rồi quay lại thì bảng nhảy từ "${sauVe.nhan}" về "${sauDoiTab.nhan}"`);
  if (Math.abs(sauDoiTab.lit - sauVe.lit) > 60) fail(`rời tab rồi quay lại thì nét đổi: ${sauVe.lit} -> ${sauDoiTab.lit}`);
  await shoot("04-roi-tab-roi-quay-lai.png", `Rời tab rồi quay lại: vẫn "${sauDoiTab.nhan}", pixel sáng ${sauDoiTab.lit}`);

  // Tải lại trang: phải về đúng trang đang mở, không phải trang 1.
  await page.send("Page.reload", { ignoreCache: false });
  await page.waitForFunction(() => Boolean(document.getElementById("pageLabel")), 30000);
  await sleep(4000);
  const sauTaiLai = { nhan: await nhan(), lit: await lit() };
  measurements.sauTaiLai = sauTaiLai;
  console.log("sauTaiLai:", JSON.stringify(sauTaiLai));
  if (sauTaiLai.nhan !== sauVe.nhan) fail(`tải lại trang thì nhảy từ "${sauVe.nhan}" về "${sauTaiLai.nhan}"`);
  await shoot("05-tai-lai-van-dung-trang.png", `Tải lại trang: vẫn "${sauTaiLai.nhan}", pixel sáng ${sauTaiLai.lit}`);

  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify({ base, tenSoNhap, capturedAt: new Date().toISOString(), problems, measurements, shots }, null, 2));

  await xoaSoTheoTen(page, tenSoNhap);
  await session.close();
  console.log(`\n${problems.length === 0 ? "PASS" : `FAIL (${problems.length})`} — bằng chứng tại ${outDir}`);
  if (problems.length) process.exit(1);
}

await main();
