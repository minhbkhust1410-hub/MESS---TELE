const fs = require('fs');
const vm = require('vm');

let html = fs.readFileSync('D:/KudoX_Mess_Tele/public/index.html', 'utf8');
const aiCode = fs.readFileSync('D:/KudoX_Mess_Tele/ai_handlers.js', 'utf8');

// 1. Update HTML #ai-settings-expandable
const oldSettingsHtmlStart = '<div id="ai-settings-expandable"';
const oldSettingsHtmlEnd = '<!-- CÔNG CỤ TEST THỬ NGHIỆM AI GHÉP CĂN THEO GOOGLE MAPS VÀ TỌA ĐỘ -->';

const pStart = html.indexOf(oldSettingsHtmlStart);
const pEnd = html.indexOf(oldSettingsHtmlEnd, pStart);

if (pStart === -1 || pEnd === -1) {
  throw new Error('Could not find #ai-settings-expandable boundaries in HTML');
}

const newSettingsHtml = `<div id="ai-settings-expandable" class="p-3.5 sm:p-4 rounded-xl bg-white/90 border border-amber-500/25 space-y-4 text-xs shadow-xs">
              
              <!-- Dòng 1: Nhập Key & Provider -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label class="block text-[10px] uppercase font-bold text-stone-700 mb-1">Provider Ưu Tiên Ban Đầu</label>
                  <select id="ai-provider-select" onchange="handleAiProviderChange()" class="w-full text-xs font-semibold py-1.5 px-2.5 rounded-xl border border-stone-300 bg-white text-stone-900 focus:outline-none focus:border-amber-500">
                    <option value="gemini">Google Gemini 1.5/2.0 Flash (Free 1,500 req/ngày)</option>
                    <option value="groq">Groq Cloud Llama 3.3 70B (Free Siêu Tốc 500 tps)</option>
                    <option value="openrouter">OpenRouter Free Models (Miễn Phí)</option>
                    <option value="offline">Lõi NLP & GPS Offline (Free 100% Không Cần Key)</option>
                  </select>
                </div>
                <div class="md:col-span-2 space-y-1">
                  <div class="flex items-center justify-between">
                    <label class="text-[10px] uppercase font-bold text-stone-700">Dán 1 Hoặc Nhiều API Key (Tự Động Nhận Diện & Đổi Key Khi Hết Quota)</label>
                    <a id="ai-key-guide-link" href="https://aistudio.google.com/app/apikey" target="_blank" class="text-[10px] text-amber-700 hover:underline font-bold flex items-center gap-0.5">
                      <span>Lấy Key Free 30s ↗</span>
                    </a>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <input type="password" id="ai-api-key-input" placeholder="Dán 1 key hoặc nhiều key cách nhau bằng dấu phẩy/xuống dòng (AIzaSy... hoặc gsk_...)" 
                           class="flex-1 font-mono text-xs py-1.5 px-3 rounded-xl border border-stone-300 bg-white text-stone-900 focus:outline-none focus:border-amber-500" />
                    <button onclick="toggleShowAiKey()" class="px-2 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs" title="Ẩn/hiện key">👁️</button>
                    <button onclick="saveAndTestAiKey()" id="btn-test-ai-key" class="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition shadow-sm flex items-center gap-1 flex-shrink-0">
                      <span>⚡</span> <span>Lưu & Test</span>
                    </button>
                    <button onclick="addMultipleKeysToPool()" id="btn-add-ai-keys" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm flex items-center gap-1 flex-shrink-0">
                      <span>➕</span> <span>Nạp Vào Bể Key</span>
                    </button>
                  </div>
                  <p class="text-[10px] text-stone-500 italic">💡 Mẹo chống nghẽn: Bạn có thể tạo 2-3 Google Key hoặc kết hợp cả Gemini + Groq dán vào đây. Hệ thống tự động xoay tua chia tải và nhảy key khi chạm 15 RPM!</p>
                </div>
              </div>

              <!-- Dòng 2: Cấu Hình Chống Nghẽn 24/7 (Failover Switches) -->
              <div class="p-3 rounded-xl bg-amber-50/70 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="space-y-1">
                  <div class="text-[11px] font-bold text-amber-950 flex items-center gap-1.5">
                    <span>🛡️</span> <span>Cơ Chế Tự Động Thay Đổi API Khi Hết Dung Lượng (Zero-Downtime Failover):</span>
                  </div>
                  <p class="text-[10px] text-stone-600">Khi 1 key đạt giới hạn 15 RPM hoặc hết hạn mức trong ngày, hệ thống tự động đổi sang key tiếp theo trong 0.1 giây mà không làm gián đoạn bài đăng/bình luận.</p>
                </div>
                <div class="flex items-center gap-4 flex-shrink-0">
                  <label class="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" id="ai-autofailover-toggle" onchange="saveAiFailoverSettings()" checked class="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-stone-300" />
                    <span class="text-[11px] font-bold text-stone-800">Tự đổi Key khi 429 Quota</span>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" id="ai-autocascade-toggle" onchange="saveAiFailoverSettings()" checked class="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-stone-300" />
                    <span class="text-[11px] font-bold text-stone-800">Chuyển sang Groq / Offline</span>
                  </label>
                </div>
              </div>

              <!-- Dòng 3: Bể Khóa Dự Phòng (Key Failover Pool List) -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-stone-800 uppercase tracking-tight flex items-center gap-1">
                      <span>🗝️</span> <span>Bể Khóa Dự Phòng (AI Key Pool):</span>
                    </span>
                    <span id="ai-pool-count-badge" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-800 border border-amber-500/30 font-mono">
                      0/0 Keys
                    </span>
                  </div>
                  <button onclick="testEntireKeyPool()" id="btn-test-all-keys" class="text-[11px] font-bold text-amber-800 hover:text-amber-950 hover:underline flex items-center gap-1">
                    <span>⚡</span> <span>Kiểm Tra Toàn Bộ Bể Key</span>
                  </button>
                </div>

                <div class="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                  <table class="w-full text-left border-collapse">
                    <thead>
                      <tr class="bg-stone-50 border-b border-stone-200 text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                        <th class="py-2 px-3">#</th>
                        <th class="py-2 px-3">Nhà Cung Cấp</th>
                        <th class="py-2 px-3">Mã API Key</th>
                        <th class="py-2 px-3">Trạng Thái Chống Nghẽn</th>
                        <th class="py-2 px-3">Hiệu Suất Thực Tế</th>
                        <th class="py-2 px-3 text-right">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody id="ai-key-pool-tbody" class="divide-y divide-stone-100 text-xs">
                      <!-- Injected via JS -->
                    </tbody>
                  </table>
                  <div id="ai-key-pool-empty" class="p-4 text-center text-xs text-stone-500 hidden">
                    <span>ℹ️ Chưa có key dự phòng trong bể. Dán thêm key ở trên và bấm "Nạp Vào Bể Key" để kích hoạt chế độ chống nghẽn!</span>
                  </div>
                </div>
              </div>

              <div id="ai-test-result-box" class="hidden p-3 rounded-xl text-xs font-mono"></div>
            </div>

            `;

html = html.slice(0, pStart) + newSettingsHtml + html.slice(pEnd);

// 2. Update JavaScript block in index.html
const jsStartAnchor = '// FREE AI ENGINE INTEGRATION & CLIENT HANDLERS';
const jsEndAnchor = '// LOGIC SOẠN & ĐĂNG BÀI TỪ WEB (TOPIC 1 PARITY)';

const jsP1 = html.indexOf(jsStartAnchor);
const jsP2 = html.indexOf(jsEndAnchor, jsP1);

if (jsP1 === -1 || jsP2 === -1) {
  throw new Error('Could not find JS AI block boundaries in HTML');
}

// Find previous separator before jsP1
const sepP1 = html.lastIndexOf('// ========================================================', jsP1);
const cutStart = sepP1 !== -1 ? sepP1 : jsP1;

// Find separator before jsP2
const sepP2 = html.lastIndexOf('// ========================================================', jsP2);
const cutEnd = sepP2 !== -1 ? sepP2 : jsP2;

html = html.slice(0, cutStart) + aiCode + '\n\n    ' + html.slice(cutEnd);

// 3. Syntax Verification with vm.Script
const scriptTagStart = html.indexOf('<script>');
const scriptTagEnd = html.indexOf('</script>', scriptTagStart);
const scriptContent = html.substring(scriptTagStart + 8, scriptTagEnd);

try {
  new vm.Script(scriptContent);
  console.log('✅ JavaScript syntax check PASSED! 0 errors.');
  fs.writeFileSync('D:/KudoX_Mess_Tele/public/index.html', html, 'utf8');
  console.log('✅ Successfully updated public/index.html with Auto Failover & Key Pool UI!');
} catch (e) {
  console.error('❌ JavaScript syntax error:', e.message);
  console.error(e.stack);
  process.exit(1);
}
