/**
 * Smoke bằng chứng UI cho: đăng nhập thật, quản lý sổ ghi chép, sao chép link,
 * và lưu Drive ĐÈ lên ảnh cũ của đúng trang.
 *
 *   SAM_BOARD_PASSWORD=... node tests/ui/capture-so-ghi-chep.mjs <base-url> <out-dir> [--drive]
 *
 * `--drive` mới thật sự ghi lên Google Drive.
 */
import fs from "node:fs";
import path from "node:path";
import { launchWindowsGpuBrowser } from "file:///D:/New_System_AI/SamAnimationPhoto/tools/cdp-frame-capture.js";
import { dangNhapQuaGiaoDien, xoaDuLieuBang, xoaSoTheoTen } from "./dang-nhap-cdp.mjs";

const base = (process.argv[2] || "https://day.samnguyenphoto.com").replace(/\/$/, "");
const outDir = path.resolve(process.argv[3] || "report/UXQA/so-ghi-chep");
const runDrive = process.argv.includes("--drive");
fs.mkdirSync(outDir, { recursive: true });

const shots = [];
const problems = [];
const measurements = {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tenSoThu = `QA Sổ ${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;

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

  async function shoot(file, expected) {
    await page.screenshot(path.join(outDir, file));
    shots.push({ file, capturedAt: new Date().toISOString(), expected });
    console.log(`shot ${file} :: ${expected}`);
  }
  const lit = () => page.evaluate(litCounter);
  const click = (id) => page.evaluate(new Function(`return document.getElementById(${JSON.stringify(id)}).click();`));
  const tenSoDangMo = () => page.evaluate(() => document.getElementById("notebookName").textContent.trim());
  const nhanTrang = () => page.evaluate(() => document.getElementById("pageLabel").textContent.trim());

  async function stroke(points) {
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: points[0][0], y: points[0][1], button: "left", buttons: 1, clickCount: 1 });
    for (const [x, y] of points.slice(1)) {
      await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
    }
    const last = points.at(-1);
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: last[0], y: last[1], button: "left", buttons: 0, clickCount: 1 });
    await sleep(200);
  }
  const wave = (x0, y0, width, amplitude, steps = 30) =>
    Array.from({ length: steps }, (_, index) => {
      const t = index / (steps - 1);
      return [Math.round(x0 + width * t), Math.round(y0 + Math.sin(t * Math.PI * 2.2) * amplitude)];
    });

  // ── 1. Chưa đăng nhập thì không vào được bảng ───────────────────────────────
  // Profile browser được tái dùng và bước dọn cuối có đăng nhập lại, nên phải
  // xoá cookie TRƯỚC khi mở trang thì phép thử "chưa đăng nhập" mới có nghĩa.
  await page.send("Network.enable");
  await page.send("Network.clearBrowserCookies");
  await page.send("Page.navigate", { url: `${base}/` });
  await page.waitForFunction(() => document.readyState === "complete", 30000);
  await sleep(400);
  const chuaDangNhap = await page.evaluate(() => ({
    url: location.pathname,
    coForm: Boolean(document.getElementById("formDangNhap")),
    coBang: Boolean(document.getElementById("boardCanvas")),
    tieuDe: document.title
  }));
  measurements.chuaDangNhap = chuaDangNhap;
  console.log("chuaDangNhap:", JSON.stringify(chuaDangNhap));
  if (chuaDangNhap.coBang) fail("chưa đăng nhập mà vẫn vào thẳng được bảng đen");
  if (!chuaDangNhap.coForm) fail(`chưa đăng nhập nhưng không thấy form đăng nhập (đang ở ${chuaDangNhap.url})`);
  await shoot("01-chua-dang-nhap-bi-chan.png", `Vào "/" khi chưa đăng nhập thì bị đẩy sang ${chuaDangNhap.url}, có form đăng nhập`);

  // ── 2. Sai mật khẩu phải bị từ chối ─────────────────────────────────────────
  await page.evaluate(() => {
    document.getElementById("taiKhoan").focus();
  });
  await page.send("Input.insertText", { text: process.env.SAM_BOARD_USER || "samnguyen" });
  await page.evaluate(() => document.getElementById("matKhau").focus());
  await page.send("Input.insertText", { text: "mat-khau-sai-cua-bo-test" });
  await click("nutDangNhap");
  await page.waitForFunction(() => document.getElementById("loiDangNhap").textContent.trim().length > 0, 20000);
  const loi = await page.evaluate(() => ({
    thongBao: document.getElementById("loiDangNhap").textContent.trim(),
    conForm: Boolean(document.getElementById("formDangNhap"))
  }));
  measurements.saiMatKhau = loi;
  console.log("saiMatKhau:", JSON.stringify(loi));
  if (!loi.conForm) fail("sai mật khẩu mà vẫn rời khỏi trang đăng nhập");
  if (!/[Ss]ai/.test(loi.thongBao)) fail(`thông báo lỗi không rõ ràng: "${loi.thongBao}"`);
  await shoot("02-sai-mat-khau.png", `Sai mật khẩu bị chặn, báo: "${loi.thongBao}"`);

  // ── 3. Đăng nhập thật qua giao diện ─────────────────────────────────────────
  const phien = await dangNhapQuaGiaoDien(page, base);
  const sauDangNhap = await page.evaluate(() => ({
    coBang: Boolean(document.getElementById("boardCanvas")),
    tenSo: document.getElementById("notebookName")?.textContent.trim(),
    tieuDe: document.title
  }));
  measurements.sauDangNhap = sauDangNhap;
  console.log("sauDangNhap:", JSON.stringify(sauDangNhap));
  if (!sauDangNhap.coBang) fail("đăng nhập đúng nhưng không vào được bảng");
  await shoot("03-dang-nhap-thanh-cong.png", `Đăng nhập bằng tài khoản "${phien.taiKhoan}" vào thẳng bảng, sổ đang mở "${sauDangNhap.tenSo}"`);

  // ── 4. Sổ mặc định phải là SamNguyen 1 ──────────────────────────────────────
  // Từ khi có đồng bộ máy chủ, xoá localStorage KHÔNG còn cho ra kho trống —
  // lần nạp sau kéo lại toàn bộ sổ. Nên chỗ này kiểm luật đặt tên chứ không
  // kiểm "sổ đầu tiên phải tên SamNguyen 1".
  await xoaDuLieuBang(page, base);
  await page.send("Page.navigate", { url: `${base}/` });
  await page.waitForFunction(() => Boolean(document.getElementById("notebookName")), 20000);
  await sleep(1500);
  const soMacDinh = await tenSoDangMo();
  measurements.soMacDinh = soMacDinh;
  console.log("soMacDinh:", soMacDinh);
  await stroke(wave(200, 320, 800, 90));
  await shoot("04-so-mac-dinh-samnguyen-1.png", `Máy vừa xoá dữ liệu cục bộ vẫn kéo lại được sổ từ máy chủ, đang mở "${soMacDinh}"`);

  // ── 5. Tạo sổ mới: bỏ trống tên thì tự sinh SamNguyen 2 ─────────────────────
  await page.evaluate(() => {
    window.__promptDaHoi = [];
    window.prompt = (cauHoi, macDinh) => {
      window.__promptDaHoi.push({ cauHoi, macDinh });
      return ""; // bỏ trống — phải rơi về tên mặc định
    };
  });
  await click("notebookBtn");
  await sleep(400);
  await click("addNotebookBtn");
  await sleep(600);
  const soThuHai = await tenSoDangMo();
  const promptDaHoi = await page.evaluate(() => window.__promptDaHoi);
  measurements.soThuHai = { ten: soThuHai, promptDaHoi };
  console.log("soThuHai:", JSON.stringify(measurements.soThuHai));
  if (!/^SamNguyen \d+$/.test(soThuHai)) fail(`bỏ trống tên thì sổ mới phải mang tên mặc định "SamNguyen <số>", đo được "${soThuHai}"`);
  if (promptDaHoi[0]?.macDinh !== soThuHai) fail(`ô nhập tên phải điền sẵn đúng tên mặc định "${soThuHai}", đo được "${promptDaHoi[0]?.macDinh}"`);
  const litSoMoi = await lit();
  if (litSoMoi !== 0) fail(`sổ mới phải trắng, còn ${litSoMoi} pixel sáng`);
  await stroke([[300, 560], [600, 460], [900, 600], [1150, 480]]);
  await shoot("05-so-moi-samnguyen-2.png", `Bỏ trống tên → tự sinh "${soThuHai}", bảng trắng rồi vẽ nét riêng`);

  // ── 6. Đổi tên sổ ───────────────────────────────────────────────────────────
  await page.evaluate(new Function(`window.prompt = () => ${JSON.stringify(tenSoThu)};`));
  await click("notebookBtn");
  await sleep(400);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#notebookList .notebook-item")];
    const row = rows.find((item) => item.classList.contains("active")) || rows[0];
    [...row.querySelectorAll("button")].find((button) => button.textContent.trim() === "Đổi tên").click();
  });
  await sleep(500);
  const sauDoiTen = await page.evaluate(() => ({
    tenTrenThanh: document.getElementById("notebookName").textContent.trim(),
    danhSach: [...document.querySelectorAll("#notebookList .notebook-item-title")].map((element) => element.textContent.trim())
  }));
  measurements.doiTen = sauDoiTen;
  console.log("doiTen:", JSON.stringify(sauDoiTen));
  if (sauDoiTen.tenTrenThanh !== tenSoThu) fail(`đổi tên không ăn: thanh sổ đang hiện "${sauDoiTen.tenTrenThanh}"`);
  if (!sauDoiTen.danhSach.includes("SamNguyen 1")) fail(`sổ đầu tiên biến mất khỏi danh sách: ${sauDoiTen.danhSach.join(" | ")}`);
  await shoot("06-quan-ly-so-doi-ten.png", `Trình quản lý sổ: ${sauDoiTen.danhSach.join(" | ")}`);

  // ── 7. Chuyển qua lại giữa hai sổ, nét phải đúng của từng sổ ────────────────
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#notebookList .notebook-item")];
    const row = rows.find((item) => item.querySelector(".notebook-item-title")?.textContent.trim() === "SamNguyen 1");
    [...row.querySelectorAll("button")].find((button) => button.textContent.trim() === "Mở").click();
  });
  await sleep(600);
  const veSoMot = { ten: await tenSoDangMo(), lit: await lit(), trang: await nhanTrang() };
  measurements.veSoMot = veSoMot;
  console.log("veSoMot:", JSON.stringify(veSoMot));
  if (veSoMot.ten !== "SamNguyen 1") fail(`mở lại sổ đầu không ăn, đang ở "${veSoMot.ten}"`);
  if (veSoMot.lit <= 0) fail("mở lại sổ đầu thì mất nét đã vẽ");
  await shoot("07-chuyen-so-net-rieng.png", `Về sổ "${veSoMot.ten}", ${veSoMot.trang}, pixel sáng ${veSoMot.lit} — nét riêng của sổ này`);

  // ── 8. Ba thanh trên đỉnh không được đè nhau ────────────────────────────────
  for (const [ten, rong, cao] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width: rong, height: cao, deviceScaleFactor: 1, mobile: ten === "mobile" });
    await sleep(400);
    const chong = await page.evaluate(() => {
      const hop = (id) => document.getElementById(id).getBoundingClientRect();
      const giao = (a, b) => {
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return x > 0 && y > 0 ? Math.round(Math.min(x, y)) : 0;
      };
      const so = hop("notebookBar");
      const trang = hop("pageBar");
      const goiY = hop("boardHint");
      return {
        soVsTrang: giao(so, trang),
        soVsGoiY: giao(so, goiY),
        trangVsGoiY: giao(trang, goiY),
        soTrongKhung: so.left >= -1 && so.right <= window.innerWidth + 1,
        tranNgang: document.documentElement.scrollWidth - window.innerWidth
      };
    });
    measurements[`chong_${ten}`] = chong;
    console.log(`chong_${ten}:`, JSON.stringify(chong));
    if (chong.soVsTrang > 0) fail(`${ten}: thanh sổ đè thanh trang ${chong.soVsTrang}px`);
    if (chong.soVsGoiY > 0) fail(`${ten}: thanh sổ đè dòng gợi ý ${chong.soVsGoiY}px`);
    if (chong.trangVsGoiY > 0) fail(`${ten}: thanh trang đè dòng gợi ý ${chong.trangVsGoiY}px`);
    if (!chong.soTrongKhung) fail(`${ten}: thanh sổ nằm ngoài khung`);
    if (chong.tranNgang > 0) fail(`${ten}: tràn ngang ${chong.tranNgang}px`);
    await shoot(`08-${ten}-ba-thanh-khong-de-nhau.png`, `${ten} ${rong}x${cao}: sổ/trang/gợi ý không đè nhau, tràn ngang ${chong.tranNgang}px`);
  }
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);

  // ── 9. Lưu Drive lần 1, sao chép link, vẽ thêm rồi lưu lần 2 phải ĐÈ ────────
  if (runDrive) {
    async function luuDrive() {
      await page.evaluate(() => {
        document.getElementById("toastMessage").textContent = "";
        document.getElementById("boardToast").classList.add("ui-hidden");
      });
      await click("saveDriveBtn");
      await page.waitForFunction(
        () => !document.getElementById("boardToast").classList.contains("ui-hidden") && document.getElementById("toastMessage").innerText.trim().length > 0,
        180000
      );
      await sleep(800);
      return page.evaluate(() => ({
        message: document.getElementById("toastMessage").innerText.replace(/\s+/g, " ").trim(),
        links: [...document.querySelectorAll("#toastActions a")].map((anchor) => anchor.href),
        nhanHanhDong: [...document.querySelectorAll("#toastActions a, #toastActions button")].map((element) => element.innerText.trim())
      }));
    }

    const lan1 = await luuDrive();
    measurements.luuLan1 = lan1;
    console.log("luuLan1:", JSON.stringify(lan1));
    if (!/Đã lưu/.test(lan1.message)) fail(`lưu Drive lần 1 không báo thành công: "${lan1.message}"`);
    if (!lan1.links.some((href) => href.includes("drive.google.com"))) fail("lưu lần 1 không có link thư mục Drive");
    if (!lan1.nhanHanhDong.includes("Sao chép link")) fail(`toast thiếu nút "Sao chép link", chỉ có: ${lan1.nhanHanhDong.join(", ")}`);
    await shoot("09-luu-drive-lan-1.png", `Lần 1: "${lan1.message}" · ${lan1.links.join(" ")}`);

    // Sao chép link rồi đọc lại clipboard để chắc chắn đúng chuỗi.
    await page.send("Browser.grantPermissions", { origin: base, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
    const nutCopy = await page.evaluate(() => {
      const button = document.getElementById("copyDriveLinkBtn");
      return { disabled: button.disabled, nhan: button.textContent.trim() };
    });
    if (nutCopy.disabled) fail("đã lưu Drive xong mà nút Sao chép link vẫn bị khoá");
    await click("copyDriveLinkBtn");
    await sleep(600);
    const clipboard = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch (error) {
        return `LOI:${error.message}`;
      }
    });
    const nhanSauCopy = await page.evaluate(() => document.getElementById("copyDriveLinkBtn").textContent.trim());
    measurements.copyLink = { nutCopy, clipboard, nhanSauCopy };
    console.log("copyLink:", JSON.stringify(measurements.copyLink));
    if (!String(clipboard).includes("drive.google.com/drive/folders/")) {
      fail(`bấm Sao chép link nhưng clipboard không chứa link thư mục Drive: "${clipboard}"`);
    }
    if (!/[Đđ]ã sao chép/.test(nhanSauCopy)) fail(`nút không phản hồi sau khi sao chép, nhãn đang là "${nhanSauCopy}"`);
    await shoot("10-sao-chep-link.png", `Clipboard đọc lại được: ${clipboard} · nhãn nút "${nhanSauCopy}"`);

    // Vẽ thêm vào trang đang mở rồi lưu lại — phải là ĐÈ, không đẻ file mới.
    await stroke(wave(250, 700, 700, 50));
    const lan2 = await luuDrive();
    measurements.luuLan2 = lan2;
    console.log("luuLan2:", JSON.stringify(lan2));
    if (!/Đã lưu/.test(lan2.message)) fail(`lưu Drive lần 2 không báo thành công: "${lan2.message}"`);
    if (!/cập nhật/i.test(lan2.message)) {
      fail(`vẽ thêm rồi lưu lại phải báo có trang ĐƯỢC CẬP NHẬT ĐÈ, thông báo đang là: "${lan2.message}"`);
    }
    await shoot("11-luu-lan-2-de-len-anh-cu.png", `Lần 2 sau khi vẽ thêm: "${lan2.message}"`);
  }

  // ── 10. Đăng xuất ───────────────────────────────────────────────────────────
  await click("logoutBtn");
  await page.waitForFunction(() => Boolean(document.getElementById("formDangNhap")), 20000);
  const sauDangXuat = await page.evaluate(() => ({ duongDan: location.pathname, coForm: Boolean(document.getElementById("formDangNhap")) }));
  measurements.sauDangXuat = sauDangXuat;
  if (!sauDangXuat.coForm) fail("bấm Đăng xuất không quay về trang đăng nhập");
  const vaoLaiSauDangXuat = await page.evaluate(async (diaChi) => {
    const response = await fetch(diaChi, { redirect: "manual" });
    return response.status;
  }, `${base}/board.html`);
  measurements.vaoLaiSauDangXuat = vaoLaiSauDangXuat;
  console.log("sauDangXuat:", JSON.stringify(measurements.sauDangXuat), "vaoLai:", vaoLaiSauDangXuat);
  if (![0, 302, 401].includes(vaoLaiSauDangXuat)) fail(`đăng xuất rồi vẫn lấy được /board.html (HTTP ${vaoLaiSauDangXuat})`);
  await shoot("12-dang-xuat.png", `Đăng xuất về ${sauDangXuat.duongDan}, gọi lại /board.html trả HTTP ${vaoLaiSauDangXuat}`);

  fs.writeFileSync(
    path.join(outDir, "index.json"),
    JSON.stringify({ base, runDrive, tenSoThu, capturedAt: new Date().toISOString(), problems, measurements, shots }, null, 2)
  );

  // Dọn sổ do chính bộ smoke tạo ra, đừng để rác trong kho thật của Sam.
  await dangNhapQuaGiaoDien(page, base);
  await page.send("Page.navigate", { url: `${base}/` });
  await page.waitForFunction(() => Boolean(document.getElementById("notebookBtn")), 20000);
  await sleep(1500);
  await xoaSoTheoTen(page, tenSoThu);
  await xoaSoTheoTen(page, measurements.soThuHai?.ten ?? "");

  await session.close();
  console.log(`\n${problems.length === 0 ? "PASS" : `FAIL (${problems.length})`} — bằng chứng tại ${outDir}`);
  if (problems.length) process.exit(1);
}

await main();
