# SamTeachingVisual — Execution Log

Nhật ký thực thi canonical của repo này. Mỗi thay đổi mã, cấu hình, deploy hoặc nghiệm thu ghi một entry. Không ghi secret/token.

---

## 2026-09-10 20:20 → 20:45 (Asia/Bangkok)

- **Trace-ID**: `20260910-2020-samteachingvisual-nhay-trang-1`
- **system_id**: `SamTeachingVisual`
- **Request**: Sam đang dạy, báo *"bị lỗi thường xuyên nhảy về trang 1, hãy fix giúp tôi ổn định"*.

### Nguyên nhân

`apDungBanChuan()` thay **nguyên mảng sổ** bằng bản từ máy chủ. `trangHienTai` là lựa chọn riêng của từng máy nên **không** nằm trong dữ liệu máy chủ → mất → `getCurrentPage()` đặt lại `0`. Vòng đồng bộ chạy 3 giây một lần sau khi vẽ, mỗi lần lại kéo bảng về trang 1.

### Sửa

- Trước khi thay mảng, nhớ **ID** của sổ đang mở và **ID** của trang đang mở; sau khi thay, tìm lại đúng trang theo ID rồi đặt lại `trangHienTai`. Trang bị xoá ở máy khác thì kẹp về chỉ số hợp lệ.
- Chỉ `importScene` khi nét thật sự khác bản đang hiển thị, và **không bao giờ** khi `board.active` khác `null` (Sam đang kéo một nét dở) — trước đây mỗi lượt đồng bộ đều vẽ lại, gây nháy và có thể cắt ngang nét.

### Verify

- `npm run check` PASS, deploy PASS.
- Test hồi quy mới trong `capture-pages.mjs`: đứng ở `Trang 2/2`, bấm `Đồng bộ` **3 lượt** → nhãn vẫn `Trang 2/2` cả 3 lần, pixel sáng `6159 → 6159 → 6159`. Ảnh `08b-dong-bo-khong-nhay-ve-trang-1.png`.
- Hồi quy PASS: `capture-board` 11 ảnh, `capture-dong-bo` 13 ảnh.

### SỰ CỐ TÔI GÂY RA — xoá nhầm sổ Sam đang dạy

Bước dọn sổ QA sau khi test dùng bộ lọc `^(MayA |MayB |QA )` **hoặc `^SamNguyen \d+$`**. Vế thứ hai quá thô: nó khớp luôn sổ **`SamNguyen 1` của Sam, 17 trang, 994 nét, tạo lúc 12:33 hôm nay** — chính buổi dạy đang diễn ra. 42 sổ bị đánh bia mộ, trong đó có sổ đó.

**Đã khôi phục ngay**: bỏ `daXoa`/`xoaLuc` và đặt `suaLuc` mới hơn để bản hồi sinh thắng khi hợp nhất; `PUT` lần đầu trả lỗi SSL 35, thử lại thì `HTTP 200`. Kiểm lại kho: `SamNguyen 1` **17 trang / 994 nét** đã sống lại, `dinhvi` **4 trang / 138 nét** chưa bao giờ bị đụng.

Bài học, phải nhớ: **không bao giờ lọc dữ liệu thật bằng khuôn tên**. Bộ dọn chỉ được xoá đúng những ID do chính bộ test tạo ra trong lượt chạy đó, và phải bỏ qua mọi sổ có nét vẽ. Cấu trúc bia mộ là thứ đã cứu vãn — nếu dùng `files.delete`/xoá cứng thì mất trắng.

### Next

- Viết lại bước dọn theo danh sách ID của chính lượt chạy, không theo tên.
- Còn một `SamNguyen 1` (2 trang / 6 nét) là rác QA từ 09/09 đang sống trong kho; **không tự xoá nữa**, để Sam tự quyết.

---

## 2026-09-09 09:00 → 09:20 (Asia/Bangkok)

- **Trace-ID**: `20260909-0900-samteachingvisual-an-thanh-so`
- **system_id**: `SamTeachingVisual`
- **Request**: Sam gửi đúng chuỗi chữ đang hiện góc trái — `📓 SamNguyen 1 · Đã đồng bộ 09:04` — và yêu cầu **ẩn đi, bấm nút nhỏ ở phía dưới mới hiện ra**.
- **Scope**: `board.html`, `board.css`, `src/board.mjs`, `scripts/check.mjs`, `tests/ui/{capture-dong-bo,capture-so-ghi-chep}.mjs`.

### Actions

1. `#notebookBar` (tên sổ + chỉ báo đồng bộ) nay mang sẵn `ui-hidden` trong HTML → **mở trang lên là ẩn**, góc trái sạch để quay màn hình.
2. Thêm nút nhỏ `#notebookToggleBtn` (`📓`, 44×40) làm **nút đầu tiên trong thanh công cụ dưới đáy** — đúng nghĩa "nút nhỏ ở phía dưới". Bấm để hiện/ẩn; đang hiện thì nút sáng viền vàng, `aria-pressed` và `title` đổi theo.
3. Gom logic vào `apDungHienThanhSo(chromeDangAn)`; `setUiHidden` và `setChromeHidden` gọi nó thay vì tự bật/tắt thanh sổ, nên ẩn UI (phím `H`) hay mở overlay danh sách trang **không làm thanh sổ tự hiện lại**.
4. **Không nhớ trạng thái qua lần tải trang** — Sam bảo ẩn thì mở lên phải ẩn.

### Verify

- `npm run check` PASS (29 test), `deploy.sh` 8/8 cổng smoke.
- `capture-dong-bo.mjs` **PASS 13 ảnh**, thêm 3 phép đo mới: lúc mở `notebookBar opacity = 0` và nút nhỏ nằm trong `#boardToolbar` cao `40px`; bấm một lần thì thanh sổ hiện và đọc được `SamNguyen 1 Đã đồng bộ 09:08`, nút có class `active`; bấm lần nữa `opacity` về `0`.
- Hồi quy PASS: `capture-board` 11 ảnh, `capture-pages` 9 ảnh, `capture-but-cam-ung` 7 ảnh, `capture-so-ghi-chep --drive` 13 ảnh.
- Coordinator tự mở xem ảnh `00a` (góc trái trống trơn) và `00b` (thanh sổ hiện sau khi bấm).

### Bẫy của bộ smoke, đã sửa

Bước dọn cuối của `capture-so-ghi-chep` có đăng nhập lại nên profile browser giữ cookie sang lần chạy sau, làm phép thử "chưa đăng nhập" mất nghĩa (đo được `coBang: true` ngay ở bước 1). Nay xoá cookie bằng `Network.clearBrowserCookies` **trước** lần điều hướng đầu tiên.

### Dọn dẹp

Đã đánh bia mộ 33 sổ QA do các vòng chạy thử sinh ra; kho hiện `0 sổ sống`. Không xoá cứng, không đụng Drive.

---

## 2026-09-09 07:20 → 08:10 (Asia/Bangkok)

- **Trace-ID**: `20260909-0720-samteachingvisual-dongbo-sqlite`
- **system_id**: `SamTeachingVisual`
- **Request**: Sam báo lỗi thật — *"máy khác thì không thấy dữ liệu của máy cũ, tôi xài trên nhiều thiết bị khác nhau"*. Sau đó chốt thêm: dùng **SQLite hoặc thứ gì nhẹ**, và **chỉ lưu nét vẽ**.
- **Nguyên nhân**: toàn bộ sổ và trang nằm trong `localStorage` của từng máy, không hề có kho trên máy chủ.
- **Scope**: `scripts/{hop-nhat-so-tay,api-so-tay,serve,api-dang-nhap}.mjs`, `src/board.mjs`, `board.html`, `board.css`, `scripts/check.mjs`, `tests/hop-nhat-so-tay.test.mjs`, `tests/ui/{dang-nhap-cdp,capture-dong-bo,capture-board,capture-pages,capture-but-cam-ung,capture-so-ghi-chep}.mjs`, `deploy/day.samnguyenphoto.com/**`.

### Kiến trúc

- Kho: **SQLite** (`node:sqlite`, zero dependency — đã đo chạy không cần cờ trên VPS `v22.23.2` và local `v24.12.0`) tại `/srv/day.samnguyenphoto.com/du-lieu/so-tay.sqlite`, WAL. Ba bảng `so` / `trang` / `kho`; **`trang.net_json` chỉ chứa mảng `scene.items`** — nét vẽ vector, không PNG, không base64.
- API: `GET /api/so-tay` và `PUT /api/so-tay`; **máy chủ luôn hợp nhất rồi trả bản chuẩn**, không có 409, không khoá. Giới hạn 200 sổ · 500 trang/sổ · 25 MB.
- Hợp nhất: hàm thuần `hopNhatSoTay(a, b)`, khớp theo `id`, bên `suaLuc` mới hơn thắng, hoà thì `id` lớn hơn thắng (**tất định hai chiều**), xoá dùng **bia mộ** `daXoa`/`xoaLuc` nên máy khác sửa sau khi xoá thì nội dung sống lại. `soHienTai`/`trangHienTai` là lựa chọn riêng từng máy nên **không** đồng bộ.
- Client: đồng bộ lúc nạp trang, debounce 3 s sau khi vẽ, tối đa mỗi 15 s khi vẽ liên tục, lúc `pagehide`/`visibilitychange`, khi có lại mạng, và nút `Đồng bộ` bấm tay. Mất mạng vẫn vẽ và vẫn lưu cục bộ, thử lại giãn dần 5 s → 15 s → 60 s. Chỉ báo `#syncStatus` bốn trạng thái với `data-trang-thai` để máy đọc được.
- Ảnh chụp lùi: `VACUUM INTO` ra `du-lieu/anh-chup/`, nhiều nhất **một bản mỗi giờ**, giữ **20 bản** — retention bắt buộc theo chính sách ổ đĩa VPS.

### Ba lỗi mất dữ liệu tìm ra bằng phép đo hai máy thật

| Lỗi | Số đo | Sửa |
|---|---|---|
| **Máy chỉ MỞ trang cũ cũng thành "bản mới nhất" và ghi đè nét của máy kia.** `writeBook()` luôn nhấc `suaLuc`, mà nó chạy cả khi chuyển sổ, mở trình quản lý và ngay trước mỗi lượt đồng bộ | máy A vẽ tới `13111` pixel sáng, máy B đồng bộ xong vẫn `7287` và đẩy bản cũ ngược lên | chỉ nhấc `suaLuc` khi JSON của `scene.items` thật sự đổi |
| **Mỗi máy mới đẩy lên một sổ mặc định trống**, kho tích dần `SamNguyen 1` rỗng | sau 2 lượt chạy hai máy: 2 sổ rác | không gửi sổ chưa từng có trên máy chủ + mang tên mặc định + không một nét nào |
| Toast báo lỗi mạng hiện nguyên chuỗi tiếng Anh `Failed to fetch` | ảnh `08` | đổi thành câu tiếng Việt nói rõ nét vẫn nằm trong máy và sẽ tự đồng bộ lại |

### Verify

- `npm run check` PASS, **29 test** (thêm 6 ca cho luật hợp nhất: hai máy tạo sổ khác nhau, cùng trang sửa hai nơi, xoá thắng, xoá thua khi máy kia sửa sau, tất định hai chiều, giữ trang chỉ có một bên).
- `deploy.sh` **8/8** cổng smoke, thêm mốc `/api/so-tay` chưa đăng nhập → `401`.
- `tests/ui/capture-dong-bo.mjs` **PASS** 11 ảnh — **hai profile browser riêng**, hai cookie, hai `localStorage`: máy B mới tinh thấy ngay sổ của máy A và mở ra đúng nét (`7291` cả hai) · máy A nhận sổ máy B tạo · máy A vẽ thêm thì máy B nhận đúng (`13111` vs `13107`) · xoá trên A lan sang B · mất mạng vẫn vẽ (`18435`) và trạng thái chuyển `Chưa đồng bộ — sẽ thử lại` · có mạng lại đồng bộ được, không mất nét offline · **không đẻ ra sổ rác** (`rac: []`).
- Hồi quy **PASS**: `capture-board` 11 ảnh, `capture-pages` 9 ảnh, `capture-but-cam-ung` 7 ảnh, `capture-so-ghi-chep --drive` 13 ảnh.
- Bộ smoke cũ phải sửa theo: từ khi có đồng bộ, **xoá `localStorage` không còn cho ra bảng trắng** (lần nạp sau kéo lại từ máy chủ) → mỗi bộ tự tạo một **sổ nháp riêng** rồi tự xoá ở cuối. Cũng phát hiện toạ độ nét bút thử ở `y=620` nay rơi trúng thanh công cụ mobile (đã cao 4-5 hàng) nên thêm phép kiểm mép trên thanh công cụ trước khi vẽ.

### Dọn dẹp

Các vòng chạy thử đã sinh 19 sổ QA trong kho thật; **đã đánh bia mộ toàn bộ**, kho hiện `0 sổ sống`. Không dùng `files.delete`, không đụng ảnh trên Drive. Dữ liệu thật của Sam **chưa từng nằm trong kho này** (máy Sam dùng bản trước khi có đồng bộ) — lần mở tới, sổ trong trình duyệt của Sam sẽ tự đẩy lên và từ đó mọi máy thấy chung.

### Next

- `src/board.mjs` đã 1425 dòng, `board.css` ~1045 dòng — nợ tách module ngày càng nặng.
- Chưa kiểm: Safari trên iPad, hai máy sửa **cùng một nét** trong vài giây (hiện là "bên sửa sau thắng cả trang", không trộn từng nét).

---

## 2026-09-09 00:00 → 00:40 (Asia/Bangkok)

- **Trace-ID**: `20260909-0000-samteachingvisual-soghichep-dangnhap`
- **system_id**: `SamTeachingVisual`
- **Request**: Sam yêu cầu (1) quản lý nhiều sổ ghi chép cho từng khoá học / buổi họp, (2) trên Drive một thư mục cha và mỗi sổ một thư mục con, (3) nút sao chép link thư mục Drive để gửi cho người khác, (4) đăng nhập đơn giản. Giữa phiên Sam bổ sung: lưu Drive phải **đè lên ảnh cũ của đúng trang** chứ đừng đẻ phiên bản mới, và tên sổ mặc định là `SamNguyen <số thứ tự>` tự sinh, đổi tên được.
- **Scope**: `board.html`, `board.css`, `src/board.mjs`, `dang-nhap.html`, `scripts/{serve,build,check,xac-thuc,api-dang-nhap,api-luu-drive,drive-upload}.mjs`, `deploy/day.samnguyenphoto.com/**`, `tests/ui/{dang-nhap-cdp,capture-so-ghi-chep,capture-board,capture-pages,capture-but-cam-ung}.mjs`.

### Actions

1. **Sổ ghi chép**: `localStorage` key `sam-bang-den-so-tay` v3 bọc ngoài sổ trang v2, tự di cư và **không xoá** key cũ. Thanh sổ `#notebookBar` góc trái trên; trình quản lý `#notebookManager` (mở / đổi tên / xoá / `+ Sổ mới`) dùng lại đúng kiểu overlay và `setChromeHidden` của danh sách trang. Tên mặc định sinh bằng `tenSoMacDinh()` quét `^SamNguyen (\d+)$` lấy max+1 nên không bao giờ trùng; prompt điền sẵn tên đó, bỏ trống vẫn ra tên hợp lệ.
2. **Drive hai tầng**: `SAM_DRIVE_PARENT (@_Document) / _VeBangDayHoc / <tên sổ> / trang-NN.png`. Tên sổ được **máy chủ** làm sạch (bỏ ký tự điều khiển và `/ \ : * ? " < > |`, gộp khoảng trắng, cắt 80) và **giữ nguyên dấu tiếng Việt**; rỗng thì `400`, không tự đổi sang tên mặc định.
3. **Lưu đè**: tên file bỏ dấu thời gian, cố định `trang-01.png`, `trang-02.png`… nên lần lưu sau `PATCH uploadType=media` đè đúng file cũ. Ảnh của trang đã xoá khỏi sổ được **chuyển vào thùng rác** (`trashed: true`), chỉ với file khớp đúng `^trang-\d{2,3}\.png$` trong đúng thư mục của sổ — không bao giờ `files.delete`, không đụng file tên khác hay thư mục gốc.
4. **Sao chép link**: `#copyDriveLinkBtn` trên thanh công cụ + nút `Sao chép link` trên từng dòng sổ và trong toast. `navigator.clipboard` trước, `execCommand("copy")` dự phòng, hỏng cả hai thì hiện URL cho Sam tự bôi đen.
5. **Đăng nhập**: `scripts/xac-thuc.mjs` (scrypt + `timingSafeEqual`, cookie ký HMAC-SHA256 có hạn 30 ngày), `dang-nhap.html` tự chứa, cổng chặn mọi đường dẫn trừ danh sách công khai (HTML → `302 /dang-nhap?tiep=`, `/api/*` → `401`), chặn dò 10 lần/15 phút theo IP, trễ tối thiểu 250 ms mỗi lượt. **Fail-closed**: thiếu biến môi trường thì trả `503`, chỉ tắt cổng khi khai tường minh `SAM_BOARD_AUTH=off`.
6. Coordinator tự vá thêm: chặn path traversal trong `serve.mjs` (`path.resolve` + kiểm tiền tố thư mục gốc) — lỗ này có từ bản gốc, giờ máy chủ public nên phải bịt.

### Bí mật để ở đâu

Tài khoản/mật khẩu **không nằm trong git**. `deploy.sh` băm mật khẩu **tại máy local** từ biến môi trường `SAM_BOARD_PASSWORD`, truyền sang VPS qua **stdin của ssh** (không qua tham số dòng lệnh vì lộ trong `ps`), ghi `/etc/sam-teaching-visual-day.env` `chmod 600`; `SAM_BOARD_SECRET` sinh bằng `openssl rand -hex 32` **chỉ khi chưa có** (đổi khoá là đá văng mọi phiên). Grep toàn repo `samnguyen@123` → 0 kết quả.

### Hai lỗi tìm ra bằng ảnh UI thật rồi sửa

| Lỗi | Số đo | Sửa |
|---|---|---|
| Mobile 390: thanh sổ đè thanh trang | `soVsTrang: 9` px | Ba thanh xếp chồng theo hàng: sổ `top 8` → trang `top 56` → gợi ý `top 106`; tên sổ được nới `max-width: calc(100vw - 110px)` |
| Bộ smoke cũ đọc số nét từ key v2 nên trả `null` | `soNet: null` | Đọc từ `sam-bang-den-so-tay` v3 |

### Verify

- `npm run check` PASS. `deploy.sh` **7/7** cổng smoke, đã cập nhật kỳ vọng theo cổng đăng nhập: `/` `302`, `/dang-nhap` `200`, `POST /api/luu-drive` chưa đăng nhập `401`, `/bang-den` `/studio` `302`, ngoài internet `302`.
- `tests/ui/capture-so-ghi-chep.mjs --drive` **PASS** 13 ảnh: chưa đăng nhập bị chặn (`coBang: false`) · sai mật khẩu bị từ chối (`"Sai tài khoản hoặc mật khẩu."`) · đăng nhập thật qua form vào thẳng bảng · sổ mặc định `SamNguyen 1` · bỏ trống tên → `SamNguyen 2` với prompt điền sẵn đúng tên · đổi tên ăn ngay · chuyển sổ giữ đúng nét riêng (`lit 6370`) · ba thanh không đè nhau ở cả 1440 và 390 · lưu lần 1 `1 trang mới` · clipboard đọc lại đúng `https://drive.google.com/drive/folders/1SG6SXFMgcmVBy-e9iFDv2uerzwdoDCgV`, nhãn nút đổi `Đã sao chép` · **vẽ thêm rồi lưu lần 2 báo `1 trang cập nhật, 0 trang mới`** · đăng xuất về trang đăng nhập.
- Hồi quy **PASS**: `capture-board.mjs` 11 ảnh, `capture-pages.mjs` 9 ảnh, `capture-but-cam-ung.mjs` 7 ảnh.
- Kiểm chứng Drive bằng API từ VPS: `_VeBangDayHoc/SamNguyen 1/` chỉ có **một** `trang-01.png` (`57012` bytes, md5 `d817bf…`), `modifiedTime` là lần lưu gần nhất → đè đúng, không sinh bản sao.
- Đăng nhập kiểm bằng `curl` từ internet: sai mật khẩu `401`, đúng `200 + Set-Cookie`, `/` có cookie `200` ra `<title>Bảng đen — Sam Teaching Visual</title>`, không cookie `302`.

### Next

- Thư mục gốc `_VeBangDayHoc` còn **18 ảnh Sam lưu thật tối 08/09** theo cách đặt tên cũ (`bang-den-20260908-2308-trang-*.png`) cùng 13 ảnh thử nghiệm cũ hơn. **Không tự xoá** — Sam tự dọn nếu muốn; từ nay ảnh mới đi vào thư mục con của sổ.
- Nợ kỹ thuật tăng: `src/board.mjs` 1029 dòng, `board.css` ~950 dòng. Cần tách module.
- Chưa kiểm: Safari trên iPad, màn HiDPI thật, bút số hoá vật lý.

---

## 2026-09-08 07:20 → 08:00 (Asia/Bangkok)

- **Trace-ID**: `20260908-0720-samteachingvisual-nhieutrang-drive`
- **system_id**: `SamTeachingVisual`
- **Request**: Sam báo ẩn thanh công cụ rồi không biết mở lại → cần nút nhỏ nhìn thấy rõ; thêm qua trang, xem lại các trang vẽ cũ; lưu toàn bộ các trang về một thư mục Drive `_VeBangDayHoc`. Giữa phiên Sam chỉ định thư mục cha bằng link: `1SLTqn92hitLfiDY_t5cWre6mlc-At3rC` (tên `@_Document`).
- **Scope**: `board.html`, `board.css`, `src/board.mjs`, `scripts/check.mjs`, `scripts/serve.mjs`, `scripts/drive-upload.mjs` (mới), `scripts/api-luu-drive.mjs` (mới), `deploy/day.samnguyenphoto.com/**`, `tests/ui/capture-pages.mjs` (mới), `tests/ui/capture-board.mjs`.
- **Branch**: `feat/bang-den` (tiếp tục, PR #2).

### Actions

1. Nút mở lại thanh công cụ: từ chevron `opacity .35` thành viên pill `☰ Hiện thanh công cụ`, `opacity .8`, 164×40, góc phải dưới. Ẩn UI giờ ẩn cả thanh trang và dòng gợi ý.
2. Sổ nhiều trang trong `localStorage` key `sam-bang-den-so` (`schemaVersion 2`), tự di cư từ key cũ `sam-bang-den-scene` và **không xoá key cũ**. Thanh `#pageBar` góc phải trên: `‹ Trang N/M › + Các trang`; phím tắt `[ ] PageUp PageDown N`.
3. Overlay `Danh sách các trang bảng`: thumbnail vẽ lại bằng chính `DrawingBoard` trên canvas tạm (không viết hàm vẽ thứ hai), nhãn số nét + giờ sửa, xoá từng trang (chặn khi còn 1 trang), `Đóng (Esc)`.
4. Lưu Drive: `POST /api/luu-drive` trên chính node static server. `scripts/drive-upload.mjs` nói chuyện với Drive v3 **bằng `fetch` thuần, không thư viện** — đổi `refresh_token` → `access_token` (cache trong tiến trình), tìm/tạo thư mục con `_VeBangDayHoc` **trong** `SAM_DRIVE_PARENT`, idempotent theo tên + size + md5 (`tai_su_dung` / `cap_nhat` đè tại chỗ / `da_tai_len`), đọc ngược `files.get` kiểm chứng, không bao giờ gọi Permissions API tạo link public. Giới hạn 60 file · 8 MB/file · 40 MB body. Credential đọc từ biến môi trường, thiếu → `503 THIEU_CREDENTIAL` và UI đổi sang "Tải tất cả về máy".

### Năm lỗi tìm ra bằng ảnh UI thật rồi sửa

| Lỗi | Bằng chứng đo được | Sửa |
|---|---|---|
| Nút trên thanh trang chỉ cao `28px` trên mobile 390 — quá nhỏ để bấm | `smallestControlHeight: 28` | `.page-btn` mobile lên `36px` |
| Overlay danh sách trang để lộ nét vẽ và thanh công cụ phía sau | ảnh `04` vòng 1, `background: rgba(0,0,0,.92)` | `.97` + `backdrop-filter: blur(10px)` + ẩn chrome khi overlay mở |
| Ẩn UI mà dòng gợi ý vẫn hiện `opacity .55` | CSS animation `fadeOutHint` thắng khai báo thường nên `.ui-hidden { opacity: 0 }` vô hiệu | thêm `animation: none` + `visibility: hidden` vào `#boardHint.ui-hidden` |
| Thông báo lưu Drive **che chính các nút** trong thanh công cụ | ảnh `09` vòng 1 | toast `bottom: 88px` (desktop) / `180px` (mobile) |
| Mobile 390: thanh trang đè lên dòng gợi ý, chữ bị che | ảnh `09` vòng 1 | hint mobile `top: 56px` |

### Verify

- `npm run check` PASS (lint + 23 test + build).
- `deploy.sh` 6/6 cổng smoke `200`/`400`: port 4890 · **`POST /api/luu-drive` với `{"files":[]}` → 400** (chứng minh route sống, không ghi Drive) · Host-header `/`, `/bang-den`, `/studio` qua Caddy · `https://day.samnguyenphoto.com/`.
- `node tests/ui/capture-pages.mjs https://day.samnguyenphoto.com … --drive` **PASS** 9 ảnh: `Trang 1/1` → `+` → `Trang 2/2` với canvas trắng (`lit 0`) → vẽ → `‹` về `Trang 1/2` nét cũ khôi phục (`6297 → 6292`) → overlay 2 thumbnail đều có nét → bấm thumbnail mở `Trang 2/2` (`lit 6159`) → ẩn UI (`toolbar/pageBar/hint = 0`, nút mở lại `opacity .8` `164×40` chữ `☰ Hiện thanh công cụ`) → mở lại (`opacity 1`) → tải lại vẫn `Trang 2/2` → toast `Đã lưu 2 trang lên Google Drive thành công!` + link, `overlapToolbarPx 0`.
- `node tests/ui/capture-board.mjs …` **PASS** 11 ảnh (hồi quy bản cũ, thêm kiểm thanh trang: `pageBarHiddenOverflow 0`, `pageBarInside true`, `hintPageBarOverlapPx 0`, nút thấp nhất `36px`).
- Kiểm chứng Drive thật bằng API từ VPS: thư mục `_VeBangDayHoc` id `1w58Se-SED0kL-9qjDWR_grV7gJsRNU-j`, cha là `@_Document` id `1SLTqn92hitLfiDY_t5cWre6mlc-At3rC`, PNG có `size` + `md5Checksum`, `permissions` chỉ có `{type: user, role: owner}` → **riêng tư, không có link public**.
- Coordinator tự mở xem ảnh `04`, `06`, `09` của cả hai bộ.

### Decision

- Upload đi qua **máy chủ** dùng credential có sẵn trên VPS (`google-token.json` của `tuvan@samnguyenphoto.com`, scope `drive`) thay vì OAuth trong trình duyệt — Sam không phải nhập Client ID, không phải cấp quyền mỗi máy.
- Thư mục đích do **máy chủ** quyết (`SAM_DRIVE_PARENT` + `SAM_DRIVE_FOLDER`); client không được chọn thư mục. Thiếu biến môi trường thì fail-closed, không lặng lẽ ghi vào gốc Drive.
- `src/board.mjs` 615 dòng và `board.css` ~670 dòng, vượt hướng dẫn ~150 dòng/file của dự án. Ghi nhận là nợ kỹ thuật có chủ ý: tách module sau khi trạng thái đang xanh được Sam duyệt, không refactor chung một phiên với thay đổi hành vi.

### Next

- 11 file PNG thử nghiệm do các vòng verify sinh ra đang nằm trong `_VeBangDayHoc` — **không tự xoá** (luật backup trước khi xoá + đó là dữ liệu trên Drive của Sam). Sam xoá tay nếu muốn.
- Tách `src/board.mjs` / `board.css` thành module nhỏ.
- Chưa kiểm màn HiDPI thật (CDP override `deviceScaleFactor = 1`), chưa kiểm bút cảm ứng vật lý, chưa kiểm toast trên mobile thật (chỉ đặt CSS theo số đo desktop).

### Bổ sung 08:30 — mô phỏng bút cảm ứng và ngón tay

Sam hỏi có giả lập bút cảm ứng để test được không. Được, qua CDP: `Input.dispatchTouchEvent` cho ngón tay và `Input.dispatchMouseEvent` với `pointerType: "pen"` + `force` + `tiltX/tiltY` cho bút. Harness mới: `tests/ui/capture-but-cam-ung.mjs`, chạy ở `390x844`, `deviceScaleFactor 2`, `Emulation.setTouchEmulationEnabled maxTouchPoints 5`.

**PASS 7 ảnh** (`report/UXQA/but-cam-ung-20260908/`), số đo:

- Canvas mobile thật `780x1688` (dpr 2), `touch-action: none`, `overscroll-behavior: none`, `navigator.maxTouchPoints = 5`.
- Ngón tay: pixel sáng `0 → 5373`, đúng **1 nét** sinh ra.
- Kéo ngón tay **không làm trang xê dịch**: `scrollY 0`, `scrollTop 0`, `body.top 0`.
- Bút: pixel sáng `5373 → 10216`, đúng 2 nét. Trang nhận được `pointerdown` cả hai loại — bắt tại canvas: `{loai: "touch", luc: 0.6}` và `{loai: "pen", luc: 0.75, nghieng: [12, -8]}` → đường Pointer Events xử lý đúng `pointerType` và mang được lực nhấn + độ nghiêng.
- **Kê bàn tay rồi viết bút** (điểm cảm ứng `radius 46`, `force .95` đang giữ, bút viết đồng thời): số nét `2 → 3`, pixel sáng `10216 → 14258`. Xem ảnh `04`: chỉ có nét bút xuất hiện, **bàn tay không vẽ ra nét rác nào** — pointer sau chiếm quyền nên nét dở của bàn tay bị bỏ.
- Tẩy bằng ngón tay: số nét `3 → 2`, pixel sáng `14258 → 8893`.
- Chạm nút bằng ngón tay: `Ẩn thanh công cụ` → `opacity 0`; chạm viên pill `☰` → `opacity 1`. Trên `≤720px` pill thu về nút tròn chỉ có `☰` (có `aria-label` đầy đủ).

**Bẫy của chính harness, đã sửa:** (1) đọc số nét ngay sau khi vẽ thì thiếu đúng một nét vì trang throttle ghi sổ 500ms → phải chờ 700ms; (2) `touchStart` rồi `touchEnd` liền không nhịp thì Chromium **không tổng hợp ra `click`** nên chạm nút vô hiệu → phải giữ ~90ms.

**Giới hạn phải nói thẳng:** đây là sự kiện tổng hợp. Nó chứng minh trang xử lý đúng `pointerType` touch/pen, KHÔNG thay được bút số hoá thật — đường cong lực nhấn của phần cứng, chống kê tay ở tầng driver, và hành vi riêng của Safari trên iPad vẫn chưa kiểm.

---

## 2026-09-07 21:29 → 22:05 (Asia/Bangkok)

- **Trace-ID**: `20260907-2135-samteachingvisual-bangden`
- **system_id**: `SamTeachingVisual`
- **Request**: Sam yêu cầu một tính năng đơn giản — màn hình nền đen viết/vẽ trực tiếp lên — và deploy test lên `day.samnguyenphoto.com`, dùng skill caddy-domain-setup với SSH alias.
- **Scope**: `board.html`, `board.css`, `src/board.mjs`, `src/drawing.mjs`, `scripts/build.mjs`, `scripts/check.mjs`, `deploy/day.samnguyenphoto.com/**`, `tests/ui/capture-board.mjs`.
- **Branch**: `feat/bang-den` (từ `origin/main` @ `09ecce9`).

### Actions

1. Clone repo về `D:/New_System_AI/Sam_QuayManHinhDayHoc`; `.git` cũ bị hỏng (không resolve được HEAD) đã chuyển sang `D:/New_System_AI/_quarantine/Sam_QuayManHinhDayHoc_broken_git_20260907` chứ không xoá.
2. `DrawingBoard` được mở rộng nhận `options.width/height` + `setSize()`; mặc định vẫn `1600x900` nên `app.mjs` (studio) không đổi hành vi.
3. Trang bảng đen mới: canvas phủ toàn viewport theo `devicePixelRatio` (chặn ở 2), nền `#000`, `touch-action: none`; thanh công cụ nổi gồm Bút/Tẩy, 6 màu, thanh độ dày, Hoàn tác, Xoá bảng, Lưu ảnh PNG, Toàn màn hình, Ẩn thanh công cụ, link Studio; phím tắt `H/F/E/B/P/Ctrl+Z/Ctrl+Shift+Z`; tự lưu scene vào `localStorage`.
4. Sửa lỗi Windows trong `scripts/build.mjs` và `scripts/check.mjs`: `new URL("..").pathname` cho ra `D:\D:\...` làm `npm run build`/`npm run lint` chết → dùng `fileURLToPath`. `check.mjs` thêm assert id của `board.html` và assert `touch-action` trong `board.css`.
5. Deploy: `dist/` + `scripts/serve.mjs` → `/srv/day.samnguyenphoto.com` trên `infiniti-vps`; systemd `sam-teaching-visual-day.service` chạy `node scripts/serve.mjs --dist` port `4890`; Caddy `conf.d/day.samnguyenphoto.com.caddy` (`http://` prefix, 3 `rewrite`, `reverse_proxy 172.17.0.1:4890`) + dòng `import` vào `Caddyfile.app`, `caddy validate`, `docker restart caddy-supabase-proxy`.

### Lỗi tìm ra bằng ảnh UI thật rồi sửa

| Lỗi | Bằng chứng | Sửa |
|---|---|---|
| Ô màu trắng đang sáng nhưng nét vẽ ra màu vàng (`DrawingBoard` mặc định `#ffd43b`, trang không áp màu của ô active) | ảnh `03` vòng 1: cả 3 nét đều vàng | `src/board.mjs` đọc `dataset.color` của ô `.active` lúc nạp trang rồi `setColor` |
| Mobile 390px: 6 nút (Hoàn tác, Xoá bảng, Lưu ảnh PNG, Toàn màn hình, Ẩn thanh công cụ, Studio) nằm ngoài màn hình vì thanh công cụ cuộn ngang và ẩn scrollbar | ảnh `09` vòng 1 chỉ thấy Bút/Tẩy/6 ô màu | `board.css` thêm `@media (max-width: 720px)`: `flex-wrap: wrap`, `overflow: visible`, `max-width: calc(100vw - 20px)` |
| Mobile 390px: dòng gợi ý bị cắt hai đầu ("oặc bút để viết … Ctrl+") | ảnh `09` vòng 1 | cùng breakpoint: `white-space: normal`, `max-width: calc(100vw - 28px)`, `font-size: 12px` |
| Vẽ nét cuối rồi rời trang trong 500 ms là mất nét (throttle tự lưu chỉ có trailing edge) | vòng 3 đo `lit 3049 → 0` sau reload | `src/board.mjs` giữ `pendingScene` + `writeScene()`, flush trên `pagehide` và `visibilitychange: hidden` |

### Verify

- `npm run check` PASS (lint + 23 test + build) trên Windows.
- 4 cổng smoke trong `deploy.sh` PASS: `127.0.0.1:4890/board.html` 200 · Host-header `/`, `/bang-den`, `/studio` qua Caddy 200 · `https://day.samnguyenphoto.com/` 200.
- Smoke UI thật `node tests/ui/capture-board.mjs https://day.samnguyenphoto.com report/UXQA/bang-den-20260907`: **PASS**, 11 ảnh + `index.json`. Số đo: nền `rgb(0,0,0)`, `touch-action: none`, canvas phủ hết viewport, pixel sáng `0 → 11798` sau khi vẽ, màu nét trội `#ffffff` khớp ô active `#ffffff`, đổi vàng đo được `rgb(255,212,58)`, hoàn tác về `11787`, ẩn thanh công cụ `opacity 0` và mở lại `opacity 1`, mobile `overflowX 0` / `toolbarHiddenOverflow 0` / `hintHiddenOverflow 0` / `offscreenControls []` / nút thấp nhất `32px`, tự lưu `3049 → 3049` sau reload, xoá bảng còn `0` pixel sáng, `/studio` vẫn có `#drawingCanvas` + `#recordBtn`.
- Ảnh đã được coordinator tự mở xem (`01`, `02`, `03`, `09`) và một agent Antigravity độc lập chấm 11/11 ảnh + 12/12 tiêu chí → `GATE PASS`, một ghi chú MINOR về khoảng cách nút Tẩy/ô trắng trên mobile.

### Decision

- Bảng đen là trang riêng (`board.html`) chứ không sửa studio; tái dùng `DrawingBoard` thay vì viết engine vẽ thứ hai.
- `day.samnguyenphoto.com/` phục vụ bảng đen (thứ Sam mở ra để test), studio giữ ở `/studio`.
- Static server node + `reverse_proxy` thay vì thêm bind mount vào container Caddy — không phải tạo lại container đang phục vụ hàng chục domain.

### Next

- MINOR: nới khoảng cách nút Tẩy ↔ ô màu trắng trên mobile.
- Chưa kiểm trên màn HiDPI thật (CDP override `deviceScaleFactor = 1`) và chưa kiểm bút cảm ứng vật lý.
