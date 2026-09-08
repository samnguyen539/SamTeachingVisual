#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-infiniti-vps}"
TARGET="/srv/day.samnguyenphoto.com"
PORT="4890"
DOMAIN="day.samnguyenphoto.com"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== Bắt đầu quy trình deploy cho $DOMAIN lên $REMOTE ==="

# 1. Chạy npm run build ở gốc repo; fail thì dừng.
echo "==> [1/10] Chạy npm run build tại gốc repo..."
(cd "$REPO_ROOT" && npm run build)

# 2. Đóng gói dist/ + các script runtime cần thiết bằng tar czf - rồi ssh gửi sang TARGET
echo "==> [2/10] Đóng gói dist/ và scripts runtime, đẩy lên $REMOTE:$TARGET..."
tar -czf - -C "$REPO_ROOT" dist scripts/serve.mjs scripts/drive-upload.mjs scripts/api-luu-drive.mjs | ssh "$REMOTE" "mkdir -p '$TARGET' && tar -xzf - -C '$TARGET'"

# 3. Cài unit systemd: cat file vào /etc/systemd/system/, daemon-reload, enable --now, restart
echo "==> [3/10] Cài đặt systemd unit sam-teaching-visual-day.service..."
ssh "$REMOTE" "cat > /etc/systemd/system/sam-teaching-visual-day.service" < "$SCRIPT_DIR/sam-teaching-visual-day.service"
ssh "$REMOTE" "systemctl daemon-reload && systemctl enable --now sam-teaching-visual-day.service && systemctl restart sam-teaching-visual-day.service"

# 4. Smoke nội bộ: Mốc 1 (curl port 4890 file tĩnh)
echo "==> [4/10] Smoke nội bộ port $PORT trên VPS (Mốc 1)..."
SMOKE1_CODE=""
for _ in $(seq 1 5); do
  SMOKE1_CODE=$(ssh "$REMOTE" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/board.html || true")
  if [ "$SMOKE1_CODE" = "200" ]; then
    break
  fi
  sleep 1
done

if [ "$SMOKE1_CODE" != "200" ]; then
  echo "[-] LỖI: Smoke nội bộ port $PORT thất bại (HTTP code: $SMOKE1_CODE, kỳ vọng 200)"
  echo "[-] Log systemd gần nhất (journalctl -u sam-teaching-visual-day -n 40):"
  ssh "$REMOTE" "journalctl -u sam-teaching-visual-day -n 40 --no-pager || true"
  exit 1
fi
echo "[+] Mốc 1: Smoke nội bộ port $PORT PASS (HTTP $SMOKE1_CODE)"

# 5. Smoke nội bộ: Mốc 5 (curl POST /api/luu-drive kỳ vọng 400 DU_LIEU_SAI)
echo "==> [5/10] Smoke API nội bộ port $PORT /api/luu-drive (Mốc 5)..."
SMOKE5_OUTPUT=$(ssh "$REMOTE" "curl -s -X POST http://127.0.0.1:${PORT}/api/luu-drive -H 'content-type: application/json' -d '{\"files\":[]}' -o /dev/stdout -w ' HTTP:%{http_code}' || true")
echo "    Kết quả: $SMOKE5_OUTPUT"
if ! echo "$SMOKE5_OUTPUT" | grep -qF "HTTP:400"; then
  echo "[-] LỖI: Smoke API /api/luu-drive thất bại (kỳ vọng HTTP:400, nhận: $SMOKE5_OUTPUT)"
  echo "[-] Log systemd gần nhất (journalctl -u sam-teaching-visual-day -n 40):"
  ssh "$REMOTE" "journalctl -u sam-teaching-visual-day -n 40 --no-pager || true"
  exit 1
fi
echo "[+] Mốc 5: Smoke API /api/luu-drive PASS (HTTP 400)"

# 6. Cài caddy conf: copy file .caddy vào conf.d/, backup Caddyfile.app, append import nếu chưa có
echo "==> [6/10] Cài đặt Caddy configuration (conf.d/${DOMAIN}.caddy)..."
ssh "$REMOTE" "mkdir -p /root/caddy/conf.d"
ssh "$REMOTE" "cat > /root/caddy/conf.d/${DOMAIN}.caddy" < "$SCRIPT_DIR/${DOMAIN}.caddy"

TIMESTAMP=$(ssh "$REMOTE" "date +%Y%m%d_%H%M%S")
BACKUP_FILE="/root/caddy/Caddyfile.app.bak_day_${TIMESTAMP}"
IMPORT_LINE="import /etc/caddy/conf.d/${DOMAIN}.caddy"

ssh "$REMOTE" "cp /root/caddy/Caddyfile.app '$BACKUP_FILE'"
echo "    Đã tạo backup Caddyfile.app tại: $BACKUP_FILE"

ssh "$REMOTE" "if ! grep -qF '$IMPORT_LINE' /root/caddy/Caddyfile.app; then echo '$IMPORT_LINE' >> /root/caddy/Caddyfile.app; echo '    Đã thêm dòng import vào Caddyfile.app.'; else echo '    Dòng import đã tồn tại trong Caddyfile.app, bỏ qua append.'; fi"

# 7. Validate Caddy config, rollback nếu fail
echo "==> [7/10] Kiểm tra cấu hình Caddy bằng caddy validate..."
VALIDATE_OUTPUT=$(ssh "$REMOTE" "docker exec caddy-supabase-proxy caddy validate --config /etc/caddy/Caddyfile 2>&1" || true)
echo "$VALIDATE_OUTPUT"
if ! echo "$VALIDATE_OUTPUT" | grep -qF "Valid configuration"; then
  echo "[-] LỖI: Cấu hình Caddy không hợp lệ! Đang rollback Caddyfile.app từ backup..."
  ssh "$REMOTE" "cp '$BACKUP_FILE' /root/caddy/Caddyfile.app"
  exit 1
fi
echo "[+] Caddy validate thành công!"

# 8. Khởi động lại Caddy container
echo "==> [8/10] Khởi động lại container Caddy (docker restart caddy-supabase-proxy)..."
ssh "$REMOTE" "docker restart caddy-supabase-proxy"
echo "    Đợi 6 giây để container Caddy ổn định..."
sleep 6

# 9. Smoke qua Caddy trên VPS: Mốc 2 (root /) và Mốc 3 (/bang-den, /studio)
echo "==> [9/10] Smoke qua Caddy trên VPS..."
# Mốc 2: Host header qua port 80 tại '/'
SMOKE2_CODE=$(ssh "$REMOTE" "curl -s -H 'Host: $DOMAIN' http://127.0.0.1:80/ -o /dev/null -w '%{http_code}' || true")
if [ "$SMOKE2_CODE" != "200" ]; then
  echo "[-] LỖI: Smoke Caddy Host header '/' thất bại (HTTP code: $SMOKE2_CODE, kỳ vọng 200)"
  exit 1
fi
echo "[+] Mốc 2: Smoke Caddy Host header '/' PASS (HTTP $SMOKE2_CODE)"

# Mốc 3: Host header qua port 80 tại '/bang-den' và '/studio'
SMOKE3_BANGDEN_CODE=$(ssh "$REMOTE" "curl -s -H 'Host: $DOMAIN' http://127.0.0.1:80/bang-den -o /dev/null -w '%{http_code}' || true")
if [ "$SMOKE3_BANGDEN_CODE" != "200" ]; then
  echo "[-] LỖI: Smoke Caddy Host header '/bang-den' thất bại (HTTP code: $SMOKE3_BANGDEN_CODE, kỳ vọng 200)"
  exit 1
fi
echo "[+] Mốc 3a: Smoke Caddy Host header '/bang-den' PASS (HTTP $SMOKE3_BANGDEN_CODE)"

SMOKE3_STUDIO_CODE=$(ssh "$REMOTE" "curl -s -H 'Host: $DOMAIN' http://127.0.0.1:80/studio -o /dev/null -w '%{http_code}' || true")
if [ "$SMOKE3_STUDIO_CODE" != "200" ]; then
  echo "[-] LỖI: Smoke Caddy Host header '/studio' thất bại (HTTP code: $SMOKE3_STUDIO_CODE, kỳ vọng 200)"
  exit 1
fi
echo "[+] Mốc 3b: Smoke Caddy Host header '/studio' PASS (HTTP $SMOKE3_STUDIO_CODE)"

# 10. Smoke ngoài internet: Mốc 4 (HTTPS ngoài internet)
echo "==> [10/10] Smoke ngoài internet qua Cloudflare HTTPS (Mốc 4)..."
SMOKE4_CODE=$(curl -sL -o /dev/null -w '%{http_code}' "https://${DOMAIN}/" || true)
if [ "$SMOKE4_CODE" != "200" ]; then
  echo "[-] LỖI: Smoke ngoài internet 'https://${DOMAIN}/' thất bại (HTTP code: $SMOKE4_CODE, kỳ vọng 200)"
  exit 1
fi
echo "[+] Mốc 4: Smoke ngoài internet 'https://${DOMAIN}/' PASS (HTTP $SMOKE4_CODE)"

echo ""
echo "================================================================="
echo "  DEPLOY HOÀN TẤT THÀNH CÔNG!"
echo "  Trang web đã sẵn sàng trên VPS và internet:"
echo "  - Bảng đen (mặc định): https://${DOMAIN}/"
echo "  - Bảng đen (đường dẫn): https://${DOMAIN}/bang-den"
echo "  - Studio giảng dạy:    https://${DOMAIN}/studio"
echo "  - API Lưu Drive:       https://${DOMAIN}/api/luu-drive"
echo "================================================================="
