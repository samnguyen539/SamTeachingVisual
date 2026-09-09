import crypto from "node:crypto";
import { docCookie, docPhien, kiemTraMatKhau, kyPhien } from "./xac-thuc.mjs";

const rateLimitMap = new Map();

export function layIp(request) {
  const xff = request.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  return request.socket?.remoteAddress || "127.0.0.1";
}

function soSanhChuoiAnToan(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export async function docJsonBody(request, limitBytes = 4096) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        request.destroy();
        reject(new Error("QUA_TAI"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const str = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(str || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    request.on("error", reject);
  });
}

export async function xuLyDangNhap(request, response, cauHinh) {
  const start = Date.now();
  const ip = layIp(request);
  const now = Date.now();

  let record = rateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + 15 * 60 * 1000 };
    rateLimitMap.set(ip, record);
  }

  if (record.count >= 10) {
    response.writeHead(429, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      status: "THU_QUA_NHIEU",
      message: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút."
    }));
    return;
  }

  let body;
  try {
    body = await docJsonBody(request, 4096);
  } catch {
    record.count++;
    console.log(`${new Date().toISOString()} ${ip} DANG_NHAP_THAT_BAI`);
    const elapsed = Date.now() - start;
    if (elapsed < 250) await new Promise((r) => setTimeout(r, 250 - elapsed));
    response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "DU_LIEU_SAI", message: "Dữ liệu gửi lên không hợp lệ." }));
    return;
  }

  const taiKhoanDung = soSanhChuoiAnToan(body.taiKhoan, cauHinh.taiKhoan);
  const matKhauDung = kiemTraMatKhau(body.matKhau, cauHinh.bamLuu);
  const hopLe = taiKhoanDung && matKhauDung;

  const elapsed = Date.now() - start;
  if (elapsed < 250) await new Promise((r) => setTimeout(r, 250 - elapsed));

  if (!hopLe) {
    record.count++;
    console.log(`${new Date().toISOString()} ${ip} DANG_NHAP_THAT_BAI`);
    response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "SAI_THONG_TIN", message: "Sai tài khoản hoặc mật khẩu." }));
    return;
  }

  rateLimitMap.delete(ip);
  const token = kyPhien(cauHinh.taiKhoan, cauHinh.khoa);
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "set-cookie": `sam_bang_den=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`
  });
  response.end(JSON.stringify({ status: "OK" }));
}

export function xuLyDangXuat(request, response) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "set-cookie": "sam_bang_den=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
  });
  response.end(JSON.stringify({ status: "OK" }));
}

export function xacThucYeuCau(request, cauHinh) {
  if (!cauHinh.bat) return { hopLe: true, taiKhoan: cauHinh.taiKhoan || "samnguyen" };
  const rawCookie = request.headers.cookie || "";
  const token = docCookie(rawCookie, "sam_bang_den");
  if (!token) return { hopLe: false, taiKhoan: null };
  const taiKhoan = docPhien(token, cauHinh.khoa);
  return { hopLe: Boolean(taiKhoan), taiKhoan };
}
