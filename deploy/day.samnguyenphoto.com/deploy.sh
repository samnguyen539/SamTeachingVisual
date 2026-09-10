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
echo "==> [1/11] Chạy npm run build tại gốc repo..."
(cd "$REPO_ROOT" && npm run build)

# 2. Đóng gói dist/ + các script runtime cần thiết bằng tar czf - rồi ssh gửi sang TARGET
echo "==> [2/11] Đóng gói dist/ và scripts runtime, đẩy lên $REMOTE:$TARGET..."
tar -czf - -C "$REPO_ROOT" dist scripts/serve.mjs scripts/drive-upload.mjs scripts/api-luu-drive.mjs scripts/xac-thuc.mjs scripts/api-dang-nhap.mjs scripts/api-so-tay.mjs src/hop-nhat-so-tay.mjs | ssh "$REMOTE" "mkdir -p '$TARGET' && tar -xzf - -C '$TARGET'"

# 3. Cấu hình biến môi trường đăng nhập (/etc/sam-teaching-visual-day.env)
echo "==> [3/11] Kiểm tra và thiết lập file cấu hình đăng nhập trên VPS..."
if [ -n "${SAM_BOARD_PASSWORD:-}" ]; then
  echo "    Đang tạo băm mật khẩu và cấu hình /etc/sam-teaching-visual-day.env..."
  SAM_USER="${SAM_BOARD_USERNAME:-samnguyen}"
  HASH_PASS=$(MAT_KHAU="$SAM_BOARD_PASSWORD" node "$REPO_ROOT/scripts/xac-thuc.mjs" --bam)
  printf "%s\n%s\n" "$SAM_USER" "$HASH_PASS" | ssh "$REMOTE" 'set -euo pipefail
read -r USER_NAME
read -r PASS_HASH
ENV_FILE="/etc/sam-teaching-visual-day.env"
SECRET=""
if [ -f "$ENV_FILE" ]; then
  SECRET=$(grep "^SAM_BOARD_SECRET=" "$ENV_FILE" | cut -d"=" -f2- || true)
fi
if [ -z "$SECRET" ]; then
  SECRET=$(openssl rand -hex 32)
fi
cat > "$ENV_FILE" << ENV_EOF
SAM_BOARD_USER=${USER_NAME}
SAM_BOARD_PASS=${PASS_HASH}
SAM_BOARD_SECRET=${SECRET}
ENV_EOF
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
echo "    Đã cập nhật $ENV_FILE an toàn."'
else
  echo "    SAM_BOARD_PASSWORD không có giá trị, giữ nguyên file env trên $REMOTE..."
  ssh "$REMOTE" 'if [ ! -f /etc/sam-teaching-visual-day.env ]; then echo "[-] CẢNH BÁO: /etc/sam-teaching-visual-day.env chưa tồn tại trên VPS! Cần deploy với SAM_BOARD_PASSWORD để khởi tạo."; fi'
fi

# 4. Cài unit systemd: cat file vào /etc/systemd/system/, daemon-reload, enable --now, restart
echo "==> [4/11] Cài đặt systemd unit sam-teaching-visual-day.service..."
ssh "$REMOTE" "mkdir -p '$TARGET/du-lieu/anh-chup'"
ssh "$REMOTE" "cat > /etc/systemd/system/sam-teaching-visual-day.service" < "$SCRIPT_DIR/sam-teaching-visual-day.service"
ssh "$REMOTE" "systemctl daemon-reload && systemctl enable --now sam-teaching-visual-day.service && systemctl restart sam-teaching-visual-day.service"

# 5. Smoke nội bộ: Mốc 1 (curl port 4890 /board.html - kỳ vọng 302 chuyển hướng)
echo "==> [5/11] Smoke nội bộ port $PORT trên VPS (Mốc 1)..."
SMOKE1_CODE=""
for _ in $(seq 1 5); do
  SMOKE1_CODE=$(ssh "$REMOTE" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/board.html || true")
  if [ "$SMOKE1_CODE" = "302" ]; then
    break
  fi
  sleep 1
done

if [ "$SMOKE1_CODE" != "302" ]; then
  echo "[-] LỖI: Smoke nội bộ port $PORT thất bại (HTTP code: $SMOKE1_CODE, kỳ vọng 302)"
  echo "[-] Log systemd gần nhất (journalctl -u sam-teaching-visual-day -n 40):"
  ssh "$REMOTE" "journalctl -u sam-teaching-visual-day -n 40 --no-pager || true"
  exit 1
fi
echo "[+] Mốc 1: Smoke nội bộ port $PORT PASS (HTTP $SMOKE1_CODE, đã chuyển hướng đăng nhập)"

# 6. Smoke nội bộ: Mốc 6 (curl / kỳ vọng 302, curl /dang-nhap kỳ vọng 200)
echo "==> [6/11] Smoke cổng đăng nhập nội bộ port $PORT (Mốc 6)..."
SMOKE6_ROOT=$(ssh "$REMOTE" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/ || true")
SMOKE6_LOGIN=$(ssh "$REMOTE" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/dang-nhap || true")
if [ "$SMOKE6_ROOT" != "302" ] || [ "$SMOKE6_LOGIN" != "200" ]; then
  echo "[-] LỖI: Smoke Mốc 6 cổng đăng nhập thất bại (root: $SMOKE6_ROOT [kỳ vọng 302], dang-nhap: $SMOKE6_LOGIN [kỳ vọng 200])"
  echo "[-] Log systemd gần nhất (journalctl -u sam-teaching-visual-day -n 40):"
  ssh "$REMOTE" "journalctl -u sam-teaching-visual-day -n 40 --no-pager || true"
  exit 1
fi
echo "[+] Mốc 6: Smoke cổng đăng nhập PASS (root HTTP $SMOKE6_ROOT -> 302, dang-nhap HTTP $SMOKE6_LOGIN -> 200)"

# 7. Smoke nội bộ: Mốc 5 (curl POST /api/luu-drive chưa có cookie kỳ vọng 401 CHUA_DANG_NHAP)
echo "==> [7/11] Smoke API nội bộ port $PORT /api/luu-drive (Mốc 5)..."
SMOKE5_OUTPUT=$(ssh "$REMOTE" "curl -s -X POST http://127.0.0.1:${PORT}/api/luu-drive -H 'content-type: application/json' -d '{\"files\":[]}' -o /dev/stdout -w ' HTTP:%{http_code}' || true")
echo "    Kết quả: $SMOKE5_OUTPUT"
if ! echo "$SMOKE5_OUTPUT" | grep -qF "HTTP:401"; then
  echo "[-] LỖI: Smoke API /api/luu-drive thất bại (kỳ vọng HTTP:401, nhận: $SMOKE5_OUTPUT)"
  echo "[-] Log systemd gần nhất (journalctl -u sam-teaching-visual-day -n 40):"
  ssh "$REMOTE" "journalctl -u sam-teaching-visual-day -n 40 --no-pager || true"
  exit 1
fi
echo "[+] Mốc 5: Smoke API /api/luu-drive PASS (HTTP 401, từ chối khi chưa đăng nhập)"

# Smoke nội bộ: Mốc 8 (curl GET /api/so-tay chưa có cookie kỳ vọng 401 CHUA_DANG_NHAP)
echo "==> Smoke API nội bộ port $PORT /api/so-tay (Mốc 8)..."
SMOKE8_CODE=$(ssh "$REMOTE" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/api/so-tay || true")
if [ "$SMOKE8_CODE" != "401" ]; then
  echo "[-] LỖI: Smoke API /api/so-tay thất bại (kỳ vọng HTTP 401, nhận: $SMOKE8_CODE)"
  echo "[-] Log systemd gần nhất (journalctl -u sam-teaching-visual-day -n 40):"
  ssh "$REMOTE" "journalctl -u sam-teaching-visual-day -n 40 --no-pager || true"
  exit 1
fi
echo "[+] Mốc 8: Smoke API /api/so-tay PASS (HTTP 401, từ chối khi chưa đăng nhập)"

# 8. Cài caddy conf: copy file .caddy vào conf.d/, backup Caddyfile.app, append import nếu chưa có
echo "==> [8/11] Cài đặt Caddy configuration (conf.d/${DOMAIN}.caddy)..."
ssh "$REMOTE" "mkdir -p /root/caddy/conf.d"
ssh "$REMOTE" "cat > /root/caddy/conf.d/${DOMAIN}.caddy" < "$SCRIPT_DIR/${DOMAIN}.caddy"

TIMESTAMP=$(ssh "$REMOTE" "date +%Y%m%d_%H%M%S")
BACKUP_FILE="/root/caddy/Caddyfile.app.bak_day_${TIMESTAMP}"
IMPORT_LINE="import /etc/caddy/conf.d/${DOMAIN}.caddy"

ssh "$REMOTE" "cp /root/caddy/Caddyfile.app '$BACKUP_FILE'"
echo "    Đã tạo backup Caddyfile.app tại: $BACKUP_FILE"

ssh "$REMOTE" "if ! grep -qF '$IMPORT_LINE' /root/caddy/Caddyfile.app; then echo '$IMPORT_LINE' >> /root/caddy/Caddyfile.app; echo '    Đã thêm dòng import vào Caddyfile.app.'; else echo '    Dòng import đã tồn tại trong Caddyfile.app, bỏ qua append.'; fi"

# 9. Validate Caddy config, rollback nếu fail
echo "==> [9/11] Kiểm tra cấu hình Caddy bằng caddy validate..."
VALIDATE_OUTPUT=$(ssh "$REMOTE" "docker exec caddy-supabase-proxy caddy validate --config /etc/caddy/Caddyfile 2>&1" || true)
echo "$VALIDATE_OUTPUT"
if ! echo "$VALIDATE_OUTPUT" | grep -qF "Valid configuration"; then
  echo "[-] LỖI: Cấu hình Caddy không hợp lệ! Đang rollback Caddyfile.app từ backup..."
  ssh "$REMOTE" "cp '$BACKUP_FILE' /root/caddy/Caddyfile.app"
  exit 1
fi
echo "[+] Caddy validate thành công!"

# 10. Khởi động lại Caddy container
echo "==> [10/11] Khởi động lại container Caddy (docker restart caddy-supabase-proxy)..."
ssh "$REMOTE" "docker restart caddy-supabase-proxy"
echo "    Đợi 6 giây để container Caddy ổn định..."
sleep 6

# 11. Smoke qua Caddy trên VPS và ngoài internet
echo "==> [11/11] Smoke qua Caddy trên VPS và ngoài internet..."
# Mốc 2: Host header qua port 80 tại '/' (kỳ vọng 302)
SMOKE2_CODE=$(ssh "$REMOTE" "curl -s -H 'Host: $DOMAIN' http://127.0.0.1:80/ -o /dev/null -w '%{http_code}' || true")
if [ "$SMOKE2_CODE" != "302" ]; then
  echo "[-] LỖI: Smoke Caddy Host header '/' thất bại (HTTP code: $SMOKE2_CODE, kỳ vọng 302)"
  exit 1
fi
echo "[+] Mốc 2: Smoke Caddy Host header '/' PASS (HTTP $SMOKE2_CODE, chuyển hướng đăng nhập)"

# Mốc 3: Host header qua port 80 tại '/bang-den' và '/studio' (kỳ vọng 302)
SMOKE3_BANGDEN_CODE=$(ssh "$REMOTE" "curl -s -H 'Host: $DOMAIN' http://127.0.0.1:80/bang-den -o /dev/null -w '%{http_code}' || true")
if [ "$SMOKE3_BANGDEN_CODE" != "302" ]; then
  echo "[-] LỖI: Smoke Caddy Host header '/bang-den' thất bại (HTTP code: $SMOKE3_BANGDEN_CODE, kỳ vọng 302)"
  exit 1
fi
echo "[+] Mốc 3a: Smoke Caddy Host header '/bang-den' PASS (HTTP $SMOKE3_BANGDEN_CODE)"

SMOKE3_STUDIO_CODE=$(ssh "$REMOTE" "curl -s -H 'Host: $DOMAIN' http://127.0.0.1:80/studio -o /dev/null -w '%{http_code}' || true")
if [ "$SMOKE3_STUDIO_CODE" != "302" ]; then
  echo "[-] LỖI: Smoke Caddy Host header '/studio' thất bại (HTTP code: $SMOKE3_STUDIO_CODE, kỳ vọng 302)"
  exit 1
fi
echo "[+] Mốc 3b: Smoke Caddy Host header '/studio' PASS (HTTP $SMOKE3_STUDIO_CODE)"

# Mốc 4: Smoke ngoài internet (kỳ vọng 302 chưa đăng nhập)
SMOKE4_CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://${DOMAIN}/" || true)
if [ "$SMOKE4_CODE" != "302" ]; then
  echo "[-] LỖI: Smoke ngoài internet 'https://${DOMAIN}/' thất bại (HTTP code: $SMOKE4_CODE, kỳ vọng 302)"
  exit 1
fi
echo "[+] Mốc 4: Smoke ngoài internet 'https://${DOMAIN}/' PASS (HTTP $SMOKE4_CODE)"

echo ""
echo "================================================================="
echo "  DEPLOY HOÀN TẤT THÀNH CÔNG!"
echo "  Trang web đã sẵn sàng trên VPS và internet:"
echo "  - Cổng đăng nhập:     https://${DOMAIN}/dang-nhap"
echo "  - Bảng đen:           https://${DOMAIN}/"
echo "  - Bảng đen (alias):   https://${DOMAIN}/bang-den"
echo "  - Studio giảng dạy:   https://${DOMAIN}/studio"
echo "  - API Lưu Drive:      https://${DOMAIN}/api/luu-drive"
echo "  - API Sổ tay đồng bộ: https://${DOMAIN}/api/so-tay"
echo "================================================================="
