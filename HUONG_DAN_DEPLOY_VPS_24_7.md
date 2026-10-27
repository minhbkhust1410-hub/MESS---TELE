# 🚀 HƯỚNG DẪN TRIỂN KHAI FALCONX TREO VPS CHẠY 24/24 & ĐĂNG NHẬP TRÊN WEB

Tài liệu này hướng dẫn bạn cách đưa hệ thống **FalconX BĐS & Social Automation** lên VPS (máy chủ ảo) để treo tool chạy liên tục 24/24 ngày đêm, không phụ thuộc vào máy tính cá nhân, và có thể truy cập đăng nhập điều hành qua Web từ điện thoại hay máy tính bất cứ nơi nào.

---

## 🖥️ 1. Yêu Cầu Cấu Hình VPS Khuyên Dùng

- **Hệ điều hành**: **Ubuntu 22.04 LTS** (Khuyên dùng vì nhẹ, mượt, tiết kiệm chi phí) hoặc **Windows Server 2019/2022**.
- **CPU**: Tối thiểu 2 Core.
- **RAM**: Tối thiểu **2 GB** (Khuyên dùng **4 GB** để chạy Chromium mượt mà khi quét nhóm & OCR ảnh).
- **Ổ cứng (SSD)**: Tối thiểu 30 GB.
- **Đơn vị cung cấp uy tín**: Vietnix, KDATA, TinoHost, Linode, DigitalOcean, Hetzner, Vultr (chi phí khoảng 100k - 200k/tháng).

---

## ⚡ 2. Triển Khai Trên VPS Ubuntu Linux (Khuyên Dùng - Tự Động 1-Click)

### Bước 2.1: Tải mã nguồn lên VPS
Bạn có thể nén thư mục dự án thành file `.zip` (trừ thư mục `node_modules` cho nhẹ) rồi dùng công cụ **MobaXterm** hoặc **FileZilla** kéo thả lên thư mục `/var/www/falconx` trên VPS. Hoặc dùng Git:
```bash
cd /var/www
git clone <link_repo_cua_ban> falconx
cd falconx
```

### Bước 2.2: Chạy script tự động 1-Click
Trong thư mục dự án trên VPS, bạn chỉ cần gõ lệnh sau:
```bash
chmod +x setup_vps_ubuntu.sh
./setup_vps_ubuntu.sh
```
Script sẽ tự động:
1. Cài đặt Node.js 20+ LTS và các gói đồ họa Chromium cho Linux.
2. Cài đặt trình quản lý tiến trình **PM2**.
3. Cài đặt thư viện và Playwright Chromium.
4. Mở tường lửa (Port 3300).
5. Kích hoạt dịch vụ chạy nền **vĩnh viễn 24/24** tự hồi sinh khi khởi động lại VPS.

---

## 🪟 3. Triển Khai Trên VPS Windows Server

Nếu bạn thuê VPS Windows:
1. Kết nối vào VPS bằng **Remote Desktop Connection (RDP)**.
2. Tải và cài đặt **Node.js LTS** từ [https://nodejs.org](https://nodejs.org).
3. Copy toàn bộ thư mục dự án lên ổ `C:\FalconX`.
4. Nhấp đúp chuột vào file:
   ```text
   deploy_vps_windows.bat
   ```
5. Hệ thống sẽ tự động cài đặt, biên dịch và chạy tool 24/24. Nếu lỡ tay tắt hoặc crash, script sẽ tự động khởi động lại sau 5 giây.

---

## 🔐 4. Đăng Nhập Quản Trị Trên Trình Duyệt Web

Sau khi VPS khởi động, bạn có thể mở trình duyệt trên điện thoại hoặc máy tính và truy cập:

```text
http://<ĐỊA_CHỈ_IP_CỦA_VPS>:3300
```

### Thông tin đăng nhập mặc định:
- **Tài khoản**: `admin`
- **Mật khẩu**: `ecotrang2026`

*(Sau khi đăng nhập, hệ thống sẽ tự động ghi nhớ phiên trên trình duyệt của bạn qua WebCrypto Token 256-bit. Khi cần khóa lại, chỉ cần bấm nút đỏ **🔒 Đăng Xuất** ở góc trên bên phải).*

### Cách đổi mật khẩu quản trị:
Mở file `.env` trên VPS và chỉnh sửa dòng:
```ini
ADMIN_USERNAME=ten_ban_muon
ADMIN_PASSWORD=mat_khau_moi_cua_ban
```
Sau đó khởi động lại bot bằng lệnh:
```bash
pm2 restart falconx-bot
```

---

## 🌐 5. Cấu Hình Tên Miền Riêng & SSL HTTPS Miễn Phí (Nginx + Cloudflare)

Để truy cập qua tên miền đẹp dạng `https://bot.tenmiencuaban.com` có ổ khóa xanh bảo mật:

1. **Trỏ tên miền** về IP của VPS trên trang quản lý DNS (hoặc Cloudflare).
2. **Cài đặt Nginx trên VPS**:
   ```bash
   sudo apt install -y nginx
   ```
3. **Tạo file cấu hình reverse proxy**: `/etc/nginx/sites-available/falconx`
   ```nginx
   server {
       listen 80;
       server_name bot.tenmiencuaban.com;

       location / {
           proxy_pass http://127.0.0.1:3300;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```
4. **Kích hoạt và cài SSL Let's Encrypt**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/falconx /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d bot.tenmiencuaban.com
   ```
Bây giờ bạn có thể truy cập `https://bot.tenmiencuaban.com` từ bất cứ đâu trên thế giới!

---

## 🛠️ 6. Các Lệnh Quản Trị Thường Dùng Khi Treo VPS

| Lệnh | Ý nghĩa |
| :--- | :--- |
| `pm2 status` | Xem trạng thái hoạt động của bot và lượng RAM/CPU tiêu thụ |
| `pm2 logs falconx-bot` | Xem nhật ký hoạt động thời gian thực (realtime logs) |
| `pm2 restart falconx-bot` | Khởi động lại tool |
| `pm2 stop falconx-bot` | Tạm dừng tool |
| `pm2 startup` & `pm2 save` | Lưu cấu hình tự chạy cùng hệ thống khi khởi động lại VPS |
