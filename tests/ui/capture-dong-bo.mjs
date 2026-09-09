/**
 * Smoke bằng chứng ĐỒNG BỘ ĐA THIẾT BỊ.
 *
 * Mở HAI cửa sổ browser với HAI profile riêng biệt — hai `localStorage` khác
 * nhau, hai cookie khác nhau — đúng như Sam ngồi hai máy.
 *
 *   SAM_BOARD_PASSWORD=... node tests/ui/capture-dong-bo.mjs <base-url> <out-dir>
 */
import fs from "node:fs";
import path from "node:path";
import { launchWindowsGpuBrowser } from "file:///D:/New_System_AI/SamAnimationPhoto/tools/cdp-frame-capture.js";
import { dangNhapQuaGiaoDien } from "./dang-nhap-cdp.mjs";

const base = (process.argv[2] || "https://day.samnguyenphoto.com").replace(/\/$/, "");
const outDir = path.resolve(process.argv[3] || "report/UXQA/dong-bo");
fs.mkdirSync(outDir, { recursive: true });

const shots = [];
const problems = [];
const measurements = {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dau = Date.now().toString(36).slice(-5);
const tenMayA = `MayA ${dau}`;
const tenMayB = `MayB ${dau}`;

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

function taoMay(ten, session) {
  const page = session.page;
  return {
    ten,
    session,
    page,
    async shoot(file, expected) {
      await page.screenshot(path.join(outDir, file));
      shots.push({ file, may: ten, capturedAt: new Date().toISOString(), expected });
      console.log(`shot ${file} :: [${ten}] ${expected}`);
    },
    click: (id) => page.evaluate(new Function(`return document.getElementById(${JSON.stringify(id)}).click();`)),
    lit: () => page.evaluate(litCounter),
    tenSo: () => page.evaluate(() => document.getElementById("notebookName").textContent.trim()),
    trangThaiDongBo: () =>
      page.evaluate(() => {
        const element = document.getElementById("syncStatus");
        return { trangThai: element.dataset.trangThai, chu: element.textContent.trim() };
      }),
    danhSachSo: async () => {
      await page.evaluate(() => document.getElementById("notebookBtn").click());
      await sleep(500);
      const ten = await page.evaluate(() =>
        [...document.querySelectorAll("#notebookList .notebook-item-title")].map((element) => element.textContent.trim())
      );
      await page.evaluate(() => document.getElementById("closeNotebookBtn").click());
      await sleep(300);
      return ten;
    },
    async moBang() {
      await page.send("Page.navigate", { url: `${base}/` });
      await page.waitForFunction(() => document.readyState === "complete", 30000);
      await page.waitForFunction(() => Boolean(document.getElementById("boardCanvas")), 20000);
      await sleep(1500); // chờ vòng đồng bộ lúc nạp trang chạy xong
    },
    async doiTenSoDangMo(tenMoi) {
      await page.evaluate(new Function(`window.prompt = () => ${JSON.stringify(tenMoi)};`));
      await page.evaluate(() => document.getElementById("notebookBtn").click());
      await sleep(400);
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll("#notebookList .notebook-item")];
        const row = rows.find((item) => item.classList.contains("active")) || rows[0];
        [...row.querySelectorAll("button")].find((button) => button.textContent.trim() === "Đổi tên").click();
      });
      await sleep(400);
      await page.evaluate(() => document.getElementById("closeNotebookBtn").click());
      await sleep(300);
    },
    async ve(points) {
      await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: points[0][0], y: points[0][1], button: "left", buttons: 1, clickCount: 1 });
      for (const [x, y] of points.slice(1)) {
        await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
      }
      const last = points.at(-1);
      await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: last[0], y: last[1], button: "left", buttons: 0, clickCount: 1 });
      await sleep(250);
    },
    async dongBoTay() {
      await page.evaluate(() => document.getElementById("syncNowBtn").click());
      await page.waitForFunction(() => document.getElementById("syncStatus").dataset.trangThai !== "dang", 60000);
      await sleep(500);
    }
  };
}

const cung = (x0, y0, rong, cao, buoc = 26) =>
  Array.from({ length: buoc }, (_, index) => {
    const t = index / (buoc - 1);
    return [Math.round(x0 + rong * t), Math.round(y0 - Math.sin(t * Math.PI) * cao)];
  });

async function main() {
  const phienA = await launchWindowsGpuBrowser({ profileDir: path.join(outDir, ".profile-may-a"), width: 1440, height: 900 });
  const phienB = await launchWindowsGpuBrowser({ profileDir: path.join(outDir, ".profile-may-b"), width: 1440, height: 900 });
  const A = taoMay("Máy A", phienA);
  const B = taoMay("Máy B", phienB);

  try {
    // ── Máy A: đăng nhập, đặt tên sổ, vẽ ─────────────────────────────────────
    await dangNhapQuaGiaoDien(A.page, base);
    await A.moBang();

    // Sam yêu cầu thanh sổ mặc định ẨN, chỉ hiện khi bấm nút nhỏ dưới thanh công cụ.
    const thanhSoLucMo = await A.page.evaluate(() => {
      const bar = document.getElementById("notebookBar");
      const nut = document.getElementById("notebookToggleBtn");
      const hop = nut.getBoundingClientRect();
      return {
        barOpacity: getComputedStyle(bar).opacity,
        nutHien: getComputedStyle(nut).opacity !== "0" && hop.width > 0,
        nutRong: Math.round(hop.width),
        nutCao: Math.round(hop.height),
        nutTrongThanhCongCu: Boolean(nut.closest("#boardToolbar")),
        nhan: nut.textContent.trim()
      };
    });
    measurements.thanhSoLucMo = thanhSoLucMo;
    console.log("thanhSoLucMo:", JSON.stringify(thanhSoLucMo));
    if (thanhSoLucMo.barOpacity !== "0") fail(`mở trang lên mà thanh sổ đã hiện sẵn (opacity=${thanhSoLucMo.barOpacity})`);
    if (!thanhSoLucMo.nutHien) fail("không thấy nút nhỏ để hiện thanh sổ");
    if (!thanhSoLucMo.nutTrongThanhCongCu) fail("nút hiện thanh sổ không nằm trong thanh công cụ phía dưới");
    if (thanhSoLucMo.nutCao < 32) fail(`nút hiện thanh sổ cao chỉ ${thanhSoLucMo.nutCao}px, quá nhỏ để bấm`);
    await A.shoot("00a-thanh-so-an-mac-dinh.png", `Mở lên: thanh sổ ẩn (opacity ${thanhSoLucMo.barOpacity}), chỉ còn nút nhỏ "${thanhSoLucMo.nhan}" ${thanhSoLucMo.nutRong}x${thanhSoLucMo.nutCao} trong thanh công cụ`);

    await A.click("notebookToggleBtn");
    await sleep(500);
    const thanhSoSauBam = await A.page.evaluate(() => ({
      barOpacity: getComputedStyle(document.getElementById("notebookBar")).opacity,
      chu: document.getElementById("notebookBar").innerText.replace(/\s+/g, " ").trim(),
      nutActive: document.getElementById("notebookToggleBtn").classList.contains("active")
    }));
    measurements.thanhSoSauBam = thanhSoSauBam;
    console.log("thanhSoSauBam:", JSON.stringify(thanhSoSauBam));
    if (thanhSoSauBam.barOpacity === "0") fail("bấm nút nhỏ mà thanh sổ vẫn không hiện");
    if (!thanhSoSauBam.nutActive) fail("nút nhỏ không sáng lên khi thanh sổ đang hiện");
    await A.shoot("00b-bam-nut-nho-thanh-so-hien.png", `Bấm nút nhỏ: thanh sổ hiện, đọc được "${thanhSoSauBam.chu}"`);

    await A.click("notebookToggleBtn");
    await sleep(500);
    const thanhSoAnLai = await A.page.evaluate(() => getComputedStyle(document.getElementById("notebookBar")).opacity);
    measurements.thanhSoAnLai = thanhSoAnLai;
    if (thanhSoAnLai !== "0") fail(`bấm lần nữa mà thanh sổ không ẩn lại (opacity=${thanhSoAnLai})`);
    await A.click("notebookToggleBtn");
    await sleep(400);
    const trangThaiA = await A.trangThaiDongBo();
    measurements.trangThaiA = trangThaiA;
    console.log("trangThaiA:", JSON.stringify(trangThaiA));
    if (trangThaiA.trangThai !== "xong") fail(`Máy A nạp trang xong mà trạng thái đồng bộ là "${trangThaiA.chu}"`);

    const soBanDau = await A.danhSachSo();
    measurements.soBanDau = soBanDau;
    console.log("soBanDau:", JSON.stringify(soBanDau));

    await A.doiTenSoDangMo(tenMayA);
    await A.ve(cung(200, 480, 900, 260));
    const litA = await A.lit();
    await A.dongBoTay();
    const sauDongBoA = await A.trangThaiDongBo();
    measurements.mayA = { tenSo: await A.tenSo(), lit: litA, sauDongBo: sauDongBoA };
    console.log("mayA:", JSON.stringify(measurements.mayA));
    if (litA <= 0) fail("Máy A vẽ không ra nét");
    if (sauDongBoA.trangThai !== "xong") fail(`Máy A đồng bộ tay không xong: "${sauDongBoA.chu}"`);
    await A.shoot("01-may-a-ve-va-dong-bo.png", `Máy A: sổ "${tenMayA}", pixel sáng ${litA}, trạng thái "${sauDongBoA.chu}"`);

    // ── Máy B: máy hoàn toàn mới, phải THẤY dữ liệu của máy A ────────────────
    await dangNhapQuaGiaoDien(B.page, base);
    await B.moBang();
    const soTrenB = await B.danhSachSo();
    const trangThaiB = await B.trangThaiDongBo();
    measurements.mayB = { danhSachSo: soTrenB, trangThai: trangThaiB };
    console.log("mayB:", JSON.stringify(measurements.mayB));
    if (!soTrenB.includes(tenMayA)) {
      fail(`ĐÂY LÀ LỖI SAM BÁO: máy B không thấy sổ "${tenMayA}" của máy A. Máy B chỉ thấy: ${soTrenB.join(" | ")}`);
    }
    await B.shoot("02-may-b-thay-so-cua-may-a.png", `Máy B (profile riêng) thấy: ${soTrenB.join(" | ")}`);

    // Máy B mở đúng sổ của máy A và phải thấy đúng nét vẽ.
    await B.page.evaluate(new Function(`
      const rows = [...document.querySelectorAll("#notebookList .notebook-item")];
      document.getElementById("notebookBtn").click();
    `));
    await sleep(400);
    await B.page.evaluate(new Function(`
      const rows = [...document.querySelectorAll("#notebookList .notebook-item")];
      const row = rows.find((item) => item.querySelector(".notebook-item-title")?.textContent.trim() === ${JSON.stringify(tenMayA)});
      [...row.querySelectorAll("button")].find((button) => button.textContent.trim() === "Mở").click();
    `));
    await sleep(800);
    const litBcuaA = await B.lit();
    measurements.netCuaAtrenB = { lit: litBcuaA, chenhLech: Math.abs(litBcuaA - litA) };
    console.log("netCuaAtrenB:", JSON.stringify(measurements.netCuaAtrenB));
    if (Math.abs(litBcuaA - litA) > 200) fail(`nét của máy A hiện sai trên máy B: ${litA} -> ${litBcuaA} pixel sáng`);
    await B.shoot("03-may-b-mo-so-cua-may-a.png", `Máy B mở sổ "${tenMayA}", pixel sáng ${litBcuaA} (máy A là ${litA})`);

    // ── Máy B tạo sổ riêng rồi vẽ; máy A phải nhận được ──────────────────────
    await B.page.evaluate(new Function(`window.prompt = () => ${JSON.stringify(tenMayB)};`));
    await B.click("notebookBtn");
    await sleep(400);
    await B.click("addNotebookBtn");
    await sleep(700);
    await B.ve([[300, 620], [620, 500], [940, 660], [1180, 520]]);
    const litB = await B.lit();
    await B.dongBoTay();
    measurements.soRiengB = { ten: await B.tenSo(), lit: litB };
    console.log("soRiengB:", JSON.stringify(measurements.soRiengB));
    if ((await B.tenSo()) !== tenMayB) fail(`máy B tạo sổ không đúng tên: "${await B.tenSo()}"`);
    await B.shoot("04-may-b-tao-so-rieng.png", `Máy B tạo sổ "${tenMayB}", pixel sáng ${litB}`);

    await A.dongBoTay();
    const soTrenA = await A.danhSachSo();
    measurements.soTrenA = soTrenA;
    console.log("soTrenA:", JSON.stringify(soTrenA));
    if (!soTrenA.includes(tenMayB)) fail(`máy A không nhận được sổ "${tenMayB}" của máy B. Máy A thấy: ${soTrenA.join(" | ")}`);
    if (!soTrenA.includes(tenMayA)) fail(`máy A mất chính sổ của mình: ${soTrenA.join(" | ")}`);
    await A.shoot("05-may-a-nhan-so-cua-may-b.png", `Máy A sau đồng bộ thấy: ${soTrenA.join(" | ")}`);

    // ── Hai máy sửa cùng một sổ: không được mất nét của ai ───────────────────
    await A.ve(cung(250, 760, 800, 120));
    const litA2 = await A.lit();
    await A.dongBoTay();
    await B.page.evaluate(new Function(`
      document.getElementById("notebookBtn").click();
    `));
    await sleep(400);
    await B.page.evaluate(new Function(`
      const rows = [...document.querySelectorAll("#notebookList .notebook-item")];
      const row = rows.find((item) => item.querySelector(".notebook-item-title")?.textContent.trim() === ${JSON.stringify(tenMayA)});
      [...row.querySelectorAll("button")].find((button) => button.textContent.trim() === "Mở").click();
    `));
    await sleep(600);
    await B.dongBoTay();
    await sleep(600);
    const litBsauA2 = await B.lit();
    measurements.suaChung = { litA2, litBsauA2 };
    console.log("suaChung:", JSON.stringify(measurements.suaChung));
    if (Math.abs(litBsauA2 - litA2) > 300) {
      fail(`máy A vẽ thêm rồi đồng bộ, máy B nhận sai: A=${litA2} B=${litBsauA2} pixel sáng`);
    }
    await B.shoot("06-may-b-nhan-net-moi-cua-may-a.png", `Máy B nhận nét mới máy A vừa vẽ: ${litBsauA2} pixel sáng (máy A ${litA2})`);

    // ── Xoá trên một máy phải lan sang máy kia (bia mộ) ──────────────────────
    await A.page.evaluate(() => {
      window.confirm = () => true;
      document.getElementById("notebookBtn").click();
    });
    await sleep(400);
    await A.page.evaluate(new Function(`
      const rows = [...document.querySelectorAll("#notebookList .notebook-item")];
      const row = rows.find((item) => item.querySelector(".notebook-item-title")?.textContent.trim() === ${JSON.stringify(tenMayB)});
      [...row.querySelectorAll("button")].find((button) => button.textContent.trim() === "Xoá").click();
    `));
    await sleep(500);
    await A.page.evaluate(() => document.getElementById("closeNotebookBtn").click());
    await sleep(300);
    await A.dongBoTay();
    await B.dongBoTay();
    const soTrenBsauXoa = await B.danhSachSo();
    measurements.sauXoa = { soTrenBsauXoa };
    console.log("sauXoa:", JSON.stringify(measurements.sauXoa));
    if (soTrenBsauXoa.includes(tenMayB)) {
      fail(`máy A xoá sổ "${tenMayB}" nhưng máy B vẫn còn thấy: ${soTrenBsauXoa.join(" | ")}`);
    }
    if (!soTrenBsauXoa.includes(tenMayA)) fail(`xoá một sổ mà sổ khác cũng biến mất: ${soTrenBsauXoa.join(" | ")}`);
    await B.shoot("07-xoa-tren-may-a-lan-sang-may-b.png", `Sau khi máy A xoá "${tenMayB}", máy B thấy: ${soTrenBsauXoa.join(" | ")}`);

    // ── Mất mạng: vẫn vẽ được, không mất dữ liệu, tự phục hồi ────────────────
    await A.page.send("Network.enable");
    await A.page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await A.ve(cung(300, 300, 700, 150));
    const litAoffline = await A.lit();
    await A.page.evaluate(() => document.getElementById("syncNowBtn").click());
    await sleep(2500);
    const trangThaiOffline = await A.trangThaiDongBo();
    measurements.offline = { litAoffline, trangThaiOffline };
    console.log("offline:", JSON.stringify(measurements.offline));
    if (litAoffline <= 0) fail("mất mạng thì không vẽ được nữa");
    if (trangThaiOffline.trangThai !== "loi") fail(`mất mạng mà trạng thái vẫn là "${trangThaiOffline.chu}" — phải báo chưa đồng bộ`);
    await A.shoot("08-mat-mang-van-ve-duoc.png", `Mất mạng: vẫn vẽ được (${litAoffline} pixel sáng), trạng thái "${trangThaiOffline.chu}"`);

    await A.page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await sleep(500);
    await A.dongBoTay();
    const trangThaiOnline = await A.trangThaiDongBo();
    const litAsauOnline = await A.lit();
    measurements.online = { trangThaiOnline, litAsauOnline };
    console.log("online:", JSON.stringify(measurements.online));
    if (trangThaiOnline.trangThai !== "xong") fail(`có mạng lại mà không đồng bộ được: "${trangThaiOnline.chu}"`);
    if (litAsauOnline < litAoffline - 300) fail(`đồng bộ lại làm mất nét vẽ lúc offline: ${litAoffline} -> ${litAsauOnline}`);
    await A.shoot("09-co-mang-lai-dong-bo-duoc.png", `Có mạng lại: "${trangThaiOnline.chu}", nét offline còn nguyên (${litAsauOnline} pixel sáng)`);

    // Máy B phải nhận được nét Sam vẽ lúc máy A mất mạng.
    await B.dongBoTay();
    await sleep(500);
    const litBcuoi = await B.lit();
    measurements.litBcuoi = litBcuoi;
    console.log("litBcuoi:", litBcuoi);
    if (Math.abs(litBcuoi - litAsauOnline) > 300) {
      fail(`nét vẽ lúc mất mạng không sang được máy B: A=${litAsauOnline} B=${litBcuoi}`);
    }
    await B.shoot("10-may-b-nhan-net-ve-luc-mat-mang.png", `Máy B nhận nét máy A vẽ lúc mất mạng: ${litBcuoi} pixel sáng (máy A ${litAsauOnline})`);

    // ── Không được đẻ ra sổ rác: kho chỉ được nhiều thêm đúng sổ hai máy tạo ──
    await A.dongBoTay();
    const soCuoi = await A.danhSachSo();
    const phatSinh = soCuoi.filter((ten) => !soBanDau.includes(ten));
    const rac = phatSinh.filter((ten) => ten !== tenMayA && ten !== tenMayB);
    measurements.soRac = { soBanDau, soCuoi, phatSinh, rac };
    console.log("soRac:", JSON.stringify(measurements.soRac));
    if (rac.length) {
      fail(`hai máy nối vào đã đẻ ra sổ rác: ${rac.join(" | ")} — sổ mặc định trống không được đẩy lên máy chủ`);
    }
    if (soCuoi.includes(tenMayB)) fail(`sổ "${tenMayB}" đã xoá mà vẫn hiện trên máy A: ${soCuoi.join(" | ")}`);
    await A.shoot("11-khong-de-ra-so-rac.png", `Trước: ${soBanDau.length} sổ · sau: ${soCuoi.length} sổ · phát sinh: ${phatSinh.join(" | ") || "không"}`);
  } finally {
    fs.writeFileSync(
      path.join(outDir, "index.json"),
      JSON.stringify({ base, tenMayA, tenMayB, capturedAt: new Date().toISOString(), problems, measurements, shots }, null, 2)
    );
    await phienA.close();
    await phienB.close();
  }

  console.log(`\n${problems.length === 0 ? "PASS" : `FAIL (${problems.length})`} — bằng chứng tại ${outDir}`);
  if (problems.length) process.exit(1);
}

await main();
