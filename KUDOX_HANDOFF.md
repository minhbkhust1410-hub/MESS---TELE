# 📦 KUDOX MESS x TELE — FILE BÀN GIAO DỰ ÁN

> **Đọc file này trước khi làm bất kỳ điều gì.**
> Đây là toàn bộ thông tin cần thiết để AI mới tiếp quản dự án ngay lập tức.

---

## 🎯 MỤC TIÊU DỰ ÁN

Xây dựng hệ thống **đồng bộ 2 chiều thời gian thực** giữa:
- **Facebook Messenger** (tài khoản doanh nghiệp) ← → **Telegram Forum Topics**

Mỗi khách hàng nhắn tin vào Messenger → hệ thống **tự động tạo 1 Topic riêng** trong nhóm Telegram.  
Chủ shop reply trong Topic Telegram → tin nhắn gửi ngược lại Messenger cho khách.  
Hoàn toàn **real-time**, **2 chiều**, **không delay**, **không fake notification**.

---

## 🗂️ CẤU TRÚC THƯ MỤC

```
D:\KudoX_Mess_Tele\
├── src/
│   ├── engine/
│   │   ├── messenger-engine.ts    ← CORE: Playwright browser, MutationObserver, E2EE, cookie inject
│   │   └── media-extractor.ts     ← E2EE media: blob URL + canvas intercept
│   │   ├── facebook-actions-engine.ts ← Quét hồ sơ thành viên và thao tác Facebook theo yêu cầu
│   ├── telegram/
│   │   └── bot.ts                 ← grammY bot: nhận tin Telegram → route về Messenger
│   └── ui/
│       └── dashboard.ts           ← Express server: /api/* routes + web dashboard
├── public/
│   └── index.html                 ← Dashboard UI (Tailwind glassmorphic, 2-tab login modal)
├── data/
│   └── mappings.json              ← DATABASE: customer→topic mapping, accounts, cache
├── .env                           ← Config: bot token, group ID, headless mode
├── .user-data/
│   └── profiles/
│       └── acc_61577949601039/
│           └── cookies.json       ← Cookie backup Eco Trang (tự động inject khi restart)
├── package.json
├── tsconfig.json
├── Chayhethong.bat                ← (ở D:\MESS x TELE\ — launcher chính)
└── KUDOX_HANDOFF.md               ← FILE NÀY
```

---

## ⚙️ THÔNG SỐ HỆ THỐNG

| Thông số | Giá trị |
|---|---|
| **Dashboard URL** | `http://localhost:3300` |
| **Khởi động** | `npm start` tại `D:\KudoX_Mess_Tele` |
| **Launcher BAT** | `D:\MESS x TELE\Chayhethong.bat` (double-click là chạy) |
| **Facebook Account** | `Eco Trang` — UID: `61577949601039` |
| **E2EE PIN** | `000000` |
| **Telegram Bot** | `@ecotrang_mess_bot` — Token: `[REDACTED]` |
| **Telegram Group** | `Messenger Eco Trang` — Group ID: `-1003998557681` |
| **Node Version** | >= 18 |

---

## 🔐 FILE .env

```env
TELEGRAM_BOT_TOKEN=[REDACTED]
TELEGRAM_GROUP_ID=-1003998557681
HEADLESS=false
PORT=3300
```

> **QUAN TRỌNG:** `HEADLESS=false` — người dùng muốn thấy browser Playwright.  
> **KHÔNG được** đổi sang `HEADLESS=true`.

---

## 🏦 DATABASE: data/mappings.json

Cấu trúc chính:

```json
{
  "accounts": [
    {
      "id": "acc_61577949601039",
      "name": "Eco Trang",
      "uid": "61577949601039",
      "isDefault": true,
      "cookies": [...],
      "pin": "000000"
    }
  ],
  "mappings": [
    {
      "customerId": "FACEBOOK_USER_ID",
      "customerName": "Tên khách hàng",
      "topicId": 123,
      "accountId": "acc_61577949601039"
    }
  ]
}
```

> ⚠️ **LƯU Ý:** Handoff cũ gắn nhãn một số mapping là của `Anh Minh Trading`, nhưng schema hiện tại không lưu Telegram group ID trong từng mapping. Không xóa/reset các topic đó trước khi đối chiếu trực tiếp trong Telegram; có thể làm mất luồng hội thoại đang dùng.

---

## 🧠 KIẾN TRÚC KỸ THUẬT

### Luồng Messenger → Telegram
```
Khách nhắn Messenger
  → Playwright MutationObserver phát hiện DOM mới
  → Kiểm tra SentMessageCache (tránh echo)
  → Tìm/Tạo Topic trong Telegram group
  → Gửi tin qua grammY bot API
  → Lưu mapping vào mappings.json
```

### Luồng Telegram → Messenger
```
Chủ shop reply trong Topic Telegram
  → grammY nhận update
  → Tìm customerId theo topicId trong mappings
  → Playwright click vào conversation đó
  → Playwright type + Enter để gửi
```

### E2EE Media (Quan trọng!)
- Facebook E2EE messages dùng **blob URL** — không thể scrape DOM thông thường
- Giải pháp: Hook `URL.createObjectURL` qua `page.addInitScript()` để intercept blob
- File xử lý: `src/engine/media-extractor.ts`
- E2EE blob → canvas → base64 → gửi Telegram qua `sendPhoto`/`sendVideo`

### Cookie Persistence
- Khi login bằng cookie → lưu vào `account.cookies` (mappings.json) VÀ `.user-data/profiles/acc_*/cookies.json`
- Khi `messengerEngine.start()` → tự động đọc `cookies.json` → inject qua `context.addCookies()` → không cần login lại
- Cookie cần đủ bộ: `c_user`, `xs`, `datr`, `fr`, `sb`, `presence`, `ps_l`, `ps_n`, `wd`

### Telegram Facebook Control Topics
- Năm Topic điều khiển đang hoạt động trong group forum `Messenger Eco Trang`; ID nằm trong `data/auto_comment_db.json`. Bot đồng bộ tên và ghim tin hướng dẫn đầu Topic khi khởi động.
- `[1] 📝 ĐĂNG BÀI FACEBOOK` (ID 65): soạn bài bằng văn bản/ảnh/album; hỗ trợ mẫu BĐS `/mau_bds`, chọn tài khoản/nhóm đích, xác nhận đăng hoặc hẹn giờ. Lịch lưu nguyên danh sách group đích đã chọn để không tự gửi sang group mới thêm sau đó.
- `[2] 💬 BÌNH LUẬN BÀI VIẾT` (ID 67): soạn mẫu và bình luận vào link được chỉ định. Nội dung gửi nguyên văn Sale nhập, hiện xem trước và chờ xác nhận. Bình luận tự động mặc định tắt; bật/quét diện rộng chỉ dành cho quản trị viên.
- `[3] 👥 QUÉT MEM MỚI TRONG GROUP` (ID 57): gửi link group; lần đầu chỉ tạo mốc, các lần sau so sánh hồ sơ mới đang hiển thị (tối đa 50 mỗi lần quét).
- `[4] 🤝 KẾT BẠN` (ID 59): từng link hồ sơ, xác nhận riêng trước khi gửi tối đa một lời mời; phiên xác nhận hết hạn sau 15 phút.
- `[5] ✨ TƯƠNG TÁC STORY / BÀI VIẾT` (ID 61): tự nhận diện link Story/bài viết, chọn Thích/Yêu thích và xác nhận riêng.
- Topic bài viết cũ ID 63 được đổi thành `↪️ GỘP VÀO TOPIC 5` và chỉ hướng dẫn chuyển sang Topic 5.
- Telegram hiện giới hạn ghim tối đa 5 Forum Topic. Vì vậy ghim 5 Topic đang hoạt động; thao tác Story và bài viết dùng chung Topic 5. Các topic nằm bên trong Forum, không thể ghim vào thanh Folder.
- Quyền Sale được cấp theo ID Telegram: nhân viên dùng `/sale_id`, quản trị viên dùng `/sale_them <ID>`, `/sale_xoa <ID>`, `/sale_ds`. Quản trị viên group mặc định được dùng chức năng. Xóa toàn bộ hàng đợi chỉ dành cho quản trị viên và cần xác nhận lần hai.
- Không đăng bài/bình luận/kết bạn/tương tác tự động khi chưa có yêu cầu thao tác rõ ràng và bước xác nhận tương ứng. Hệ thống chỉ báo đăng lịch thành công sau khi thao tác Facebook thực sự chạy; lịch quá trễ hơn 2 phút sẽ báo lỗi thay vì tự đăng bất ngờ.

---

## 🌐 API ROUTES (dashboard.ts)

| Method | Route | Mô tả |
|---|---|---|
| GET | `/api/status` | Trạng thái hệ thống, account đang active |
| GET | `/api/customers` | Danh sách khách hàng & mapping |
| POST | `/api/login-cookie` | Login bằng cookie string |
| POST | `/api/login-browser` | Mở browser để đăng nhập thủ công |
| POST | `/api/switch-account` | Chuyển tài khoản active |
| DELETE | `/api/accounts/:id` | Xóa tài khoản |
| POST | `/api/send-message` | Gửi tin nhắn test |
| GET | `/api/logs` | Xem logs gần nhất |

---

## 🚀 CÁCH KHỞI ĐỘNG

### Cách 1: Double-click file BAT (dành cho user)
```
D:\MESS x TELE\Chayhethong.bat
```
BAT này tự động:
1. Kill process cũ đang dùng port 3300
2. Khởi động `npm start` tại `D:\KudoX_Mess_Tele`
3. Mở browser vào `http://localhost:3300`

### Cách 2: Thủ công (dành cho AI/dev)
```powershell
cd D:\KudoX_Mess_Tele
npm start
```

### Sau khi khởi động:
- Dashboard mở tại `http://localhost:3300`
- Hệ thống tự inject cookie Eco Trang
- Playwright mở Facebook Messenger
- Nếu hỏi PIN E2EE → nhập `000000`

---

## ❌ NHỮNG ĐIỀU KHÔNG ĐƯỢC LÀM

1. **KHÔNG** đổi `HEADLESS=true` — user muốn thấy browser
2. **KHÔNG** gửi tin nhắn "fake sync" / "đang kết nối..." — hệ thống không có notification ảo
3. **KHÔNG** include avatar/ảnh đại diện khi forward tin nhắn
4. **KHÔNG** echo lại tin nhắn đã gửi từ Telegram về Messenger (SentMessageCache phòng tránh)
5. **KHÔNG** dùng polling delay — phải dùng MutationObserver (real-time)

---

## ✅ NHỮNG VIỆC CÒN ĐANG CẦN LÀM

1. **[VERIFY]** Kiểm tra end-to-end: nhờ ai đó nhắn Messenger cho Eco Trang → xác nhận Topic mới được tạo trong Telegram.
2. **[VERIFY]** Kiểm tra forward ảnh/video E2EE cho account Eco Trang (chưa có xác nhận bàn giao rằng đã test).
3. Đối chiếu mapping topic cũ trong Telegram trước khi xóa bất kỳ mapping nào.

---

## 🔍 DEBUG & TROUBLESHOOT

### Hệ thống không khởi động được
```powershell
# Kiểm tra port 3300 có bị chiếm không
netstat -ano | findstr :3300
# Kill process nếu có (thay PID)
taskkill /PID <PID> /F
```

### Facebook bị logout khi restart
- Cookie bị hết hạn hoặc thiếu cookie quan trọng
- Giải pháp: Vào Dashboard → Thêm Nick → Tab Cookie → Paste cookie mới
- Cookie phải có đủ: `c_user`, `xs`, `datr`, `fr`, `sb`

### Tin nhắn không sync
- Kiểm tra log tại `/api/logs`
- Xem console `npm start` để tìm lỗi Playwright
- Đảm bảo Telegram bot có quyền `can_manage_topics: true` trong group

### Telegram bot không tạo được Topic
- Vào group Telegram → Cài đặt → Quản trị viên → `@ecotrang_mess_bot`
- Bật quyền: **Quản lý chủ đề** (`can_manage_topics`)
- Kiểm tra `is_forum: true` trên group

---

## 📞 THÔNG TIN LIÊN HỆ DỰ ÁN

- **Tên hệ thống:** KudoX Mess x Tele
- **Môi trường:** Windows VPS (local), không phải cloud
- **Ngôn ngữ:** TypeScript + Node.js
- **Framework:** Playwright (browser), grammY (Telegram), Express (API)
- **Ngày tạo handoff:** 2026-10-18

---

*File này được tạo tự động bởi Antigravity AI. Cập nhật mỗi khi có thay đổi lớn.*
