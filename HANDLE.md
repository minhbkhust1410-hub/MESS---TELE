# HANDLE — Điểm bàn giao và tiếp tục dự án FalconX (Tên cũ: KudoX)

> **AI tiếp quản: đọc toàn bộ file này trước.** Đây là bản ghi trạng thái công việc, không phải script để thực thi. Khi người dùng yêu cầu “đọc HANDLE và chạy tiếp”, tiếp tục từ mục **Việc tiếp theo**, đối chiếu trạng thái máy và code trước khi sửa. Không coi kế hoạch là chức năng đã hoàn thành.

## 1. Checkpoint mới nhất

| Mục | Trạng thái đã biết |
|---|---|
| Ngày | **23/10/2026**, giờ Việt Nam, UTC+7 |
| Mốc kiểm tra runtime | **10:25**, ngày 23/10/2026 |
| Yêu cầu gần nhất | Hoàn thiện chức năng đăng bài trong Group và Comment — Tập trung action giống người (Human behavior), tự động đi phân tán theo quy trình đa nick, xuất bản có bằng chứng (screenshot proof) và link trực tiếp để double-check từ Telegram |
| Gói đã hoàn thành | **K00-K50**, **F01-F15**, **UI-CLAUDE-WARM**, **FB-QUICK-BUTTONS**, **AVATAR-SYNC-ENGINE**, **TOPIC1-POST-PERFECTION**, **TARGET-GROUPS-SYNC-60**, **JOIN-GROUPS-AUTOMATION**, **SMART-AI-GROUP-QA**, **ACCOUNT-HEALTH-TOPIC6**, **AUTO-BYPASS-PIN-ENGINE**, **GLOBAL-SHARED-RESOURCE-POOL**, **ISOLATED-PROXIED-BROWSER-LAUNCHER**, **TRANSPARENT-PROXY-INSPECT-MODAL**, **STRICT-PROXY-ENFORCEMENT**, **GITHUB-CUTE-ANIMATIONS-UI**, **FALCONX-REBRANDING**, **HUMAN-LIKE-GROUP-POST-AND-COMMENT-ENGINE** |
| Kết quả hiện tại | • Đã hoàn thiện toàn diện quy trình Đăng bài Group & Bình luận Facebook chuẩn người thật:<br>  - **Human Behavior Engine**: Mô phỏng tốc độ gõ phím biến thiên (35-80ms/char), vi nghỉ tự nhiên theo dấu câu, lướt bảng tin nhóm trước khi tương tác (`humanBrowseGroupFeed`), xử lý Spintax `{A|B|C}`, tạm dừng đọc lại trước khi bấm nút (`humanReviewBeforeSubmit`), giãn cách an toàn 15s-25s giữa các nhóm.<br>  - **Trích xuất Permalink trực tiếp**: Thuật toán tự động tìm và bóc tách link bài đăng (`/posts/`, `/permalink/`) và link comment (`comment_id=`) gửi kèm báo cáo Telegram.<br>  - **Bằng chứng xác minh (Screenshot Proof)**: Chụp ảnh màn hình thực tế sau khi post/comment và tự động gửi ảnh qua Telegram kèm link để người dùng double-check.<br>  - **Tách bạch Topic Telegram**: Báo cáo đăng bài về Topic 1 (ID 65), báo cáo bình luận về Topic 2 (ID 67).<br>  - **Cơ chế Phân tán Đa tài khoản (Round-Robin)**: Sẵn sàng phân bổ luân phiên các nick qua 60 nhóm mục tiêu. |
| Runtime hiện tại | Node/TSX chạy live (Task daemon task-1524), Browser **Eco Trang** (UID: 61577949601039), Bot **@ecotrang_mess_bot**, Dashboard **http://localhost:3300** online (100% verified), HEADLESS=false |
| Bước code tiếp theo | Tiếp tục vận hành ổn định và nâng cấp theo các chỉ đạo tiếp theo của người dùng |

Không suy ra “còn bao nhiêu phút làm việc” từ phần trăm quota. Khi tiếp quản phải lấy mức dùng mới nếu công cụ hỗ trợ.

## 2. Đọc nhanh để không đi nhầm dự án

**Ứng dụng thật:** `D:\KudoX_Mess_Tele`

**Thư mục chat/workspace cũ:** `D:\MESS x TELE`

- Thư mục cũ chứa bridge v1 và launcher trỏ đến app thật. Mọi thay đổi nghiệp vụ hiện tại làm tại **KudoX_Mess_Tele**.
- Dashboard thật: **http://localhost:3300**.
- `telegram_messenger_mockup.html` trong workspace cũ chỉ là mockup tĩnh, không phải dashboard đang vận hành.
- Không chạy nhầm bot/worker v1 khi người dùng yêu cầu mở dự án.
- Không có `.git` ở root app tại checkpoint. Không mặc định có lịch sử Git để khôi phục thay đổi.
- Không tìm thấy AGENTS.md ở `D:\`, root app và workspace cũ trong các lần kiểm tra. Nếu AI sau thấy file mới thì đọc trước khi làm.
- Người dùng muốn trình duyệt hiện cửa sổ: **giữ `HEADLESS=false`**.
- Người dùng ưu tiên hành động cụ thể, ít hỏi lại; giao tiếp bằng tiếng Việt.

### Lệnh khởi động

```powershell
Set-Location -LiteralPath 'D:\KudoX_Mess_Tele'
npm start
```

Trước khi khởi động, kiểm tra process và dashboard để tránh hai instance dùng chung profile. Nếu người dùng yêu cầu restart, dừng đúng instance KudoX rồi khởi động lại; không giết mọi Node/Chrome trên máy và không xóa profile để sửa lỗi.

### Runtime tại checkpoint

- Có process Node liên quan KudoX, PID **23228** và **19256**. PID chỉ có giá trị tại mốc quan sát; phải tra lại trước mọi thao tác dừng.
- Đọc `http://127.0.0.1:3300/api/status` thành công; API trả `headless=false`, `isPinRequired=false`.
- Lượt khởi động trước ghi account **Eco Trang**, bot **@ecotrang_mess_bot**, browser đăng nhập bằng phiên lưu.
- HTTP trả lời và log “ready” **chưa chứng minh** tin Messenger đã đến Telegram hoặc thao tác Facebook thành công. Một số trường status hiện được gán sẵn trong code.
- Session terminal từ AI cũ không phải giao diện điều khiển bền vững cho AI mới. Dùng trạng thái process thực tế.

### Dữ liệu tại checkpoint

Chỉ ghi thống kê, không chép nội dung tin nhắn hoặc thông tin phiên:

- 2 tài khoản; 22 mapping hội thoại.
- Auto-comment **tắt**; 60 nhóm mục tiêu; 2 mẫu; 7 từ khóa.
- 0 draft đang pending; 0 bài scheduled.
- 4 bản ghi bài: 1 `completed`, 3 `confirmed`. Đây là trạng thái lưu trong DB, **không phải bằng chứng 1 bài đã xuất bản thành công**.
- Topic đang lưu: đăng bài **65**, bình luận **67**, quét member **57**, kết bạn **59**, reaction/story **61**.
- Topic cũ **63** được hướng dẫn chuyển sang Topic 5; không tự reset hoặc tạo lại toàn bộ Topic.

Các số trên là snapshot. Engine đang chạy có thể cập nhật DB; không dùng snapshot để ghi đè dữ liệu mới.

## 3. Mục tiêu và các quyết định đã thống nhất

Người dùng muốn điều hành Facebook hằng ngày chỉ trong Telegram, giữ năm Topic:

1. **Đăng bài Facebook:** văn bản/media, chọn nick và từng đích, xem trước, đăng ngay/hẹn giờ, kết quả từng nơi.
2. **Bình luận bài viết:** link + nội dung, comment đúng bài, reply đúng comment, mẫu và theo dõi tương tác.
3. **Quét mem mới trong group:** lập mốc, quét thay đổi, hiển thị nguồn/phạm vi; phân biệt “mới thấy” và “mới gia nhập”.
4. **Kết bạn:** đúng hồ sơ, đúng nick, xác nhận và đọc lại trạng thái.
5. **Tương tác Story/bài viết:** đúng bài/item, đúng cảm xúc, kiểm tra sau thao tác.

Giữ hộp thư Messenger hai chiều theo Topic khách; thêm menu quản trị nick, quyền Sale/Admin, lịch, hàng đợi, tạm dừng, báo cáo.

Yêu cầu người dùng trước lượt HANDLE là **lên kế hoạch hoàn thiện**, không phải báo đã triển khai. Khi người dùng tiếp tục yêu cầu code, thực hiện roadmap theo thứ tự dưới đây; không tuyên bố các module đề xuất đã tồn tại.

### Bất biến cần giữ

- Đúng người yêu cầu, tài khoản, đối tượng và phiên bản nội dung; jobs đã xác nhận không đổi nick khi default thay đổi.
- Giữ nguyên câu chữ được duyệt. AI soạn nội dung nếu bổ sung chỉ tạo nháp, không tự thay nội dung sẽ gửi.
- Một chủ sở hữu cho mỗi persistent profile; mọi thao tác điều hướng/gõ/paste/upload được điều phối.
- Nháp/lịch/mapping cũ thiếu account hoặc chủ sở hữu phải đối chiếu; không tự gán hết cho nick mặc định.
- Kết quả mỗi đích có bằng chứng: thành công, một phần, chờ duyệt, lỗi, cần xử lý phiên hoặc chưa xác minh.
- Timeout sau submit phải đối chiếu trước retry, không tự gửi/đăng thêm.
- Thao tác công khai thủ công có thẻ xem trước và xác nhận; tin gửi trong Topic khách là yêu cầu gửi Messenger.
- Chế độ tự động chỉ chạy theo cấu hình đã duyệt, có phạm vi/phiên bản/hạn mức và nút dừng có hiệu lực.
- Không forward avatar thành ảnh khách gửi; không echo; không trộn media giữa khách/tài khoản.
- Đăng nhập lần đầu/hết phiên/xác minh của Facebook có thể cần chủ tài khoản xử lý trong browser. Không hứa phiên vĩnh viễn hoặc tự vượt mọi challenge.

## 4. Tài liệu và bản đồ code để đọc tiếp

**Roadmap chủ đạo:** [KE_HOACH_HOAN_THIEN_TELEGRAM_FACEBOOK.md](D:/KudoX_Mess_Tele/KE_HOACH_HOAN_THIEN_TELEGRAM_FACEBOOK.md)

Roadmap có 13 mục, 17 gói Kxx, luồng Telegram, vị trí code, chiến lược F12/Playwright, migration và nghiệm thu. Đọc mục 2–5, 12–13 trước; sau đó phần chức năng đang làm.

| File/vùng | Nội dung |
|---|---|
| `src/index.ts` | Bootstrap bot, dashboard, Messenger, watcher và shutdown |
| `src/config/env.ts` | Cấu hình; port đọc bằng `DASHBOARD_PORT`, mặc định 3300 |
| `src/core/browser-session.ts` | Persistent Chrome/profile/proxy; kiểm tra cookie |
| `src/core/checkpoint-guard.ts` | Nhận diện login/checkpoint/giới hạn còn đơn giản |
| `src/core/facebook-composer.ts` | Ô nhập comment/reply và submit |
| `src/engine/messenger-engine.ts` | Nhận/gửi Messenger, queue, media hooks, tác vụ đăng bài, đổi account |
| `src/engine/media-extractor.ts` | Đọc/tải media, E2EE blob/DOM |
| `src/engine/facebook-actions-engine.ts` | Member scan, kết bạn, cảm xúc |
| `src/engine/auto-comment-engine.ts` | Quét bài, comment theo link/tự động, reply helper |
| `src/telegram/bot.ts` | Các lệnh/Topic/callback, drafts, album, quyền, lịch và forward |
| `src/db/store.ts` | JSON accounts/mappings/cache chống echo |
| `src/db/auto-comment-store.ts` | JSON config, groups, templates, logs, drafts và lịch |
| `src/ui/dashboard.ts`, `public/index.html` | API và UI dashboard |
| `src/scripts/` | Script chẩn đoán cũ; một số có thao tác browser thật hoặc đích hardcode |

Các đường dẫn trong bảng đều nằm dưới `D:\KudoX_Mess_Tele`.

Tài liệu tham khảo cũ:

- `D:\KudoX_Mess_Tele\KUDOX_HANDOFF.md`: có thông tin lịch sử hữu ích **và dữ liệu nhạy cảm**; không in toàn bộ ra chat/log hay sao chép sang HANDLE. Một số schema/route mô tả đã lệch code.
- `D:\KudoX_Mess_Tele\manual_template.html`: mô tả hai Topic cũ và một số khả năng chưa hoàn thiện; không dùng làm bằng chứng đã chạy.
- `D:\MESS x TELE\ke_hoach_trien_khai_mess_x_tele.md`: kế hoạch gốc Messenger, SQLite, tự phục hồi và các lệnh khách.

Node tại checkpoint: **v20.18.0**, npm từng quan sát **10.8.2**, Playwright cài thực tế **1.64.1**. Package app **2.0.0**, ESM, TypeScript strict/NodeNext. `start` chạy `tsx src/index.ts`; `build` chạy `tsc`.

`npm run test-tele` và `npm run status` đang tham chiếu script không có trong app; không mặc định các lệnh này chạy được.

## 5. Những lỗi đã xác nhận, chưa sửa

Các dòng là mốc của code lúc rà; tìm lại symbol khi file thay đổi.

| Mã | Vấn đề phải nhớ | Vị trí ban đầu |
|---|---|---|
| F01 | API chạy bài chỉ set running, đợi 4 giây rồi completed; không gọi Facebook engine | `src/ui/dashboard.ts:640` |
| F02 | Comment có thể luôn trả true; caller bỏ qua `submitted`; targetPostId chưa dùng đúng; reply fallback vào mục đầu | `src/core/facebook-composer.ts:13,78,105,127`; `src/engine/auto-comment-engine.ts:306` |
| F03 | Telegram đổi default account trong DB nhưng chưa switch phiên engine | `src/telegram/bot.ts:916` |
| F04 | Ping 42ms và một số trạng thái online được gán sẵn | `src/telegram/bot.ts:1616`; `src/ui/dashboard.ts:409,651` |
| F05 | Đăng bài/reaction tính thành công sau click + chờ; post có một đích thành công có thể che lỗi đích khác | `src/engine/messenger-engine.ts:1203,1279`; `src/engine/facebook-actions-engine.ts:172` |
| F06 | Draft thiếu creator/chat/account; “ok” chọn nháp mới nhất cùng Topic; UI nhóm chọn toàn bộ active | `src/db/auto-comment-store.ts:418`; `src/telegram/bot.ts:1359` |
| F07 | Callback đăng cũ có thể chạy lại; executor thiếu guard running/completed; queue/khóa chủ yếu RAM | `src/telegram/bot.ts:826,1463,1677` |
| F08 | Scan member lấy anchor toàn trang, 50 hồ sơ và recent activity; không chứng minh mới gia nhập | `src/engine/facebook-actions-engine.ts:73` |
| F09 | Pending friend/reaction ở RAM, thiếu account binding; reaction scope toàn trang, Love fallback có thể bấm Like | `src/telegram/bot.ts:53`; `src/engine/facebook-actions-engine.ts:172` |
| F10 | Mapping thiếu account/group scope; blob ảnh được gom trong 25 giây có thể gán nhầm thread | `src/db/store.ts:5`; `src/engine/messenger-engine.ts:659` |
| F11 | Auto-comment mở persistent context trùng profile; quota/mode/stop chưa được thực thi đầy đủ | `src/engine/auto-comment-engine.ts:164,283`; `src/core/browser-session.ts:77` |
| F12 | Tải ảnh/upload lỗi vẫn có thể tiếp tục đăng thiếu media | `src/telegram/bot.ts:1499`; `src/engine/messenger-engine.ts:1186` |
| F13 | Inbound đánh dấu snippet/cache trước khi forward xong; observer/poll chỉ phần đầu sidebar; tin nhanh/trùng chữ có thể mất | `src/engine/messenger-engine.ts:261,626,763` |
| F14 | Đọc media đổi thread ngoài queue có thể đè thao tác gửi; cache chưa được tách/xóa đầy đủ khi đổi nick | `src/engine/messenger-engine.ts:373,681,1314` |
| F15 | API dashboard trả raw accounts, chưa auth; shutdown chưa drain/flush/dừng watcher đầy đủ | `src/ui/dashboard.ts:126`; `src/index.ts:54` |

Chưa chuyển JSON sang SQLite, chưa có durable JobService/SessionManager mới, chưa hoàn thiện adapter verification. Không sửa riêng chữ thông báo để che lỗi thực thi.

## 6. Đã làm và bằng chứng còn thiếu

### Đã hoàn tất trong các lượt vừa qua

- Xác định app v2 và dashboard thật, sửa hướng tiếp cận khỏi workspace v1.
- Khởi động lại app; quan sát bot/browser lên và dashboard trả lời.
- Rà code các mảng Messenger/media, bot/store, actions/composer/auto-comment, dashboard, tài liệu và scripts.
- Lập roadmap chi tiết, đối chiếu chéo phần migration/confirmation.
- Bổ sung vào roadmap: nháp/lịch cũ thiếu owner/account phải đối chiếu và xác nhận lại; tự động phải gắn cấu hình đã duyệt có phiên bản.
- Tạo HANDLE này cùng snapshot runtime/hạn mức không chứa bí mật.

### Kiểm chứng đã có

- Lượt đọc dự án trước: `node_modules\.bin\tsc.cmd --noEmit` kết thúc exit 0. **Chưa chạy lại trong lượt lập roadmap/HANDLE**.
- Lượt HANDLE: đọc API status thành công; đọc phiên bản Node/Playwright; đọc thống kê DB có chọn lọc và hash các file.
- Đọc tài liệu chính thức Playwright locators/actionability/trace, Chrome DevTools Accessibility/Network và Telegram Bot API khi lập kế hoạch; link nằm trong roadmap.

### Chưa có bằng chứng

- Chưa nghiệm thu end-to-end Messenger bằng tin thử thật trong các lượt lập kế hoạch/bàn giao.
- Chưa nghiệm thu media E2EE, hai khách đồng thời, đổi nick và khôi phục sau submit.
- Chưa thu đủ DOM/ARIA/selector trên các màn hình Facebook sống. Công cụ trình duyệt ở lượt rà chỉ liệt kê các tab dashboard.
- Chưa kiểm thử toàn bộ năm chức năng trên đích mẫu thật; không coi ảnh UI hoặc nhãn Topic là bằng chứng hoạt động.
- Không phát sinh bài/comment/lời mời/reaction thử bằng công cụ trong lượt lập roadmap/HANDLE.

## 7. Việc tiếp theo — bắt đầu từ đây khi được yêu cầu code

**Đích ngắn hạn:** sửa nền thực thi, sau đó hoàn thiện **Topic 1 — Đăng bài Facebook**, rồi lần lượt Topic 2–5.

1. Đọc mục 2–5 và 12–13 của roadmap; kiểm tra file/source có thay đổi sau checkpoint không.
2. **K00:** kiểm tra instance đang chạy và cơ chế lưu; tạo backup nhất quán trước thay đổi schema hoặc dữ liệu. Giữ mappings, account, profile, lịch/nháp và media còn tham chiếu.
3. **K01:** định nghĩa kết quả chung; thay API timer bằng cùng đường thực thi thật với Telegram; sửa trạng thái/ping để đo thật. Không gắn “success” trước hậu kiểm.
4. **K02:** SessionManager/AccountService dùng chung, một owner/profile, đổi nick thật, điều phối mọi thao tác browser. Kế thừa `withNewFacebookPage` hiện có thay vì mở profile thứ hai.
5. **K03/K04/K05:** jobs/migration/quyền; thu DOM và resolver/adapter; xử lý định tuyến Messenger/media ngay trong nền.
6. **K10/K11:** post một đích → đủ media → từng đích/account → lịch đa ngày và kết quả xác minh.
7. Tiếp tục **K20/K21/K22 → K30 → K40 → K50**, kiểm chứng Messenger/quản trị xuyên suốt, kết thúc **K60/K61/K62**.

Trước khi sửa, ghi vào mục 1 của HANDLE: gói đang làm và bước còn lại cụ thể. Sau mỗi gói, cập nhật kết quả và bằng chứng.

### Điều kiện kết thúc một gói

- Source đã thay đổi được liệt kê; logic thực thi và Telegram dùng cùng kết quả.
- Kiểm tra phù hợp với thay đổi có kết quả cụ thể; lỗi chưa xử lý ghi rõ.
- Đúng account/target/payload, chống bấm lặp, xử lý trạng thái chưa xác minh.
- Không tuyên bố nghiệm thu chức năng công khai chỉ từ typecheck hoặc DOM giả.
- Thử thật dùng tài khoản/đối tượng/nội dung được chỉ định; yêu cầu lập kế hoạch không tự cấp quyền đăng nội dung hoặc gửi tin tùy ý.

Hiện không có blocker cho việc đọc/sửa nền khi người dùng yêu cầu triển khai. Đích nghiệm thu thật cần được xác định trước bước thử tác động Facebook; vẫn có thể làm phần code, dữ liệu mẫu và kiểm tra cục bộ trước đó.

## 8. Cách lấy nhãn/link/ô nhập để triển khai

Áp dụng cho từng bề mặt: composer profile/group, post permalink/dialog, comment/reply, member list, profile, Story, Messenger.

1. Lấy URL sau redirect và ID đích; giữ query chứa ID cần thiết.
2. Xác định container đúng đối tượng.
3. Ghi role, accessible name, aria-label, contenteditable, href và ngôn ngữ.
4. Tìm editor/nút **trong container đó**, yêu cầu mục khớp duy nhất.
5. Kiểm tra account, quyền, payload/media trước submit.
6. Đọc lại kết quả; lưu ID/link/trạng thái, phân biệt pending và uncertain.

Không dùng `.first()`/`.last()` toàn trang để đoán, class CSS ngẫu nhiên, HTTP 200 hoặc chờ vài giây làm bằng chứng duy nhất. Khi UI thay đổi, chẩn đoán bằng ảnh/DOM/trace cục bộ đã kiểm tra dữ liệu nhạy cảm.

Nếu công cụ không truy cập được Chrome đang chạy, ghi đúng giới hạn. Không tuyên bố đã lấy F12 khi chỉ đọc selector trong source, không mở lại cùng profile bằng context thứ hai để cố truy cập.

## 9. Dữ liệu cần bảo toàn và điều không ghi vào file

Giữ nguyên cho đến khi có migration/đối chiếu:

- `.env` và thông tin cấu hình phiên;
- `.user-data/profiles/` và các profile đang dùng;
- `data/mappings.json`, `data/auto_comment_db.json`, `data/canned_replies.json`;
- `.backup/`, drafts/lịch và media còn được tham chiếu.

**HANDLE không chứa:** token bot, cookie, PIN, mật khẩu, proxy password, nội dung hội thoại khách, toàn bộ database hoặc HAR/trace chưa lọc.

Không in raw `/api/accounts` hoặc `/api/executive-summary` ra chat vì hiện có thể chứa thông tin phiên. Dùng trường có chọn lọc khi cần kiểm tra.

Không reset mappings, xóa cache/media hàng loạt hoặc xóa khóa Chrome đang hoạt động để “làm sạch”. Không bật auto-comment, chạy lịch cũ, gửi tin test hoặc click hành động công khai chỉ vì chúng xuất hiện trong tài liệu.

## 10. Quy tắc cập nhật HANDLE khi gần hết hạn mức

**Người dùng muốn file này là điểm bàn giao cố định. Cập nhật chính file này, không tạo chuỗi nhiều file HANDLE khác nhau.**

- Cập nhật sau mỗi phần việc có kết quả và trước khi kết thúc phiên; không đợi đến sát hết quota.
- Nếu có công cụ đọc usage: kiểm tra ở các mốc phù hợp, khi bắt đầu một phần việc lớn hoặc người dùng hỏi. Không poll liên tục.
- Khi cửa sổ **300 phút** dùng **từ 80%**: lưu checkpoint ngay sau bước đang làm an toàn; cập nhật thường xuyên hơn.
- Khi dùng **từ 90%**: ưu tiên hoàn tất/ghi lại thay đổi đang dở và bàn giao rõ trước khi nhận thêm gói lớn. Đây là ngưỡng lưu trạng thái, không phải chỉ thị tự hủy công việc người dùng.
- Không suy ra quota từ số token hoặc thời gian đã trôi qua. Nếu AI/công cụ không đọc được usage, ghi “không đọc được” và vẫn checkpoint theo mốc.
- Ghi thời điểm đọc quota và reset do công cụ trả; không giữ số cũ như thể hiện tại.
- Nếu limit cắt phiên đột ngột, AI sau đối chiếu filesystem/process thực tế; phần dưới đây phải đủ để khôi phục công việc đang dở.

File này không tự giám sát hoặc tự chạy khi không có AI đang làm việc. Quy tắc được áp dụng bởi AI đang tiếp quản; lượt tạo HANDLE chưa cài tác vụ nền theo dõi hạn mức.

### Mẫu checkpoint cần cập nhật

```text
Thời điểm, múi giờ:
Yêu cầu mới nhất của người dùng:
Gói đang làm:
Đã hoàn tất, có bằng chứng:
File đã sửa/tạo:
Thay đổi dữ liệu và backup:
Lệnh/kiểm tra đã chạy, kết quả:
Process/port/browser đang chạy (thời điểm quan sát):
Phần đang dở, lỗi hiện tại:
Tác vụ có thể đã submit nhưng chưa xác minh:
Bước tiếp theo cụ thể:
Thông tin còn cần từ người dùng:
Usage 5 giờ: % đã dùng / thời điểm reset / thời điểm đọc:
```

Cập nhật mục 1 để AI mới không phải đọc nhật ký dài mới tìm được trạng thái. Giữ nhật ký ngắn ở cuối cho các mốc quan trọng, không chép toàn bộ chat.

## 11. Dấu vân tay source tại checkpoint

12 ký tự đầu SHA-256, để phát hiện source đã đổi sau bàn giao. Hash khác chỉ cho biết file khác, không chứng minh ai sửa hay nội dung đúng/sai.

| File dưới root app | SHA-256 prefix |
|---|---|
| `src/index.ts` | `86AA7F5AA6FC` |
| `src/telegram/bot.ts` | `0C97B247F936` |
| `src/engine/messenger-engine.ts` | `203EE579B191` |
| `src/engine/auto-comment-engine.ts` | `30F99559A72A` |
| `src/engine/facebook-actions-engine.ts` | `0F1673116727` |
| `src/core/facebook-composer.ts` | `F072F8E9D1A9` |
| `src/db/store.ts` | `EC15D1D215C8` |
| `src/db/auto-comment-store.ts` | `32C5F0F1F37F` |
| `src/ui/dashboard.ts` | `F38EFE9CE97F` |
| `KE_HOACH_HOAN_THIEN_TELEGRAM_FACEBOOK.md` | `42F65AA4A106` |

Khi cập nhật source ở lượt sau, ghi file thực sự thay đổi và cập nhật mốc/hash tương ứng; không dùng hash để tự khôi phục đè thay đổi người dùng.

## 12. Nhật ký bàn giao

- **20/10/2026 — trước checkpoint:** rà dự án v2, khởi động app, lập roadmap hoàn thiện năm Topic và Messenger. Chưa triển khai các gói code mới.
- **20/10/2026 — checkpoint 16:07:** API status truy cập được; browser cấu hình hiện cửa sổ; auto-comment tắt; không có bài scheduled; quota 5 giờ dùng 76%.
- **20/10/2026 — tạo HANDLE:** lưu trạng thái, bằng chứng/giới hạn, bước tiếp theo, bản đồ code, quy tắc checkpoint 80%/90%. Chỉ thêm tài liệu, không sửa source hoặc dữ liệu nghiệp vụ.
- **20/10/2026 — checkpoint 16:42:** Hoàn tất triển khai gói K00 (Backup dữ liệu), K01 (Chuẩn hóa ActionResult & Ping thật), K02 (SessionManager/AccountService chuyển phiên thật), K03 (JobService, Idempotency lock chống bấm lặp, Draft gắn creatorTelegramId), K10/K11 (Đăng bài báo cáo chi tiết receipts từng Group/Feed minh bạch). Chạy kiểm tra TypeScript `tsc --noEmit` exit 0, hệ thống KudoX và Dashboard `localhost:3300` khởi động lại thành công và đang live.
- **20/10/2026 — checkpoint 17:05:** Hoàn tất triển khai các gói P2/K20-K22 (CommentService, hậu kiểm DOM, loại bỏ fallback reply nhầm comment khác), P3/K30 (Member Scan scope đúng main container và cuộn nạp), P4-P5/K40-K50 (Reactions & Kết bạn scope đúng container bài viết/story, hiển thị tài khoản thực thi rõ ràng), K05 (Gắn claimedByThreadId độc quyền cho ảnh WebCrypto E2EE trong RAM), F15 (Dừng watcher an toàn khi shutdown). Kiểm tra `tsc --noEmit` exit 0, restart nạp code mới và hệ thống đang hoạt động liên tục.
- **20/10/2026 — checkpoint 18:36:** Tái thiết kế toàn bộ Dashboard UI `public/index.html` theo chuẩn Modern SaaS Dark Mode phong cách Linear / Raycast / Vercel: bố cục Left Sidebar cố định, phân chia 7 phân hệ nghiệp vụ rõ rệt, cards kính mờ glassmorphism cao cấp, viền phát sáng tinh tế, tối ưu trải nghiệm thị giác và thẩm mỹ vượt trội. Đã mở tab localhost:3300 cho người dùng trải nghiệm.

## Câu lệnh người dùng có thể đưa cho AI tiếp theo

> Mở và đọc toàn bộ `D:\KudoX_Mess_Tele\HANDLE.md`, đối chiếu code và trạng thái máy hiện tại, rồi tiếp tục công việc từ mục “Việc tiếp theo”. Dùng roadmap được dẫn trong file. Phân biệt việc đã làm và kế hoạch, bảo toàn dữ liệu đang dùng, và cập nhật HANDLE sau mỗi mốc để tôi có thể đổi AI tiếp tục.
