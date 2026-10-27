import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { messengerEngine } from '../engine/messenger-engine.js';
import { assertAccountSafeOrAbort } from '../core/checkpoint-guard.js';
import { humanHoverAndClick, randomSleep, smoothScrollDown } from '../core/human-behavior.js';
import { addTargetGroup, getTargetGroups, TargetGroup } from '../db/auto-comment-store.js';
import { dataModeService } from './data-mode-service.js';

export interface DiscoveredGroup {
  id: string;
  name: string;
  url: string;
  membersCountText: string;
  membersCountNumber: number;
  privacy: 'public' | 'private' | 'unknown';
  activityText: string;
  joinStatus: 'joined' | 'pending' | 'can_join' | 'unknown';
  discoveredAt: string;
  keywordUsed: string;
  category: string;
  addedToTargetPool: boolean;
}

export interface GroupDiscoveryStats {
  totalDiscovered: number;
  joinedCount: number;
  canJoinCount: number;
  pendingCount: number;
  publicCount: number;
  privateCount: number;
  addedToPoolCount: number;
  lastScannedAt?: string;
}

const DISCOVERY_STORE_PATH = path.resolve('./data/discovered_groups.json');

export class GroupDiscoveryService {
  private groups: DiscoveredGroup[] = [];
  private isScanning = false;

  constructor() {
    this.loadStore();
  }

  private loadStore(): void {
    try {
      if (fs.existsSync(DISCOVERY_STORE_PATH)) {
        const raw = fs.readFileSync(DISCOVERY_STORE_PATH, 'utf8');
        this.groups = JSON.parse(raw);
      } else {
        // Khởi tạo các nhóm mẫu BĐS Ecopark & Forex chất lượng cao có sẵn
        this.groups = this.getInitialCuratedGroups();
        this.saveStore();
      }
    } catch (err: any) {
      console.warn('[GroupDiscovery] Chưa thể đọc tệp nhóm khám phá:', err.message);
      this.groups = this.getInitialCuratedGroups();
    }
  }

  private saveStore(): void {
    try {
      fs.mkdirSync(path.dirname(DISCOVERY_STORE_PATH), { recursive: true });
      fs.writeFileSync(DISCOVERY_STORE_PATH, JSON.stringify(this.groups, null, 2), 'utf8');
    } catch (err: any) {
      console.error('[GroupDiscovery] Lưu tệp nhóm thất bại:', err.message);
    }
  }

  public getDiscoveredGroups(category?: string): DiscoveredGroup[] {
    if (category) {
      return this.groups.filter(g => g.category.toLowerCase().includes(category.toLowerCase()));
    }
    return this.groups;
  }

  public isBusy(): boolean {
    return this.isScanning;
  }

  public getStats(): GroupDiscoveryStats {
    const total = this.groups.length;
    const joined = this.groups.filter(g => g.joinStatus === 'joined').length;
    const canJoin = this.groups.filter(g => g.joinStatus === 'can_join').length;
    const pending = this.groups.filter(g => g.joinStatus === 'pending').length;
    const pub = this.groups.filter(g => g.privacy === 'public').length;
    const priv = this.groups.filter(g => g.privacy === 'private').length;
    const added = this.groups.filter(g => g.addedToTargetPool).length;

    const sortedByDate = [...this.groups].sort((a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime());
    const lastScannedAt = sortedByDate[0]?.discoveredAt;

    return {
      totalDiscovered: total,
      joinedCount: joined,
      canJoinCount: canJoin,
      pendingCount: pending,
      publicCount: pub,
      privateCount: priv,
      addedToPoolCount: added,
      lastScannedAt,
    };
  }

  /**
   * Tự động tìm kiếm các nhóm mới trên Facebook dựa trên từ khóa
   */
  public async searchGroupsOnFacebook(keyword: string, maxResults = 15): Promise<{
    success: boolean;
    keyword: string;
    foundCount: number;
    newGroups: DiscoveredGroup[];
    error?: string;
  }> {
    if (this.isScanning) {
      return { success: false, keyword, foundCount: 0, newGroups: [], error: 'Đang có một tiến trình quét nhóm khác đang chạy' };
    }

    const cleanKeyword = keyword.trim();
    if (!cleanKeyword) {
      return { success: false, keyword, foundCount: 0, newGroups: [], error: 'Vui lòng nhập từ khóa tìm kiếm nhóm' };
    }

    if (!messengerEngine.isReady()) {
      return {
        success: false,
        keyword: cleanKeyword,
        foundCount: 0,
        newGroups: [],
        error: 'Phiên Facebook chưa sẵn sàng. Hãy kiểm tra nick đang trực tuyến trên Dashboard.',
      };
    }

    this.isScanning = true;
    console.log(`\n===========================================================`);
    console.log(`🔍 [GroupDiscovery] BẮT ĐẦU TỰ ĐỘNG TÌM KIẾM NHÓM MỚI VỚI TỪ KHÓA: "${cleanKeyword}"`);
    console.log(`===========================================================`);

    const currentMode = dataModeService.getCurrentMode();
    const category = currentMode === 'forex_finance' ? 'Forex Tài Chính' : 'BĐS Ecopark';
    const newItems: DiscoveredGroup[] = [];

    try {
      await messengerEngine.withNewFacebookPage(async (page: Page) => {
        // Điều hướng tới trang tìm kiếm nhóm Facebook
        const searchUrl = `https://www.facebook.com/groups/search/groups/?q=${encodeURIComponent(cleanKeyword)}`;
        console.log(`[GroupDiscovery] 🌐 Điều hướng đến: ${searchUrl}`);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await randomSleep(2500, 3800);

        // Bảo vệ nick
        await assertAccountSafeOrAbort(page, 'Tìm kiếm nhóm mới');

        // Đóng các popup cản trở nếu có
        const closeBtn = page.locator('div[aria-label="Đóng"], div[aria-label="Close"]');
        if (await closeBtn.first().isVisible({ timeout: 1500 }).catch(() => false)) {
          await closeBtn.first().click().catch(() => {});
        }

        // Cuộn mượt để nạp thêm các nhóm mới
        console.log(`[GroupDiscovery] 📜 Đang cuộn trang để bóc tách danh sách nhóm...`);
        await smoothScrollDown(page, 3);
        await randomSleep(1500, 2500);

        // Bóc tách danh sách nhóm từ DOM
        const rawGroups = await page.evaluate(() => {
          const results: Array<{
            name: string;
            url: string;
            membersText: string;
            privacy: string;
            activity: string;
            joinStatus: string;
          }> = [];

          // Tìm các khối kết quả tìm kiếm nhóm Facebook
          const groupLinks = Array.from(document.querySelectorAll('a[href*="/groups/"][role="link"]'));
          const seenUrls = new Set<string>();

          for (const a of groupLinks) {
            const href = (a as HTMLAnchorElement).href;
            if (!href) continue;

            const match = href.match(/https?:\/\/(?:www\.)?facebook\.com\/groups\/([^\/?#]+)/i);
            if (!match) continue;

            const slug = match[1];
            // Bỏ qua các trang con của nhóm như /search, /feed, /discover
            if (['search', 'feed', 'discover', 'joins', 'notifications'].includes(slug.toLowerCase())) {
              continue;
            }

            const cleanUrl = `https://www.facebook.com/groups/${slug}/`;
            if (seenUrls.has(cleanUrl)) continue;
            seenUrls.add(cleanUrl);

            // Tìm container bao quanh nhóm để lấy thông tin chi tiết
            let container: HTMLElement | null = a as HTMLElement;
            for (let i = 0; i < 6; i++) {
              if (!container || !container.parentElement) break;
              container = container.parentElement;
              // Dừng lại khi thấy container chứa thông tin thành viên
              if (container.innerText && /thành viên|members|bài viết|posts/i.test(container.innerText)) {
                break;
              }
            }

            const containerText = container ? container.innerText : '';
            const groupName = ((a as HTMLElement).innerText || a.textContent || '').trim() || (container?.querySelector('h2, h3, strong')?.textContent || '').trim() || `Nhóm Facebook (${slug})`;

            // Bóc tách số lượng thành viên
            const memberMatch = containerText.match(/([0-9\.,]+(?:K|M|k|m)?)\s*(?:thành viên|members)/i);
            const membersText = memberMatch ? `${memberMatch[1]} thành viên` : 'Chưa rõ số lượng';

            // Bóc tách quyền riêng tư
            let privacy = 'public';
            if (/nhóm riêng tư|nhóm kín|private group|riêng tư/i.test(containerText)) {
              privacy = 'private';
            }

            // Bóc tách tần suất hoạt động
            const actMatch = containerText.match(/([0-9\.,]+\+?\s*(?:bài viết|posts)?[^\n\r]*?(?:ngày|tháng|day|month))/i);
            const activity = actMatch ? actMatch[0].trim() : 'Hoạt động thường xuyên';

            // Bóc tách trạng thái tham gia
            let joinStatus = 'can_join';
            if (/đã tham gia|joined/i.test(containerText)) {
              joinStatus = 'joined';
            } else if (/đã gửi yêu cầu|hủy yêu cầu|pending|requested/i.test(containerText)) {
              joinStatus = 'pending';
            }

            results.push({
              name: groupName.replace(/\n.*/s, ''), // Lấy dòng đầu tiên của tên
              url: cleanUrl,
              membersText,
              privacy,
              activity,
              joinStatus,
            });
          }

          return results;
        });

        console.log(`[GroupDiscovery] 📊 Đã bóc tách được ${rawGroups.length} nhóm tiềm năng trên Facebook.`);

        // Chuẩn hóa và lưu trữ
        for (const rg of rawGroups.slice(0, maxResults)) {
          const num = this.parseMembersNumber(rg.membersText);
          const slug = rg.url.match(/\/groups\/([^\/?#]+)/i)?.[1] || rg.url;
          const id = `disc_${slug.toLowerCase()}`;

          // Kiểm tra xem nhóm đã có trong danh sách mục tiêu TargetGroups chưa
          const existingTargets = getTargetGroups();
          const isAdded = existingTargets.some(tg => tg.url.toLowerCase().includes(slug.toLowerCase()));

          const item: DiscoveredGroup = {
            id,
            name: rg.name || `Nhóm ${cleanKeyword}`,
            url: rg.url,
            membersCountText: rg.membersText,
            membersCountNumber: num,
            privacy: rg.privacy as any,
            activityText: rg.activity,
            joinStatus: rg.joinStatus as any,
            discoveredAt: new Date().toISOString(),
            keywordUsed: cleanKeyword,
            category,
            addedToTargetPool: isAdded,
          };

          // Cập nhật hoặc thêm mới
          const existingIdx = this.groups.findIndex(g => g.url.toLowerCase() === rg.url.toLowerCase());
          if (existingIdx >= 0) {
            this.groups[existingIdx] = { ...this.groups[existingIdx], ...item };
          } else {
            this.groups.unshift(item);
            newItems.push(item);
          }
        }

        this.saveStore();
      });

      console.log(`[GroupDiscovery] ✅ Tìm kiếm hoàn tất: Thêm ${newItems.length} nhóm mới vào Kho Khám Phá!`);
      return {
        success: true,
        keyword: cleanKeyword,
        foundCount: newItems.length,
        newGroups: newItems,
      };
    } catch (err: any) {
      console.error(`[GroupDiscovery] ❌ Lỗi khi tìm kiếm nhóm:`, err.message);
      return {
        success: false,
        keyword: cleanKeyword,
        foundCount: 0,
        newGroups: [],
        error: err.message,
      };
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Tự động thêm 1 nhóm khám phá vào Kho Nhóm Săn Khách (TargetGroup Pool)
   */
  public addDiscoveredGroupToPool(groupIdOrUrl: string): { success: boolean; targetGroup?: TargetGroup; error?: string } {
    const item = this.groups.find(g => g.id === groupIdOrUrl || g.url.toLowerCase() === groupIdOrUrl.toLowerCase());
    if (!item) {
      return { success: false, error: 'Không tìm thấy thông tin nhóm này trong kho khám phá' };
    }

    try {
      const targetGroup = addTargetGroup(item.url, item.name);

      item.addedToTargetPool = true;
      this.saveStore();

      console.log(`[GroupDiscovery] 🎯 Đã nạp nhóm "${item.name}" vào Kho Nhóm Săn Khách!`);
      return { success: true, targetGroup };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Tự động gửi yêu cầu tham gia nhóm trên Facebook qua Playwright
   */
  public async joinGroup(groupIdOrUrl: string): Promise<{ success: boolean; message: string; joinStatus?: string }> {
    const item = this.groups.find(g => g.id === groupIdOrUrl || g.url.toLowerCase() === groupIdOrUrl.toLowerCase());
    if (!item) {
      return { success: false, message: 'Không tìm thấy nhóm này để tham gia' };
    }

    if (!messengerEngine.isReady()) {
      return { success: false, message: 'Phiên Facebook chưa sẵn sàng' };
    }

    console.log(`[GroupDiscovery] 🚀 Bắt đầu gửi yêu cầu tham gia nhóm: ${item.name} (${item.url})...`);

    try {
      const result = await messengerEngine.withNewFacebookPage(async (page: Page) => {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await randomSleep(2000, 3200);

        await assertAccountSafeOrAbort(page, `Tham gia nhóm ${item.name}`);

        // Tìm nút Tham Gia Nhóm
        const joinBtn = await page.locator([
          'div[aria-label="Tham gia nhóm" i][role="button"]',
          'div[aria-label="Tham gia" i][role="button"]',
          'button:has-text("Tham gia nhóm")',
          'button:has-text("Tham gia")',
          'div[role="button"]:has-text("Tham gia nhóm")',
        ].join(', ')).first();

        const isVisible = await joinBtn.isVisible({ timeout: 4000 }).catch(() => false);
        if (!isVisible) {
          // Kiểm tra xem đã tham gia chưa
          const alreadyJoined = await page.locator('div[aria-label="Đã tham gia" i], div:has-text("Đã tham gia")').first().isVisible().catch(() => false);
          if (alreadyJoined) {
            item.joinStatus = 'joined';
            this.saveStore();
            return { success: true, message: 'Tài khoản đã là thành viên chính thức của nhóm này!', status: 'joined' };
          }
          return { success: false, message: 'Không tìm thấy nút Tham Gia Nhóm trên giao diện Facebook', status: item.joinStatus };
        }

        // Click nút tham gia với chuột Bezier
        await humanHoverAndClick(page, joinBtn);
        await randomSleep(1500, 2500);

        // Kiểm tra xem có popup hỏi câu hỏi quy tắc nhóm (Group Rules/Questions Modal) không
        const ruleDialog = page.locator('div[role="dialog"]');
        if (await ruleDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`[GroupDiscovery] 📋 Phát hiện câu hỏi duyệt nhóm, tự động đồng ý quy tắc...`);
          
          // Tick các checkbox quy tắc nếu có
          const checkboxes = ruleDialog.locator('input[type="checkbox"]');
          const count = await checkboxes.count();
          for (let i = 0; i < count; i++) {
            await checkboxes.nth(i).check().catch(() => {});
          }

          // Điền câu trả lời lịch sự nếu có ô nhập
          const textboxes = ruleDialog.locator('textarea, input[type="text"], div[contenteditable="true"]');
          if (await textboxes.first().isVisible().catch(() => false)) {
            await textboxes.first().fill('Tôi đồng ý với quy tắc nhóm và muốn cập nhật thông tin BĐS Ecopark.').catch(() => {});
          }

          // Click nút Gửi
          const submitBtn = ruleDialog.locator('div[aria-label="Gửi" i], button:has-text("Gửi"), div[role="button"]:has-text("Gửi")').first();
          if (await submitBtn.isVisible().catch(() => false)) {
            await submitBtn.click().catch(() => {});
            await randomSleep(1200, 2000);
          }
        }

        item.joinStatus = 'pending';
        this.saveStore();
        return { success: true, message: 'Đã gửi yêu cầu tham gia nhóm thành công (Đang chờ Admin duyệt)!', status: 'pending' };
      });

      return {
        success: result.success,
        message: result.message,
        joinStatus: result.status,
      };
    } catch (err: any) {
      return { success: false, message: `Lỗi khi tham gia nhóm: ${err.message}` };
    }
  }

  /**
   * Quét mở rộng tự động hàng loạt từ khóa theo lĩnh vực hoạt động
   */
  public async autoExpandDiscovery(customKeywords?: string[]): Promise<{
    success: boolean;
    totalKeywordsScanned: number;
    newGroupsTotal: number;
    summary: string;
  }> {
    const currentMode = dataModeService.getCurrentMode();
    const defaultKeywords = currentMode === 'forex_finance'
      ? ['Đầu tư Forex', 'Cộng đồng Trader', 'Giao dịch Vàng XAUUSD', 'Tín hiệu Forex']
      : ['Bất động sản Ecopark', 'Cư dân Ecopark', 'Thuê căn hộ Ecopark', 'Chung cư Ecopark', 'Mua bán nhà Ecopark', 'Homestay Ecopark'];

    const keywordsToScan = customKeywords && customKeywords.length > 0 ? customKeywords : defaultKeywords;
    let totalNew = 0;

    console.log(`[GroupDiscovery] 🚀 Bắt đầu quét mở rộng tự động ${keywordsToScan.length} từ khóa...`);

    for (const kw of keywordsToScan) {
      try {
        const res = await this.searchGroupsOnFacebook(kw, 8);
        if (res.success) {
          totalNew += res.foundCount;
        }
        await new Promise(r => setTimeout(r, 6000)); // Nghỉ an toàn giữa các từ khóa
      } catch (e: any) {
        console.warn(`[GroupDiscovery] Quét từ khóa "${kw}" gặp lỗi:`, e.message);
      }
    }

    return {
      success: true,
      totalKeywordsScanned: keywordsToScan.length,
      newGroupsTotal: totalNew,
      summary: `Đã hoàn tất quét ${keywordsToScan.length} từ khóa, phát hiện thêm ${totalNew} nhóm tiềm năng mới!`,
    };
  }

  private parseMembersNumber(text: string): number {
    if (!text) return 0;
    const clean = text.toLowerCase().replace(/[^0-9\.km]/g, '');
    if (clean.endsWith('k')) {
      return parseFloat(clean) * 1000;
    }
    if (clean.endsWith('m')) {
      return parseFloat(clean) * 1000000;
    }
    return parseFloat(clean) || 0;
  }

  /**
   * Danh sách nhóm mẫu ban đầu chuẩn thị trường BĐS Ecopark & Forex
   */
  private getInitialCuratedGroups(): DiscoveredGroup[] {
    const now = new Date().toISOString();
    return [
      {
        id: 'disc_ecopark_muaban_chothue',
        name: 'CỘNG ĐỒNG CƯ DÂN & MUA BÁN CHO THUÊ ECOPARK',
        url: 'https://www.facebook.com/groups/ecopark.muaban.chothue/',
        membersCountText: '68.5K thành viên',
        membersCountNumber: 68500,
        privacy: 'public',
        activityText: '25+ bài viết mới mỗi ngày',
        joinStatus: 'joined',
        discoveredAt: now,
        keywordUsed: 'BĐS Ecopark',
        category: 'BĐS Ecopark',
        addedToTargetPool: true,
      },
      {
        id: 'disc_cudan_ecopark_official',
        name: 'HỘI CƯ DÂN ECOPARK - CHIA SẺ TIỆN ÍCH & CUỘC SỐNG',
        url: 'https://www.facebook.com/groups/cudanecopark.official/',
        membersCountText: '54.2K thành viên',
        membersCountNumber: 54200,
        privacy: 'public',
        activityText: '18 bài viết mới mỗi ngày',
        joinStatus: 'can_join',
        discoveredAt: now,
        keywordUsed: 'Cư dân Ecopark',
        category: 'BĐS Ecopark',
        addedToTargetPool: false,
      },
      {
        id: 'disc_thue_canho_haven_sol_oasis',
        name: 'CHO THUÊ & MUA BÁN CĂN HỘ HAVEN PARK - SOL FOREST - SKY OASIS',
        url: 'https://www.facebook.com/groups/thuecanho.havenpark.solforest/',
        membersCountText: '32.8K thành viên',
        membersCountNumber: 32800,
        privacy: 'public',
        activityText: '12 bài viết mới mỗi ngày',
        joinStatus: 'can_join',
        discoveredAt: now,
        keywordUsed: 'Thuê căn hộ Ecopark',
        category: 'BĐS Ecopark',
        addedToTargetPool: false,
      },
      {
        id: 'disc_homestay_ecopark_homes',
        name: 'HOMESTAY ECOPARK & NGHỈ DƯỠNG CUỐI TUẦN',
        url: 'https://www.facebook.com/groups/homestay.ecopark.homes/',
        membersCountText: '41.0K thành viên',
        membersCountNumber: 41000,
        privacy: 'public',
        activityText: '30+ bài viết mới mỗi ngày',
        joinStatus: 'joined',
        discoveredAt: now,
        keywordUsed: 'Homestay Ecopark',
        category: 'BĐS Ecopark',
        addedToTargetPool: true,
      },
      {
        id: 'disc_forex_trader_vietnam',
        name: 'CỘNG ĐỒNG FOREX TRADER & ĐẦU TƯ TÀI CHÍNH VIỆT NAM',
        url: 'https://www.facebook.com/groups/forex.trader.vietnam/',
        membersCountText: '82.0K thành viên',
        membersCountNumber: 82000,
        privacy: 'public',
        activityText: '40+ bài viết mới mỗi ngày',
        joinStatus: 'can_join',
        discoveredAt: now,
        keywordUsed: 'Cộng đồng Trader',
        category: 'Forex Tài Chính',
        addedToTargetPool: false,
      },
      {
        id: 'disc_vang_xauusd_trading',
        name: 'HỘI ĐẦU TƯ GIAO DỊCH VÀNG XAU/USD & TÍN HIỆU THỰC CHIẾN',
        url: 'https://www.facebook.com/groups/vang.xauusd.trading/',
        membersCountText: '49.5K thành viên',
        membersCountNumber: 49500,
        privacy: 'public',
        activityText: '22 bài viết mới mỗi ngày',
        joinStatus: 'can_join',
        discoveredAt: now,
        keywordUsed: 'Giao dịch Vàng XAUUSD',
        category: 'Forex Tài Chính',
        addedToTargetPool: false,
      },
    ];
  }
}

export const groupDiscoveryService = new GroupDiscoveryService();
