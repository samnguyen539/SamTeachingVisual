import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { xuLyLuuDrive } from "./api-luu-drive.mjs";
import { taoCauHinh } from "./xac-thuc.mjs";
import { xuLyDangNhap, xuLyDangXuat, xacThucYeuCau } from "./api-dang-nhap.mjs";
import { xuLyApiSoTay } from "./api-so-tay.mjs";

const root = path.resolve(process.cwd(), process.argv.includes("--dist") ? "dist" : ".");
const port = Number(process.env.PORT || 4173);
const cauHinh = taoCauHinh(process.env);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

const duongDanCongKhai = new Set([
  "/dang-nhap",
  "/dang-nhap.html",
  "/api/dang-nhap",
  "/favicon.ico",
  "/icons/app-icon.svg",
  "/manifest.webmanifest"
]);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (cauHinh.thieu.length > 0 && cauHinh.bat) {
      response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        status: "CHUA_CAU_HINH_DANG_NHAP",
        message: "Máy chủ chưa cấu hình biến môi trường đăng nhập.",
        thieu: cauHinh.thieu
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/dang-nhap") {
      return await xuLyDangNhap(request, response, cauHinh);
    }
    if (request.method === "POST" && url.pathname === "/api/dang-xuat") {
      return xuLyDangXuat(request, response);
    }

    const { hopLe, taiKhoan } = xacThucYeuCau(request, cauHinh);

    if (url.pathname === "/dang-nhap" || url.pathname === "/dang-nhap.html") {
      if (hopLe && cauHinh.bat) {
        response.writeHead(302, { location: "/" });
        response.end();
        return;
      }
      const dangNhapFile = path.join(root, "dang-nhap.html");
      const body = await readFile(dangNhapFile);
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache"
      });
      response.end(body);
      return;
    }

    if (cauHinh.bat && !duongDanCongKhai.has(url.pathname)) {
      if (!hopLe) {
        if (url.pathname.startsWith("/api/")) {
          response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({
            status: "CHUA_DANG_NHAP",
            message: "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại."
          }));
          return;
        }
        const tiep = (url.pathname === "/" && !url.search) ? "" : `?tiep=${encodeURIComponent(url.pathname + url.search)}`;
        response.writeHead(302, { location: `/dang-nhap${tiep}` });
        response.end();
        return;
      }
    }

    if (url.pathname === "/api/luu-drive") {
      return await xuLyLuuDrive(request, response);
    }
    if (url.pathname === "/api/so-tay") {
      return await xuLyApiSoTay(request, response, taiKhoan);
    }

    let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    // `..` trong đường dẫn có thể trèo ra ngoài thư mục phục vụ — chặn tại đây.
    if (file !== root && !file.startsWith(root + path.sep)) file = path.join(root, "index.html");
    if (url.pathname === "/") file = path.join(root, "index.html");
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    } catch {
      file = path.join(root, "index.html");
    }
    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": mime[path.extname(file)] || "application/octet-stream",
      "cache-control": path.basename(file) === "config.js" ? "no-store" : "no-cache"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.message);
  }
});

server.listen(port, "0.0.0.0", () => console.log(`Sam Teaching Visual: http://localhost:${port}`));
