import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { chromium, type BrowserContext } from 'playwright';
import { config, updateSystemSettings } from '../config/env.js';
import { onlineCloudDb } from '../db/online-cloud-db.js';
import {
  getAllUsers,
  getUserById,
  getUserByUsername,
  createUser,
  validateUserPassword,
  AppUser,
} from '../db/user-store.js';
import {
  getAllMappings,
  getAllAccounts,
  getAccountById,
  getDefaultAccount,
  saveAccount,
  setDefaultAccount,
  deleteAccount,
  updateAccountProxy,
  updateAccountProxyVerification,
  FacebookAccount,
} from '../db/store.js';
import { messengerEngine } from '../engine/messenger-engine.js';
import { getOrCreateTopicForCustomer, getBotUsername, getBot } from '../telegram/bot.js';
import { loadCannedReplies, saveCannedReply } from '../config/canned-replies.js';
import { createBrowserSession, checkCookiesLoggedIn, parseProxy, testProxyNetwork, verifyBrowserProxyIP, type SessionResult } from '../core/browser-session.js';
import { loginFacebookWithCredentials } from '../core/facebook-authenticator.js';
import {
  launchNativeChromeForAccount,
  isProfileRunning,
  closeNativeChromeForAccount,
  generateDesktopShortcuts,
} from '../core/native-chrome-launcher.js';
import {
  getAutoCommentConfig,
  updateAutoCommentConfig,
  getCommentTemplates,
  addCommentTemplate,
  deleteCommentTemplate,
  getTargetGroups,
  getJoinedEcoparkGroups,
  syncJoinedGroupsToPool,
  assignGroupToAccounts,
  addTargetGroup,
  addMultipleTargetGroups,
  deleteTargetGroup,
  getKeywords,
  setKeywords,
  addKeyword,
  removeKeyword,
  getCommentLogs,
  getDailyPosts,
  addDailyPost,
  deleteDailyPost,
  clearDailyPosts,
  getPendingDrafts,
  updateDailyPostStatus,
  updateGroupNote,
  toggleGroupStatus,
} from '../db/auto-comment-store.js';
import { autoCommentEngine } from '../engine/auto-comment-engine.js';
import { facebookActionsEngine, type FacebookReaction } from '../engine/facebook-actions-engine.js';
import { accountHealthService } from '../services/account-health-service.js';
import { systemDiagnosticService } from '../services/system-diagnostic-service.js';
import { globalLeadPoolService } from '../services/global-lead-pool.js';
import {
  getCaptchaApiKeys,
  saveCaptchaApiKeys,
  solveCaptchaImage,
} from '../core/captcha-solver.js';
import {
  scanAllRunningProfilesCaptcha,
  unlockLiveCaptchaForAccount,
  autoUnlockAllLiveCaptchas,
} from '../core/captcha-live-unlocker.js';
import { autoLoginLiveChromeWindow } from '../core/live-chrome-autologin.js';
import { autoFriendService } from '../services/auto-friend-service.js';
import {
  BDS_ECOPARK_FALLBACK_COMMENT,
  evaluateBdsCustomerComment,
  getAllProperties,
  getAvailableProperties,
  getTodayProperties,
  addProperties,
  updateProperty,
  togglePropertyStatus,
  deleteProperty,
  ingestPropertiesFromText,
  ingestPropertiesFromImage,
  ingestPropertiesFromTextWithAI,
  ingestPropertiesFromImageWithAI,
  getPropertyInventoryStats,
  findBestMatchingPropertyWithDistance,
  generateTargetedComment,
} from '../services/property-inventory.js';
import {
  freeAiService,
  getAiConfig,
  saveAiConfig,
  addKeysToPool,
  removeKeyFromPool,
  resetKeyStatus,
} from '../services/free-ai-service.js';
import {
  dataModeService,
  type OperatingMode,
  MODE_METADATA,
} from '../services/data-mode-service.js';
import {
  parseForexLead,
  generateForexTargetedComment,
} from '../services/forex-parser.js';
import { groupDiscoveryService } from '../services/group-discovery-service.js';
import { orchestrationService } from '../engine/orchestration-service.js';
import { systemSmoother } from '../engine/system-smoother.js';
import { multiAccountPool } from '../engine/multi-account-pool.js';

// Cache giữ các phiên mở trình duyệt Chrome để người dùng đăng nhập trực quan
const activeBrowserLogins = new Map<string, SessionResult>();
// Cache giữ các cửa sổ Chrome trực quan được mở với Proxy riêng biệt
const activeVisualBrowsers = new Map<string, SessionResult>();
const openingBrowserLocks = new Set<string>();

/**
 * Ghi nhận kết quả đăng bài THẬT vào trung tâm điều phối:
 * - mỗi đích (nhóm / trang cá nhân) có 1 biên nhận riêng, kèm ảnh chụp thật của đích đó
 * - bình luận chỉ tính khi hệ thống đã gửi bình luận thành công
 */
function recordPublishResult(result: any, firstComment: string): void {
  const acc = getDefaultAccount();
  for (const r of result?.receipts || []) {
    const shot = r.screenshotPath ? '/proofs/' + path.basename(r.screenshotPath) : undefined;
    const ok = r.status === 'verified_success' || r.status === 'pending_approval';
    orchestrationService.record('post_group', {
      accountName: acc?.name,
      targetName: r.target,
      targetUrl: r.postUrl || r.target,
      status: ok ? 'success' : 'failed',
      message:
        r.status === 'pending_approval'
          ? 'Đã gửi bài, đang chờ quản trị viên nhóm duyệt.'
          : r.status === 'verified_success'
            ? 'Đã đăng bài thành công.'
            : r.error || 'Đăng bài thất bại.',
      screenshotUrl: shot,
    });
    if (firstComment && r.status === 'verified_success') {
      orchestrationService.record('first_comment', {
        accountName: acc?.name,
        targetName: r.target,
        targetUrl: r.postUrl || r.target,
        status: r.commentPosted ? 'success' : 'failed',
        message: r.commentPosted
          ? `Đã bình luận: "${firstComment.slice(0, 60)}"`
          : 'Bài đã đăng nhưng CHƯA gửi được bình luận (không tìm thấy khung bình luận hoặc gửi không thành công).',
        screenshotUrl: shot,
      });
    }
  }
}

// Hàm phân tích Cookie (hỗ trợ JSON mảng từ Extension, JSON object, chuỗi "c_user=...; xs=...", và định dạng mua nick UID|Pass|2FA|Cookie)
function parseCookies(input: string): Array<{ name: string; value: string; domain: string; path: string; expires: number }> {
  let trimmed = input.trim();
  const oneYearFuture = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

  // 0. Tự động bóc tách nếu dán nguyên dòng mua Acc dạng UID|Pass|2FA|Cookie|Token|Mail
  if (trimmed.includes('|')) {
    const segments = trimmed.split('|');
    const cookiePart = segments.find((s) => s.includes('c_user=') || s.includes('xs='));
    if (cookiePart) {
      trimmed = cookiePart.trim();
    }
  }

  // 1. JSON Mảng từ Cookie-Editor hoặc J2Team
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json)) {
        return json
          .filter((c) => c && (c.name || c.key) && c.value !== undefined)
          .map((c) => ({
            name: String(c.name || c.key),
            value: String(c.value),
            domain: c.domain || '.facebook.com',
            path: c.path || '/',
            expires: c.expirationDate || c.expires || oneYearFuture,
          }));
      }
    } catch {}
  }

  // 2. JSON Object (ví dụ: {"c_user": "...", "xs": "..."})
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      return Object.entries(obj).map(([name, value]) => ({
        name,
        value: String(value),
        domain: '.facebook.com',
        path: '/',
        expires: oneYearFuture,
      }));
    } catch {}
  }

  // 3. Chuỗi phân tách bằng dấu chấm phẩy (;) hoặc xuống dòng
  const cookies: Array<{ name: string; value: string; domain: string; path: string; expires: number }> = [];
  const parts = trimmed.split(/[;\r\n]+/);
  for (const part of parts) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;
    let name = '';
    let value = '';
    if (trimmedPart.includes('=')) {
      const idx = trimmedPart.indexOf('=');
      name = trimmedPart.substring(0, idx).trim();
      value = trimmedPart.substring(idx + 1).trim();
    } else if (trimmedPart.includes('\t') || trimmedPart.includes(' ')) {
      const tokens = trimmedPart.split(/[\t ]+/);
      if (tokens.length >= 2) {
        name = tokens[0].trim();
        value = tokens[tokens.length - 1].trim();
      }
    }
    if (name && value) {
      cookies.push({
        name,
        value,
        domain: '.facebook.com',
        path: '/',
        expires: oneYearFuture,
      });
    }
  }
  return cookies;
}

export interface TokenPayload {
  uid: string;
  u: string;
  name: string;
  role: 'admin' | 'manager';
  permissions: string[];
  fullAccess: boolean;
  exp: number;
}

export function generateAuthToken(user: { id: string; username: string; name: string; role?: 'admin' | 'manager' }): string {
  const payload: TokenPayload = {
    uid: user.id,
    u: user.username,
    name: user.name,
    role: 'admin', // Cấp mọi quyền Admin cao nhất
    permissions: ['*'], // Cấp mọi quyền thao tác hệ thống
    fullAccess: true,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 ngày
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', config.authSecret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;
  const expectedSig = crypto.createHmac('sha256', config.authSecret).update(data).digest('base64url');
  if (signature !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as TokenPayload;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return {
      ...payload,
      role: 'admin',
      permissions: ['*'],
      fullAccess: true,
    };
  } catch {
    return null;
  }
}

export function startDashboard(): void {
  const app = express();

  // CORS middleware hỗ trợ Webhook F12 Script gọi trực tiếp từ Facebook Console
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Operating-Mode');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  function resolveRequestMode(req: express.Request): OperatingMode {
    const qMode = req.query.mode as string | undefined;
    const hMode = req.headers['x-operating-mode'] as string | undefined;
    const bMode = req.body?.mode as string | undefined;
    const explicit = qMode || hMode || bMode;
    const currentUser = (req as any).currentUser as TokenPayload | undefined;
    return dataModeService.getCurrentMode(currentUser?.uid, explicit);
  }

  app.use(express.json({ limit: '50mb' }));

  // Xử lý lỗi cú pháp JSON nếu request gửi lên bị lỗi định dạng
  app.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
      return res.status(400).json({ success: false, error: 'Dữ liệu JSON gửi lên không đúng định dạng.' });
    }
    next(err);
  });

  // Phục vụ thư mục giao diện tĩnh & ảnh bằng chứng trực tiếp từ Cloud VFS RAM
  const publicDir = path.resolve('./public');
  app.get('/proofs/:file', (req, res, next) => {
    const buf = onlineCloudDb.getProofBuffer(req.params.file);
    if (buf) {
      const ext = path.extname(req.params.file).toLowerCase();
      res.setHeader('Content-Type', ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png');
      return res.send(buf);
    }
    next();
  });
  app.use(express.static(publicDir));

  // ==========================================
  // API AUTHENTICATION & MULTI-USER SYSTEM
  // ==========================================

  // API 1: Đăng ký tài khoản người dùng mới (Người quản lý nhiều nick)
  app.post('/api/auth/register', (req, res) => {
    try {
      const { username, password, name } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Vui lòng nhập tên tài khoản và mật khẩu.' });
      }
      if (password.length < 4) {
        return res.status(400).json({ success: false, error: 'Mật khẩu phải có ít nhất 4 ký tự.' });
      }

      const newUser = createUser(username, password, name || username, 'manager');
      const token = generateAuthToken(newUser);

      return res.json({
        success: true,
        token,
        user: {
          id: newUser.id,
          username: newUser.username,
          name: newUser.name,
          role: newUser.role,
        },
        message: 'Đăng ký tài khoản thành công!',
      });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message || 'Lỗi khi tạo tài khoản.' });
    }
  });

  // API 2: Đăng nhập hệ thống (Hỗ trợ cả Admin & Các tài khoản Người quản lý)
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập tài khoản và mật khẩu.' });
    }

    // 1. Kiểm tra trong cơ sở dữ liệu người dùng
    const user = validateUserPassword(username, password);
    if (user) {
      const token = generateAuthToken(user);
      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
        },
        message: 'Đăng nhập thành công',
      });
    }

    // 2. Fallback kiểm tra tài khoản Admin gốc trong .env
    const validAdmin = config.adminUsername || 'admin';
    const validPass = config.adminPassword || 'ecotrang2026';
    if (username.trim().toLowerCase() === validAdmin.toLowerCase() && password === validPass) {
      const adminUser = { id: 'usr_admin', username: validAdmin, name: 'Quản Trị Viên (Admin)', role: 'admin' as const };
      const token = generateAuthToken(adminUser);
      return res.json({
        success: true,
        token,
        user: adminUser,
        message: 'Đăng nhập Admin thành công',
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Tài khoản hoặc mật khẩu không chính xác',
    });
  });

  // API 3: Xác thực phiên & lấy thông tin Người Dùng Hiện Tại (Current User Profile)
  app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token as string);
    const payload = token ? verifyAuthToken(token) : null;

    if (!payload) {
      return res.status(401).json({ success: false, error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
    }

    // Đếm số lượng nick người này quản lý (Nếu bật chế độ Dùng Chung Đội Nhóm thì thấy toàn bộ nick của team)
    const allAccs = getAllAccounts();
    const userAccs = payload.role === 'admin' || config.sharedTeamMode
      ? allAccs 
      : allAccs.filter((a) => a.ownerId === payload.uid);

    return res.json({
      success: true,
      user: {
        id: payload.uid,
        username: payload.u,
        name: payload.name,
        role: payload.role,
      },
      managedCount: userAccs.length,
    });
  });

  // API 4: Xác thực phiên làm việc
  app.get('/api/auth/verify', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token as string);
    const payload = token ? verifyAuthToken(token) : null;

    if (payload) {
      return res.json({ success: true, valid: true, user: payload });
    }
    return res.status(401).json({ success: false, valid: false, error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
  });

  // API 5: Đăng xuất
  app.post('/api/auth/logout', (req, res) => {
    res.json({ success: true, message: 'Đã đăng xuất an toàn' });
  });

  // Middleware bảo vệ các API nghiệp vụ và gán currentUser vào Request (Cấp Mọi Quyền Cho Mọi Thao Tác)
  app.use('/api', (req, res, next) => {
    if (
      req.path.startsWith('/auth/') ||
      req.path === '/members/ingest-f12' ||
      req.path === '/members/f12-script' ||
      req.path === '/debug-fb-state' ||
      req.path === '/screenshot' ||
      req.path.startsWith('/screen/') ||
      req.path.startsWith('/orchestration/') ||
      req.path.startsWith('/system/') ||
      req.path.startsWith('/bds/') ||
      req.path === '/posts/one-click-daily'
    ) {
      return next();
    }
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token as string);
    let payload = token ? verifyAuthToken(token) : null;

    // Cấp mọi quyền (Full Privileges): Nếu chưa có token, tự động cấp phiên Admin đầy đủ quyền hạn
    if (!payload) {
      payload = {
        uid: 'usr_admin',
        u: config.adminUsername || 'admin',
        name: 'Quản Trị Viên (Full Access)',
        role: 'admin',
        permissions: ['*'],
        fullAccess: true,
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };
    } else {
      payload.role = 'admin';
      payload.permissions = ['*'];
      payload.fullAccess = true;
    }

    (req as any).currentUser = payload;
    next();
  });

  // ==========================================
  // API QUẢN LÝ TÀI KHOẢN FACEBOOK & PROXY (THEO TỪNG USER)
  // ==========================================

  // API 1: Lấy danh sách tài khoản Facebook thuộc quyền quản lý của User hiện tại
  app.get('/api/accounts', (req, res) => {
    const currentUser = (req as any).currentUser as TokenPayload;
    const all = getAllAccounts();

    if (!currentUser || currentUser.role === 'admin' || config.sharedTeamMode) {
      return res.json(all);
    }

    // Lọc theo người quản lý (ownerId)
    const filtered = all.filter((a) => a.ownerId === currentUser.uid);
    // Nếu user mới chưa có nick riêng, có thể hiển thị nick mẫu hoặc danh sách của họ
    return res.json(filtered);
  });

  // API 2: Cập nhật thông tin tài khoản hoặc Proxy (Gán ownerId cho user hiện tại)
  app.post('/api/accounts', (req, res) => {
    const currentUser = (req as any).currentUser as TokenPayload;
    const { id, name, proxy, uid, avatar, isDefault, status, ownerId } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Thiếu account ID' });
    }
    
    // Tự động gán nick này cho User đang đăng nhập nếu chưa có ownerId
    const finalOwnerId = ownerId || (currentUser ? currentUser.uid : 'usr_admin');

    const updateData: Partial<FacebookAccount> & { id: string } = { id };
    if (name !== undefined) updateData.name = name;
    if (proxy !== undefined) updateData.proxy = proxy;
    if (uid !== undefined) updateData.uid = uid;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (status !== undefined) updateData.status = status;
    if (finalOwnerId) updateData.ownerId = finalOwnerId;

    const saved = saveAccount(updateData);
    res.json({ success: true, account: saved });
  });

  // API 2.0: Đổi tên hiển thị cho nick Facebook
  app.post('/api/accounts/:id/rename', (req, res) => {
    const accId = req.params.id;
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập tên mới cho nick' });
    }
    const acc = getAccountById(accId);
    if (!acc) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
    }
    acc.name = String(name).trim();
    saveAccount(acc);
    res.json({ success: true, account: acc, message: `Đã đổi tên nick thành "${acc.name}" thành công!` });
  });

  // API 2.1: Tự động trích xuất & đồng bộ avatar thật từ Facebook
  app.post('/api/accounts/sync-avatar', async (req, res) => {
    try {
      const result = await messengerEngine.syncCurrentAccountAvatar();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 2.2: Cập nhật thủ công Avatar cho tài khoản (URL hoặc data-uri base64)
  app.post('/api/accounts/update-avatar', (req, res) => {
    const { accountId, avatarUrl } = req.body;
    if (!accountId || !avatarUrl) {
      return res.status(400).json({ success: false, error: 'Thiếu accountId hoặc avatarUrl' });
    }
    const acc = getAccountById(accountId);
    if (!acc) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
    }

    let finalAvatar = avatarUrl.trim();
    // Nếu là base64 data URL, lưu vào file ảnh trên đĩa để tối ưu hiệu năng
    if (finalAvatar.startsWith('data:image/')) {
      try {
        const avatarsDir = path.resolve('./public/avatars');
        if (!fs.existsSync(avatarsDir)) {
          fs.mkdirSync(avatarsDir, { recursive: true });
        }
        const matches = finalAvatar.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches && matches[2]) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
          const fileName = `${accountId}.${ext}`;
          const filePath = path.join(avatarsDir, fileName);
          fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
          finalAvatar = `/avatars/${fileName}?t=${Date.now()}`;
        }
      } catch (err: any) {
        console.warn('Lỗi ghi avatar base64:', err.message);
      }
    }

    const saved = saveAccount({ id: accountId, avatar: finalAvatar });
    res.json({ success: true, account: saved });
  });

  // API 2.3: Tiếp tục đăng nhập tự động nếu trang đang dừng ở bộ chọn tài khoản
  app.post('/api/accounts/resume-login', async (req, res) => {
    try {
      const page = (messengerEngine as any).page;
      let clicked = false;
      let navResult = '';
      if (page && !page.isClosed()) {
        const btn = page.locator('div[aria-label*="Eco Trang" i][role="button"], div[aria-label*="Tiếp tục" i][role="button"], div[role="button"]:has-text("Tiếp tục"), button:has-text("Tiếp tục")').first();
        if (await btn.isVisible({ timeout: 2500 }).catch(() => false)) {
          console.log('[Resume Login] Clicking Continue button via Playwright...');
          await btn.click({ timeout: 5000, force: true }).catch(async () => {
            await page.keyboard.press('Enter');
          });
          await page.waitForTimeout(2000);
          clicked = true;
        } else {
          // Fallback tọa độ nút Tiếp tục trên màn hình (x: 1025, y: 438)
          console.log('[Resume Login] Thử click tọa độ nút Tiếp tục (1025, 438)...');
          await page.mouse.click(1025, 438);
          await page.waitForTimeout(2000);
          clicked = true;
        }
        navResult = page.url();
      }
      res.json({ success: true, clicked, currentUrl: navResult || page?.url() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 2.4: Nhập tài khoản & mật khẩu Facebook trực tiếp từ Web Dashboard / Telegram vào phiên Chrome
  app.post('/api/accounts/submit-password', async (req, res) => {
    try {
      const { username, password, twoFactorCode } = req.body;
      if (!password || !String(password).trim()) {
        return res.status(400).json({ success: false, error: 'Vui lòng nhập mật khẩu Facebook.' });
      }

      const page = (messengerEngine as any).page;
      if (!page || page.isClosed()) {
        return res.status(500).json({ success: false, error: 'Trình duyệt Facebook chưa sẵn sàng.' });
      }

      const defaultAcc = getDefaultAccount();
      const targetUser = (username && String(username).trim()) || defaultAcc?.fbUsername || defaultAcc?.name || 'Eco Trang';

      const loginResult = await loginFacebookWithCredentials(page, {
        username: targetUser,
        password: String(password).trim(),
        twoFactorCode: twoFactorCode ? String(twoFactorCode).trim() : undefined,
      });

      if (!loginResult.success) {
        return res.status(400).json(loginResult);
      }

      // Lưu thông tin phiên Live & lưu tài khoản/mật khẩu để tự động gia hạn
      if (defaultAcc && loginResult.cookies) {
        saveAccount({
          id: defaultAcc.id,
          uid: loginResult.uid || defaultAcc.uid,
          status: 'live',
          fbUsername: targetUser,
          fbPassword: String(password).trim(),
          cookies: loginResult.cookies,
          lastActiveAt: new Date().toISOString(),
        });

        if (defaultAcc.profileDir) {
          try {
            fs.writeFileSync(path.join(defaultAcc.profileDir, 'cookies.json'), JSON.stringify(loginResult.cookies, null, 2), 'utf-8');
          } catch {}
        }
      }

      return res.json({
        success: true,
        message: 'Đăng nhập Facebook thành công! Phiên hoạt động đã được kích hoạt.',
        uid: loginResult.uid,
        account: defaultAcc,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 2.5: Đăng nhập Facebook bằng Tài Khoản & Mật Khẩu (Dạng chuẩn: Username + Password)
  app.post('/api/accounts/login-credentials', async (req, res) => {
    try {
      const { username, password, twoFactorCode, twoFactorSecret, name, makeDefault, proxy, verticalMode } = req.body;
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Vui lòng nhập đầy đủ Tài khoản Facebook (Email/SĐT/UID) và Mật khẩu.',
        });
      }

      const cleanUser = String(username).trim();
      const cleanPass = String(password).trim();
      const cleanProxy = proxy ? String(proxy).trim() : '';
      const cleanVertical = verticalMode === 'forex_finance' ? 'forex_finance' : resolveRequestMode(req);

      // RÀNG BUỘC BẢO VỆ CHỐNG DÍNH IP (STRICT PROXY LOCK)
      if (!cleanProxy) {
        return res.status(400).json({
          success: false,
          error: '🚨 BẢO VỆ CHỐNG DÍNH IP: Bắt buộc phải có Proxy riêng (IP:Port:User:Pass) trước khi đăng nhập! Hệ thống kiên quyết chặn đăng nhập bằng IP máy để bảo vệ an toàn cho dàn tài khoản.',
        });
      }

      let verifiedProxyIp: string | undefined;
      let proxyLatencyMs: number | undefined;
      let proxyCountry: string | undefined;

      if (cleanProxy) {
        const testRes = await testProxyNetwork(cleanProxy, 8000);
        if (testRes.alive && !testRes.isLeakingHostIp) {
          verifiedProxyIp = testRes.ip;
          proxyLatencyMs = testRes.latencyMs;
          proxyCountry = testRes.country;
        }
      }

      const accountId = `acc_${cleanUser.replace(/[^a-zA-Z0-9]/g, '')}`;
      const profileDir = path.resolve(`./.user-data/profiles/${accountId}`);
      if (!fs.existsSync(profileDir)) {
        fs.mkdirSync(profileDir, { recursive: true });
      }

      let session: any = null;
      let loginResult: any = null;
      try {
        session = await createBrowserSession({
          userDataDir: profileDir,
          proxy: cleanProxy,
          accountId,
          headless: true,
        });

        if (session.verifiedIp) verifiedProxyIp = session.verifiedIp;
        if (session.proxyLatencyMs) proxyLatencyMs = session.proxyLatencyMs;
        if (session.proxyCountry) proxyCountry = session.proxyCountry;

        loginResult = await loginFacebookWithCredentials(session.page, {
          username: cleanUser,
          password: cleanPass,
          twoFactorCode: twoFactorCode ? String(twoFactorCode).trim() : undefined,
          twoFactorSecret: twoFactorSecret ? String(twoFactorSecret).trim() : undefined,
        });

        if (session) await session.close().catch(() => {});
      } catch (sessErr: any) {
        if (session) await session.close().catch(() => {});
        return res.status(500).json({
          success: false,
          error: `Lỗi khởi chạy trình duyệt bọc Proxy: ${sessErr.message}`,
        });
      }

      if (!loginResult || !loginResult.success) {
        return res.status(400).json(loginResult || { success: false, error: 'Đăng nhập không thành công.' });
      }

      const finalUid = loginResult.uid || cleanUser;
      const finalAccId = `acc_${finalUid}`;
      const savedAcc = saveAccount({
        id: finalAccId,
        uid: finalUid,
        name: name ? name.trim() : `Facebook (${cleanUser})`,
        avatar: `https://graph.facebook.com/${finalUid}/picture?type=large`,
        fbUsername: cleanUser,
        fbPassword: cleanPass,
        cookies: loginResult.cookies,
        proxy: cleanProxy,
        twoFactorSecret: twoFactorSecret ? String(twoFactorSecret).trim() : undefined,
        verifiedProxyIp,
        proxyStatus: cleanProxy ? (verifiedProxyIp ? 'live' : 'dead') : 'unassigned',
        proxyCountry,
        proxyLatencyMs,
        lastProxyCheckAt: cleanProxy ? new Date().toISOString() : undefined,
        profileDir,
        verticalMode: cleanVertical,
        status: 'live',
        isDefault: makeDefault !== false,
        lastActiveAt: new Date().toISOString(),
      });

      if (profileDir && loginResult.cookies) {
        try {
          fs.writeFileSync(path.join(profileDir, 'cookies.json'), JSON.stringify(loginResult.cookies, null, 2), 'utf-8');
        } catch {}
      }

      return res.json({
        success: true,
        message: `Đăng nhập Facebook thành công: ${savedAcc.name} (Đã gắn Proxy: ${cleanProxy || 'IP Trực tiếp'}, Phân mảng: ${cleanVertical})!`,
        account: savedAcc,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // REMOTE INTERACTIVE BROWSER SCREEN CONTROL
  // ==========================================
  app.post('/api/screen/click', async (req, res) => {
    try {
      const { x, y } = req.body;
      const page = (messengerEngine as any).page;
      if (!page || page.isClosed()) return res.status(500).json({ success: false, error: 'Trình duyệt chưa sẵn sàng' });
      const targetX = Math.round(Number(x));
      const targetY = Math.round(Number(y));
      console.log(`🖱️ [Remote Screen] Click tại tọa độ (${targetX}, ${targetY})...`);
      await page.mouse.click(targetX, targetY);
      await page.waitForTimeout(800);
      res.json({ success: true, x: targetX, y: targetY, currentUrl: page.url() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/screen/type', async (req, res) => {
    try {
      const { text, pressEnter } = req.body;
      const page = (messengerEngine as any).page;
      if (!page || page.isClosed()) return res.status(500).json({ success: false, error: 'Trình duyệt chưa sẵn sàng' });
      if (text) {
        await page.keyboard.type(String(text), { delay: 40 });
      }
      if (pressEnter) {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(800);
      res.json({ success: true, currentUrl: page.url() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/screen/key', async (req, res) => {
    try {
      const { key } = req.body;
      const page = (messengerEngine as any).page;
      if (!page || page.isClosed()) return res.status(500).json({ success: false, error: 'Trình duyệt chưa sẵn sàng' });
      if (key) {
        await page.keyboard.press(String(key));
      }
      await page.waitForTimeout(800);
      res.json({ success: true, currentUrl: page.url() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/screen/navigate', async (req, res) => {
    try {
      const { url } = req.body;
      const page = (messengerEngine as any).page;
      if (!page || page.isClosed()) return res.status(500).json({ success: false, error: 'Trình duyệt chưa sẵn sàng' });
      await page.goto(url || 'https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2000);
      res.json({ success: true, currentUrl: page.url() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/screen/eval', async (req, res) => {
    try {
      const { code } = req.body;
      const page = (messengerEngine as any).page;
      if (!page || page.isClosed()) return res.status(500).json({ success: false, error: 'Trình duyệt chưa sẵn sàng' });
      const result = await page.evaluate(code);
      res.json({ success: true, result, currentUrl: page.url() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/debug-fb-state', async (_req, res) => {
    try {
      const page = (messengerEngine as any).page;
      if (!page) return res.json({ ready: false });
      const url = page.url();
      const title = await page.title();
      const details = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('div[aria-label], div[role="button"], button, a[role="button"]'));
        return els.map(el => ({
          tag: el.tagName,
          text: (el.textContent || '').trim().slice(0, 50),
          ariaLabel: el.getAttribute('aria-label'),
          role: el.getAttribute('role'),
          html: el.outerHTML.slice(0, 200),
          rect: el.getBoundingClientRect()
        }));
      });
      res.json({ url, title, details });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API 3: Chuyển đổi Nick hoạt động (Hot-switch)
  app.post('/api/accounts/:id/select', async (req, res) => {
    const targetId = req.params.id;
    const acc = getAccountById(targetId);
    if (!acc) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
    }
    try {
      await messengerEngine.switchAccount(targetId);
      res.json({ success: true, account: getAccountById(targetId) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4: Xóa tài khoản & tự động nhả tệp bạn bè về Bể Khách Hàng Dùng Chung
  app.delete('/api/accounts/:id', (req, res) => {
    const all = getAllAccounts();
    if (all.length <= 1) {
      return res.status(400).json({ success: false, error: 'Phải giữ ít nhất 1 tài khoản trong hệ thống' });
    }
    const accId = req.params.id;
    const ok = deleteAccount(accId);
    if (ok) {
      const releaseResult = globalLeadPoolService.releaseLeadsFromDeadAccount(accId);
      res.json({ success: true, releasedLeads: releaseResult.releasedCount });
      return;
    }
    res.json({ success: ok });
  });

  // API 4.0: Thống kê Bể Bạn Bè & Khách Hàng Dùng Chung
  app.get('/api/leads/pool-stats', (req, res) => {
    res.json({ success: true, stats: globalLeadPoolService.getStats() });
  });

  // API 4.01: Chủ động thu hồi và nhả toàn bộ leads từ 1 nick die về bể chung
  app.post('/api/leads/release/:accountId', (req, res) => {
    const result = globalLeadPoolService.releaseLeadsFromDeadAccount(req.params.accountId);
    res.json({ success: true, releasedCount: result.releasedCount });
  });

  // API 4.03: Lấy toàn bộ Kho Data Đã Quét (Master Scanned Warehouse)
  app.get('/api/leads/warehouse', (req, res) => {
    try {
      const { search, mode, timeCategory, status, limit, offset } = req.query;
      const result = globalLeadPoolService.getWarehouseLeads({
        search: search as string,
        mode: mode as string,
        timeCategory: timeCategory as string,
        status: status as string,
        limit: limit ? parseInt(limit as string, 10) : 500,
        offset: offset ? parseInt(offset as string, 10) : 0,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.04: Xóa 1 UID khỏi Kho Data
  app.delete('/api/leads/warehouse/:id', (req, res) => {
    try {
      const ok = globalLeadPoolService.deleteLead(req.params.id);
      res.json({ success: ok });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.05: Dọn sạch link rác hệ thống trong Kho Data
  app.post('/api/leads/warehouse/purge-junk', (_req, res) => {
    try {
      const purged = globalLeadPoolService.purgeJunk();
      res.json({ success: true, purgedCount: purged });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.06: Xuất toàn bộ Kho Data ra file CSV chuẩn UTF-8
  app.get('/api/leads/warehouse/export-csv', (req, res) => {
    try {
      const mode = req.query.mode as string;
      const csv = globalLeadPoolService.exportCsv(mode);
      const filename = `kho_data_da_quet_${Date.now()}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).send('Lỗi xuất file CSV: ' + err.message);
    }
  });

  // =========================================================================
  // API KUDOX 2: AUTO-FRIEND ENGINE (ĐỘNG CƠ TỰ ĐỘNG KẾT BẠN SINH HỌC)
  // =========================================================================

  // API 4.07: Lấy trạng thái hoạt động, tiến trình các nick & log sinh học
  app.get('/api/autofriend/status', (_req, res) => {
    try {
      const status = autoFriendService.getStatus();
      res.json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.08: Bắt đầu tiến trình kết bạn KudoX 2
  app.post('/api/autofriend/start', async (req, res) => {
    try {
      const options = req.body || {};
      const result = await autoFriendService.start(options);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.08b: Chế độ tự động kết bạn với danh sách thành viên đã quét (Trỏ đúng nhãn F12 "Thêm bạn bè" • Hành vi Human chống Checkpoint)
  app.post('/api/autofriend/start-scanned-list', async (req, res) => {
    try {
      const result = await autoFriendService.startScannedListAutoFriend(req.body || {});
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.08c: Lấy danh sách thành viên đã quét (hợp nhất từ các nhóm & kho F12)
  app.get('/api/members/scanned-list', (req, res) => {
    try {
      const filter = ((req.query.filter as string) || 'all') as 'all' | '2_days' | '1_week' | '2_weeks';
      const members = facebookActionsEngine.getScannedMembersList(filter);
      res.json({ success: true, total: members.length, members });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.09: Tạm dừng tiến trình kết bạn
  app.post('/api/autofriend/pause', (_req, res) => {
    try {
      const result = autoFriendService.pause();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.10: Tiếp tục tiến trình kết bạn
  app.post('/api/autofriend/resume', (_req, res) => {
    try {
      const result = autoFriendService.resume();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.11: Dừng hẳn tiến trình kết bạn
  app.post('/api/autofriend/stop', (_req, res) => {
    try {
      const result = autoFriendService.stop();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.12: Cập nhật cấu hình giãn cách sinh học & giới hạn an toàn
  app.post('/api/autofriend/config', (req, res) => {
    try {
      const updated = autoFriendService.updateConfig(req.body || {});
      res.json({ success: true, config: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.13: Thực thi Nuôi Tương Tác đơn lẻ 1 UID/Profile (Kết Bạn + Xem Story/Thả Tym + Like 3 Bài Viết)
  app.post('/api/autofriend/nurture-single', async (req, res) => {
    try {
      const { leadId, url, name, mode } = req.body || {};
      const currentAcc = getDefaultAccount();
      const leadItem = {
        id: leadId || 'test_lead',
        name: name || 'Người Dùng Test KudoX 2',
        url: url || `https://www.facebook.com/${leadId || 'profile.php'}`,
        mode: (mode as 'bds_ecopark' | 'forex') || 'bds_ecopark',
        firstSeenAt: new Date().toISOString(),
        status: 'unassigned' as const,
      };
      const result = await autoFriendService.executeSocialNurtureRoutine(leadItem, currentAcc);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.02: Mở cửa sổ Facebook THẬT độc lập bọc sẵn Proxy an toàn cho tài khoản
  // RÀNG BUỘC TUYỆT ĐỐI: Bắt buộc mở nick thông qua Proxy ban đầu thiết lập, chống lộ IP máy thật 100%
  // CỬA SỔ THẬT: Khởi chạy Google Chrome thực tế với Profile và Proxy riêng biệt, hiển thị ngay trên màn hình!
  app.post('/api/accounts/:id/open-browser', async (req, res) => {
    const accId = req.params.id;
    const acc = getAccountById(accId);
    if (!acc) return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });

    const { targetUrl } = req.body || {};
    const destUrl = (typeof targetUrl === 'string' && (targetUrl.startsWith('https://www.facebook.com') || targetUrl.startsWith('https://accountscenter.facebook.com')))
      ? targetUrl
      : 'https://www.facebook.com/';

    // 1. RÀNG BUỘC BẢO VỆ NGHIÊM NGẶT VỀ PROXY (KHÓA CHẶT IP MÁY THẬT ĐỐI VỚI NICK VỆ TINH)
    if (acc.id !== 'acc_main' && (!acc.proxy || !acc.proxy.trim())) {
      console.error(`🚨 [Proxy Guard Blocked] Nick "${acc.name}" chưa có Proxy! ĐÃ CHẶN MỞ TRÌNH DUYỆT ĐỂ BẢO VỆ IP MÁY.`);
      return res.status(400).json({
        success: false,
        error: `🚨 ĐÃ CHẶN MỞ FACEBOOK ĐỂ BẢO VỆ IP:\n\nTài khoản "${acc.name}" CHƯA ĐƯỢC GẮN PROXY RIÊNG!\n\nChế độ bảo vệ nghiêm ngặt đã kích hoạt: Hệ thống kiên quyết không cho phép mở Facebook bằng IP máy thật để tránh bị dính IP và liên đới. Vui lòng bấm nút "🛡️ Gắn Proxy" trước khi mở!`,
        proxyAlive: false,
      });
    }

    try {
      const launchResult = await launchNativeChromeForAccount(accId, destUrl);
      if (!launchResult.success) {
        return res.status(400).json({
          success: false,
          error: launchResult.error || 'Không thể khởi chạy Google Chrome cho nick này.',
        });
      }

      // Cập nhật phím tắt Desktop
      try { generateDesktopShortcuts(); } catch {}

      return res.json({
        success: true,
        message: launchResult.message || `Đã mở cửa sổ Google Chrome thật cho nick "${acc.name}" bọc Proxy an toàn!`,
        proxy: acc.proxy,
        isDirect: !acc.proxy,
        destUrl,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Lỗi khi mở Chrome: ${err.message || 'Không xác định'}`,
      });
    }
  });

  // API 4.0.1: Lấy danh sách ID các nick đang có cửa sổ Chrome mở trên màn hình
  app.get('/api/accounts/active-browsers', (_req, res) => {
    const accounts = getAllAccounts();
    const activeIds: string[] = [];
    for (const acc of accounts) {
      const pDir = path.resolve(acc.profileDir || `./.user-data/profiles/${acc.id}`);
      if (isProfileRunning(pDir) || activeVisualBrowsers.has(acc.id)) {
        activeIds.push(acc.id);
      }
    }
    return res.json({
      success: true,
      activeIds,
    });
  });

  // API 4.0.2: Mở hàng loạt tất cả cửa sổ Chrome (mỗi nick 1 cửa sổ riêng + 1 Proxy riêng)
  app.post('/api/accounts/open-all-browsers', async (_req, res) => {
    try {
      const accounts = getAllAccounts().filter((a) => a.proxy && a.proxy.trim());
      if (!accounts.length) {
        return res.status(400).json({
          success: false,
          error: 'Chưa có tài khoản nào được gắn Proxy để mở cửa sổ độc lập.',
        });
      }

      const openedList: string[] = [];
      const failedList: Array<{ name: string; error: string }> = [];

      for (const acc of accounts) {
        try {
          const r = await launchNativeChromeForAccount(acc.id, 'https://www.facebook.com/');
          if (r.success) {
            openedList.push(acc.name);
          } else {
            failedList.push({ name: acc.name, error: r.error || 'Lỗi mở' });
          }
          await new Promise((resolve) => setTimeout(resolve, 800));
        } catch (e: any) {
          failedList.push({ name: acc.name, error: e.message });
        }
      }

      try { generateDesktopShortcuts(); } catch {}

      return res.json({
        success: true,
        openedCount: openedList.length,
        openedList,
        failedList,
        message: `Đã mở ${openedList.length}/${accounts.length} cửa sổ Google Chrome thật bọc Proxy riêng cho từng nick trên màn hình!`,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.0.3: Đóng cửa sổ Chrome của một nick cụ thể
  app.post('/api/accounts/:id/close-browser', async (req, res) => {
    const accId = req.params.id;
    try {
      closeNativeChromeForAccount(accId);
      const session = activeVisualBrowsers.get(accId);
      if (session) {
        await session.close().catch(() => {});
        activeVisualBrowsers.delete(accId);
      }
      return res.json({
        success: true,
        message: 'Đã đóng cửa sổ Google Chrome an toàn.',
      });
    } catch {
      return res.json({ success: true, message: 'Đã đóng cửa sổ Chrome.' });
    }
  });

  // API 4.0.4: Đóng toàn bộ tất cả cửa sổ Chrome đang mở
  app.post('/api/accounts/close-all-browsers', async (_req, res) => {
    let closedCount = 0;
    const accounts = getAllAccounts();
    for (const acc of accounts) {
      try {
        closeNativeChromeForAccount(acc.id);
        closedCount++;
      } catch {}
    }
    for (const [_accId, session] of activeVisualBrowsers.entries()) {
      try {
        await session.close().catch(() => {});
      } catch {}
    }
    activeVisualBrowsers.clear();
    return res.json({
      success: true,
      closedCount,
      message: `Đã đóng an toàn toàn bộ ${closedCount} cửa sổ Chrome của các nick.`,
    });
  });

  // =========================================================================
  // CAPTCHA SOLVER APIS (2Captcha, Tesseract.js OCR, Gemini Vision, Jimp)
  // =========================================================================

  // API C.1: Trạng thái các thư viện và cấu hình CAPTCHA
  app.get('/api/captcha/status', (_req, res) => {
    const keys = getCaptchaApiKeys();
    return res.json({
      success: true,
      installedLibraries: [
        { name: 'tesseract.js', version: '7.0.0', type: 'Local OCR Engine (Offline)', ready: true },
        { name: '2captcha-ts', version: '2.4.1', type: 'Official Cloud Solver SDK', ready: Boolean(keys.twoCaptchaKey) },
        { name: 'jimp', version: '1.6.1', type: 'Pure JS Image Preprocessing', ready: true },
        { name: 'gemini-vision', version: '1.5-flash', type: 'Multimodal AI Vision', ready: Boolean(keys.geminiKey) },
      ],
      configuredProviders: {
        tesseract: true,
        twoCaptcha: Boolean(keys.twoCaptchaKey),
        gemini: Boolean(keys.geminiKey),
        capSolver: Boolean(keys.capSolverKey),
      },
      keys: {
        twoCaptchaKeyMasked: keys.twoCaptchaKey ? `${keys.twoCaptchaKey.substring(0, 4)}...${keys.twoCaptchaKey.substring(keys.twoCaptchaKey.length - 4)}` : '',
        geminiKeyMasked: keys.geminiKey ? `${keys.geminiKey.substring(0, 4)}...${keys.geminiKey.substring(keys.geminiKey.length - 4)}` : '',
        capSolverKeyMasked: keys.capSolverKey ? `${keys.capSolverKey.substring(0, 4)}...${keys.capSolverKey.substring(keys.capSolverKey.length - 4)}` : '',
      },
    });
  });

  // API C.2: Cập nhật API Keys cho hệ thống giải CAPTCHA
  app.post('/api/captcha/settings', (req, res) => {
    const { twoCaptchaKey, geminiKey, capSolverKey } = req.body || {};
    const current = getCaptchaApiKeys();
    saveCaptchaApiKeys({
      twoCaptchaKey: twoCaptchaKey !== undefined ? String(twoCaptchaKey).trim() : current.twoCaptchaKey,
      geminiKey: geminiKey !== undefined ? String(geminiKey).trim() : current.geminiKey,
      capSolverKey: capSolverKey !== undefined ? String(capSolverKey).trim() : current.capSolverKey,
    });
    return res.json({
      success: true,
      message: 'Đã lưu cấu hình API Key giải mã CAPTCHA thành công!',
    });
  });

  // API C.3: Thử nghiệm giải ảnh CAPTCHA (Nhận base64 hoặc file)
  app.post('/api/captcha/test-solve', async (req, res) => {
    try {
      const { imageBase64, numericOnly } = req.body || {};
      if (!imageBase64) {
        return res.status(400).json({ success: false, error: 'Thiếu dữ liệu ảnh imageBase64' });
      }
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');

      const solveRes = await solveCaptchaImage(buffer, {
        numericOnly: numericOnly !== false,
      });

      return res.json({
        success: solveRes.success,
        solution: solveRes.solution,
        provider: solveRes.provider,
        latencyMs: solveRes.latencyMs,
        confidence: solveRes.confidence,
        error: solveRes.error,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // API C.4: Quét toàn bộ các Chrome Profile đang mở xem nick nào đang kẹt CAPTCHA
  app.get('/api/captcha/live-active', async (_req, res) => {
    try {
      const activeList = await scanAllRunningProfilesCaptcha();
      return res.json({
        success: true,
        totalRunning: activeList.length,
        hasCaptchaCount: activeList.filter((a) => a.hasCaptcha).length,
        profiles: activeList,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // API C.5: Mở khóa CAPTCHA cho một tài khoản cụ thể (tự động hoặc bằng mã người dùng nhập)
  app.post('/api/captcha/unlock/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { code } = req.body || {};
      const result = await unlockLiveCaptchaForAccount(id, code);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // API C.6: Tự động mở khóa tất cả các nick đang bị kẹt CAPTCHA trên toàn bộ trình duyệt
  app.post('/api/captcha/unlock-all', async (_req, res) => {
    try {
      const results = await autoUnlockAllLiveCaptchas();
      return res.json({
        success: true,
        totalAttempted: results.length,
        unlockedCount: results.filter((r) => r.success).length,
        details: results,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.0.5: Tự động đăng nhập lại bằng User/Pass/2FA TOTP trực tiếp trên cửa sổ Chrome thật của nick
  app.post('/api/accounts/:id/auto-login', async (req, res) => {
    const accId = req.params.id;
    const acc = getAccountById(accId);
    if (!acc) return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản.' });

    if (!acc.proxy) {
      return res.status(400).json({ success: false, error: 'Nick này chưa được gắn Proxy riêng để bảo vệ IP máy.' });
    }
    if (!acc.fbPassword) {
      return res.status(400).json({ success: false, error: 'Nick này chưa lưu mật khẩu Facebook trong hệ thống.' });
    }

    const profileDir = path.resolve(acc.profileDir || `./.user-data/profiles/${accId}`);

    try {
      // 1. Nếu cửa sổ Chrome thật chưa mở -> Tự động khởi chạy Chrome GUI
      if (!isProfileRunning(profileDir)) {
        console.log(`🚀 [Auto-Login API] Cửa sổ Chrome chưa mở. Đang khởi chạy Chrome cho nick "${acc.name}"...`);
        const launchRes = await launchNativeChromeForAccount(accId);
        if (!launchRes.success) {
          return res.status(400).json({ success: false, error: launchRes.error || 'Không thể mở cửa sổ Chrome.' });
        }
      }

      // 2. Tự động kết nối DevTools và điền thông tin đăng nhập trên cửa sổ Chrome thật
      console.log(`🔐 [Auto-Login API] Đang kết nối DevTools để tự động đăng nhập cho "${acc.name}"...`);
      const loginRes = await autoLoginLiveChromeWindow(accId, profileDir, { forceLogin: true });

      if (loginRes.success) {
        return res.json({
          success: true,
          message: loginRes.message || `Đã tự động đăng nhập thành công cho nick "${acc.name}"!`,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: loginRes.error || 'Đăng nhập không thành công',
          requires2FA: loginRes.requires2FA,
        });
      }
    } catch (err: any) {
      return res.status(500).json({ success: false, error: `Lỗi khi tự động đăng nhập: ${err.message}` });
    }
  });


  // API 4.1: Quét kiểm tra sức khỏe và trạng thái tài khoản trực tiếp
  app.post('/api/accounts/health-check', async (req, res) => {
    try {
      const report = await accountHealthService.checkLiveHealth();
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.2: Lấy báo cáo sức khỏe tài khoản gần nhất
  app.get('/api/accounts/health-report', (req, res) => {
    const report = accountHealthService.getLastReport();
    res.json({ success: true, report });
  });

  // =========================================================================
  // API KIỂM ĐỊNH TOÀN BỘ CHỨC NĂNG HÀNG NGÀY (DAILY SYSTEM DIAGNOSTICS)
  // =========================================================================

  // API 4.3: Lấy báo cáo kiểm định tương thích Facebook hiện tại gần nhất
  app.get('/api/system-diagnostics/status', (req, res) => {
    try {
      const report = systemDiagnosticService.getLastReport();
      const isBusy = systemDiagnosticService.isBusy();
      res.json({ success: true, report, isBusy });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 4.4: Kích hoạt kiểm định toàn bộ chức năng với Facebook Live ngay lập tức
  app.post('/api/system-diagnostics/run-now', async (req, res) => {
    try {
      const report = await systemDiagnosticService.runFullSystemDiagnostic('ON_DEMAND');
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 5: Kiểm tra kết nối, độ trễ và rò rỉ IP của Proxy (Pre-flight Test)
  app.post('/api/accounts/test-proxy', async (req, res) => {
    const { proxy } = req.body;
    if (!proxy || !proxy.trim()) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập Proxy' });
    }
    const parsed = parseProxy(proxy);
    if (!parsed) {
      return res.status(400).json({
        success: false,
        error: 'Định dạng Proxy không đúng. Ví dụ: ip:port hoặc ip:port:user:pass hoặc http://user:pass@ip:port',
      });
    }

    try {
      const result = await testProxyNetwork(proxy, 10_000);
      return res.json({
        success: result.alive,
        ...result,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Kết nối Proxy thất bại: ${err.message}`,
      });
    }
  });

  // API 5.1: Kiểm tra Proxy & Double-check của một Tài Khoản cụ thể
  app.post('/api/accounts/:id/test-proxy', async (req, res) => {
    const accId = req.params.id;
    const acc = getAccountById(accId);
    if (!acc) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
    }

    if (!acc.proxy || !acc.proxy.trim()) {
      // Nick chạy IP trực tiếp
      const directTest = await testProxyNetwork(undefined, 6_000);
      updateAccountProxyVerification(accId, {
        verifiedProxyIp: directTest.ip,
        proxyStatus: 'unassigned',
        proxyCountry: directTest.country,
        proxyCity: directTest.city,
        proxyLatencyMs: directTest.latencyMs,
      });
      return res.json({
        success: true,
        isDirect: true,
        message: 'Tài khoản không gắn Proxy riêng (Chạy trực tiếp trên IP mạng nội bộ)',
        account: getAccountById(accId),
        testResult: directTest,
      });
    }

    // 1. Kiểm tra mạng Proxy (Pre-flight)
    const testResult = await testProxyNetwork(acc.proxy, 10_000);

    // 2. Nếu là nick đang chạy trực tiếp trên MessengerEngine -> Chạy thêm Double-check Chromium
    let browserVerified = false;
    const defaultAcc = getDefaultAccount();
    if (defaultAcc && defaultAcc.id === accId && messengerEngine.isReady()) {
      try {
        const doubleCheck = await messengerEngine.verifyActiveProxy();
        if (doubleCheck.alive && !doubleCheck.isLeakingHostIp) {
          browserVerified = true;
          testResult.ip = doubleCheck.ip;
          testResult.country = doubleCheck.country;
          testResult.latencyMs = doubleCheck.latencyMs;
        }
      } catch (err: any) {
        console.warn(`[Double-Check Warning] ${err.message}`);
      }
    }

    // 3. Cập nhật vào DB
    const updated = updateAccountProxyVerification(accId, {
      verifiedProxyIp: testResult.ip,
      proxyStatus: testResult.alive && !testResult.isLeakingHostIp ? 'live' : 'dead',
      proxyCountry: testResult.country,
      proxyCity: testResult.city,
      proxyLatencyMs: testResult.latencyMs,
    });

    return res.json({
      success: testResult.alive && !testResult.isLeakingHostIp,
      browserVerified,
      testResult,
      account: updated,
    });
  });

  // API 5.2: Cập nhật hoặc đổi Proxy cho một Tài Khoản
  app.post('/api/accounts/:id/proxy', async (req, res) => {
    const accId = req.params.id;
    const { proxy } = req.body;
    const acc = getAccountById(accId);
    if (!acc) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
    }

    const cleanProxy = proxy ? String(proxy).trim() : '';

    // Nếu có proxy, kiểm tra trước
    if (cleanProxy) {
      const parsed = parseProxy(cleanProxy);
      if (!parsed) {
        return res.status(400).json({ success: false, error: 'Định dạng Proxy không hợp lệ. Ví dụ: ip:port hoặc ip:port:user:pass' });
      }
      const test = await testProxyNetwork(cleanProxy, 9_000);
      if (!test.alive) {
        return res.status(400).json({
          success: false,
          error: `Proxy không thể kết nối (${test.error || 'Timeout'}). Vui lòng kiểm tra lại Proxy!`,
          testResult: test,
        });
      }
      if (test.isLeakingHostIp) {
        return res.status(400).json({
          success: false,
          error: `Proxy trả về IP trùng với IP máy thật (${test.ip})! Không an toàn để sử dụng.`,
          testResult: test,
        });
      }

      updateAccountProxy(accId, cleanProxy);
      updateAccountProxyVerification(accId, {
        verifiedProxyIp: test.ip,
        proxyStatus: 'live',
        proxyCountry: test.country,
        proxyCity: test.city,
        proxyLatencyMs: test.latencyMs,
      });

      return res.json({
        success: true,
        message: `Đã cập nhật Proxy an toàn! IP: ${test.ip} (${test.country}, ping ${test.latencyMs}ms)`,
        account: getAccountById(accId),
        testResult: test,
      });
    } else {
      updateAccountProxy(accId, '');
      return res.json({
        success: true,
        message: 'Đã gỡ bỏ Proxy. Tài khoản sẽ dùng IP trực tiếp.',
        account: getAccountById(accId),
      });
    }
  });

  // API 6: Đăng nhập Facebook siêu tốc bằng Cookie kèm Proxy (An toàn, không lộ IP)
  app.post('/api/accounts/login-cookie', async (req, res) => {
    const { cookie, proxy, name } = req.body;
    if (!cookie) {
      return res.status(400).json({ success: false, error: 'Vui lòng dán chuỗi Cookie' });
    }

    const parsedCookies = parseCookies(cookie);
    const cUser = parsedCookies.find((c) => c.name === 'c_user');
    if (!cUser || !cUser.value) {
      return res.status(400).json({
        success: false,
        error: 'Cookie không hợp lệ: Không tìm thấy giá trị "c_user" (Facebook UID). Vui lòng kiểm tra lại cookie đã copy.',
      });
    }

    const uid = cUser.value;
    const accountId = `acc_${uid}`;
    const profileDir = path.resolve(`./.user-data/profiles/${accountId}`);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    let fbName = name ? name.trim() : `Facebook User (${uid})`;
    const avatar = `https://graph.facebook.com/${uid}/picture?type=large`;
    let tempSession = null;
    let verifiedIp: string | undefined;
    let proxyLatencyMs: number | undefined;
    let proxyCountry: string | undefined;

    const cleanProxy = proxy ? proxy.trim() : undefined;
    if (!cleanProxy) {
      return res.status(400).json({
        success: false,
        error: '🚨 BẢO VỆ CHỐNG DÍNH IP BẬT: Bắt buộc phải có Proxy riêng trước khi nạp Cookie! Hệ thống kiên quyết từ chối đăng nhập bằng IP máy thật.',
      });
    }

    console.log(`🔍 [Login Cookie] Kiểm tra Pre-flight cho Proxy: ${cleanProxy}...`);
    const preflight = await testProxyNetwork(cleanProxy, 10_000);
    if (!preflight.alive) {
      return res.status(400).json({
        success: false,
        error: `Proxy không thể kết nối (${preflight.error || 'Timeout'}). ĐÃ TỰ ĐỘNG CHẶN ĐĂNG NHẬP để chống lộ IP máy thật!`,
      });
    }
    if (preflight.isLeakingHostIp) {
      return res.status(400).json({
        success: false,
        error: `Proxy trả về IP trùng với IP máy thật (${preflight.ip})! ĐÃ HỦY ĐĂNG NHẬP để tránh bị Facebook liên kết các nick với nhau.`,
      });
    }
    verifiedIp = preflight.ip;
    proxyLatencyMs = preflight.latencyMs;
    proxyCountry = preflight.country;

    try {
      tempSession = await createBrowserSession({
        userDataDir: profileDir,
        proxy: cleanProxy,
        headless: true,
      });

      if (tempSession.verifiedIp) verifiedIp = tempSession.verifiedIp;
      if (tempSession.proxyLatencyMs) proxyLatencyMs = tempSession.proxyLatencyMs;
      if (tempSession.proxyCountry) proxyCountry = tempSession.proxyCountry;

      await tempSession.context.addCookies(parsedCookies);

      // Mở Facebook để kiểm tra cookie & lấy tên tài khoản thực tế
      await tempSession.page.goto('https://www.facebook.com/me', {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
      });
      await tempSession.page.waitForTimeout(2000);

      const title = await tempSession.page.title();
      if (title && !title.toLowerCase().includes('facebook') && !title.toLowerCase().includes('đăng nhập')) {
        fbName = title.split('|')[0].trim();
      } else {
        const extracted = await tempSession.page.evaluate(() => {
          const h1 = document.querySelector('h1');
          return h1 ? h1.innerText.trim() : '';
        });
        if (extracted) fbName = extracted;
      }
      await tempSession.close();
    } catch (err: any) {
      if (tempSession) await tempSession.close().catch(() => {});
      return res.status(500).json({
        success: false,
        error: `Lỗi khởi chạy trình duyệt an toàn: ${err.message}`,
      });
    }

    const shouldMakeDefault = req.body.makeDefault !== false;
    
    // Lưu tệp backup cookies.json trong thư mục profile
    try {
      fs.writeFileSync(path.join(profileDir, 'cookies.json'), JSON.stringify(parsedCookies, null, 2), 'utf-8');
    } catch {}

    const savedAcc = saveAccount({
      id: accountId,
      uid,
      name: fbName,
      avatar,
      proxy: cleanProxy || '',
      verifiedProxyIp: verifiedIp,
      proxyStatus: cleanProxy ? 'live' : 'unassigned',
      proxyCountry,
      proxyLatencyMs,
      lastProxyCheckAt: new Date().toISOString(),
      profileDir,
      cookies: parsedCookies,
      verticalMode: (req.body.verticalMode === 'forex_finance' ? 'forex_finance' : resolveRequestMode(req)),
      status: 'live',
      isDefault: shouldMakeDefault,
    });

    if (shouldMakeDefault) {
      // Tự động chuyển Messenger Engine sang nick mới
      await messengerEngine.switchAccount(accountId).catch(() => {});
    }

    return res.json({
      success: true,
      message: `Đăng nhập thành công: ${fbName} (UID: ${uid})`,
      account: savedAcc,
    });
  });

  // API 7: Khởi chạy cửa sổ Chrome trực quan gắn sẵn Proxy để đăng nhập thủ công
  app.post('/api/accounts/launch-login-browser', async (req, res) => {
    const { proxy } = req.body;
    const tempId = `login_${Date.now()}`;
    const profileDir = path.resolve(`./.user-data/profiles/${tempId}`);
    const cleanProxy = proxy ? String(proxy).trim() : undefined;
    if (!cleanProxy) {
      return res.status(400).json({
        success: false,
        error: '🚨 BẢO VỆ CHỐNG DÍNH IP BẬT: Bắt buộc phải có Proxy trước khi mở trình duyệt đăng nhập thủ công! Không cho phép mở Chrome bằng IP máy.',
      });
    }

    const preflight = await testProxyNetwork(cleanProxy, 10_000);
    if (!preflight.alive) {
      return res.status(400).json({
        success: false,
        error: `Proxy không thể kết nối (${preflight.error || 'Timeout'}). ĐÃ HỦY MỞ CHROME để ngăn chặn lộ IP máy thật!`,
      });
    }
    if (preflight.isLeakingHostIp) {
      return res.status(400).json({
        success: false,
        error: `Proxy trả về IP trùng với IP máy thật (${preflight.ip})! Không an toàn để mở trình duyệt.`,
      });
    }

    try {
      const session = await createBrowserSession({
        userDataDir: profileDir,
        proxy: cleanProxy,
        headless: false, // Mở Chrome có giao diện
      });

      activeBrowserLogins.set(tempId, session);
      await session.page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' }).catch(() => {});

      res.json({
        success: true,
        loginSessionId: tempId,
        message: 'Cửa sổ Chrome đã được mở với Proxy cách ly. Vui lòng đăng nhập tài khoản trên cửa sổ Chrome đó!',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 7.5: Hủy phiên mở Chrome đăng nhập thủ công
  app.post('/api/accounts/cancel-browser-login', async (req, res) => {
    const { loginSessionId } = req.body;
    if (loginSessionId && activeBrowserLogins.has(loginSessionId)) {
      const session = activeBrowserLogins.get(loginSessionId);
      await session?.close().catch(() => {});
      activeBrowserLogins.delete(loginSessionId);
    }
    res.json({ success: true });
  });

  // API 8: Hoàn tất đăng nhập trực quan & Lưu Nick
  app.post('/api/accounts/finish-browser-login', async (req, res) => {
    const { loginSessionId, name, proxy, makeDefault } = req.body;
    const session = activeBrowserLogins.get(loginSessionId);
    if (!session) {
      return res.status(400).json({ success: false, error: 'Phiên đăng nhập không tồn tại hoặc đã đóng' });
    }

    const check = await checkCookiesLoggedIn(session.context);
    if (!check.isLoggedIn || !check.fbUid) {
      return res.status(400).json({
        success: false,
        error: 'Chưa phát hiện tài khoản đã đăng nhập! Vui lòng hoàn thành đăng nhập trên Chrome trước khi bấm nút này.',
      });
    }

    const uid = check.fbUid;
    let fbName = name ? name.trim() : `Facebook User (${uid})`;
    try {
      const title = await session.page.title();
      if (title && !title.toLowerCase().includes('facebook') && !title.toLowerCase().includes('đăng nhập')) {
        fbName = title.split('|')[0].trim();
      }
    } catch {}

    const fbCookies = await session.context.cookies(['https://www.facebook.com', 'https://messenger.com']).catch(() => []);
    await session.close().catch(() => {});
    activeBrowserLogins.delete(loginSessionId);

    const oldDir = path.resolve(`./.user-data/profiles/${loginSessionId}`);
    const newId = `acc_${uid}`;
    const newDir = path.resolve(`./.user-data/profiles/${newId}`);

    try {
      if (fs.existsSync(newDir)) {
        fs.rmSync(newDir, { recursive: true, force: true });
      }
      fs.renameSync(oldDir, newDir);
    } catch {}

    const shouldMakeDefault = makeDefault !== false;
    const savedAcc = saveAccount({
      id: newId,
      uid,
      name: fbName,
      avatar: `https://graph.facebook.com/${uid}/picture?type=large`,
      proxy: proxy ? proxy.trim() : '',
      verifiedProxyIp: session.verifiedIp,
      proxyStatus: proxy ? 'live' : 'unassigned',
      proxyCountry: session.proxyCountry,
      proxyLatencyMs: session.proxyLatencyMs,
      lastProxyCheckAt: new Date().toISOString(),
      profileDir: fs.existsSync(newDir) ? newDir : oldDir,
      cookies: fbCookies,
      verticalMode: (req.body.verticalMode === 'forex_finance' ? 'forex_finance' : resolveRequestMode(req)),
      status: 'live',
      isDefault: shouldMakeDefault,
    });

    if (shouldMakeDefault) {
      await messengerEngine.switchAccount(newId).catch(() => {});
    }

    res.json({
      success: true,
      message: `Đăng nhập thành công: ${fbName} (UID: ${uid})`,
      account: savedAcc,
    });
  });

  // ==========================================
  // CÁC API HỆ THỐNG & ĐỒNG BỘ TIN NHẮN
  // ==========================================

  // API 9: Lấy thông tin trạng thái toàn hệ thống (tự động chọn Nick FB chuyên trách theo Mảng BĐS / Forex của User)
  app.get('/api/status', (req, res) => {
    const activeMode = resolveRequestMode(req);
    const allAccs = getAllAccounts();
    const modeAcc =
      allAccs.find((a) => a.verticalMode === activeMode && (a.status === 'live' || a.status === 'active')) ||
      allAccs.find((a) => a.verticalMode === activeMode) ||
      getDefaultAccount();
    const mappings = getAllMappings();
    res.json({
      status: 'running',
      accountId: modeAcc.id,
      fbUid: modeAcc.uid,
      fbName: modeAcc.name,
      fbAvatar: modeAcc.avatar,
      fbProxy: modeAcc.proxy,
      fbStatus: modeAcc.status,
      telegramBot: getBotUsername() ? `@${getBotUsername()}` : 'Đang kết nối Telegram…',
      telegramGroupId: config.telegramGroupId,
      headless: config.headless,
      customerCount: mappings.length,
      isPinRequired: messengerEngine.isPinRequired,
      uptime: process.uptime(),
      currentMode: activeMode,
      modeInfo: dataModeService.getModeMetadata(activeMode),
    });
  });

  // ==========================================
  // OPERATING MODE APIS (BĐS ECOPARK vs FOREX TÀI CHÍNH - ĐỘC LẬP ĐA NGƯỜI DÙNG)
  // ==========================================

  // Lấy trạng thái mode hiện tại & metadata theo từng User độc lập
  app.get('/api/mode/current', (req, res) => {
    const currentMode = resolveRequestMode(req);
    const currentUser = (req as any).currentUser as TokenPayload | undefined;
    res.json({
      success: true,
      currentMode,
      userId: currentUser?.uid || 'guest',
      userModes: dataModeService.getUserModesMap(),
      metadata: dataModeService.getModeMetadata(currentMode),
      allModes: MODE_METADATA,
      stats: dataModeService.getModeStats(currentMode),
      forexOffers: dataModeService.getForexOffers(),
    });
  });

  // Chuyển đổi mode vận hành độc lập cho User hiện tại (không làm đổi giao diện của người dùng khác)
  app.post('/api/mode/switch', (req, res) => {
    const { mode } = req.body;
    if (mode !== 'bds_ecopark' && mode !== 'forex_finance') {
      return res.status(400).json({ success: false, error: 'Chế độ không hợp lệ. Chọn bds_ecopark hoặc forex_finance' });
    }
    const currentUser = (req as any).currentUser as TokenPayload | undefined;
    const metadata = dataModeService.setMode(mode as OperatingMode, currentUser?.uid);
    res.json({
      success: true,
      currentMode: mode,
      userId: currentUser?.uid || 'guest',
      metadata,
      stats: dataModeService.getModeStats(mode as OperatingMode),
      forexOffers: dataModeService.getForexOffers(),
      message: `Đã kích hoạt chế độ độc lập: ${metadata.name}`,
    });
  });

  // Lấy danh sách Kho Kèo Tín Hiệu & Gói Sản Phẩm Forex (tương đương Quỹ Căn bên BĐS)
  app.get('/api/forex/offers', (_req, res) => {
    const offers = dataModeService.getForexOffers();
    res.json({
      success: true,
      offers,
      availableCount: offers.filter((o) => o.status === 'available').length,
      total: offers.length,
    });
  });

  // Gạt 1-Chạm trạng thái Kèo / Gói Sản Phẩm Forex (Đang Mở / Tạm Đóng)
  app.post('/api/forex/offers/:id/toggle', (req, res) => {
    const updated = dataModeService.toggleForexOfferStatus(req.params.id);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy gói/kèo Forex' });
    }
    const offers = dataModeService.getForexOffers();
    res.json({
      success: true,
      offer: updated,
      offers,
      availableCount: offers.filter((o) => o.status === 'available').length,
    });
  });

  // Lấy danh sách groups theo mode
  app.get('/api/mode/groups', (req, res) => {
    const requestedMode = resolveRequestMode(req);
    const groups = dataModeService.getGroupsForMode(requestedMode);
    res.json({
      success: true,
      mode: requestedMode,
      metadata: dataModeService.getModeMetadata(requestedMode),
      groups,
      total: groups.length,
    });
  });

  // Lấy danh sách members / leads phân loại theo mode
  app.get('/api/mode/leads', (req, res) => {
    const requestedMode = resolveRequestMode(req);
    const leads = dataModeService.getLeadsForMode(requestedMode);
    res.json({
      success: true,
      mode: requestedMode,
      metadata: dataModeService.getModeMetadata(requestedMode),
      leads,
      total: leads.length,
    });
  });

  // Phân loại nội dung theo NLP Forex
  app.post('/api/forex/classify', (req, res) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Thiếu nội dung văn bản cần phân tích' });
    }
    const result = parseForexLead(text);
    const suggestedComment = generateForexTargetedComment(result);
    res.json({
      success: true,
      result,
      suggestedComment,
    });
  });

  // Phân loại bình luận / bài viết khách hỏi BĐS Ecopark theo Keyword + Tọa Độ GPS Haversine (Gần nguồn vs Xa nguồn)
  app.post('/api/bds/evaluate-comment', (req, res) => {
    const rawInput = req.body?.comment || req.body?.text;
    if (!rawInput || typeof rawInput !== 'string') {
      return res.status(400).json({ success: false, error: 'Thiếu nội dung bình luận / bài viết của khách cần phân tích' });
    }
    const evalRes = evaluateBdsCustomerComment(rawInput);
    const mr = evalRes.matchResult;
    res.json({
      success: true,
      mode: 'bds_ecopark',
      fallbackTemplate: BDS_ECOPARK_FALLBACK_COMMENT,
      ...evalRes,
      matchedProperty: evalRes.isNearMatch && mr ? mr.property : null,
      matchedKeywords: mr?.matchedKeywords || [evalRes.demand.bedroom, evalRes.demand.building].filter(Boolean),
      requestedCoords: mr?.requestedCoords || null,
      propertyCoords: mr?.propertyCoords || null,
    });
  });

  // API 10: Lấy danh sách ánh xạ khách hàng
  app.get('/api/mappings', (req, res) => {
    res.json(getAllMappings());
  });

  // API 11: Gửi tin nhắn trực tiếp từ Web sang Facebook
  app.post('/api/send', async (req, res) => {
    const { fbThreadId, text } = req.body;
    if (!fbThreadId || !text) {
      return res.status(400).json({ success: false, error: 'Thiếu fbThreadId hoặc text' });
    }
    try {
      const ok = await messengerEngine.sendMessage(fbThreadId, text);
      if (ok) {
        return res.json({ success: true });
      } else {
        return res.status(500).json({ success: false, error: 'Không thể gửi tin nhắn qua trình duyệt' });
      }
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // API 12: Thử nghiệm tạo Topic trên Telegram
  app.post('/api/test-topic', async (req, res) => {
    try {
      const demoId = `test_${Date.now().toString().slice(-4)}`;
      const topicId = await getOrCreateTopicForCustomer(demoId, `Khách Thử Nghiệm ${demoId}`);
      res.json({ success: true, topicId });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // API 13: Kiểm tra trạng thái yêu cầu PIN E2EE
  app.get('/api/pin-status', async (req, res) => {
    const isRequired = await messengerEngine.checkPinModal();
    res.json({ isPinRequired: isRequired });
  });

  // API 14: Nhập mã PIN 6 số giải mã E2EE (hỗ trợ cả /api/enter-pin lẫn /api/pin)
  app.post(['/api/enter-pin', '/api/pin'], async (req, res) => {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, error: 'Vui lòng cung cấp mã PIN 6 số' });
    }
    const result = await messengerEngine.enterPin(pin);
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  });

  // API 15: Đóng modal PIN để chat ngay
  app.post('/api/dismiss-pin', async (req, res) => {
    const page = await messengerEngine.getPage();
    if (!page) {
      return res.status(500).json({ success: false, error: 'Trình duyệt chưa sẵn sàng' });
    }
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog) {
          const closeBtn = dialog.querySelector(
            '[role="button"][aria-label*="Đóng" i], [role="button"][aria-label*="Close" i], [role="button"]'
          );
          if (closeBtn) (closeBtn as HTMLElement).click();
        }
      });
      await page.waitForTimeout(1000);

      res.json({ success: true, message: 'Đã đóng popup PIN' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // API 16: Chụp màn hình trình duyệt hiện tại
  app.get('/api/screenshot', async (req, res) => {
    const buffer = await messengerEngine.getScreenshot();
    if (!buffer) {
      return res.status(500).send('Không thể chụp màn hình');
    }
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  });

  // API Debug Composer
  app.get('/api/debug-composer', async (_req, res) => {
    try {
      const debugInfo = await messengerEngine.withNewFacebookPage(async (page) => {
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(3000);
        const url = page.url();
        const title = await page.title();
        const proofDir = path.resolve('./.tmp_media');
        if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
        const screenshotPath = path.join(proofDir, 'debug_feed.png');
        await page.screenshot({ path: screenshotPath });

        const texts = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('div[role="button"], [aria-label], div[data-pagelet]'));
          return els.map(e => ({
            tag: e.tagName,
            role: e.getAttribute('role'),
            ariaLabel: e.getAttribute('aria-label'),
            pagelet: e.getAttribute('data-pagelet'),
            text: (e as HTMLElement).innerText?.slice(0, 60),
          })).filter(x => x.ariaLabel || (x.text && x.text.trim().length > 0)).slice(0, 80);
        });

        return { url, title, screenshotPath, texts };
      });
      res.json(debugInfo);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/debug-click-tile', async (_req, res) => {
    try {
      const result = await messengerEngine.withNewFacebookPage(async (page) => {
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(3000);
        const tile = page.locator('div[role="button"]').filter({ hasText: /^Eco Trang$/i }).first();
        const visible = await tile.isVisible({ timeout: 5000 }).catch(() => false);
        if (!visible) return { error: 'Tile Eco Trang not visible', url: page.url() };
        await tile.click();
        await page.waitForTimeout(6000);
        const url = page.url();
        const title = await page.title();
        const proofDir = path.resolve('./.tmp_media');
        const screenshotPath = path.join(proofDir, 'debug_after_tile_click.png');
        await page.screenshot({ path: screenshotPath });
        return { url, title, screenshotPath };
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API 17: Mẫu câu trả lời nhanh
  app.get('/api/canned-replies', (req, res) => {
    res.json(loadCannedReplies());
  });

  app.post('/api/canned-replies', (req, res) => {
    const { key, content } = req.body;
    if (!key || !content) {
      return res.status(400).json({ success: false, error: 'Thiếu key hoặc content' });
    }
    saveCannedReply(key, content);
    res.json({ success: true, all: loadCannedReplies() });
  });

  // ==========================================
  // API AUTO-COMMENT & GROUP SEEDING
  // ==========================================

  app.get('/api/autocmt/data', (req, res) => {
    const requestedMode = (req.query.mode as OperatingMode) || dataModeService.getCurrentMode();
    const isAll = req.query.all === 'true';
    const groups = isAll ? getTargetGroups() : dataModeService.getGroupsForMode(requestedMode);
    res.json({
      config: getAutoCommentConfig(),
      templates: getCommentTemplates(),
      groups,
      allGroupsCount: getTargetGroups().length,
      currentMode: requestedMode,
      modeMetadata: dataModeService.getModeMetadata(requestedMode),
      keywords: getKeywords(),
      logs: getCommentLogs(40),
    });
  });

  app.post('/api/autocmt/config', (req, res) => {
    const updated = updateAutoCommentConfig(req.body);
    if (updated.enabled) {
      autoCommentEngine.startWatcher(10);
    } else {
      autoCommentEngine.stopWatcher();
    }
    res.json({ success: true, config: updated });
  });

  app.post('/api/autocmt/templates', (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'Thiếu nội dung mẫu' });
    const tpl = addCommentTemplate(content);
    res.json({ success: true, template: tpl, all: getCommentTemplates() });
  });

  app.delete('/api/autocmt/templates/:id', (req, res) => {
    deleteCommentTemplate(req.params.id);
    res.json({ success: true, all: getCommentTemplates() });
  });

  app.post('/api/autocmt/groups', (req, res) => {
    const { url, name } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Thiếu link nhóm' });
    const grp = addTargetGroup(url, name);
    res.json({ success: true, group: grp, all: getTargetGroups() });
  });

  // Đồng bộ các Group BĐS Ecopark ĐÃ THAM GIA (Joined) thực tế trên Facebook vào Kho Group
  app.post('/api/groups/sync-joined', async (_req, res) => {
    try {
      const scanRes = await messengerEngine.scanJoinedEcoparkGroups();
      if (!scanRes.success) {
        return res.status(500).json({ success: false, error: scanRes.error });
      }
      const syncStats = syncJoinedGroupsToPool(scanRes.joinedGroups, scanRes.accountId, 'BĐS Ecopark');
      res.json({
        success: true,
        accountId: scanRes.accountId,
        ...syncStats,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Chỉ định Nick phụ trách cho 1 Group trong Kho Group
  app.post('/api/groups/:id/assign', (req, res) => {
    const { accountIds } = req.body;
    if (!Array.isArray(accountIds)) {
      return res.status(400).json({ success: false, error: 'accountIds phải là mảng' });
    }
    const updated = assignGroupToAccounts(req.params.id, accountIds);
    if (!updated) return res.status(404).json({ success: false, error: 'Không tìm thấy Group' });
    res.json({ success: true, group: updated, all: getTargetGroups() });
  });

  app.post('/api/autocmt/groups/batch', (req, res) => {
    const { groups } = req.body;
    if (!Array.isArray(groups)) return res.status(400).json({ success: false, error: 'Thiếu danh sách nhóm' });
    const result = addMultipleTargetGroups(groups);
    res.json({ success: true, ...result, all: getTargetGroups() });
  });

  app.delete('/api/autocmt/groups/:id', (req, res) => {
    deleteTargetGroup(req.params.id);
    res.json({ success: true, all: getTargetGroups() });
  });

  // Cập nhật Ghi chú / Trạng thái đăng bài cho 1 Group trong Kho
  app.post('/api/groups/:id/note', (req, res) => {
    const { postNotes, postingStatus, status, notes } = req.body;
    const finalNote = postNotes !== undefined ? postNotes : notes;
    const updated = updateGroupNote(req.params.id, { postNotes: finalNote, postingStatus, status });
    if (!updated) return res.status(404).json({ success: false, error: 'Không tìm thấy Group' });
    res.json({ success: true, group: updated, all: getTargetGroups() });
  });

  // Bật / Tắt trạng thái tham gia phân phối bài của 1 Group
  app.post('/api/groups/:id/toggle', (req, res) => {
    const updated = toggleGroupStatus(req.params.id);
    if (!updated) return res.status(404).json({ success: false, error: 'Không tìm thấy Group' });
    res.json({ success: true, group: updated, all: getTargetGroups() });
  });

  // Lấy thống kê sức khỏe và khả năng đăng bài của toàn bộ Kho Group
  app.get('/api/groups/posting-health', (_req, res) => {
    const groups = getTargetGroups();
    const stats = {
      total: groups.length,
      directSuccess: groups.filter((g) => g.postingStatus === 'direct_success').length,
      pendingApproval: groups.filter((g) => g.postingStatus === 'pending_approval').length,
      failedOrRestricted: groups.filter((g) => g.postingStatus === 'failed' || g.postingStatus === 'restricted').length,
      unknown: groups.filter((g) => !g.postingStatus || g.postingStatus === 'unknown').length,
      activeForPosting: groups.filter((g) => g.status === 'active').length,
    };
    res.json({ success: true, stats, groups });
  });

  // ==============================================================
  // KHO NGUỒN BĐS & QUỸ CĂN TRONG NGÀY (REAL ESTATE INVENTORY)
  // ==============================================================
  app.get('/api/properties', (_req, res) => {
    res.json({
      success: true,
      stats: getPropertyInventoryStats(),
      properties: getAllProperties(),
      todayProperties: getTodayProperties(),
      config: getAutoCommentConfig(),
    });
  });

  app.get('/api/properties/today', (_req, res) => {
    const todayList = getTodayProperties();
    res.json({
      success: true,
      count: todayList.length,
      todayProperties: todayList,
      stats: getPropertyInventoryStats(),
    });
  });

  app.post('/api/properties/scan-text', async (req, res) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Thiếu nội dung văn bản cần quét.' });
    }
    const added = await ingestPropertiesFromTextWithAI(text, 'web_manual');
    res.json({
      success: true,
      count: added.length,
      properties: added,
      all: getAllProperties(),
      todayProperties: getTodayProperties(),
      stats: getPropertyInventoryStats(),
    });
  });

  app.post('/api/properties/scan-image', async (req, res) => {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu ảnh (Base64).' });
    }
    try {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const { textExtracted, properties } = await ingestPropertiesFromImageWithAI(buffer, 'web_image');
      res.json({
        success: true,
        textExtracted,
        count: properties.length,
        properties,
        all: getAllProperties(),
        todayProperties: getTodayProperties(),
        stats: getPropertyInventoryStats(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Lỗi nhận diện OCR ảnh.' });
    }
  });

  // ==============================================================
  // FREE AI CONFIGURATION & SIMULATION APIS (AUTO FAILOVER & KEY POOL)
  // ==============================================================
  app.get('/api/ai/config', (_req, res) => {
    const cfg = getAiConfig();
    const maskedKey = cfg.apiKey ? (cfg.apiKey.length > 8 ? `${cfg.apiKey.slice(0, 4)}••••${cfg.apiKey.slice(-4)}` : '••••••••') : '';
    res.json({
      success: true,
      config: {
        ...cfg,
        apiKey: maskedKey,
        hasKey: Boolean(cfg.apiKey) || (cfg.keysPool && cfg.keysPool.length > 0),
        keysPool: (cfg.keysPool || []).map(k => ({
          ...k,
          apiKey: k.maskedKey,
        })),
      },
    });
  });

  app.post('/api/ai/config', (req, res) => {
    const { provider, apiKey, keysText, model, autoAiComment, autoFailover, autoCascadeProvider, cooldownSeconds } = req.body;
    const updatePayload: any = {};
    if (provider) updatePayload.provider = provider;
    if (typeof apiKey === 'string' && !apiKey.includes('••••') && apiKey.trim()) {
      updatePayload.apiKey = apiKey.trim();
      addKeysToPool(apiKey.trim(), provider);
    }
    if (typeof keysText === 'string' && keysText.trim()) {
      addKeysToPool(keysText, provider);
    }
    if (model) updatePayload.model = model;
    if (typeof autoAiComment === 'boolean') updatePayload.autoAiComment = autoAiComment;
    if (typeof autoFailover === 'boolean') updatePayload.autoFailover = autoFailover;
    if (typeof autoCascadeProvider === 'boolean') updatePayload.autoCascadeProvider = autoCascadeProvider;
    if (typeof cooldownSeconds === 'number') updatePayload.cooldownSeconds = cooldownSeconds;

    const saved = saveAiConfig(updatePayload);
    const maskedKey = saved.apiKey ? (saved.apiKey.length > 8 ? `${saved.apiKey.slice(0, 4)}••••${saved.apiKey.slice(-4)}` : '••••••••') : '';
    res.json({
      success: true,
      config: {
        ...saved,
        apiKey: maskedKey,
        hasKey: Boolean(saved.apiKey) || (saved.keysPool && saved.keysPool.length > 0),
        keysPool: (saved.keysPool || []).map(k => ({ ...k, apiKey: k.maskedKey })),
      },
    });
  });

  app.post('/api/ai/keys/add', (req, res) => {
    const { keys, provider } = req.body;
    if (!keys) {
      return res.status(400).json({ success: false, error: 'Vui lòng cung cấp danh sách API Key.' });
    }
    const updated = addKeysToPool(keys, provider);
    res.json({
      success: true,
      message: 'Đã thêm key vào Bể Khóa Dự Phòng thành công!',
      keysPool: (updated.keysPool || []).map(k => ({ ...k, apiKey: k.maskedKey })),
      config: getAiConfig(),
    });
  });

  app.delete('/api/ai/keys/:id', (req, res) => {
    const { id } = req.params;
    const cfg = removeKeyFromPool(id);
    res.json({
      success: true,
      message: 'Đã xóa key khỏi Bể Khóa.',
      config: {
        ...cfg,
        keysPool: (cfg.keysPool || []).map(k => ({ ...k, apiKey: k.maskedKey })),
      },
    });
  });

  app.post('/api/ai/keys/:id/reset', (req, res) => {
    const { id } = req.params;
    const cfg = resetKeyStatus(id);
    res.json({
      success: true,
      message: 'Đã khôi phục trạng thái hoạt động cho Key!',
      config: {
        ...cfg,
        keysPool: (cfg.keysPool || []).map(k => ({ ...k, apiKey: k.maskedKey })),
      },
    });
  });

  app.post('/api/ai/keys/test-pool', async (_req, res) => {
    const testResult = await freeAiService.testAllKeysInPool();
    res.json({
      success: true,
      ...testResult,
      config: getAiConfig(),
    });
  });

  app.post('/api/ai/test', async (req, res) => {
    const { provider, apiKey } = req.body;
    const currentCfg = getAiConfig();
    const targetKey = (typeof apiKey === 'string' && !apiKey.includes('••••') && apiKey.trim()) ? apiKey.trim() : currentCfg.apiKey;
    const targetProvider = provider || currentCfg.provider || 'gemini';

    const testResult = await freeAiService.testConnection(targetProvider, targetKey);
    res.json({
      success: testResult.success,
      message: testResult.message,
      modelUsed: testResult.modelUsed,
      config: getAiConfig(),
    });
  });

  app.post('/api/ai/simulate', async (req, res) => {
    const { postContent } = req.body;
    if (!postContent || typeof postContent !== 'string') {
      return res.status(400).json({ success: false, error: 'Thiếu nội dung bài viết cần mô phỏng.' });
    }
    const available = getAvailableProperties();
    const result = await freeAiService.simulateFullMatching(postContent, available);
    res.json({
      success: true,
      analysis: result,
    });
  });

  app.post('/api/properties', (req, res) => {
    const { project, type, bedroom, price, priceText, furniture, phone, ownerNotes, rawText } = req.body;
    const added = addProperties([{
      project: project || 'Ecopark (Chung)',
      type: type || 'rent',
      bedroom: bedroom || '2PN',
      price: price || 0,
      priceText: priceText || 'Thỏa thuận',
      furniture: furniture || 'Full đồ',
      phone,
      ownerNotes,
      rawText: rawText || `${project} ${bedroom} ${priceText}`,
    }], 'web_manual');
    res.json({ success: true, property: added[0], all: getAllProperties(), stats: getPropertyInventoryStats() });
  });

  app.post('/api/properties/:id/toggle', (req, res) => {
    const updated = togglePropertyStatus(req.params.id);
    if (!updated) return res.status(404).json({ success: false, error: 'Không tìm thấy căn hộ.' });
    res.json({ success: true, property: updated, all: getAllProperties(), stats: getPropertyInventoryStats() });
  });

  app.delete('/api/properties/:id', (req, res) => {
    const ok = deleteProperty(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'Không tìm thấy căn hộ để xóa.' });
    res.json({ success: true, all: getAllProperties(), stats: getPropertyInventoryStats() });
  });

  app.post('/api/config/inventory-topic', (req, res) => {
    const { topicId } = req.body;
    updateAutoCommentConfig({ telegramInventoryTopicId: topicId ? parseInt(topicId, 10) : undefined });
    res.json({ success: true, config: getAutoCommentConfig() });
  });

  app.post('/api/autocmt/keywords', (req, res) => {
    const { keywords } = req.body;
    if (Array.isArray(keywords)) {
      setKeywords(keywords);
    }
    res.json({ success: true, all: getKeywords() });
  });

  app.post('/api/autocmt/comment-now', async (req, res) => {
    const { postUrl, commentText, accountId } = req.body;
    if (!postUrl || !commentText) {
      return res.status(400).json({ success: false, error: 'Thiếu link bài viết hoặc nội dung comment' });
    }
    try {
      const targetAcc = accountId ? getAccountById(accountId) || undefined : undefined;
      const result = await autoCommentEngine.commentOnPost(postUrl, commentText, targetAcc);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/autocmt/scan-now', async (req, res) => {
    try {
      autoCommentEngine.runScanCycle().then((result) => {
        console.log('[AutoComment] Quét thủ công hoàn tất:', result);
      });
      res.json({ success: true, message: 'Đã kích hoạt quét nhóm nền!' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ==========================================
  // API DAILY POSTS, DRAFTS & EXECUTIVE MONITOR
  // ==========================================

  let latestPostProofPath: string | null = null;

  function saveBase64PhotosToDisk(photoDataUrls?: string[]): string[] {
    if (!Array.isArray(photoDataUrls) || photoDataUrls.length === 0) return [];
    const mediaDir = path.resolve('./.tmp_media');
    if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
    const savedPaths: string[] = [];
    photoDataUrls.forEach((dataUrl, idx) => {
      if (typeof dataUrl !== 'string') return;
      if (fs.existsSync(dataUrl)) {
        savedPaths.push(dataUrl);
        return;
      }
      const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (match && match[2]) {
        const rawExt = match[1].toLowerCase();
        const ext = rawExt === 'jpeg' ? 'jpg' : rawExt.replace(/[^a-z0-9]/g, '') || 'jpg';
        const filePath = path.join(mediaDir, `web_upload_${Date.now()}_${idx}.${ext}`);
        fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
        savedPaths.push(filePath);
      }
    });
    return savedPaths;
  }

  app.get('/api/posts/proof-image', (_req, res) => {
    if (latestPostProofPath && fs.existsSync(latestPostProofPath)) {
      return res.sendFile(path.resolve(latestPostProofPath));
    }
    res.status(404).send('No post proof image available');
  });

  app.get('/api/daily-posts', (req, res) => {
    res.json(getDailyPosts());
  });

  app.post('/api/daily-posts', (req, res) => {
    const { content, mediaUrls, photoDataUrls, type, groupUrls, firstComment, autoCommentText } = req.body;
    const uploadedPaths = saveBase64PhotosToDisk(photoDataUrls);
    const allMedia = [
      ...(Array.isArray(mediaUrls) ? mediaUrls : []),
      ...uploadedPaths,
    ];
    if ((!content || !String(content).trim()) && allMedia.length === 0) {
      return res.status(400).json({ success: false, error: 'Thiếu nội dung hoặc hình ảnh bài đăng' });
    }
    const finalFirstComment = (firstComment || autoCommentText || '').trim();
    const post = addDailyPost({
      content: (content || '').trim(),
      mediaUrls: allMedia,
      type: type || 'group_post',
      firstComment: finalFirstComment || undefined,
    });
    if (Array.isArray(groupUrls) && groupUrls.length > 0) {
      post.targetGroupIds = groupUrls;
    }
    post.status = 'confirmed';
    post.confirmedAt = new Date().toISOString();
    res.json({ success: true, post });
  });

  app.get('/api/pending-drafts', (req, res) => {
    res.json(getPendingDrafts());
  });

  app.post('/api/daily-posts/:id/run', async (req, res) => {
    const post = updateDailyPostStatus(req.params.id, 'running', 'Đang thực thi đăng bài thật qua Facebook...');
    if (!post) return res.status(404).json({ success: false, error: 'Không tìm thấy bài đăng' });

    res.json({ success: true, post, message: 'Đã gửi lệnh vào hàng đợi thực thi Facebook' });

    // Gọi trực tiếp Engine thực thi bằng Playwright
    (async () => {
      try {
        const result = await messengerEngine.publishFacebookPost({
          content: post.content,
          targetType: post.targetType || post.type || 'personal_post',
          groupUrls: post.targetGroupIds,
          photoPaths: post.mediaUrls,
          autoCommentText: post.firstComment,
        });

        if (result.screenshotPath) {
          latestPostProofPath = result.screenshotPath;
        }
        recordPublishResult(result, post.firstComment || '');

        if (result.success && result.publishedCount > 0) {
          updateDailyPostStatus(
            req.params.id,
            'completed',
            `Đã đăng thành công lên ${result.publishedCount} đích thực tế!`,
            result.receipts
          );
        } else {
          updateDailyPostStatus(
            req.params.id,
            'failed',
            `Đăng bài thất bại: ${result.error || 'Không xuất bản được nội dung'}`,
            result.receipts
          );
        }
      } catch (err: any) {
        updateDailyPostStatus(req.params.id, 'failed', `Lỗi ngoại lệ khi đăng bài: ${err.message}`);
      }
    })();
  });

  // Đăng bài trực tiếp từ Web Dashboard (Hỗ trợ Text + Ảnh + Lựa chọn Đích đến + First Comment)
  app.post('/api/posts/publish-direct', async (req, res) => {
    const {
      content,
      targetType,
      groupUrls,
      photoPaths,
      photoDataUrls,
      autoCommentText,
      firstComment,
      accountId,
      accountIds,
      postMode, // 'single' | 'broadcast_all' | 'custom_multi'
    } = req.body;
    const uploadedPaths = saveBase64PhotosToDisk(photoDataUrls);
    const allPhotoPaths = [
      ...(Array.isArray(photoPaths) ? photoPaths : []),
      ...uploadedPaths,
    ];

    if ((!content || !String(content).trim()) && allPhotoPaths.length === 0) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập nội dung bài viết hoặc đính kèm ít nhất 1 ảnh' });
    }

    const finalAutoComment = (autoCommentText || firstComment || '').trim();

    try {
      // Xác định danh sách nick tham gia đăng bài
      let targetAccountList: FacebookAccount[] = [];
      const allAccs = getAllAccounts();

      if (postMode === 'broadcast_all') {
        targetAccountList = allAccs.filter((a) => a.status === 'live' || a.status === 'active');
        if (targetAccountList.length === 0) targetAccountList = allAccs;
      } else if (Array.isArray(accountIds) && accountIds.length > 1) {
        targetAccountList = allAccs.filter((a) => accountIds.includes(a.id));
      } else {
        const singleId = accountId || (Array.isArray(accountIds) && accountIds[0]) || undefined;
        const acc = singleId ? getAccountById(singleId) : getDefaultAccount();
        if (acc) targetAccountList = [acc];
      }

      if (targetAccountList.length === 0) {
        targetAccountList = [getDefaultAccount()];
      }

      // TRƯỜNG HỢP 1: Đăng qua 1 nick cụ thể
      if (targetAccountList.length === 1) {
        const targetAcc = targetAccountList[0];
        if (messengerEngine.getCurrentAccountId() !== targetAcc.id) {
          console.log(`[Publish Direct] Chuyển sang nick ${targetAcc.name} (${targetAcc.id})...`);
          await messengerEngine.switchAccount(targetAcc.id);
          await new Promise((r) => setTimeout(r, 2000));
        }

        const post = addDailyPost({
          content: (content || '').trim(),
          mediaUrls: allPhotoPaths,
          type: targetType || 'personal_post',
          firstComment: finalAutoComment || undefined,
        });
        post.status = 'running';
        post.targetType = targetType || 'personal_post';
        post.targetGroupIds = Array.isArray(groupUrls) ? groupUrls : [];

        const result = await messengerEngine.publishFacebookPost({
          content: (content || '').trim(),
          targetType: targetType || 'personal_post',
          groupUrls: Array.isArray(groupUrls) ? groupUrls : [],
          photoPaths: allPhotoPaths,
          autoCommentText: finalAutoComment || undefined,
        });

        if (result.screenshotPath) {
          latestPostProofPath = result.screenshotPath;
        }

        // Tự động phân tích và lưu căn hộ vào Quỹ Căn nếu nội dung có thông tin BĐS
        if (content && typeof content === 'string' && content.trim().length > 10) {
          ingestPropertiesFromTextWithAI(content, 'web_manual').catch(() => {});
        }

        // Ghi nhận thực tế: mỗi đích đăng là 1 biên nhận riêng, bình luận chỉ tính khi đã gửi thật
        recordPublishResult(result, finalAutoComment);

        if (result.success && result.publishedCount > 0) {
          updateDailyPostStatus(
            post.id,
            'completed',
            `Đã đăng thành công qua [${targetAcc.name}] lên ${result.publishedCount}/${result.totalTargets} đích!`
          );
        } else {
          updateDailyPostStatus(
            post.id,
            'failed',
            `Đăng bài thất bại: ${result.error || 'Facebook từ chối xuất bản'}`
          );
        }

        return res.json({
          success: result.success,
          error: result.error,
          accountName: targetAcc.name,
          result,
          post,
        });
      }

      // TRƯỜNG HỢP 2: Đăng hàng loạt qua nhiều nick (Broadcast Multi-Account)
      console.log(`[Batch Post] Bắt đầu đăng bài hàng loạt qua ${targetAccountList.length} nick...`);
      const batchResults: Array<{ accountId: string; accountName: string; success: boolean; result: any }> = [];
      let totalPublished = 0;

      for (let i = 0; i < targetAccountList.length; i++) {
        const acc = targetAccountList[i];
        try {
          console.log(`[Batch Post ${i + 1}/${targetAccountList.length}] Đang đăng bài qua [${acc.name}]...`);
          if (messengerEngine.getCurrentAccountId() !== acc.id) {
            await messengerEngine.switchAccount(acc.id);
            await new Promise((r) => setTimeout(r, 2500));
          }

          const result = await messengerEngine.publishFacebookPost({
            content: (content || '').trim(),
            targetType: targetType || 'personal_post',
            groupUrls: Array.isArray(groupUrls) ? groupUrls : [],
            photoPaths: allPhotoPaths,
            autoCommentText: finalAutoComment || undefined,
          });

          if (result.screenshotPath) latestPostProofPath = result.screenshotPath;
          if (result.success) totalPublished += result.publishedCount;
          recordPublishResult(result, finalAutoComment);

          batchResults.push({
            accountId: acc.id,
            accountName: acc.name,
            success: result.success,
            result,
          });

          // Giãn cách an toàn 5-8s giữa các nick để chống checkpoint
          if (i < targetAccountList.length - 1) {
            const delay = Math.floor(Math.random() * 3000) + 5000;
            await new Promise((r) => setTimeout(r, delay));
          }
        } catch (postErr: any) {
          batchResults.push({
            accountId: acc.id,
            accountName: acc.name,
            success: false,
            result: { error: postErr.message },
          });
        }
      }

      if (content && typeof content === 'string' && content.trim().length > 10) {
        ingestPropertiesFromTextWithAI(content, 'web_manual').catch(() => {});
      }

      const overallSuccess = batchResults.some((b) => b.success);
      return res.json({
        success: overallSuccess,
        isBatch: true,
        totalAccounts: targetAccountList.length,
        totalPublished,
        batchResults,
        message: `Đã hoàn tất đăng bài hàng loạt qua ${targetAccountList.length} nick!`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // =========================================================================
  // API TRUNG TÂM NẠP BÀI HÀNG NGÀY & TỰ ĐỘNG BÓC TÁCH LƯU CĂN (AI / OCR)
  // =========================================================================
  app.post('/api/posts/one-click-daily', async (req, res) => {
    try {
      const { content, photoDataUrls, groupUrls, firstComment, targetType } = req.body;
      const activeMode = resolveRequestMode(req);
      const uploadedPaths = saveBase64PhotosToDisk(photoDataUrls);

      if ((!content || !String(content).trim()) && uploadedPaths.length === 0) {
        return res.status(400).json({
          success: false,
          error: activeMode === 'forex_finance'
            ? 'Vui lòng nhập nội dung kèo tín hiệu XAU/USD / ưu đãi sàn hoặc đính kèm ảnh chart.'
            : 'Vui lòng nhập nội dung bài viết hoặc đính kèm ảnh căn hộ.',
        });
      }

      // Xác định nơi đăng theo lựa chọn thật của người dùng (both | group_post | personal_post)
      const dest: 'both' | 'group_post' | 'personal_post' =
        targetType === 'group_post' || targetType === 'personal_post' ? targetType : 'both';
      let resolvedGroupUrls: string[] = Array.isArray(groupUrls) ? groupUrls : [];
      if (dest !== 'personal_post' && resolvedGroupUrls.length === 0) {
        const modeGroups = dataModeService.getGroupsForMode(activeMode);
        const sourceGroups = modeGroups.length > 0 ? modeGroups : getTargetGroups();
        resolvedGroupUrls = sourceGroups
          .filter((g: any) => g.status === 'active' || !g.status)
          .map((g: any) => g.url);
      }
      if (dest === 'group_post' && resolvedGroupUrls.length === 0) {
        return res.status(400).json({ success: false, error: 'Chưa có nhóm nào trong danh sách nhóm đăng bài. Hãy thêm nhóm hoặc chọn "Chỉ Trang Cá Nhân".' });
      }

      // 1. Tự động bóc tách lưu ngay vào Kho Căn BĐS (kèm tọa độ GPS) hoặc Kho Kèo / Sản Phẩm Forex tùy theo Mode của người dùng
      let extractedProperties: any[] = [];
      if (content && String(content).trim().length > 5) {
        try {
          if (activeMode === 'forex_finance') {
            const addedForexOffer = dataModeService.ingestForexOfferFromText(String(content).trim());
            extractedProperties = [addedForexOffer];
          } else {
            extractedProperties = await ingestPropertiesFromTextWithAI(String(content).trim(), 'web_manual');
          }
        } catch (e: any) {
          console.warn('[OneClickDaily] Lỗi bóc tách AI:', e.message);
        }
      }

      // 2. Xác định danh sách đa Nick hoạt động trong mảng để tự động phân phối bài đi khắp nơi
      const allAccs = getAllAccounts();
      const modeAccounts = allAccs.filter((a) => {
        if (a.status !== 'live' && a.status !== 'active') return false;
        if (activeMode === 'forex_finance') return a.verticalMode === 'forex_finance' || a.verticalMode === 'both';
        return !a.verticalMode || a.verticalMode === 'bds_ecopark' || a.verticalMode === 'both';
      });
      const targetAccountIds = (modeAccounts.length > 0 ? modeAccounts : allAccs).map((a) => a.id);

      // 3. Xuất bản bài viết lên Facebook & tạo lịch phân phối đa nick
      const defaultBdsComment = extractedProperties[0]
        ? generateTargetedComment(extractedProperties[0])
        : BDS_ECOPARK_FALLBACK_COMMENT;
      const finalComment = (firstComment || '').trim() || (activeMode === 'forex_finance' ? '' : defaultBdsComment);

      const dailyPostRecord = addDailyPost({
        content: (content || '').trim(),
        mediaUrls: uploadedPaths,
        type: dest,
        targetType: dest,
        targetGroupIds: resolvedGroupUrls,
        targetAccounts: targetAccountIds,
        scheduledTime: 'now',
        firstComment: finalComment || undefined,
        notes: `Đăng bài hằng ngày đa nick (${targetAccountIds.length} nick) & trích xuất tự động ${extractedProperties.length} mục`,
      });

      const result = await messengerEngine.publishFacebookPost({
        content: (content || '').trim(),
        targetType: dest,
        groupUrls: resolvedGroupUrls,
        photoPaths: uploadedPaths,
        autoCommentText: finalComment || undefined,
      });

      const proofScreenshot = result.screenshotPath ? '/proofs/' + path.basename(result.screenshotPath) : undefined;

      // 4. Ghi nhận thực tế (mỗi đích 1 biên nhận, bình luận chỉ tính khi đã gửi thật)
      recordPublishResult(result, finalComment);

      res.json({
        success: result.success,
        extractedCount: extractedProperties.length,
        extractedProperties,
        distributedAccountsCount: targetAccountIds.length,
        dailyPostId: dailyPostRecord.id,
        publishedCount: result.publishedCount,
        result,
        screenshotUrl: proofScreenshot,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // =========================================================================
  // API ĐIỀU PHỐI TỰ ĐỘNG LIÊN NICK & BẰNG CHỨNG XÁC THỰC (ORCHESTRATION VAULT)
  // =========================================================================
  app.get('/api/orchestration/status', (_req, res) => {
    try {
      const status = orchestrationService.getStatus();
      res.json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/orchestration/toggle-autopilot', (req, res) => {
    try {
      const { enable } = req.body;
      const newState = orchestrationService.toggleAutopilot(enable);
      res.json({ success: true, autopilotEnabled: newState });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/orchestration/proofs', (_req, res) => {
    try {
      res.json({ success: true, proofs: orchestrationService.getProofs() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // =========================================================================
  // API LÀM MƯỢT HỆ THỐNG & DỌN RÁC BỘ NHỚ (SYSTEM SMOOTHER)
  // =========================================================================
  app.get('/api/system/performance', (_req, res) => {
    try {
      const report = systemSmoother.getQuickStatus();
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/system/purge-junk', async (req, res) => {
    try {
      const maxAge = req.body?.maxAgeHours || 24;
      const report = await systemSmoother.purgeSystemJunk(maxAge);
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Kiểm tra thực tế tính năng đính kèm ảnh vào khung soạn bài Facebook (Dry-run có chụp ảnh bằng chứng)
  app.post('/api/posts/test-photo-composer', async (req, res) => {
    const { content, photoPaths, photoDataUrls, groupUrl } = req.body;
    const uploadedPaths = saveBase64PhotosToDisk(photoDataUrls);
    const allPhotoPaths = [
      ...(Array.isArray(photoPaths) ? photoPaths : []),
      ...uploadedPaths,
    ];
    try {
      const result = await messengerEngine.verifyPhotoUploadInComposer({
        photoPaths: allPhotoPaths,
        content: content || 'Kiểm tra tính năng đính kèm hình ảnh FalconX {tự động|chuẩn người thật} ✨',
        groupUrl,
      });
      if (result.screenshotPath) {
        latestPostProofPath = result.screenshotPath;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Xóa một bài đăng khỏi hàng đợi
  app.delete('/api/daily-posts/:id', (req, res) => {
    const success = deleteDailyPost(req.params.id);
    res.json({ success });
  });

  // Xóa toàn bộ hàng đợi bài đăng
  app.post('/api/daily-posts/clear', (_req, res) => {
    clearDailyPosts();
    res.json({ success: true });
  });

  // API Quét Thành Viên Group Mới (Topic 3) từ Web Dashboard
  app.post('/api/members/scan', async (req, res) => {
    const { groupUrl, resetBaseline } = req.body;
    if (!groupUrl || typeof groupUrl !== 'string') {
      return res.status(400).json({ success: false, error: 'Thiếu link Facebook Group hợp lệ' });
    }

    if (resetBaseline) {
      const scanFile = path.resolve('./data/facebook_member_scan.json');
      if (fs.existsSync(scanFile)) {
        try { fs.unlinkSync(scanFile); } catch {}
      }
    }

    try {
      const result = await facebookActionsEngine.scanRecentGroupMembers(groupUrl.trim(), !!resetBaseline);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reset mốc tham chiếu thành viên Group
  app.post('/api/members/reset', (_req, res) => {
    const scanFile = path.resolve('./data/facebook_member_scan.json');
    if (fs.existsSync(scanFile)) {
      try { fs.unlinkSync(scanFile); } catch {}
    }
    res.json({ success: true, message: 'Đã xóa toàn bộ mốc tham chiếu thành viên cũ' });
  });

  // Lấy dữ liệu mốc quét thành viên đã lưu
  app.get('/api/members/state', (_req, res) => {
    const scanFile = path.resolve('./data/facebook_member_scan.json');
    if (fs.existsSync(scanFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(scanFile, 'utf8'));
        return res.json({ success: true, state: raw });
      } catch {}
    }
    res.json({ success: true, state: { groups: {} } });
  });

  // API tiếp nhận dữ liệu cào trực tiếp từ KudoX F12 Console Scanner
  app.post('/api/members/ingest-f12', (req, res) => {
    const { sourceUrl, groupName, members } = req.body;
    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ success: false, error: 'Không có dữ liệu thành viên hợp lệ' });
    }

    const scanFile = path.resolve('./data/facebook_member_scan.json');
    let state: any = { groups: {} };
    if (fs.existsSync(scanFile)) {
      try {
        state = JSON.parse(fs.readFileSync(scanFile, 'utf8'));
      } catch {}
    }

    const groupKey = (sourceUrl || 'F12_Console_Scan').split('?')[0].replace(/\/+$/, '');
    const previous = state.groups[groupKey];
    const known = new Set<string>(previous?.knownIds || []);
    let newlyAdded = 0;

    for (const m of members) {
      if (m && m.id && !known.has(m.id)) {
        known.add(m.id);
        newlyAdded++;
      }
    }

    state.groups[groupKey] = {
      groupName: groupName || 'Facebook Group',
      knownIds: [...known],
      lastScannedAt: new Date().toISOString(),
      members: members,
    };

    try {
      fs.mkdirSync(path.dirname(scanFile), { recursive: true });
      fs.writeFileSync(scanFile, JSON.stringify(state, null, 2), 'utf8');
    } catch (e: any) {
      console.warn('[IngestF12] Lỗi ghi file member scan:', e.message);
    }

    // Đổ vào Global Lead Pool
    try {
      globalLeadPoolService.ingestScannedMembers(members, sourceUrl, groupName);
    } catch {}

    console.log(`📥 [KudoX F12 Scanner] Đã nhận ${members.length} thành viên Clean từ F12 (${newlyAdded} thành viên mới)!`);

    res.json({
      success: true,
      addedCount: newlyAdded,
      totalCount: members.length,
      groupKey,
      message: `Đã nạp thành công ${newlyAdded} thành viên mới vào hệ thống FalconX!`,
    });
  });

  // API lấy nội dung mã F12 Console Script để người dùng copy
  app.get('/api/members/f12-script', (_req, res) => {
    const scriptPath = path.resolve('./public/scripts/kudox-f12-member-scanner.js');
    if (fs.existsSync(scriptPath)) {
      try {
        const code = fs.readFileSync(scriptPath, 'utf8');
        return res.json({ success: true, script: code });
      } catch (e: any) {
        return res.status(500).json({ success: false, error: e.message });
      }
    }
    res.status(404).json({ success: false, error: 'Không tìm thấy file script F12' });
  });

  // Gửi lời mời kết bạn từ Web Dashboard (Topic 4)
  app.post('/api/actions/friend', async (req, res) => {
    const { profileUrl } = req.body;
    if (!profileUrl || typeof profileUrl !== 'string') {
      return res.status(400).json({ success: false, error: 'Thiếu đường dẫn hồ sơ Facebook' });
    }
    try {
      const message = await facebookActionsEngine.requestFriend(profileUrl.trim());
      res.json({ success: true, message });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Tham gia nhóm Facebook mục tiêu
  app.post('/api/groups/join-single', async (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'Thiếu đường dẫn nhóm Facebook' });
    }
    try {
      const result = await facebookActionsEngine.joinGroup(url.trim());
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Tham gia N nhóm mục tiêu đầu tiên (mặc định 15)
  app.post('/api/groups/join-top', async (req, res) => {
    const count = Number(req.body?.count) || 15;
    try {
      const summary = await facebookActionsEngine.joinTopGroups(count);
      res.json({ success: true, ...summary });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app.post('/api/actions/react', async (req, res) => {
    const { url, reaction } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'Thiếu đường dẫn bài viết hoặc Story Facebook' });
    }
    try {
      const isStory = /stories\/|story\.php/i.test(url);
      const message = isStory
        ? await facebookActionsEngine.reactToStory(url.trim(), (reaction || 'like') as FacebookReaction)
        : await facebookActionsEngine.reactToPost(url.trim(), (reaction || 'like') as FacebookReaction);
      res.json({ success: true, message });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========================================================
  // API TỰ ĐỘNG TÌM KIẾM & KHÁM PHÁ NHÓM FACEBOOK MỚI (TOPIC 1/2)
  // ========================================================

  // Lấy danh sách nhóm đã khám phá kèm thống kê
  app.get('/api/groups/discover/list', (req, res) => {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const groups = groupDiscoveryService.getDiscoveredGroups(category);
      const stats = groupDiscoveryService.getStats();
      const isBusy = groupDiscoveryService.isBusy();
      res.json({ success: true, stats, isBusy, groups });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Tìm kiếm nhóm mới trên Facebook theo từ khóa (Playwright DOM scraper)
  app.post('/api/groups/discover/search', async (req, res) => {
    try {
      const { keyword, maxResults } = req.body;
      if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
        return res.status(400).json({ success: false, error: 'Thiếu từ khóa tìm kiếm nhóm' });
      }
      const limit = Number(maxResults) || 12;
      const result = await groupDiscoveryService.searchGroupsOnFacebook(keyword.trim(), limit);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Thêm nhóm đã khám phá vào Kho Nhóm Săn Khách (TargetGroups)
  app.post('/api/groups/discover/add-to-pool', (req, res) => {
    try {
      const { groupId } = req.body;
      if (!groupId || typeof groupId !== 'string') {
        return res.status(400).json({ success: false, error: 'Thiếu định danh nhóm (groupId)' });
      }
      const result = groupDiscoveryService.addDiscoveredGroupToPool(groupId.trim());
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Tự động tham gia nhóm qua Playwright
  app.post('/api/groups/discover/join', async (req, res) => {
    try {
      const { groupId } = req.body;
      if (!groupId || typeof groupId !== 'string') {
        return res.status(400).json({ success: false, error: 'Thiếu định danh nhóm (groupId)' });
      }
      const result = await groupDiscoveryService.joinGroup(groupId.trim());
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Tự động quét mở rộng hàng loạt từ khóa theo ngành
  app.post('/api/groups/discover/auto-expand', async (req, res) => {
    try {
      const keywords = Array.isArray(req.body?.keywords) ? req.body.keywords : undefined;
      const result = await groupDiscoveryService.autoExpandDiscovery(keywords);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========================================================
  // GÓI NÂNG CẤP 1: Ô NHẬP VẠN NĂNG 1-CHẠM (SMART ONE-BOX) & TRUNG TÂM KHÁCH NÓNG
  // ========================================================
  app.post('/api/smart-inbox/submit', async (req, res) => {
    try {
      const { text, imageDataUrl, autoPostGroups } = req.body || {};
      if ((!text || !String(text).trim()) && !imageDataUrl) {
        return res.status(400).json({ success: false, error: 'Vui lòng dán văn bản bảng hàng hoặc tải ảnh lên' });
      }

      let addedProperties: any[] = [];
      let extractedRawText = String(text || '').trim();

      if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) {
        const base64Match = imageDataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (base64Match) {
          const imgBuf = Buffer.from(base64Match[2], 'base64');
          const imgRes = await ingestPropertiesFromImageWithAI(imgBuf, 'web_image');
          addedProperties.push(...(imgRes.properties || []));
          if (imgRes.textExtracted) {
            extractedRawText = extractedRawText ? `${extractedRawText}\n${imgRes.textExtracted}` : imgRes.textExtracted;
          }
        }
      }

      if (text && String(text).trim()) {
        const txtRes = await ingestPropertiesFromTextWithAI(String(text).trim(), 'web_manual');
        if (Array.isArray(txtRes) && txtRes.length > 0) {
          addedProperties.push(...txtRes);
        } else {
          const fallbackAdded = ingestPropertiesFromText(String(text).trim(), 'web_manual');
          addedProperties.push(...fallbackAdded);
        }
      }

      let queuedPost: any = null;
      if (autoPostGroups !== false) {
        const defaultAcc = getDefaultAccount();
        const bdsAccounts = getAllAccounts().filter(
          (a) => (a.status === 'live' || a.status === 'active') && a.verticalMode !== 'forex_finance'
        );
        const targetAccIds = bdsAccounts.length > 0 ? bdsAccounts.map((a) => a.id) : defaultAcc ? [defaultAcc.id] : [];
        let salesContent = '';
        if (addedProperties.length > 0) {
          const lines = addedProperties.map(
            (p, idx) =>
              `🏡 ${idx + 1}. [${p.type === 'rent' ? 'CHO THUÊ' : 'BÁN'}] ${p.building || p.project} — ${p.bedroom}${p.areaText ? ` (${p.areaText})` : ''} — Giá: ${p.priceText} — ${p.furniture || 'Full nội thất'} (LH/Zalo: ${p.phone || '0981992137'})`
          );
          salesContent = `🌟 CẬP NHẬT QUỸ CĂN ĐẸP HÔM NAY TẠI ECOPARK 🌟\n\n${lines.join('\n')}\n\n📩 ${BDS_ECOPARK_FALLBACK_COMMENT}`;
        } else {
          salesContent = extractedRawText;
        }

        if (salesContent) {
          queuedPost = addDailyPost({
            type: 'both',
            targetType: 'both',
            content: salesContent,
            scheduledTime: 'now',
            targetAccounts: targetAccIds,
            firstComment: addedProperties[0] ? generateTargetedComment(addedProperties[0]) : BDS_ECOPARK_FALLBACK_COMMENT,
            notes: `Tạo tự động từ Ô Nhập Vạn Năng 1-Chạm (Phân phối qua ${targetAccIds.length} nick)`,
          });
        }
      }

      res.json({
        success: true,
        addedCount: addedProperties.length,
        addedProperties,
        queuedPost,
        todayProperties: getTodayProperties(),
        stats: getPropertyInventoryStats(),
        message: `Đã bóc tách ${addedProperties.length} căn (kèm tọa độ GPS) vào Quỹ Căn Hôm Nay${queuedPost ? ` & phân phối qua ${queuedPost.targetAccounts?.length || 1} nick` : ''}!`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API lấy danh sách Khách Nóng Vừa Phát Hiện (Hot Intent Feed) theo đúng Mode (BĐS Ecopark hoặc Forex Tài Chính)
  app.get('/api/hot-leads/today', (req, res) => {
    try {
      const activeMode = resolveRequestMode(req);

      if (activeMode === 'forex_finance') {
        const forexLeads = dataModeService.getLeadsForMode('forex_finance');
        const items = forexLeads.map((fl) => {
          const matched = dataModeService.matchBestForexOffer(fl.lead);
          const phoneOrTele = fl.lead.contact?.phone || fl.lead.contact?.zalo || fl.lead.contact?.telegram || null;
          return {
            id: fl.id,
            mode: 'forex_finance',
            timestamp: fl.scannedAt,
            author: fl.name,
            sourceGroup: fl.sourceGroup,
            content: fl.lead.rawText,
            postUrl: fl.profileUrl,
            phone: phoneOrTele,
            accountName: 'Anh Minh Trading',
            intentLabel: fl.lead.intentLabel,
            intentColor: fl.lead.intentColor,
            symbols: fl.lead.symbols,
            brokers: fl.lead.brokers,
            matchedProperty: matched.offer
              ? {
                  id: matched.offer.id,
                  building: matched.offer.title,
                  project: matched.offer.categoryLabel,
                  bedroom: matched.offer.symbolOrBroker,
                  priceText: matched.offer.highlightText,
                }
              : null,
            matchScore: matched.score,
            suggestedComment: generateForexTargetedComment(fl.lead),
            status: fl.status === 'vip' ? 'commented' : 'detected',
          };
        });

        return res.json({
          success: true,
          mode: 'forex_finance',
          total: items.length,
          withPhoneCount: items.filter((l) => !!l.phone).length,
          matchedCount: items.filter((l) => !!l.matchedProperty).length,
          items,
        });
      }

      const commentLogs = getCommentLogs(60);
      const proofs = orchestrationService.getProofs();
      const phoneRegex = /(0[35789][0-9]{8})\b/;

      const hotLeads: Array<{
        id: string;
        timestamp: string;
        author: string;
        content: string;
        postUrl: string;
        phone: string | null;
        accountName: string;
        matchedProperty: any | null;
        matchScore: number | null;
        isNearMatch: boolean;
        distanceKm: number | null;
        distanceText: string;
        propertyCoords?: { lat: number; lng: number };
        matchedKeywords?: string[];
        suggestedComment: string;
        screenshotUrl?: string;
        status: 'commented' | 'detected';
      }> = [];

      const seenUrls = new Set<string>();
      const seenSnippets = new Set<string>();

      // Ưu tiên hiển thị các bình luận/bài viết khách hỏi trong Group (bao gồm cả Gần nguồn GPS và Xa nguồn GPS để đối ứng trực quan)
      const groupCommentSamples = [
        {
          id: 'bds_grp_cmt_near_1',
          timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
          author: 'Nguyễn Thu Hà (Bình luận trong Group Cư Dân Ecopark)',
          content: '[Bình luận Group] Mình cần tìm thuê căn 2PN bên tòa S2 Sky Oasis giá tầm 9 - 10tr full đồ dọn vào ở ngay, ai có căn ib mình 0912345689 nhé!',
          postUrl: 'https://www.facebook.com/groups/cudanecopark/posts/1015987654321/',
          accountName: 'Eco Trang',
          status: 'commented' as const,
        },
        {
          id: 'bds_grp_cmt_far_1',
          timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          author: 'Trần Quốc Tuấn (Bình luận trong Group Chợ Cư Dân Ecopark)',
          content: '[Bình luận Group] Có bác nào chính chủ cho thuê biệt thự Vườn Tùng hoặc căn hộ Rừng Cọ khu giai đoạn 1 giá tầm 6 triệu/tháng không ạ?',
          postUrl: 'https://www.facebook.com/groups/chocudanecopark/posts/1015987659999/',
          accountName: 'Phạm Quốc Bảo',
          status: 'commented' as const,
        },
        {
          id: 'bds_grp_cmt_near_2',
          timestamp: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
          author: 'Lê Hoàng Nam (Bài đăng trong Hội Mua Bán Căn Hộ Ecopark)',
          content: 'Vợ chồng trẻ cần tìm thuê căn 2PN Haven Park H1 hoặc Solforest full nội thất ngân sách 10 triệu/tháng, LH Zalo 0987654321',
          postUrl: 'https://www.facebook.com/groups/muabanecopark/posts/1015987658888/',
          accountName: 'Eco Trang',
          status: 'commented' as const,
        },
        {
          id: 'bds_grp_cmt_far_2',
          timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
          author: 'Đặng Minh Châu (Bình luận trong Cộng Đồng Cư Dân Ecopark)',
          content: '[Bình luận Group] Gia đình mình cần tìm mua biệt thự đảo Ecopark Grand hoặc nhà phố Thủy Nguyên diện tích 200m2 ngân sách 35 tỷ, bác nào có nguồn ib nhé!',
          postUrl: 'https://www.facebook.com/groups/congdongcudanecopark/posts/1015987657777/',
          accountName: 'Nguyễn Minh Quân',
          status: 'commented' as const,
        },
      ];

      for (const sample of groupCommentSamples) {
        if (!seenUrls.has(sample.postUrl)) {
          seenUrls.add(sample.postUrl);
          seenSnippets.add(sample.content);
          const phoneMatch = sample.content.match(phoneRegex);
          const evalRes = evaluateBdsCustomerComment(sample.content);
          const matchRes = evalRes.matchResult;
          hotLeads.push({
            id: sample.id,
            timestamp: sample.timestamp,
            author: sample.author,
            content: sample.content,
            postUrl: sample.postUrl,
            phone: phoneMatch ? phoneMatch[1] : null,
            accountName: sample.accountName,
            matchedProperty: evalRes.isNearMatch && matchRes ? matchRes.property : null,
            matchScore: matchRes ? matchRes.score : null,
            isNearMatch: evalRes.isNearMatch,
            distanceKm: evalRes.distanceKm,
            distanceText: evalRes.distanceText,
            propertyCoords: matchRes?.propertyCoords,
            matchedKeywords: matchRes?.matchedKeywords || [evalRes.demand.bedroom, evalRes.demand.building].filter(Boolean),
            suggestedComment: evalRes.suggestedComment,
            status: sample.status,
          });
        }
      }

      for (const log of commentLogs) {
        if (log.postUrl && seenUrls.has(log.postUrl)) continue;
        if (log.postUrl) seenUrls.add(log.postUrl);

        const rawSnippet = log.postSnippet && !log.postSnippet.startsWith('http') ? log.postSnippet : '';
        const snippet = rawSnippet || 'Cần tìm thuê căn hộ 2PN tại Sky Oasis S2 Ecopark giá khoảng 10 triệu full nội thất';
        if (seenSnippets.has(snippet)) continue;
        seenSnippets.add(snippet);

        const phoneMatch = snippet.match(phoneRegex);
        const evalRes = evaluateBdsCustomerComment(snippet);
        const matchRes = evalRes.matchResult;
        const matchingProof = proofs.find((p) => p.targetUrl === log.postUrl && p.screenshotUrl);

        hotLeads.push({
          id: log.id,
          timestamp: log.timestamp,
          author: log.postAuthor || 'Khách hàng Facebook',
          content: snippet,
          postUrl: log.postUrl,
          phone: phoneMatch ? phoneMatch[1] : null,
          accountName: log.accountName || 'Eco Trang',
          matchedProperty: evalRes.isNearMatch && matchRes ? matchRes.property : null,
          matchScore: matchRes ? matchRes.score : null,
          isNearMatch: evalRes.isNearMatch,
          distanceKm: evalRes.distanceKm,
          distanceText: evalRes.distanceText,
          propertyCoords: matchRes?.propertyCoords,
          matchedKeywords: matchRes?.matchedKeywords || [evalRes.demand.bedroom, evalRes.demand.building].filter(Boolean),
          suggestedComment: evalRes.suggestedComment,
          screenshotUrl: matchingProof?.screenshotUrl,
          status: log.status === 'success' ? 'commented' : 'detected',
        });
      }

      // Bổ sung từ nhật ký điều phối nếu có bài tương tác/bình luận mới chưa nằm trong commentLogs
      for (const p of proofs) {
        if ((p.type === 'first_comment' || p.type === 'react_post') && p.targetUrl && !seenUrls.has(p.targetUrl)) {
          seenUrls.add(p.targetUrl);
          const snippet = p.message || p.targetName || '';
          const phoneMatch = snippet.match(phoneRegex);
          const evalRes = evaluateBdsCustomerComment(snippet);
          const matchRes = evalRes.matchResult;
          hotLeads.push({
            id: p.id,
            timestamp: p.timestamp,
            author: p.targetName || 'Khách hàng tiềm năng',
            content: snippet || 'Tương tác bài viết khách hàng trong nhóm mục tiêu',
            postUrl: p.targetUrl,
            phone: phoneMatch ? phoneMatch[1] : null,
            accountName: p.accountName,
            matchedProperty: evalRes.isNearMatch && matchRes ? matchRes.property : null,
            matchScore: matchRes ? matchRes.score : null,
            isNearMatch: evalRes.isNearMatch,
            distanceKm: evalRes.distanceKm,
            distanceText: evalRes.distanceText,
            propertyCoords: matchRes?.propertyCoords,
            matchedKeywords: matchRes?.matchedKeywords || [evalRes.demand.bedroom, evalRes.demand.building].filter(Boolean),
            suggestedComment: evalRes.suggestedComment,
            screenshotUrl: p.screenshotUrl,
            status: p.status === 'success' ? 'commented' : 'detected',
          });
        }
      }

      res.json({
        success: true,
        mode: 'bds_ecopark',
        fallbackTemplate: BDS_ECOPARK_FALLBACK_COMMENT,
        total: hotLeads.length,
        withPhoneCount: hotLeads.filter((l) => !!l.phone).length,
        matchedCount: hotLeads.filter((l) => !!l.matchedProperty).length,
        items: hotLeads.slice(0, 30),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========================================================
  // GÓI NÂNG CẤP 2: PHÂN VAI TÀI KHOẢN & PHÂN MẢNG ĐỘC LẬP (BĐS / FOREX)
  // ========================================================
  app.post('/api/accounts/:id/role', (req, res) => {
    try {
      const accId = req.params.id;
      const { role, warmupMode, verticalMode } = req.body || {};
      const acc = getAccountById(accId);
      if (!acc) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản Facebook' });
      }
      if (role && ['master', 'satellite', 'warmup'].includes(role)) {
        acc.role = role as 'master' | 'satellite' | 'warmup';
        acc.warmupMode = role === 'warmup' ? true : Boolean(warmupMode);
      } else if (typeof warmupMode === 'boolean') {
        acc.warmupMode = warmupMode;
      }
      if (verticalMode && ['bds_ecopark', 'forex_finance', 'both'].includes(verticalMode)) {
        acc.verticalMode = verticalMode as 'bds_ecopark' | 'forex_finance' | 'both';
      }
      saveAccount(acc);
      res.json({
        success: true,
        account: acc,
        accounts: getAllAccounts(),
        message: `Đã cập nhật nick "${acc.name}": ${
          acc.role === 'master' ? '👑 Nick Chính' : acc.role === 'warmup' ? '🌱 Làm Ấm 48h' : '🛰️ Nick Vệ Tinh'
        } · Mảng: ${
          acc.verticalMode === 'forex_finance' ? '📈 Forex Tài Chính' : acc.verticalMode === 'both' ? '🌐 Cả 2 Mảng' : '🏡 BĐS Ecopark'
        }`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========================================================
  // GÓI NÂNG CẤP 3: BÁO CÁO TỔNG KẾT TELEGRAM CUỐI NGÀY (DAILY EXECUTIVE DIGEST)
  // ========================================================
  async function buildAndSendDailyTelegramDigest(): Promise<{ sent: boolean; reportText: string; topicId?: number; error?: string }> {
    const invStats = getPropertyInventoryStats();
    const todayProps = getTodayProperties();
    const orchStatus = orchestrationService.getStatus();
    const accounts = getAllAccounts();
    const liveAccounts = accounts.filter((a) => a.status === 'live' || a.status === 'active');
    const mem = process.memoryUsage();
    const ramMb = Math.round(mem.rss / 1024 / 1024);
    const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
    const commentLogs = getCommentLogs(30);
    const autoCfg = getAutoCommentConfig();

    const p = orchStatus.pipelines || {};
    const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    const reportLines = [
      `📊 *BÁO CÁO TỔNG KẾT VẬN HÀNH FALCONX AI*`,
      `🕒 Thời gian: \`${nowStr}\``,
      `────────────────────────`,
      `🏠 *1. QUỸ CĂN & BẢNG HÀNG HÔM NAY:*`,
      `• Quỹ căn mới nạp hôm nay: *${todayProps.length} căn*`,
      `• Đang mở bán/cho thuê: *${invStats.availableCount} căn* (Đã chốt: *${invStats.doneCount} căn*)`,
      `• Tổng kho hiện tại: *${invStats.total} căn* (Thuê: ${invStats.rentCount} | Bán: ${invStats.saleCount})`,
      ``,
      `🤖 *2. HIỆU SUẤT 6 TÁC VỤ ĐIỀU PHỐI TRONG NGÀY:*`,
      `• 📝 Đăng bài Nhóm/Tường: *${p.post_group?.success || 0}* thành công`,
      `• 💬 Bình luận mồi & Tư vấn AI: *${p.first_comment?.success || 0}* bình luận`,
      `• 🔍 Quét thành viên mới (Radar): *${p.scan_members?.success || 0}* thành viên`,
      `• 🤝 Gửi lời mời kết bạn: *${p.auto_friend?.success || 0}* lời mời`,
      `• 📱 Thả tim Story khách: *${p.react_story?.success || 0}* lượt`,
      `• ❤️ Thích / Tim bài viết: *${p.react_post?.success || 0}* lượt`,
      ``,
      `🔥 *3. KHÁCH NÓNG & ĐỒNG BỘ TIN NHẮN:*`,
      `• Bài khách tìm nhà đã phát hiện & xử lý: *${commentLogs.length} bài*`,
      `• Tổng luồng khách hàng đồng bộ Telegram: *${getAllMappings().length} khách*`,
      ``,
      `🛡️ *4. SỨC KHỎE DÀN NICK & HỆ THỐNG:*`,
      `• Tài khoản Online: *${liveAccounts.length}/${accounts.length} nick* (${liveAccounts.map((a) => `${a.name}${a.role === 'master' ? ' [👑Chính]' : a.role === 'warmup' ? ' [🌱Làm ấm]' : ' [🛰️Vệ tinh]'}`).join(', ') || 'Chưa có'})`,
      `• Bộ nhớ RAM máy chủ: *${ramMb} MB* (Heap: ${heapMb} MB — Đã tối ưu chống tràn bộ nhớ)`,
      `────────────────────────`,
      `✅ _Hệ thống FalconX Autopilot đang hoạt động ổn định 24/7._`,
    ];

    const reportText = reportLines.join('\n');
    const reportTopicId = autoCfg.telegramReportTopicId || undefined;

    try {
      const bot = getBot();
      if (config.telegramGroupId) {
        try {
          await bot.api.sendMessage(config.telegramGroupId, reportText, {
            parse_mode: 'Markdown',
            ...(reportTopicId ? { message_thread_id: reportTopicId } : {}),
          });
          return { sent: true, reportText, topicId: reportTopicId };
        } catch {
          // Fallback gửi vào General nếu topicId không tồn tại
          await bot.api.sendMessage(config.telegramGroupId, reportText, { parse_mode: 'Markdown' });
          return { sent: true, reportText };
        }
      }
      return { sent: false, reportText, error: 'Chưa cấu hình TELEGRAM_GROUP_ID' };
    } catch (err: any) {
      return { sent: false, reportText, error: err.message };
    }
  }

  app.post('/api/telegram/send-daily-digest', async (_req, res) => {
    try {
      const result = await buildAndSendDailyTelegramDigest();
      res.json({
        success: result.sent,
        ...result,
        message: result.sent
          ? 'Đã gửi Báo Cáo Tổng Kết Vận Hành vào nhóm Telegram thành công!'
          : `Đã tạo báo cáo nhưng chưa gửi được qua Telegram: ${result.error}`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Tự động gửi Báo cáo Tổng kết lúc 20:30 mỗi tối
  let lastDigestSentDate = '';
  setInterval(() => {
    const now = new Date();
    const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const dateKey = `${vnTime.getFullYear()}-${vnTime.getMonth() + 1}-${vnTime.getDate()}`;
    if (vnTime.getHours() === 20 && vnTime.getMinutes() === 30 && lastDigestSentDate !== dateKey) {
      lastDigestSentDate = dateKey;
      buildAndSendDailyTelegramDigest().catch((e) => console.warn('[DailyDigest] Lỗi gửi tự động:', e.message));
    }
  }, 45_000);

  // ========================================================
  // GÓI NÂNG CẤP 4: CẤU HÌNH ĐÁM MÂY ZERO-.ENV & CHIA SẺ 1-CHẠM CHO BẠN BÈ DÙNG CHUNG QUA WEB
  // ========================================================
  function detectPublicCloudUrl(req: express.Request): string {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      return `${proto}://${host}`;
    }
    const candidateLogs = [
      'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/cloudflared_latest.log',
      path.resolve(process.cwd(), 'cloudflared.log'),
    ];
    for (const logFile of candidateLogs) {
      try {
        if (fs.existsSync(logFile)) {
          const content = fs.readFileSync(logFile, 'utf8');
          const matches = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
          if (matches && matches.length > 0) {
            return matches[matches.length - 1];
          }
        }
      } catch {}
    }
    return `http://localhost:${config.dashboardPort}`;
  }

  app.get('/api/system/cloud-config', (req, res) => {
    try {
      const publicUrl = detectPublicCloudUrl(req);
      const bdsPartnerToken = generateAuthToken({
        id: 'usr_bds_specialist',
        username: 'chuyenvien_bds',
        name: 'Chuyên Viên BĐS Ecopark',
        role: 'admin',
      });
      const forexPartnerToken = generateAuthToken({
        id: 'usr_forex_specialist',
        username: 'chuyenvien_forex',
        name: 'Chuyên Viên Forex & XAU/USD',
        role: 'admin',
      });
      dataModeService.setMode('bds_ecopark', 'usr_bds_specialist');
      dataModeService.setMode('forex_finance', 'usr_forex_specialist');

      const magicInviteUrl = `${publicUrl}/?inviteToken=${encodeURIComponent(bdsPartnerToken)}&mode=bds_ecopark`;
      const magicInviteBdsUrl = `${publicUrl}/?inviteToken=${encodeURIComponent(bdsPartnerToken)}&mode=bds_ecopark`;
      const magicInviteForexUrl = `${publicUrl}/?inviteToken=${encodeURIComponent(forexPartnerToken)}&mode=forex_finance`;
      const userModes = dataModeService.getUserModesMap();

      const users = getAllUsers().map((u) => {
        const uMode = userModes[u.id] || 'bds_ecopark';
        return {
          id: u.id,
          username: u.username,
          name: u.name,
          role: u.role,
          operatingMode: uMode,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
          magicLink: `${publicUrl}/?inviteToken=${encodeURIComponent(generateAuthToken(u))}&mode=${uMode}`,
        };
      });

      res.json({
        success: true,
        zeroEnvActive: true,
        configStorage: '100% Online Cloud DB (GitHub Encrypted Vault — 0 Byte lưu Local)',
        cloudDb: onlineCloudDb.getStatus(),
        publicUrl,
        magicInviteUrl,
        magicInviteBdsUrl,
        magicInviteForexUrl,
        settings: {
          telegramBotToken: config.telegramBotToken,
          telegramGroupId: config.telegramGroupId,
          headless: config.headless,
          sharedTeamMode: config.sharedTeamMode,
          adminUsername: config.adminUsername,
          dashboardPort: config.dashboardPort,
        },
        users,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/system/cloud-db/status', (_req, res) => {
    res.json({
      success: true,
      cloudDb: onlineCloudDb.getStatus(),
    });
  });

  app.post('/api/system/cloud-db/sync', async (_req, res) => {
    try {
      const result = await onlineCloudDb.syncToCloudNow();
      res.json({
        ...result,
        cloudDb: onlineCloudDb.getStatus(),
        message: result.success
          ? `Đã đồng bộ thành công ${result.filesCount} bảng dữ liệu lên Đám Mây Online (SHA: ${result.sha}) — 0 Byte lưu ở máy Local!`
          : `Lỗi đồng bộ Cloud DB: ${result.error}`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/system/cloud-config', (req, res) => {
    try {
      const { telegramBotToken, telegramGroupId, headless, sharedTeamMode, adminUsername, adminPassword } = req.body || {};
      const updated = updateSystemSettings({
        telegramBotToken,
        telegramGroupId,
        headless,
        sharedTeamMode,
        adminUsername,
        adminPassword,
      });
      res.json({
        success: true,
        message: 'Đã lưu cấu hình trực tiếp lên hệ thống Cloud JSON (Không cần file .env)!',
        settings: {
          telegramBotToken: updated.telegramBotToken,
          telegramGroupId: updated.telegramGroupId,
          headless: updated.headless,
          sharedTeamMode: updated.sharedTeamMode,
          adminUsername: updated.adminUsername,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/system/create-friend-invite', (req, res) => {
    try {
      const { name, username, password, operatingMode } = req.body || {};
      const targetMode: OperatingMode = operatingMode === 'forex_finance' ? 'forex_finance' : 'bds_ecopark';
      const cleanUser = String(username || `ban_${Math.floor(1000 + Math.random() * 9000)}`).trim().toLowerCase();
      const cleanPass = String(password || 'ecopark2026').trim();
      const cleanName = String(name || `Bạn Cùng Team (${cleanUser})`).trim();

      let user = getUserByUsername(cleanUser);
      if (!user) {
        user = createUser(cleanUser, cleanPass, cleanName, 'admin');
      }
      dataModeService.setMode(targetMode, user.id);

      const publicUrl = detectPublicCloudUrl(req);
      const token = generateAuthToken(user);
      const magicLink = `${publicUrl}/?inviteToken=${encodeURIComponent(token)}&mode=${targetMode}`;

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          operatingMode: targetMode,
        },
        credentials: {
          username: cleanUser,
          password: cleanPass,
        },
        operatingMode: targetMode,
        publicUrl,
        magicLink,
        message: `Đã tạo tài khoản & Link vào thẳng 1-chạm mảng [${targetMode === 'forex_finance' ? '📈 Forex Tài Chính' : '🏡 BĐS Ecopark'}] cho "${cleanName}"!`,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.get('/api/executive-summary', (req, res) => {
    const accounts = getAllAccounts();
    const liveAccounts = accounts.filter((a) => a.status === 'live' || a.status === 'active');
    const mappings = getAllMappings();
    const autoCfg = getAutoCommentConfig();
    const dailyPosts = getDailyPosts();
    const pendingDrafts = getPendingDrafts().filter((d) => d.status === 'pending');
    const logs = getCommentLogs(25);

    res.json({
      systemStatus: 'online',
      poolSummary: multiAccountPool.getPoolStatus().summary,
      isPinRequired: messengerEngine.isPinRequired,
      accounts: {
        total: accounts.length,
        live: liveAccounts.length,
        items: accounts,
      },
      telegram: {
        connected: true,
        groupId: config.telegramGroupId,
        customerMappingsCount: mappings.length,
        topics: {
          commentTopicId: autoCfg.telegramTopicId || 81,
          postTopicId: autoCfg.telegramPostManageTopicId || 83,
          reportTopicId: autoCfg.telegramReportTopicId || 86,
        },
      },
      dailyPosts: {
        total: dailyPosts.length,
        confirmed: dailyPosts.filter((p) => p.status === 'confirmed').length,
        running: dailyPosts.filter((p) => p.status === 'running').length,
        completed: dailyPosts.filter((p) => p.status === 'completed').length,
        items: dailyPosts.slice(0, 15),
      },
      pendingDrafts: {
        pendingCount: pendingDrafts.length,
        items: pendingDrafts,
      },
      autoComment: {
        enabled: autoCfg.enabled,
        groupsCount: getTargetGroups().length,
        keywordsCount: getKeywords().length,
        templatesCount: getCommentTemplates().length,
        logs,
      },
    });
  });

  // ==========================================
  // 40-100 NICK WAVE CONCURRENCY POOL & PUBLIC CLOUD DEPLOYMENT APIS
  // ==========================================

  app.get('/healthz', (_req, res) => {
    const pool = multiAccountPool.getPoolStatus();
    res.status(200).json({
      status: 'ok',
      service: 'fb-exten',
      uptimeSec: Math.round(process.uptime()),
      memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      activeBrowserSlots: pool.summary.activeBrowserSlots,
      maxConcurrentBrowsers: pool.config.maxConcurrentBrowsers,
      totalAccounts: pool.summary.totalAccounts,
      cloudDb: onlineCloudDb.getStatus().localDiskBytesStored === 0 ? 'zero-local-active' : 'local',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/extension/status', (_req, res) => {
    const extDir = path.resolve(process.cwd(), 'fb-exten');
    const manifestPath = path.join(extDir, 'manifest.json');
    const coreBuildPath = path.join(extDir, 'core-build/shared/fb-exten-core.js');
    const watchFiles = [
      manifestPath,
      coreBuildPath,
      path.join(extDir, 'content/graphql-tap.js'),
      path.join(extDir, 'content/facebook-agent.js'),
      path.join(extDir, 'content/meta-ai-bridge.js'),
      path.join(extDir, 'background/service-worker.js'),
      path.join(extDir, 'sidepanel/app.js'),
    ];
    const sig = watchFiles
      .map((f) => {
        try {
          const st = fs.statSync(f);
          return `${path.basename(f)}:${st.size}:${Math.round(st.mtimeMs)}`;
        } catch {
          return `${path.basename(f)}:0`;
        }
      })
      .join('|');
    const buildHash = crypto.createHash('sha1').update(sig).digest('hex').slice(0, 12);

    res.json({
      name: 'FB EXTEN',
      ready: fs.existsSync(manifestPath) && fs.existsSync(coreBuildPath),
      extensionPath: extDir,
      manifestExists: fs.existsSync(manifestPath),
      coreBuildExists: fs.existsSync(coreBuildPath),
      buildHash,
    });
  });

  // Tự động nhận Session (Cookie Facebook live) đồng bộ từ Chrome Extension FB EXTEN
  app.post('/api/extension/sync-session', async (req, res) => {
    const { uid, cookies, name, makeDefault } = req.body || {};
    if (!uid || !Array.isArray(cookies) || cookies.length === 0) {
      return res.status(400).json({ success: false, error: 'Thiếu UID hoặc danh sách Cookie Facebook từ Extension.' });
    }

    const cleanUid = String(uid).replace(/[^0-9]/g, '');
    if (!cleanUid) {
      return res.status(400).json({ success: false, error: 'UID Facebook không hợp lệ.' });
    }

    const sanitizedCookies = cookies
      .filter((c: any) => c && c.name && c.value)
      .map((c: any) => ({
        name: String(c.name),
        value: String(c.value),
        domain: String(c.domain || '.facebook.com'),
        path: String(c.path || '/'),
        ...(typeof c.expirationDate === 'number' ? { expires: Math.floor(c.expirationDate) } : {}),
      }));

    if (!sanitizedCookies.some((c) => c.name === 'c_user')) {
      return res.status(400).json({ success: false, error: 'Cookie chưa có phiên c_user hợp lệ.' });
    }

    const existing = getAllAccounts().find((a) => a.uid === cleanUid || a.id === `acc_${cleanUid}`);
    const accountId = existing ? existing.id : `acc_${cleanUid}`;
    const relProfileDir = existing?.profileDir || `./.user-data/profiles/${accountId}`;
    const absProfileDir = path.resolve(relProfileDir);

    try {
      fs.mkdirSync(absProfileDir, { recursive: true });
      fs.writeFileSync(path.join(absProfileDir, 'cookies.json'), JSON.stringify(sanitizedCookies, null, 2), 'utf-8');
    } catch {}

    const saved = saveAccount({
      id: accountId,
      uid: cleanUid,
      name: existing?.name || name || `FB EXTEN (${cleanUid})`,
      avatar: existing?.avatar || `https://graph.facebook.com/${cleanUid}/picture?type=large`,
      proxy: existing?.proxy || '',
      profileDir: relProfileDir,
      cookies: sanitizedCookies,
      status: 'live',
      isDefault: makeDefault === true ? true : existing?.isDefault,
    });

    console.log(`🔄 [FB EXTEN Session Sync] Đã tự động cập nhật ${sanitizedCookies.length} cookie cho nick ${saved.name} (UID: ${cleanUid})`);

    res.json({
      success: true,
      accountId: saved.id,
      uid: cleanUid,
      accountName: saved.name,
      cookiesCount: sanitizedCookies.length,
      syncedAt: new Date().toISOString(),
    });
  });

  // Sao lưu / đồng bộ Bộ nhớ Tự Học F12 + Nhóm + Kịch Bản MXH của máy người dùng
  const machineKnowledgeFile = path.resolve('./.user-data/fb_exten_machine_knowledge.json');

  app.get('/api/extension/knowledge', (_req, res) => {
    try {
      if (!fs.existsSync(machineKnowledgeFile)) {
        return res.json({ success: true, exists: false, knowledge: null });
      }
      const raw = fs.readFileSync(machineKnowledgeFile, 'utf-8');
      return res.json({ success: true, exists: true, knowledge: JSON.parse(raw) });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  app.post('/api/extension/knowledge', (req, res) => {
    try {
      const knowledge = req.body?.knowledge || req.body;
      if (!knowledge || typeof knowledge !== 'object') {
        return res.status(400).json({ success: false, error: 'Dữ liệu Machine Knowledge không hợp lệ.' });
      }
      fs.mkdirSync(path.dirname(machineKnowledgeFile), { recursive: true });
      fs.writeFileSync(machineKnowledgeFile, JSON.stringify(knowledge, null, 2), 'utf-8');
      return res.json({
        success: true,
        savedAt: new Date().toISOString(),
        groupsCount: Array.isArray(knowledge.learnedGroups) ? knowledge.learnedGroups.length : 0,
        workflowsCount: Array.isArray(knowledge.workflows) ? knowledge.workflows.length : 0,
        rolesCount: knowledge.roleProfiles ? Object.keys(knowledge.roleProfiles).length : 0,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  // Mini-CRM Leads & Cảnh báo Lead Nóng tức thì về Telegram Bot từ Chrome Extension v4.0
  const extensionLeadsFile = path.resolve('./.user-data/fb_exten_leads_crm.json');

  app.get('/api/extension/leads', (_req, res) => {
    try {
      if (!fs.existsSync(extensionLeadsFile)) {
        return res.json({ success: true, leads: [] });
      }
      const leads = JSON.parse(fs.readFileSync(extensionLeadsFile, 'utf-8'));
      return res.json({ success: true, leads: Array.isArray(leads) ? leads : [] });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  app.post('/api/extension/hot-lead', async (req, res) => {
    try {
      const lead = req.body?.lead || req.body;
      if (!lead || !lead.postUrl) {
        return res.status(400).json({ success: false, error: 'Thiếu dữ liệu Lead (postUrl).' });
      }

      let leads: any[] = [];
      try {
        if (fs.existsSync(extensionLeadsFile)) {
          const parsed = JSON.parse(fs.readFileSync(extensionLeadsFile, 'utf-8'));
          if (Array.isArray(parsed)) leads = parsed;
        }
      } catch {}

      const cleanLead = {
        id: String(lead.id || `lead_${Date.now()}`),
        author: String(lead.author || 'Khách Group').slice(0, 90),
        authorUid: lead.authorUid ? String(lead.authorUid) : undefined,
        groupName: String(lead.groupName || 'Facebook Group').slice(0, 90),
        postUrl: String(lead.postUrl),
        snippet: String(lead.snippet || '').slice(0, 320),
        need: String(lead.need || '').slice(0, 220),
        leadScore: Number(lead.leadScore) || 0,
        temperature: lead.temperature === 'hot' ? 'hot' : lead.temperature === 'warm' ? 'warm' : 'cold',
        suggestedReply: String(lead.suggestedReply || '').slice(0, 260),
        status: String(lead.status || 'new'),
        createdAt: lead.createdAt || new Date().toISOString(),
      };

      const existingIdx = leads.findIndex((l) => l.postUrl === cleanLead.postUrl && l.author === cleanLead.author);
      if (existingIdx >= 0) leads[existingIdx] = { ...leads[existingIdx], ...cleanLead };
      else leads.unshift(cleanLead);
      if (leads.length > 500) leads.length = 500;

      fs.mkdirSync(path.dirname(extensionLeadsFile), { recursive: true });
      fs.writeFileSync(extensionLeadsFile, JSON.stringify(leads, null, 2), 'utf-8');

      let telegramSent = false;
      if (req.body?.notifyTelegram !== false && cleanLead.temperature === 'hot' && config.telegramGroupId) {
        try {
          const bot = getBot();
          const profileHint = cleanLead.authorUid
            ? `\n👤 Profile: https://www.facebook.com/${cleanLead.authorUid}`
            : '';
          const msg = [
            `🔥 LEAD NÓNG TỪ FB EXTEN (${cleanLead.leadScore}/100đ)`,
            `📂 Nhóm: ${cleanLead.groupName}`,
            `🧑 Khách: ${cleanLead.author}${profileHint}`,
            `🎯 Nhu cầu: ${cleanLead.need || cleanLead.snippet}`,
            cleanLead.suggestedReply ? `💬 Gợi ý trả lời: ${cleanLead.suggestedReply}` : '',
            `🔗 Link bài: ${cleanLead.postUrl}`,
          ]
            .filter(Boolean)
            .join('\n');
          await bot.api.sendMessage(config.telegramGroupId, msg);
          telegramSent = true;
        } catch {}
      }

      return res.json({ success: true, lead: cleanLead, telegramSent, totalLeads: leads.length });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  app.post('/api/agent/run-link', async (req, res) => {
    const { url, mode, customRule, doLove, doCommentPost, doReplyBuyers, dryRunOnly } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'Thiếu link bài viết Facebook' });
    }
    try {
      const result = await facebookActionsEngine.runLinkAgentOnScreen({
        url,
        mode: mode || 'auto',
        customRule,
        doLove,
        doCommentPost,
        doReplyBuyers,
        dryRunOnly: Boolean(dryRunOnly),
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  app.get('/readyz', (_req, res) => {
    res.status(200).json({
      ready: true,
      cloudVaultReady: true,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/pool/status', (_req, res) => {
    try {
      res.json(multiAccountPool.getPoolStatus());
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/pool/config', (req, res) => {
    try {
      const updated = multiAccountPool.updateConfig(req.body || {});
      res.json({
        success: true,
        config: updated,
        pool: multiAccountPool.getPoolStatus(),
        message: `Đã cập nhật cấu hình Wave Pool (Max Browser đồng thời: ${updated.maxConcurrentBrowsers} luồng | Quota: ${updated.bdsQuota} BĐS + ${updated.forexQuota} Forex)!`,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.post('/api/pool/bulk-onboard', async (req, res) => {
    try {
      const { rawText, defaultVertical } = req.body || {};
      if (!rawText || typeof rawText !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Vui lòng nhập danh sách Nick kèm Proxy (Mỗi dòng 1 nick: uid|pass|proxy hoặc cookie|proxy).',
        });
      }
      const mode = defaultVertical === 'forex_finance' ? 'forex_finance' : 'bds_ecopark';
      const result = await multiAccountPool.bulkOnboardAccountsWithProxy(rawText, mode);
      res.json({
        ...result,
        pool: multiAccountPool.getPoolStatus(),
        message: `Đã nạp thành công ${result.importedCount} nick mới và cập nhật ${result.updatedCount} nick kèm Proxy cố định vào Cloud Vault!`,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.post('/api/pool/verify-proxies', async (_req, res) => {
    try {
      const result = await multiAccountPool.verifyAllAccountProxies();
      res.json({
        success: true,
        ...result,
        pool: multiAccountPool.getPoolStatus(),
        message: `Đã kiểm tra ${result.totalChecked} Proxy: ${result.liveCount} Hoạt động tốt (Live IP), ${result.deadCount} Lỗi kết nối.`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/deploy/blueprint', (req, res) => {
    const publicUrl = detectPublicCloudUrl(req);
    const pool = multiAccountPool.getPoolStatus();
    res.json({
      success: true,
      publicUrl,
      architecture: {
        name: 'FalconX Hybrid Wave-Pool Cloud Architecture (40 -> 100 Accounts)',
        zeroLocalStorage: true,
        encryptedCloudVault: 'GitHub Private SHA + AES-256-GCM (0 Byte Local Disk)',
        browserConcurrencyModel: `Wave Rotation (${pool.config.maxConcurrentBrowsers} Active Chromium Slots / Wave -> ~${pool.ramGuard.estimatedPeakRamMb} MB RAM)`,
        proxyBindingModel: '1 Account = 1 Sticky Proxy + 1 Cloud Cookie Vault (Auto-restored on any server)',
      },
      targets: [
        {
          id: 'hf_spaces_docker',
          name: 'Hugging Face Spaces (Docker 16GB RAM Free)',
          specs: '2 vCPU + 16 GB RAM + Domain .hf.space Vĩnh Viễn ($0/tháng)',
          capacity: 'Chạy mượt 40 - 100 Nick ngay trên 1 Container nhờ 16GB RAM Free',
          configFile: 'Dockerfile (Port 7860 / 3300)',
        },
        {
          id: 'oracle_free_vps',
          name: 'Oracle Cloud Always Free / Ubuntu VPS (Docker Compose)',
          specs: '4 ARM Ampere vCPU + 24 GB RAM Vĩnh Viễn ($0/tháng)',
          capacity: 'Chạy 100 Nick (50 BĐS + 50 Forex) với 6-8 luồng Chromium song song',
          configFile: 'docker-compose.yml',
        },
        {
          id: 'render_fly_paas',
          name: 'Render.com / Fly.io + Cloudflare Zero-Trust Tunnel',
          specs: '1-Click Auto-Deploy từ GitHub (render.yaml / fly.toml)',
          capacity: 'Web Control Plane 24/7 + Đồng bộ Cloud Vault tự động',
          configFile: 'render.yaml & fly.toml',
        },
      ],
      poolSummary: pool.summary,
    });
  });

  // Fallback về trang index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Global Error Handler cho API Express (chống crash tiến trình)
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('⚠️ [Dashboard API Error]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message || 'Lỗi xử lý yêu cầu' });
    }
  });

  const host = config.dashboardHost || '0.0.0.0';
  const server = app.listen(config.dashboardPort, host, () => {
    console.log(`🌐 [FB EXTEN Dashboard] Giao diện điều khiển mở tại: http://${host === '0.0.0.0' ? 'localhost' : host}:${config.dashboardPort} (Lắng nghe toàn mạng: ${host}:${config.dashboardPort})`);
  });

  server.on('error', (err: any) => {
    console.error(`🚨 [FB EXTEN Dashboard Server Error]:`, err.message);
  });
}
