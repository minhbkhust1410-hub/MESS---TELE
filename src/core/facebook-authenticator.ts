import { Page, BrowserContext } from 'playwright';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export interface FacebookLoginOptions {
  username: string;
  password: string;
  twoFactorCode?: string;
  twoFactorSecret?: string;
}

export interface FacebookLoginResult {
  success: boolean;
  uid?: string;
  name?: string;
  cookies?: any[];
  error?: string;
  requires2FA?: boolean;
}

/**
 * Giải mã Base32 RFC 4648
 */
export function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = '';
  for (let i = 0; i < cleaned.length; i++) {
    const val = alphabet.indexOf(cleaned[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * Tự động tạo mã 6 số TOTP RFC 6238 từ Secret Key (2FA)
 */
export function generateTOTP(secret: string, timeStep = 30): string | null {
  try {
    const key = base32Decode(secret);
    if (!key || key.length === 0) return null;
    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / timeStep);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(counter), 0);
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(counterBuf);
    const digest = hmac.digest();
    const offset = digest[digest.length - 1] & 0xf;
    const code =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return String(code % 1000000).padStart(6, '0');
  } catch {
    return null;
  }
}

/**
 * Click thông minh hỗ trợ cả Playwright click lẫn DOM dispatchEvent để kích hoạt React handler
 */
async function smartClick(page: Page, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const clicked = await page.evaluate((s) => {
        let el = document.querySelector(s) as HTMLElement;
        if (!el) {
          const allBtns = Array.from(document.querySelectorAll('div[role="button"], button, a[role="button"]'));
          el = allBtns.find(b => {
            const aria = b.getAttribute('aria-label') || '';
            const txt = b.textContent || '';
            return aria.toLowerCase().includes(s.toLowerCase()) || txt.toLowerCase().includes(s.toLowerCase());
          }) as HTMLElement;
        }
        if (el) {
          el.scrollIntoView();
          el.click();
          return true;
        }
        return false;
      }, sel);

      if (clicked) return true;
    } catch {}

    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
        await loc.click({ force: true });
        return true;
      }
    } catch {}
  }
  return false;
}

/**
 * Điền input thông minh hỗ trợ cả Playwright fill lẫn DOM Event dispatch
 */
async function smartFill(page: Page, selector: string, value: string): Promise<boolean> {
  try {
    const loc = page.locator(selector).first();
    if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
      await loc.click({ timeout: 1000 }).catch(() => {});
      await loc.fill(value);
      return true;
    }
  } catch {}

  return await page.evaluate(({ sel, val }) => {
    let input = document.querySelector(sel) as HTMLInputElement;
    if (!input) {
      const inputs = Array.from(document.querySelectorAll('input'));
      input = inputs.find(i => (i.name && i.name.includes(sel)) || (i.type && i.type.includes(sel))) as HTMLInputElement;
    }
    if (input) {
      input.focus();
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }, { sel: selector, val: value }).catch(() => false);
}

/**
 * Tự động đăng nhập Facebook theo dạng chuẩn: Tài khoản (Email/SĐT/UID) + Mật khẩu + 2FA TOTP
 * Hỗ trợ giao diện Facebook: Form thông thường, Account Tile/Chooser, Popup Meta.
 */
export async function loginFacebookWithCredentials(
  page: Page,
  options: FacebookLoginOptions
): Promise<FacebookLoginResult> {
  const { username, password, twoFactorCode, twoFactorSecret } = options;
  const cleanUser = String(username || '').trim();
  const cleanPass = String(password || '').trim();

  if (!cleanPass) {
    return { success: false, error: 'Vui lòng cung cấp mật khẩu Facebook.' };
  }

  console.log(`🔐 [FB Authenticator] Bắt đầu tự động đăng nhập Facebook... (Tài khoản: ${cleanUser ? cleanUser.slice(0, 4) + '***' : 'Nick hiện tại'})`);

  try {
    // 1. Kiểm tra URL hiện tại
    const currentUrl = page.url();
    if (!currentUrl.includes('facebook.com') || currentUrl.includes('about') || currentUrl.includes('help')) {
      await page.goto('https://www.facebook.com/login.php', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2000);
    }

    // Đóng các banner/popup che khuất nếu có
    await smartClick(page, [
      'div[aria-label="Đóng"]',
      'div[aria-label="Close"]',
      'button[title="Đóng"]',
      'div[role="button"]:has-text("Để sau")'
    ]);

    // 2. Kiểm tra xem trang có đang ở màn hình Chọn tài khoản (Account Chooser Tile) hay không
    const isTileScreen = await page.evaluate(() => {
      const hasContinue = Array.from(document.querySelectorAll('div[role="button"]')).some(b => 
        (b.getAttribute('aria-label') || '').includes('Tiếp tục') || (b.textContent || '').trim() === 'Tiếp tục'
      );
      const hasOther = Array.from(document.querySelectorAll('div[role="button"]')).some(b => 
        (b.getAttribute('aria-label') || '').includes('Dùng trang cá nhân khác') || (b.textContent || '').includes('Dùng trang cá nhân khác')
      );
      return hasContinue || hasOther;
    });

    if (isTileScreen) {
      console.log('📌 [FB Authenticator] Phát hiện giao diện Thẻ tài khoản Facebook...');
      const isSpecificOtherUser = cleanUser && !cleanUser.toLowerCase().includes('eco trang') && !cleanUser.toLowerCase().includes('trang');

      if (isSpecificOtherUser) {
        console.log('🔘 [FB Authenticator] Chuyển sang form nhập tài khoản khác...');
        await smartClick(page, ['Dùng trang cá nhân khác', '[aria-label*="Dùng trang cá nhân khác"]']);
        await page.waitForTimeout(2000);
      } else {
        console.log('🔘 [FB Authenticator] Bấm Tiếp tục tài khoản hiện tại...');
        await smartClick(page, ['Tiếp tục Eco Trang', 'Tiếp tục', '[aria-label*="Tiếp tục"]']);
        await page.waitForTimeout(2000);

        const hasMetaPassPopup = await page.evaluate(() => {
          return !!document.querySelector('input[type="password"], input[name="pass"]');
        });

        if (!hasMetaPassPopup) {
          console.log('🔘 [FB Authenticator] Mở form chuẩn qua "Dùng trang cá nhân khác"...');
          await smartClick(page, ['Dùng trang cá nhân khác', '[aria-label*="Dùng trang cá nhân khác"]']);
          await page.waitForTimeout(2000);
        }
      }
    }

    // 3. Điền tài khoản (nếu form có ô email/tài khoản)
    const hasEmailField = await page.evaluate(() => {
      return !!document.querySelector('input[name="email"], input#email, input[type="text"]:not([name="approvals_code"])');
    });

    if (hasEmailField && cleanUser) {
      console.log('✍️ [FB Authenticator] Đang điền tài khoản / email...');
      await smartFill(page, 'input[name="email"], input#email, input[type="text"]', cleanUser);
      await page.waitForTimeout(300);
    }

    // 4. Điền mật khẩu
    console.log('✍️ [FB Authenticator] Đang điền mật khẩu...');
    const filledPass = await smartFill(page, 'input[name="pass"], input#pass, input[type="password"]', cleanPass);
    if (!filledPass) {
      return {
        success: false,
        error: 'Không tìm thấy ô nhập mật khẩu trên trang Facebook. Bạn có thể mở nút "Màn Hình FB" để xem.',
      };
    }
    await page.waitForTimeout(300);

    // 5. Bấm nút Đăng nhập
    console.log('🚀 [FB Authenticator] Bấm nút Đăng nhập...');
    const clickedSubmit = await smartClick(page, [
      'div[role="button"][aria-label="Đăng nhập"]',
      'button[name="login"]',
      'button[type="submit"]',
      'div[role="button"]:has-text("Đăng nhập")',
      'input[type="submit"]'
    ]);

    if (!clickedSubmit) {
      await page.keyboard.press('Enter');
    }

    // 6. Chờ Facebook xử lý
    console.log('⏳ [FB Authenticator] Đang chờ xác nhận phiên đăng nhập từ Facebook...');
    await page.waitForTimeout(6000);

    // 7. Kiểm tra thông báo lỗi từ Facebook
    const pageText = await page.evaluate(() => document.body.innerText || '').catch(() => '');
    if (/mật khẩu bạn đã nhập không chính xác|the password you entered is incorrect|sai mật khẩu|wrong password/i.test(pageText)) {
      return { success: false, error: 'Mật khẩu Facebook không chính xác. Vui lòng kiểm tra lại mật khẩu.' };
    }

    if (/tài khoản của bạn đã bị vô hiệu hóa|account disabled|tài khoản bị khóa/i.test(pageText)) {
      return { success: false, error: 'Tài khoản Facebook đã bị tạm khóa hoặc vô hiệu hóa.' };
    }

    // 8. Tự động xử lý 2FA (Mã xác nhận bảo mật 2 lớp)
    const twoFactorInput = page.locator('input[name="approvals_code"], input[autocomplete="one-time-code"]').first();
    const is2FaPresent = await twoFactorInput.isVisible({ timeout: 2500 }).catch(() => false);

    if (is2FaPresent) {
      let codeToFill = twoFactorCode ? twoFactorCode.trim() : '';
      if (!codeToFill && twoFactorSecret) {
        codeToFill = generateTOTP(twoFactorSecret) || '';
        if (codeToFill) {
          console.log(`🔑 [FB Authenticator] Tự động tính toán mã 2FA TOTP từ Secret: ${codeToFill}`);
        }
      }

      if (codeToFill) {
        console.log(`🔑 [FB Authenticator] Đang điền mã xác nhận 2FA (${codeToFill})...`);
        await twoFactorInput.fill(codeToFill);
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(6000);

        // Xử lý bước "Lưu trình duyệt này" (Save browser) nếu có
        await smartClick(page, [
          'div[role="button"]:has-text("Lưu trình duyệt")',
          'div[role="button"]:has-text("Tiếp tục")',
          'button:has-text("Tiếp tục")',
          '#checkpointSubmitButton'
        ]);
        await page.waitForTimeout(3000);
      } else {
        return {
          success: false,
          requires2FA: true,
          error: 'Tài khoản yêu cầu mã 2FA. Vui lòng nhập mã 2FA 6 số hoặc gắn Secret Key để hệ thống tự động giải mã!',
        };
      }
    }

    // 9. Kiểm tra cookies đăng nhập thành công
    const context = page.context();
    for (let attempt = 0; attempt < 5; attempt++) {
      const cookies = await context.cookies(['https://www.facebook.com']);
      const cUser = cookies.find((c) => c.name === 'c_user');
      if (cUser && cUser.value) {
        console.log(`🎉 [FB Authenticator] ĐĂNG NHẬP FACEBOOK THÀNH CÔNG! UID: ${cUser.value}`);
        return {
          success: true,
          uid: cUser.value,
          cookies,
        };
      }
      await page.waitForTimeout(1500);
    }

    // Kiểm tra title / url nếu c_user chưa sync kịp
    const destUrl = page.url();
    if (destUrl.includes('facebook.com') && !destUrl.includes('login') && !destUrl.includes('checkpoint')) {
      const cookies = await context.cookies(['https://www.facebook.com']);
      const cUser = cookies.find((c) => c.name === 'c_user');
      return {
        success: true,
        uid: cUser?.value || 'verified_session',
        cookies,
      };
    }

    return {
      success: false,
      error: 'Facebook chưa xác nhận đăng nhập. Vui lòng kiểm tra lại tài khoản & mật khẩu hoặc mở nút "Mở Chrome FB".',
    };
  } catch (err: any) {
    console.error('❌ [FB Authenticator] Lỗi ngoại lệ khi đăng nhập:', err.message);
    return { success: false, error: err.message };
  }
}
