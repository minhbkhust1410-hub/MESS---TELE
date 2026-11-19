import os from 'os';
import { config, updateSystemSettings } from '../config/env.js';
import {
  getAllAccounts,
  saveAccount,
  parseFacebookCookieInput,
  updateAccountProxyVerification,
  type FacebookAccount,
} from '../db/store.js';
import { testProxyNetwork, parseProxy } from '../core/browser-session.js';

export interface PoolWaveSlot {
  slotIndex: number;
  accountId: string;
  accountName: string;
  verticalMode: 'bds_ecopark' | 'forex_finance' | 'both';
  proxyServer: string;
  taskName: string;
  startedAt: string;
}

export interface PoolConfig {
  maxConcurrentBrowsers: number; // Mặc định 3 trình duyệt song song (~1.3GB RAM)
  targetTotalAccounts: number; // 40 ban đầu -> 100 tối đa (50 BĐS + 50 Forex)
  bdsQuota: number; // 50 nick BĐS Ecopark
  forexQuota: number; // 50 nick Forex Tài Chính
  waveCooldownSeconds: number; // Nghỉ 12s giữa các đợt (Wave) để giải phóng RAM sạch sẽ
  requireProxyForSatellite: boolean; // Bắt buộc có Proxy riêng khi chạy đa nick trên Server Public
}

class MultiAccountPoolEngine {
  private activeSlots = new Map<string, PoolWaveSlot>();
  private waveRunning = false;
  private currentWaveIndex = 0;
  private lastWaveCompletedAt: string | null = null;
  private totalWavesCompleted = 0;

  private poolConfig: PoolConfig = {
    maxConcurrentBrowsers: config.maxConcurrentBrowsers || 3,
    targetTotalAccounts: 100,
    bdsQuota: 50,
    forexQuota: 50,
    waveCooldownSeconds: 12,
    requireProxyForSatellite: true,
  };

  /**
   * Trả về bức tranh toàn cảnh của Cụm Điều Phối 40–100 Nick (50 BĐS + 50 Forex)
   */
  public getPoolStatus() {
    const allAccounts = getAllAccounts();
    const bdsAccounts = allAccounts.filter((a) => (a.verticalMode || 'bds_ecopark') === 'bds_ecopark' || a.verticalMode === 'both');
    const forexAccounts = allAccounts.filter((a) => a.verticalMode === 'forex_finance' || a.verticalMode === 'both');
    const proxyAssignedCount = allAccounts.filter((a) => Boolean(a.proxy && a.proxy.trim())).length;
    const proxyVerifiedCount = allAccounts.filter((a) => a.proxyStatus === 'live').length;
    const cookieVaultCount = allAccounts.filter((a) => Array.isArray(a.cookies) && a.cookies.length > 0).length;

    const maxSlots = this.poolConfig.maxConcurrentBrowsers;
    const totalCount = Math.max(allAccounts.length, 40);
    const totalWavesForCurrent = Math.max(1, Math.ceil(allAccounts.length / maxSlots));
    const totalWavesFor40 = Math.ceil(40 / maxSlots);
    const totalWavesFor100 = Math.ceil(100 / maxSlots);

    const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);
    const freeMemMb = Math.round(os.freemem() / 1024 / 1024);
    const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const estimatedPeakRamMb = rssMb + maxSlots * 380;

    // Chia danh sách nick thành các Wave luân phiên
    const waves: Array<{
      waveNumber: number;
      accounts: Array<{
        id: string;
        name: string;
        uid: string;
        verticalMode: string;
        role: string;
        hasProxy: boolean;
        proxyServer: string;
        proxyStatus: string;
        hasCloudCookies: boolean;
        status: string;
      }>;
    }> = [];

    for (let i = 0; i < allAccounts.length; i += maxSlots) {
      const slice = allAccounts.slice(i, i + maxSlots);
      waves.push({
        waveNumber: Math.floor(i / maxSlots) + 1,
        accounts: slice.map((a) => {
          const parsed = parseProxy(a.proxy);
          return {
            id: a.id,
            name: a.name,
            uid: a.uid,
            verticalMode: a.verticalMode || 'bds_ecopark',
            role: a.role || (a.isDefault ? 'master' : 'satellite'),
            hasProxy: Boolean(parsed),
            proxyServer: parsed?.server || 'IP Trực tiếp',
            proxyStatus: a.proxyStatus || (parsed ? 'live' : 'unassigned'),
            hasCloudCookies: Boolean(Array.isArray(a.cookies) && a.cookies.length > 0),
            status: a.status,
          };
        }),
      });
    }

    return {
      success: true,
      config: this.poolConfig,
      summary: {
        totalAccounts: allAccounts.length,
        initialTarget: 40,
        maxTarget: 100,
        bdsCount: bdsAccounts.length,
        bdsQuota: this.poolConfig.bdsQuota,
        forexCount: forexAccounts.length,
        forexQuota: this.poolConfig.forexQuota,
        proxyAssignedCount,
        proxyVerifiedCount,
        cookieVaultCount,
        activeBrowserSlots: this.activeSlots.size,
        maxConcurrentBrowsers: maxSlots,
        waveRunning: this.waveRunning,
        currentWaveIndex: this.currentWaveIndex,
        totalWavesForCurrent,
        estimatedCycleMinutes40Nick: Math.round(totalWavesFor40 * 1.4),
        estimatedCycleMinutes100Nick: Math.round(totalWavesFor100 * 1.4),
        lastWaveCompletedAt: this.lastWaveCompletedAt,
        totalWavesCompleted: this.totalWavesCompleted,
      },
      ramGuard: {
        processRssMb: rssMb,
        estimatedPeakRamMb,
        systemTotalMb: totalMemMb,
        systemFreeMb: freeMemMb,
        ramSavedVsSimultaneous100Mb: 100 * 420 - estimatedPeakRamMb,
        status: estimatedPeakRamMb < 3200 ? 'OPTIMAL_FOR_FREE_CLOUD' : 'HIGH_LOAD',
      },
      activeSlots: Array.from(this.activeSlots.values()),
      waves,
    };
  }

  public updateConfig(partial: Partial<PoolConfig>): PoolConfig {
    if (partial.maxConcurrentBrowsers !== undefined) {
      const slots = Math.max(1, Math.min(10, Number(partial.maxConcurrentBrowsers) || 3));
      this.poolConfig.maxConcurrentBrowsers = slots;
      updateSystemSettings({ maxConcurrentBrowsers: slots });
    }
    if (partial.waveCooldownSeconds !== undefined) {
      this.poolConfig.waveCooldownSeconds = Math.max(5, Math.min(120, Number(partial.waveCooldownSeconds) || 12));
    }
    if (partial.requireProxyForSatellite !== undefined) {
      this.poolConfig.requireProxyForSatellite = Boolean(partial.requireProxyForSatellite);
    }
    return this.poolConfig;
  }

  /**
   * Xin cấp 1 Slot trình duyệt cho tài khoản (Đảm bảo không bao giờ mở quá maxConcurrentBrowsers cùng lúc)
   */
  public async acquireSlot(account: FacebookAccount, taskName: string, timeoutMs = 120_000): Promise<boolean> {
    const start = Date.now();
    while (this.activeSlots.size >= this.poolConfig.maxConcurrentBrowsers || this.activeSlots.has(account.id)) {
      if (Date.now() - start > timeoutMs) {
        return false;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const parsed = parseProxy(account.proxy);
    this.activeSlots.set(account.id, {
      slotIndex: this.activeSlots.size + 1,
      accountId: account.id,
      accountName: account.name,
      verticalMode: account.verticalMode || 'bds_ecopark',
      proxyServer: parsed?.server || 'Direct IP',
      taskName,
      startedAt: new Date().toISOString(),
    });
    return true;
  }

  public releaseSlot(accountId: string): void {
    this.activeSlots.delete(accountId);
  }

  /**
   * Kiểm tra đồng loạt Proxy của toàn bộ dàn nick (Theo từng Wave 5 nick để cực nhanh)
   */
  public async verifyAllAccountProxies(): Promise<{
    totalChecked: number;
    liveCount: number;
    deadCount: number;
    unassignedCount: number;
    results: Array<{ id: string; name: string; proxy: string; status: string; ip?: string; latencyMs?: number; error?: string }>;
  }> {
    const accounts = getAllAccounts();
    const results: Array<{ id: string; name: string; proxy: string; status: string; ip?: string; latencyMs?: number; error?: string }> = [];
    let liveCount = 0;
    let deadCount = 0;
    let unassignedCount = 0;

    const batchSize = 5;
    for (let i = 0; i < accounts.length; i += batchSize) {
      const batch = accounts.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (acc) => {
          if (!acc.proxy || !acc.proxy.trim()) {
            unassignedCount++;
            results.push({ id: acc.id, name: acc.name, proxy: '', status: 'unassigned' });
            return;
          }
          const check = await testProxyNetwork(acc.proxy, 7000);
          if (check.alive && !check.isLeakingHostIp) {
            liveCount++;
            updateAccountProxyVerification(acc.id, {
              verifiedProxyIp: check.ip,
              proxyStatus: 'live',
              proxyCountry: check.country,
              proxyCity: check.city,
              proxyLatencyMs: check.latencyMs,
            });
            results.push({
              id: acc.id,
              name: acc.name,
              proxy: check.server || acc.proxy,
              status: 'live',
              ip: check.ip,
              latencyMs: check.latencyMs,
            });
          } else {
            deadCount++;
            updateAccountProxyVerification(acc.id, {
              proxyStatus: 'dead',
              proxyLatencyMs: check.latencyMs,
            });
            results.push({
              id: acc.id,
              name: acc.name,
              proxy: check.server || acc.proxy,
              status: 'dead',
              error: check.isLeakingHostIp ? 'Rò rỉ IP máy chủ gốc' : check.error,
            });
          }
        })
      );
    }

    return {
      totalChecked: accounts.length,
      liveCount,
      deadCount,
      unassignedCount,
      results,
    };
  }

  /**
   * Nạp nhanh danh sách nhiều Nick kèm Proxy (Hỗ trợ 40 -> 100 nick: 50 BĐS + 50 Forex)
   * Định dạng mỗi dòng linh hoạt:
   *   1) uid_hoac_email | password | proxy | ten_nick | mang(bds/forex) | cookie_tuy_chon
   *   2) uid_hoac_email | password | proxy
   *   3) cookie_string | proxy | ten_nick | mang(bds/forex)
   */
  public async bulkOnboardAccountsWithProxy(
    rawText: string,
    defaultMode: 'bds_ecopark' | 'forex_finance' = 'bds_ecopark',
    verifyProxiesNow = false
  ): Promise<{
    success: boolean;
    importedCount: number;
    updatedCount: number;
    skippedCount: number;
    accounts: FacebookAccount[];
  }> {
    const lines = String(rawText || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const processed: FacebookAccount[] = [];
    const existingAll = getAllAccounts();

    for (let idx = 0; idx < lines.length; idx++) {
      const parts = lines[idx].split('|').map((p) => p.trim());
      if (parts.length < 2) {
        skippedCount++;
        continue;
      }

      let uidOrUser = '';
      let password = '';
      let proxy = '';
      let name = '';
      let verticalMode: 'bds_ecopark' | 'forex_finance' = defaultMode;
      let rawCookies = '';

      let twoFactorSecret = '';

      // Thông minh tự nhận diện từng trường dựa vào định dạng nội dung
      for (const p of parts) {
        if (!p) continue;
        if (p.includes('c_user=')) {
          rawCookies = p;
          const mUid = p.match(/c_user=(\d+)/);
          if (mUid && !uidOrUser) uidOrUser = mUid[1];
        } else if (/\d+\.\d+\.\d+\.\d+:\d+/.test(p)) {
          proxy = p;
        } else if (/^(bds|ecopark|forex|fx|vàng|gold)$/i.test(p)) {
          verticalMode = /forex|fx|vàng|gold/i.test(p) ? 'forex_finance' : 'bds_ecopark';
        } else if (/^[A-Z2-7]{16,32}$/.test(p)) {
          twoFactorSecret = p;
        } else if (/^\d{10,18}$/.test(p) && !uidOrUser) {
          uidOrUser = p;
        }
      }

      // Nhận diện theo vị trí nếu chưa có
      if (!uidOrUser && parts[0]) uidOrUser = parts[0];
      if (!password && parts[1] && !parts[1].includes('c_user=') && !parts[1].includes(':')) password = parts[1];
      if (!twoFactorSecret && parts[2] && /^[A-Z2-7]{16,32}$/.test(parts[2])) twoFactorSecret = parts[2];
      if (!rawCookies && parts[3] && parts[3].includes('c_user=')) rawCookies = parts[3];
      if (!proxy && parts[4] && /\d+\.\d+\.\d+\.\d+:\d+/.test(parts[4])) proxy = parts[4];
      if (!proxy && parts[2] && /\d+\.\d+\.\d+\.\d+:\d+/.test(parts[2])) proxy = parts[2];

      if (!uidOrUser) {
        skippedCount++;
        continue;
      }

      const cleanId = `acc_${uidOrUser.replace(/[^a-zA-Z0-9_]/g, '')}`;
      const existed = existingAll.some((a) => a.id === cleanId || (a.uid && a.uid === uidOrUser));
      const parsedCookies = parseFacebookCookieInput(rawCookies);

      const defaultNamePrefix = verticalMode === 'forex_finance' ? 'Forex Trader' : 'Eco BĐS';
      const displayName = name || `${defaultNamePrefix} #${existingAll.length + importedCount + 1} (${uidOrUser.slice(-4)})`;

      const saved = saveAccount({
        id: cleanId,
        uid: /^\d+$/.test(uidOrUser) ? uidOrUser : '',
        fbUsername: uidOrUser,
        fbPassword: password || undefined,
        twoFactorSecret: twoFactorSecret || undefined,
        name: displayName,
        proxy,
        proxyStatus: proxy ? 'live' : 'unassigned',
        cookies: parsedCookies,
        verticalMode,
        role: 'satellite',
        status: 'live',
        profileDir: `./.user-data/profiles/${cleanId}`,
      });

      if (existed) updatedCount++;
      else importedCount++;
      processed.push(saved);
    }

    if (verifyProxiesNow && processed.length > 0) {
      await this.verifyAllAccountProxies().catch(() => {});
    }

    return {
      success: true,
      importedCount,
      updatedCount,
      skippedCount,
      accounts: processed,
    };
  }
}

export const multiAccountPool = new MultiAccountPoolEngine();
