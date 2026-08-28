# Kiến trúc Sam Teaching Visual

## Luồng giảng dạy

1. Giáo viên tạo hoặc khôi phục một phiên học.
2. Ảnh/video được lưu trong IndexedDB và hiển thị dưới lớp canvas 1600×900.
3. Nét vẽ được chuẩn hóa về hệ tọa độ 16:9, tự lưu theo scene JSON.
4. Recorder nhận bảng giảng dạy hoặc màn hình/tab, ghép webcam và trộn các nguồn âm thanh.
5. MediaRecorder phát chunk mỗi 5 giây; từng chunk được ghi ngay vào IndexedDB.
6. Marker được lưu theo thời gian thực và chuyển thành `render-plan.json`.
7. Google Drive resumable upload đẩy video, scene, manifest và render plan vào thư mục riêng của buổi học.
8. Worker FFmpeg đọc render plan, loại vùng `cut`, tạo master và highlight.

## Ranh giới module

- `core.mjs`: hợp đồng session, marker, range, codec và upload chunk.
- `src/storage.mjs`: IndexedDB, chunk durability và khôi phục.
- `src/drawing.mjs`: bảng vẽ 1600×900.
- `src/recorder.mjs`: capture, compositor, audio mixer và MediaRecorder.
- `src/drive.mjs`: OAuth `drive.file` và resumable upload.
- `app.mjs`: phối hợp UI và luồng nghiệp vụ.
- `worker/render-worker.mjs`: hậu kỳ FFmpeg không dùng shell interpolation.

## Ranh giới bảo mật

- Frontend chỉ dùng OAuth Web Client ID; tuyệt đối không dùng Client Secret.
- Scope mặc định là `drive.file`.
- Access token chỉ nằm trong bộ nhớ tab, không commit và không đưa vào `config.js`.
- `config.js` luôn `no-store`; service worker không cache tệp này.
- Không có GitHub Actions; build/deploy được kích hoạt trực tiếp từ nền tảng triển khai.

## Khả năng khôi phục

Bản ghi được lưu theo chunk độc lập. Sau sự cố trình duyệt hoặc mất mạng, nút “Khôi phục bản ghi cục bộ” ghép lại các chunk theo chỉ số; recorder chờ mọi pending IndexedDB write hoàn tất trước khi tạo Blob cuối.
