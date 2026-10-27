# KudoX Mess x Tele Bridge 🚀
> Hệ thống cầu nối đồng bộ 2 chiều Facebook Messenger $\leftrightarrow$ Telegram Forum Topics kế thừa toàn bộ công nghệ lõi **KudoX Stealth Engine**.

---

## 🌟 Điểm nâng cấp công nghệ từ KudoX

1. **KudoX Stealth Browser Session**:
   - Sử dụng phiên Chromium tích hợp kênh Chrome thật (`channel: 'chrome'`), loại bỏ cờ tự động hóa `navigator.webdriver`.
   - Tự động dọn dẹp các tệp khóa lockfile thừa (`SingletonLock`, `parent.lock`) tránh kẹt trình duyệt khi khởi động lại.
   - Lưu trữ phiên Facebook vĩnh viễn trong `.user-data/fb-profile` (không bao giờ phải đăng nhập lại).

2. **KudoX Checkpoint Guard**:
   - Tự động nhận diện 5 trạng thái tài khoản: `CHECKPOINT`, `SUSPENDED`, `TWO_FACTOR`, `LOGIN_REQUIRED`, `RATE_LIMITED`.
   - Cảnh báo an toàn và dừng khẩn cấp trước khi tài khoản bị khóa.

3. **KudoX High-Precision Messenger Parser**:
   - Bộ lọc thông minh loại bỏ 100% từ rác giao diện (như *"Đang hoạt động"*, *"Tin nhắn chưa đọc"*, *"18 giờ"*, v.v.).
   - Trích xuất chuẩn xác **Tên khách hàng**, **UID** và **Nội dung tin nhắn** thực tế.

4. **KudoX Human Behavior Simulation**:
   - Mô phỏng hành vi gõ phím của người thật với tốc độ biến thiên ngẫu nhiên (25ms - 75ms) cùng các khoảng vi nghỉ tự nhiên.

5. **KudoX Live Web Dashboard**:
   - Bảng điều khiển Web trực quan tại: `http://localhost:3300`.
   - Theo dõi danh sách khách hàng, số lượng hội thoại và trạng thái hệ thống theo thời gian thực.

---

## 📁 Cấu trúc thư mục

```text
D:\KudoX_Mess_Tele/
├── Chay_KudoX_Bridge.bat      # Bấm 1 phát để chạy toàn bộ hệ thống
├── Mo_Giao_Dien_Web.bat       # Mở trang Web Dashboard (http://localhost:3300)
├── .env                       # Cấu hình Token Bot & Nhóm Telegram
├── .user-data/fb-profile/     # Thư mục lưu Profile Facebook KudoX Stealth
├── data/
│   └── mappings.json          # Cơ sở dữ liệu lưu ánh xạ FB_UID <-> Telegram_Topic_ID
└── src/
    ├── config/env.ts          # Cấu hình môi trường
    ├── core/
    │   ├── browser-session.ts # KudoX Stealth Browser Launcher
    │   ├── checkpoint-guard.ts# Bộ bảo vệ Checkpoint Facebook
    │   └── human-behavior.ts  # Bộ mô phỏng hành vi người thật
    ├── db/store.ts            # Quản lý Database & Anti-Echo Guard
    ├── engine/
    │   └── messenger-engine.ts# Bộ máy bóc tách và gửi tin Messenger chuẩn xác
    ├── telegram/
    │   └── bot.ts             # Quản lý Telegram Bot & Forum Topics
    ├── ui/
    │   └── dashboard.ts       # Giao diện Web Dashboard cục bộ
    └── index.ts               # Điểm khởi động chính
```
