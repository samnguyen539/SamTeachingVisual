import test from "node:test";
import assert from "node:assert/strict";
import { hopNhatSoTay } from "../scripts/hop-nhat-so-tay.mjs";

test("1. Hai máy mỗi bên tạo một sổ khác nhau -> hợp nhất ra cả hai, không mất bên nào", () => {
  const mayA = [
    {
      id: "so-1",
      ten: "Sổ Toán A",
      taoLuc: "2026-09-09T08:00:00.000Z",
      suaLuc: "2026-09-09T08:30:00.000Z",
      trang: [{ id: "trang-1a", taoLuc: "2026-09-09T08:00:00.000Z", suaLuc: "2026-09-09T08:30:00.000Z", scene: { items: [1] } }]
    }
  ];
  const mayB = [
    {
      id: "so-2",
      ten: "Sổ Văn B",
      taoLuc: "2026-09-09T09:00:00.000Z",
      suaLuc: "2026-09-09T09:15:00.000Z",
      trang: [{ id: "trang-2b", taoLuc: "2026-09-09T09:00:00.000Z", suaLuc: "2026-09-09T09:15:00.000Z", scene: { items: [2] } }]
    }
  ];

  const ketQua = hopNhatSoTay(mayA, mayB);
  assert.equal(ketQua.length, 2);
  assert.equal(ketQua[0].id, "so-1");
  assert.equal(ketQua[1].id, "so-2");
  assert.equal(ketQua[0].trang.length, 1);
  assert.equal(ketQua[1].trang.length, 1);
});

test("2. Cùng một trang, hai bên sửa; bên suaLuc mới hơn thắng, số nét đúng của bên đó", () => {
  const mayA = [
    {
      id: "so-1",
      ten: "Sổ Chung",
      taoLuc: "2026-09-09T08:00:00.000Z",
      suaLuc: "2026-09-09T08:30:00.000Z",
      trang: [
        {
          id: "trang-1",
          taoLuc: "2026-09-09T08:00:00.000Z",
          suaLuc: "2026-09-09T08:30:00.000Z",
          scene: { items: ["net-cu-1", "net-cu-2"] }
        }
      ]
    }
  ];
  const mayB = [
    {
      id: "so-1",
      ten: "Sổ Chung",
      taoLuc: "2026-09-09T08:00:00.000Z",
      suaLuc: "2026-09-09T09:00:00.000Z",
      trang: [
        {
          id: "trang-1",
          taoLuc: "2026-09-09T08:00:00.000Z",
          suaLuc: "2026-09-09T09:00:00.000Z",
          scene: { items: ["net-moi-1", "net-moi-2", "net-moi-3"] }
        }
      ]
    }
  ];

  const ketQua = hopNhatSoTay(mayA, mayB);
  assert.equal(ketQua.length, 1);
  const trang1 = ketQua[0].trang[0];
  assert.equal(trang1.suaLuc, "2026-09-09T09:00:00.000Z");
  assert.deepEqual(trang1.scene.items, ["net-moi-1", "net-moi-2", "net-moi-3"]);
});

test("3. Máy A xoá sổ lúc 10:00, máy B không đụng tới (suaLuc 09:00) -> kết quả vẫn là đã xoá", () => {
  const mayA = [
    {
      id: "so-1",
      ten: "Sổ Bị Xoá",
      taoLuc: "2026-09-09T08:00:00.000Z",
      suaLuc: "2026-09-09T08:30:00.000Z",
      daXoa: true,
      xoaLuc: "2026-09-09T10:00:00.000Z",
      trang: []
    }
  ];
  const mayB = [
    {
      id: "so-1",
      ten: "Sổ Bị Xoá",
      taoLuc: "2026-09-09T08:00:00.000Z",
      suaLuc: "2026-09-09T09:00:00.000Z",
      daXoa: false,
      trang: []
    }
  ];

  const ketQua = hopNhatSoTay(mayA, mayB);
  assert.equal(ketQua.length, 1);
  assert.equal(ketQua[0].daXoa, true);
  assert.equal(ketQua[0].xoaLuc, "2026-09-09T10:00:00.000Z");
});

test("4. Máy A xoá sổ lúc 10:00, máy B vẽ thêm vào chính sổ đó lúc 10:05 -> sổ sống lại, không còn daXoa", () => {
  const mayA = [
    {
      id: "so-1",
      ten: "Sổ Tái Sinh",
      taoLuc: "2026-09-09T08:00:00.000Z",
      suaLuc: "2026-09-09T08:30:00.000Z",
      daXoa: true,
      xoaLuc: "2026-09-09T10:00:00.000Z",
      trang: []
    }
  ];
  const mayB = [
    {
      id: "so-1",
      ten: "Sổ Tái Sinh",
      taoLuc: "2026-09-09T08:00:00.000Z",
      suaLuc: "2026-09-09T10:05:00.000Z",
      daXoa: false,
      trang: [
        {
          id: "trang-1",
          taoLuc: "2026-09-09T08:00:00.000Z",
          suaLuc: "2026-09-09T10:05:00.000Z",
          scene: { items: ["net-sau-khi-xoa"] }
        }
      ]
    }
  ];

  const ketQua = hopNhatSoTay(mayA, mayB);
  assert.equal(ketQua.length, 1);
  assert.equal(ketQua[0].daXoa, false);
  assert.equal(ketQua[0].xoaLuc, null);
  assert.equal(ketQua[0].trang.length, 1);
});

test("5. Tất định: hopNhat(a,b) và hopNhat(b,a) cho JSON giống hệt, kể cả khi suaLuc bằng nhau", () => {
  const mayA = [
    {
      id: "so-1",
      ten: "Tên A",
      taoLuc: "2026-09-09T08:00:00.000Z",
      suaLuc: "2026-09-09T09:00:00.000Z",
      drive: { folderId: "drive-a" },
      trang: [
        {
          id: "trang-1",
          taoLuc: "2026-09-09T08:00:00.000Z",
          suaLuc: "2026-09-09T09:00:00.000Z",
          scene: { items: ["net-a"] }
        }
      ]
    }
  ];
  const mayB = [
    {
      id: "so-1",
      ten: "Tên B",
      taoLuc: "2026-09-09T08:00:00.000Z",
      suaLuc: "2026-09-09T09:00:00.000Z",
      drive: { folderId: "drive-b" },
      trang: [
        {
          id: "trang-1",
          taoLuc: "2026-09-09T08:00:00.000Z",
          suaLuc: "2026-09-09T09:00:00.000Z",
          scene: { items: ["net-b"] }
        }
      ]
    }
  ];

  const ketQuaAB = hopNhatSoTay(mayA, mayB);
  const ketQuaBA = hopNhatSoTay(mayB, mayA);

  assert.deepEqual(ketQuaAB, ketQuaBA);
  assert.equal(JSON.stringify(ketQuaAB), JSON.stringify(ketQuaBA));
});

test("6. Trang mới chỉ có ở một bên thì được giữ, và thứ tự trang sau hợp nhất theo taoLuc", () => {
  const mayA = [
    {
      id: "so-1",
      ten: "Sổ Đa Trang",
      taoLuc: "2026-09-09T08:00:00.000Z",
      suaLuc: "2026-09-09T08:30:00.000Z",
      trang: [
        { id: "trang-3", taoLuc: "2026-09-09T08:30:00.000Z", suaLuc: "2026-09-09T08:30:00.000Z", scene: { items: [3] } },
        { id: "trang-1", taoLuc: "2026-09-09T08:10:00.000Z", suaLuc: "2026-09-09T08:10:00.000Z", scene: { items: [1] } }
      ]
    }
  ];
  const mayB = [
    {
      id: "so-1",
      ten: "Sổ Đa Trang",
      taoLuc: "2026-09-09T08:00:00.000Z",
      suaLuc: "2026-09-09T08:20:00.000Z",
      trang: [
        { id: "trang-2", taoLuc: "2026-09-09T08:20:00.000Z", suaLuc: "2026-09-09T08:20:00.000Z", scene: { items: [2] } }
      ]
    }
  ];

  const ketQua = hopNhatSoTay(mayA, mayB);
  assert.equal(ketQua.length, 1);
  const cacTrang = ketQua[0].trang;
  assert.equal(cacTrang.length, 3);
  assert.equal(cacTrang[0].id, "trang-1");
  assert.equal(cacTrang[1].id, "trang-2");
  assert.equal(cacTrang[2].id, "trang-3");
});
