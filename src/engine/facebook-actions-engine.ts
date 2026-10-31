import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { detectCheckpoint } from '../core/checkpoint-guard.js';
import {
  humanHoverAndClick,
  humanLingerAfterAction,
  humanMoveMouseRandomly,
  humanScroll,
  randomSleep,
} from '../core/human-behavior.js';
import { messengerEngine } from './messenger-engine.js';
import { getTargetGroups } from '../db/auto-comment-store.js';
import { globalLeadPoolService } from '../services/global-lead-pool.js';
import { getDefaultAccount } from '../db/store.js';
import { orchestrationService } from './orchestration-service.js';

export type FacebookReaction = 'like' | 'love';

export interface JoinGroupResult {
  groupUrl: string;
  groupName: string;
  status: 'joined' | 'already_joined' | 'pending_approval' | 'questions_required' | 'failed';
  message: string;
  screenshotPath?: string;
}

export interface GroupMemberProfile {
  id: string;
  name: string;
  url: string;
  subtitle?: string;
  joinedTimeText?: string;
  timeCategory?: '2_days' | '1_week' | '2_weeks' | 'older';
  timeCategoryLabel?: string;
  sourceGroup?: string;
}

export interface MemberScanGroupRecord {
  knownIds: string[];
  lastScannedAt: string;
  members?: GroupMemberProfile[];
}

export interface MemberScanState {
  groups: Record<string, MemberScanGroupRecord>;
}

const memberScanFile = path.resolve('./data/facebook_member_scan.json');

function readMemberScanState(): MemberScanState {
  try {
    const parsed = JSON.parse(fs.readFileSync(memberScanFile, 'utf8')) as MemberScanState;
    return parsed && typeof parsed.groups === 'object' ? parsed : { groups: {} };
  } catch {
    return { groups: {} };
  }
}

function writeMemberScanState(state: MemberScanState): void {
  fs.mkdirSync(path.dirname(memberScanFile), { recursive: true });
  fs.writeFileSync(memberScanFile, JSON.stringify(state, null, 2), 'utf8');
}

function facebookUrl(input: string): URL {
  const url = new URL(input);
  if (!['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(url.hostname.toLowerCase())) {
    throw new Error('Chỉ chấp nhận đường dẫn facebook.com.');
  }
  return url;
}

async function openFacebookTarget(page: Page, targetUrl: string): Promise<void> {
  const url = facebookUrl(targetUrl);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  // 1. Kiểm tra nếu bị văng ra màn hình chọn nick / splash One-click login
  const splashContinue = page.locator('button, div[role="button"], a[role="button"]').filter({ hasText: /^(tiếp tục|continue|eco trang)$/i }).first();
  if (await splashContinue.isVisible().catch(() => false)) {
    console.log('[FacebookActions] Phát hiện màn hình chờ tiếp tục Eco Trang -> Click đăng nhập lại...');
    await splashContinue.click();
    await page.waitForTimeout(3500);
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
  }

  const checkpoint = await detectCheckpoint(page);
  if (checkpoint.isCheckpoint) {
    throw new Error(checkpoint.reason || 'Facebook yêu cầu đăng nhập hoặc xác minh tài khoản.');
  }

  // Tự động bấm Tiếp tục / Đóng các popup chính sách hoặc cảnh báo Marketplace nếu có
  const policyBtn = await firstVisibleButton(page, /^(tiếp tục|continue|đóng|bỏ qua|ok)$/i);
  if (policyBtn) {
    await policyBtn.click().catch(() => {});
    await page.waitForTimeout(2500);
  }
}

async function firstVisibleButton(page: Page, names: RegExp): Promise<Locator | null> {
  const candidate = page.getByRole('button', { name: names }).first();
  if (await candidate.isVisible().catch(() => false)) return candidate;

  const fallbacks = page.locator('[role="button"][aria-label]');
  const count = Math.min(await fallbacks.count().catch(() => 0), 80);
  for (let index = 0; index < count; index++) {
    const fallback = fallbacks.nth(index);
    const label = await fallback.getAttribute('aria-label').catch(() => null);
    if (label && names.test(label) && (await fallback.isVisible().catch(() => false))) return fallback;
  }
  return null;
}

async function firstVisibleButtonInScope(scope: Locator, names: RegExp): Promise<Locator | null> {
  const candidate = scope.getByRole('button', { name: names }).first();
  if (await candidate.isVisible().catch(() => false)) return candidate;

  const fallbacks = scope.locator('[role="button"][aria-label]');
  const count = Math.min(await fallbacks.count().catch(() => 0), 40);
  for (let index = 0; index < count; index++) {
    const fallback = fallbacks.nth(index);
    const label = await fallback.getAttribute('aria-label').catch(() => null);
    if (label && names.test(label) && (await fallback.isVisible().catch(() => false))) return fallback;
  }
  return null;
}

/**
 * 🎯 TRỎ ĐÚNG NHÃN TRONG F12 ĐÚNG CHỮ "Thêm bạn bè":
 * - Ưu tiên số 1: [role="button"][aria-label="Thêm bạn bè"] hoặc span/div chứa đúng chữ "Thêm bạn bè"
 * - Ưu tiên số 2: [role="button"][aria-label^="Thêm "][aria-label$=" làm bạn bè"] có text hiển thị "Thêm bạn bè"
 * - Tuyệt đối loại trừ "Tìm bạn bè" trên thanh Header, "Hủy lời mời", "Đã gửi lời mời", "Nhắn tin", "Bạn bè".
 */
export async function findExactAddFriendButton(page: Page): Promise<Locator | null> {
  const mainScope = page.locator('div[role="main"]').first();
  const rootScope = (await mainScope.isVisible().catch(() => false)) ? mainScope : page.locator('body');

  const exactSelectors = [
    '[role="button"][aria-label="Thêm bạn bè"]',
    'div[role="button"]:has(span:text-is("Thêm bạn bè"))',
    'button:has-text("Thêm bạn bè")',
    '[role="button"][aria-label^="Thêm "][aria-label$=" làm bạn bè"]',
    '[role="button"][aria-label="Add friend"]',
    'div[role="button"]:has(span:text-is("Add friend"))',
    '[role="button"][aria-label^="Add "][aria-label$=" as a friend"]',
  ];

  for (const sel of exactSelectors) {
    const candidates = rootScope.locator(sel);
    const count = Math.min(await candidates.count().catch(() => 0), 15);
    for (let i = 0; i < count; i++) {
      const btn = candidates.nth(i);
      if (!(await btn.isVisible().catch(() => false))) continue;

      const isAllowed = await btn
        .evaluate((el) => {
          if (el.closest('[role="banner"], [role="navigation"], header')) return false;
          const aria = (el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
          const txt = ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim();

          if (/tìm bạn bè|hủy lời mời|đã gửi lời mời|nhắn tin|theo dõi|bạn bè chung|find friends|cancel request/i.test(aria + ' ' + txt)) {
            if (!(/^Thêm\s+.+\s+làm bạn bè$/i.test(aria) && txt === 'Thêm bạn bè')) {
              return false;
            }
          }

          return (
            aria === 'Thêm bạn bè' ||
            txt === 'Thêm bạn bè' ||
            (/^Thêm\s+.+\s+làm bạn bè$/i.test(aria) && (txt === 'Thêm bạn bè' || txt === '')) ||
            aria === 'Add friend' ||
            txt === 'Add friend'
          );
        })
        .catch(() => false);

      if (isAllowed) {
        return btn;
      }
    }
  }

  return null;
}

/**
 * 🛡️ CHỐNG CHECKPOINT HỘP THOẠI CẢNH BÁO KẾT BẠN CỦA FACEBOOK:
 * Tự động phát hiện và đóng popup "Bạn có biết người này ngoài đời không?" / "Chỉ gửi lời mời kết bạn cho những người bạn biết"
 */
export async function handleAddFriendCheckpointModal(page: Page): Promise<{ warned: boolean; reason?: string }> {
  const dialogs = page.locator('div[role="dialog"]');
  const count = Math.min(await dialogs.count().catch(() => 0), 5);
  for (let i = 0; i < count; i++) {
    const dlg = dialogs.nth(i);
    if (!(await dlg.isVisible().catch(() => false))) continue;
    const text = ((await dlg.innerText().catch(() => '')) || '').toLowerCase();
    if (
      text.includes('bạn có biết người này') ||
      text.includes('chỉ gửi lời mời kết bạn cho những người bạn biết') ||
      text.includes('do you know this person') ||
      text.includes('only send friend requests to people you know') ||
      text.includes('tạm thời bị chặn')
    ) {
      const cancelBtn = await firstVisibleButtonInScope(dlg, /^(hủy|huỷ|đóng|cancel|close|ok)$/i);
      if (cancelBtn) {
        await cancelBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      }
      return {
        warned: true,
        reason: 'Phát hiện cảnh báo giới hạn kết bạn của Facebook ("Bạn có biết người này ngoài đời không?"). Đã tự động đóng hộp thoại và dừng bảo vệ nick chống Checkpoint.',
      };
    }
  }
  return { warned: false };
}

/**
 * Bộ tạo câu trả lời thông minh dựa trên ngữ cảnh câu hỏi nhóm Facebook
 */
export function generateSmartAnswer(questionPrompt: string, groupName: string = ''): string {
  const q = (questionPrompt + ' ' + groupName).toLowerCase();

  // 1. Số điện thoại / Zalo / Liên hệ
  if (/số điện thoại|sđt|sdt|phone|zalo|hotline|liên hệ/i.test(q)) {
    return '0981992137';
  }

  // 2. Hỏi về phân khu / tòa nhà / căn hộ / nơi ở
  if (/tòa|phân khu|khu vực|căn hộ|ở đâu|địa chỉ|rừng cọ|westbay|aquabay|sky oasis|sol forest|haven|onsen|landmark/i.test(q)) {
    return 'Sol Forest & Sky Oasis Ecopark';
  }

  // 3. Hỏi vai trò / Bạn là ai (Cư dân / Môi giới / Chủ nhà / Khách thuê)
  if (/bạn là ai|vai trò|nghề nghiệp|công việc|cư dân hay|môi giới hay|chính chủ hay/i.test(q)) {
    return 'Em là cư dân kiêm môi giới BĐS uy tín tại Ecopark ạ.';
  }

  // 4. Mục đích tham gia / Lý do
  if (/mục đích|lý do|tại sao|nhu cầu|tham gia để/i.test(q)) {
    return 'Em tham gia để giao lưu cư dân, cập nhật thông tin và hỗ trợ cư dân tìm thuê/mua bán căn hộ Ecopark uy tín ạ.';
  }

  // 5. Cam kết / Nội quy / Spam / Quy định
  if (/cam kết|nội quy|quy tắc|quy định|spam|đồng ý|tuân thủ/i.test(q)) {
    return 'Em đã đọc kỹ và cam kết tuân thủ 100% nội quy của nhóm.';
  }

  // 6. Tên / Họ tên
  if (/họ tên|tên bạn|tên gì/i.test(q)) {
    return 'Eco Trang';
  }

  // Mặc định lịch sự, chân thành
  return 'Em là cư dân Ecopark, tham gia nhóm với tinh thần văn minh, lịch sự và tuân thủ đầy đủ nội quy nhóm ạ.';
}

export class FacebookActionsEngine {
  /**
   * Đọc các hồ sơ hiển thị đầu tiên trong trang thành viên của group, rồi so với lần quét trước.
   * Lần đầu chỉ tạo mốc tham chiếu, không gắn nhãn các thành viên hiện có là mới.
   */
  /**
   * Quét thành viên mới tham gia nhóm Facebook theo tư duy KudoX 2:
   * 1. Bắt trực tiếp luồng phản hồi tầng thấp /api/graphql/ (trích xuất cấu trúc cây UID, Tên thật, Timestamp)
   * 2. Tự động đóng modal popup Facebook, tìm và nhấp chọn nhãn "Mọi người" / "Thành viên" / "Bạn bè"
   * 3. Fallback bóc tách DOM sâu theo các liên kết /groups/.../user/<uid>, /people/<uid>, profile.php?id=<uid>
   * 4. Phân loại chuẩn xác 3 mốc thời gian: 2 ngày gần nhất, 1 tuần, 2 tuần
   */
  public async scanRecentGroupMembers(groupUrl: string, resetBaseline: boolean = false): Promise<{
    members: GroupMemberProfile[];
    newMembers: GroupMemberProfile[];
    baselineCreated: boolean;
  }> {
    try {
      const res = await this.scanRecentGroupMembersRaw(groupUrl, resetBaseline);
      orchestrationService.record('scan_members', {
        targetName: groupUrl,
        targetUrl: groupUrl,
        status: 'success',
        message: res.baselineCreated
          ? `Tạo mốc quét đầu tiên: ghi nhận ${res.members.length} thành viên (chưa tính là khách mới).`
          : `Quét xong: ${res.members.length} thành viên, ${res.newMembers.length} thành viên mới.`,
        count: res.baselineCreated ? 1 : Math.max(1, res.newMembers.length),
      });
      return res;
    } catch (err: any) {
      orchestrationService.record('scan_members', { targetName: groupUrl, targetUrl: groupUrl, status: 'failed', message: err.message });
      throw err;
    }
  }

  private async scanRecentGroupMembersRaw(groupUrl: string, resetBaseline: boolean = false): Promise<{
    members: GroupMemberProfile[];
    newMembers: GroupMemberProfile[];
    baselineCreated: boolean;
  }> {
    const group = facebookUrl(groupUrl);
    if (!/^\/groups\//i.test(group.pathname)) throw new Error('Đường dẫn cần là một Facebook Group.');

    const cleanPath = group.pathname.replace(/\/+$/, '');
    const targetGroupId = cleanPath.split('/groups/')[1]?.replace(/\/.*$/, '') || '';
    const groupKey = group.origin + cleanPath;

    return messengerEngine.withNewFacebookPage(async (page) => {
      const discoveredGraphql = new Map<string, GroupMemberProfile>();
      let isInterceptorActive = true;

      // === TẦNG 1: KUDOX 2 GRAPHQL INTERCEPTOR ===
      page.on('response', async (response) => {
        if (!isInterceptorActive) return;
        const resUrl = response.url();
        if (!resUrl.includes('/api/graphql/')) return;

        try {
          const text = await response.text().catch(() => '');
          if (!text) return;

          const lines = text.split('\n').filter((l) => l.trim().length > 0);
          for (const line of lines) {
            try {
              const payload = JSON.parse(line);
              traverseGraphqlMembers(payload);
            } catch {}
          }
        } catch {}
      });

      function traverseGraphqlMembers(root: unknown) {
        const seen = new WeakSet<object>();
        const visit = (val: unknown, path: string[] = []) => {
          if (!val || typeof val !== 'object' || seen.has(val)) return;
          seen.add(val);

          if (Array.isArray(val)) {
            val.forEach((item, idx) => visit(item, [...path, String(idx)]));
            return;
          }

          const rec = val as Record<string, any>;
          const candidate = rec.user || rec.actor || rec.author || rec.commenter || rec.node || rec;
          if (candidate && typeof candidate === 'object') {
            const rawId = candidate.id || candidate.uid || candidate.userID;
            const uid = rawId ? String(rawId).trim() : '';
            const rawName = candidate.name;
            const name = rawName ? String(rawName).trim() : '';
            const profileUrl = candidate.url || candidate.permalink_url;

            if (uid && name && uid !== targetGroupId && uid.length >= 4 && !/^\d{1,3}$/.test(uid) && name.length >= 2) {
              const isSystemName = /facebook|cộng đồng|thuê nhà|mua bán|bất động sản|ecopark|hội cư dân|group|admin|quản trị|thành viên|bạn bè/i.test(name);
              if (!isSystemName && !discoveredGraphql.has(uid)) {
                const timeRaw = rec.created_time || rec.creation_time || rec.timestamp || rec.joined_time;
                let timeCategory: '2_days' | '1_week' | '2_weeks' | 'older' = '2_days';
                let timeCategoryLabel = '🔥 2 ngày gần nhất (Cực Hot)';
                let joinedTimeText = 'Mới tham gia / Vừa hoạt động';

                if (timeRaw) {
                  const postDate = new Date(typeof timeRaw === 'number' ? (timeRaw > 1e11 ? timeRaw : timeRaw * 1000) : timeRaw);
                  const diffHours = (Date.now() - postDate.getTime()) / (1000 * 3600);
                  if (diffHours <= 48) {
                    timeCategory = '2_days';
                    timeCategoryLabel = '🔥 2 ngày gần nhất (Cực Hot)';
                    joinedTimeText = diffHours < 1 ? 'Vừa xong' : `${Math.round(diffHours)} giờ trước`;
                  } else if (diffHours <= 168) {
                    timeCategory = '1_week';
                    timeCategoryLabel = '⚡ 1 tuần gần nhất';
                    joinedTimeText = `${Math.round(diffHours / 24)} ngày trước`;
                  } else if (diffHours <= 336) {
                    timeCategory = '2_weeks';
                    timeCategoryLabel = '📅 2 tuần gần nhất';
                    joinedTimeText = `${Math.round(diffHours / 24)} ngày trước`;
                  } else {
                    timeCategory = 'older';
                    timeCategoryLabel = 'Thành viên cũ (> 2 tuần)';
                    joinedTimeText = `${Math.round(diffHours / 24)} ngày trước`;
                  }
                }

                discoveredGraphql.set(uid, {
                  id: uid,
                  name,
                  url: profileUrl || `https://www.facebook.com/${uid}`,
                  subtitle: joinedTimeText,
                  joinedTimeText,
                  timeCategory,
                  timeCategoryLabel,
                });
              }
            }
          }

          for (const [k, v] of Object.entries(rec)) {
            visit(v, [...path, k]);
          }
        };

        visit(root);
      }

      // === TẦNG 2: ĐIỀU HƯỚNG THÔNG MINH QUA CÁC NHÃN / TABS ===
      const navTargetUrl = `${group.origin}${cleanPath}/?sorting_setting=CHRONOLOGICAL`;
      console.log(`[KudoX Scanner] Đang mở nhóm Facebook: ${navTargetUrl}`);
      await page.goto(navTargetUrl, { waitUntil: 'domcontentloaded', timeout: 50000 });
      await page.waitForTimeout(3000);

      // Đóng popup "Xem thêm trên Facebook" nếu có
      const popups = page.locator('div[aria-label="Đóng"], div[aria-label="Close"], [role="button"]:has-text("Đóng"), [role="button"]:has-text("Để sau")');
      if (await popups.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[KudoX Scanner] Đã đóng modal popup Facebook.');
        await popups.first().click().catch(() => {});
        await page.waitForTimeout(1000);
      }

      // Tìm và nhấp vào nhãn "Mọi người" / "Thành viên" / "Bạn bè"
      const memberTab = page.locator('a[href*="/members"], div[role="tab"]:has-text("Mọi người"), div[role="tab"]:has-text("Thành viên"), a:has-text("Mọi người"), a:has-text("Thành viên")').first();
      if (await memberTab.isVisible({ timeout: 2500 }).catch(() => false)) {
        console.log('[KudoX Scanner] Phát hiện nhãn Thành viên / Mọi người, đang chuyển tab...');
        await memberTab.click().catch(() => {});
        await page.waitForTimeout(2500);
      } else {
        console.log('[KudoX Scanner] Quét trực tiếp luồng thành viên hoạt động mới nhất trong nhóm...');
      }

      // Cuộn trang sâu 8 lần để nạp đầy đủ danh sách thành viên mới gia nhập
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollBy(0, 1800)).catch(() => {});
        await page.waitForTimeout(1200);
      }

      // === TẦNG 3: BÓC TÁCH DOM NÂNG CAO ===
      const domMembers = (await page.evaluate(() => {
        const results: Array<{
          id: string;
          name: string;
          url: string;
          subtitle?: string;
          joinedTimeText?: string;
          timeCategory?: string;
          timeCategoryLabel?: string;
        }> = [];
        const seen = new Set<string>();

        const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));

        for (const anchor of anchors) {
          try {
            const href = anchor.href || '';
            const url = new URL(href);
            if (!/(^|\.)facebook\.com$/i.test(url.hostname)) continue;

            let id = '';
            let profileUrl = '';

            // 1. Nhận diện dạng /groups/<slug_or_id>/user/<uid_or_username>/
            const groupUserMatch = url.pathname.match(/\/groups\/[^/]+\/user\/([^/?#]+)/i);
            if (groupUserMatch) {
              id = groupUserMatch[1];
              profileUrl = /^\d+$/.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : `https://www.facebook.com/${id}`;
            }
            // 2. Nhận diện dạng /people/<name>/<uid>/
            else if (url.pathname.includes('/people/')) {
              const peopleMatch = url.pathname.match(/\/people\/[^/]+\/(\d+)/i);
              if (peopleMatch) {
                id = peopleMatch[1];
                profileUrl = `https://www.facebook.com/profile.php?id=${id}`;
              }
            }
            // 3. Nhận diện dạng /profile.php?id=<uid>
            else if (url.pathname.includes('profile.php') && url.searchParams.get('id')) {
              id = url.searchParams.get('id') || '';
              profileUrl = `https://www.facebook.com/profile.php?id=${id}`;
            }
            // 4. Nhận diện dạng vanity username: /<username>
            else {
              const parts = url.pathname.split('/').filter(Boolean);
              const ignored = new Set([
                'groups', 'pages', 'events', 'watch', 'marketplace', 'reel', 'stories', 'story.php',
                'friends', 'messages', 'notifications', 'search', 'photo', 'photos', 'login', 'help', 'settings',
                'saved', 'gaming', 'ad_center', 'ads', 'policies', 'privacy', 'terms', 'groupslanding', 'dialog',
                'reg', 'r.php', 'lite', 'l.php', 'careers', 'allactivity'
              ]);
              if (parts.length === 1 && !ignored.has(parts[0].toLowerCase())) {
                id = parts[0];
                profileUrl = `https://www.facebook.com/${id}`;
              }
            }

            if (!id || seen.has(id) || id.length < 3) continue;

            // Trích xuất Tên thành viên và thông tin phụ
            let name = (anchor.innerText || anchor.getAttribute('aria-label') || '').trim();
            let subtitle = '';

            let container: HTMLElement | null = anchor.parentElement;
            for (let depth = 0; depth < 5 && container; depth++, container = container.parentElement) {
              const fullText = (container.innerText || '').trim();
              if (fullText && fullText.length < 300) {
                const lines = fullText.split('\n').map((l) => l.trim()).filter(Boolean);
                if (lines.length >= 1) {
                  if (!name || name.length < 2) {
                    name = lines[0];
                  }
                  if (lines.length >= 2) {
                    subtitle = lines.slice(1).filter((l) => !/thêm bạn|nhắn tin|xem thêm/i.test(l)).join(' • ');
                  }
                  break;
                }
              }
            }

            if (!name || /^(xem tất cả|thành viên|quản trị viên|admin|người kiểm duyệt|tham gia|tìm kiếm|nhóm|bạn bè|đăng ký|đăng nhập|facebook lite|instagram|tuyển dụng|nhật ký hoạt động)$/i.test(name)) continue;
            if (/đã mời bạn tham gia nhóm/i.test(name)) continue;

            seen.add(id);

            // Bóc tách mốc thời gian gia nhập (2 ngày, 1 tuần, 2 tuần gần nhất)
            const cleanSub = (subtitle || '').toLowerCase();
            let timeCategory: '2_days' | '1_week' | '2_weeks' | 'older' = '2_days';
            let timeCategoryLabel = '🔥 2 ngày gần nhất (Cực Hot)';
            let joinedTimeText = subtitle || 'Vừa xong';

            if (/vừa xong|phút trước|giờ trước|hôm nay|hôm qua|1 ngày|2 ngày|minute|hour|today|yesterday|1 day|2 days/i.test(cleanSub)) {
              timeCategory = '2_days';
              timeCategoryLabel = '🔥 2 ngày gần nhất (Cực Hot)';
              joinedTimeText = /hôm qua|yesterday/i.test(cleanSub) ? 'Hôm qua (~1 ngày)' : /hôm nay|today/i.test(cleanSub) ? 'Hôm nay (< 24h)' : joinedTimeText;
            } else if (/3 ngày|4 ngày|5 ngày|6 ngày|7 ngày|1 tuần|tuần qua|tuần này|3 days|4 days|5 days|6 days|7 days|1 week/i.test(cleanSub)) {
              timeCategory = '1_week';
              timeCategoryLabel = '⚡ 1 tuần gần nhất';
            } else if (/8 ngày|9 ngày|10 ngày|11 ngày|12 ngày|13 ngày|14 ngày|2 tuần|2 weeks/i.test(cleanSub)) {
              timeCategory = '2_weeks';
              timeCategoryLabel = '📅 2 tuần gần nhất';
            }

            results.push({
              id,
              name,
              url: profileUrl,
              subtitle,
              joinedTimeText,
              timeCategory,
              timeCategoryLabel,
            });
            if (results.length >= 250) break;
          } catch {
            // Bỏ qua liên kết không phải hồ sơ
          }
        }

        return results;
      }).catch(() => [])) as GroupMemberProfile[];

      isInterceptorActive = false;

      // HỢP NHẤT GRAPHQL VÀ DOM: Đảm bảo 100% ra người thật
      const memberMap = new Map<string, GroupMemberProfile>();
      for (const m of discoveredGraphql.values()) {
        memberMap.set(m.id, m);
      }
      for (const m of domMembers) {
        if (!memberMap.has(m.id)) {
          memberMap.set(m.id, m);
        } else {
          const ex = memberMap.get(m.id)!;
          if (m.name && m.name.length > ex.name.length) ex.name = m.name;
          if (m.subtitle) ex.subtitle = m.subtitle;
        }
      }

      const members = Array.from(memberMap.values());

      if (members.length === 0) {
        throw new Error('Không tìm thấy hồ sơ thành viên hiển thị. Hãy kiểm tra đường dẫn nhóm Facebook và quyền xem nội dung.');
      }

      const state = readMemberScanState();
      const previous = resetBaseline ? undefined : state.groups[groupKey];
      const baselineCreated = !previous;
      const known = new Set(previous?.knownIds || []);

      const newMembers = baselineCreated
        ? (members.filter((m) => m.timeCategory && m.timeCategory !== 'older').length > 0
            ? members.filter((m) => m.timeCategory && m.timeCategory !== 'older')
            : members)
        : members.filter((member) => !known.has(member.id));

      for (const member of members) known.add(member.id);

      state.groups[groupKey] = {
        knownIds: [...known].slice(-5000),
        lastScannedAt: new Date().toISOString(),
        members: members,
      };
      writeMemberScanState(state);

      // Đổ toàn bộ thành viên đào được vào Bể Khách Hàng Chung (Global Lead Pool - Kho Data Tích Lũy)
      try {
        const targetGroups = getTargetGroups();
        const matchedGroup = targetGroups.find(g => g.url && groupUrl.includes(g.url.split('/groups/')[1]?.replace(/\/+$/, '') || '---'));
        const groupName = matchedGroup?.name || (await page.title().catch(() => 'Facebook Group')).replace(/\|.*$/, '').trim();
        const mode = (groupUrl.toLowerCase().includes('forex') || groupUrl.toLowerCase().includes('trading') || groupUrl.toLowerCase().includes('gold') || groupUrl.toLowerCase().includes('xau')) ? 'forex' : 'bds_ecopark';
        globalLeadPoolService.ingestScannedMembers(members, groupUrl, groupName, mode);
      } catch (e: any) {
        console.warn('[GlobalLeadPool] Lỗi nạp thành viên vào bể chung:', e.message);
      }

      console.log(`✅ [KudoX Scanner] Quét hoàn tất nhóm ${groupKey}: Tìm thấy ${members.length} thành viên (${newMembers.length} thành viên mới)!`);

      return { members, newMembers, baselineCreated };
    });
  }

  public async requestFriend(profileUrl: string): Promise<string> {
    try {
      const res = await this.requestFriendRaw(profileUrl);
      // Chỉ tính khi thật sự vừa gửi lời mời mới (không tính đã là bạn / đã có lời mời từ trước)
      if (/^Đã gửi một lời mời/i.test(res.message)) {
        orchestrationService.record('auto_friend', {
          targetName: profileUrl,
          targetUrl: profileUrl,
          status: 'success',
          message: res.message,
          screenshotUrl: res.screenshotUrl,
        });
      }
      return res.message;
    } catch (err: any) {
      orchestrationService.record('auto_friend', { targetName: profileUrl, targetUrl: profileUrl, status: 'failed', message: err.message });
      throw err;
    }
  }

  /**
   * Lấy toàn bộ danh sách thành viên đã quét từ các nhóm (kèm bộ lọc thời gian)
   * Phục vụ chế độ "Tự động kết bạn với danh sách đã quét"
   */
  public getScannedMembersList(filter: 'all' | '2_days' | '1_week' | '2_weeks' = 'all'): GroupMemberProfile[] {
    const state = readMemberScanState();
    const byId = new Map<string, GroupMemberProfile>();

    for (const [groupUrl, rec] of Object.entries(state.groups || {})) {
      if (Array.isArray(rec.members)) {
        for (const m of rec.members) {
          if (m && m.id && m.url && !byId.has(m.id)) {
            byId.set(m.id, {
              ...m,
              sourceGroup: m.sourceGroup || groupUrl,
            });
          }
        }
      }
    }

    // Bổ sung thêm các thành viên từ Global Lead Pool nếu có
    try {
      const wh = globalLeadPoolService.getWarehouseLeads({ limit: 300 });
      for (const lead of wh.leads) {
        const uid = lead.id;
        const url = lead.url;
        if (uid && url && !byId.has(uid)) {
          byId.set(uid, {
            id: uid,
            name: lead.name || 'Thành viên Group',
            url,
            subtitle: lead.joinedTimeText || lead.sourceGroupName || '',
            joinedTimeText: lead.joinedTimeText || 'Mới tham gia',
            timeCategory: (lead.timeCategory as any) || '2_days',
            timeCategoryLabel:
              lead.timeCategory === '1_week'
                ? '⚡ 1 tuần gần nhất'
                : lead.timeCategory === '2_weeks'
                  ? '📅 2 tuần gần nhất'
                  : '🔥 2 ngày gần nhất (Cực Hot)',
            sourceGroup: lead.sourceGroupName || lead.sourceGroup || 'Facebook Group',
          });
        }
      }
    } catch {}

    const all = Array.from(byId.values());
    if (filter === 'all') return all;
    return all.filter((m) => (m.timeCategory || '2_days') === filter);
  }

  private async requestFriendRaw(profileUrl: string): Promise<{ message: string; screenshotUrl?: string }> {
    const currentAcc = getDefaultAccount();
    const accountId = currentAcc?.id || 'default_acc';
    const accountName = currentAcc?.name || 'Tài khoản Facebook';

    // 1. Kiểm tra chống trùng kết bạn giữa các nick trong hệ thống
    const collision = globalLeadPoolService.checkFriendCollision(profileUrl, accountId);
    if (!collision.canSend) {
      throw new Error(collision.reason || 'Khách này đã được kết bạn bởi nick khác trong hệ thống.');
    }

    return messengerEngine.withNewFacebookPage(async (page) => {
      await openFacebookTarget(page, profileUrl);

      // 🧬 HÀNH VI HUMAN ANTI-CHECKPOINT:
      // Rê chuột tự nhiên theo đường cong Bezier + cuộn nhẹ xem hồ sơ 1.5s - 3.0s trước khi tìm nhãn "Thêm bạn bè"
      await humanMoveMouseRandomly(page).catch(() => {});
      await randomSleep(900, 1800);
      await humanScroll(page, 220).catch(() => {});
      await randomSleep(800, 1500);
      await page.mouse.wheel(0, -160).catch(() => {});

      const PENDING_REGEX = /(cancel\s*request|cancel\s*invitation|hủy\s*lời\s*mời|huỷ\s*lời\s*mời|hủy\s*yêu\s*cầu|huỷ\s*yêu\s*cầu|đã\s*gửi\s*lời\s*mời|đã\s*gửi\s*yêu\s*cầu|requested|chờ\s*xác\s*nhận)/i;

      // 🎯 Trỏ chuẩn xác nhãn F12 đúng chữ "Thêm bạn bè"
      const addButton = (await findExactAddFriendButton(page)) || (await firstVisibleButton(page, /^(thêm bạn bè|add friend)$/i));
      if (!addButton) {
        const alreadyFriend = await firstVisibleButton(page, /^(friends|bạn bè)$/i);
        if (alreadyFriend) {
          globalLeadPoolService.recordFriendRequestSent(profileUrl, accountId, accountName);
          return { message: 'Hai tài khoản đã là bạn bè; không gửi thêm lời mời.' };
        }
        const requestPending = await firstVisibleButton(page, PENDING_REGEX);
        if (requestPending) {
          globalLeadPoolService.recordFriendRequestSent(profileUrl, accountId, accountName);
          return { message: 'Đã có lời mời kết bạn đang chờ; không gửi thêm lời mời.' };
        }
        return { message: 'Hồ sơ này chặn kết bạn từ người lạ (chỉ cho phép theo dõi); đã bỏ qua an toàn.' };
      }

      // 🧬 Di chuyển chuột Bezier -> Hover dừng 350-850ms trên nhãn "Thêm bạn bè" -> Click
      await humanHoverAndClick(page, addButton);
      await humanLingerAfterAction(page);

      // 🛡️ Kiểm tra hộp thoại cảnh báo kết bạn của Facebook ("Bạn có biết người này ngoài đời không?")
      const modalGuard = await handleAddFriendCheckpointModal(page);
      if (modalGuard.warned) {
        throw new Error(modalGuard.reason || 'Facebook cảnh báo giới hạn kết bạn; đã tự động dừng bảo vệ nick chống Checkpoint.');
      }

      const requestPending = await firstVisibleButton(page, PENDING_REGEX);
      const isAddBtnGone = !(await addButton.isVisible().catch(() => false));
      if (!requestPending && !isAddBtnGone) {
        throw new Error('Facebook chưa xác nhận lời mời đã được gửi. Hãy kiểm tra hồ sơ trước khi thử lại.');
      }

      // 2. Ghi nhận đã gửi kết bạn vào Bể Data Chung để các nick khác tự động né
      globalLeadPoolService.recordFriendRequestSent(profileUrl, accountId, accountName);

      // Chụp ảnh bằng chứng
      let screenshotUrl: string | undefined;
      try {
        const proofDir = path.resolve('./data/proofs');
        if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
        const proofFile = `friend_${Date.now()}.png`;
        const proofPath = path.join(proofDir, proofFile);
        await page.screenshot({ path: proofPath, fullPage: false }).catch(() => {});
        if (fs.existsSync(proofPath)) screenshotUrl = `/proofs/${proofFile}`;
      } catch {}

      return { message: 'Đã gửi một lời mời kết bạn (nhãn F12 "Thêm bạn bè" • Human Anti-Checkpoint) đến hồ sơ đã chọn.', screenshotUrl };
    });
  }

  public async reactToStory(storyUrl: string, reaction: FacebookReaction): Promise<string> {
    return this.reactToTarget(storyUrl, reaction, 'Story');
  }

  public async reactToPost(postUrl: string, reaction: FacebookReaction): Promise<string> {
    return this.reactToTarget(postUrl, reaction, 'bài viết');
  }

  private async reactToTarget(targetUrl: string, reaction: FacebookReaction, label: string): Promise<string> {
    const type = label === 'Story' ? 'react_story' : 'react_post';
    try {
      const msg = await this.reactToTargetRaw(targetUrl, reaction, label);
      // Chỉ tính khi vừa thả cảm xúc mới (không tính 'đã Thích trước đó')
      if (/^Đã chọn/i.test(msg)) {
        orchestrationService.record(type, { targetName: targetUrl, targetUrl, status: 'success', message: msg });
      }
      return msg;
    } catch (err: any) {
      orchestrationService.record(type, { targetName: targetUrl, targetUrl, status: 'failed', message: err.message });
      throw err;
    }
  }

  private async reactToTargetRaw(targetUrl: string, reaction: FacebookReaction, label: string): Promise<string> {
    return messengerEngine.withNewFacebookPage(async (page) => {
      await openFacebookTarget(page, targetUrl);

      // Scope đúng container bài viết hoặc story viewer (Khắc phục lỗi F09: không click ngoài phạm vi)
      let scopeLocator: Locator;
      if (label === 'Story') {
        const storyViewer = page.locator('div[role="dialog"], div[data-pagelet*="Stories"], div[aria-label*="Story"]').first();
        scopeLocator = (await storyViewer.isVisible().catch(() => false)) ? storyViewer : page.locator('body');
      } else {
        const postArticle = page.locator('div[role="main"] div[role="article"], div[data-pagelet*="FeedUnit"]').first();
        scopeLocator = (await postArticle.isVisible().catch(() => false)) ? postArticle : page.locator('div[role="main"]');
      }

      const existingReaction = await firstVisibleButtonInScope(scopeLocator, /^(unlike|remove reaction|gỡ cảm xúc|bỏ thích)$/i);
      if (existingReaction && reaction === 'like') return `Nội dung này đã được Thích trước đó.`;

      const reactionButton = await firstVisibleButtonInScope(scopeLocator, /^(like|thích|react|bày tỏ cảm xúc)$/i);
      if (!reactionButton) throw new Error(`Không tìm thấy nút cảm xúc cho ${label} này.`);

      if (reaction === 'like') {
        await reactionButton.click({ timeout: 10000 });
        await page.waitForTimeout(1000);
        return `Đã chọn Thích cho ${label}.`;
      }

      await reactionButton.hover({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(900);
      let loveButton = await firstVisibleButton(page, /^(love|yêu thích)$/i);
      if (!loveButton) {
        await reactionButton.click({ timeout: 10000 });
        await page.waitForTimeout(700);
        loveButton = await firstVisibleButton(page, /^(love|yêu thích)$/i);
      }
      if (!loveButton) throw new Error('Facebook không hiển thị lựa chọn cảm xúc Yêu thích cho nội dung này.');

      await loveButton.click({ timeout: 10000 });
      await page.waitForTimeout(1000);
      return `Đã chọn Yêu thích cho ${label}.`;
    });
  }

  /**
   * Tham gia vào một nhóm Facebook mục tiêu bằng phiên đăng nhập hiện tại
   */
  public async joinGroup(groupUrl: string): Promise<JoinGroupResult> {
    const group = facebookUrl(groupUrl);
    if (!/^\/groups\//i.test(group.pathname)) {
      throw new Error('Đường dẫn cần là một Facebook Group.');
    }

    return messengerEngine.withNewFacebookPage(async (page) => {
      await openFacebookTarget(page, groupUrl);
      await page.waitForTimeout(2500);

      const proofDir = path.resolve('./.tmp_media/proofs');
      fs.mkdirSync(proofDir, { recursive: true });

      // Lấy tên nhóm từ header
      let groupName = (await page.locator('h1').first().textContent().catch(() => '')) || '';
      groupName = groupName.trim();

      // Kiểm tra trạng thái hiện tại trên giao diện nhóm
      // 1. Đã tham gia từ trước
      const alreadyJoinedBtn = await firstVisibleButton(page, /^(đã tham gia|joined|quản lý|manage)$/i);
      if (alreadyJoinedBtn) {
        const screenshotPath = path.join(proofDir, `proof_join_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
        return {
          groupUrl,
          groupName,
          status: 'already_joined',
          message: 'Tài khoản đã là thành viên của nhóm này từ trước.',
          screenshotPath,
        };
      }

      // 2. Đang có yêu cầu chờ duyệt từ trước
      const pendingBtn = await firstVisibleButton(page, /^(hủy yêu cầu|đã gửi yêu cầu|chờ duyệt|chờ phê duyệt|cancel request|pending)$/i);
      if (pendingBtn) {
        const screenshotPath = path.join(proofDir, `proof_join_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
        return {
          groupUrl,
          groupName,
          status: 'pending_approval',
          message: 'Đã có yêu cầu tham gia trước đó, đang chờ Quản trị viên duyệt.',
          screenshotPath,
        };
      }

      // 3. Tìm nút Tham gia nhóm
      let joinBtn = await firstVisibleButton(page, /^(tham gia nhóm|tham gia|join group|join)$/i);
      if (!joinBtn) {
        const candidate = page.locator('div[role="button"]:has-text("Tham gia"), div[role="button"]:has-text("Join")').first();
        if (await candidate.isVisible().catch(() => false)) {
          joinBtn = candidate;
        }
      }

      if (!joinBtn) {
        const screenshotPath = path.join(proofDir, `proof_join_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
        return {
          groupUrl,
          groupName,
          status: 'failed',
          message: 'Không tìm thấy nút Tham gia nhóm trên giao diện Facebook.',
          screenshotPath,
        };
      }

      // Click nút Tham gia
      await joinBtn.click({ timeout: 10000 });
      await page.waitForTimeout(3000);

      // 4. Xử lý popup trả lời câu hỏi / nội quy nhóm nếu có (Smart AI Form Auto-Filler)
      const dialog = page.locator('div[role="dialog"]').first();
      if (await dialog.isVisible().catch(() => false)) {
        console.log(`[Smart Form AI] Phát hiện câu hỏi duyệt nhóm tại: ${groupName || groupUrl}`);

        // A. Tự động tích chọn TẤT CẢ checkbox đồng ý quy tắc nhóm
        const checkboxes = dialog.locator('input[type="checkbox"], [role="checkbox"]');
        const cbCount = await checkboxes.count().catch(() => 0);
        for (let i = 0; i < cbCount; i++) {
          const cb = checkboxes.nth(i);
          const isChecked = (await cb.getAttribute('aria-checked')) === 'true' || (await cb.isChecked().catch(() => false));
          if (!isChecked) {
            await cb.click().catch(() => {});
            await page.waitForTimeout(250);
          }
        }

        // B. Tự động chọn Radio button phù hợp nếu có câu hỏi trắc nghiệm
        const radios = dialog.locator('[role="radio"], input[type="radio"]');
        const radioCount = await radios.count().catch(() => 0);
        for (let i = 0; i < radioCount; i++) {
          const radio = radios.nth(i);
          const radioText = await radio.evaluate((el) => el.closest('label, div[data-visualcompletion]')?.textContent || '').catch(() => '');
          if (/đồng ý|có|yes|tuân thủ|cư dân|môi giới/i.test(radioText)) {
            await radio.click().catch(() => {});
            await page.waitForTimeout(250);
          }
        }

        // C. Tự động đọc ngữ cảnh từng câu hỏi và điền câu trả lời thông minh
        const textInputs = dialog.locator('textarea, input[type="text"]');
        const inputCount = await textInputs.count().catch(() => 0);
        for (let i = 0; i < inputCount; i++) {
          const input = textInputs.nth(i);
          if (await input.isVisible().catch(() => false)) {
            const prompt = await input.evaluate((el) => {
              const container = el.closest('div[role="group"], div[data-visualcompletion], div') || el.parentElement;
              return container?.textContent || '';
            }).catch(() => '');
            const smartAnswer = generateSmartAnswer(prompt, groupName);
            console.log(`[Smart Form AI] Điền câu hỏi #${i + 1} (${prompt.slice(0, 50)}...): "${smartAnswer}"`);
            await input.fill(smartAnswer).catch(() => {});
            await page.waitForTimeout(300);
          }
        }

        // D. Bấm nút Gửi / Hoàn tất
        const submitBtn = await firstVisibleButtonInScope(dialog, /^(gửi|hoàn tất|xác nhận|submit|done|tiếp tục|next)$/i);
        if (submitBtn) {
          await submitBtn.click({ timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(3500);
        }
      }

      // 5. Kiểm tra lại trạng thái sau khi bấm
      const postJoinedBtn = await firstVisibleButton(page, /^(đã tham gia|joined|quản lý|manage)$/i);
      const postPendingBtn = await firstVisibleButton(page, /^(hủy yêu cầu|đã gửi yêu cầu|chờ duyệt|chờ phê duyệt|cancel request|pending)$/i);

      const screenshotPath = path.join(proofDir, `proof_join_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

      if (postJoinedBtn) {
        return {
          groupUrl,
          groupName,
          status: 'joined',
          message: 'Đã tham gia nhóm thành công!',
          screenshotPath,
        };
      } else if (postPendingBtn) {
        return {
          groupUrl,
          groupName,
          status: 'pending_approval',
          message: 'Đã gửi yêu cầu tham gia, đang chờ Quản trị viên duyệt.',
          screenshotPath,
        };
      } else {
        if (await dialog.isVisible().catch(() => false)) {
          return {
            groupUrl,
            groupName,
            status: 'questions_required',
            message: 'Đã mở khảo sát, nhóm yêu cầu trả lời thêm câu hỏi duyệt.',
            screenshotPath,
          };
        }
        return {
          groupUrl,
          groupName,
          status: 'joined',
          message: 'Đã thao tác gửi yêu cầu tham gia nhóm.',
          screenshotPath,
        };
      }
    });
  }

  /**
   * Tham gia tuần tự N nhóm đầu tiên trong danh sách mục tiêu
   */
  public async joinTopGroups(
    count: number = 15,
    onProgress?: (index: number, total: number, result: JoinGroupResult) => Promise<void>
  ): Promise<{
    results: JoinGroupResult[];
    total: number;
    joined: number;
    pending: number;
    alreadyJoined: number;
    failed: number;
  }> {
    const allGroups = getTargetGroups();
    const targets = allGroups.slice(0, count);
    const results: JoinGroupResult[] = [];

    for (let i = 0; i < targets.length; i++) {
      const g = targets[i];
      try {
        console.log(`[Join Group ${i + 1}/${targets.length}] Đang xử lý: ${g.name} (${g.url})...`);
        const result = await this.joinGroup(g.url);
        if (!result.groupName) result.groupName = g.name;
        results.push(result);
        console.log(`[Join Group ${i + 1}/${targets.length}] Kết quả: ${result.status} — ${result.message}`);
        if (onProgress) {
          await onProgress(i + 1, targets.length, result).catch(() => {});
        }
      } catch (err: any) {
        const errorResult: JoinGroupResult = {
          groupUrl: g.url,
          groupName: g.name,
          status: 'failed',
          message: `Lỗi: ${err.message}`,
        };
        results.push(errorResult);
        console.error(`[Join Group ${i + 1}/${targets.length}] Lỗi: ${err.message}`);
        if (onProgress) {
          await onProgress(i + 1, targets.length, errorResult).catch(() => {});
        }
      }

      // Giãn cách an toàn 3-5s giữa các nhóm để chống spam/checkpoint
      if (i < targets.length - 1) {
        const delayMs = Math.floor(Math.random() * 2000) + 3000;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    const joined = results.filter((r) => r.status === 'joined').length;
    const pending = results.filter((r) => r.status === 'pending_approval').length;
    const alreadyJoined = results.filter((r) => r.status === 'already_joined').length;
    const failed = results.filter((r) => r.status === 'failed' || r.status === 'questions_required').length;

    return {
      results,
      total: targets.length,
      joined,
      pending,
      alreadyJoined,
      failed,
    };
  }
}

export const facebookActionsEngine = new FacebookActionsEngine();
