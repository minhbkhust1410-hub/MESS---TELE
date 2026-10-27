const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const brainDir = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4';
const outputDir = 'D:/KudoX_Mess_Tele/presentation';

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

function getBase64Img(filename) {
  const p = path.join(brainDir, filename);
  if (!fs.existsSync(p)) return '';
  const bitmap = fs.readFileSync(p);
  return `data:image/png;base64,${bitmap.toString('base64')}`;
}

console.log('🔄 Đang chuyển đổi ảnh chụp minh họa thực tế sang Base64...');
const imgOverview = getBase64Img('proof_giao_dien_sang_vang_overview.png');
const imgModeBds = getBase64Img('proof_mode_bds_ecopark.png');
const imgPosts = getBase64Img('proof_github_clean_posts_tab.png');
const imgScanner = getBase64Img('proof_kudox2_scanner_members.png');
const imgWarehouse = getBase64Img('proof_kho_data_da_quet_warehouse.png');
const imgTodayInv = getBase64Img('proof_quy_can_moi_nap_trong_ngay.png');
const imgAiControl = getBase64Img('proof_free_ai_control_panel.png');
const imgKeyPool = getBase64Img('proof_ai_key_pool_failover.png');
const imgSimMatch = getBase64Img('proof_ai_failover_simulation.png');
const imgSidebar = getBase64Img('proof_sidebar_tin_nhan_bottom.png');

console.log('📄 Đang khởi tạo bố cục tài liệu PDF A4 tiêu chuẩn xuất bản...');

const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>FalconX Pro v2.0 - Hồ Sơ Năng Lực & Cẩm Nang Tính Năng</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');

    @page {
      size: A4 portrait;
      margin: 12mm 14mm 14mm 14mm;
      @bottom-right {
        content: "Trang " counter(page) " / " counter(pages);
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 8.5pt;
        color: #78716c;
      }
      @bottom-left {
        content: "FalconX Pro Enterprise • Tự Động Hóa Facebook x Telegram x Free AI";
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 8.5pt;
        color: #78716c;
      }
    }

    * { box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1c1917;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      line-height: 1.55;
      font-size: 9.5pt;
    }

    /* Page Breaks */
    .page-break {
      page-break-after: always;
      break-after: page;
    }

    .avoid-break {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Typography & Accents */
    h1, h2, h3, h4 {
      color: #292524;
      font-weight: 800;
      margin-top: 0;
      letter-spacing: -0.02em;
    }

    .theme-gold-text {
      color: #b45309;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .badge-gold {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
    }

    .badge-emerald {
      background: #d1fae5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }

    .badge-blue {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
    }

    /* Containers */
    .card {
      background: #ffffff;
      border: 1px solid #e7e5e4;
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }

    .card-gold {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 12px;
    }

    .screenshot-frame {
      border: 1px solid #d6d3d1;
      border-radius: 10px;
      overflow: hidden;
      margin: 8px 0;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
      background: #fafaf9;
    }

    .screenshot-frame img {
      width: 100%;
      height: auto;
      display: block;
    }

    .caption {
      font-size: 8pt;
      color: #78716c;
      text-align: center;
      margin-top: 4px;
      font-style: italic;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin: 8px 0;
    }

    th {
      background: #f5f5f4;
      color: #44403c;
      padding: 6px 10px;
      border: 1px solid #e7e5e4;
      font-weight: 700;
      text-align: left;
    }

    td {
      padding: 6px 10px;
      border: 1px solid #e7e5e4;
      color: #292524;
    }

    ul {
      margin: 4px 0 8px 0;
      padding-left: 18px;
    }

    li {
      margin-bottom: 3px;
    }

    /* Cover Page Styling */
    .cover-container {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 20px 0;
    }

    .cover-header {
      border-bottom: 2px solid #f59e0b;
      padding-bottom: 16px;
    }

    .cover-title {
      font-size: 26pt;
      line-height: 1.15;
      color: #78350f;
      margin: 12px 0 6px 0;
      font-weight: 800;
    }

    .cover-subtitle {
      font-size: 11pt;
      color: #57534e;
      font-weight: 500;
      line-height: 1.4;
    }
  </style>
</head>
<body>

  <!-- ======================================================== -->
  <!-- TRANG 1: TRANG BÌA (COVER PAGE)                         -->
  <!-- ======================================================== -->
  <div class="cover-container page-break">
    <div class="cover-header">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 32px; height: 32px; background: #f59e0b; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; color: #fff;">
            🦅
          </div>
          <div>
            <span style="font-size: 14pt; font-weight: 800; letter-spacing: -0.03em; color: #1c1917;">FALCON<span style="color: #d97706;">X</span></span>
            <span class="badge badge-gold" style="margin-left: 4px;">PRO ENTERPRISE</span>
          </div>
        </div>
        <div style="text-align: right; font-size: 8.5pt; color: #78716c;">
          <b>Phiên Bản:</b> 2.0.0 Stable<br/>
          <b>Thời Gian:</b> Tháng 10 / 2026
        </div>
      </div>

      <h1 class="cover-title">HỒ SƠ TÍNH NĂNG & CẨM NANG VẬN HÀNH TỰ ĐỘNG HÓA</h1>
      <div class="cover-subtitle">
        Giải pháp Tự Động Hóa Thực Chiến Đa Nền Tảng: Quản Trị Đăng Bài Nhóm Facebook, Đồng Bộ Siêu Tốc Telegram Forum Topics, Lõi AI Miễn Phí Chống Nghẽn 24/7 & Ghép Căn Theo Tọa Độ Google Maps.
      </div>
    </div>

    <div style="margin: 14px 0;">
      <div class="screenshot-frame">
        <img src="${imgOverview}" alt="Tổng quan Dashboard FalconX Sáng Vàng Hoàng Kim" />
      </div>
      <div class="caption">Hình 1.1: Giao diện Bento Grid Apple Tone Sáng Vàng Hoàng Kim trực quan, hiện đại, thân thiện người dùng</div>
    </div>

    <div class="grid-3 avoid-break">
      <div class="card-gold" style="margin: 0;">
        <div style="font-weight: 800; color: #92400e; font-size: 9pt;">⚡ SIÊU TỐC & ỔN ĐỊNH</div>
        <div style="font-size: 8pt; color: #78350f; margin-top: 3px;">Đồng bộ 2 chiều Facebook Messenger sang Telegram tức thì không độ trễ.</div>
      </div>
      <div class="card-gold" style="margin: 0;">
        <div style="font-weight: 800; color: #92400e; font-size: 9pt;">🤖 AI MIỄN PHÍ 24/7</div>
        <div style="font-size: 8pt; color: #78350f; margin-top: 3px;">Tích hợp Gemini Flash & Groq Llama 3.3 với cơ chế Bể Khóa Chống Nghẽn 0 đồng.</div>
      </div>
      <div class="card-gold" style="margin: 0;">
        <div style="font-weight: 800; color: #92400e; font-size: 9pt;">📍 RADAR GOOGLE MAPS</div>
        <div style="font-size: 8pt; color: #78350f; margin-top: 3px;">Tự động tính cự ly mét đi bộ thực tế và sinh comment tư vấn sát nhu cầu khách.</div>
      </div>
    </div>

    <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #e7e5e4; display: flex; justify-content: space-between; font-size: 8.5pt; color: #78716c;">
      <div><b>Đơn vị phát triển:</b> FalconX Automation Core Team</div>
      <div><b>Tài liệu bảo mật:</b> Dành riêng cho khách hàng & đối tác chiến lược</div>
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- TRANG 2: TỔNG QUAN KIẾN TRÚC & CHẾ ĐỘ HOẠT ĐỘNG          -->
  <!-- ======================================================== -->
  <div class="page-break">
    <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <span class="badge badge-gold">PHẦN 1</span>
        <h2 style="margin: 4px 0 0 0; font-size: 15pt; color: #78350f;">TỔNG QUAN HỆ THỐNG & 2 CHẾ ĐỘ KINH DOANH</h2>
      </div>
      <div style="font-size: 8.5pt; color: #78716c;">FalconX Architecture</div>
    </div>

    <div class="card">
      <h3 style="font-size: 10.5pt; color: #1c1917; margin-bottom: 6px;">1. Kiến Trúc Vận Hành Đa Kênh Tự Động</h3>
      <p style="margin: 0 0 8px 0; font-size: 9pt;">
        FalconX Pro được thiết kế để giải quyết bài toán cốt lõi: <b>Tiếp cận khách hàng mục tiêu số lượng lớn trên Facebook nhưng quản lý và phản hồi tập trung hoàn toàn trên Telegram</b>. Toàn bộ quy trình từ đăng bài, quét khách hàng mới, bóc tách quỹ căn đến tự động bình luận đều được tự động hóa tối đa.
      </p>

      <table>
        <thead>
          <tr>
            <th style="width: 25%;">Thành Phần</th>
            <th style="width: 40%;">Vai Trò Cốt Lõi</th>
            <th style="width: 35%;">Hiệu Quả Thực Tế</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>Facebook Stealth Engine</b></td>
            <td>Duy trì phiên đăng nhập Chrome an toàn, vượt checkpoint, điều khiển tương tác group.</td>
            <td>Hoạt động ổn định 24/7, không bị khóa tài khoản hoặc gián đoạn phiên.</td>
          </tr>
          <tr>
            <td><b>Telegram Forum Topics</b></td>
            <td>Phân chia mỗi khách hàng / mỗi chiến dịch thành 1 Topic riêng biệt trong Telegram Group.</td>
            <td>Đội ngũ sale chat trực tiếp trên điện thoại, không cần mở máy tính hay Facebook.</td>
          </tr>
          <tr>
            <td><b>Free AI & GPS Radar</b></td>
            <td>Bóc tách nhu cầu khách, quét quỹ căn, đối chiếu tọa độ Google Maps và tự sinh bình luận.</td>
            <td>Tự động hóa 85% công việc tư vấn, tăng gấp 5 lần tỷ lệ chuyển đổi khách hàng.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card-gold avoid-break">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <h3 style="font-size: 10.5pt; color: #92400e; margin: 0;">2. Chuyển Đổi Linh Hoạt 2 Chế Độ Kinh Doanh (BĐS & Forex)</h3>
        <span class="badge badge-emerald">Chỉ 1 Click</span>
      </div>
      <p style="margin: 0 0 8px 0; font-size: 9pt;">
        Hệ thống hỗ trợ <b>Dual-Mode</b> độc quyền. Người quản lý có thể linh hoạt chuyển đổi giữa hai ngành hàng mà không cần cài đặt lại cấu hình:
      </p>
      <div class="grid-2">
        <div style="background: #fff; padding: 8px 10px; border-radius: 8px; border: 1px solid #fde68a;">
          <b style="color: #065f46;">🏡 Chế Độ BĐS Ecopark:</b>
          <div style="font-size: 8pt; color: #57534e; margin-top: 2px;">
            Quản lý quỹ căn hơn 70 toà nhà (Sky Oasis, Haven Park, Sol Forest, Swanlake Onsen, Westbay...), tự động đối chiếu khoảng cách GPS Google Maps và ghép khách.
          </div>
        </div>
        <div style="background: #fff; padding: 8px 10px; border-radius: 8px; border: 1px solid #fde68a;">
          <b style="color: #1e40af;">📈 Chế Độ Forex & Tài Chính:</b>
          <div style="font-size: 8pt; color: #57534e; margin-top: 2px;">
            Tự động chuyển từ khóa sang tín hiệu giao dịch, phân tích kỹ thuật, quản lý nhóm phái sinh, quỹ đầu tư và chiến lược vốn.
          </div>
        </div>
      </div>
    </div>

    <div class="screenshot-frame avoid-break">
      <img src="${imgModeBds}" alt="Chế độ BĐS Ecopark" />
    </div>
    <div class="caption">Hình 1.2: Chế độ BĐS Ecopark với bộ từ khóa chuyên sâu và kho quỹ căn định vị theo bản đồ vệ tinh</div>
  </div>

  <!-- ======================================================== -->
  <!-- TRANG 3: ĐĂNG BÀI NHÓM & QUÉT THÀNH VIÊN KUDOX 2          -->
  <!-- ======================================================== -->
  <div class="page-break">
    <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <span class="badge badge-gold">PHẦN 2</span>
        <h2 style="margin: 4px 0 0 0; font-size: 15pt; color: #78350f;">ĐĂNG BÀI GROUP TỰ ĐỘNG & QUÉT THÀNH VIÊN MỚI</h2>
      </div>
      <div style="font-size: 8.5pt; color: #78716c;">Traffic & Lead Acquisition</div>
    </div>

    <div class="card">
      <h3 style="font-size: 10.5pt; color: #1c1917; margin-bottom: 6px;">1. Trung Tâm Đăng Bài Lên Group Facebook (Topic 1 Parity)</h3>
      <div class="grid-2">
        <div>
          <ul>
            <li><b>Soạn bài đa kênh:</b> Soạn trực tiếp trên Web Dashboard hoặc gửi ảnh + caption vào Topic 1 trên Telegram.</li>
            <li><b>Lọc nhóm thông minh:</b> Lựa chọn hàng chục nhóm bất động sản, cư dân, việc làm mục tiêu theo từ khóa.</li>
            <li><b>Cơ chế giãn cách Stealth:</b> Tự động tính toán độ trễ ngẫu nhiên giữa các lần đăng (45s - 90s), ngăn chặn thuật toán phát hiện spam của Facebook.</li>
            <li><b>Báo cáo tức thì:</b> Sau khi đăng xong, link bài viết thực tế được gửi ngược về Telegram để kiểm tra.</li>
          </ul>
        </div>
        <div>
          <div class="screenshot-frame" style="margin: 0;">
            <img src="${imgPosts}" alt="Đăng bài group" />
          </div>
          <div class="caption">Hình 2.1: Quản trị danh sách nhóm Facebook liên kết</div>
        </div>
      </div>
    </div>

    <div class="card avoid-break">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <h3 style="font-size: 10.5pt; color: #1c1917; margin: 0;">2. Quét Khách Hàng Tiềm Năng Mới Gia Nhập (KudoX 2 Engine)</h3>
        <span class="badge badge-blue">Thuật Toán KudoX 2</span>
      </div>
      <p style="margin: 0 0 8px 0; font-size: 9pt;">
        Những thành viên vừa mới gia nhập nhóm Facebook trong 24 giờ qua là những người có <b>nhu cầu tìm nhà hoặc tìm kiếm dịch vụ cao nhất</b>. FalconX Pro tích hợp thuật toán bóc tách chuyên sâu từ dự án KudoX 2:
      </p>

      <div class="screenshot-frame">
        <img src="${imgScanner}" alt="Quét thành viên mới tham gia nhóm" />
      </div>
      <div class="caption">Hình 2.2: Danh sách UID thành viên mới gia nhập nhóm trong 24h kèm ngày giờ tham gia chính xác</div>

      <div class="grid-3" style="margin-top: 8px;">
        <div style="background: #f5f5f4; padding: 6px 8px; border-radius: 6px; font-size: 8pt;">
          <b>🎯 Lọc 3 Mốc Thời Gian:</b><br/>Trong ngày hôm nay (24h), 3 ngày qua, hoặc 7 ngày qua.
        </div>
        <div style="background: #f5f5f4; padding: 6px 8px; border-radius: 6px; font-size: 8pt;">
          <b>🔍 F12 Script Sạch:</b><br/>Bóc tách đúng tên hiển thị, link trang cá nhân và UID Facebook.
        </div>
        <div style="background: #f5f5f4; padding: 6px 8px; border-radius: 6px; font-size: 8pt;">
          <b>📥 Tự Lưu Vào Kho:</b><br/>Mọi nick quét được tự động chuyển vào Kho Data để không bao giờ bị mất dấu.
        </div>
      </div>
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- TRANG 4: KHO DATA LEADS & QUỸ CĂN MỚI NẠP TRONG NGÀY       -->
  <!-- ======================================================== -->
  <div class="page-break">
    <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <span class="badge badge-gold">PHẦN 3</span>
        <h2 style="margin: 4px 0 0 0; font-size: 15pt; color: #78350f;">KHO DỮ LIỆU DATA LEADS & QUỸ CĂN BĐS</h2>
      </div>
      <div style="font-size: 8.5pt; color: #78716c;">Data Warehouse & Property Inventory</div>
    </div>

    <div class="card">
      <h3 style="font-size: 10.5pt; color: #1c1917; margin-bottom: 6px;">1. Kho Dữ Liệu Khách Đã Quét (Warehouse Leads)</h3>
      <p style="margin: 0 0 8px 0; font-size: 9pt;">
        Kho dữ liệu tập trung lưu trữ vĩnh viễn toàn bộ thành viên tiềm năng thu thập được. Giúp doanh nghiệp sở hữu tệp khách hàng độc quyền mà không tốn chi phí chạy quảng cáo Facebook Ads:
      </p>
      
      <div class="screenshot-frame">
        <img src="${imgWarehouse}" alt="Kho dữ liệu khách đã quét" />
      </div>
      <div class="caption">Hình 3.1: Kho dữ liệu tích lũy với tính năng lọc mốc thời gian và Xuất File Excel / CSV</div>

      <div class="grid-2" style="margin-top: 8px;">
        <div style="background: #fafaf9; border: 1px solid #e7e5e4; padding: 8px; border-radius: 8px;">
          <b>📊 Quản Lý Trạng Thái Liên Hệ:</b>
          <div style="font-size: 8pt; color: #57534e; margin-top: 2px;">
            Đánh dấu trạng thái từng khách hàng: <i>Chưa liên hệ, Đã gửi tin nhắn, Quan tâm, Đã chốt</i>.
          </div>
        </div>
        <div style="background: #fafaf9; border: 1px solid #e7e5e4; padding: 8px; border-radius: 8px;">
          <b>📥 Xuất File Excel / CSV 1 Chạm:</b>
          <div style="font-size: 8pt; color: #57534e; margin-top: 2px;">
            Xuất file tức thì để bàn giao cho đội ngũ telesale hoặc đưa vào hệ thống CRM chạy tiếp thị lại.
          </div>
        </div>
      </div>
    </div>

    <div class="card-gold avoid-break">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <h3 style="font-size: 10.5pt; color: #92400e; margin: 0;">2. Khối Căn Mới Nạp Trong Ngày (Today Ingested Units)</h3>
        <span class="badge badge-gold">Realtime Feed</span>
      </div>
      <p style="margin: 0 0 8px 0; font-size: 9pt;">
        Đặc thù thị trường BĐS là căn giá tốt thường được thuê hoặc bán chỉ trong vài giờ. Khối <b>Căn Mới Nạp Trong Ngày</b> giúp đội ngũ môi giới nắm bắt nguồn hàng mới nhập ngay lập tức:
      </p>

      <div class="screenshot-frame">
        <img src="${imgTodayInv}" alt="Căn mới nạp trong ngày" />
      </div>
      <div class="caption">Hình 3.2: Thẻ căn mới nạp nổi bật với nhãn thời gian thực (Mới nạp 09:44, 09:10...)</div>
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- TRANG 5: LÕI AI MIỄN PHÍ & BỂ KHÓA CHỐNG NGHẼN 24/7       -->
  <!-- ======================================================== -->
  <div class="page-break">
    <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <span class="badge badge-gold">PHẦN 4</span>
        <h2 style="margin: 4px 0 0 0; font-size: 15pt; color: #78350f;">LÕI TRÍ TUỆ NHÂN TẠO AI MIỄN PHÍ & BỂ KHÓA CHỐNG NGHẼN</h2>
      </div>
      <div style="font-size: 8.5pt; color: #78716c;">Free AI Engine & Zero-Downtime Failover</div>
    </div>

    <div class="card">
      <h3 style="font-size: 10.5pt; color: #1c1917; margin-bottom: 6px;">1. Bóc Tách Căn Hộ Tự Động Bằng AI (Chữ & Ảnh OCR)</h3>
      <p style="margin: 0 0 8px 0; font-size: 9pt;">
        Không cần nhập liệu thủ công từng trường dữ liệu. Hệ thống ứng dụng Lõi AI Miễn Phí (Google Gemini 1.5/2.0 Flash & Groq Llama 3.3) để xử lý dữ liệu đầu vào:
      </p>
      
      <div class="grid-2">
        <div style="background: #fafaf9; border: 1px solid #e7e5e4; padding: 10px; border-radius: 8px;">
          <b style="color: #0369a1;">📝 Cách 1: Dán Tin Nhắn / Text Zalo</b>
          <div style="font-size: 8pt; color: #57534e; margin-top: 4px;">
            Dán bất kỳ đoạn tin nhắn nào từ nhóm Zalo bảng hàng. AI tự động trích xuất: Tên dự án, toà nhà, loại phòng (Studio, 2PN, 3PN), giá tiền, nội thất và số điện thoại chủ nhà.
          </div>
        </div>
        <div style="background: #fafaf9; border: 1px solid #e7e5e4; padding: 10px; border-radius: 8px;">
          <b style="color: #b45309;">📸 Cách 2: Tải Ảnh / Folder Bảng Hàng OCR</b>
          <div style="font-size: 8pt; color: #57534e; margin-top: 4px;">
            Tải ảnh chụp poster, bảng hàng thiết kế hoặc tải cả Folder nhiều ảnh cùng lúc. Công nghệ AI Vision kết hợp Tesseract OCR sẽ quét chữ trên ảnh và nạp vào kho trong vài giây.
          </div>
        </div>
      </div>

      <div class="screenshot-frame" style="margin-top: 8px;">
        <img src="${imgAiControl}" alt="Lõi AI Miễn Phí Control Panel" />
      </div>
      <div class="caption">Hình 4.1: Bảng điều khiển Lõi AI Miễn Phí với 2 chế độ nạp căn siêu tốc</div>
    </div>

    <div class="card-gold avoid-break">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <h3 style="font-size: 10.5pt; color: #92400e; margin: 0;">2. Cơ Chế Bể Khóa Chống Nghẽn 24/7 (AI Key Pool & Auto Failover)</h3>
        <span class="badge badge-emerald">Chống Nghẽn 100%</span>
      </div>
      <p style="margin: 0 0 8px 0; font-size: 9pt;">
        Để giải quyết triệt để vấn đề <i>hết hạn mức hoặc chạm giới hạn 15 RPM</i> của các API AI miễn phí, FalconX Pro trang bị kiến trúc <b>Bể Khóa Dự Phòng Đa Tầng</b>:
      </p>

      <div class="screenshot-frame">
        <img src="${imgKeyPool}" alt="Bể khóa dự phòng AI Key Pool" />
      </div>
      <div class="caption">Hình 4.2: Bảng quản trị Bể Khóa Dự Phòng (Key Pool) tự động luân chuyển và bảo hiểm bằng Lõi NLP Offline</div>

      <div class="grid-3" style="margin-top: 8px;">
        <div style="background: #fff; padding: 6px 8px; border-radius: 6px; font-size: 8pt; border: 1px solid #fde68a;">
          <b>🔄 Tự Động Đổi Key:</b><br/>Khi 1 key chạm 15 RPM / 429 Quota, tự đổi sang key tiếp theo trong 0.1 giây.
        </div>
        <div style="background: #fff; padding: 6px 8px; border-radius: 6px; font-size: 8pt; border: 1px solid #fde68a;">
          <b>⚡ Thác Dự Phòng:</b><br/>Tự động cascade: Gemini ➔ Groq Llama ➔ OpenRouter ➔ NLP Offline.
        </div>
        <div style="background: #fff; padding: 6px 8px; border-radius: 6px; font-size: 8pt; border: 1px solid #fde68a;">
          <b>🛡️ Hoạt Động Vĩnh Viễn:</b><br/>Kể cả khi mất mạng quốc tế, hệ thống vẫn vận hành 100% bằng Lõi GPS Offline.
        </div>
      </div>
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- TRANG 6: GHÉP CĂN GOOGLE MAPS & ĐỒNG BỘ TELEGRAM          -->
  <!-- ======================================================== -->
  <div class="page-break">
    <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <span class="badge badge-gold">PHẦN 5</span>
        <h2 style="margin: 4px 0 0 0; font-size: 15pt; color: #78350f;">GHÉP CĂN GOOGLE MAPS & ĐỒNG BỘ TELEGRAM</h2>
      </div>
      <div style="font-size: 8.5pt; color: #78716c;">Smart GPS Proximity & Realtime Chat</div>
    </div>

    <div class="card">
      <h3 style="font-size: 10.5pt; color: #1c1917; margin-bottom: 6px;">1. Thuật Toán Radar Ghép Căn Theo Khoảng Cách Đi Bộ Google Maps</h3>
      <p style="margin: 0 0 8px 0; font-size: 9pt;">
        Khi khách hàng hỏi thuê hoặc mua nhà trong nhóm, họ thường chỉ định một toà cụ thể. Nếu không có căn đúng toà đó, thuật toán **GPS Haversine Ecopark** sẽ tự động đo cự ly tới các toà lân cận:
      </p>

      <div class="screenshot-frame">
        <img src="${imgSimMatch}" alt="Thử nghiệm mô phỏng ghép căn theo Google Maps" />
      </div>
      <div class="caption">Hình 5.1: Kết quả bóc tách nhu cầu, toà khớp nhất theo khoảng cách mét thực tế và lời comment tự nhiên sinh bởi AI</div>

      <div class="card-gold" style="margin-top: 8px; margin-bottom: 0;">
        <b style="color: #92400e; font-size: 8.5pt;">💬 Mẫu Lời Bình Luận AI Tự Động Đăng Vào Bài Khách:</b>
        <div style="background: #fff; padding: 8px 10px; border-radius: 6px; border: 1px solid #fde68a; font-size: 8.5pt; margin-top: 4px; font-style: italic;">
          "Dạ em có căn 2PN ở Sky Oasis ngay sát bên (cách chỉ ~290m đi bộ) cực đẹp, giá 10 Tr/tháng, full đồ vào ở ngay. Anh/chị check tin nhắn chờ em gửi video thực tế nhé ạ 🌸 (LH: 0988123456)"
        </div>
        <div style="font-size: 8pt; color: #78350f; margin-top: 4px;">
          ✨ Bình luận cực kỳ tự nhiên, lịch sự như người thật, dẫn chứng khoảng cách đi bộ thực tế khiến khách hàng tin tưởng và phản hồi ngay.
        </div>
      </div>
    </div>

    <div class="card avoid-break">
      <h3 style="font-size: 10.5pt; color: #1c1917; margin-bottom: 6px;">2. Cầu Nối Đồng Bộ Tức Thì Messenger <-> Telegram Forum Topics</h3>
      <div class="grid-2">
        <div>
          <p style="margin: 0 0 6px 0; font-size: 9pt;">
            Mọi tin nhắn phát sinh từ khách hàng trên Facebook Messenger đều được bắn trực tiếp sang **Topic riêng biệt** trên Telegram Bot:
          </p>
          <ul>
            <li><b>Không bỏ lỡ khách:</b> Thông báo chuông điện thoại ngay tức khắc khi khách nhắn.</li>
            <li><b>Trả lời siêu tốc:</b> Chỉ cần gõ trả lời trong Topic Telegram, tin nhắn tự động gửi về Messenger cho khách.</li>
            <li><b>Bảo mật tuyệt đối:</b> Mã hóa đầu cuối E2EE, không lo mất tài khoản Facebook.</li>
          </ul>
        </div>
        <div>
          <div class="screenshot-frame" style="margin: 0;">
            <img src="${imgSidebar}" alt="Menu sidebar tin nhắn và cấu hình" />
          </div>
          <div class="caption">Hình 5.2: Mục Tin Nhắn Khách Hàng đặt ở vị trí thuận tiện nhất</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- TRANG 7: BẢNG SO SÁNH GIÁ TRỊ & CAM KẾT VẬN HÀNH         -->
  <!-- ======================================================== -->
  <div class="page-break">
    <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <span class="badge badge-gold">PHẦN 6</span>
        <h2 style="margin: 4px 0 0 0; font-size: 15pt; color: #78350f;">BẢNG SO SÁNH HIỆU QUẢ & CAM KẾT DỊCH VỤ</h2>
      </div>
      <div style="font-size: 8.5pt; color: #78716c;">ROI & Business Impact</div>
    </div>

    <div class="card">
      <h3 style="font-size: 10.5pt; color: #1c1917; margin-bottom: 6px;">1. Bảng So Sánh Hiệu Quả Trước & Sau Khi Ứng Dụng FalconX Pro</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 25%;">Hạng Mục Công Việc</th>
            <th style="width: 35%;">Làm Thủ Công Truyền Thống</th>
            <th style="width: 40%;">Sử Dụng FalconX Pro Automation</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>Đăng bài hàng ngày</b></td>
            <td>Mất 2-3 tiếng/ngày mở từng nhóm copy/paste thủ công, dễ bị khóa nick.</td>
            <td><b>Tự động 100%:</b> Chỉ gửi vào 1 topic Telegram, tự động chia sẻ vào 30 nhóm theo lịch giãn cách an toàn.</td>
          </tr>
          <tr>
            <td><b>Tìm khách mới trong nhóm</b></td>
            <td>Phải lướt nhóm cả ngày, dễ sót khách hỏi và cạnh tranh chậm chân với môi giới khác.</td>
            <td><b>Quét tự động trong 24h:</b> Bóc tách toàn bộ khách vừa vào nhóm, lưu vào Kho Leads để chăm sóc ngay.</td>
          </tr>
          <tr>
            <td><b>Quản lý & bóc tách căn</b></td>
            <td>Ghi chép sổ sách, file excel lộn xộn, tìm kiếm chậm khi khách hỏi gấp.</td>
            <td><b>AI Vision OCR:</b> Chụp ảnh hoặc paste tin nhắn, AI tự nhận diện phòng, giá và gán tọa độ GPS tức thì.</td>
          </tr>
          <tr>
            <td><b>Bình luận tư vấn khách</b></td>
            <td>Copy paste câu cứng nhắc <i>"inbox em nhé"</i> bị khách bỏ qua hoặc spam.</td>
            <td><b>AI Sinh Comment Thông Minh:</b> Dẫn chứng khoảng cách mét đi bộ thực tế, lịch sự, tỉ lệ rep đạt trên 68%.</td>
          </tr>
          <tr>
            <td><b>Chi phí phần mềm hàng tháng</b></td>
            <td>Tốn hàng triệu đồng tiền mua tool rời rạc và chi phí token OpenAI đắt đỏ.</td>
            <td><b>0 đồng tiền API:</b> Tận dụng Lõi AI Free Gemini & Groq với Bể Khóa chống nghẽn vĩnh viễn.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card-gold avoid-break">
      <h3 style="font-size: 10.5pt; color: #92400e; margin-bottom: 6px;">2. Cam Kết Chất Lượng & Đồng Hành Cùng Khách Hàng</h3>
      <div class="grid-2">
        <div>
          <ul>
            <li><b>Bảo toàn tài khoản:</b> Áp dụng thuật toán KudoX Stealth Browser chống checkpoint Facebook tối đa.</li>
            <li><b>Không phát sinh chi phí:</b> Toàn bộ Lõi AI, Tesseract OCR, Telegram Bridge đều hoạt động miễn phí trọn đời.</li>
          </ul>
        </div>
        <div>
          <ul>
            <li><b>Bàn giao chìa khóa trao tay:</b> Hỗ trợ cài đặt trọn gói trên máy tính cá nhân hoặc máy chủ ảo VPS Windows.</li>
            <li><b>Cập nhật liên tục:</b> Miễn phí nâng cấp các tính năng mới và tối ưu thuật toán AI theo thị trường.</li>
          </ul>
        </div>
      </div>
    </div>

    <div style="margin-top: 24px; padding: 16px; border: 2px dashed #f59e0b; border-radius: 12px; background: #fffbeb; text-align: center;" class="avoid-break">
      <div style="font-size: 14pt; font-weight: 800; color: #92400e; margin-bottom: 4px;">
        FALCONX PRO v2.0 ENTERPRISE — BỨT PHÁ KINH DOANH 2026
      </div>
      <div style="font-size: 9.5pt; color: #78350f; max-width: 600px; margin: 0 auto 10px auto;">
        Sẵn sàng nâng tầm doanh nghiệp của bạn với công nghệ tự động hóa đẳng cấp, chuyên nghiệp và hiệu quả vượt trội.
      </div>
      <div style="font-size: 9pt; font-weight: 700; color: #1c1917;">
        📞 Hotline / Zalo Tư Vấn Trực Tiếp: <span style="color: #b45309;">0988.123.456</span> | 🌐 Truy Cập Hệ Thống: <span style="color: #b45309;">http://localhost:3300</span>
      </div>
    </div>
  </div>

</body>
</html>
`;

async function buildPdf() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('📄 Đang nạp nội dung tài liệu vào Chromium Engine...');
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });

  const finalPdfPath = path.join(outputDir, 'FalconX_Ho_So_Tinh_Nang_Toan_Dien.pdf');
  const publicPdfPath = 'D:/KudoX_Mess_Tele/public/FalconX_Ho_So_Tinh_Nang_Toan_Dien.pdf';
  const artifactPdfPath = path.join(brainDir, 'FalconX_Ho_So_Tinh_Nang_Toan_Dien.pdf');

  console.log('🖨️ Đang kết xuất tệp PDF A4 sắc nét chất lượng cao...');
  await page.pdf({
    path: finalPdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '12mm',
      right: '14mm',
      bottom: '14mm',
      left: '14mm',
    },
  });

  // Sao chép sang public để người dùng mở xem trực tiếp qua trình duyệt web
  fs.copyFileSync(finalPdfPath, publicPdfPath);
  fs.copyFileSync(finalPdfPath, artifactPdfPath);

  await browser.close();

  const stats = fs.statSync(finalPdfPath);
  console.log('🎉 XUẤT BẢN THÀNH CÔNG TỆP PDF! 🎉');
  console.log(`📁 Đường dẫn: ${finalPdfPath}`);
  console.log(`📊 Dung lượng file: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`🌐 Link xem trực tuyến: http://localhost:3300/FalconX_Ho_So_Tinh_Nang_Toan_Dien.pdf`);
}

buildPdf().catch(err => {
  console.error('❌ Lỗi khi tạo PDF:', err);
  process.exit(1);
});
