const fs = require('fs');

const filePath = 'D:/KudoX_Mess_Tele/public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// 1. Cập nhật 4 KPI cards sang phong cách GitHub Dark Clean
const oldKpiPattern = /<!-- 4 Metric KPI Cards[\s\S]*?<!-- 2 Columns: System Specs & Live Stream -->/;
const newKpis = `<!-- 4 Metric KPI Cards - GitHub Bento Style -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          
          <div class="claude-card rounded-xl p-4 border border-[#30363d] bg-[#161b22]">
            <div class="flex items-center justify-between text-xs text-[#8b949e] mb-1">
              <span class="font-medium text-[11px] uppercase tracking-wider">Tài Khoản Hoạt Động</span>
              <span class="text-sm">🛡️</span>
            </div>
            <div class="flex items-baseline gap-2">
              <span id="kpi-live-accounts" class="text-2xl font-bold text-[#f0f6fc]">1</span>
              <span class="text-xs text-[#8b949e]">/ 2 Nick sẵn sàng</span>
            </div>
            <div class="text-[11px] text-[#3fb950] mt-2 font-mono flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-warm-pulse"></span>
              <span id="kpi-proxy-desc">Eco Trang · Đang kết nối</span>
            </div>
          </div>

          <div class="claude-card rounded-xl p-4 border border-[#30363d] bg-[#161b22]">
            <div class="flex items-center justify-between text-xs text-[#8b949e] mb-1">
              <span class="font-medium text-[11px] uppercase tracking-wider">Tin Nhắn Khách Hàng</span>
              <span class="text-sm">💬</span>
            </div>
            <div class="flex items-baseline gap-2">
              <span id="kpi-customers-count" class="text-2xl font-bold text-[#f0f6fc]">22</span>
              <span class="text-xs text-[#8b949e]">Hội thoại 1-1</span>
            </div>
            <div class="text-[11px] text-[#58a6ff] mt-2 font-mono">
              Đồng bộ tức thì sang Telegram
            </div>
          </div>

          <div class="claude-card rounded-xl p-4 border border-[#30363d] bg-[#161b22]">
            <div class="flex items-center justify-between text-xs text-[#8b949e] mb-1">
              <span class="font-medium text-[11px] uppercase tracking-wider">Đăng Bài Group</span>
              <span class="text-sm">📝</span>
            </div>
            <div class="flex items-baseline gap-2">
              <span id="kpi-posts-count" class="text-2xl font-bold text-[#f0f6fc]">0</span>
              <span class="text-xs text-[#8b949e]">Bài trong ngày</span>
            </div>
            <div class="text-[11px] text-[#d29922] mt-2 font-mono">
              Tự động dãn cách · Chống trùng
            </div>
          </div>

          <div class="claude-card rounded-xl p-4 border border-[#30363d] bg-[#161b22]">
            <div class="flex items-center justify-between text-xs text-[#8b949e] mb-1">
              <span class="font-medium text-[11px] uppercase tracking-wider">Săn Khách & Quỹ Căn</span>
              <span class="text-sm">🤖</span>
            </div>
            <div class="flex items-baseline gap-2">
              <span id="kpi-autocmt-status" class="text-2xl font-bold text-[#f0f6fc]">OFF</span>
              <span id="kpi-groups-count" class="text-xs text-[#8b949e]">0 Nhóm theo dõi</span>
            </div>
            <div class="text-[11px] text-[#a371f7] mt-2 font-mono">
              Quét bài & Khớp căn gần nhất
            </div>
          </div>

        </div>

        <!-- 2 Columns: System Specs & Live Stream -->`;

html = html.replace(oldKpiPattern, newKpis);

// 2. Cập nhật System Specs & Live Stream
const oldSpecsPattern = /<!-- System Specs \(7 Cols\)[\s\S]*?<!-- Live Activity Feed Stream \(5 Cols\)[\s\S]*?<\/div>[\s\S]*?<\/div>/;
const newSpecs = `<!-- System Specs (7 Cols) -->
          <div class="lg:col-span-7 claude-card rounded-xl p-5 space-y-4 border border-[#30363d] bg-[#161b22]">
            <div class="flex items-center justify-between border-b border-[#30363d] pb-3">
              <div class="flex items-center gap-2">
                <span class="text-sm">⚙️</span>
                <h3 class="text-xs font-semibold uppercase tracking-wider text-[#f0f6fc]">Cơ Chế Vận Hành Tự Động Hóa</h3>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30 font-medium">
                SẴN SÀNG 24/7
              </span>
            </div>

            <div class="grid grid-cols-2 gap-3 text-xs">
              <div class="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] space-y-1">
                <span class="text-[#8b949e] text-[11px]">Đồng Bộ Tin Nhắn</span>
                <p class="font-semibold text-[#f0f6fc]">Tức Thì 2 Chiều</p>
                <p class="text-[10px] text-[#3fb950]">Messenger ↔ Telegram ngay lập tức</p>
              </div>

              <div class="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] space-y-1">
                <span class="text-[#8b949e] text-[11px]">Bảo Vệ Tài Khoản</span>
                <p class="font-semibold text-[#f0f6fc]">Tách Biệt Session & Proxy</p>
                <p class="text-[10px] text-[#58a6ff]">Tránh checkpoint, bảo vệ IP máy</p>
              </div>

              <div class="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] space-y-1">
                <span class="text-[#8b949e] text-[11px]">Đăng Bài Tự Động</span>
                <p class="font-semibold text-[#f0f6fc]">Dãn Cách & Chống Lặp</p>
                <p class="text-[10px] text-[#d29922]">Kiểm tra bài trước khi gửi lên group</p>
              </div>

              <div class="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] space-y-1">
                <span class="text-[#8b949e] text-[11px]">Săn Khách & Quỹ Căn</span>
                <p class="font-semibold text-[#f0f6fc]">Khớp Căn Theo Vị Trí</p>
                <p class="text-[10px] text-[#a371f7]">Tự nhận diện ảnh & tính khoảng cách</p>
              </div>
            </div>

            <!-- 5 Phân hệ tính năng -->
            <div class="pt-1">
              <span class="text-[11px] font-medium text-[#8b949e] uppercase tracking-wider block mb-2">5 Tính Năng Tự Động Hóa Chính</span>
              <div class="grid grid-cols-5 gap-2 text-center text-[10px] font-medium">
                <div class="p-2 rounded-lg bg-[#0d1117] border border-[#30363d]">
                  <span class="block text-sm mb-0.5">📝</span>
                  <span class="text-[#f0f6fc] block">Đăng Bài</span>
                  <span class="text-[#8b949e]">Nhóm FB</span>
                </div>
                <div class="p-2 rounded-lg bg-[#0d1117] border border-[#30363d]">
                  <span class="block text-sm mb-0.5">🤖</span>
                  <span class="text-[#f0f6fc] block">Săn Khách</span>
                  <span class="text-[#8b949e]">Bình luận</span>
                </div>
                <div class="p-2 rounded-lg bg-[#0d1117] border border-[#30363d]">
                  <span class="block text-sm mb-0.5">👥</span>
                  <span class="text-[#f0f6fc] block">Quét Mem</span>
                  <span class="text-[#8b949e]">Tệp khách</span>
                </div>
                <div class="p-2 rounded-lg bg-[#0d1117] border border-[#30363d]">
                  <span class="block text-sm mb-0.5">🤝</span>
                  <span class="text-[#f0f6fc] block">Kết Bạn</span>
                  <span class="text-[#8b949e]">Đúng tệp</span>
                </div>
                <div class="p-2 rounded-lg bg-[#0d1117] border border-[#30363d]">
                  <span class="block text-sm mb-0.5">❤️</span>
                  <span class="text-[#f0f6fc] block">Tương Tác</span>
                  <span class="text-[#8b949e]">Nuôi nick</span>
                </div>
              </div>
            </div>

          </div>

          <!-- Live Activity Feed Stream (5 Cols) -->
          <div class="lg:col-span-5 claude-card rounded-xl p-5 space-y-3 flex flex-col justify-between border border-[#30363d] bg-[#161b22]">
            <div>
              <div class="flex items-center justify-between border-b border-[#30363d] pb-3 mb-3">
                <div class="flex items-center gap-2">
                  <span class="text-sm">📡</span>
                  <h3 class="text-xs font-semibold uppercase tracking-wider text-[#f0f6fc]">Nhật Ký Sự Kiện Gần Nhất</h3>
                </div>
                <span class="text-[10px] font-mono text-[#8b949e]">Live</span>
              </div>
              <div id="live-activity-stream" class="space-y-2 max-h-72 overflow-y-auto pr-1 text-[11px] font-mono">
                <div class="p-2.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#c9d1d9]">
                  <span class="text-[#8b949e]">[Khởi động]</span> Hệ thống sẵn sàng đồng bộ tin nhắn 2 chiều.
                </div>
              </div>
            </div>
            <button onclick="switchTab('logs')" class="w-full mt-2 py-2 px-3 rounded-md bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] hover:text-[#f0f6fc] border border-[#30363d] text-xs font-medium transition text-center">
              Mở Toàn Bộ Nhật Ký Hoạt Động ↗
            </button>
          </div>`;

html = html.replace(oldSpecsPattern, newSpecs);

// 3. Thay thế các màu nền cũ còn sót trong các thẻ card:
// Thay bg-[#171412] thành bg-[#0d1117]
html = html.replace(/bg-\[#171412\]/g, 'bg-[#0d1117]');
// Thay bg-[#1E1A17] thành bg-[#161b22]
html = html.replace(/bg-\[#1E1A17\]/g, 'bg-[#161b22]');
// Thay bg-[#1F1B18] thành bg-[#161b22]
html = html.replace(/bg-\[#1F1B18\]/g, 'bg-[#161b22]');
// Thay border-[#38332E] và border-[#3E3832] và border-[#2C2723] thành border-[#30363d]
html = html.replace(/border-\[#(?:38332E|3E3832|2C2723|2E2925|44403C)\]/g, 'border-[#30363d]');
// Thay text-[#FAF7F2] và text-[#F5F2EB] thành text-[#f0f6fc]
html = html.replace(/text-\[#(?:FAF7F2|F5F2EB)\]/g, 'text-[#f0f6fc]');
// Thay text-[#A8A29E] thành text-[#8b949e]
html = html.replace(/text-\[#A8A29E\]/g, 'text-[#8b949e]');

fs.writeFileSync(filePath, html, 'utf8');
console.log('Detail update completed successfully. File size:', html.length);
