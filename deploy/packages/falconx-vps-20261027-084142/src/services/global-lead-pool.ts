import fs from 'node:fs';
import path from 'node:path';

export interface LeadItem {
  id: string; // UID hoặc clean username
  name: string;
  url: string;
  sourceGroup?: string;
  sourceGroupName?: string;
  mode?: 'bds_ecopark' | 'forex';
  timeCategory?: '2_days' | '1_week' | '2_weeks' | 'older';
  timeCategoryLabel?: string;
  subtitle?: string;
  joinedTimeText?: string;
  firstSeenAt: string;
  lastUpdatedAt?: string;
  scanCount?: number;
  assignedAccountId?: string;
  assignedAccountName?: string;
  status: 'unassigned' | 'requested' | 'friend' | 'skipped';
  requestedAt?: string;
  lastActiveAt?: string;
}

export interface GlobalLeadPoolState {
  leads: Record<string, LeadItem>;
  stats: {
    totalScanned: number;
    requestedCount: number;
    friendCount: number;
    bdsCount: number;
    forexCount: number;
    twoDaysCount: number;
    oneWeekCount: number;
    twoWeeksCount: number;
  };
}

const POOL_FILE = path.resolve('./data/global_leads_pool.json');

const JUNK_KEYS = new Set([
  'reg', 'r_php', 'lite', 'l_php', 'careers', 'login', 'dialog', 'help',
  'about', 'privacy', 'terms', 'policies', 'settings', 'allactivity',
  'photo', 'photos', 'marketplace', 'gaming', 'ad_center', 'ads',
  'watch', 'reel', 'stories', 'groupslanding', 'undefined', 'null'
]);

export class GlobalLeadPoolService {
  private state: GlobalLeadPoolState = {
    leads: {},
    stats: {
      totalScanned: 0,
      requestedCount: 0,
      friendCount: 0,
      bdsCount: 0,
      forexCount: 0,
      twoDaysCount: 0,
      oneWeekCount: 0,
      twoWeeksCount: 0,
    },
  };

  constructor() {
    this.load();
    this.purgeJunk();
  }

  private load(): void {
    try {
      if (fs.existsSync(POOL_FILE)) {
        const raw = fs.readFileSync(POOL_FILE, 'utf8');
        this.state = JSON.parse(raw);
        if (!this.state.leads) this.state.leads = {};
        if (!this.state.stats) {
          this.state.stats = {
            totalScanned: 0,
            requestedCount: 0,
            friendCount: 0,
            bdsCount: 0,
            forexCount: 0,
            twoDaysCount: 0,
            oneWeekCount: 0,
            twoWeeksCount: 0,
          };
        }
      }
    } catch {
      this.state = {
        leads: {},
        stats: {
          totalScanned: 0,
          requestedCount: 0,
          friendCount: 0,
          bdsCount: 0,
          forexCount: 0,
          twoDaysCount: 0,
          oneWeekCount: 0,
          twoWeeksCount: 0,
        },
      };
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(POOL_FILE), { recursive: true });
      fs.writeFileSync(POOL_FILE, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e: any) {
      console.warn('[GlobalLeadPool] Lỗi lưu database bể chung:', e.message);
    }
  }

  /**
   * Tự động loại bỏ các link footer hoặc từ khóa hệ thống rác
   */
  public purgeJunk(): number {
    let purged = 0;
    for (const key of Object.keys(this.state.leads)) {
      const lead = this.state.leads[key];
      const lowerKey = (lead.id || key).toLowerCase();
      const lowerName = (lead.name || '').toLowerCase();

      const isJunkKey = JUNK_KEYS.has(lowerKey) || lowerKey.length < 3;
      const isJunkName = /^(đăng ký|đăng nhập|facebook lite|instagram|tuyển dụng|nhật ký hoạt động|xem tất cả|trợ giúp|cài đặt|điều khoản|chính sách|giới thiệu|facebook)$/i.test(lowerName);

      if (isJunkKey || isJunkName) {
        delete this.state.leads[key];
        purged++;
      }
    }
    if (purged > 0) {
      this.recomputeStats();
      this.save();
      console.log(`🧹 [GlobalLeadPool] Đã dọn sạch ${purged} bản ghi rác hệ thống khỏi kho Data!`);
    }
    return purged;
  }

  public extractLeadKey(urlOrId: string): string {
    const clean = urlOrId.trim();
    if (/^\d+$/.test(clean)) return clean;
    try {
      const u = new URL(clean);
      const idParam = u.searchParams.get('id');
      if (idParam) return idParam;
      const parts = u.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && last !== 'profile.php') return last;
    } catch {}
    return clean.replace(/[^a-zA-Z0-9]/g, '_');
  }

  /**
   * Đổ toàn bộ danh sách thành viên mới quét được từ Group vào Bể Data dùng chung (Kho Data Tích Lũy)
   */
  public ingestScannedMembers(
    members: Array<{
      id: string;
      name: string;
      url: string;
      subtitle?: string;
      joinedTimeText?: string;
      timeCategory?: '2_days' | '1_week' | '2_weeks' | 'older';
      timeCategoryLabel?: string;
    }>,
    sourceGroupUrl?: string,
    sourceGroupName?: string,
    mode: 'bds_ecopark' | 'forex' = 'bds_ecopark'
  ): { newlyAdded: number; totalInPool: number; updatedCount: number } {
    let newlyAdded = 0;
    let updatedCount = 0;
    const now = new Date().toISOString();

    for (const m of members) {
      const key = this.extractLeadKey(m.id || m.url);
      const lowerKey = key.toLowerCase();
      const lowerName = (m.name || '').toLowerCase();

      // Bỏ qua bản ghi rác
      if (JUNK_KEYS.has(lowerKey) || lowerKey.length < 3) continue;
      if (/^(đăng ký|đăng nhập|facebook lite|instagram|tuyển dụng|nhật ký hoạt động|xem tất cả|trợ giúp|cài đặt|điều khoản|chính sách|giới thiệu|facebook)$/i.test(lowerName)) continue;

      if (!this.state.leads[key]) {
        this.state.leads[key] = {
          id: key,
          name: m.name,
          url: m.url || `https://www.facebook.com/${key}`,
          sourceGroup: sourceGroupUrl,
          sourceGroupName: sourceGroupName || (sourceGroupUrl ? `Group ${sourceGroupUrl.split('/groups/')[1]?.replace(/\/+$/, '') || ''}` : undefined),
          mode,
          timeCategory: m.timeCategory || '2_days',
          timeCategoryLabel: m.timeCategoryLabel || '🔥 2 ngày gần nhất (Cực Hot)',
          subtitle: m.subtitle || m.joinedTimeText || 'Mới tham gia / Vừa hoạt động',
          joinedTimeText: m.joinedTimeText || m.subtitle || 'Mới tham gia / Vừa hoạt động',
          firstSeenAt: now,
          lastUpdatedAt: now,
          scanCount: 1,
          status: 'unassigned',
        };
        newlyAdded++;
      } else {
        // Cập nhật thông tin mới nhất vào bản ghi cũ
        const existing = this.state.leads[key];
        existing.lastUpdatedAt = now;
        existing.scanCount = (existing.scanCount || 1) + 1;
        if (m.name && m.name.length > (existing.name || '').length) {
          existing.name = m.name;
        }
        if (m.timeCategory && (m.timeCategory === '2_days' || existing.timeCategory === 'older')) {
          existing.timeCategory = m.timeCategory;
          existing.timeCategoryLabel = m.timeCategoryLabel || existing.timeCategoryLabel;
        }
        if (sourceGroupUrl) existing.sourceGroup = sourceGroupUrl;
        if (sourceGroupName) existing.sourceGroupName = sourceGroupName;
        updatedCount++;
      }
    }

    this.recomputeStats();
    this.save();
    return { newlyAdded, totalInPool: Object.keys(this.state.leads).length, updatedCount };
  }

  /**
   * Lấy toàn bộ Kho Data đã quét có hỗ trợ tìm kiếm và phân loại
   */
  public getWarehouseLeads(options?: {
    search?: string;
    mode?: string;
    timeCategory?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): {
    leads: LeadItem[];
    total: number;
    filteredTotal: number;
    stats: GlobalLeadPoolState['stats'];
  } {
    let all = Object.values(this.state.leads);

    // Sắp xếp mới nhất lên đầu
    all.sort((a, b) => {
      const timeA = new Date(a.lastUpdatedAt || a.firstSeenAt).getTime();
      const timeB = new Date(b.lastUpdatedAt || b.firstSeenAt).getTime();
      return timeB - timeA;
    });

    const total = all.length;

    // Lọc theo search
    if (options?.search) {
      const q = options.search.toLowerCase().trim();
      all = all.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.id.toLowerCase().includes(q) ||
          (l.sourceGroupName && l.sourceGroupName.toLowerCase().includes(q))
      );
    }

    // Lọc theo mode
    if (options?.mode && options.mode !== 'all') {
      all = all.filter((l) => l.mode === options.mode || (!l.mode && options.mode === 'bds_ecopark'));
    }

    // Lọc theo timeCategory
    if (options?.timeCategory && options.timeCategory !== 'all') {
      all = all.filter((l) => l.timeCategory === options.timeCategory);
    }

    // Lọc theo status
    if (options?.status && options.status !== 'all') {
      all = all.filter((l) => l.status === options.status);
    }

    const filteredTotal = all.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 200;
    const paginated = all.slice(offset, offset + limit);

    return {
      leads: paginated,
      total,
      filteredTotal,
      stats: this.state.stats,
    };
  }

  /**
   * Xóa 1 lead khỏi kho
   */
  public deleteLead(id: string): boolean {
    const key = this.extractLeadKey(id);
    if (this.state.leads[key]) {
      delete this.state.leads[key];
      this.recomputeStats();
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Đặt lại toàn bộ kho Data
   */
  public clearAllLeads(): void {
    this.state.leads = {};
    this.recomputeStats();
    this.save();
  }

  /**
   * Xuất toàn bộ Kho Data ra định dạng CSV có BOM UTF-8 (chuẩn tiếng Việt Excel)
   */
  public exportCsv(modeFilter?: string): string {
    let all = Object.values(this.state.leads);
    if (modeFilter && modeFilter !== 'all') {
      all = all.filter((l) => l.mode === modeFilter || (!l.mode && modeFilter === 'bds_ecopark'));
    }

    const header = [
      'STT',
      'Họ và Tên',
      'UID Facebook',
      'Link Profile',
      'Nhóm Nguồn',
      'Phân Loại Mốc',
      'Thời Gian Hoạt Động',
      'Chế Độ (Mode)',
      'Thời Điểm Nạp Kho',
      'Cập Nhật Gần Nhất',
      'Số Lần Quét',
      'Trạng Thái Khai Thác',
    ];

    const rows = all.map((l, index) => [
      String(index + 1),
      `"${(l.name || '').replace(/"/g, '""')}"`,
      `"${l.id}"`,
      `"${l.url}"`,
      `"${(l.sourceGroupName || l.sourceGroup || '').replace(/"/g, '""')}"`,
      `"${l.timeCategoryLabel || l.timeCategory || ''}"`,
      `"${(l.joinedTimeText || l.subtitle || '').replace(/"/g, '""')}"`,
      `"${l.mode === 'forex' ? 'Forex Tài Chính' : 'BĐS Ecopark'}"`,
      `"${new Date(l.firstSeenAt).toLocaleString('vi-VN')}"`,
      `"${l.lastUpdatedAt ? new Date(l.lastUpdatedAt).toLocaleString('vi-VN') : ''}"`,
      String(l.scanCount || 1),
      `"${l.status === 'requested' ? 'Đã gửi kết bạn' : l.status === 'friend' ? 'Đã là bạn bè' : 'Chưa khai thác'}"`,
    ]);

    // Thêm UTF-8 BOM (\uFEFF) để Excel hiển thị tiếng Việt không bị vỡ font
    return '\uFEFF' + [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }

  /**
   * KIỂM TRA CHỐNG TRÙNG BẠN BÈ GIỮA CÁC NICK (Mutual Friend Collision Prevention)
   */
  public checkFriendCollision(
    profileUrl: string,
    requestingAccountId: string
  ): {
    canSend: boolean;
    reason?: string;
    existingLead?: LeadItem;
  } {
    const key = this.extractLeadKey(profileUrl);
    const existing = this.state.leads[key];

    if (!existing) {
      return { canSend: true };
    }

    if (existing.status === 'requested' || existing.status === 'friend') {
      if (existing.assignedAccountId && existing.assignedAccountId !== requestingAccountId) {
        return {
          canSend: false,
          reason:
            `🛡️ [CHẶN TRÙNG BẠN BÈ] Khách này đã được nick **${existing.assignedAccountName || existing.assignedAccountId}** ` +
            `gửi kết bạn lúc ${existing.requestedAt ? new Date(existing.requestedAt).toLocaleTimeString('vi-VN') : 'trước đó'}.\n` +
            `👉 Hệ thống tự động CHẶN nick hiện tại để tránh lộ dàn nick và không làm phiền khách!`,
          existingLead: existing,
        };
      }

      if (existing.assignedAccountId === requestingAccountId) {
        return {
          canSend: false,
          reason: `Nick hiện tại đã gửi lời mời kết bạn cho người này trước đó.`,
          existingLead: existing,
        };
      }
    }

    return { canSend: true, existingLead: existing };
  }

  /**
   * Ghi nhận đã gửi kết bạn thành công cho 1 Lead
   */
  public recordFriendRequestSent(
    profileUrl: string,
    accountId: string,
    accountName: string,
    leadName?: string
  ): void {
    const key = this.extractLeadKey(profileUrl);
    const now = new Date().toISOString();

    if (!this.state.leads[key]) {
      this.state.leads[key] = {
        id: key,
        name: leadName || key,
        url: profileUrl,
        firstSeenAt: now,
        status: 'requested',
        assignedAccountId: accountId,
        assignedAccountName: accountName,
        requestedAt: now,
      };
    } else {
      this.state.leads[key].status = 'requested';
      this.state.leads[key].assignedAccountId = accountId;
      this.state.leads[key].assignedAccountName = accountName;
      this.state.leads[key].requestedAt = now;
      if (leadName && !this.state.leads[key].name) {
        this.state.leads[key].name = leadName;
      }
    }

    this.recomputeStats();
    this.save();
  }

  public releaseLeadsFromDeadAccount(deadAccountId: string): { releasedCount: number } {
    let releasedCount = 0;
    for (const key of Object.keys(this.state.leads)) {
      const lead = this.state.leads[key];
      if (lead.assignedAccountId === deadAccountId) {
        lead.status = 'unassigned';
        lead.assignedAccountId = undefined;
        lead.assignedAccountName = undefined;
        releasedCount++;
      }
    }

    this.recomputeStats();
    this.save();
    console.log(`♻️ [GlobalLeadPool] Đã nhả ${releasedCount} khách hàng của nick ${deadAccountId} về lại bể dùng chung!`);
    return { releasedCount };
  }

  public getUnassignedLeads(limit = 20): LeadItem[] {
    return Object.values(this.state.leads)
      .filter((l) => l.status === 'unassigned')
      .slice(0, limit);
  }

  public getStats() {
    return this.state.stats;
  }

  private recomputeStats(): void {
    const all = Object.values(this.state.leads);
    this.state.stats = {
      totalScanned: all.length,
      requestedCount: all.filter((l) => l.status === 'requested').length,
      friendCount: all.filter((l) => l.status === 'friend').length,
      bdsCount: all.filter((l) => !l.mode || l.mode === 'bds_ecopark').length,
      forexCount: all.filter((l) => l.mode === 'forex').length,
      twoDaysCount: all.filter((l) => l.timeCategory === '2_days').length,
      oneWeekCount: all.filter((l) => l.timeCategory === '1_week').length,
      twoWeeksCount: all.filter((l) => l.timeCategory === '2_weeks').length,
    };
  }
}

export const globalLeadPoolService = new GlobalLeadPoolService();
