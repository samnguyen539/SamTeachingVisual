/**
 * Đăng nhập thật qua giao diện `/dang-nhap` bằng CDP, dùng chung cho các bộ smoke UI.
 *
 * Tài khoản/mật khẩu lấy từ biến môi trường, KHÔNG bao giờ nằm trong repo:
 *   SAM_BOARD_USER      (mặc định "samnguyen")
 *   SAM_BOARD_PASSWORD  (bắt buộc)
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function dangNhapQuaGiaoDien(page, base) {
  const taiKhoan = process.env.SAM_BOARD_USER || "samnguyen";
  const matKhau = process.env.SAM_BOARD_PASSWORD;
  if (!matKhau) {
    throw new Error("Thiếu biến môi trường SAM_BOARD_PASSWORD — bộ smoke không tự bịa mật khẩu.");
  }

  await page.send("Page.navigate", { url: `${base}/dang-nhap` });
  await page.waitForFunction(() => document.readyState === "complete", 30000);
  // Profile browser được tái dùng nên có thể đã còn cookie phiên: lúc đó
  // `/dang-nhap` tự đẩy về bảng và sẽ không bao giờ có form để điền.
  await page.waitForFunction(
    () => Boolean(document.getElementById("formDangNhap") || document.getElementById("boardCanvas")),
    20000
  );
  if (await page.evaluate(() => !document.getElementById("formDangNhap"))) {
    return { taiKhoan, daDangNhapSan: true };
  }
  async function go(id, text) {
    await page.evaluate(new Function(`document.getElementById(${JSON.stringify(id)}).focus();`));
    await page.send("Input.insertText", { text });
  }
  await go("taiKhoan", taiKhoan);
  await go("matKhau", matKhau);

  const nut = await page.evaluate(() => {
    const box = document.getElementById("nutDangNhap").getBoundingClientRect();
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
  });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: nut.x, y: nut.y, button: "left", buttons: 1, clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: nut.x, y: nut.y, button: "left", buttons: 0, clickCount: 1 });

  await page.waitForFunction(() => !document.getElementById("formDangNhap"), 30000);
  await sleep(400);
  return { taiKhoan, nut };
}

/** Xoá dữ liệu cục bộ của bảng từ một trang KHÁC trang bảng (bảng flush khi `pagehide`). */
export async function xoaDuLieuBang(page, base) {
  await page.send("Page.navigate", { url: `${base}/studio` });
  await page.waitForFunction(() => document.readyState === "complete", 30000);
  await page.evaluate(() => {
    try {
      localStorage.removeItem("sam-bang-den-so-tay");
      localStorage.removeItem("sam-bang-den-so");
      localStorage.removeItem("sam-bang-den-scene");
    } catch {}
  });
}
/**
 * Từ khi có đồng bộ máy chủ, xoá `localStorage` KHÔNG còn cho ra bảng trắng —
 * lần nạp sau sẽ kéo lại toàn bộ sổ từ máy chủ. Bộ smoke phải tự tạo một sổ
 * riêng để đo trên nền sạch, rồi tự xoá đi ở cuối.
 */
export async function taoSoSach(page, ten) {
  await page.waitForFunction(() => Boolean(document.getElementById("addNotebookBtn")), 20000);
  await page.evaluate(new Function(`window.prompt = () => ${JSON.stringify(ten)};`));
  await page.evaluate(() => document.getElementById("notebookBtn").click());
  await sleep(400);
  await page.evaluate(() => document.getElementById("addNotebookBtn").click());
  await sleep(800);
  await page.evaluate(() => {
    const manager = document.getElementById("notebookManager");
    if (!manager.classList.contains("ui-hidden")) document.getElementById("closeNotebookBtn").click();
  });
  await sleep(300);
  return page.evaluate(() => document.getElementById("notebookName").textContent.trim());
}

/** Đánh dấu xoá sổ của bộ smoke để không để rác lại trong kho của Sam. */
export async function xoaSoTheoTen(page, ten) {
  await page.evaluate(() => {
    window.confirm = () => true;
    document.getElementById("notebookBtn").click();
  });
  await sleep(400);
  await page.evaluate(new Function(`
    const rows = [...document.querySelectorAll("#notebookList .notebook-item")];
    const row = rows.find((item) => item.querySelector(".notebook-item-title")?.textContent.trim() === ${JSON.stringify(ten)});
    if (row) [...row.querySelectorAll("button")].find((button) => button.textContent.trim() === "Xoá").click();
  `));
  await sleep(500);
  await page.evaluate(() => {
    const manager = document.getElementById("notebookManager");
    if (!manager.classList.contains("ui-hidden")) document.getElementById("closeNotebookBtn").click();
  });
  await sleep(300);
  await page.evaluate(() => document.getElementById("syncNowBtn")?.click());
  await sleep(1500);
}
