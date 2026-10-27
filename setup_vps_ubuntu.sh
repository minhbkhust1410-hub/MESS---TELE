#!/usr/bin/env bash
# ==============================================================================
# FALCONX BĐS AUTOMATION — 1-CLICK VPS SETUP SCRIPT (UBUNTU / DEBIAN)
# Hỗ trợ treo tool 24/24 tự khởi động lại khi crash hoặc khởi động lại VPS
# ==============================================================================

set -e

echo "🚀 [1/6] Đang cập nhật hệ thống và cài đặt gói thư viện cơ sở..."
sudo apt-get update -y
sudo apt-get install -y curl git wget build-essential xvfb libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libpangocairo-1.0-0 libxshmfence1 ufw

echo "📦 [2/6] Đang cài đặt Node.js LTS (v20+)..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "⚡ [3/6] Đang cài đặt trình quản trị tiến trình PM2 toàn cục..."
sudo npm install -g pm2

echo "📥 [4/6] Cài đặt dependencies và Playwright Chromium cho Linux..."
npm install
npx playwright install --with-deps chromium

echo "🔨 [5/6] Biên dịch mã nguồn TypeScript..."
npm run build

echo "🛡️ [6/6] Cấu hình tường lửa mở cổng 3300..."
sudo ufw allow 3300/tcp || true

echo "=============================================================================="
echo "🎉 CÀI ĐẶT HOÀN TẤT! BẬT DỊCH VỤ CHẠY NỀN 24/24 BẰNG PM2..."
echo "=============================================================================="

pm2 start ecosystem.config.cjs
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME || true

echo ""
echo "✅ Tool đang chạy nền vĩnh viễn 24/24!"
echo "🌐 Truy cập Web Dashboard tại: http://<IP_CỦA_VPS>:3300"
echo "🔑 Tài khoản: admin"
echo "🔑 Mật khẩu: ecotrang2026"
echo ""
echo "Các lệnh quản trị tiện ích:"
echo "  - Xem log trực tiếp: pm2 logs falconx-bot"
echo "  - Xem trạng thái:    pm2 status"
echo "  - Khởi động lại:     pm2 restart falconx-bot"
echo "  - Dừng tool:         pm2 stop falconx-bot"
echo "=============================================================================="
