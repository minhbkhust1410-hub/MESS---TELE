const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const assetsDir = 'D:/KudoX_Mess_Tele/guide_assets';

// Chuyển ảnh sang Base64 để nhúng thẳng vào file HTML, đảm bảo PDF tự chứa toàn bộ ảnh không bị lỗi đường dẫn
function toBase64(fileName) {
  const p = path.join(assetsDir, fileName);
  if (!fs.existsSync(p)) return '';
  const bitmap = fs.readFileSync(p);
  return `data:image/png;base64,${bitmap.toString('base64')}`;
}

const imgRegister = toBase64('step0_register.png');
const imgHub = toBase64('step1_hub.png');
const imgPosts = toBase64('step2_posts.png');
const imgInventory = toBase64('step3_inventory.png');
const imgInbox = toBase64('step4_inbox.png');
const imgAccounts = toBase64('step5_accounts.png');

const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Cẩm Nang Hướng Dẫn Sử Dụng FalconX BĐS Automation</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');

    @page {
      size: A4;
      margin: 12mm 14mm 14mm 14mm;
      @bottom-right {
        content: counter(page) "/" counter(pages);
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 9pt;
        color: #86868b;
      }
    }

    * { box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #1d1d1f;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      line-height: 1.5;
      font-size: 10.5pt;
    }

    .page {
      page-break-after: always;
      position: relative;
      padding-bottom: 20px;
    }
    .page:last-child {
      page-break-after: avoid;
    }

    /* Header & Footer */
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0071e3;
      padding-bottom: 8px;
      margin-bottom: 18px;
    }
    .doc-header .brand {
      font-size: 12pt;
      font-weight: 800;
      color: #0071e3;
      letter-spacing: -0.5px;
    }
    .doc-header .sub {
      font-size: 9pt;
      color: #86868b;
      font-weight: 500;
    }

    /* Cover Page */
    .cover-container {
      height: 100%;
      min-height: 250mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 40px 10px 20px 10px;
    }
    .cover-tag {
      display: inline-block;
      background: #e8f3ff;
      color: #0071e3;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 10pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 15px;
    }
    .cover-title {
      font-size: 26pt;
      font-weight: 800;
      color: #111827;
      line-height: 1.25;
      margin-bottom: 15px;
    }
    .cover-title span {
      color: #0071e3;
    }
    .cover-desc {
      font-size: 13pt;
      color: #4b5563;
      max-width: 600px;
      line-height: 1.6;
      margin-bottom: 30px;
    }
    .cover-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-bottom: 40px;
    }
    .cover-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 16px;
    }
    .cover-box h4 {
      margin: 0 0 6px 0;
      font-size: 11pt;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cover-box p {
      margin: 0;
      font-size: 9pt;
      color: #64748b;
      line-height: 1.4;
    }
    .cover-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5pt;
      color: #64748b;
    }

    /* Headings */
    h2.step-title {
      font-size: 16pt;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 10px 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .step-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #0071e3;
      color: white;
      font-size: 12pt;
      font-weight: 800;
      flex-shrink: 0;
    }
    .step-summary {
      font-size: 10pt;
      color: #475569;
      margin-bottom: 16px;
      background: #f1f5f9;
      padding: 10px 14px;
      border-radius: 10px;
      border-left: 4px solid #0071e3;
    }

    /* Screenshot Container with Callouts */
    .img-container {
      position: relative;
      margin: 14px 0 18px 0;
      border-radius: 12px;
      overflow: hidden;
      border: 1.5px solid #cbd5e1;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      background: #000;
    }
    .img-container img {
      width: 100%;
      display: block;
    }

    /* Callout Pointers / Arrows / Badges */
    .callout {
      position: absolute;
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 59, 48, 0.95);
      color: #ffffff;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 8pt;
      font-weight: 700;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
      border: 1.5px solid #ffffff;
      z-index: 10;
      animation: pulse-pin 2s infinite;
    }
    .callout .num {
      background: #ffffff;
      color: #ff3b30;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 8pt;
      font-weight: 900;
    }
    .callout-blue { background: rgba(0, 113, 227, 0.95); }
    .callout-blue .num { color: #0071e3; }
    .callout-green { background: rgba(16, 185, 129, 0.95); }
    .callout-green .num { color: #10b981; }

    /* Action Instruction List */
    .instructions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 10px;
    }
    .instruction-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      padding: 10px 14px;
      border-radius: 10px;
    }
    .inst-num {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #0071e3;
      color: white;
      font-size: 9pt;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .inst-content {
      flex: 1;
    }
    .inst-title {
      font-weight: 700;
      font-size: 10pt;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .inst-desc {
      font-size: 9pt;
      color: #64748b;
      margin: 0;
      line-height: 1.4;
    }
    .tag-note {
      display: inline-block;
      background: #fef3c7;
      color: #b45309;
      font-size: 8pt;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 6px;
    }
  </style>
</head>
<body>

  <!-- ======================================================== -->
  <!-- TRANG BÌA (COVER PAGE)                                   -->
  <!-- ======================================================== -->
  <div class="page cover-container">
    <div>
      <div class="doc-header">
        <span class="brand">FALCONX PRO — REAL ESTATE AUTOMATION</span>
        <span class="sub">Tài Liệu Hướng Dẫn Vận Hành Dành Cho Khách Hàng</span>
      </div>

      <div style="margin-top: 40px;">
        <span class="cover-tag">Cẩm Nang Bắt Đầu Nhanh (Quick Start Guide)</span>
        <h1 class="cover-title">
          Quy Trình Sử Dụng <span>Hệ Thống Tự Động Hóa BĐS</span> Từ A Đến Z
        </h1>
        <p class="cover-desc">
          Tài liệu chuẩn hóa tuần tự từng bước: Cách đăng nhập, nạp bảng hàng bằng ảnh/chữ, lên lịch đăng bài Group Facebook, tự động quét nhu cầu khách và đối chiếu căn hộ theo bản đồ GPS Ecopark.
        </p>
      </div>

      <div class="cover-grid">
        <div class="cover-box">
          <h4><span>📝</span> 1. Đăng Bài Lên Group</h4>
          <p>Soạn nội dung, tải ảnh, lên lịch đăng tự động và quản lý kho nhóm BĐS có duyệt bài.</p>
        </div>
        <div class="cover-box">
          <h4><span>🤖</span> 2. Săn Khách & Quỹ Căn</h4>
          <p>Nạp bảng hàng bằng OCR ảnh (0đ AI), radar tự động tìm căn hộ có cự ly gần nhất.</p>
        </div>
        <div class="cover-box">
          <h4><span>💬</span> 3. Tin Nhắn Khách Hàng</h4>
          <p>Cầu nối 2 chiều tức thì giữa Facebook Messenger và nhóm Telegram cá nhân 1-1.</p>
        </div>
        <div class="cover-box">
          <h4><span>👤</span> 4. Quản Lý Đa Tài Khoản</h4>
          <p>Mỗi người quản lý được cấp quyền sở hữu và điều hành độc lập nhiều nick Facebook.</p>
        </div>
      </div>
    </div>

    <div class="cover-footer">
      <span>Được biên soạn cho: <strong>Môi Giới & Chuyên Viên BĐS Ecopark</strong></span>
      <span>Hỗ trợ kỹ thuật 24/7 qua Telegram Bot</span>
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- TRANG 1: BƯỚC 1 - ĐĂNG NHẬP & TẠO TÀI KHOẢN             -->
  <!-- ======================================================== -->
  <div class="page">
    <div class="doc-header">
      <span class="brand">BƯỚC 1: KHỞI TẠO TÀI KHOẢN & ĐĂNG NHẬP</span>
      <span class="sub">FalconX Pro Multi-User Shield</span>
    </div>

    <h2 class="step-title">
      <span class="step-badge">1</span>
      Đăng Ký & Đăng Nhập Không Gian Quản Lý Riêng
    </h2>
    <div class="step-summary">
      Mỗi khách hàng/môi giới sở hữu một tài khoản riêng biệt để quản lý danh sách các nick Facebook, bài đăng và quỹ căn của mình mà không bị trùng lẫn với người khác.
    </div>

    <!-- Ảnh minh họa có Callout -->
    <div class="img-container">
      <img src="${imgRegister}" alt="Màn hình Đăng Ký Tài Khoản" />
      
      <!-- Mũi tên & Callout trỏ các vị trí -->
      <div class="callout callout-green" style="top: 38%; right: 35%;">
        <span class="num">1</span> Bấm "+ Tạo Tài Khoản"
      </div>
      <div class="callout" style="top: 48%; left: 35%;">
        <span class="num">2</span> Nhập Họ Tên Người Quản Lý
      </div>
      <div class="callout" style="top: 56%; left: 35%;">
        <span class="num">3</span> Nhập Username & Mật Khẩu
      </div>
      <div class="callout callout-blue" style="bottom: 24%; left: 38%;">
        <span class="num">4</span> Bấm "Tạo Tài Khoản & Vào Quản Lý"
      </div>
    </div>

    <div class="instructions">
      <div class="instruction-item">
        <div class="inst-num">1</div>
        <div class="inst-content">
          <div class="inst-title">Chuyển sang tab "+ Tạo Tài Khoản"</div>
          <p class="inst-desc">Khi mở đường link Web hệ thống, nhấp vào tab xanh lá <strong>"+ Tạo Tài Khoản"</strong> ở đầu form.</p>
        </div>
      </div>
      <div class="instruction-item">
        <div class="inst-num">2</div>
        <div class="inst-content">
          <div class="inst-title">Điền thông tin định danh</div>
          <p class="inst-desc">Nhập họ tên thật (ví dụ: <em>Bùi Anh Minh</em> hoặc <em>Lang Thang Eco</em>) và đặt tên đăng nhập viết liền không dấu.</p>
        </div>
      </div>
      <div class="instruction-item">
        <div class="inst-num">3</div>
        <div class="inst-content">
          <div class="inst-title">Bấm nút "Tạo Tài Khoản & Vào Quản Lý"</div>
          <p class="inst-desc">Hệ thống tự động kích hoạt tài khoản ngay lập tức và đưa bạn vào thẳng màn hình làm việc chính.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- TRANG 2: BƯỚC 2 - MÀN HÌNH CHÍNH (ACTION HUB)            -->
  <!-- ======================================================== -->
  <div class="page">
    <div class="doc-header">
      <span class="brand">BƯỚC 2: MÀN HÌNH CHÍNH (ACTION HUB)</span>
      <span class="sub">Tập trung 6 Nút Chức Năng Lớn</span>
    </div>

    <h2 class="step-title">
      <span class="step-badge">2</span>
      Làm Quen Với Bảng Nút Chức Năng Lớn
    </h2>
    <div class="step-summary">
      Giao diện được thiết kế tối giản nhất: Toàn bộ các chức năng chính hiển thị dưới dạng 6 nút bấm to rực rỡ (mỗi nút một màu riêng biệt), khách hàng chỉ cần nhìn và bấm vào từng bước muốn sử dụng.
    </div>

    <!-- Ảnh minh họa có Callout -->
    <div class="img-container">
      <img src="${imgHub}" alt="Action Hub 6 Nút To" />

      <div class="callout callout-blue" style="top: 35%; left: 22%;">
        <span class="num">1</span> Nút Đăng Bài Lên Group
      </div>
      <div class="callout callout-green" style="top: 35%; left: 48%;">
        <span class="num">2</span> Nút Săn Khách & Quỹ Căn
      </div>
      <div class="callout" style="top: 35%; right: 8%; background: #f59e0b;">
        <span class="num">3</span> Nút Tin Nhắn Khách Hàng
      </div>
      <div class="callout" style="bottom: 14%; left: 22%; background: #8b5cf6;">
        <span class="num">4</span> Nút Tương Tác & Kết Bạn
      </div>
      <div class="callout" style="bottom: 14%; left: 48%; background: #06b6d4;">
        <span class="num">5</span> Nút Tài Khoản & Proxy
      </div>
      <div class="callout" style="top: 14%; right: 6%; background: rgba(255,255,255,0.2);">
        <span class="num">6</span> Nút Xem Thống Kê
      </div>
    </div>

    <div class="instructions">
      <div class="instruction-item">
        <div class="inst-num">1</div>
        <div class="inst-content">
          <div class="inst-title">Các Nút Chức Năng To Rõ Ràng (1, 2, 3, 4, 5, 6)</div>
          <p class="inst-desc">Mỗi nút mang một màu sắc trực quan (Xanh dương: Đăng bài, Xanh ngọc: Săn khách, Vàng cam: Tin nhắn, Tím: Tương tác, Cyan: Nick FB). Muốn làm bước nào, bấm thẳng vào nút đó.</p>
        </div>
      </div>
      <div class="instruction-item">
        <div class="inst-num">2</div>
        <div class="inst-content">
          <div class="inst-title">Nút Xem Số Liệu Thống Kê (Góc trên bên phải)</div>
          <p class="inst-desc">Được đặt ẩn gọn gàng ở góc trên. Khi nào cần xem báo cáo số lượng bài, lượt tương tác hoặc trạng thái mạng thì mới nhấp vào để mở ra.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- TRANG 3: BƯỚC 3 - SĂN KHÁCH & QUỸ CĂN (OCR + GPS MAP)    -->
  <!-- ======================================================== -->
  <div class="page">
    <div class="doc-header">
      <span class="brand">BƯỚC 3: NẠP QUỸ CĂN BĐS & RADAR BẮT KHÁCH</span>
      <span class="sub">Tesseract OCR Offline + Google Maps GPS</span>
    </div>

    <h2 class="step-title">
      <span class="step-badge">3</span>
      Nạp Nguồn Căn BĐS Trong Ngày & Định Vị Bản Đồ
    </h2>
    <div class="step-summary">
      Đầu ngày, bạn chỉ cần nạp danh sách căn hộ cho thuê/bán vào kho. Hệ thống sẽ tự động quét các bài viết mới trên Facebook, đo khoảng cách vị trí và bình luận chào căn hộ phù hợp nhất.
    </div>

    <!-- Ảnh minh họa có Callout -->
    <div class="img-container">
      <img src="${imgInventory}" alt="Kho nguồn BĐS & Radar" />

      <div class="callout callout-blue" style="top: 36%; left: 24%;">
        <span class="num">1</span> Cách 1: Dán chữ / Tin nhắn
      </div>
      <div class="callout callout-green" style="top: 36%; right: 20%;">
        <span class="num">2</span> Cách 2: Tải ảnh bảng hàng (OCR)
      </div>
      <div class="callout" style="bottom: 18%; left: 35%;">
        <span class="num">3</span> Bảng Quỹ Căn Kèm Vị Trí Bản Đồ GPS
      </div>
    </div>

    <div class="instructions">
      <div class="instruction-item">
        <div class="inst-num">1</div>
        <div class="inst-content">
          <div class="inst-title">Cách 1: Dán nhanh tin nhắn / Đoạn chat nguồn BĐS</div>
          <p class="inst-desc">Dán đoạn text (Ví dụ: <em>"Haven Park 2N2VS full đồ 11tr/tháng LH 0988..."</em>). Bộ lọc thông minh sẽ tự động tách phân khu, số phòng, giá thuê và số điện thoại.</p>
        </div>
      </div>
      <div class="instruction-item">
        <div class="inst-num">2</div>
        <div class="inst-content">
          <div class="inst-title">Cách 2: Tải ảnh chụp màn hình / Bảng hàng (OCR 0 đồng AI) <span class="tag-note">Đặc Quyền</span></div>
          <p class="inst-desc">Kéo thả ảnh chụp bảng hàng vào ô bên phải. Hệ thống tự quét chữ trong ảnh mà không tốn chi phí gọi AI.</p>
        </div>
      </div>
      <div class="instruction-item">
        <div class="inst-num">3</div>
        <div class="inst-content">
          <div class="inst-title">Cơ chế Radar GPS Ecopark tự động khớp căn gần nhất</div>
          <p class="inst-desc">Khi khách trên Facebook hỏi thuê ở <em>Swanlake Onsen</em> nhưng kho hết căn, bot sẽ tự động tính khoảng cách và gợi ý: <em>"Căn Haven Park cách đó chỉ ~270m đi bộ, giá 11tr..."</em>.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- TRANG 4: BƯỚC 4 - SOẠN & ĐĂNG BÀI LÊN GROUP             -->
  <!-- ======================================================== -->
  <div class="page">
    <div class="doc-header">
      <span class="brand">BƯỚC 4: SOẠN & PHÂN PHỐI BÀI VIẾT LÊN GROUP</span>
      <span class="sub">Tự Động Dãn Cách & Khóa Chống Trùng Bài</span>
    </div>

    <h2 class="step-title">
      <span class="step-badge">4</span>
      Soạn Bài Viết & Lên Lịch Đăng Hàng Loạt
    </h2>
    <div class="step-summary">
      Đăng bài viết BĐS kèm hình ảnh lên đồng thời Trang cá nhân và hàng chục Group BĐS mục tiêu mà không sợ bị Facebook khóa tính năng spam nhờ cơ chế tự động dãn cách thời gian.
    </div>

    <!-- Ảnh minh họa có Callout -->
    <div class="img-container">
      <img src="${imgPosts}" alt="Soạn và đăng bài lên group" />

      <div class="callout callout-blue" style="top: 26%; left: 30%;">
        <span class="num">1</span> Nhập nội dung bài đăng BĐS
      </div>
      <div class="callout callout-green" style="top: 48%; left: 35%;">
        <span class="num">2</span> Chọn nơi đăng (Nhóm mục tiêu / Tường)
      </div>
      <div class="callout" style="top: 66%; left: 24%;">
        <span class="num">3</span> Bấm "ĐĂNG NGAY" hoặc "LÊN LỊCH"
      </div>
      <div class="callout" style="bottom: 12%; right: 35%;">
        <span class="num">4</span> Kho Group & Trạng Thái Duyệt Bài
      </div>
    </div>

    <div class="instructions">
      <div class="instruction-item">
        <div class="inst-num">1</div>
        <div class="inst-content">
          <div class="inst-title">Soạn nội dung & Đính kèm hình ảnh</div>
          <p class="inst-desc">Nhập tiêu đề, mô tả căn hộ, hotline và bấm "Chọn File Ảnh Từ Máy" để tải lên các hình ảnh căn nhà.</p>
        </div>
      </div>
      <div class="instruction-item">
        <div class="inst-num">2</div>
        <div class="inst-content">
          <div class="inst-title">Chọn phạm vi đăng bài</div>
          <p class="inst-desc">Tích chọn <strong>"Trang Cá Nhân"</strong>, <strong>"Nhóm Mục Tiêu"</strong> hoặc <strong>"Cả Cá Nhân & Group"</strong> để phủ sóng tối đa khách hàng.</p>
        </div>
      </div>
      <div class="instruction-item">
        <div class="inst-num">3</div>
        <div class="inst-content">
          <div class="inst-title">Quản lý kho Group & Ghi chú tự động <span class="tag-note">Mới</span></div>
          <p class="inst-desc">Hệ thống tự động ghi nhận nhóm nào được đăng trực tiếp, nhóm nào cần Admin duyệt bài, và nhóm nào bị chặn để bạn tối ưu danh sách đăng hiệu quả nhất.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- TRANG 5: BƯỚC 5 & 6 - TIN NHẮN & QUẢN LÝ NICK           -->
  <!-- ======================================================== -->
  <div class="page">
    <div class="doc-header">
      <span class="brand">BƯỚC 5 & 6: TIN NHẮN KHÁCH HÀNG & QUẢN LÝ NICK</span>
      <span class="sub">Đồng Bộ Telegram 2 Chiều & Bảo Vệ Proxy</span>
    </div>

    <h2 class="step-title">
      <span class="step-badge">5</span>
      Tiếp Nhận Tin Nhắn & Quản Lý Đa Tài Khoản
    </h2>
    <div class="step-summary">
      Theo dõi khách hàng hỏi thuê/mua nhà tức thì và quản lý nhiều nick Facebook trên cùng một giao diện an toàn tuyệt đối.
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 10px;">
      
      <!-- Cột trái: Tin nhắn -->
      <div>
        <h4 style="margin: 0 0 6px 0; font-size: 11pt; color: #0071e3;">💬 5. Tin Nhắn Khách Hàng (1-1)</h4>
        <div class="img-container" style="margin: 6px 0 10px 0;">
          <img src="${imgInbox}" alt="Hộp thư tin nhắn" />
        </div>
        <ul style="margin: 0; padding-left: 18px; font-size: 8.5pt; color: #475569; line-height: 1.5;">
          <li>Mỗi khách hàng nhắn tin tới Facebook Messenger sẽ tự động tạo một phòng chat Topic riêng trên Telegram.</li>
          <li>Bạn có thể chat trực tiếp trên Telegram hoặc trên giao diện Web mà không cần phải mở ứng dụng Facebook.</li>
          <li>Gửi nhận ảnh và nội dung tức thì (~0ms) không lo bị sót khách.</li>
        </ul>
      </div>

      <!-- Cột phải: Tài khoản & Proxy -->
      <div>
        <h4 style="margin: 0 0 6px 0; font-size: 11pt; color: #10b981;">👤 6. Quản Lý Nick & Proxy Riêng</h4>
        <div class="img-container" style="margin: 6px 0 10px 0;">
          <img src="${imgAccounts}" alt="Quản lý tài khoản" />
        </div>
        <ul style="margin: 0; padding-left: 18px; font-size: 8.5pt; color: #475569; line-height: 1.5;">
          <li>Bấm nút <strong>"+ Thêm Nick"</strong> để gắn thêm nhiều tài khoản Facebook phục vụ cho việc đăng bài và săn khách.</li>
          <li>Mỗi nick được gán một IP Proxy riêng biệt, tránh bị Facebook quét checkpoint do dùng chung IP mạng.</li>
          <li>Nút <strong>"Vào FB (Proxy) ↗"</strong> cho phép mở trình duyệt bọc sẵn Proxy an toàn 100%.</li>
        </ul>
      </div>

    </div>

    <!-- Hộp tổng kết quy trình -->
    <div style="margin-top: 25px; padding: 16px; background: #f8fafc; border: 1.5px dashed #0071e3; border-radius: 14px;">
      <h4 style="margin: 0 0 8px 0; color: #0071e3; font-size: 11pt;">🎯 TÓM TẮT QUY TRÌNH LÀM VIỆC 1 NGÀY CỦA MÔI GIỚI:</h4>
      <ol style="margin: 0; padding-left: 20px; font-size: 9pt; color: #334155; line-height: 1.6;">
        <li><strong>Đầu ngày (8h00)</strong>: Mở Web -> Vào <strong>Săn Khách & Quỹ Căn</strong> -> Tải ảnh bảng hàng hoặc dán text để nạp nguồn.</li>
        <li><strong>Giữa ngày (10h00 & 14h00)</strong>: Vào <strong>Đăng Bài Lên Group</strong> -> Soạn bài BĐS hot trong ngày -> Lên lịch đăng lên các nhóm.</li>
        <li><strong>Cả ngày (24/24)</strong>: Bot tự động canh bài viết tìm nhà trong các Group -> Bình luận giới thiệu căn gần nhất -> Khách nhắn tin sẽ nổ ngay về Telegram để bạn chốt cọc!</li>
      </ol>
    </div>

  </div>

</body>
</html>
`;

const htmlFilePath = path.resolve('D:/KudoX_Mess_Tele/HDSD_FALCONX_BDS_AUTOMATION.html');
const pdfFilePath = path.resolve('D:/KudoX_Mess_Tele/HUONG_DAN_SU_DUNG_FALCONX_BDS_AUTOMATION.pdf');

fs.writeFileSync(htmlFilePath, htmlContent, 'utf8');
console.log('Generated guide HTML template at:', htmlFilePath);

(async () => {
  console.log('Launching Playwright to render high-resolution PDF...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('file:///' + htmlFilePath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.pdf({
    path: pdfFilePath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: false,
    margin: {
      top: '0mm',
      bottom: '0mm',
      left: '0mm',
      right: '0mm',
    },
  });

  console.log('SUCCESS! High-quality PDF guide exported to:', pdfFilePath);
  await browser.close();
})();
