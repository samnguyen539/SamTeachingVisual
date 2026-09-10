import crypto from "node:crypto";

/**
 * Băm mật khẩu bằng scrypt.
 * Định dạng lưu: scrypt$<muối hex>$<băm hex>
 */
export function bamMatKhau(matKhau, muoi = crypto.randomBytes(16).toString("hex")) {
  if (typeof matKhau !== "string" || !matKhau) {
    throw new Error("Mật khẩu phải là chuỗi không rỗng.");
  }
  const muoiStr = typeof muoi === "string" ? muoi : Buffer.from(muoi).toString("hex");
  const bamBuf = crypto.scryptSync(matKhau, muoiStr, 64);
  return `scrypt$${muoiStr}$${bamBuf.toString("hex")}`;
}

/**
 * Kiểm tra mật khẩu đối chiếu với chuỗi scrypt đã lưu.
 * Bắt buộc crypto.timingSafeEqual trên Buffer cùng độ dài.
 * Trả về false khi sai định dạng hoặc không khớp, không ném ngoại lệ.
 */
export function kiemTraMatKhau(matKhau, chuoiLuu) {
  if (typeof matKhau !== "string" || typeof chuoiLuu !== "string") return false;
  const phan = chuoiLuu.split("$");
  if (phan.length !== 3 || phan[0] !== "scrypt") return false;
  const [, muoiHex, bamLuuHex] = phan;
  if (!muoiHex || !bamLuuHex) return false;
  try {
    const bamLuuBuf = Buffer.from(bamLuuHex, "hex");
    if (bamLuuBuf.length !== 64) return false;
    const bamMoiBuf = crypto.scryptSync(matKhau, muoiHex, 64);
    if (bamMoiBuf.length !== bamLuuBuf.length) return false;
    return crypto.timingSafeEqual(bamMoiBuf, bamLuuBuf);
  } catch {
    return false;
  }
}

/**
 * Ký phiên đăng nhập tạo token cookie.
 * Token dạng: <payload base64url>.<hmac base64url>
 */
export function kyPhien(taiKhoan, khoa, hanGiay = 2592000) {
  if (!taiKhoan || !khoa) throw new Error("Thiếu tài khoản hoặc khoá bí mật.");
  const exp = Math.floor(Date.now() / 1000) + hanGiay;
  const payloadJson = JSON.stringify({ u: taiKhoan, exp });
  const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64url");
  const hmacB64 = crypto.createHmac("sha256", khoa).update(payloadB64).digest("base64url");
  return `${payloadB64}.${hmacB64}`;
}

/**
 * Đọc và xác thực phiên đăng nhập.
 * So HMAC bằng timingSafeEqual, từ chối khi hết hạn hoặc sai chữ ký.
 */
export function docPhien(giaTri, khoa) {
  if (typeof giaTri !== "string" || !giaTri || typeof khoa !== "string" || !khoa) return null;
  const phan = giaTri.split(".");
  if (phan.length !== 2) return null;
  const [payloadB64, hmacB64] = phan;
  try {
    const expectedHmacB64 = crypto.createHmac("sha256", khoa).update(payloadB64).digest("base64url");
    const hmacBuf = Buffer.from(hmacB64);
    const expectedBuf = Buffer.from(expectedHmacB64);
    if (hmacBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(hmacBuf, expectedBuf)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof payload?.exp !== "number" || typeof payload?.u !== "string") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.u;
  } catch {
    return null;
  }
}

/**
 * Đọc giá trị của một cookie từ header Cookie.
 */
export function docCookie(headerCookie, ten) {
  if (typeof headerCookie !== "string" || !headerCookie || !ten) return null;
  const pairs = headerCookie.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    if (k === ten) {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return null;
}

/**
 * Tạo đối tượng cấu hình xác thực từ process.env.
 */
export function taoCauHinh(env = process.env) {
  if (env.SAM_BOARD_AUTH === "off") {
    return { bat: false, taiKhoan: "", bamLuu: "", khoa: "", thieu: [] };
  }
  const thieu = [];
  if (!env.SAM_BOARD_USER) thieu.push("SAM_BOARD_USER");
  if (!env.SAM_BOARD_PASS) thieu.push("SAM_BOARD_PASS");
  if (!env.SAM_BOARD_SECRET) thieu.push("SAM_BOARD_SECRET");
  return {
    bat: true,
    taiKhoan: env.SAM_BOARD_USER || "",
    bamLuu: env.SAM_BOARD_PASS || "",
    khoa: env.SAM_BOARD_SECRET || "",
    thieu
  };
}

// CLI: node scripts/xac-thuc.mjs --bam
if (process.argv.includes("--bam")) {
  const mk = process.env.MAT_KHAU;
  if (!mk) {
    console.error("LỖI: Biến môi trường MAT_KHAU không có hoặc rỗng.");
    process.exit(1);
  }
  console.log(bamMatKhau(mk));
}
