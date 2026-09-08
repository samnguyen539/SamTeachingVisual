/**
 * Smoke bằng chứng cho ĐẦU VÀO CẢM ỨNG và BÚT trên trang bảng đen.
 *
 *   node tests/ui/capture-but-cam-ung.mjs <base-url> <out-dir>
 *
 * Mô phỏng qua CDP:
 *   - ngón tay: `Input.dispatchTouchEvent` (touchStart/Move/End)
 *   - bút:      `Input.dispatchMouseEvent` với `pointerType: "pen"` + `force` + `tiltX/tiltY`
 *   - hai ngón cùng lúc: hai `touchPoints` — giả cảnh kê bàn tay lên màn khi viết
 *
 * GIỚI HẠN PHẢI NÓI THẲNG: đây là sự kiện tổng hợp do trình duyệt sinh ra, nó
 * chứng minh đường xử lý Pointer Events của trang chạy đúng với `pointerType`
 * touch/pen. Nó KHÔNG thay được bút số hoá thật (đường cong lực nhấn của phần
 * cứng, chống kê tay ở tầng driver, hành vi riêng của Safari trên iPad).
 */
import fs from "node:fs";
import path from "node:path";
import { launchWindowsGpuBrowser } from "file:///D:/New_System_AI/SamAnimationPhoto/tools/cdp-frame-capture.js";

const base = (process.argv[2] || "https://day.samnguyenphoto.com").replace(/\/$/, "");
const outDir = path.resolve(process.argv[3] || "report/UXQA/but-cam-ung");
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
    width: 390,
    height: 844
  });
  const page = session.page;

  async function shoot(file, expected) {
    await page.screenshot(path.join(outDir, file));
    shots.push({ file, capturedAt: new Date().toISOString(), expected });
    console.log(`shot ${file} :: ${expected}`);
  }

  const lit = () => page.evaluate(litCounter);
  // Trang chỉ ghi sổ sau ~500ms (throttle), đọc sớm hơn là đếm thiếu đúng một nét.
  const strokeCount = async () => {
    await sleep(700);
    return page.evaluate(() => {
      try {
        const book = JSON.parse(localStorage.getItem("sam-bang-den-so"));
        return book.trang[book.trangHienTai].scene.items.length;
      } catch {
        return null;
      }
    });
  };

  // Máy điện thoại thật: viewport 390x844, có cảm ứng, dpr 2.
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  async function openFresh() {
    await page.send("Page.navigate", { url: `${base}/studio` });
    await page.waitForFunction(() => document.readyState === "complete", 30000);
    await page.evaluate(() => {
      try {
        localStorage.removeItem("sam-bang-den-so");
        localStorage.removeItem("sam-bang-den-scene");
      } catch {}
    });
    await page.send("Page.navigate", { url: `${base}/` });
    await page.waitForFunction(() => document.readyState === "complete", 30000);
    await page.waitForFunction(() => Boolean(document.getElementById("boardCanvas")), 15000);
    await sleep(500);
  }

  const arc = (x0, y0, width, amplitude, steps = 24) =>
    Array.from({ length: steps }, (_, index) => {
      const t = index / (steps - 1);
      return [Math.round(x0 + width * t), Math.round(y0 - Math.sin(t * Math.PI) * amplitude)];
    });

  // ── Ngón tay ────────────────────────────────────────────────────────────────
  async function touchStroke(points, { radius = 12, force = 0.6, id = 1 } = {}) {
    const point = ([x, y]) => ({ x, y, radiusX: radius, radiusY: radius, force, id });
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(points[0])] });
    for (const p of points.slice(1)) {
      await page.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(p)] });
    }
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(150);
  }

  // ── Bút ─────────────────────────────────────────────────────────────────────
  async function penStroke(points, { force = 0.75, tiltX = 12, tiltY = -8 } = {}) {
    const common = { button: "left", buttons: 1, pointerType: "pen", force, tiltX, tiltY, twist: 0, clickCount: 1 };
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: points[0][0], y: points[0][1], ...common });
    for (const [x, y] of points.slice(1)) {
      await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, ...common, clickCount: 0 });
    }
    const last = points.at(-1);
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: last[0], y: last[1], ...common, buttons: 0 });
    await sleep(150);
  }

  await openFresh();

  // Ghi lại `pointerType` mà trang thực sự nhận được — chứng cứ đường vào đúng loại.
  await page.evaluate(() => {
    window.__loaiConTro = [];
    document.getElementById("boardCanvas").addEventListener(
      "pointerdown",
      (event) => window.__loaiConTro.push({ loai: event.pointerType, luc: event.pressure, nghieng: [event.tiltX, event.tiltY] }),
      true
    );
  });

  const canvasInfo = await page.evaluate(() => {
    const canvas = document.getElementById("boardCanvas");
    return {
      touchAction: getComputedStyle(canvas).touchAction,
      overscroll: getComputedStyle(document.body).overscrollBehavior,
      canvasPixels: `${canvas.width}x${canvas.height}`,
      dpr: window.devicePixelRatio,
      maxTouchPoints: navigator.maxTouchPoints
    };
  });
  measurements.canvasInfo = canvasInfo;
  console.log("canvas:", JSON.stringify(canvasInfo));
  if (canvasInfo.touchAction !== "none") fail(`canvas touch-action = ${canvasInfo.touchAction} — cảm ứng sẽ cuộn trang thay vì vẽ`);
  if (canvasInfo.maxTouchPoints < 1) fail("trình duyệt không báo có cảm ứng — mô phỏng chưa bật");
  await shoot("01-mobile-bang-trong.png", `Bảng trống 390x844, dpr=${canvasInfo.dpr}, canvas ${canvasInfo.canvasPixels}, touch-action=${canvasInfo.touchAction}`);

  // 1. Vẽ bằng ngón tay.
  const litBefore = await lit();
  await touchStroke(arc(50, 420, 290, 120));
  const litTouch = await lit();
  const soNetTouch = await strokeCount();
  measurements.touch = { litBefore, litTouch, soNet: soNetTouch };
  console.log("touch:", JSON.stringify(measurements.touch));
  if (litTouch <= litBefore) fail("kéo ngón tay không tạo ra nét vẽ nào");
  if (soNetTouch !== 1) fail(`một lần kéo ngón tay phải sinh đúng 1 nét, đo được ${soNetTouch}`);
  await shoot("02-ve-bang-ngon-tay.png", `Nét vẽ bằng ngón tay, pixel sáng ${litBefore} -> ${litTouch}, số nét ${soNetTouch}`);

  // 2. Cảm ứng không được làm trang cuộn / nhảy.
  const scrolled = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollTop: document.documentElement.scrollTop,
    bodyTop: Math.round(document.body.getBoundingClientRect().top)
  }));
  measurements.scrolled = scrolled;
  console.log("scroll:", JSON.stringify(scrolled));
  if (scrolled.scrollY !== 0 || scrolled.scrollTop !== 0 || scrolled.bodyTop !== 0) {
    fail(`kéo ngón tay làm trang xê dịch: ${JSON.stringify(scrolled)}`);
  }

  // 3. Vẽ bằng bút, màu vàng cho dễ phân biệt.
  await page.evaluate(() => document.querySelector('#colorSwatches [data-color="#ffd43b"]').click());
  await penStroke(arc(50, 620, 290, 90));
  const litPen = await lit();
  const soNetPen = await strokeCount();
  const loaiConTro = await page.evaluate(() => window.__loaiConTro);
  measurements.pen = { litPen, soNet: soNetPen, loaiConTro };
  console.log("pen:", JSON.stringify(measurements.pen));
  if (litPen <= litTouch) fail("kéo bút không tạo ra nét vẽ nào");
  if (soNetPen !== 2) fail(`sau nét bút phải có 2 nét, đo được ${soNetPen}`);
  const loai = loaiConTro.map((item) => item.loai);
  if (!loai.includes("touch")) fail(`trang không nhận được pointerdown loại touch, chỉ có: ${loai.join(", ")}`);
  if (!loai.includes("pen")) fail(`trang không nhận được pointerdown loại pen, chỉ có: ${loai.join(", ")}`);
  const penEvent = loaiConTro.find((item) => item.loai === "pen");
  if (penEvent && !(penEvent.luc > 0)) fail(`sự kiện bút không mang lực nhấn (pressure=${penEvent.luc})`);
  await shoot("03-ve-bang-but.png", `Nét bút màu vàng, pixel sáng ${litTouch} -> ${litPen}, pointerType nhận được: ${loai.join(", ")}, lực nhấn bút ${penEvent?.luc}`);

  // 4. Kê bàn tay lên màn rồi viết bằng bút — cảnh thật nhất khi dạy trên tablet.
  // Bàn tay là một điểm cảm ứng bán kính lớn đang giữ, bút viết đồng thời.
  const truocKeTay = await strokeCount();
  const litTruocKeTay = await lit();
  const banTay = (x, y) => [{ x, y, radiusX: 46, radiusY: 46, force: 0.95, id: 31 }];
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: banTay(300, 300) });
  await sleep(80);
  await penStroke(arc(40, 240, 250, 70));
  for (let step = 1; step <= 6; step += 1) {
    await page.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: banTay(300 + step * 4, 300 + step * 2) });
  }
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const sauKeTay = await strokeCount();
  const litSauKeTay = await lit();
  measurements.keTay = { truocKeTay, sauKeTay, litTruocKeTay, litSauKeTay };
  console.log("keTay:", JSON.stringify(measurements.keTay));
  if (litSauKeTay <= litTruocKeTay) fail("kê tay lên màn rồi viết bút thì không ra nét nào");
  if (sauKeTay - truocKeTay > 2) {
    fail(`kê tay + viết bút sinh ${sauKeTay - truocKeTay} nét — bàn tay đang vẽ bừa lên bảng`);
  }
  await shoot("04-ke-tay-viet-but.png", `Kê bàn tay (bán kính 46) rồi viết bút: số nét ${truocKeTay} -> ${sauKeTay}, pixel sáng ${litTruocKeTay} -> ${litSauKeTay}`);

  // 5. Tẩy bằng ngón tay phải xoá được nét.
  await page.evaluate(() => document.getElementById("eraserBtn").click());
  await touchStroke(arc(50, 420, 290, 120), { radius: 18, force: 0.8, id: 3 });
  const litSauTay = await lit();
  const soNetSauTay = await strokeCount();
  measurements.tay = { litSauTay, soNetSauTay };
  console.log("tay:", JSON.stringify(measurements.tay));
  if (soNetSauTay >= sauKeTay) fail(`tẩy bằng ngón tay không xoá được nét nào (${sauKeTay} -> ${soNetSauTay})`);
  await shoot("05-tay-bang-ngon-tay.png", `Tẩy bằng ngón tay: số nét ${sauKeTay} -> ${soNetSauTay}, pixel sáng ${litSauTay}`);

  // 6. Bấm nút bằng ngón tay: ẩn UI rồi mở lại bằng chính viên pill.
  await page.evaluate(() => document.getElementById("penBtn").click());
  async function tap(id) {
    const box = await page.evaluate(new Function(`
      const b = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    `));
    const point = [{ x: box.x, y: box.y, radiusX: 12, radiusY: 12, force: 0.7, id: 21 }];
    // Chạm quá nhanh thì Chromium không tổng hợp ra `click` — phải giữ một nhịp.
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point });
    await sleep(90);
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(600);
    return box;
  }
  const hopAnUi = await tap("hideUiBtn");
  const daAn = await page.evaluate(() => getComputedStyle(document.getElementById("boardToolbar")).opacity);
  if (daAn !== "0") fail(`chạm nút "Ẩn thanh công cụ" bằng ngón tay không hiệu lực (opacity=${daAn})`);
  await shoot("06-cham-an-thanh-cong-cu.png", `Chạm ngón tay tại (${hopAnUi.x},${hopAnUi.y}) đã ẩn UI, chỉ còn pill mở lại`);

  const hopPill = await tap("boardRestoreBtn");
  const daMoLai = await page.evaluate(() => getComputedStyle(document.getElementById("boardToolbar")).opacity);
  measurements.chamNut = { hopAnUi, hopPill, daAn, daMoLai };
  if (daMoLai === "0") fail("chạm viên pill bằng ngón tay không mở lại được thanh công cụ");
  await shoot("07-cham-pill-mo-lai.png", `Chạm pill tại (${hopPill.x},${hopPill.y}) đã mở lại thanh công cụ, opacity=${daMoLai}`);

  fs.writeFileSync(
    path.join(outDir, "index.json"),
    JSON.stringify(
      {
        base,
        capturedAt: new Date().toISOString(),
        gioiHan:
          "Sự kiện cảm ứng/bút do CDP tổng hợp. Chứng minh đường Pointer Events của trang xử lý đúng pointerType touch/pen, KHÔNG thay được bút số hoá thật (đường cong lực nhấn phần cứng, chống kê tay ở tầng driver, Safari trên iPad).",
        problems,
        measurements,
        shots
      },
      null,
      2
    )
  );

  await session.close();
  console.log(`\n${problems.length === 0 ? "PASS" : `FAIL (${problems.length})`} — bằng chứng tại ${outDir}`);
  if (problems.length) process.exit(1);
}

await main();
