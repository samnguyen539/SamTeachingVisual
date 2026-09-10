// Service worker của Sam Teaching Visual.
//
// BẢN v1 DÙNG CHIẾN LƯỢC "CACHE TRƯỚC, MẠNG SAU" cho MỌI GET cùng origin, và
// đăng ký ở phạm vi "/" nên nó nuốt luôn cả trang bảng đen. Hậu quả đo được:
// mỗi lần deploy xong, trình duyệt vẫn chạy `board.mjs` cũ lấy từ cache và chỉ
// cập nhật ở lần tải SAU — tức là luôn chậm một bản. Sam sửa lỗi xong tải lại
// vẫn thấy lỗi y nguyên.
//
// v2: mạng trước, cache chỉ là lưới đỡ khi mất mạng; và tuyệt đối không đụng
// vào trang bảng, trang đăng nhập hay API.
const CACHE_NAME = "sam-teaching-visual-v2";
const APP_SHELL = ["/index.html", "/styles.css", "/core.mjs", "/app.mjs", "/src/storage.mjs", "/src/drawing.mjs", "/src/drive.mjs", "/src/recorder.mjs", "/manifest.webmanifest", "/icons/app-icon.svg"];

// Những đường dẫn service worker KHÔNG được xen vào: bảng đen (Sam đang dạy,
// phải luôn là bản mới nhất), đăng nhập, và mọi API.
const KHONG_DUNG_TOI = [/^\/api\//, /^\/dang-nhap/, /^\/board\.html$/, /^\/board\.css$/, /^\/bang-den$/, /^\/src\/board\.mjs$/, /^\/config\.js$/, /^\/$/];

const boQua = (pathname) => KHONG_DUNG_TOI.some((mau) => mau.test(pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || boQua(url.pathname)) return;

  // Mạng trước: deploy xong là lần tải kế tiếp đã có bản mới. Mất mạng thì mới
  // rơi về cache để studio vẫn mở được.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const banSao = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, banSao)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
