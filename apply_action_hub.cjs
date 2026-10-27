const fs = require('fs');

const filePath = 'D:/KudoX_Mess_Tele/public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// 1. Cấu trúc lại toàn bộ tab-overview thành ACTION HUB với các NÚT CHỨC NĂNG LỚN MỖI NÚT MỘT MÀU
const oldOverviewContentPattern = /<!-- Apple Pro Hero Banner -->[\s\S]*?<!-- ======================================================== -->\s*<!-- TAB 2: HỘI THOẠI KHÁCH HÀNG/;

const newOverviewContent = `<!-- ======================================================== -->
        <!-- ACTION HUB: CÁC NÚT CHỨC NĂNG LỚN (MỖI NÚT MỘT MÀU)    -->
        <!-- ======================================================== -->
        <div class="space-y-6">

          <!-- Welcome & Guidance Banner -->
          <div class="apple-card rounded-3xl p-6 sm:p-7 border border-white/10 bg-gradient-to-r from-white/[0.05] via-white/[0.02] to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="space-y-1">
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#30d158]/15 text-[#30d158] border border-[#30d158]/30 text-xs font-semibold">
                <span class="w-2 h-2 rounded-full bg-[#30d158] animate-warm-pulse"></span>
                <span>HỆ THỐNG ĐANG HOẠT ĐỘNG SẴN SÀNG</span>
              </div>
              <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Chào mừng bạn đến với FalconX BĐS Automation
              </h1>
              <p class="text-xs sm:text-sm text-[#86868b]">
                Chọn một chức năng bên dưới để bắt đầu làm việc theo từng bước:
              </p>
            </div>
            
            <!-- Nút bật/tắt thống kê -->
            <button onclick="toggleStatsSection()" id="btn-toggle-stats" class="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition flex items-center gap-2 self-start sm:self-center shadow-sm">
              <span class="text-base">📊</span>
              <span id="toggle-stats-text">Xem Số Liệu Thống Kê ▾</span>
            </button>
          </div>

          <!-- LƯỚI 6 NÚT CHỨC NĂNG LỚN — MỖI NÚT 1 MÀU RỰC RỠ -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            
            <!-- NÚT 1: ĐĂNG BÀI LÊN GROUP (MÀU XANH DƯƠNG - ROYAL BLUE) -->
            <div onclick="switchTab('posts')" class="group cursor-pointer rounded-3xl p-6 border transition-all duration-300 relative overflow-hidden bg-gradient-to-br from-[#0071e3]/20 via-[#0071e3]/10 to-transparent border-[#0071e3]/30 hover:border-[#0071e3] hover:shadow-[0_10px_35px_rgba(0,113,227,0.25)] hover:-translate-y-1">
              <div class="flex items-center justify-between mb-4">
                <div class="w-14 h-14 rounded-2xl bg-[#0071e3] text-white flex items-center justify-center text-2xl shadow-lg shadow-[#0071e3]/40 group-hover:scale-110 transition-transform duration-300">
                  📝
                </div>
                <span class="text-xs font-mono font-bold px-3 py-1 rounded-full bg-[#0071e3]/25 text-[#2997ff] border border-[#0071e3]/40">
                  <span id="hub-badge-posts">13</span> Bài / Nhóm
                </span>
              </div>
              <h3 class="text-lg font-bold text-white mb-1.5 group-hover:text-[#2997ff] transition-colors">
                1. Đăng Bài Lên Group
              </h3>
              <p class="text-xs text-[#86868b] leading-relaxed mb-5">
                Soạn bài viết BĐS, tải ảnh lên, chọn trang cá nhân hoặc nhóm mục tiêu và hẹn giờ tự động dãn cách an toàn.
              </p>
              <div class="w-full py-2.5 px-4 rounded-full bg-[#0071e3] text-white text-xs font-semibold flex items-center justify-center gap-2 group-hover:bg-[#0077ed] transition shadow-md">
                <span>Vào Soạn & Đăng Bài</span>
                <span class="text-sm">➔</span>
              </div>
            </div>

            <!-- NÚT 2: SĂN KHÁCH & QUỸ CĂN (MÀU XANH NGỌC - EMERALD GREEN) -->
            <div onclick="switchTab('autocmt')" class="group cursor-pointer rounded-3xl p-6 border transition-all duration-300 relative overflow-hidden bg-gradient-to-br from-[#10b981]/20 via-[#10b981]/10 to-transparent border-[#10b981]/30 hover:border-[#10b981] hover:shadow-[0_10px_35px_rgba(16,185,129,0.25)] hover:-translate-y-1">
              <div class="flex items-center justify-between mb-4">
                <div class="w-14 h-14 rounded-2xl bg-[#10b981] text-white flex items-center justify-center text-2xl shadow-lg shadow-[#10b981]/40 group-hover:scale-110 transition-transform duration-300">
                  🤖
                </div>
                <span class="text-xs font-mono font-bold px-3 py-1 rounded-full bg-[#10b981]/25 text-[#34d399] border border-[#10b981]/40">
                  4 Căn Đang Săn
                </span>
              </div>
              <h3 class="text-lg font-bold text-white mb-1.5 group-hover:text-[#34d399] transition-colors">
                2. Săn Khách & Quỹ Căn
              </h3>
              <p class="text-xs text-[#86868b] leading-relaxed mb-5">
                Nạp bảng hàng bằng cách dán chữ hoặc tải ảnh (OCR 0 đồng), tự động khớp căn gần nhất theo bản đồ Google Maps Ecopark.
              </p>
              <div class="w-full py-2.5 px-4 rounded-full bg-[#10b981] text-white text-xs font-semibold flex items-center justify-center gap-2 group-hover:bg-[#059669] transition shadow-md">
                <span>Mở Kho Căn & Radar</span>
                <span class="text-sm">➔</span>
              </div>
            </div>

            <!-- NÚT 3: TIN NHẮN KHÁCH HÀNG (MÀU CAM - VIBRANT AMBER) -->
            <div onclick="switchTab('inbox')" class="group cursor-pointer rounded-3xl p-6 border transition-all duration-300 relative overflow-hidden bg-gradient-to-br from-[#f59e0b]/20 via-[#f59e0b]/10 to-transparent border-[#f59e0b]/30 hover:border-[#f59e0b] hover:shadow-[0_10px_35px_rgba(245,158,11,0.25)] hover:-translate-y-1">
              <div class="flex items-center justify-between mb-4">
                <div class="w-14 h-14 rounded-2xl bg-[#f59e0b] text-white flex items-center justify-center text-2xl shadow-lg shadow-[#f59e0b]/40 group-hover:scale-110 transition-transform duration-300">
                  💬
                </div>
                <span class="text-xs font-mono font-bold px-3 py-1 rounded-full bg-[#f59e0b]/25 text-[#fbbf24] border border-[#f59e0b]/40">
                  <span id="hub-badge-customers">22</span> Khách Hàng
                </span>
              </div>
              <h3 class="text-lg font-bold text-white mb-1.5 group-hover:text-[#fbbf24] transition-colors">
                3. Tin Nhắn Khách Hàng
              </h3>
              <p class="text-xs text-[#86868b] leading-relaxed mb-5">
                Xem toàn bộ tin nhắn khách hỏi thuê/mua nhà, gửi ảnh và trả lời 2 chiều đồng bộ tức thì với nhóm Telegram 1-1.
              </p>
              <div class="w-full py-2.5 px-4 rounded-full bg-[#f59e0b] text-white text-xs font-semibold flex items-center justify-center gap-2 group-hover:bg-[#d97706] transition shadow-md">
                <span>Vào Xem Tin Nhắn</span>
                <span class="text-sm">➔</span>
              </div>
            </div>

            <!-- NÚT 4: TƯƠNG TÁC & KẾT BẠN (MÀU TÍM - VIOLET DREAM) -->
            <div onclick="switchTab('growth')" class="group cursor-pointer rounded-3xl p-6 border transition-all duration-300 relative overflow-hidden bg-gradient-to-br from-[#8b5cf6]/20 via-[#8b5cf6]/10 to-transparent border-[#8b5cf6]/30 hover:border-[#8b5cf6] hover:shadow-[0_10px_35px_rgba(139,92,246,0.25)] hover:-translate-y-1">
              <div class="flex items-center justify-between mb-4">
                <div class="w-14 h-14 rounded-2xl bg-[#8b5cf6] text-white flex items-center justify-center text-2xl shadow-lg shadow-[#8b5cf6]/40 group-hover:scale-110 transition-transform duration-300">
                  👥
                </div>
                <span class="text-xs font-mono font-bold px-3 py-1 rounded-full bg-[#8b5cf6]/25 text-[#a78bfa] border border-[#8b5cf6]/40">
                  Tương Tác Auto
                </span>
              </div>
              <h3 class="text-lg font-bold text-white mb-1.5 group-hover:text-[#a78bfa] transition-colors">
                4. Tương Tác & Kết Bạn
              </h3>
              <p class="text-xs text-[#86868b] leading-relaxed mb-5">
                Quét sâu thành viên mới vào các group cư dân Ecopark, tự động kết bạn đúng tệp và tương tác thả tim nuôi nick.
              </p>
              <div class="w-full py-2.5 px-4 rounded-full bg-[#8b5cf6] text-white text-xs font-semibold flex items-center justify-center gap-2 group-hover:bg-[#7c3aed] transition shadow-md">
                <span>Cài Đặt Tương Tác</span>
                <span class="text-sm">➔</span>
              </div>
            </div>

            <!-- NÚT 5: TÀI KHOẢN & PROXY (MÀU XANH CYAN - COOL CYAN) -->
            <div onclick="switchTab('accounts')" class="group cursor-pointer rounded-3xl p-6 border transition-all duration-300 relative overflow-hidden bg-gradient-to-br from-[#06b6d4]/20 via-[#06b6d4]/10 to-transparent border-[#06b6d4]/30 hover:border-[#06b6d4] hover:shadow-[0_10px_35px_rgba(6,182,212,0.25)] hover:-translate-y-1">
              <div class="flex items-center justify-between mb-4">
                <div class="w-14 h-14 rounded-2xl bg-[#06b6d4] text-white flex items-center justify-center text-2xl shadow-lg shadow-[#06b6d4]/40 group-hover:scale-110 transition-transform duration-300">
                  👤
                </div>
                <span class="text-xs font-mono font-bold px-3 py-1 rounded-full bg-[#06b6d4]/25 text-[#22d3ee] border border-[#06b6d4]/40">
                  Bảo Vệ IP
                </span>
              </div>
              <h3 class="text-lg font-bold text-white mb-1.5 group-hover:text-[#22d3ee] transition-colors">
                5. Tài Khoản & Proxy
              </h3>
              <p class="text-xs text-[#86868b] leading-relaxed mb-5">
                Quản lý các tài khoản Facebook, gán IP Proxy riêng biệt từng nick để bảo vệ không rò rỉ IP và tránh checkpoint.
              </p>
              <div class="w-full py-2.5 px-4 rounded-full bg-[#06b6d4] text-white text-xs font-semibold flex items-center justify-center gap-2 group-hover:bg-[#0891b2] transition shadow-md">
                <span>Quản Lý Nick & Proxy</span>
                <span class="text-sm">➔</span>
              </div>
            </div>

            <!-- NÚT 6: NHẬT KÝ HOẠT ĐỘNG (MÀU HỒNG ĐỎ / ROSE SUNSET) -->
            <div onclick="switchTab('logs')" class="group cursor-pointer rounded-3xl p-6 border transition-all duration-300 relative overflow-hidden bg-gradient-to-br from-[#f43f5e]/20 via-[#f43f5e]/10 to-transparent border-[#f43f5e]/30 hover:border-[#f43f5e] hover:shadow-[0_10px_35px_rgba(244,63,94,0.25)] hover:-translate-y-1">
              <div class="flex items-center justify-between mb-4">
                <div class="w-14 h-14 rounded-2xl bg-[#f43f5e] text-white flex items-center justify-center text-2xl shadow-lg shadow-[#f43f5e]/40 group-hover:scale-110 transition-transform duration-300">
                  📋
                </div>
                <span class="text-xs font-mono font-bold px-3 py-1 rounded-full bg-[#f43f5e]/25 text-[#fb7185] border border-[#f43f5e]/40">
                  Realtime Log
                </span>
              </div>
              <h3 class="text-lg font-bold text-white mb-1.5 group-hover:text-[#fb7185] transition-colors">
                6. Nhật Ký Hoạt Động
              </h3>
              <p class="text-xs text-[#86868b] leading-relaxed mb-5">
                Theo dõi luồng công việc của hệ thống thời gian thực, xem log chi tiết các bài đã đăng và cmt đã gửi thành công.
              </p>
              <div class="w-full py-2.5 px-4 rounded-full bg-[#f43f5e] text-white text-xs font-semibold flex items-center justify-center gap-2 group-hover:bg-[#e11d48] transition shadow-md">
                <span>Xem Nhật Ký Chạy</span>
                <span class="text-sm">➔</span>
              </div>
            </div>

          </div>

          <!-- ======================================================== -->
          <!-- KHỐI SỐ LIỆU THỐNG KÊ (ẨN MẶC ĐỊNH - BẤM NÚT MỚI HIỆN)  -->
          <!-- ======================================================== -->
          <div id="stats-collapsible-section" class="hidden space-y-6 pt-4 border-t border-white/10 transition-all duration-300">
            
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-lg">📊</span>
                <h3 class="text-sm font-bold uppercase tracking-wider text-white">Bảng Thống Kê Số Liệu & Tình Trạng Hệ Thống</h3>
              </div>
              <button onclick="toggleStatsSection()" class="text-xs text-[#86868b] hover:text-white transition flex items-center gap-1">
                <span>Thu gọn ▲</span>
              </button>
            </div>

            <!-- 4 Metric KPI Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              <div class="apple-card rounded-2xl p-5 border border-white/10">
                <div class="flex items-center justify-between text-xs text-[#86868b] mb-1">
                  <span class="font-medium text-[11px] uppercase tracking-wider">Tài Khoản Hoạt Động</span>
                  <span class="text-base">🛡️</span>
                </div>
                <div class="flex items-baseline gap-2">
                  <span id="kpi-live-accounts" class="text-3xl font-bold tracking-tight text-white">1</span>
                  <span class="text-xs text-[#86868b]">/ 2 Nick sẵn sàng</span>
                </div>
                <div class="text-[11px] text-[#30d158] mt-2 font-mono flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-warm-pulse"></span>
                  <span id="kpi-proxy-desc">Eco Trang · Đang kết nối</span>
                </div>
              </div>

              <div class="apple-card rounded-2xl p-5 border border-white/10">
                <div class="flex items-center justify-between text-xs text-[#86868b] mb-1">
                  <span class="font-medium text-[11px] uppercase tracking-wider">Tin Nhắn Khách Hàng</span>
                  <span class="text-base">💬</span>
                </div>
                <div class="flex items-baseline gap-2">
                  <span id="kpi-customers-count" class="text-3xl font-bold tracking-tight text-white">22</span>
                  <span class="text-xs text-[#86868b]">Hội thoại 1-1</span>
                </div>
                <div class="text-[11px] text-[#2997ff] mt-2 font-mono">
                  Đồng bộ tức thì sang Telegram
                </div>
              </div>

              <div class="apple-card rounded-2xl p-5 border border-white/10">
                <div class="flex items-center justify-between text-xs text-[#86868b] mb-1">
                  <span class="font-medium text-[11px] uppercase tracking-wider">Đăng Bài Group</span>
                  <span class="text-base">📝</span>
                </div>
                <div class="flex items-baseline gap-2">
                  <span id="kpi-posts-count" class="text-3xl font-bold tracking-tight text-white">0</span>
                  <span class="text-xs text-[#86868b]">Bài trong ngày</span>
                </div>
                <div class="text-[11px] text-[#ff9f0a] mt-2 font-mono">
                  Tự động dãn cách · Chống trùng
                </div>
              </div>

              <div class="apple-card rounded-2xl p-5 border border-white/10">
                <div class="flex items-center justify-between text-xs text-[#86868b] mb-1">
                  <span class="font-medium text-[11px] uppercase tracking-wider">Săn Khách & Quỹ Căn</span>
                  <span class="text-base">🤖</span>
                </div>
                <div class="flex items-baseline gap-2">
                  <span id="kpi-autocmt-status" class="text-3xl font-bold tracking-tight text-white">OFF</span>
                  <span id="kpi-groups-count" class="text-xs text-[#86868b]">0 Nhóm theo dõi</span>
                </div>
                <div class="text-[11px] text-[#bf5af2] mt-2 font-mono">
                  Quét bài & Khớp căn gần nhất
                </div>
              </div>

            </div>

            <!-- Specs & Live Activity Stream -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              <div class="lg:col-span-7 apple-card rounded-3xl p-6 space-y-4 border border-white/10">
                <div class="flex items-center justify-between border-b border-white/10 pb-3">
                  <h4 class="text-xs font-semibold uppercase tracking-wider text-white">Kiến Trúc & Trạng Thái</h4>
                  <span class="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#30d158]/15 text-[#30d158] border border-[#30d158]/30">ACTIVE</span>
                </div>
                <div class="grid grid-cols-2 gap-3 text-xs">
                  <div class="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                    <span class="text-[#86868b] text-[11px]">Cơ chế Đồng Bộ</span>
                    <p class="font-semibold text-white">Realtime MutationObserver</p>
                    <p class="text-[10px] text-[#30d158]">Độ trễ tức thì ~0ms</p>
                  </div>
                  <div class="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                    <span class="text-[#86868b] text-[11px]">Bảo Vệ Tài Khoản</span>
                    <p class="font-semibold text-white">Cách Ly Phiên & Proxy</p>
                    <p class="text-[10px] text-[#2997ff]">Không rò rỉ IP máy</p>
                  </div>
                </div>
              </div>

              <div class="lg:col-span-5 apple-card rounded-3xl p-6 space-y-3 border border-white/10">
                <div class="flex items-center justify-between border-b border-white/10 pb-3">
                  <h4 class="text-xs font-semibold uppercase tracking-wider text-white">Nhật Ký Nhanh</h4>
                  <span class="text-[10px] font-mono text-[#86868b]">Live</span>
                </div>
                <div id="live-activity-stream" class="space-y-2 max-h-48 overflow-y-auto pr-1 text-[11px] font-mono">
                  <div class="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-[#f5f5f7]">
                    <span class="text-[#86868b]">[Khởi động]</span> Hệ thống sẵn sàng đồng bộ 2 chiều.
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>

      <!-- ======================================================== -->
      <!-- TAB 2: HỘI THOẠI KHÁCH HÀNG`;

html = html.replace(oldOverviewContentPattern, newOverviewContent);

// 2. Thêm hàm toggleStatsSection vào cuối phần JavaScript
const jsToggleCode = `
    // Bật tắt khối thống kê số liệu
    function toggleStatsSection() {
      const sec = document.getElementById('stats-collapsible-section');
      const txt = document.getElementById('toggle-stats-text');
      if (!sec) return;
      if (sec.classList.contains('hidden')) {
        sec.classList.remove('hidden');
        if (txt) txt.textContent = 'Ẩn Số Liệu Thống Kê ▲';
      } else {
        sec.classList.add('hidden');
        if (txt) txt.textContent = 'Xem Số Liệu Thống Kê ▾';
      }
    }
`;

html = html.replace('function switchTab(tabId) {', jsToggleCode + '\n    function switchTab(tabId) {');

// 3. Thêm nút "⬅ Quay Về Bảng Chức Năng Chính" ở đầu các Tab chức năng (posts, autocmt, inbox, growth, accounts, logs)
// Thêm nút back vào tab-posts
html = html.replace(
  '<div id="tab-posts" class="space-y-6 tab-content hidden">',
  `<div id="tab-posts" class="space-y-6 tab-content hidden">
        <!-- Nút quay về trang chủ -->
        <div class="flex items-center justify-between">
          <button onclick="switchTab('overview')" class="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition flex items-center gap-2">
            <span>⬅</span> Quay Về Bảng Chức Năng Chính
          </button>
        </div>`
);

// Thêm nút back vào tab-autocmt
html = html.replace(
  '<div id="tab-autocmt" class="space-y-6 tab-content hidden">',
  `<div id="tab-autocmt" class="space-y-6 tab-content hidden">
        <!-- Nút quay về trang chủ -->
        <div class="flex items-center justify-between">
          <button onclick="switchTab('overview')" class="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition flex items-center gap-2">
            <span>⬅</span> Quay Về Bảng Chức Năng Chính
          </button>
        </div>`
);

// Thêm nút back vào tab-inbox
html = html.replace(
  '<div id="tab-inbox" class="space-y-5 tab-content hidden">',
  `<div id="tab-inbox" class="space-y-5 tab-content hidden">
        <!-- Nút quay về trang chủ -->
        <div class="flex items-center justify-between">
          <button onclick="switchTab('overview')" class="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition flex items-center gap-2">
            <span>⬅</span> Quay Về Bảng Chức Năng Chính
          </button>
        </div>`
);

fs.writeFileSync(filePath, html, 'utf8');
console.log('Action Hub successfully created! File size:', html.length);
