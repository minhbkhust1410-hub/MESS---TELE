import fs from 'node:fs';
import path from 'node:path';
import type { Page, Locator } from 'playwright';
import { messengerEngine } from '../engine/messenger-engine.js';
import { globalLeadPoolService, type LeadItem } from './global-lead-pool.js';
import { getAllAccounts, getDefaultAccount, type FacebookAccount } from '../db/store.js';
import {
  humanMoveMouseRandomly,
  humanHoverAndClick,
  humanScroll,
  humanLingerAfterAction,
  randomSleep,
} from '../core/human-behavior.js';
import { detectCheckpoint } from '../core/checkpoint-guard.js';
import { orchestrationService } from '../engine/orchestration-service.js';

export type NurtureActionMode = 'full_nurture' | 'friend_only' | 'story_only' | 'post_like_only';

export interface AutoFriendConfig {
  mode: 'all' | 'bds_ecopark' | 'forex'; // Lọc nguồn tệp khách
  nurtureAction: NurtureActionMode; // Chế độ: Nuôi trọn gói (Kết bạn + Story + Like 3 bài)
  dailyLimitPerAccount: number; // Giới hạn số bạn bè/ngày/nick (mặc định 20)
  minDelaySec: number; // Giãn cách tối thiểu giữa 2 người (mặc định 25s)
  maxDelaySec: number; // Giãn cách tối đa giữa 2 người (mặc định 45s)
  deepRestAfterEvery: number; // Nghỉ sâu sau mỗi X người (mặc định 4 người)
  deepRestMinSec: number; // Thời gian nghỉ sâu min (mặc định 50s)
  deepRestMaxSec: number; // Thời gian nghỉ sâu max (mặc định 80s)
  multiAccountDistribution: boolean; // Phân chia đều danh sách UID cho các nick
  simulateHumanBioScroll: boolean; // Lướt xem trang cá nhân, bio, bài viết
  targetAccountId?: string; // Nick chỉ định ('all' hoặc ID cụ thể)
  maxPostsToLikeNew: number; // Like tối đa 3 bài viết mới cho bạn mới (mặc định 3)
  maxPostsToLikeOld: number; // Like 1 bài giữ nhiệt nếu đã từng like 3 bài (chia ra chống spam)
}

export interface LeadNurtureRecord {
  id: string; // UID
  name: string;
  url: string;
  mode?: 'bds_ecopark' | 'forex';
  friendStatus: 'unassigned' | 'requested' | 'friend' | 'skipped';
  friendRequestedAt?: string;
  storyWatchedCount: number;
  storyLastLovedAt?: string;
  likedPostsCount: number;
  lastLikedAt?: string;
  nurtureCycles: number;
  lastNurturedAt?: string;
  assignedAccountId?: string;
  assignedAccountName?: string;
}

export interface AutoFriendAccountProgress {
  accountId: string;
  accountName: string;
  sentToday: number;
  storiesLovedToday: number;
  postsLikedToday: number;
  status: 'idle' | 'working' | 'resting' | 'paused' | 'quota_reached' | 'error';
  currentLead?: { id: string; name: string; mode?: string; step?: string };
  lastActionAt?: string;
  lastError?: string;
}

export interface AutoFriendLogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'human_step';
  accountId: string;
  accountName: string;
  leadId?: string;
  leadName?: string;
  message: string;
  mode?: 'bds_ecopark' | 'forex';
}

export interface AutoFriendState {
  isRunning: boolean;
  isPaused: boolean;
  startedAt?: string;
  lastRunAt?: string;
  totalProcessed: number;
  totalSent: number;
  totalStoriesLoved: number;
  totalPostsLiked: number;
  totalSkippedAlreadyFriend: number;
  totalSkippedPending: number;
  totalErrors: number;
  config: AutoFriendConfig;
  accountProgress: Record<string, AutoFriendAccountProgress>;
  logs: AutoFriendLogEntry[];
  currentCooldownRemainingSec: number;
  lastRestDate?: string;
}

const STATE_FILE = path.resolve('./data/auto_friend_state.json');
const NURTURE_HISTORY_FILE = path.resolve('./data/social_nurture_history.json');

const DEFAULT_CONFIG: AutoFriendConfig = {
  mode: 'all',
  nurtureAction: 'full_nurture', // Mặc định Nuôi Tương Tác Trọn Gói
  dailyLimitPerAccount: 20,
  minDelaySec: 25,
  maxDelaySec: 45,
  deepRestAfterEvery: 4,
  deepRestMinSec: 50,
  deepRestMaxSec: 80,
  multiAccountDistribution: true,
  simulateHumanBioScroll: true,
  targetAccountId: 'all',
  maxPostsToLikeNew: 3,
  maxPostsToLikeOld: 1,
};

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

export class AutoFriendService {
  private state: AutoFriendState = {
    isRunning: false,
    isPaused: false,
    totalProcessed: 0,
    totalSent: 0,
    totalStoriesLoved: 0,
    totalPostsLiked: 0,
    totalSkippedAlreadyFriend: 0,
    totalSkippedPending: 0,
    totalErrors: 0,
    config: { ...DEFAULT_CONFIG },
    accountProgress: {},
    logs: [],
    currentCooldownRemainingSec: 0,
  };

  private nurtureHistory: Record<string, LeadNurtureRecord> = {};
  private shouldStop = false;

  constructor() {
    this.loadState();
    this.loadNurtureHistory();
    this.resetDailyQuotaIfNewDay();
  }

  private loadState(): void {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        this.state = {
          ...this.state,
          ...parsed,
          isRunning: false, // Reset running khi khởi động lại server
          isPaused: false,
          currentCooldownRemainingSec: 0,
        };
        if (!this.state.config) this.state.config = { ...DEFAULT_CONFIG };
        if (!this.state.config.nurtureAction) this.state.config.nurtureAction = 'full_nurture';
        if (!this.state.accountProgress) this.state.accountProgress = {};
        if (!this.state.logs) this.state.logs = [];
      }
    } catch {}
  }

  private saveState(): void {
    try {
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(
        STATE_FILE,
        JSON.stringify(
          {
            ...this.state,
            logs: this.state.logs.slice(-150),
          },
          null,
          2
        ),
        'utf8'
      );
    } catch (e: any) {
      console.warn('[AutoFriendService] Lỗi ghi auto_friend_state.json:', e.message);
    }
  }

  private loadNurtureHistory(): void {
    try {
      if (fs.existsSync(NURTURE_HISTORY_FILE)) {
        this.nurtureHistory = JSON.parse(fs.readFileSync(NURTURE_HISTORY_FILE, 'utf8'));
      }
    } catch {
      this.nurtureHistory = {};
    }
  }

  private saveNurtureHistory(): void {
    try {
      fs.mkdirSync(path.dirname(NURTURE_HISTORY_FILE), { recursive: true });
      fs.writeFileSync(NURTURE_HISTORY_FILE, JSON.stringify(this.nurtureHistory, null, 2), 'utf8');
    } catch (e: any) {
      console.warn('[AutoFriendService] Lỗi ghi nurture_history:', e.message);
    }
  }

  private resetDailyQuotaIfNewDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.state.lastRestDate !== today) {
      this.state.lastRestDate = today;
      for (const accId of Object.keys(this.state.accountProgress)) {
        this.state.accountProgress[accId].sentToday = 0;
        this.state.accountProgress[accId].storiesLovedToday = 0;
        this.state.accountProgress[accId].postsLikedToday = 0;
        if (this.state.accountProgress[accId].status === 'quota_reached') {
          this.state.accountProgress[accId].status = 'idle';
        }
      }
      this.saveState();
    }
  }

  public addLog(entry: Omit<AutoFriendLogEntry, 'id' | 'timestamp'>): void {
    const log: AutoFriendLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.state.logs.push(log);
    if (this.state.logs.length > 200) {
      this.state.logs = this.state.logs.slice(-150);
    }
    const icon =
      entry.type === 'success'
        ? '✅'
        : entry.type === 'human_step'
        ? '🧬'
        : entry.type === 'warning'
        ? '⚠️'
        : entry.type === 'error'
        ? '❌'
        : 'ℹ️';
    console.log(`[KudoX 2 Nuôi Tương Tác] ${icon} [${entry.accountName}] ${entry.message}`);
  }

  public getStatus(): AutoFriendState & {
    statsSummary: {
      bdsLeadsAvailable: number;
      forexLeadsAvailable: number;
      totalAvailable: number;
      totalSentAllTime: number;
      totalNurturedAllTime: number;
      totalStoriesLovedAllTime: number;
      totalPostsLikedAllTime: number;
    };
  } {
    this.resetDailyQuotaIfNewDay();
    const warehouse = globalLeadPoolService.getWarehouseLeads();
    const bdsAvailable = warehouse.leads.filter(
      (l) => (!l.mode || l.mode === 'bds_ecopark') && l.status === 'unassigned'
    ).length;
    const forexAvailable = warehouse.leads.filter(
      (l) => l.mode === 'forex' && l.status === 'unassigned'
    ).length;
    const totalAvailable = warehouse.leads.filter((l) => l.status === 'unassigned').length;

    const allNurtured = Object.values(this.nurtureHistory);
    const storiesLoved = allNurtured.reduce((sum, h) => sum + (h.storyWatchedCount || 0), 0);
    const postsLiked = allNurtured.reduce((sum, h) => sum + (h.likedPostsCount || 0), 0);

    return {
      ...this.state,
      statsSummary: {
        bdsLeadsAvailable: bdsAvailable,
        forexLeadsAvailable: forexAvailable,
        totalAvailable,
        totalSentAllTime: warehouse.stats.requestedCount + warehouse.stats.friendCount,
        totalNurturedAllTime: allNurtured.length,
        totalStoriesLovedAllTime: storiesLoved,
        totalPostsLikedAllTime: postsLiked,
      },
    };
  }

  public updateConfig(newConfig: Partial<AutoFriendConfig>): AutoFriendConfig {
    this.state.config = {
      ...this.state.config,
      ...newConfig,
    };
    this.saveState();
    return this.state.config;
  }

  /**
   * Bắt đầu Worker NUÔI TƯƠNG TÁC KudoX 2 (Kết Bạn + Xem Story + Like 3 Bài Viết)
   */
  public async start(options?: Partial<AutoFriendConfig>): Promise<{ success: boolean; message: string }> {
    if (this.state.isRunning && !this.state.isPaused) {
      return { success: false, message: 'Động cơ Nuôi Tương Tác KudoX 2 đang hoạt động!' };
    }

    if (options) {
      this.updateConfig(options);
    }

    this.resetDailyQuotaIfNewDay();
    this.shouldStop = false;
    this.state.isRunning = true;
    this.state.isPaused = false;
    this.state.startedAt = new Date().toISOString();

    const modeName =
      this.state.config.mode === 'bds_ecopark'
        ? 'BĐS Ecopark'
        : this.state.config.mode === 'forex'
        ? 'Forex Tài Chính'
        : 'Tất Cả Kho Data';

    this.addLog({
      type: 'info',
      accountId: 'SYSTEM',
      accountName: 'KudoX 2 Engine',
      message: `Khởi động chế độ [NUÔI TƯƠNG TÁC TỰ ĐỘNG: Kết Bạn + Xem & Thả Tim Story + Like 3 Bài Viết] [Tệp: ${modeName}] - Giới hạn: ${this.state.config.dailyLimitPerAccount} khách/ngày/nick.`,
    });

    this.runWorkerLoop().catch((err) => {
      console.error('[AutoFriendService] Worker loop gặp lỗi:', err);
      this.state.isRunning = false;
      this.state.isPaused = false;
      this.saveState();
    });

    return { success: true, message: 'Đã kích hoạt Động Cơ Nuôi Tương Tác KudoX 2 thành công!' };
  }

  public pause(): { success: boolean; message: string } {
    if (!this.state.isRunning) {
      return { success: false, message: 'Hệ thống đang dừng, không thể tạm dừng.' };
    }
    this.state.isPaused = true;
    this.addLog({
      type: 'warning',
      accountId: 'SYSTEM',
      accountName: 'KudoX 2 Engine',
      message: 'Đã tạm dừng tiến trình Nuôi Tương Tác. Nhấn Tiếp Tục để tiếp tục từ vị trí dừng.',
    });
    this.saveState();
    return { success: true, message: 'Đã tạm dừng tiến trình nuôi tương tác!' };
  }

  public resume(): { success: boolean; message: string } {
    if (!this.state.isRunning || !this.state.isPaused) {
      return { success: false, message: 'Tiến trình không ở trạng thái tạm dừng.' };
    }
    this.state.isPaused = false;
    this.addLog({
      type: 'info',
      accountId: 'SYSTEM',
      accountName: 'KudoX 2 Engine',
      message: 'Tiếp tục tiến trình Nuôi Tương Tác sinh học KudoX 2...',
    });
    this.saveState();
    return { success: true, message: 'Đã tiếp tục tiến trình nuôi tương tác!' };
  }

  public stop(): { success: boolean; message: string } {
    this.shouldStop = true;
    this.state.isRunning = false;
    this.state.isPaused = false;
    this.state.currentCooldownRemainingSec = 0;

    for (const accId of Object.keys(this.state.accountProgress)) {
      if (
        this.state.accountProgress[accId].status === 'working' ||
        this.state.accountProgress[accId].status === 'resting'
      ) {
        this.state.accountProgress[accId].status = 'idle';
      }
    }

    this.addLog({
      type: 'info',
      accountId: 'SYSTEM',
      accountName: 'KudoX 2 Engine',
      message: 'Đã dừng hoàn toàn tiến trình Nuôi Tương Tác.',
    });
    this.saveState();
    return { success: true, message: 'Đã dừng tiến trình nuôi tương tác thành công!' };
  }

  /**
   * Vòng lặp Worker chính: Sharding đa tài khoản, chống va chạm, tự động dừng khi hết quota
   */
  private async runWorkerLoop(): Promise<void> {
    while (this.state.isRunning && !this.shouldStop) {
      if (this.state.isPaused) {
        await randomSleep(1500, 2500);
        continue;
      }

      this.resetDailyQuotaIfNewDay();

      // 1. Danh sách nick tham gia
      const allAccounts = getAllAccounts();
      let activeAccounts: FacebookAccount[] = [];

      if (this.state.config.targetAccountId && this.state.config.targetAccountId !== 'all') {
        const found = allAccounts.find((a) => a.id === this.state.config.targetAccountId);
        if (found) activeAccounts = [found];
      } else {
        activeAccounts = allAccounts.filter((a) => {
          if (a.status !== 'live' && a.status !== 'active') return false;
          if (a.isDefault) return true;
          return Array.isArray(a.cookies) && a.cookies.length > 0;
        });
      }

      if (activeAccounts.length === 0) {
        const defaultAcc = getDefaultAccount();
        if (defaultAcc) activeAccounts = [defaultAcc];
      }

      for (const acc of activeAccounts) {
        if (!this.state.accountProgress[acc.id]) {
          this.state.accountProgress[acc.id] = {
            accountId: acc.id,
            accountName: acc.name,
            sentToday: 0,
            storiesLovedToday: 0,
            postsLikedToday: 0,
            status: 'idle',
          };
        }
      }

      // 2. Danh sách UID khả dụng từ kho Data theo mode đã chọn
      const warehouse = globalLeadPoolService.getWarehouseLeads({
        mode: this.state.config.mode,
        limit: 100,
      });

      // Lọc danh sách ứng viên (ưu tiên chưa kết bạn hoặc chưa nuôi chu kỳ này)
      const candidateLeads = warehouse.leads.filter((l) => {
        const hist = this.nurtureHistory[l.id];
        if (!hist) return true;
        // Nếu đã nuôi hôm nay thì bỏ qua để không spam
        if (hist.lastNurturedAt && hist.lastNurturedAt.startsWith(new Date().toISOString().slice(0, 10))) {
          return false;
        }
        return true;
      });

      if (candidateLeads.length === 0) {
        this.addLog({
          type: 'warning',
          accountId: 'SYSTEM',
          accountName: 'KudoX 2 Engine',
          message: `Tất cả các UID trong Kho Data [Mode: ${this.state.config.mode}] đã được nuôi tương tác hôm nay! Tiến trình hoàn tất.`,
        });
        this.stop();
        break;
      }

      // 3. Kiểm tra quota các nick
      const eligibleAccounts = activeAccounts.filter((acc) => {
        const prog = this.state.accountProgress[acc.id];
        return !prog || prog.sentToday < this.state.config.dailyLimitPerAccount;
      });

      if (eligibleAccounts.length === 0) {
        this.addLog({
          type: 'info',
          accountId: 'SYSTEM',
          accountName: 'KudoX 2 Engine',
          message: `Tất cả các tài khoản (${activeAccounts.length} nick) đã hoàn thành hạn ngạch Nuôi Tương Tác hôm nay (${this.state.config.dailyLimitPerAccount} khách/nick). Tự động dừng an toàn!`,
        });
        this.stop();
        break;
      }

      // 4. Phân chia UID cho các nick (Multi-account Sharding & Anti-Collision)
      let anyActionTakenInCycle = false;

      for (let accIdx = 0; accIdx < eligibleAccounts.length; accIdx++) {
        if (!this.state.isRunning || this.shouldStop || this.state.isPaused) break;

        const account = eligibleAccounts[accIdx];
        const progress = this.state.accountProgress[account.id];

        if (progress.sentToday >= this.state.config.dailyLimitPerAccount) {
          progress.status = 'quota_reached';
          continue;
        }

        let chosenLead: LeadItem | null = null;
        for (let leadIdx = 0; leadIdx < candidateLeads.length; leadIdx++) {
          const candidate = candidateLeads[leadIdx];
          if (this.state.config.multiAccountDistribution && eligibleAccounts.length > 1) {
            if (leadIdx % eligibleAccounts.length !== accIdx) continue;
          }

          const collision = globalLeadPoolService.checkFriendCollision(candidate.url, account.id);
          if (collision.canSend) {
            chosenLead = candidate;
            candidateLeads.splice(leadIdx, 1);
            break;
          }
        }

        if (!chosenLead) continue;

        anyActionTakenInCycle = true;
        progress.status = 'working';
        progress.currentLead = {
          id: chosenLead.id,
          name: chosenLead.name,
          mode: chosenLead.mode,
          step: 'Khởi tạo',
        };
        this.saveState();

        // 5. Thực thi trọn gói "NUÔI TƯƠNG TÁC" (Kết Bạn + Story + Like 3 Bài Viết)
        try {
          const result = await this.executeSocialNurtureRoutine(chosenLead, account);
          this.state.totalProcessed++;
          progress.lastActionAt = new Date().toISOString();

          if (result.friendSent) {
            this.state.totalSent++;
            progress.sentToday++;
            orchestrationService.record('auto_friend', {
              accountName: account.name,
              targetName: chosenLead.name,
              targetUrl: chosenLead.url,
              status: 'success',
              message: `Facebook đã xác nhận lời mời kết bạn tới "${chosenLead.name}".`,
              screenshotUrl: result.friendScreenshotUrl,
            });
          }
          if (result.storyLoved) {
            this.state.totalStoriesLoved++;
            progress.storiesLovedToday++;
            orchestrationService.record('react_story', {
              accountName: account.name,
              targetName: chosenLead.name,
              targetUrl: chosenLead.url,
              status: 'success',
              message: `Đã thả tim Story của "${chosenLead.name}".`,
              screenshotUrl: result.storyScreenshotUrl,
            });
          }
          if (result.postsLiked > 0) {
            this.state.totalPostsLiked += result.postsLiked;
            progress.postsLikedToday += result.postsLiked;
            orchestrationService.record('react_post', {
              accountName: account.name,
              targetName: chosenLead.name,
              targetUrl: chosenLead.url,
              status: 'success',
              message: `Đã thích ${result.postsLiked} bài viết của "${chosenLead.name}".`,
              count: result.postsLiked,
            });
          }

          this.addLog({
            type: 'success',
            accountId: account.id,
            accountName: account.name,
            leadId: chosenLead.id,
            leadName: chosenLead.name,
            mode: chosenLead.mode,
            message: `HOÀN THÀNH NUÔI TƯƠNG TÁC cho "${chosenLead.name}" [Kết bạn: ${
              result.friendSent ? 'Đã gửi' : result.alreadyFriend ? 'Đã là bạn' : 'Chờ duyệt'
            } | Story: ${result.storyLoved ? '❤️ Thả Tim' : 'Không có Story'} | Like bài: 👍 ${result.postsLiked} bài] (Tiến độ nick: ${progress.sentToday}/${this.state.config.dailyLimitPerAccount})`,
          });
        } catch (err: any) {
          this.state.totalErrors++;
          progress.lastError = err.message;
          this.addLog({
            type: 'error',
            accountId: account.id,
            accountName: account.name,
            leadId: chosenLead.id,
            leadName: chosenLead.name,
            mode: chosenLead.mode,
            message: `Lỗi nuôi tương tác: ${err.message}`,
          });
        } finally {
          progress.currentLead = undefined;
          this.saveState();
        }

        // 6. Giãn cách sinh học an toàn
        if (this.state.isRunning && !this.shouldStop) {
          const isDeepRest =
            progress.sentToday > 0 &&
            progress.sentToday % this.state.config.deepRestAfterEvery === 0;

          const cooldownSec = isDeepRest
            ? Math.floor(
                this.state.config.deepRestMinSec +
                  Math.random() * (this.state.config.deepRestMaxSec - this.state.config.deepRestMinSec)
              )
            : Math.floor(
                this.state.config.minDelaySec +
                  Math.random() * (this.state.config.maxDelaySec - this.state.config.minDelaySec)
              );

          progress.status = 'resting';
          this.addLog({
            type: 'human_step',
            accountId: account.id,
            accountName: account.name,
            message: isDeepRest
              ? `[Anti-Ban Sinh Học] Đã hoàn thành nuôi đợt ${progress.sentToday} khách -> Nghỉ giải lao sâu ${cooldownSec}s mô phỏng lướt Face...`
              : `[Anti-Ban Sinh Học] Giãn cách an toàn ngẫu nhiên ${cooldownSec}s trước khách tiếp theo...`,
          });

          await this.countdownCooldown(cooldownSec);
          progress.status = 'idle';
        }
      }

      if (!anyActionTakenInCycle) {
        await randomSleep(4000, 6000);
      }
    }
  }

  private async countdownCooldown(seconds: number): Promise<void> {
    for (let remaining = seconds; remaining > 0; remaining--) {
      if (!this.state.isRunning || this.shouldStop) break;
      this.state.currentCooldownRemainingSec = remaining;
      await new Promise((res) => setTimeout(res, 1000));
    }
    this.state.currentCooldownRemainingSec = 0;
  }

  /**
   * THỰC HIỆN TRỌN BỘ QUY TRÌNH "NUÔI TƯƠNG TÁC" KUDOX 2 CHO 1 KHÁCH:
   * 1. KẾT BẠN (Kiểm tra trạng thái -> Hover bezier click kết bạn / tự nhận diện bạn cũ)
   * 2. XEM STORY & THẢ TYM STORY (Mở xem story 4-7s sinh học, bấm Thả Tim ❤️, nán lại rồi đóng)
   * 3. TƯƠNG TÁC BÀI VIẾT (Like 3 bài viết mới nhất nếu là bạn mới; hoặc like 1 bài mới giữ nhiệt nếu đã từng like 3 bài)
   */
  public async executeSocialNurtureRoutine(
    lead: LeadItem,
    account: FacebookAccount
  ): Promise<{
    friendSent: boolean;
    alreadyFriend: boolean;
    storyLoved: boolean;
    postsLiked: number;
    friendScreenshotUrl?: string;
    storyScreenshotUrl?: string;
    message: string;
  }> {
    const profileUrl = lead.url.startsWith('http') ? lead.url : `https://www.facebook.com/${lead.id}`;
    const targetModeLabel = lead.mode === 'forex' ? 'Forex Tài Chính' : 'BĐS Ecopark';

    // Đọc lịch sử tương tác trước đây
    const existingHist = this.nurtureHistory[lead.id] || {
      id: lead.id,
      name: lead.name,
      url: profileUrl,
      mode: lead.mode,
      friendStatus: lead.status || 'unassigned',
      storyWatchedCount: 0,
      likedPostsCount: 0,
      nurtureCycles: 0,
    };

    let friendSent = false;
    let alreadyFriend = existingHist.friendStatus === 'friend';
    let storyLoved = false;
    let postsLiked = 0;
    let friendScreenshotUrl: string | undefined;
    let storyScreenshotUrl: string | undefined;

    this.addLog({
      type: 'human_step',
      accountId: account.id,
      accountName: account.name,
      leadId: lead.id,
      leadName: lead.name,
      mode: lead.mode,
      message: `[KudoX 2 Giai Đoạn 1/3] Khởi tạo hồ sơ "${lead.name}" (${lead.id}) [${targetModeLabel}]. Mở phiên trình duyệt...`,
    });

    await messengerEngine.withNewFacebookPage(async (page: Page) => {
      // 1. Mở trang cá nhân
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await randomSleep(2000, 3200);

      // Xử lý splash screen
      const splashContinue = page
        .locator('button, div[role="button"], a[role="button"]')
        .filter({ hasText: /^(tiếp tục|continue|eco trang)$/i })
        .first();
      if (await splashContinue.isVisible().catch(() => false)) {
        await splashContinue.click();
        await randomSleep(2500, 3500);
      }

      const checkpoint = await detectCheckpoint(page);
      if (checkpoint.isCheckpoint) {
        throw new Error(checkpoint.reason || 'Facebook yêu cầu xác minh bảo mật hoặc phiên đăng nhập hết hạn.');
      }

      // Quan sát trang & di chuyển chuột sinh học Bezier
      this.addLog({
        type: 'human_step',
        accountId: account.id,
        accountName: account.name,
        leadId: lead.id,
        leadName: lead.name,
        message: `[KudoX 2 Sinh Học] Di chuyển chuột bezier & quan sát tổng thể trang (2.5s)...`,
      });
      await humanMoveMouseRandomly(page);
      await randomSleep(1800, 3000);

      // Cuộn nhẹ lướt Bio/Tiểu sử như người thật
      if (this.state.config.simulateHumanBioScroll) {
        this.addLog({
          type: 'human_step',
          accountId: account.id,
          accountName: account.name,
          leadId: lead.id,
          leadName: lead.name,
          message: `[KudoX 2 Sinh Học] Cuộn nhẹ 320px đọc Bio & bài viết gần nhất (mô phỏng người thật vượt bot detection)...`,
        });
        await humanScroll(page, 260 + Math.floor(Math.random() * 200));
        await randomSleep(1600, 2600);
        await page.mouse.wheel(0, -180).catch(() => {});
        await randomSleep(800, 1400);
      }

      // =========================================================================
      // GIAI ĐOẠN 1: KẾT BẠN (FRIEND REQUEST)
      // =========================================================================
      if (
        this.state.config.nurtureAction === 'full_nurture' ||
        this.state.config.nurtureAction === 'friend_only'
      ) {
        this.addLog({
          type: 'human_step',
          accountId: account.id,
          accountName: account.name,
          leadId: lead.id,
          leadName: lead.name,
          message: `[Giai Đoạn 1: Kết Bạn] Quét phát hiện trạng thái nút bạn bè trên trang cá nhân...`,
        });

        const alreadyFriendBtn = await firstVisibleButton(page, /^(friends|bạn bè)$/i);
        if (alreadyFriendBtn) {
          alreadyFriend = true;
          existingHist.friendStatus = 'friend';
          globalLeadPoolService.recordFriendRequestSent(profileUrl, account.id, account.name, lead.name);
          this.addLog({
            type: 'info',
            accountId: account.id,
            accountName: account.name,
            leadId: lead.id,
            leadName: lead.name,
            message: `[Giai Đoạn 1: Kết Bạn] Hai tài khoản đã là bạn bè từ trước -> Bỏ qua kết bạn, tiếp tục nuôi tương tác!`,
          });
        } else {
          const PENDING_REGEX = /(cancel\s*request|cancel\s*invitation|hủy\s*lời\s*mời|huỷ\s*lời\s*mời|hủy\s*yêu\s*cầu|huỷ\s*yêu\s*cầu|đã\s*gửi\s*lời\s*mời|đã\s*gửi\s*yêu\s*cầu|requested|chờ\s*xác\s*nhận)/i;
          const requestPendingBtn = await firstVisibleButton(page, PENDING_REGEX);
          if (requestPendingBtn) {
            existingHist.friendStatus = 'requested';
            globalLeadPoolService.recordFriendRequestSent(profileUrl, account.id, account.name, lead.name);
            this.addLog({
              type: 'info',
              accountId: account.id,
              accountName: account.name,
              leadId: lead.id,
              leadName: lead.name,
              message: `[Giai Đoạn 1: Kết Bạn] Lời mời kết bạn đang chờ xét duyệt -> Tiếp tục nuôi tương tác!`,
            });
          } else {
            const addFriendBtn = await firstVisibleButton(page, /(add\s*friend|thêm\s*bạn\s*bè|thêm\s*bạn)/i);
            if (addFriendBtn) {
              this.addLog({
                type: 'human_step',
                accountId: account.id,
                accountName: account.name,
                leadId: lead.id,
                leadName: lead.name,
                message: `[Giai Đoạn 1: Kết Bạn] Rà chuột mượt mà (bezier 10 bước) đến nút "Thêm bạn bè" -> Click nhẹ nhàng...`,
              });
              await humanHoverAndClick(page, addFriendBtn);
              await randomSleep(2000, 3000);

              // XÁC MINH THẬT: kiểm tra nút chuyển sang "Hủy lời mời" hoặc nút Thêm bạn bè đã biến mất
              const confirmedPending = await firstVisibleButton(page, PENDING_REGEX);
              const isAddBtnGone = !(await addFriendBtn.isVisible().catch(() => false));

              if (confirmedPending || isAddBtnGone) {
                friendSent = true;
                existingHist.friendStatus = 'requested';
                existingHist.friendRequestedAt = new Date().toISOString();
                globalLeadPoolService.recordFriendRequestSent(profileUrl, account.id, account.name, lead.name);

                // Lưu ảnh bằng chứng xác thực
                let screenshotUrl: string | undefined;
                try {
                  const proofDir = path.resolve('./data/proofs');
                  if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
                  const proofFile = `friend_${lead.id}_${Date.now()}.png`;
                  const proofPath = path.join(proofDir, proofFile);
                  await page.screenshot({ path: proofPath, fullPage: false }).catch(() => {});
                  if (fs.existsSync(proofPath)) {
                    screenshotUrl = `/proofs/${proofFile}`;
                    friendScreenshotUrl = screenshotUrl;
                  }
                } catch {}

                this.addLog({
                  type: 'success',
                  accountId: account.id,
                  accountName: account.name,
                  leadId: lead.id,
                  leadName: lead.name,
                  message: `[Giai Đoạn 1: Kết Bạn] ✅ Facebook đã xác nhận lời mời kết bạn tới "${lead.name}" (nút đã chuyển sang trạng thái Đã gửi).`,
                });
              } else {
                this.addLog({
                  type: 'error',
                  accountId: account.id,
                  accountName: account.name,
                  leadId: lead.id,
                  leadName: lead.name,
                  message: `[Giai Đoạn 1: Kết Bạn] ⚠️ Đã bấm "Thêm bạn bè" nhưng Facebook CHƯA xác nhận lời mời tới "${lead.name}" -> KHÔNG tính vào số liệu.`,
                });
              }
            } else {
              this.addLog({
                type: 'human_step',
                accountId: account.id,
                accountName: account.name,
                leadId: lead.id,
                leadName: lead.name,
                message: `[Giai Đoạn 1: Kết Bạn] Profile không hiển thị nút kết bạn (chặn người lạ) -> Tiếp tục xem Story & bài viết.`,
              });
            }
          }
        }
      }

      // =========================================================================
      // GIAI ĐOẠN 2: XEM STORY & THẢ TYM STORY (WATCH & LOVE STORY)
      // =========================================================================
      if (
        this.state.config.nurtureAction === 'full_nurture' ||
        this.state.config.nurtureAction === 'story_only'
      ) {
        try {
          this.addLog({
            type: 'human_step',
            accountId: account.id,
            accountName: account.name,
            leadId: lead.id,
            leadName: lead.name,
            message: `[Giai Đoạn 2: Xem Story] Quét phát hiện Story đang hoạt động của "${lead.name}"...`,
          });

          // Tìm các selector đại diện cho Story trên trang cá nhân
          const storySelector = page.locator(
            'div[role="button"][aria-label*="tin" i], ' +
            'a[href*="/stories/"], ' +
            'div[aria-label*="Story" i], ' +
            'div[data-pagelet*="ProfileHeader"] a[href*="/stories/"], ' +
            'div[role="img"][aria-label*="tin" i], ' +
            'button:has-text("Xem tin"), ' +
            'div[role="button"]:has-text("Xem tin")'
          ).first();

          const hasStory = await storySelector.isVisible({ timeout: 2500 }).catch(() => false);

          if (hasStory) {
            this.addLog({
              type: 'human_step',
              accountId: account.id,
              accountName: account.name,
              leadId: lead.id,
              leadName: lead.name,
              message: `[Giai Đoạn 2: Xem Story] 🎬 Phát hiện Story đang phát -> Rà chuột mở xem Story sinh học...`,
            });

            await humanHoverAndClick(page, storySelector);
            await randomSleep(2000, 3200);

            // Thời gian xem Story như người thật: 4.5s - 7.5s
            const watchDuration = Math.floor(4500 + Math.random() * 3000);
            this.addLog({
              type: 'human_step',
              accountId: account.id,
              accountName: account.name,
              leadId: lead.id,
              leadName: lead.name,
              message: `[Giai Đoạn 2: Xem Story] 👁️ Dừng ngắm nghía Story (${(watchDuration / 1000).toFixed(1)}s) như người thật...`,
            });
            await page.waitForTimeout(watchDuration);

            // Tìm nút Thả Tim / Yêu thích trong Story Viewer
            const loveBtn = page.locator(
              'div[role="dialog"] div[aria-label*="Yêu thích" i], ' +
              'div[role="dialog"] div[aria-label*="Love" i], ' +
              'div[role="dialog"] div[role="button"][aria-label*="tim" i], ' +
              'div[role="dialog"] div[role="button"]:has-text("❤️"), ' +
              'div[role="dialog"] span:has-text("❤️"), ' +
              'div[role="dialog"] div[aria-label*="Thích" i], ' +
              'div[role="dialog"] div[aria-label*="Like" i]'
            ).first();

            if (await loveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await humanHoverAndClick(page, loveBtn);
              await randomSleep(1200, 2000);
              storyLoved = true;
              existingHist.storyWatchedCount = (existingHist.storyWatchedCount || 0) + 1;
              existingHist.storyLastLovedAt = new Date().toISOString();
              this.addLog({
                type: 'success',
                accountId: account.id,
                accountName: account.name,
                leadId: lead.id,
                leadName: lead.name,
                message: `[Giai Đoạn 2: Xem Story] ❤️ ĐÃ THẢ TYM STORY THÀNH CÔNG cho "${lead.name}"!`,
              });
            } else {
              // Chỉ XEM Story, không có nút thả tim -> KHÔNG tính là "đã thả tim"
              existingHist.storyWatchedCount = (existingHist.storyWatchedCount || 0) + 1;
              this.addLog({
                type: 'human_step',
                accountId: account.id,
                accountName: account.name,
                leadId: lead.id,
                leadName: lead.name,
                message: `[Giai Đoạn 2: Xem Story] 👀 Đã xem hết Story của "${lead.name}".`,
              });
            }

            // Đóng Story bằng phím Escape
            await randomSleep(1200, 2200);
            await page.keyboard.press('Escape');
            await randomSleep(1000, 1800);
          } else {
            this.addLog({
              type: 'human_step',
              accountId: account.id,
              accountName: account.name,
              leadId: lead.id,
              leadName: lead.name,
              message: `[Giai Đoạn 2: Xem Story] ℹ️ "${lead.name}" hiện không đăng Story -> Chuyển sang tương tác bài viết trên tường.`,
            });
          }
        } catch (err: any) {
          console.warn('[AutoNurture] Bỏ qua lỗi Story:', err.message);
          await page.keyboard.press('Escape').catch(() => {});
        }
      }

      // =========================================================================
      // GIAI ĐOẠN 3: TƯƠNG TÁC BÀI VIẾT (LIKE 3 BÀI VIẾT MỚI NHẤT & CHIA RA TRÁNH SPAM)
      // =========================================================================
      if (
        this.state.config.nurtureAction === 'full_nurture' ||
        this.state.config.nurtureAction === 'post_like_only'
      ) {
        try {
          const currentLikes = existingHist.likedPostsCount || 0;
          // Nếu khách mới (chưa like đủ 3 bài): like tối đa 3 bài viết mới
          // Nếu khách cũ (đã từng like 3 bài trước đó): chỉ like nhẹ 1 bài mới để giữ nhiệt, chia ra chống spam dồn dập
          const targetLikes = currentLikes < 3 ? Math.min(3 - currentLikes, this.state.config.maxPostsToLikeNew || 3) : (this.state.config.maxPostsToLikeOld || 1);

          this.addLog({
            type: 'human_step',
            accountId: account.id,
            accountName: account.name,
            leadId: lead.id,
            leadName: lead.name,
            message:
              currentLikes < 3
                ? `[Giai Đoạn 3: Tương Tác Bài Viết] 📰 Khách mới (đã like ${currentLikes}/3 bài) -> Cuộn dòng thời gian & Like ${targetLikes} bài viết mới nhất...`
                : `[Giai Đoạn 3: Tương Tác Bài Viết] 📰 Khách đã từng like ${currentLikes} bài -> Like nhẹ 1 bài mới nhất để giữ nhiệt (chia ra chống spam dồn dập)...`,
          });

          // Cuộn xuống phần bài viết
          await humanScroll(page, 550 + Math.floor(Math.random() * 350));
          await randomSleep(1800, 3000);

          const postLocators = page.locator('div[role="article"], div[data-pagelet*="FeedUnit"], div[data-ad-preview="message"]');
          const postCount = Math.min(await postLocators.count().catch(() => 0), 10);

          for (let pIdx = 0; pIdx < postCount && postsLiked < targetLikes; pIdx++) {
            const post = postLocators.nth(pIdx);
            if (!(await post.isVisible().catch(() => false))) continue;

            // Dừng đọc bài 1.8s - 3.2s
            await humanScroll(page, 220 + Math.floor(Math.random() * 200));
            await randomSleep(1600, 3000);

            // Tìm nút Thích trong bài viết
            const likeBtn = post.locator('div[role="button"], button').filter({
              hasText: /^(thích|like)$/i,
            }).first();

            if (await likeBtn.isVisible().catch(() => false)) {
              const ariaLabel = (await likeBtn.getAttribute('aria-label').catch(() => '')) || '';
              const btnText = (await likeBtn.innerText().catch(() => '')) || '';
              const isAlreadyLiked = /unlike|gỡ|bỏ thích|đã thích/i.test(ariaLabel + ' ' + btnText);

              if (isAlreadyLiked) {
                this.addLog({
                  type: 'human_step',
                  accountId: account.id,
                  accountName: account.name,
                  leadId: lead.id,
                  leadName: lead.name,
                  message: `[Giai Đoạn 3: Bài Viết] Bài #${pIdx + 1} đã Thích từ trước -> Lướt bài tiếp theo.`,
                });
                continue;
              }

              this.addLog({
                type: 'human_step',
                accountId: account.id,
                accountName: account.name,
                leadId: lead.id,
                leadName: lead.name,
                message: `[Giai Đoạn 3: Bài Viết] 👍 Rà chuột bezier và Like bài viết #${pIdx + 1} của "${lead.name}"...`,
              });

              await humanHoverAndClick(page, likeBtn);
              await randomSleep(1500, 2400);
              postsLiked++;

              this.addLog({
                type: 'success',
                accountId: account.id,
                accountName: account.name,
                leadId: lead.id,
                leadName: lead.name,
                message: `[Giai Đoạn 3: Bài Viết] ✅ ĐÃ LIKE THÀNH CÔNG bài viết #${pIdx + 1} của "${lead.name}" (Lượt này: ${postsLiked}/${targetLikes})`,
              });

              await randomSleep(1800, 3200);
            }
          }
        } catch (err: any) {
          console.warn('[AutoNurture] Bỏ qua lỗi like bài:', err.message);
        }
      }

      // Nán lại ngắm nhìn sau khi hoàn thành toàn bộ hành động (chống bot giật cục)
      this.addLog({
        type: 'human_step',
        accountId: account.id,
        accountName: account.name,
        leadId: lead.id,
        leadName: lead.name,
        message: `[KudoX 2 Hoàn Tất] Nán lại 2.8s ngắm màn hình trước khi đóng tab (hoàn tất chu trình Nuôi Tương Tác).`,
      });
      await humanLingerAfterAction(page);
    });

    // Cập nhật lịch sử nuôi tương tác
    existingHist.likedPostsCount = (existingHist.likedPostsCount || 0) + postsLiked;
    if (postsLiked > 0) existingHist.lastLikedAt = new Date().toISOString();
    existingHist.lastNurturedAt = new Date().toISOString();
    existingHist.nurtureCycles = (existingHist.nurtureCycles || 0) + 1;
    existingHist.assignedAccountId = account.id;
    existingHist.assignedAccountName = account.name;
    this.nurtureHistory[lead.id] = existingHist;
    this.saveNurtureHistory();

    return {
      friendSent,
      alreadyFriend,
      storyLoved,
      postsLiked,
      friendScreenshotUrl,
      storyScreenshotUrl,
      message: `Nuôi tương tác hoàn tất: Kết bạn: ${friendSent ? 'Đã gửi' : 'Bỏ qua'}, Story: ${
        storyLoved ? 'Thả tim' : 'Không có'
      }, Bài viết: Like ${postsLiked} bài`,
    };
  }

  /**
   * Tương thích ngược với endpoint cũ kết bạn đơn lẻ
   */
  public async executeSingleFriendRequest(
    lead: LeadItem,
    account: FacebookAccount
  ): Promise<{ status: 'sent' | 'already_friend' | 'already_requested' | 'not_found' | 'error'; message: string }> {
    const nurtureRes = await this.executeSocialNurtureRoutine(lead, account);
    if (nurtureRes.friendSent) {
      return { status: 'sent', message: 'Đã gửi lời mời kết bạn và nuôi tương tác thành công' };
    }
    if (nurtureRes.alreadyFriend) {
      return { status: 'already_friend', message: 'Hai tài khoản đã là bạn bè từ trước (Đã nuôi Story & Bài viết)' };
    }
    return { status: 'already_requested', message: 'Lời mời kết bạn đang chờ (Đã nuôi Story & Bài viết)' };
  }
}

export const autoFriendService = new AutoFriendService();
