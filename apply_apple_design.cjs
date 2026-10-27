const fs = require('fs');

const filePath = 'D:/KudoX_Mess_Tele/public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// 1. Cập nhật thẻ <style> theo chuẩn Apple Design System (Dark Glassmorphism, SF Pro, Squircle, Bento)
const appleStyle = `  <style>
    /* Apple Design System Typography */
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
      letter-spacing: -0.015em;
      background-color: #000000;
      color: #f5f5f7;
    }
    .font-mono { 
      font-family: "SF Mono", Monaco, Menlo, Consolas, monospace; 
      letter-spacing: -0.02em;
    }

    /* Apple-Style Minimalist Scrollbars */
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }

    /* Apple Bento Card & Frosted Glass Surfaces */
    .claude-card, .apple-card {
      background: rgba(28, 28, 30, 0.65);
      backdrop-filter: blur(25px) saturate(180%);
      -webkit-backdrop-filter: blur(25px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 18px;
      position: relative;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .claude-card:hover, .apple-card:hover {
      border-color: rgba(255, 255, 255, 0.18);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      transform: translateY(-1px);
    }
    .claude-card::after { display: none !important; }

    /* Apple Hero Gradient Typography */
    .apple-headline {
      background: linear-gradient(180deg, #FFFFFF 0%, rgba(255, 255, 255, 0.72) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .apple-subhead {
      color: #86868b;
    }

    /* Apple Pill Buttons */
    .apple-btn-primary {
      background: #0071e3;
      color: #ffffff;
      border-radius: 9999px;
      font-weight: 500;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .apple-btn-primary:hover {
      background: #0077ed;
      box-shadow: 0 0 15px rgba(0, 113, 227, 0.4);
    }
    .apple-btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #f5f5f7;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 9999px;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    .apple-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.14);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Apple Inputs */
    input, textarea, select {
      background: rgba(255, 255, 255, 0.05) !important;
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      border-radius: 12px !important;
      color: #f5f5f7 !important;
      transition: all 0.2s ease;
    }
    input:focus, textarea:focus, select:focus {
      outline: none !important;
      border-color: #0071e3 !important;
      box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.25) !important;
    }

    /* Ẩn triệt để rác thị giác */
    .ambient-orb, 
    #kudo-cat-mascot-root, 
    #cute-confetti-canvas {
      display: none !important;
      pointer-events: none !important;
    }

    /* Apple Pulse Status Dot */
    @keyframes apple-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.9); }
    }
    .animate-warm-pulse { animation: apple-pulse 2.2s infinite ease-in-out; }

    /* Apple Live Activity Pulse Cells */
    @keyframes apple-matrix-cell {
      0%, 100% { opacity: 0.6; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.1); filter: drop-shadow(0 0 4px rgba(48, 209, 88, 0.8)); }
    }
    .matrix-live-cell {
      animation: apple-matrix-cell 3s infinite ease-in-out;
    }
  </style>`;

html = html.replace(/<style>[\s\S]*?<\/style>/, appleStyle);

// 2. Thẻ <body> chuẩn Apple Black OLED
html = html.replace(
  /<body class="[^"]*">/,
  '<body class="bg-[#000000] text-[#f5f5f7] min-h-screen flex selection:bg-[#0071e3] selection:text-white relative">'
);

// 3. Cập nhật Sidebar <aside> theo chuẩn Apple macOS Glass Sidebar
const oldSidebarPattern = /<aside class="w-64 bg-\[#161b22\] border-r border-\[#30363d\][\s\S]*?<\/aside>/;
const newSidebar = `<aside class="w-64 bg-[#161617]/85 backdrop-blur-2xl border-r border-white/10 flex flex-col justify-between p-4 sticky top-0 h-screen z-40 hidden md:flex">
    
    <!-- Top Branding & Navigation -->
    <div class="space-y-4">
      
      <!-- Brand Logo - Apple Minimalist Aesthetic -->
      <div class="flex items-center gap-3 px-1.5 py-1">
        <div class="w-8 h-8 rounded-xl bg-gradient-to-b from-[#2c2c2e] to-[#1c1c1e] border border-white/15 flex items-center justify-center text-white text-xs font-bold shadow-inner">
          <svg class="w-4 h-4 fill-current text-white/90" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-semibold tracking-tight text-white">Falcon<span class="text-[#2997ff]">X</span></span>
            <span class="text-[9px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-[#86868b] border border-white/10">PRO</span>
          </div>
          <p class="text-[9px] text-[#86868b]">BĐS Automation</p>
        </div>
      </div>

      <!-- Active Profile Card - Apple Frosted Style -->
      <div class="p-3 rounded-2xl bg-white/[0.04] border border-white/10 relative space-y-2.5">
        <div class="flex items-center gap-3">
          <div class="relative cursor-pointer group/avatar" onclick="openAvatarModal()" title="Nhấp để xem hoặc đổi ảnh đại diện">
            <img id="sidebar-avatar" src="https://graph.facebook.com/61577949601039/picture?type=large" class="w-10 h-10 rounded-xl object-cover border border-white/15 shadow-sm flex-shrink-0 group-hover/avatar:border-[#2997ff] transition" />
            <button onclick="syncAvatarNow(event)" title="Đồng bộ avatar từ Facebook" class="absolute -bottom-1 -right-1 w-4 h-4 bg-[#0071e3] hover:bg-[#0077ed] rounded-full text-[8px] flex items-center justify-center text-white border border-[#161617] shadow transition">
              🔄
            </button>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between">
              <button onclick="openSidebarActiveProfilePage()" class="text-xs font-semibold text-white hover:text-[#2997ff] transition truncate flex items-center gap-1 text-left" title="Mở trang cá nhân Facebook">
                <span id="sidebar-name">Eco Trang</span>
                <span class="text-[10px] text-[#2997ff]">↗</span>
              </button>
              <span class="w-2 h-2 rounded-full bg-[#30d158] animate-warm-pulse flex-shrink-0" title="Trạng thái: Đang kết nối"></span>
            </div>
            <span id="sidebar-uid" class="text-[10px] text-[#86868b] font-mono block truncate">UID: 61577949601039</span>
            <div class="flex items-center gap-1 mt-0.5">
              <span class="text-[9px] text-[#30d158] font-medium flex items-center gap-1">
                <span>●</span> Facebook Live
              </span>
            </div>
          </div>
        </div>

        <!-- Live Proxy Status Pill -->
        <div id="sidebar-proxy-pill" onclick="checkSidebarProxyModal()" 
             class="flex items-center justify-between text-[10px] py-1 px-2.5 rounded-full bg-white/[0.04] border border-white/10 cursor-pointer hover:border-[#2997ff]/50 transition group/proxy"
             title="Nhấp để kiểm tra chi tiết Proxy bảo vệ">
          <span id="sidebar-proxy-status-tag" class="flex items-center gap-1.5 text-[#86868b] truncate">
            <span>🛡️</span> <span id="sidebar-proxy-brief">Đang kiểm tra...</span>
          </span>
          <span class="text-[9px] text-[#2997ff] font-medium group-hover/proxy:underline flex-shrink-0">Check ↗</span>
        </div>

        <!-- Action Buttons -->
        <div class="pt-2 border-t border-white/10 flex items-center gap-1.5">
          <button id="sidebar-fb-btn" onclick="openSidebarActiveAccountBrowser()" 
                  class="flex-1 py-1.5 px-2 rounded-full bg-[#0071e3]/15 hover:bg-[#0071e3]/25 text-[#2997ff] border border-[#0071e3]/30 text-[10px] font-medium flex items-center justify-center gap-1 transition"
                  title="Mở Facebook bảo vệ qua Proxy">
            <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            <span>Vào FB ↗</span>
          </button>
          <button onclick="checkSidebarProxyModal()" 
                  class="py-1.5 px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[#f5f5f7] border border-white/10 text-[10px] font-medium flex items-center justify-center gap-1 transition"
                  title="Kiểm tra IP Proxy">
            <span>⚡ Proxy</span>
          </button>
        </div>
      </div>

      <!-- Navigation Menu Items - Apple Sidebar Style -->
      <nav class="space-y-1">
        
        <button onclick="switchTab('overview')" id="nav-btn-overview" class="nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition bg-[#0071e3]/15 text-[#2997ff] border border-[#0071e3]/30">
          <div class="flex items-center gap-2.5">
            <span class="text-sm">📊</span>
            <span>Tổng Quan</span>
          </div>
        </button>

        <button onclick="switchTab('inbox')" id="nav-btn-inbox" class="nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition text-[#86868b] hover:text-white hover:bg-white/[0.05]">
          <div class="flex items-center gap-2.5">
            <span class="text-sm">💬</span>
            <span>Tin Nhắn Khách Hàng</span>
          </div>
          <span id="sidebar-badge-customers" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-[#86868b] font-medium">22</span>
        </button>

        <button onclick="switchTab('posts')" id="nav-btn-posts" class="nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition text-[#86868b] hover:text-white hover:bg-white/[0.05]">
          <div class="flex items-center gap-2.5">
            <span class="text-sm">📝</span>
            <span>Đăng Bài Lên Group</span>
          </div>
          <span id="sidebar-badge-posts" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-[#86868b] font-medium">0</span>
        </button>

        <button onclick="switchTab('autocmt')" id="nav-btn-autocmt" class="nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition text-[#86868b] hover:text-white hover:bg-white/[0.05]">
          <div class="flex items-center gap-2.5">
            <span class="text-sm">🤖</span>
            <span>Săn Khách & Quỹ Căn</span>
          </div>
        </button>

        <button onclick="switchTab('growth')" id="nav-btn-growth" class="nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition text-[#86868b] hover:text-white hover:bg-white/[0.05]">
          <div class="flex items-center gap-2.5">
            <span class="text-sm">👥</span>
            <span>Tương Tác & Kết Bạn</span>
          </div>
        </button>

        <button onclick="switchTab('accounts')" id="nav-btn-accounts" class="nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition text-[#86868b] hover:text-white hover:bg-white/[0.05]">
          <div class="flex items-center gap-2.5">
            <span class="text-sm">👤</span>
            <span>Tài Khoản & Proxy</span>
          </div>
        </button>

        <button onclick="switchTab('logs')" id="nav-btn-logs" class="nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition text-[#86868b] hover:text-white hover:bg-white/[0.05]">
          <div class="flex items-center gap-2.5">
            <span class="text-sm">📋</span>
            <span>Nhật Ký Hoạt Động</span>
          </div>
        </button>

      </nav>

    </div>

    <!-- Sidebar Bottom Info Panel -->
    <div class="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
      <div class="flex items-center justify-between text-xs">
        <span class="text-[#86868b]">Telegram Bot</span>
        <span class="text-[#2997ff] font-mono font-medium text-[11px]" id="sidebar-bot-tag">@ecotrang_mess_bot</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-[#86868b]">Thời Gian Chạy</span>
        <span class="text-[#30d158] font-mono font-medium text-[11px]" id="sidebar-uptime">--:--</span>
      </div>
      <a href="https://web.telegram.org" target="_blank" class="w-full mt-1 py-1.5 px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[#f5f5f7] border border-white/10 text-xs font-medium flex items-center justify-center gap-1.5 transition">
        <span>✈️</span> Mở Telegram
      </a>
    </div>

  </aside>`;

html = html.replace(oldSidebarPattern, newSidebar);

// 4. Cập nhật Header Bar chuẩn Apple Frosted Glass Top Navigation
const oldHeaderPattern = /<header class="h-14 border-b border-\[#30363d\] bg-\[#161b22\][\s\S]*?<\/header>/;
const newHeader = `<header class="h-14 border-b border-white/10 bg-[#000000]/80 backdrop-blur-2xl px-6 flex items-center justify-between sticky top-0 z-30">
      
      <!-- Current Section Title -->
      <div class="flex items-center gap-3 min-w-0 flex-1 pr-4">
        <h2 id="section-title" class="text-sm font-semibold text-white flex items-center gap-2 flex-shrink-0">
          <span>📊</span>
          <span class="tracking-tight">Tổng Quan Hệ Thống</span>
        </h2>
        <span class="h-4 w-[1px] bg-white/15 hidden sm:block flex-shrink-0"></span>
        <span class="text-xs text-[#86868b] hidden sm:inline truncate max-w-xl" id="section-desc">Theo dõi tài khoản, tin nhắn và trạng thái tự động hóa</span>
      </div>

      <!-- Action Buttons - Apple Pill Style -->
      <div class="flex items-center gap-2 flex-shrink-0">

        <button id="header-fb-btn" onclick="openSidebarActiveAccountBrowser()" class="px-3.5 py-1.5 rounded-full bg-[#0071e3]/15 hover:bg-[#0071e3]/25 border border-[#0071e3]/30 text-xs font-medium text-[#2997ff] transition flex items-center gap-1.5" title="Mở Facebook bảo vệ an toàn">
          <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          <span class="hidden sm:inline">Mở FB Proxy ↗</span>
        </button>
        
        <button onclick="viewScreenModal()" class="px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-[#f5f5f7] transition flex items-center gap-1.5">
          <span>🖥️</span>
          <span class="hidden sm:inline">Màn Hình FB</span>
        </button>

        <button onclick="openAddAccountModal()" class="px-4 py-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-xs font-medium text-white transition flex items-center gap-1.5 shadow-sm">
          <span>➕</span>
          <span>Thêm Nick</span>
        </button>

        <button onclick="refreshData()" class="p-1.5 px-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[#86868b] hover:text-white transition" title="Làm mới dữ liệu">
          <span id="refresh-icon" class="inline-block text-xs">🔄</span>
        </button>

      </div>
    </header>`;

html = html.replace(oldHeaderPattern, newHeader);

// 5. Cập nhật Tab Overview Hero Banner & Bento Cards theo phong cách Apple Pro
const oldHeroAndKpisPattern = /<!-- Clean GitHub \/ SaaS Status Banner -->[\s\S]*?<!-- 2 Columns: System Specs & Live Stream -->/;
const newHeroAndKpis = `<!-- Apple Pro Hero Banner -->
        <div class="apple-card rounded-3xl p-6 sm:p-8 border border-white/10 relative overflow-hidden bg-gradient-to-b from-white/[0.06] to-white/[0.02]">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div class="space-y-2 max-w-3xl">
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#30d158]/15 text-[#30d158] border border-[#30d158]/30 text-xs font-medium">
                <span class="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-warm-pulse"></span>
                HỆ THỐNG TRỰC TUYẾN 24/7
              </div>
              <h1 class="text-2xl sm:text-3xl font-bold tracking-tight apple-headline">
                Tự Động Hóa Facebook & Telegram Đỉnh Cao.
              </h1>
              <p class="text-xs sm:text-sm text-[#86868b] leading-relaxed">
                Được thiết kế chuyên biệt cho Môi Giới Bất Động Sản Ecopark: Tự động phân phối bài đăng, quét tìm khách hàng tiềm năng, khớp quỹ căn theo vị trí Google Maps và đồng bộ tin nhắn 2 chiều thời gian thực.
              </p>
            </div>
            <div class="flex sm:flex-col items-end gap-2 flex-wrap">
              <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 text-xs font-mono text-[#f5f5f7]">
                <span class="w-2 h-2 rounded-full bg-[#30d158]"></span> Web Port: 3300
              </span>
              <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 text-xs font-mono text-[#f5f5f7]">
                <span class="w-2 h-2 rounded-full bg-[#30d158]"></span> Bot: Online
              </span>
              <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 text-xs font-mono text-[#f5f5f7]">
                <span class="w-2 h-2 rounded-full bg-[#2997ff]"></span> Proxy: An Toàn
              </span>
            </div>
          </div>

          <!-- Activity Matrix Pulse Bar -->
          <div class="flex items-center justify-between flex-wrap gap-2 pt-4 border-t border-white/10 text-xs mt-5">
            <div class="flex items-center gap-2.5">
              <span class="text-[#86868b] text-[11px] font-mono">Nhịp Kết Nối Real-Time:</span>
              <div class="flex items-center gap-1.5" id="github-matrix-cells" title="Nhịp đập hệ thống thời gian thực">
                <span class="w-2.5 h-2.5 rounded-sm bg-[#30d158] matrix-live-cell inline-block" title="Proxy Tunnel: 100% OK"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#30d158] matrix-live-cell inline-block" style="animation-delay: 0.2s" title="Bảo Vệ Nick: Hoạt Động"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#30d158] matrix-live-cell inline-block" style="animation-delay: 0.4s" title="Đồng Bộ Tin Nhắn: LIVE"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#30d158] matrix-live-cell inline-block" style="animation-delay: 0.6s" title="Telegram Bot: Đã Kết Nối"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#30d158] matrix-live-cell inline-block" style="animation-delay: 0.8s" title="Chống Đăng Lặp: Sẵn Sàng"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#2997ff] matrix-live-cell inline-block" style="animation-delay: 1.0s" title="Quỹ Căn Offline: Đã Nạp"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#30d158] matrix-live-cell inline-block" style="animation-delay: 1.2s" title="Chrome Session: Trực Tiếp"></span>
                <span class="w-2.5 h-2.5 rounded-sm bg-[#30d158] matrix-live-cell inline-block" style="animation-delay: 1.4s" title="Cơ Sở Dữ Liệu: Sẵn Sàng"></span>
              </div>
            </div>
            <div class="flex items-center gap-3 font-mono text-[11px] text-[#86868b]">
              <span class="text-[#30d158] flex items-center gap-1">● Tuyệt Đối Không Rò Rỉ IP</span>
              <span>•</span>
              <span class="text-[#2997ff] flex items-center gap-1">● Radar Khớp Căn GPS Ecopark</span>
            </div>
          </div>
        </div>

        <!-- 4 Metric KPI Cards - Apple Bento Style -->
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

        <!-- 2 Columns: System Specs & Live Stream -->`;

html = html.replace(oldHeroAndKpisPattern, newHeroAndKpis);

// 6. Cập nhật Specs & Live stream thành Apple Bento Card
const oldSpecsPattern = /<!-- System Specs \(7 Cols\)[\s\S]*?<!-- Live Activity Feed Stream \(5 Cols\)[\s\S]*?<\/div>[\s\S]*?<\/button>[\s\S]*?<\/div>/;
const newSpecs = `<!-- System Specs (7 Cols) -->
          <div class="lg:col-span-7 apple-card rounded-3xl p-6 space-y-5 border border-white/10">
            <div class="flex items-center justify-between border-b border-white/10 pb-4">
              <div class="flex items-center gap-2.5">
                <span class="text-base">⚙️</span>
                <h3 class="text-xs font-semibold uppercase tracking-wider text-white">Cơ Chế Vận Hành Tự Động Hóa</h3>
              </div>
              <span class="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#30d158]/15 text-[#30d158] border border-[#30d158]/30 font-medium">
                SẴN SÀNG 24/7
              </span>
            </div>

            <div class="grid grid-cols-2 gap-3.5 text-xs">
              <div class="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                <span class="text-[#86868b] text-[11px]">Đồng Bộ Tin Nhắn</span>
                <p class="font-semibold text-white">Tức Thì 2 Chiều</p>
                <p class="text-[10px] text-[#30d158]">Messenger ↔ Telegram ngay lập tức</p>
              </div>

              <div class="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                <span class="text-[#86868b] text-[11px]">Bảo Vệ Tài Khoản</span>
                <p class="font-semibold text-white">Tách Biệt Session & Proxy</p>
                <p class="text-[10px] text-[#2997ff]">Tránh checkpoint, bảo vệ IP máy</p>
              </div>

              <div class="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                <span class="text-[#86868b] text-[11px]">Đăng Bài Tự Động</span>
                <p class="font-semibold text-white">Dãn Cách & Chống Lặp</p>
                <p class="text-[10px] text-[#ff9f0a]">Kiểm tra bài trước khi gửi lên group</p>
              </div>

              <div class="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                <span class="text-[#86868b] text-[11px]">Săn Khách & Quỹ Căn</span>
                <p class="font-semibold text-white">Khớp Căn Theo Vị Trí</p>
                <p class="text-[10px] text-[#bf5af2]">Tự nhận diện ảnh & tính khoảng cách GPS</p>
              </div>
            </div>

            <!-- 5 Phân hệ tính năng -->
            <div class="pt-2">
              <span class="text-[11px] font-medium text-[#86868b] uppercase tracking-wider block mb-2.5">5 Tính Năng Tự Động Hóa Cốt Lõi</span>
              <div class="grid grid-cols-5 gap-2 text-center text-[10px] font-medium">
                <div class="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition">
                  <span class="block text-base mb-1">📝</span>
                  <span class="text-white block">Đăng Bài</span>
                  <span class="text-[#86868b]">Nhóm FB</span>
                </div>
                <div class="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition">
                  <span class="block text-base mb-1">🤖</span>
                  <span class="text-white block">Săn Khách</span>
                  <span class="text-[#86868b]">Bình luận</span>
                </div>
                <div class="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition">
                  <span class="block text-base mb-1">👥</span>
                  <span class="text-white block">Quét Mem</span>
                  <span class="text-[#86868b]">Tệp khách</span>
                </div>
                <div class="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition">
                  <span class="block text-base mb-1">🤝</span>
                  <span class="text-white block">Kết Bạn</span>
                  <span class="text-[#86868b]">Đúng tệp</span>
                </div>
                <div class="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition">
                  <span class="block text-base mb-1">❤️</span>
                  <span class="text-white block">Tương Tác</span>
                  <span class="text-[#86868b]">Nuôi nick</span>
                </div>
              </div>
            </div>

          </div>

          <!-- Live Activity Feed Stream (5 Cols) -->
          <div class="lg:col-span-5 apple-card rounded-3xl p-6 space-y-4 flex flex-col justify-between border border-white/10">
            <div>
              <div class="flex items-center justify-between border-b border-white/10 pb-4 mb-3">
                <div class="flex items-center gap-2">
                  <span class="text-base">📡</span>
                  <h3 class="text-xs font-semibold uppercase tracking-wider text-white">Nhật Ký Sự Kiện Gần Nhất</h3>
                </div>
                <span class="text-[10px] font-mono text-[#86868b]">Live</span>
              </div>
              <div id="live-activity-stream" class="space-y-2 max-h-72 overflow-y-auto pr-1 text-[11px] font-mono">
                <div class="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-[#f5f5f7]">
                  <span class="text-[#86868b]">[Khởi động]</span> Hệ thống sẵn sàng đồng bộ tin nhắn 2 chiều.
                </div>
              </div>
            </div>
            <button onclick="switchTab('logs')" class="w-full mt-3 py-2.5 px-4 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[#f5f5f7] border border-white/10 text-xs font-medium transition text-center">
              Mở Toàn Bộ Nhật Ký Hoạt Động ↗
            </button>
          </div>`;

html = html.replace(oldSpecsPattern, newSpecs);

// 7. Cập nhật switchTab để các button active có phong cách Apple
html = html.replace(
  /btn\.className = 'nav-item w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition text-\[#8b949e\] hover:text-\[#f0f6fc\] hover:bg-\[#21262d\]';/g,
  "btn.className = 'nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition text-[#86868b] hover:text-white hover:bg-white/[0.05]';"
);

html = html.replace(
  /activeBtn\.className = 'nav-item w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition bg-\[#1f6feb\]\/15 text-\[#58a6ff\] border border-\[#388bfd\]\/30 shadow-sm';/g,
  "activeBtn.className = 'nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition bg-[#0071e3]/15 text-[#2997ff] border border-[#0071e3]/30';"
);

// 8. Chuyển đổi các nút và các khối trong tab Đăng bài & Săn khách sang chuẩn Apple
// Thay đổi các nút cam sặc sỡ thành nút Apple Blue hoặc Glass
html = html.replace(/bg-\[#D96B43\]/g, 'bg-[#0071e3]');
html = html.replace(/hover:bg-\[#E27D56\]/g, 'hover:bg-[#0077ed]');
html = html.replace(/text-\[#E87A5D\]/g, 'text-[#2997ff]');
html = html.replace(/border-\[#D96B43\]\/30/g, 'border-[#0071e3]/30');
html = html.replace(/shadow-\[#D96B43\]\/25/g, 'shadow-[#0071e3]/25');

fs.writeFileSync(filePath, html, 'utf8');
console.log('Apple Pro Design System applied successfully. File size:', html.length);
