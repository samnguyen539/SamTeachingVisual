import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { hopNhatSoTay, chuanHoaSo } from "../src/hop-nhat-so-tay.mjs";

const MAX_BODY_BYTES = 25 * 1024 * 1024;
let dbInstance = null;
let currentDbPath = null;

function layThuMucDuLieu() {
  return path.resolve(process.cwd(), process.env.SAM_DATA_DIR || "./du-lieu");
}

export function layCSDL(dbPath = null) {
  const mucTieu = dbPath || path.join(layThuMucDuLieu(), "so-tay.sqlite");
  if (dbInstance && currentDbPath === mucTieu) return dbInstance;
  fs.mkdirSync(path.dirname(mucTieu), { recursive: true });
  dbInstance = new DatabaseSync(mucTieu);
  currentDbPath = mucTieu;
  dbInstance.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS so (tai_khoan TEXT NOT NULL, id TEXT NOT NULL, ten TEXT, tao_luc TEXT, sua_luc TEXT, da_xoa INTEGER DEFAULT 0, xoa_luc TEXT, drive_json TEXT, PRIMARY KEY (tai_khoan, id));
    CREATE TABLE IF NOT EXISTS trang (tai_khoan TEXT NOT NULL, so_id TEXT NOT NULL, id TEXT NOT NULL, tao_luc TEXT, sua_luc TEXT, da_xoa INTEGER DEFAULT 0, xoa_luc TEXT, rong REAL, cao REAL, net_json TEXT, PRIMARY KEY (tai_khoan, so_id, id));
    CREATE TABLE IF NOT EXISTS kho (tai_khoan TEXT PRIMARY KEY, rev INTEGER NOT NULL, cap_nhat_luc TEXT NOT NULL);
  `);
  return dbInstance;
}

export function lamSachTaiKhoan(tk) {
  return (typeof tk === "string" ? tk.replace(/[^a-zA-Z0-9._-]/g, "") : "") || "mac-dinh";
}

function docKho(db, tk) {
  const rowKho = db.prepare("SELECT rev, cap_nhat_luc FROM kho WHERE tai_khoan = ?").get(tk);
  if (!rowKho) return { rev: 0, capNhatLuc: null, so: [] };
  const rowsSo = db.prepare("SELECT * FROM so WHERE tai_khoan = ? ORDER BY tao_luc ASC, id ASC").all(tk);
  const rowsTrang = db.prepare("SELECT * FROM trang WHERE tai_khoan = ? ORDER BY tao_luc ASC, id ASC").all(tk);
  const trangTheoSo = new Map();
  for (const t of rowsTrang) {
    if (!trangTheoSo.has(t.so_id)) trangTheoSo.set(t.so_id, []);
    trangTheoSo.get(t.so_id).push({
      id: t.id, taoLuc: t.tao_luc, suaLuc: t.sua_luc, daXoa: Boolean(t.da_xoa), xoaLuc: t.xoa_luc || null,
      scene: { schemaVersion: 1, width: t.rong || 1920, height: t.cao || 1080, items: t.net_json ? JSON.parse(t.net_json) : [] }
    });
  }
  const so = rowsSo.map((s) => ({
    id: s.id, ten: s.ten, taoLuc: s.tao_luc, suaLuc: s.sua_luc, daXoa: Boolean(s.da_xoa),
    xoaLuc: s.xoa_luc || null, drive: s.drive_json ? JSON.parse(s.drive_json) : null,
    trang: trangTheoSo.get(s.id) || []
  }));
  return { rev: rowKho.rev, capNhatLuc: rowKho.cap_nhat_luc, so };
}

function chupLui(db) {
  const thuMucAnh = path.join(layThuMucDuLieu(), "anh-chup");
  fs.mkdirSync(thuMucAnh, { recursive: true });
  const danhSach = fs.readdirSync(thuMucAnh).filter((f) => /^so-tay-\d{8}-\d{6}\.sqlite$/.test(f)).sort();
  const motGioTruoc = Date.now() - 3600 * 1000;
  if (danhSach.length > 0) {
    const fileMoiNhat = path.join(thuMucAnh, danhSach[danhSach.length - 1]);
    if (fs.statSync(fileMoiNhat).mtimeMs > motGioTruoc) return;
  }
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date();
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const fileDich = path.join(thuMucAnh, `so-tay-${ts}.sqlite`);
  db.exec(`VACUUM INTO '${fileDich.replace(/'/g, "''")}'`);
  const danhSachMoi = fs.readdirSync(thuMucAnh).filter((f) => /^so-tay-\d{8}-\d{6}\.sqlite$/.test(f)).sort();
  while (danhSachMoi.length > 20) fs.unlinkSync(path.join(thuMucAnh, danhSachMoi.shift()));
}

function traJson(res, ma, duLieu) {
  res.writeHead(ma, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(duLieu));
}

export async function xuLyApiSoTay(request, response, taiKhoanRaw) {
  const tk = lamSachTaiKhoan(taiKhoanRaw);
  const db = layCSDL();

  if (request.method === "GET") {
    const kho = docKho(db, tk);
    console.log(`[so-tay] GET taiKhoan=${tk} soCount=${kho.so.length} rev=${kho.rev}`);
    return traJson(response, 200, kho);
  }
  if (request.method !== "PUT") {
    return traJson(response, 405, { status: "DU_LIEU_SAI", message: "Chỉ hỗ trợ GET và PUT." });
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      traJson(response, 413, { status: "QUA_LON", message: "Dung lượng dữ liệu vượt quá giới hạn 25 MB." });
      request.destroy();
      return;
    }
    chunks.push(chunk);
  }

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return traJson(response, 400, { status: "DU_LIEU_SAI", message: "Định dạng JSON không hợp lệ." });
  }

  const kiemTra = chuanHoaSo(body?.so);
  if (!kiemTra.hopLe) return traJson(response, 400, { status: "DU_LIEU_SAI", message: kiemTra.loi });

  try {
    db.exec("BEGIN IMMEDIATE");
    const hienTai = docKho(db, tk);
    const soHopNhat = hopNhatSoTay(hienTai.so, body.so);
    const revMoi = (hienTai.rev || 0) + 1;
    const tgMoi = new Date().toISOString();

    db.prepare("INSERT INTO kho (tai_khoan, rev, cap_nhat_luc) VALUES (?, ?, ?) ON CONFLICT(tai_khoan) DO UPDATE SET rev = excluded.rev, cap_nhat_luc = excluded.cap_nhat_luc").run(tk, revMoi, tgMoi);
    db.prepare("DELETE FROM trang WHERE tai_khoan = ?").run(tk);
    db.prepare("DELETE FROM so WHERE tai_khoan = ?").run(tk);

    const stmtSo = db.prepare("INSERT INTO so (tai_khoan, id, ten, tao_luc, sua_luc, da_xoa, xoa_luc, drive_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const stmtTrang = db.prepare("INSERT INTO trang (tai_khoan, so_id, id, tao_luc, sua_luc, da_xoa, xoa_luc, rong, cao, net_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

    for (const s of soHopNhat) {
      stmtSo.run(tk, s.id, s.ten || "", s.taoLuc || null, s.suaLuc || null, s.daXoa ? 1 : 0, s.xoaLuc || null, s.drive ? JSON.stringify(s.drive) : null);
      for (const t of s.trang || []) {
        stmtTrang.run(tk, s.id, t.id, t.taoLuc || null, t.suaLuc || null, t.daXoa ? 1 : 0, t.xoaLuc || null, t.scene?.width || 1920, t.scene?.height || 1080, JSON.stringify(t.scene?.items || []));
      }
    }
    db.exec("COMMIT");

    try { chupLui(db); } catch (e) { console.error("[so-tay] Lỗi chụp lùi:", e.message); }

    const ketQua = docKho(db, tk);
    const tongTrang = ketQua.so.reduce((acc, s) => acc + (s.trang?.length || 0), 0);
    console.log(`[so-tay] PUT taiKhoan=${tk} soCount=${ketQua.so.length} trangCount=${tongTrang} bytes=${totalBytes} rev=${ketQua.rev}`);
    return traJson(response, 200, ketQua);
  } catch (loi) {
    try { db.exec("ROLLBACK"); } catch {}
    console.error("[so-tay] Lỗi CSDL:", loi.message);
    return traJson(response, 500, { status: "KHO_LOI", message: "Lỗi ghi dữ liệu sổ tay vào kho máy chủ." });
  }
}
