# KIẾN TRÚC KỸ THUẬT HỆ THỐNG FALCONX MESS x TELE

## 1. Triết Lý Thiết Kế (Design Principles)

1. **Cloud-First & Zero Local Disk Footprint**:
   - Mọi trạng thái dữ liệu (danh sách khách hàng, cấu hình nhóm, quỹ căn, nhật ký tương tác) được lưu trữ trong RAM Virtual File System và định kỳ mã hóa đối xứng `AES-256-GCM` rồi đẩy trực tiếp lên nhánh `cloud-database` trên GitHub.
   - Ổ cứng máy chủ/máy trạm cục bộ chứa `0 Byte` dữ liệu nhạy cảm.

2. **Full Permission & Zero-Restriction Model**:
   - Toàn bộ các API, token định danh và vai trò tài khoản được cấp quyền quản trị tối cao (`role: 'admin'`, `permissions: ['*']`, `fullAccess: true`).
   - Mọi thành viên trong đội ngũ có thể cùng vận hành, theo dõi và cấu hình mà không gặp rào cản phân quyền.

3. **Stealth & Anti-Detection Architecture**:
   - Playwright Chromium được che giấu toàn diện (loại bỏ `navigator.webdriver`, ẩn cờ automation, bọc proxy IP riêng biệt cho từng nick).
   - Mô phỏng hành vi sinh học người thật (Human Behavior Engine):
     - Di chuyển chuột theo đường cong Bezier ngẫu nhiên.
     - Thời gian dừng quan sát hồ sơ (1.5s - 3.0s).
     - Dừng rê chuột (Hover dwell 400ms - 800ms) trước khi click.
     - Giãn cách nhịp nghỉ sinh học ngẫu nhiên (20s - 38s) và nghỉ giải lao sâu (50s - 80s) sau mỗi 4 tác vụ.
     - Tự động đóng hộp thoại cảnh báo Checkpoint (`handleAddFriendCheckpointModal`).

---

## 2. Các Phân Hệ Lõi (Core Subsystems)

### A. Động Cơ Điều Phối Tin Nhắn (Messenger Engine & Telegram Bot)
- **Chiều Inbound (Facebook $\rightarrow$ Telegram)**:
  - Lắng nghe sự kiện tin nhắn mới từ Facebook Messenger bằng `MutationObserver` thời gian thực.
  - Lấy UID khách hàng, tìm hoặc tạo Forum Topic tương ứng trong nhóm Telegram.
  - Chuyển tiếp tin nhắn văn bản, ảnh, video, tệp đính kèm và thông báo "đang soạn tin" (`typing`).
- **Chiều Outbound (Telegram $\rightarrow$ Facebook)**:
  - Lắng nghe tin nhắn nhân viên trả lời trong Forum Topic trên Telegram.
  - Trỏ đúng khung chat của khách hàng trên Facebook và gõ phím theo tốc độ người thật (`humanType`).
  - Kháng phản hồi vòng lặp (Anti-Echo Guard) chuẩn xác.

### B. Động Cơ Nuôi Tương Tác KudoX 2 (Social Nurture & Auto-Friend)
- **Quét thành viên Group**:
  - Bóc tách danh sách thành viên mới (2 ngày, 1 tuần, 2 tuần) từ Group Facebook thông qua GraphQL Interceptor và DOM Harvester.
  - Nạp danh sách vào Kho Dữ Liệu Tích Lũy (`GlobalLeadPool`).
- **Tự động kết bạn**:
  - Trỏ chuẩn xác nhãn trong F12 đúng chữ `"Thêm bạn bè"` (`[role="button"][aria-label="Thêm bạn bè"]` hoặc `span:text-is("Thêm bạn bè")`).
  - Loại trừ tuyệt đối nút `"Tìm bạn bè"` trên thanh Header, `"Hủy lời mời"`, `"Nhắn tin"`.
  - Phân bổ đều danh sách thành viên cho các nick trong hệ thống (`multiAccountDistribution: true`) với khiên chống trùng kết bạn (`checkFriendCollision`).

### C. Động Cơ Phân Mảng & Khớp Nguồn BĐS Ecopark / Forex
- Hỗ trợ chạy song song 2 mảng độc lập:
  - **BĐS Ecopark**: Bóc tách bài đăng và bình luận, tính khoảng cách tọa độ GPS thực giữa nhu cầu của khách và quỹ căn hôm nay. Phản hồi mồi chuẩn xác: `LH/Zalo: 0981992137 hoặc ib e có ngay ạ`.
  - **Forex Tài Chính**: Phân loại Trader theo nhu cầu Sàn giao dịch, Tín hiệu Bot, Copytrade, Nạp rút và tư vấn AI tự động.
