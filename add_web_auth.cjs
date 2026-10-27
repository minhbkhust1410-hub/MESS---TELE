const fs = require('fs');

const filePath = 'D:/KudoX_Mess_Tele/public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// 1. Thêm nút Đăng Xuất (Logout) vào Header Bar
const oldHeaderRight = `        <button onclick="refreshData()" class="p-1.5 px-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[#86868b] hover:text-white transition" title="Làm mới dữ liệu">
          <span id="refresh-icon" class="inline-block text-xs">🔄</span>
        </button>

      </div>
    </header>`;

const newHeaderRight = `        <button onclick="refreshData()" class="p-1.5 px-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[#86868b] hover:text-white transition" title="Làm mới dữ liệu">
          <span id="refresh-icon" class="inline-block text-xs">🔄</span>
        </button>

        <button onclick="logoutAdmin()" class="py-1.5 px-3 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs font-medium text-red-400 hover:text-red-300 transition flex items-center gap-1.5" title="Đăng xuất khỏi phiên làm việc">
          <span>🔒</span>
          <span class="hidden sm:inline">Đăng Xuất</span>
        </button>

      </div>
    </header>`;

html = html.replace(oldHeaderRight, newHeaderRight);

// 2. Thêm Login Modal chuẩn Apple Glassmorphism vào trước thẻ đóng </body>
const loginModalHtml = `
  <!-- ======================================================== -->
  <!-- APPLE GLASSMORPHISM WEB LOGIN MODAL (BẢO VỆ VPS / WEB)   -->
  <!-- ======================================================== -->
  <div id="login-modal-overlay" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-3xl transition-opacity duration-300 hidden">
    <div class="w-full max-w-md apple-card rounded-3xl p-8 border border-white/15 bg-gradient-to-b from-[#1c1c1e]/90 to-[#121214]/95 shadow-2xl relative overflow-hidden space-y-6">
      
      <!-- Top Accent Glow -->
      <div class="absolute -top-12 -right-12 w-36 h-36 bg-[#0071e3]/20 rounded-full blur-2xl pointer-events-none"></div>

      <!-- Brand Header -->
      <div class="text-center space-y-2">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-b from-[#2c2c2e] to-[#1c1c1e] border border-white/20 text-white text-2xl shadow-inner mb-1">
          <svg class="w-7 h-7 fill-current text-white/95" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div class="flex items-center justify-center gap-2">
          <h2 class="text-xl font-bold tracking-tight text-white">Falcon<span class="text-[#2997ff]">X</span> PRO</h2>
          <span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#0071e3]/20 text-[#2997ff] border border-[#0071e3]/30">VPS SHIELD</span>
        </div>
        <p class="text-xs text-[#86868b] leading-relaxed">
          Đăng nhập bảng điều khiển tự động hóa BĐS từ xa
        </p>
      </div>

      <!-- Login Form -->
      <form onsubmit="handleLoginSubmit(event)" class="space-y-4">
        
        <div class="space-y-1.5 text-left">
          <label class="block text-xs font-medium text-[#86868b] pl-1">Tài khoản quản trị</label>
          <div class="relative">
            <input type="text" id="login-username" required placeholder="Nhập tên đăng nhập" value="admin" 
                   class="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#0071e3] transition font-sans" />
          </div>
        </div>

        <div class="space-y-1.5 text-left">
          <label class="block text-xs font-medium text-[#86868b] pl-1">Mật khẩu bảo mật</label>
          <div class="relative">
            <input type="password" id="login-password" required placeholder="Nhập mật khẩu" value="ecotrang2026" 
                   class="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#0071e3] transition font-sans" />
          </div>
        </div>

        <div id="login-error-msg" class="hidden p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-400 text-center font-medium">
          Tài khoản hoặc mật khẩu không chính xác.
        </div>

        <div class="flex items-center justify-between text-xs text-[#86868b] pt-1">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" id="login-remember" checked class="w-3.5 h-3.5 rounded border-white/20 text-[#0071e3] focus:ring-0 cursor-pointer" />
            <span>Ghi nhớ phiên đăng nhập</span>
          </label>
          <span class="text-[11px] text-[#2997ff]">Mã hóa 256-bit</span>
        </div>

        <button type="submit" id="login-btn-submit" 
                class="w-full py-3 rounded-full bg-[#0071e3] hover:bg-[#0077ed] active:scale-[0.98] text-white text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-[#0071e3]/30 flex items-center justify-center gap-2">
          <span>Đăng Nhập Vào Hệ Thống</span>
          <span class="text-sm">➔</span>
        </button>

      </form>

      <!-- Bottom Security Note -->
      <div class="pt-2 border-t border-white/10 text-center text-[10px] text-[#86868b]">
        <span>🛡️ Phiên làm việc được bảo vệ bởi FalconX WebCrypto Token Shield</span>
      </div>

    </div>
  </div>
`;

html = html.replace('</body>', loginModalHtml + '\n</body>');

// 3. Thêm JS Token Interceptor và Logic Đăng Nhập
const authScript = `
    // ==========================================
    // FALCONX TOKEN INTERCEPTOR & WEB AUTH
    // ==========================================
    const AUTH_TOKEN_KEY = 'falconx_auth_token';

    // Monkey-patch window.fetch để tự động truyền token vào mọi request API
    const _originalFetch = window.fetch;
    window.fetch = async function(url, options = {}) {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token && typeof url === 'string' && url.startsWith('/api/') && !url.startsWith('/api/auth/login')) {
        options.headers = options.headers || {};
        if (options.headers instanceof Headers) {
          options.headers.set('Authorization', 'Bearer ' + token);
        } else if (Array.isArray(options.headers)) {
          options.headers.push(['Authorization', 'Bearer ' + token]);
        } else {
          options.headers['Authorization'] = 'Bearer ' + token;
        }
      }
      
      const res = await _originalFetch(url, options);
      if (res.status === 401 && typeof url === 'string' && url.startsWith('/api/') && !url.startsWith('/api/auth/')) {
        showLoginModal();
      }
      return res;
    };

    function showLoginModal() {
      const modal = document.getElementById('login-modal-overlay');
      if (modal) {
        modal.classList.remove('hidden');
        const pwdInput = document.getElementById('login-password');
        if (pwdInput) pwdInput.focus();
      }
    }

    function hideLoginModal() {
      const modal = document.getElementById('login-modal-overlay');
      if (modal) modal.classList.add('hidden');
    }

    async function handleLoginSubmit(event) {
      if (event) event.preventDefault();
      const usernameInput = document.getElementById('login-username');
      const passwordInput = document.getElementById('login-password');
      const errorMsg = document.getElementById('login-error-msg');
      const btn = document.getElementById('login-btn-submit');

      const username = usernameInput ? usernameInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      if (errorMsg) errorMsg.classList.add('hidden');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>Đang xác thực...</span>';
      }

      try {
        const res = await _originalFetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.success && data.token) {
          localStorage.setItem(AUTH_TOKEN_KEY, data.token);
          hideLoginModal();
          // Nạp lại toàn bộ dữ liệu sau khi đăng nhập thành công
          refreshData();
        } else {
          if (errorMsg) {
            errorMsg.textContent = data.error || 'Tài khoản hoặc mật khẩu không chính xác.';
            errorMsg.classList.remove('hidden');
          }
        }
      } catch (err) {
        if (errorMsg) {
          errorMsg.textContent = 'Lỗi kết nối máy chủ: ' + err.message;
          errorMsg.classList.remove('hidden');
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>Đăng Nhập Vào Hệ Thống</span> <span class="text-sm">➔</span>';
        }
      }
    }

    async function checkAuthSession() {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) {
        showLoginModal();
        return;
      }

      try {
        const res = await _originalFetch('/api/auth/verify', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (!data.valid) {
          showLoginModal();
        } else {
          hideLoginModal();
        }
      } catch (e) {
        // Mạng lỗi tạm thời hoặc chưa sẵn sàng
      }
    }

    async function logoutAdmin() {
      if (!confirm('Bạn có chắc chắn muốn đăng xuất khỏi bảng điều khiển?')) return;
      try {
        await _originalFetch('/api/auth/logout', { method: 'POST' });
      } catch {}
      localStorage.removeItem(AUTH_TOKEN_KEY);
      showLoginModal();
    }

    // Tự động kiểm tra phiên đăng nhập ngay khi tải trang
    window.addEventListener('DOMContentLoaded', checkAuthSession);
`;

html = html.replace('function switchTab(tabId) {', authScript + '\n    function switchTab(tabId) {');

fs.writeFileSync(filePath, html, 'utf8');
console.log('Web Authentication successfully integrated into index.html! File size:', html.length);
