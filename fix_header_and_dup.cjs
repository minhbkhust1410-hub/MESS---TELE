const fs = require('fs');

const filePath = 'D:/KudoX_Mess_Tele/public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// 1. Sửa Header để không bao giờ bị đè chữ
const oldHeaderPart = `<div class="flex items-center gap-3">
        <h2 id="section-title" class="text-sm font-semibold text-[#f0f6fc] flex items-center gap-2">
          <span>📊</span>
          <span class="tracking-tight">Tổng Quan Hệ Thống</span>
        </h2>
        <span class="h-4 w-[1px] bg-[#30363d] hidden sm:block"></span>
        <span class="text-xs text-[#8b949e] hidden sm:inline" id="section-desc">Theo dõi tài khoản, tin nhắn và trạng thái tự động hóa</span>
      </div>

      <!-- Action Buttons - GitHub Style -->
      <div class="flex items-center gap-2">`;

const newHeaderPart = `<div class="flex items-center gap-3 min-w-0 flex-1 pr-4">
        <h2 id="section-title" class="text-sm font-semibold text-[#f0f6fc] flex items-center gap-2 flex-shrink-0">
          <span>📊</span>
          <span class="tracking-tight">Tổng Quan Hệ Thống</span>
        </h2>
        <span class="h-4 w-[1px] bg-[#30363d] hidden sm:block flex-shrink-0"></span>
        <span class="text-xs text-[#8b949e] hidden sm:inline truncate max-w-xl" id="section-desc">Theo dõi tài khoản, tin nhắn và trạng thái tự động hóa</span>
      </div>

      <!-- Action Buttons - GitHub Style -->
      <div class="flex items-center gap-2 flex-shrink-0">`;

html = html.replace(oldHeaderPart, newHeaderPart);

// 2. Xóa đoạn dư thừa từ dòng 511-520
const duplicatePattern = `              <div id="live-activity-stream" class="space-y-2.5 max-h-72 overflow-y-auto pr-1 text-[11px] font-mono custom-scroll">
                <div class="p-2.5 rounded-xl bg-[#0d1117]/60 border border-[#30363d] text-[#D6D3D1]">
                  <span class="text-[#8C847E]">[Khởi động]</span> Hệ thống FalconX Autonomous Bridge sẵn sàng đồng bộ 2 chiều.
                </div>
              </div>
            </div>
            <button onclick="switchTab('logs')" class="w-full mt-4 py-2.5 px-4 rounded-xl bg-[#24201C] hover:bg-[#2C2723] text-[#f0f6fc] border border-[#30363d] text-xs font-semibold transition text-center">
              Mở toàn bộ Console Terminal ↗
            </button>
          </div>`;

html = html.replace(duplicatePattern, '');

fs.writeFileSync(filePath, html, 'utf8');
console.log('Fixed header and removed duplicate live stream successfully.');
