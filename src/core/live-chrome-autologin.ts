import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { getAccountById, saveAccount, type FacebookAccount } from '../db/store.js';
import { loginFacebookWithCredentials } from './facebook-authenticator.js';
import { autoSolveFacebookCaptcha } from './captcha-solver.js';

/**
 * Chờ file DevToolsActivePort xuất hiện khi Chrome khởi động và lấy cổng CDP
 */
export async function waitForDevToolsPort(profileDir: string, maxWaitMs = 12000): Promise<number | null> {
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    if (fs.existsSync(portFile)) {
      try {
        const content = fs.readFileSync(portFile, 'utf8');
        const lines = content.split('\n');
        const port = parseInt(lines[0].trim(), 10);
        if (port > 0) return port;
      } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return null;
}

/**
 * Tự động phát hiện và đăng nhập Facebook trên cửa sổ Chrome vừa mở
 */
export async function autoLoginLiveChromeWindow(
  accountId: string,
  profileDir: string,
  options?: {
    timeoutMs?: number;
    forceLogin?: boolean;
  }
): Promise<{ success: boolean; message?: string; requires2FA?: boolean; error?: string }> {
  const acc = getAccountById(accountId) || getAccountById(`acc_${accountId}`);
  if (!acc) {
    return { success: false, error: `Không tìm thấy tài khoản "${accountId}".` };
  }

  console.log(`🔍 [Live Auto-Login] Đang chờ cổng DevTools của nick "${acc.name}"...`);
  const port = await waitForDevToolsPort(profileDir, options?.timeoutMs || 10000);
  if (!port) {
    return {
      success: false,
      error: `Không tìm thấy cổng DevToolsActivePort cho profile ${acc.name}. Chrome có thể chưa kịp khởi động.`,
    };
  }

  console.log(`🌐 [Live Auto-Login] Đã kết nối DevTools port ${port} của nick "${acc.name}". Đang kiểm tra trạng thái Facebook...`);

  let browser: Browser | null = null;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 6000 });

    // Tìm tab Facebook đang mở
    let fbPage: Page | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const pages = browser.contexts().flatMap((c) => c.pages());
      fbPage = pages.find((p) => p.url().includes('facebook.com')) || null;
      if (fbPage) break;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    if (!fbPage) {
      console.log(`ℹ️ [Live Auto-Login] Không tìm thấy tab Facebook nào đang mở. Đang tạo tab mới...`);
      const ctx = browser.contexts()[0];
      if (ctx) {
        fbPage = await ctx.newPage();
        await fbPage.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
    }

    if (!fbPage) {
      return { success: false, error: 'Không thể truy cập trang Facebook trên trình duyệt.' };
    }

    // Chờ 2 giây để trang render đầy đủ
    await fbPage.waitForTimeout(2000);

    // 1. Kiểm tra xem tài khoản đã đăng nhập sẵn hay chưa (có cookie c_user)
    const context = fbPage.context();
    const cookies = await context.cookies(['https://www.facebook.com']);
    const cUser = cookies.find((c) => c.name === 'c_user');

    if (cUser && cUser.value && !options?.forceLogin) {
      console.log(`🎉 [Live Auto-Login] Nick "${acc.name}" đã đăng nhập sẵn thành công (UID: ${cUser.value})!`);
      // Lưu cookie mới nhất vào DB
      acc.cookies = cookies;
      acc.status = 'live';
      acc.lastActiveAt = new Date().toISOString();
      saveAccount(acc);
      return {
        success: true,
        message: `Nick "${acc.name}" đã có phiên đăng nhập sẵn (UID: ${cUser.value}).`,
      };
    }

    // 2. Kiểm tra xem trang có đang hiển thị Form đăng nhập không
    const isAtLogin = await fbPage.evaluate(() => {
      const bodyText = document.body ? document.body.innerText : '';
      const hasInputs = !!document.querySelector('input[name="email"], input#email, input[name="pass"], input#pass');
      const hasText = /Đăng nhập vào Facebook|Log in to Facebook|Dùng trang cá nhân khác|Tiếp tục dưới tên/i.test(bodyText);
      const isLoginUrl = window.location.href.includes('/login');
      return hasInputs || hasText || isLoginUrl;
    });

    if (!isAtLogin && !options?.forceLogin) {
      console.log(`ℹ️ [Live Auto-Login] Trang Facebook hiện tại không yêu cầu đăng nhập: ${fbPage.url()}`);
      return {
        success: true,
        message: `Trang hiện tại không yêu cầu đăng nhập.`,
      };
    }

    // 3. Tiến hành tự động đăng nhập bằng thông tin đã lưu
    if (!acc.fbPassword) {
      console.warn(`⚠️ [Live Auto-Login] Nick "${acc.name}" chưa lưu mật khẩu Facebook trong hệ thống.`);
      return {
        success: false,
        error: `Nick "${acc.name}" chưa có mật khẩu Facebook lưu trong hệ thống. Vui lòng cập nhật mật khẩu.`,
      };
    }

    const username = acc.fbUsername || acc.uid || acc.id.replace(/^acc_/, '');
    console.log(`🔐 [Live Auto-Login] Đang tự động điền thông tin đăng nhập cho nick "${acc.name}" (${username})...`);

    const loginRes = await loginFacebookWithCredentials(fbPage, {
      username,
      password: acc.fbPassword,
      twoFactorSecret: acc.twoFactorSecret,
    });

    if (loginRes.success) {
      console.log(`🎉 [Live Auto-Login] Tự động đăng nhập Facebook THÀNH CÔNG cho nick "${acc.name}"!`);
      // Lưu cookie mới vào DB
      if (loginRes.cookies && loginRes.cookies.length > 0) {
        acc.cookies = loginRes.cookies;
      }
      acc.status = 'live';
      acc.lastActiveAt = new Date().toISOString();
      saveAccount(acc);

      return {
        success: true,
        message: `Đã tự động đăng nhập Facebook thành công cho "${acc.name}"!`,
      };
    } else {
      console.warn(`⚠️ [Live Auto-Login] Đăng nhập chưa thành công: ${loginRes.error}`);

      // Nếu gặp màn hình CAPTCHA -> Thử mở khóa tự động
      const postCaptcha = await autoSolveFacebookCaptcha(fbPage, acc.name).catch(() => ({ solved: false }));
      if (postCaptcha.solved) {
        return {
          success: true,
          message: `Đã tự động giải CAPTCHA thành công cho "${acc.name}"!`,
        };
      }

      return {
        success: false,
        error: loginRes.error || 'Đăng nhập không thành công',
        requires2FA: loginRes.requires2FA,
      };
    }
  } catch (err: any) {
    console.error(`❌ [Live Auto-Login] Lỗi khi tự động đăng nhập: ${err.message}`);
    return {
      success: false,
      error: `Lỗi kết nối DevTools: ${err.message}`,
    };
  }
}
