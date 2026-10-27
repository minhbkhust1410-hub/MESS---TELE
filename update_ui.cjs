const fs = require('fs');
const path = require('path');

const filePath = 'D:/KudoX_Mess_Tele/public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// 1. Thay thế phần <style>...</style>
const newStyle = `  <style>
    /* GitHub / Modern Clean SaaS Typography System */
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; }

    /* GitHub-Grade Dark Scrollbars */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #0d1117; }
    ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 6px; }
    ::-webkit-scrollbar-thumb:hover { background: #484f58; }

    /* Clean GitHub Bento Card System */
    .claude-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 10px;
      position: relative;
      overflow: hidden;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .claude-card:hover {
      border-color: #58a6ff;
      box-shadow: 0 4px 16px rgba(1, 4, 9, 0.4);
    }
    .claude-card::after {
      display: none !important;
    }

    /* Ẩn hoàn toàn các hiệu ứng gây rối mắt & che khuất giao diện */
    .ambient-orb, 
    #kudo-cat-mascot-root, 
    #cute-confetti-canvas {
      display: none !important;
      pointer-events: none !important;
    }

    /* Clean GitHub Buttons */
    .gh-btn-primary {
      background-color: #238636;
      color: #ffffff;
      border: 1px solid rgba(240, 246, 252, 0.1);
      border-radius: 6px;
      font-weight: 600;
      transition: background-color 0.15s ease;
    }
    .gh-btn-primary:hover {
      background-color: #2ea043;
    }
    .gh-btn-secondary {
      background-color: #21262d;
      color: #c9d1d9;
      border: 1px solid #30363d;
      border-radius: 6px;
      font-weight: 500;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    .gh-btn-secondary:hover {
      background-color: #30363d;
      border-color: #8b949e;
      color: #f0f6fc;
    }

    /* Pulse animation cho trạng thái live */
    @keyframes status-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.95); }
    }
    .animate-warm-pulse { animation: status-pulse 2s infinite ease-in-out; }

    /* GitHub Activity Matrix Heartbeat */
    @keyframes matrix-cell-pulse {
      0%, 100% { opacity: 0.6; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.15); filter: drop-shadow(0 0 3px rgba(46, 160, 67, 0.8)); }
    }
    .matrix-live-cell {
      animation: matrix-cell-pulse 3s infinite ease-in-out;
    }
  </style>`;

html = html.replace(/<style>[\s\S]*?<\/style>/, newStyle);

// 2. Cập nhật thẻ <body>
html = html.replace(
  /<body class="bg-\[#12100E\] text-\[#F5F2EB\] min-h-screen flex selection:bg-\[#D96B43\] selection:text-white bg-dot-pattern relative">/,
  '<body class="bg-[#0d1117] text-[#f0f6fc] min-h-screen flex selection:bg-[#1f6feb] selection:text-white relative">'
);

// 3. Cập nhật Sidebar <aside>
const oldSidebarPattern = /<aside class="w-68 bg-\[#171412\]\/95 border-r border-\[#2C2723\][\s\S]*?<\/aside>/;
const newSidebar = `<aside class="w-64 bg-[#161b22] border-r border-[#30363d] flex flex-col justify-between p-4 sticky top-0 h-screen z-40 hidden md:flex">
    
    <!-- Top Branding & Navigation -->
    <div class="space-y-4">
      
      <!-- Brand Logo - GitHub SaaS Style -->
      <div class="flex items-center gap-2.5 px-1 py-1">
        <div class="w-8 h-8 rounded-lg bg-[#238636] flex items-center justify-center text-white text-sm font-black shadow-sm">
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-bold tracking-tight text-[#f0f6fc] font-mono">Falcon<span class="text-[#58a6ff]">X</span></span>
            <span class="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#388bfd]/20 text-[#58a6ff] border border-[#388bfd]/30">v2.0</span>
          </div>
          <p class="text-[9px] text-[#8b949e] font-mono">BĐS & Social Automation</p>
        </div>
      </div>

      <!-- Active Profile Mini Card -->
      <div class="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] relative space-y-2">
        <div class="flex items-center gap-2.5">
          <div class="relative cursor-pointer group/avatar" onclick="openAvatarModal()" title="Nhấp để xem hoặc đổi ảnh đại diện">
            <img id="sidebar-avatar" src="https://graph.facebook.com/61577949601039/picture?type=large" class="w-10 h-10 rounded-lg object-cover border border-[#30363d] shadow flex-shrink-0 group-hover/avatar:border-[#58a6ff] transition" />
            <button onclick="syncAvatarNow(event)" title="Đồng bộ avatar từ Facebook" class="absolute -bottom-1 -right-1 w-4 h-4 bg-[#238636] hover:bg-[#2ea043] rounded-full text-[8px] flex items-center justify-center text-white border border-[#0d1117] shadow transition">
              🔄
            </button>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between">
              <button onclick="openSidebarActiveProfilePage()" class="text-xs font-semibold text-[#f0f6fc] hover:text-[#58a6ff] transition truncate flex items-center gap-1 text-left" title="Mở trang cá nhân Facebook">
                <span id="sidebar-name">Eco Trang</span>
                <span class="text-[10px] text-[#58a6ff]">↗</span>
              </button>
              <span class="w-2 h-2 rounded-full bg-[#3fb950] animate-warm-pulse flex-shrink-0" title="Trạng thái: Đang hoạt động"></span>
            </div>
            <span id="sidebar-uid" class="text-[10px] text-[#8b949e] font-mono block truncate">UID: 61577949601039</span>
            <div class="flex items-center gap-1 mt-0.5">
              <span class="text-[9px] text-[#3fb950] font-mono font-medium">● Đang kết nối FB</span>
            </div>
          </div>
        </div>

        <!-- Live Proxy Status Pill -->
        <div id="sidebar-proxy-pill" onclick="checkSidebarProxyModal()" 
             class="flex items-center justify-between text-[10px] font-mono py-1 px-2 rounded-md bg-[#161b22] border border-[#30363d] cursor-pointer hover:border-[#58a6ff] transition group/proxy"
             title="Nhấp để kiểm tra chi tiết Proxy bảo vệ">
          <span id="sidebar-proxy-status-tag" class="flex items-center gap-1.5 text-[#8b949e] truncate">
            <span>🛡️</span> <span id="sidebar-proxy-brief">Đang kiểm tra...</span>
          </span>
          <span class="text-[9px] text-[#58a6ff] font-semibold group-hover/proxy:underline flex-shrink-0">Check ↗</span>
        </div>

        <!-- Direct Button to Facebook & Check Proxy -->
        <div class="pt-2 border-t border-[#30363d] flex items-center gap-1.5">
          <button id="sidebar-fb-btn" onclick="openSidebarActiveAccountBrowser()" 
                  class="flex-1 py-1 px-2 rounded-md bg-[#1f6feb]/15 hover:bg-[#1f6feb]/25 text-[#58a6ff] border border-[#388bfd]/30 text-[10px] font-medium flex items-center justify-center gap-1 transition"
                  title="Mở Facebook bảo vệ an toàn">
            <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            <span>Vào FB ↗</span>
          </button>
          <button onclick="checkSidebarProxyModal()" 
                  class="py-1 px-2 rounded-md bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] text-[10px] font-medium flex items-center justify-center gap-1 transition"
                  title="Kiểm tra trạng thái IP">
            <span>⚡ Proxy</span>
          </button>
        </div>
      </div>

      <!-- Navigation Menu Items - Tiếng Việt dễ hiểu, chuẩn GitHub Sidebar -->
      <nav class="space-y-1">
        
        <button onclick="switchTab('overview')" id="nav-btn-overview" class="nav-item w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition bg-[#1f6feb]/15 text-[#58a6ff] border border-[#388bfd]/30 shadow-sm">
          <div class="flex items-center gap-2">
            <span class="text-sm">📊</span>
            <span>Tổng Quan</span>
          </div>
        </button>

        <button onclick="switchTab('inbox')" id="nav-btn-inbox" class="nav-item w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d]">
          <div class="flex items-center gap-2">
            <span class="text-sm">💬</span>
            <span>Tin Nhắn Khách Hàng</span>
          </div>
          <span id="sidebar-badge-customers" class="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#21262d] text-[#8b949e] font-semibold border border-[#30363d]">22</span>
        </button>

        <button onclick="switchTab('posts')" id="nav-btn-posts" class="nav-item w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d]">
          <div class="flex items-center gap-2">
            <span class="text-sm">📝</span>
            <span>Đăng Bài Lên Group</span>
          </div>
          <span id="sidebar-badge-posts" class="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#21262d] text-[#8b949e] font-semibold border border-[#30363d]">0</span>
        </button>

        <button onclick="switchTab('autocmt')" id="nav-btn-autocmt" class="nav-item w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d]">
          <div class="flex items-center gap-2">
            <span class="text-sm">🤖</span>
            <span>Săn Khách & Quỹ Căn</span>
          </div>
        </button>

        <button onclick="switchTab('growth')" id="nav-btn-growth" class="nav-item w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d]">
          <div class="flex items-center gap-2">
            <span class="text-sm">👥</span>
            <span>Tương Tác & Kết Bạn</span>
          </div>
        </button>

        <button onclick="switchTab('accounts')" id="nav-btn-accounts" class="nav-item w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d]">
          <div class="flex items-center gap-2">
            <span class="text-sm">👤</span>
            <span>Tài Khoản & Proxy</span>
          </div>
        </button>

        <button onclick="switchTab('logs')" id="nav-btn-logs" class="nav-item w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d]">
          <div class="flex items-center gap-2">
            <span class="text-sm">📋</span>
            <span>Nhật Ký Hoạt Động</span>
          </div>
        </button>

      </nav>

    </div>

    <!-- Sidebar Bottom Info Panel -->
    <div class="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] space-y-2">
      <div class="flex items-center justify-between text-xs">
        <span class="text-[#8b949e]">Telegram Bot</span>
        <span class="text-[#58a6ff] font-mono font-medium text-[11px]" id="sidebar-bot-tag">@ecotrang_mess_bot</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-[#8b949e]">Thời Gian Chạy</span>
        <span class="text-[#3fb950] font-mono font-medium text-[11px]" id="sidebar-uptime">--:--</span>
      </div>
      <a href="https://web.telegram.org" target="_blank" class="w-full mt-1 py-1.5 px-2.5 rounded-md bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] hover:text-[#f0f6fc] border border-[#30363d] text-xs font-medium flex items-center justify-center gap-1.5 transition">
        <span>✈️</span> Mở Telegram
      </a>
    </div>

  </aside>`;

html = html.replace(oldSidebarPattern, newSidebar);

// 4. Cập nhật Header Bar
const oldHeaderPattern = /<header class="h-16 border-b border-\[#2C2723\][\s\S]*?<\/header>/;
const newHeader = `<header class="h-14 border-b border-[#30363d] bg-[#161b22] px-6 flex items-center justify-between sticky top-0 z-30">
      
      <!-- Current Section Title -->
      <div class="flex items-center gap-3">
        <h2 id="section-title" class="text-sm font-semibold text-[#f0f6fc] flex items-center gap-2">
          <span>📊</span>
          <span class="tracking-tight">Tổng Quan Hệ Thống</span>
        </h2>
        <span class="h-4 w-[1px] bg-[#30363d] hidden sm:block"></span>
        <span class="text-xs text-[#8b949e] hidden sm:inline" id="section-desc">Theo dõi tài khoản, tin nhắn và trạng thái tự động hóa</span>
      </div>

      <!-- Action Buttons - GitHub Style -->
      <div class="flex items-center gap-2">

        <button id="header-fb-btn" onclick="openSidebarActiveAccountBrowser()" class="px-3 py-1.5 rounded-md bg-[#1f6feb]/15 hover:bg-[#1f6feb]/25 border border-[#388bfd]/30 text-xs font-medium text-[#58a6ff] transition flex items-center gap-1.5" title="Mở Facebook bảo vệ an toàn">
          <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          <span class="hidden sm:inline">Mở FB Proxy ↗</span>
        </button>
        
        <button onclick="viewScreenModal()" class="px-3 py-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-xs font-medium text-[#c9d1d9] transition flex items-center gap-1.5">
          <span>🖥️</span>
          <span class="hidden sm:inline">Xem Màn Hình FB</span>
        </button>

        <button onclick="openAddAccountModal()" class="px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-xs font-semibold text-white border border-[rgba(240,246,252,0.1)] transition flex items-center gap-1.5 shadow-sm">
          <span>➕</span>
          <span>Thêm Nick</span>
        </button>

        <button onclick="refreshData()" class="p-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] hover:text-[#f0f6fc] transition" title="Làm mới dữ liệu">
          <span id="refresh-icon" class="inline-block text-xs">🔄</span>
        </button>

      </div>
    </header>`;

html = html.replace(oldHeaderPattern, newHeader);

// 5. Cập nhật Tab Overview Hero Banner & Specs
const oldHeroPattern = /<!-- Hero Banner with Claude Warm Aesthetic[\s\S]*?<!-- 4 Metric KPI Cards/;
const newHero = `<!-- Clean GitHub / SaaS Status Banner -->
        <div class="claude-card rounded-xl p-5 border border-[#30363d] bg-[#161b22]">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="space-y-1">
              <div class="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30 text-xs font-mono font-medium">
                <span class="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-warm-pulse"></span>
                HỆ THỐNG ĐANG HOẠT ĐỘNG
              </div>
              <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-[#f0f6fc]">
                Trung Tâm Tự Động Hóa Facebook & Telegram
              </h1>
              <p class="text-xs text-[#8b949e] leading-relaxed">
                Tự động hóa đăng bài nhóm, quét nhu cầu khách hàng BĐS, tự động tìm căn phù hợp theo vị trí và phản hồi tin nhắn 2 chiều thời gian thực.
              </p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#21262d] border border-[#30363d] text-xs font-mono text-[#c9d1d9]">
                <span class="w-2 h-2 rounded-full bg-[#3fb950]"></span> Web: 3300
              </span>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#21262d] border border-[#30363d] text-xs font-mono text-[#c9d1d9]">
                <span class="w-2 h-2 rounded-full bg-[#3fb950]"></span> Bot: Online
              </span>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#21262d] border border-[#30363d] text-xs font-mono text-[#c9d1d9]">
                <span class="w-2 h-2 rounded-full bg-[#58a6ff]"></span> Proxy: An Toàn
              </span>
            </div>
          </div>

          <!-- Activity Matrix Pulse Bar -->
          <div class="flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-[#30363d] text-xs mt-4">
            <div class="flex items-center gap-2">
              <span class="text-[#8b949e] text-[11px] font-mono">Trạng Thái Kết Nối:</span>
              <div class="flex items-center gap-1" id="github-matrix-cells" title="Nhịp đập hệ thống thời gian thực">
                <span class="w-2.5 h-2.5 rounded-sm bg-[#3fb950] matrix-live-cell inline-block" title="Proxy Tunnel: 100% OK"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#3fb950] matrix-live-cell inline-block" style="animation-delay: 0.2s" title="Bảo Vệ Nick: Hoạt Động"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#3fb950] matrix-live-cell inline-block" style="animation-delay: 0.4s" title="Đồng Bộ Tin Nhắn: LIVE"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#3fb950] matrix-live-cell inline-block" style="animation-delay: 0.6s" title="Telegram Bot: Đã Kết Nối"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#3fb950] matrix-live-cell inline-block" style="animation-delay: 0.8s" title="Chống Đăng Lặp: Sẵn Sàng"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#58a6ff] matrix-live-cell inline-block" style="animation-delay: 1.0s" title="Quỹ Căn Offline: Đã Nạp"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#3fb950] matrix-live-cell inline-block" style="animation-delay: 1.2s" title="Chrome Session: Trực Tiếp"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#3fb950] matrix-live-cell inline-block" style="animation-delay: 1.4s" title="Cơ Sở Dữ Liệu: Sẵn Sàng"></span>
              </div>
            </div>
            <div class="flex items-center gap-2 font-mono text-[11px] text-[#8b949e]">
              <span class="text-[#3fb950]">● Không Rò Rỉ IP</span>
              <span>•</span>
              <span class="text-[#58a6ff]">● Tự Động Khớp Căn BĐS</span>
            </div>
          </div>
        </div>

        <!-- 4 Metric KPI Cards`;

html = html.replace(oldHeroPattern, newHero);

// 6. Cập nhật tabTitles và switchTab trong JS
const oldTabTitlesPattern = /const tabTitles = \{[\s\S]*?\};/;
const newTabTitles = `const tabTitles = {
      overview: { title: 'Tổng Quan Hệ Thống', desc: 'Theo dõi tài khoản, tin nhắn và trạng thái tự động hóa', icon: '📊' },
      inbox: { title: 'Tin Nhắn Khách Hàng', desc: 'Đồng bộ tin nhắn 2 chiều giữa Facebook Messenger và Telegram', icon: '💬' },
      posts: { title: 'Đăng Bài Lên Group', desc: 'Quản lý lịch đăng bài tự động và danh sách nhóm Facebook', icon: '📝' },
      autocmt: { title: 'Săn Khách & Quỹ Căn', desc: 'Tự động quét nhu cầu khách hàng, tìm căn phù hợp theo vị trí và bình luận', icon: '🤖' },
      growth: { title: 'Tương Tác & Kết Bạn', desc: 'Tương tác theo tệp khách hàng tiềm năng và nhóm mục tiêu', icon: '👥' },
      accounts: { title: 'Tài Khoản & Proxy', desc: 'Quản lý nick Facebook, IP Proxy và bảo vệ an toàn tài khoản', icon: '👤' },
      logs: { title: 'Nhật Ký Hoạt Động', desc: 'Theo dõi tiến trình chạy và nhật ký hệ thống thời gian thực', icon: '📋' }
    };`;

html = html.replace(oldTabTitlesPattern, newTabTitles);

// Cập nhật class switchTab active / inactive
html = html.replace(
  /btn\.className = 'nav-item w-full flex items-center justify-between px-3\.5 py-2\.5 rounded-xl text-xs font-semibold transition text-\[#A8A29E\] hover:text-\[#FAF7F2\] hover:bg-\[#24201C\]';/g,
  "btn.className = 'nav-item w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d]';"
);

html = html.replace(
  /activeBtn\.className = 'nav-item w-full flex items-center justify-between px-3\.5 py-2\.5 rounded-xl text-xs font-semibold transition bg-\[#D96B43\]\/15 text-\[#FAF7F2\] border border-\[#D96B43\]\/30 shadow-sm';/g,
  "activeBtn.className = 'nav-item w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition bg-[#1f6feb]/15 text-[#58a6ff] border border-[#388bfd]/30 shadow-sm';"
);

// Ghi file lại
fs.writeFileSync(filePath, html, 'utf8');
console.log('Update completed successfully. File size:', html.length);
