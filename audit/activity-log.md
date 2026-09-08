# SamTeachingVisual — Execution Log

Nhật ký thực thi canonical của repo này. Mỗi thay đổi mã, cấu hình, deploy hoặc nghiệm thu ghi một entry. Không ghi secret/token.

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
