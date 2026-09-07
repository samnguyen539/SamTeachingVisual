# SamTeachingVisual — Execution Log

Nhật ký thực thi canonical của repo này. Mỗi thay đổi mã, cấu hình, deploy hoặc nghiệm thu ghi một entry. Không ghi secret/token.

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
