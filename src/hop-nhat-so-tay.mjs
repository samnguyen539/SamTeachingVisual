function layThoiGian(item, truong) {
  if (item && typeof item[truong] === "string" && item[truong]) return item[truong];
  if (truong === "suaLuc" && item && typeof item.taoLuc === "string" && item.taoLuc) return item.taoLuc;
  return "1970-01-01T00:00:00.000Z";
}

function soSanhMoiHon(a, b) {
  const tA = layThoiGian(a, "suaLuc");
  const tB = layThoiGian(b, "suaLuc");
  if (tA !== tB) return tA > tB ? a : b;
  const strA = JSON.stringify(a);
  const strB = JSON.stringify(b);
  return strA >= strB ? a : b;
}

function hopNhatPhanTu(a, b, laSo = false) {
  const daXoaA = Boolean(a.daXoa);
  const daXoaB = Boolean(b.daXoa);
  const taoLuc = layThoiGian(a, "taoLuc") < layThoiGian(b, "taoLuc") ? layThoiGian(a, "taoLuc") : layThoiGian(b, "taoLuc");
  const suaLucA = layThoiGian(a, "suaLuc");
  const suaLucB = layThoiGian(b, "suaLuc");
  const maxSuaLuc = suaLucA > suaLucB ? suaLucA : suaLucB;

  let daXoa = false;
  let xoaLuc = null;

  if (laSo) {
    // Với SỔ, `suaLuc` không đáng tin để phá bia mộ: chỉ cần một máy có bản cũ
    // chạm vào (đổi trang, tự sinh trang trắng) là `suaLuc` đã nhảy. Nên bia mộ
    // luôn thắng ở tầng này, và chỉ được gỡ bởi phép kiểm nội dung bên dưới.
    if (daXoaA || daXoaB) {
      daXoa = true;
      const xA = daXoaA ? layThoiGian(a, "xoaLuc") : "1970-01-01T00:00:00.000Z";
      const xB = daXoaB ? layThoiGian(b, "xoaLuc") : "1970-01-01T00:00:00.000Z";
      xoaLuc = xA > xB ? xA : xB;
    }
  } else if (daXoaA && daXoaB) {
    daXoa = true;
    const xA = layThoiGian(a, "xoaLuc");
    const xB = layThoiGian(b, "xoaLuc");
    xoaLuc = xA > xB ? xA : xB;
  } else if (daXoaA && !daXoaB) {
    const xA = layThoiGian(a, "xoaLuc");
    if (xA > suaLucB) {
      daXoa = true;
      xoaLuc = xA;
    }
  } else if (!daXoaA && daXoaB) {
    const xB = layThoiGian(b, "xoaLuc");
    if (xB > suaLucA) {
      daXoa = true;
      xoaLuc = xB;
    }
  }

  const nguonChinh = soSanhMoiHon(a, b);
  const ketQua = {
    ...nguonChinh,
    id: a.id,
    taoLuc,
    suaLuc: maxSuaLuc,
    daXoa,
    xoaLuc: daXoa ? xoaLuc : null
  };

  if (laSo) {
    ketQua.trang = hopNhatDanhSach(a.trang || [], b.trang || [], false);
    // Sổ đã xoá chỉ sống lại khi máy khác VẼ THẬT vào nó sau lúc xoá.
    // Trước đây chỉ cần một trang còn sống và mới hơn `xoaLuc` là đủ, mà
    // `getCurrentPage()` lại tự tạo trang trắng khi sổ hết trang — nên một máy
    // có bản cũ trong bộ nhớ chỉ cần chạm vào là sổ đã xoá đội mồ sống dậy.
    // Đo được: 50 sổ đã xoá quay lại kho, mỗi cái kèm vài trang trắng.
    if (ketQua.daXoa) {
      const coNoiDungMoi = ketQua.trang.some(
        (t) => !t.daXoa && (t.scene?.items?.length || 0) > 0 && layThoiGian(t, "suaLuc") > layThoiGian(ketQua, "xoaLuc")
      );
      if (coNoiDungMoi) {
        ketQua.daXoa = false;
        ketQua.xoaLuc = null;
      }
    }
  }

  return ketQua;
}

function hopNhatDanhSach(danhSachA, danhSachB, laSo = false) {
  const mapA = new Map();
  const mapB = new Map();

  for (const item of danhSachA) {
    if (item && typeof item.id === "string" && item.id) mapA.set(item.id, item);
  }
  for (const item of danhSachB) {
    if (item && typeof item.id === "string" && item.id) mapB.set(item.id, item);
  }

  const ketQua = [];
  const daXet = new Set();

  for (const [id, itemA] of mapA) {
    daXet.add(id);
    if (mapB.has(id)) {
      ketQua.push(hopNhatPhanTu(itemA, mapB.get(id), laSo));
    } else {
      const clone = { ...itemA };
      if (laSo && Array.isArray(clone.trang)) {
        clone.trang = hopNhatDanhSach(clone.trang, [], false);
      }
      ketQua.push(clone);
    }
  }

  for (const [id, itemB] of mapB) {
    if (!daXet.has(id)) {
      const clone = { ...itemB };
      if (laSo && Array.isArray(clone.trang)) {
        clone.trang = hopNhatDanhSach(clone.trang, [], false);
      }
      ketQua.push(clone);
    }
  }

  return ketQua.sort((x, y) => {
    const tx = layThoiGian(x, "taoLuc");
    const ty = layThoiGian(y, "taoLuc");
    if (tx !== ty) return tx.localeCompare(ty);
    return (x.id || "").localeCompare(y.id || "");
  });
}

export function hopNhatSoTay(aSo = [], bSo = []) {
  const mangA = Array.isArray(aSo) ? aSo : [];
  const mangB = Array.isArray(bSo) ? bSo : [];
  return hopNhatDanhSach(mangA, mangB, true);
}

export function chuanHoaSo(so) {
  if (!Array.isArray(so)) {
    return { hopLe: false, loi: "Dữ liệu sổ tay phải là mảng." };
  }
  if (so.length > 200) {
    return { hopLe: false, loi: "Số lượng sổ vượt quá giới hạn 200 sổ." };
  }
  for (const s of so) {
    if (!s || typeof s !== "object") {
      return { hopLe: false, loi: "Mỗi phần tử sổ phải là đối tượng." };
    }
    if (typeof s.id !== "string" || !s.id.trim()) {
      return { hopLe: false, loi: "Mỗi sổ phải có id dạng chuỗi không rỗng." };
    }
    if (!Array.isArray(s.trang)) {
      return { hopLe: false, loi: "Danh sách trang của sổ phải là mảng." };
    }
    if (s.trang.length > 500) {
      return { hopLe: false, loi: `Sổ "${s.id}" vượt quá giới hạn 500 trang.` };
    }
    for (const t of s.trang) {
      if (!t || typeof t !== "object" || typeof t.id !== "string" || !t.id.trim()) {
        return { hopLe: false, loi: "Mỗi trang phải có id dạng chuỗi không rỗng." };
      }
    }
  }
  return { hopLe: true, loi: null };
}
