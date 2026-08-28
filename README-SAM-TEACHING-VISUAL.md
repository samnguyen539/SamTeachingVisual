# Sam Teaching Visual

Ứng dụng giảng dạy chạy trực tiếp trên trình duyệt dành cho Sam Nguyễn: trình chiếu hình/video, vẽ chú thích, ghi bảng hoặc màn hình cùng micro/webcam, tự lưu chunk cục bộ, tải Google Drive và dựng master/highlight bằng FFmpeg.

## Chạy tại máy

Yêu cầu Node.js 20+.

```bash
npm run check
npm run serve
```

Mở `http://localhost:4173`.

Ứng dụng không dùng dependency npm bên ngoài. `npm run build` chỉ sao chép allowlist tệp tĩnh vào `dist/`.

## Google Drive

1. Google Cloud Console → tạo OAuth 2.0 Client ID loại **Web application**.
2. Thêm origin triển khai, ví dụ `https://your-domain.example`.
3. Mở mục **Cấu hình Google Drive** trong ứng dụng và nhập Client ID có đuôi `.apps.googleusercontent.com`.
4. Bấm **Kết nối Google Drive**.

Không nhập Client Secret hoặc access token vào source code. Scope mặc định là `drive.file`.

## Gói buổi học trên Drive

Mỗi buổi học tạo một thư mục gồm:

- `*-recording.webm` hoặc `.mp4`
- `scene.json`
- `manifest.json`
- `render-plan.json`

## Tự động dựng video

```bash
docker build -f Dockerfile.worker -t sam-teaching-renderer .
docker run --rm \
  -v "$PWD/session:/data" \
  sam-teaching-renderer \
  --input /data/recording.webm \
  --plan /data/render-plan.json \
  --out /data/render-output
```

Đầu ra:

- `lesson-master.mp4`: bỏ các đoạn được đánh dấu “Cắt lỗi”.
- `lesson-highlight.mp4`: tổng hợp Chương mới, Quan trọng, Thực hành và CTA.
- `render-report.json`: báo cáo máy đọc được.

## Kiểm thử và build

```bash
npm run lint
npm test
npm run build
npm run check
```

`npm run lint` kiểm tra cú pháp, quét credential và chặn tuyệt đối `.github/workflows`. Dự án không dùng GitHub Actions theo yêu cầu.

## Trình duyệt hỗ trợ

Khuyến nghị Chrome hoặc Edge phiên bản mới trên desktop. Ghi màn hình yêu cầu HTTPS hoặc localhost và luôn cần thao tác cấp quyền của người dùng.
