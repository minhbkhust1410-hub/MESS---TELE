# 🌐 CẨM NANG TRIỂN KHAI (DEPLOY) WEB CLOUD 24/7 - TẮT MÁY VẪN TRUY CẬP ĐIỆN THOẠI ĐƯỢC

---

## 💡 I. GIẢI THÍCH NGUYÊN LÝ KỸ THUẬT (VÌ SAO TẮT MÁY LẠI BỊ MẤT WEB?)

- **Cách 1: Chạy Local qua Cloudflare Tunnel (`trycloudflare.com`)**:
  - Web và dữ liệu thực tế đang nằm trong máy tính Windows cá nhân của bạn.
  - Cloudflare Tunnel chỉ là một **"đường ống dẫn tạm thời"** từ máy tính ra internet.
  - **Hạn chế**: Khi bạn tắt máy tính (Shutdown) hoặc gập laptop, máy tính ngừng cấp điện, phần mềm Node.js và đường ống đều tắt ngấm $\rightarrow$ Trên điện thoại bấm vào link sẽ báo lỗi *"Không thể kết nối máy chủ"*.

- **Cách 2: Triển Khai Lên Đám Mây Độc Lập (Cloud Server 24/7)**:
  - Toàn bộ trang Web và mã nguồn được đưa lên **Máy chủ của bên thứ ba** (như Render.com, Vercel, hoặc VPS riêng).
  - Máy chủ này đặt tại Data Center (Singapore / Tokyo / Mỹ) hoạt động liên tục 24/24 giờ/ngày, 365 ngày/năm.
  - **Lợi ích**: Bạn tắt máy tính, đi ngủ, đi chơi, rút phích cắm điện $\rightarrow$ **Trang web trên điện thoại VẪN CHẠY BÌNH THƯỜNG 100%!**

---

## 🚀 II. PHƯƠNG ÁN 1: DEPLOY WEB LÊN CLOUD MIỄN PHÍ TRỌN ĐỜI TRÊN RENDER.COM (KHUYÊN DÙNG)

Render.com là nền tảng máy chủ đám mây hàng đầu thế giới, cung cấp gói Web Service miễn phí vĩnh viễn, tự động cấp link HTTPS riêng.

### Các bước thực hiện (chỉ mất 2 phút):

1. **Bước 1**: Đăng ký tài khoản miễn phí tại [https://render.com](https://render.com) (có thể bấm "Sign in with Google" cho nhanh).
2. **Bước 2**: Tại trang quản lý Render, bấm nút **"New +"** ở góc trên bên phải $\rightarrow$ Chọn **"Web Service"**.
3. **Bước 3**: 
   - Nếu bạn có GitHub: Kết nối tới repository dự án FalconX.
   - Hoặc chọn **"Existing Image"** / **"Public Git Repository"**.
4. **Bước 4**: Điền thông số cấu hình:
   - **Name**: `falconx-bds-pro`
   - **Region**: `Singapore` (để tốc độ tải trên điện thoại ở Việt Nam nhanh nhất)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Chọn **Free** (0$/tháng)
5. **Bước 5**: Bấm **"Deploy Web Service"**!
   - Render sẽ tự động build và cấp cho bạn một đường link cố định vĩnh viễn dạng:
   - 👉 **`https://falconx-bds-pro.onrender.com`**
   - Từ lúc này, bạn tắt máy tính cá nhân thoải mái, bất kỳ lúc nào lấy điện thoại ra mở link trên là vào xem mượt mà 24/7!

---

## 🖥️ III. PHƯƠNG ÁN 2: THUÊ VPS RIÊNG CHẠY 24/24 CHO TOÀN BỘ BOT TỰ ĐỘNG FACEBOOK

Nếu bạn muốn **CẢ CON BOT FACEBOOK** (tự động cào nhóm, tự động nhắn tin Messenger, tự động kết bạn KudoX 2, thả tim story, like 3 bài) chạy liên tục cả ngày lẫn đêm khi máy tính tắt:
- Thuê 1 VPS Linux hoặc Windows (giá khoảng 100.000đ - 150.000đ/tháng tại Vietnix, TinoHost, DigitalOcean).
- Chúng tôi đã viết sẵn script 1-Click:
  - Nếu là VPS Ubuntu: Chạy `./setup_vps_ubuntu.sh`
  - Nếu là VPS Windows: Nhấp đúp chuột vào file `deploy_vps_windows.bat`
- Sau đó truy cập bằng IP của VPS: `http://<IP_VPS>:3300`.

---

## 📱 IV. ĐƯỜNG LINK TRUY CẬP TRỰC TIẾP TRÊN ĐIỆN THOẠI HIỆN TẠI (MÁY ĐANG BẬT)

Trong lúc bạn tham khảo các phương án Cloud trên, hệ thống đang được kích hoạt trực tiếp từ máy tính qua đường hầm Cloudflare Tunnel:

- 🔗 **Link truy cập:** **`https://ties-sauce-debug-mortality.trycloudflare.com`**
- 👤 **Tài khoản quản trị:** `admin`
- 🔑 **Mật khẩu:** `ecotrang2026`
- 🛡️ **Tính năng nổi bật:**
  - Huy hiệu `[🛡️ 7/7 Chức Năng Khớp FB v2026]` trên thanh Header Bar.
  - Ô xem căn mới nạp trong ngày (lọc 5 căn hôm nay).
  - Kho Data 41 khách hàng mục tiêu phân loại rõ BĐS Ecopark & Forex.
  - Nút Hero `🔥 Bắt Đầu Nuôi Tương Tác` KudoX 2 (Kết bạn + Thả tim Story + Like 3 bài viết).
  - Nút chuyển đổi giao diện Sáng Vàng Năng Lượng / Nền Tối.
