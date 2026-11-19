import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { detectFacebookCaptcha, autoSolveFacebookCaptcha } from './captcha-solver.js';
import { isProfileRunning } from './native-chrome-launcher.js';
import { getAllAccounts, getAccountById } from '../db/store.js';

export interface ActiveProfileCaptchaInfo {
  accountId: string;
  accountName: string;
  port: number;
  hasCaptcha: boolean;
  pageUrl?: string;
  captchaImageBase64?: string;
  statusText: string;
}

/**
 * Tìm tất cả các profile Chrome đang chạy có mở cổng CDP (DevToolsActivePort)
 */
export function getRunningProfilePorts(): Array<{ accountId: string; port: number; profileDir: string }> {
  const results: Array<{ accountId: string; port: number; profileDir: string }> = [];

  // 1. Kiểm tra fb-profile mặc định
  const defaultDir = path.resolve(process.cwd(), '.user-data/fb-profile');
  const defaultPortFile = path.join(defaultDir, 'DevToolsActivePort');
  if (fs.existsSync(defaultPortFile)) {
    if (isProfileRunning(defaultDir)) {
      try {
        const port = parseInt(fs.readFileSync(defaultPortFile, 'utf8').split('\n')[0].trim(), 10);
        if (port > 0) {
          results.push({ accountId: 'default', port, profileDir: defaultDir });
        }
      } catch {}
    } else {
      try { fs.unlinkSync(defaultPortFile); } catch {}
    }
  }

  // 2. Kiểm tra từng profile con trong .user-data/profiles
  const profilesDir = path.resolve(process.cwd(), '.user-data/profiles');
  if (fs.existsSync(profilesDir)) {
    const entries = fs.readdirSync(profilesDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const targetDir = path.join(profilesDir, ent.name);
        const portFile = path.join(targetDir, 'DevToolsActivePort');
        if (fs.existsSync(portFile)) {
          if (isProfileRunning(targetDir)) {
            try {
              const port = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0].trim(), 10);
              if (port > 0) {
                results.push({
                  accountId: ent.name.replace(/^acc_/, ''),
                  port,
                  profileDir: targetDir,
                });
              }
            } catch {}
          } else {
            try { fs.unlinkSync(portFile); } catch {}
          }
        }
      }
    }
  }

  return results;
}

/**
 * Quét toàn bộ các profile Chrome đang mở để phát hiện xem có tài khoản nào bị kẹt ở màn hình CAPTCHA
 */
export async function scanAllRunningProfilesCaptcha(): Promise<ActiveProfileCaptchaInfo[]> {
  const running = getRunningProfilePorts();
  const accounts = getAllAccounts();
  const results: ActiveProfileCaptchaInfo[] = [];

  for (const item of running) {
    const acc = accounts.find((a) => a.id === item.accountId || a.id === `acc_${item.accountId}`);
    const accountName = acc ? acc.name : (item.accountId === 'default' ? 'Tài khoản Chính' : `Nick ${item.accountId}`);

    let browser: Browser | null = null;
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${item.port}`, { timeout: 3000 });
      const pages = browser.contexts().flatMap((c) => c.pages());

      let detectedCaptcha = false;
      let targetUrl = '';
      let imgBase64 = '';

      for (const p of pages) {
        const url = p.url();
        if (url.includes('facebook.com') || url.includes('checkpoint')) {
          targetUrl = url;
          const det = await detectFacebookCaptcha(p);
          if (det.isCaptcha && det.imageElement) {
            detectedCaptcha = true;
            try {
              const buf = await det.imageElement.screenshot();
              imgBase64 = `data:image/png;base64,${buf.toString('base64')}`;
            } catch {}
            break;
          }
        }
      }

      results.push({
        accountId: item.accountId,
        accountName,
        port: item.port,
        hasCaptcha: detectedCaptcha,
        pageUrl: targetUrl,
        captchaImageBase64: imgBase64 || undefined,
        statusText: detectedCaptcha ? '🚨 Đang bị kẹt màn hình CAPTCHA Facebook' : 'Đang chạy bình thường',
      });
    } catch (err: any) {
      results.push({
        accountId: item.accountId,
        accountName,
        port: item.port,
        hasCaptcha: false,
        statusText: `Lỗi kết nối DevTools: ${err.message}`,
      });
    }
  }

  return results;
}

/**
 * Mở khóa CAPTCHA cho một tài khoản cụ thể (tự động giải bằng AI / Audio / OCR hoặc dùng mã thủ công)
 */
export async function unlockLiveCaptchaForAccount(
  accountId: string,
  manualCode?: string
): Promise<{ success: boolean; solution?: string; error?: string; finalUrl?: string }> {
  const running = getRunningProfilePorts();
  const target = running.find((r) => r.accountId === accountId || r.accountId === accountId.replace(/^acc_/, ''));

  if (!target) {
    return {
      success: false,
      error: `Không tìm thấy trình duyệt Chrome nào đang chạy cho tài khoản "${accountId}". Hãy mở trình duyệt trước!`,
    };
  }

  let browser: Browser | null = null;
  try {
    console.log(`[CDP Unlocker] Đang kết nối tới Chrome của tài khoản ${accountId} qua cổng ${target.port}...`);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${target.port}`, { timeout: 5000 });
    const pages = browser.contexts().flatMap((c) => c.pages());

    // Tìm tab Facebook Checkpoint
    let captchaPage: Page | null = null;
    for (const p of pages) {
      const u = p.url();
      if (u.includes('checkpoint') || u.includes('facebook.com')) {
        const det = await detectFacebookCaptcha(p);
        if (det.isCaptcha) {
          captchaPage = p;
          break;
        }
      }
    }

    if (!captchaPage) {
      return {
        success: false,
        error: 'Không tìm thấy trang CAPTCHA Facebook nào đang mở trên trình duyệt của tài khoản này.',
      };
    }

    const acc = getAccountById(accountId) || getAccountById(`acc_${accountId}`);
    const accountName = acc ? acc.name : accountId;

    console.log(`[CDP Unlocker] Bắt đầu mở khóa CAPTCHA cho ${accountName} (URL: ${captchaPage.url()})...`);
    const solveRes = await autoSolveFacebookCaptcha(captchaPage, accountName, undefined, manualCode);

    const finalUrl = captchaPage.url();

    return {
      success: solveRes.solved,
      solution: solveRes.solution,
      error: solveRes.error,
      finalUrl,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Lỗi trong quá trình mở khóa: ${err.message}`,
    };
  }
}

/**
 * Tự động mở khóa tất cả các tài khoản đang bị kẹt CAPTCHA
 */
export async function autoUnlockAllLiveCaptchas(): Promise<Array<{ accountId: string; success: boolean; solution?: string; error?: string }>> {
  const scans = await scanAllRunningProfilesCaptcha();
  const stuck = scans.filter((s) => s.hasCaptcha);

  const results: Array<{ accountId: string; success: boolean; solution?: string; error?: string }> = [];

  for (const s of stuck) {
    console.log(`[CDP Unlocker] Đang mở khóa tự động cho ${s.accountName} (${s.accountId})...`);
    const res = await unlockLiveCaptchaForAccount(s.accountId);
    results.push({
      accountId: s.accountId,
      success: res.success,
      solution: res.solution,
      error: res.error,
    });
  }

  return results;
}
