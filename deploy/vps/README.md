# Gói triển khai VPS FalconX

Gói này chạy backend Node.js, Telegram bot và Chromium của dự án. Không dùng `cloud_dist`, vì thư mục đó là giao diện và dữ liệu tĩnh.

## Nội dung

- Dockerfile cài dependencies từ `package-lock.json` và Chromium đúng phiên bản Playwright.
- Xvfb giữ cấu hình `HEADLESS=false` trên Linux. Các cửa sổ Facebook chạy trong màn hình ảo; thao tác đăng nhập có giao diện cần bố trí truy cập màn hình riêng trên VPS.
- Compose chạy một instance, tự khởi động lại và lưu `data`, `.user-data`, `.tmp_media` trong các volume riêng.
- Cổng 3300 chỉ mở trên loopback. Cấu hình domain, HTTPS và lớp bảo vệ truy cập sẽ thực hiện sau khi xác định máy chủ.
- `.env.example` chỉ là tên biến, không chứa thông tin đăng nhập thật.

## Trình tự triển khai

1. Xác nhận IP/domain, hệ điều hành, quyền truy cập máy chủ và dịch vụ đang sử dụng cổng 80/443.
2. Giải nén gói nguồn vào thư mục ứng dụng riêng trên máy chủ; kiểm tra Docker Compose nếu dùng phương án container.
3. Tạo `.env` riêng trên máy chủ, điền token Telegram, group ID, mật khẩu quản trị và khóa ký phiên đủ mạnh. Không đưa `.env` vào kho mã nguồn hay gói nguồn.
4. Build image bằng `docker compose build`. Chưa khởi động bot trong bước này.
5. Chốt thời điểm chuyển giao, dừng instance bot trên máy cũ, rồi chuyển dữ liệu và phiên Facebook qua SSH vào các volume. Giữ nguyên topic mapping và topic điều khiển. Đối chiếu đường dẫn profile Windows trước khi chạy trên Linux; không khởi động hai bot dùng cùng token.
6. Khởi động bằng `docker compose up -d`. Kiểm tra log, Telegram và trạng thái Facebook; đăng nhập lại trên VPS nếu phiên không dùng được.
7. Cấu hình HTTPS và bảo vệ toàn bộ đường dẫn ở reverse proxy trước khi mở internet. Đặc biệt, bản ứng dụng hiện có các route debug/nhập dữ liệu được miễn middleware đăng nhập.
8. Kiểm tra từ địa chỉ HTTPS bên ngoài, xác nhận chức năng thật và cơ chế khởi động lại trước khi bàn giao URL.

## Trạng thái chuẩn bị

Gói nguồn không chứa `.env`, dữ liệu khách hàng, cookie Facebook, bản sao lưu, nội dung `cloud_dist` hoặc `node_modules`. Gói chưa bao gồm dữ liệu để chuyển giao bot đang hoạt động.

Docker build và kiểm tra trên VPS chưa thực hiện. Docker daemon trên máy Windows hiện không chạy. Chưa có thông tin truy cập máy chủ nên chưa tạo bản triển khai hay URL công khai.
