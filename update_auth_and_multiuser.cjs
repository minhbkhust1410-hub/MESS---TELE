const fs = require('fs');

const filePath = 'D:/KudoX_Mess_Tele/public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// 1. Thay thế toàn bộ Login Modal cũ thành Multi-User Auth Modal (có cả Đăng Nhập & Tạo Tài Khoản)
const oldModalPattern = /<!-- ======================================================== -->\s*<!-- APPLE GLASSMORPHISM WEB LOGIN MODAL[\s\S]*?<\/div>\s*<\/div>\s*<\/body>/;

const newModalHtml = `<!-- ======================================================== -->
  <!-- APPLE GLASSMORPHISM MULTI-USER AUTH MODAL                -->
  <!-- ======================================================== -->
  <div id="login-modal-overlay" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-3xl transition-opacity duration-300 hidden">
    <div class="w-full max-w-md apple-card rounded-3xl p-7 border border-white/15 bg-gradient-to-b from-[#1c1c1e]/95 to-[#121214]/98 shadow-2xl relative overflow-hidden space-y-5">
      
      <!-- Top Accent Glow -->
      <div class="absolute -top-12 -right-12 w-36 h-36 bg-[#0071e3]/20 rounded-full blur-2xl pointer-events-none"></div>

      <!-- Brand Header -->
      <div class="text-center space-y-1.5">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-b from-[#2c2c2e] to-[#1c1c1e] border border-white/20 text-white text-xl shadow-inner mb-0.5">
          <svg class="w-6 h-6 fill-current text-white/95" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div class="flex items-center justify-center gap-2">
          <h2 class="text-lg font-bold tracking-tight text-white">Falcon<span class="text-[#2997ff]">X</span> PRO</h2>
          <span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#0071e3]/20 text-[#2997ff] border border-[#0071e3]/30">MULTI-USER</span>
        </div>
        <p class="text-xs text-[#86868b] leading-relaxed">
          Hệ thống Quản lý Đa tài khoản Facebook & Đăng bài BĐS
        </p>
      </div>

      <!-- Switch Tabs: ĐĂNG NHẬP / TẠO TÀI KHOẢN -->
      <div class="flex p-1 rounded-full bg-white/[0.06] border border-white/10 text-xs font-semibold">
        <button type="button" id="tab-auth-login-btn" onclick="switchAuthMode('login')" 
                class="flex-1 py-1.5 rounded-full bg-[#0071e3] text-white transition shadow-sm">
          Đăng Nhập
        </button>
        <button type="button" id="tab-auth-register-btn" onclick="switchAuthMode('register')" 
                class="flex-1 py-1.5 rounded-full text-[#86868b] hover:text-white transition">
          + Tạo Tài Khoản
        </button>
      </div>

      <!-- FORM 1: ĐĂNG NHẬP -->
      <form id="form-auth-login" onsubmit="handleLoginSubmit(event)" class="space-y-3.5">
        
        <div class="space-y-1 text-left">
          <label class="block text-xs font-medium text-[#86868b] pl-1">Tài khoản</label>
          <input type="text" id="login-username" required placeholder="Nhập tên đăng nhập (VD: buianhminh)" value="admin" 
                 class="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#0071e3] transition font-sans" />
        </div>

        <div class="space-y-1 text-left">
          <label class="block text-xs font-medium text-[#86868b] pl-1">Mật khẩu</label>
          <input type="password" id="login-password" required placeholder="Nhập mật khẩu" value="ecotrang2026" 
                 class="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#0071e3] transition font-sans" />
        </div>

        <div id="login-error-msg" class="hidden p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-400 text-center font-medium"></div>

        <div class="flex items-center justify-between text-xs text-[#86868b] pt-0.5">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" id="login-remember" checked class="w-3.5 h-3.5 rounded border-white/20 text-[#0071e3] focus:ring-0 cursor-pointer" />
            <span>Ghi nhớ đăng nhập</span>
          </label>
          <span class="text-[11px] text-[#2997ff]">Mã hóa 256-bit</span>
        </div>

        <button type="submit" id="login-btn-submit" 
                class="w-full py-2.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] active:scale-[0.98] text-white text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-[#0071e3]/30 flex items-center justify-center gap-2">
          <span>Đăng Nhập Vào Hệ Thống</span>
          <span class="text-sm">➔</span>
        </button>

      </form>

      <!-- FORM 2: TẠO TÀI KHOẢN MỚI (DÀNH CHO NGƯỜI QUẢN LÝ NHIỀU NICK) -->
      <form id="form-auth-register" onsubmit="handleRegisterSubmit(event)" class="space-y-3.5 hidden">
        
        <div class="space-y-1 text-left">
          <label class="block text-xs font-medium text-[#86868b] pl-1">Họ và tên người quản lý</label>
          <input type="text" id="reg-name" required placeholder="Ví dụ: Bùi Anh Minh hoặc Lang Thang Eco" 
                 class="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#10b981] transition font-sans" />
        </div>

        <div class="space-y-1 text-left">
          <label class="block text-xs font-medium text-[#86868b] pl-1">Tên đăng nhập (Username viết liền)</label>
          <input type="text" id="reg-username" required placeholder="Ví dụ: buianhminh hoặc langthangeco" 
                 class="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#10b981] transition font-sans" />
        </div>

        <div class="space-y-1 text-left">
          <label class="block text-xs font-medium text-[#86868b] pl-1">Mật khẩu (Tối thiểu 4 ký tự)</label>
          <input type="password" id="reg-password" required placeholder="Nhập mật khẩu an toàn" 
                 class="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#10b981] transition font-sans" />
        </div>

        <div id="reg-error-msg" class="hidden p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-400 text-center font-medium"></div>

        <button type="submit" id="reg-btn-submit" 
                class="w-full py-2.5 rounded-full bg-[#10b981] hover:bg-[#059669] active:scale-[0.98] text-white text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-[#10b981]/30 flex items-center justify-center gap-2">
          <span>Tạo Tài Khoản & Vào Quản Lý</span>
          <span class="text-sm">➔</span>
        </button>

      </form>

      <!-- Bottom Security Note -->
      <div class="pt-2 border-t border-white/10 text-center text-[10px] text-[#86868b]">
        <span>👤 Mỗi tài khoản có quyền quản lý danh sách nick Facebook và dữ liệu riêng biệt.</span>
      </div>

    </div>
  </div>
</body>`;

html = html.replace(oldModalPattern, newModalHtml);

// 2. Thêm thanh User Pill vào Header Bar
const oldHeaderTitleArea = `<div class="flex items-center gap-3 min-w-0 flex-1 pr-4">
        <h2 id="section-title" class="text-sm font-semibold text-white flex items-center gap-2 flex-shrink-0">
          <span>📊</span>
          <span class="tracking-tight">Tổng Quan Hệ Thống</span>
        </h2>
        <span class="h-4 w-[1px] bg-white/15 hidden sm:block flex-shrink-0"></span>
        <span class="text-xs text-[#86868b] hidden sm:inline truncate max-w-xl" id="section-desc">Theo dõi tài khoản, tin nhắn và trạng thái tự động hóa</span>
      </div>`;

const newHeaderTitleArea = `<div class="flex items-center gap-3 min-w-0 flex-1 pr-4">
        <h2 id="section-title" class="text-sm font-semibold text-white flex items-center gap-2 flex-shrink-0">
          <span>📊</span>
          <span class="tracking-tight">Tổng Quan Hệ Thống</span>
        </h2>
        <span class="h-4 w-[1px] bg-white/15 hidden sm:block flex-shrink-0"></span>
        <span class="text-xs text-[#86868b] hidden md:inline truncate max-w-md" id="section-desc">Theo dõi tài khoản, tin nhắn và trạng thái tự động hóa</span>
        
        <!-- Live User Badge -->
        <div id="header-user-pill" class="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/15 text-xs text-[#f5f5f7]">
          <span class="text-sm">👤</span>
          <span id="header-user-name" class="font-semibold text-white">Admin</span>
          <span id="header-user-badge" class="text-[10px] font-mono px-2 py-0.2 rounded-full bg-[#2997ff]/20 text-[#2997ff] border border-[#2997ff]/30">Quản lý</span>
        </div>
      </div>`;

html = html.replace(oldHeaderTitleArea, newHeaderTitleArea);

// 3. Thêm User Manager Card vào đầu Sidebar
const oldSidebarLogo = `<div class="flex items-center gap-3 px-1.5 py-1">
        <div class="w-8 h-8 rounded-xl bg-gradient-to-b from-[#2c2c2e] to-[#1c1c1e] border border-white/15 flex items-center justify-center text-white text-xs font-bold shadow-inner">
          <svg class="w-4 h-4 fill-current text-white/95" viewBox="0 0 24 24">
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
      </div>`;

const newSidebarLogo = `<div class="flex items-center justify-between px-1 py-1">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-gradient-to-b from-[#2c2c2e] to-[#1c1c1e] border border-white/15 flex items-center justify-center text-white text-xs font-bold shadow-inner">
            <svg class="w-4 h-4 fill-current text-white/95" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-sm font-semibold tracking-tight text-white">Falcon<span class="text-[#2997ff]">X</span></span>
              <span class="text-[9px] font-medium px-1.5 py-0.2 rounded-full bg-white/10 text-[#86868b]">PRO</span>
            </div>
            <p class="text-[9px] text-[#86868b]">Multi-User Platform</p>
          </div>
        </div>
      </div>

      <!-- Current Logged-in Manager Info Pill -->
      <div class="p-2.5 rounded-xl bg-gradient-to-r from-white/[0.06] to-transparent border border-white/10 flex items-center justify-between text-xs">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-xs">👤</span>
            <span id="sidebar-manager-name" class="font-bold text-white truncate max-w-[110px]">Bùi Anh Minh</span>
          </div>
          <span id="sidebar-manager-role" class="text-[10px] text-[#2997ff] font-mono block">Quản lý nhiều nick</span>
        </div>
        <button onclick="logoutAdmin()" title="Đổi tài khoản khác" class="text-[11px] text-[#86868b] hover:text-white transition px-2 py-1 rounded-md bg-white/5 border border-white/10">
          Đổi ⇄
        </button>
      </div>`;

html = html.replace(oldSidebarLogo, newSidebarLogo);

// 4. Thêm JavaScript switchAuthMode và handleRegisterSubmit
const newAuthJs = `
    // Switch giữa tab Đăng Nhập và Đăng Ký
    function switchAuthMode(mode) {
      const loginTab = document.getElementById('tab-auth-login-btn');
      const regTab = document.getElementById('tab-auth-register-btn');
      const loginForm = document.getElementById('form-auth-login');
      const regForm = document.getElementById('form-auth-register');
      const loginErr = document.getElementById('login-error-msg');
      const regErr = document.getElementById('reg-error-msg');

      if (loginErr) loginErr.classList.add('hidden');
      if (regErr) regErr.classList.add('hidden');

      if (mode === 'register') {
        loginTab.className = 'flex-1 py-1.5 rounded-full text-[#86868b] hover:text-white transition';
        regTab.className = 'flex-1 py-1.5 rounded-full bg-[#10b981] text-white transition shadow-sm';
        loginForm.classList.add('hidden');
        regForm.classList.remove('hidden');
        const nameInput = document.getElementById('reg-name');
        if (nameInput) nameInput.focus();
      } else {
        loginTab.className = 'flex-1 py-1.5 rounded-full bg-[#0071e3] text-white transition shadow-sm';
        regTab.className = 'flex-1 py-1.5 rounded-full text-[#86868b] hover:text-white transition';
        loginForm.classList.remove('hidden');
        regForm.classList.add('hidden');
        const userInp = document.getElementById('login-username');
        if (userInp) userInp.focus();
      }
    }

    // Xử lý tạo tài khoản người quản lý mới
    async function handleRegisterSubmit(event) {
      if (event) event.preventDefault();
      const nameInput = document.getElementById('reg-name');
      const usernameInput = document.getElementById('reg-username');
      const passwordInput = document.getElementById('reg-password');
      const errorMsg = document.getElementById('reg-error-msg');
      const btn = document.getElementById('reg-btn-submit');

      const name = nameInput ? nameInput.value.trim() : '';
      const username = usernameInput ? usernameInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      if (errorMsg) errorMsg.classList.add('hidden');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>Đang tạo tài khoản...</span>';
      }

      try {
        const res = await _originalFetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, username, password })
        });
        const data = await res.json();

        if (data.success && data.token) {
          localStorage.setItem(AUTH_TOKEN_KEY, data.token);
          hideLoginModal();
          await fetchCurrentUserProfile();
          refreshData();
          alert('Chúc mừng bạn! Tài khoản quản lý [' + (name || username) + '] đã được tạo thành công.');
        } else {
          if (errorMsg) {
            errorMsg.textContent = data.error || 'Lỗi khi tạo tài khoản.';
            errorMsg.classList.remove('hidden');
          }
        }
      } catch (err) {
        if (errorMsg) {
          errorMsg.textContent = 'Lỗi kết nối: ' + err.message;
          errorMsg.classList.remove('hidden');
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>Tạo Tài Khoản & Vào Quản Lý</span> <span class="text-sm">➔</span>';
        }
      }
    }

    // Lấy thông tin người dùng đang đăng nhập và cập nhật UI
    async function fetchCurrentUserProfile() {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return;

      try {
        const res = await _originalFetch('/api/auth/me', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();

        if (data.success && data.user) {
          const user = data.user;
          const headerName = document.getElementById('header-user-name');
          const headerBadge = document.getElementById('header-user-badge');
          const sidebarManagerName = document.getElementById('sidebar-manager-name');
          const sidebarManagerRole = document.getElementById('sidebar-manager-role');

          if (headerName) headerName.textContent = user.name || user.username;
          if (headerBadge) {
            headerBadge.textContent = user.role === 'admin' 
              ? 'Admin' 
              : 'Quản lý ' + (data.managedCount || 0) + ' nick';
          }
          if (sidebarManagerName) sidebarManagerName.textContent = user.name || user.username;
          if (sidebarManagerRole) {
            sidebarManagerRole.textContent = user.role === 'admin' 
              ? '👑 Quản Trị Hệ Thống' 
              : '👤 Quản lý (' + (data.managedCount || 0) + ' nick)';
          }
        }
      } catch (err) {
        console.warn('Lỗi lấy profile user:', err);
      }
    }
`;

html = html.replace('function showLoginModal() {', newAuthJs + '\n    function showLoginModal() {');

// Cập nhật checkAuthSession để gọi fetchCurrentUserProfile()
html = html.replace('hideLoginModal();', 'hideLoginModal();\n          fetchCurrentUserProfile();');

fs.writeFileSync(filePath, html, 'utf8');
console.log('Multi-user frontend updated successfully! File size:', html.length);
