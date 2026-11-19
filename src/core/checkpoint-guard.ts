import type { Page } from 'playwright';
import { autoSolveFacebookCaptcha, detectFacebookCaptcha } from './captcha-solver.js';

export interface CheckpointStatus {
  isCheckpoint: boolean;
  type?: 'CHECKPOINT' | 'CAPTCHA' | 'SUSPENDED' | 'TWO_FACTOR' | 'LOGIN_REQUIRED' | 'RATE_LIMITED' | 'ACTION_BLOCKED' | 'OK';
  reason?: string;
  hasCaptcha?: boolean;
}

const CHECKPOINT_PATTERNS = [
  { regex: /checkpoint|confirm your identity|xác minh danh tính/i, type: 'CHECKPOINT' as const, reason: 'Yêu cầu xác minh danh tính Facebook Checkpoint' },
  { regex: /account suspended|tài khoản bị đình chỉ|tài khoản đã bị vô hiệu hóa/i, type: 'SUSPENDED' as const, reason: 'Tài khoản đã bị đình chỉ hoặc vô hiệu hóa' },
  { regex: /two-factor|xác thực 2 yếu tố|mã bảo mật/i, type: 'TWO_FACTOR' as const, reason: 'Cần nhập mã bảo mật 2FA' },
  { regex: /login|đăng nhập|session expired|hết phiên/i, type: 'LOGIN_REQUIRED' as const, reason: 'Chưa đăng nhập Facebook hoặc hết phiên session' },
  { regex: /you’re temporarily blocked|you're temporarily blocked|hạn chế tạm thời|bạn tạm thời bị chặn|hãy thử lại sau/i, type: 'RATE_LIMITED' as const, reason: 'Facebook tạm thời giới hạn tốc độ thao tác (Rate Limit)' },
];

const ACTION_BLOCK_BODY_PATTERNS = [
  /bạn tạm thời bị chặn|you're temporarily blocked|you’re temporarily blocked/i,
  /chúng tôi hạn chế tần suất bạn có thể đăng, bình luận|we limit how often you can post, comment/i,
  /để bảo vệ cộng đồng khỏi spam|to protect our community from spam/i,
  /bạn đã thử quá nhiều lần|you've tried too many times/i,
];

export async function detectCheckpoint(page: Page): Promise<CheckpointStatus> {
  const currentUrl = page.url();

  // 1. Kiểm tra màn hình CAPTCHA ("Confirm that you're human" / "Enter the text from the image")
  try {
    const isCaptchaPage = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return (
        /Confirm that you're human|Enter the text from the image/i.test(text) ||
        /Xác nhận bạn là con người|Nhập các ký tự bạn nhìn thấy trong hình/i.test(text) ||
        /Security Check|Kiểm tra bảo mật/i.test(text) ||
        /Can't read this text\? Hear this code/i.test(text)
      );
    });

    if (isCaptchaPage) {
      return {
        isCheckpoint: true,
        type: 'CAPTCHA',
        reason: 'Facebook yêu cầu giải mã CAPTCHA ("Confirm that you\'re human")',
        hasCaptcha: true,
      };
    }
  } catch {}

  // 2. Kiểm tra URL Checkpoint thực sự
  if (currentUrl.includes('/checkpoint/')) {
    return {
      isCheckpoint: true,
      type: 'CHECKPOINT',
      reason: `Đang ở trang checkpoint: ${currentUrl}`,
    };
  }

  // 3. Kiểm tra xem có cookie đăng nhập c_user trong BrowserContext không
  try {
    const context = page.context();
    const cookies = await context.cookies('https://www.facebook.com');
    const cUser = cookies.find((c) => c.name === 'c_user');
    if (!cUser || !cUser.value) {
      if (currentUrl.includes('/login') || currentUrl.endsWith('/login/')) {
        return {
          isCheckpoint: true,
          type: 'LOGIN_REQUIRED',
          reason: 'Chưa đăng nhập Facebook (không có cookie c_user)',
        };
      }
    }
  } catch {}

  // 4. Chỉ coi là LOGIN_REQUIRED khi đang ở thẳng trang /login/ và tiêu đề có chữ đăng nhập
  if (currentUrl.includes('/login') || currentUrl.includes('/login.php')) {
    return {
      isCheckpoint: true,
      type: 'LOGIN_REQUIRED',
      reason: 'Trình duyệt bị điều hướng về trang đăng nhập /login',
    };
  }

  try {
    const title = await page.title();
    for (const pattern of CHECKPOINT_PATTERNS) {
      // Bỏ qua regex đăng nhập nếu đang ở trang group/bài viết hợp lệ
      if (pattern.type === 'LOGIN_REQUIRED' && !currentUrl.includes('/login')) {
        continue;
      }
      if (pattern.regex.test(title)) {
        return {
          isCheckpoint: true,
          type: pattern.type,
          reason: pattern.reason,
        };
      }
    }
  } catch {
    // Bỏ qua lỗi đọc title
  }

  // Kiểm tra các hộp thoại cảnh báo chặn thao tác / giới hạn tần suất (Anti-Ban Guard)
  try {
    const warningText = await page.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], div[role="alert"], div[aria-live="polite"]'));
      return dialogs.map((d) => (d as HTMLElement).innerText || '').join('\n');
    });
    for (const regex of ACTION_BLOCK_BODY_PATTERNS) {
      if (regex.test(warningText)) {
        return {
          isCheckpoint: true,
          type: 'ACTION_BLOCKED',
          reason: 'Facebook phát hiện thao tác nhanh và hiện cảnh báo giới hạn tần suất. Hệ thống tự động dừng ngay để bảo vệ Nick!',
        };
      }
    }
  } catch {}

  return {
    isCheckpoint: false,
    type: 'OK',
  };
}

/**
 * Kiểm tra an toàn tài khoản trước và sau mỗi thao tác.
 * Nếu phát hiện CAPTCHA -> Tự động kích hoạt module giải CAPTCHA (2Captcha / Gemini / Tesseract) để vượt qua!
 * Nếu phát hiện Checkpoint nguy hiểm / Rate-limit / Action Block -> Ném lỗi dừng khẩn cấp để bảo vệ Nick.
 */
export async function assertAccountSafeOrAbort(page: Page, actionContext = 'Thao tác Facebook', accountName?: string): Promise<void> {
  const status = await detectCheckpoint(page);

  // Xử lý tự động khi gặp CAPTCHA
  if (status.isCheckpoint && status.type === 'CAPTCHA') {
    console.log(`🧩 [Captcha Handler] Bắt gặp CAPTCHA tại "${actionContext}". Đang cố gắng tự động giải...`);
    const solveRes = await autoSolveFacebookCaptcha(page, accountName);
    if (solveRes.solved) {
      console.log(`🎉 [Captcha Handler] Đã vượt qua CAPTCHA thành công (Đáp án: ${solveRes.solution})! Tiếp tục thực thi "${actionContext}".`);
      return;
    } else {
      throw new Error(`🚨 [YÊU CẦU CAPTCHA] Facebook yêu cầu xác minh "Confirm that you're human". Tự động giải chưa thành công (${solveRes.error || 'Cần thao tác thủ công'}).`);
    }
  }

  if (status.isCheckpoint) {
    throw new Error(`🛡️ [CHẾ ĐỘ BẢO VỆ NICK - ${status.type}] Dừng khẩn cấp tại bước "${actionContext}": ${status.reason}`);
  }
}
