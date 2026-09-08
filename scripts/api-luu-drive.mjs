import { stat } from "node:fs/promises";
import path from "node:path";
import { luuVaoThuMucDrive } from "./drive-upload.mjs";

const MAX_BODY_BYTES = 40 * 1024 * 1024; // 40 MB
const MAX_FILE_BYTES = 8 * 1024 * 1024;  // 8 MB

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sanitizeLogMessage(msg) {
  return String(msg || "").replace(/(?:ya29\.|AIza)[A-Za-z0-9._-]+/g, "[REDACTED]");
}

export async function xuLyLuuDrive(request, response) {
  if (request.method !== "POST") {
    return sendJson(response, 405, { status: "DU_LIEU_SAI", message: "Chỉ hỗ trợ phương thức POST." });
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      sendJson(response, 413, { status: "QUA_LON", message: "Dung lượng dữ liệu vượt quá giới hạn 40 MB." });
      request.destroy();
      return;
    }
    chunks.push(chunk);
  }

  let body;
  try {
    const raw = Buffer.concat(chunks).toString("utf8");
    body = JSON.parse(raw);
  } catch {
    return sendJson(response, 400, { status: "DU_LIEU_SAI", message: "Định dạng JSON không hợp lệ." });
  }

  if (!body || !Array.isArray(body.files) || body.files.length < 1 || body.files.length > 60) {
    return sendJson(response, 400, {
      status: "DU_LIEU_SAI",
      message: "Danh sách file phải là mảng từ 1 đến 60 phần tử."
    });
  }

  const parsedFiles = [];
  for (const item of body.files) {
    if (!item || typeof item !== "object") {
      return sendJson(response, 400, { status: "DU_LIEU_SAI", message: "Dữ liệu file không hợp lệ." });
    }
    const { ten, kieu, base64 } = item;
    if (!ten || typeof ten !== "string" || path.basename(ten) !== ten || !/^[A-Za-z0-9._-]+$/.test(ten) || !ten.endsWith(".png")) {
      return sendJson(response, 400, {
        status: "DU_LIEU_SAI",
        message: `Tên file "${ten || ""}" không hợp lệ. Chỉ chấp nhận chữ cái, số, dấu gạch và đuôi .png.`
      });
    }
    if (kieu !== "image/png") {
      return sendJson(response, 400, {
        status: "DU_LIEU_SAI",
        message: `Kiểu file "${ten}" không hợp lệ. Chỉ hỗ trợ image/png.`
      });
    }
    if (!base64 || typeof base64 !== "string" || base64.startsWith("data:")) {
      return sendJson(response, 400, {
        status: "DU_LIEU_SAI",
        message: `Dữ liệu base64 file "${ten}" không hợp lệ (không được có tiền tố data:).`
      });
    }
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES) {
      return sendJson(response, 400, {
        status: "DU_LIEU_SAI",
        message: `Dung lượng file "${ten}" vượt quá giới hạn 8 MB hoặc rỗng.`
      });
    }
    parsedFiles.push({ ten, kieu, buffer });
  }

  const tokenPath = process.env.SAM_DRIVE_TOKEN;
  const credentialsPath = process.env.SAM_DRIVE_CREDENTIALS;
  const parentId = process.env.SAM_DRIVE_PARENT;
  const tenThuMuc = process.env.SAM_DRIVE_FOLDER || "_VeBangDayHoc";

  if (!tokenPath) {
    return sendJson(response, 503, {
      status: "THIEU_CREDENTIAL",
      message: "Máy chủ chưa có credential Google Drive — hãy tải các trang về máy."
    });
  }

  try {
    await stat(tokenPath);
  } catch {
    return sendJson(response, 503, {
      status: "THIEU_CREDENTIAL",
      message: "Máy chủ chưa có credential Google Drive — hãy tải các trang về máy."
    });
  }

  if (!parentId) {
    return sendJson(response, 503, {
      status: "THIEU_CREDENTIAL",
      message: "Máy chủ chưa cấu hình thư mục Google Drive đích (SAM_DRIVE_PARENT)."
    });
  }

  try {
    const resDrive = await luuVaoThuMucDrive({
      tenThuMuc,
      parentId,
      files: parsedFiles,
      tokenPath,
      credentialsPath
    });

    const sumBytes = parsedFiles.reduce((acc, f) => acc + f.buffer.length, 0);
    console.log(`[DriveUpload] files=${parsedFiles.length} bytes=${sumBytes} folder=${resDrive.thuMuc.id} status=OK`);

    return sendJson(response, 200, {
      status: "OK",
      thuMuc: resDrive.thuMuc,
      files: resDrive.files
    });
  } catch (err) {
    if (err.code === "THIEU_CREDENTIAL") {
      return sendJson(response, 503, {
        status: "THIEU_CREDENTIAL",
        message: err.message || "Máy chủ chưa có credential Google Drive — hãy tải các trang về máy."
      });
    }
    const safeMsg = sanitizeLogMessage(err.message);
    console.error(`[DriveUpload Error] ${safeMsg}`);
    return sendJson(response, 502, {
      status: "DRIVE_LOI",
      message: `Lỗi khi lưu lên Google Drive: ${safeMsg}`
    });
  }
}
