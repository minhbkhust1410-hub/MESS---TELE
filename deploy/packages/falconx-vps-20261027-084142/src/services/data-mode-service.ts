import fs from 'fs';
import path from 'path';
import { TargetGroup, getTargetGroups, addTargetGroup, getKeywords, setKeywords, getCommentTemplates } from '../db/auto-comment-store.js';
import { parseForexLead, ParsedForexLead } from './forex-parser.js';

export type OperatingMode = 'bds_ecopark' | 'forex_finance';

export interface ModeInfo {
  mode: OperatingMode;
  name: string;
  badge: string;
  themeColor: string; // 'emerald' | 'amber'
  hexColor: string;   // '#10b981' | '#f59e0b'
  accentBg: string;
  accentBorder: string;
  description: string;
  icon: string;
}

export const MODE_METADATA: Record<OperatingMode, ModeInfo> = {
  bds_ecopark: {
    mode: 'bds_ecopark',
    name: 'BĐS ECOPARK',
    badge: 'Chuyên Viên BĐS Sinh Thái',
    themeColor: 'emerald',
    hexColor: '#10b981',
    accentBg: 'rgba(16, 185, 129, 0.12)',
    accentBorder: 'rgba(16, 185, 129, 0.35)',
    description: 'Săn khách thuê/mua căn hộ, biệt thự 49 tòa Ecopark & kết nối quỹ căn',
    icon: '🏡',
  },
  forex_finance: {
    mode: 'forex_finance',
    name: 'FOREX TÀI CHÍNH',
    badge: 'Trader & Tín Hiệu Vàng XAU/USD',
    themeColor: 'amber',
    hexColor: '#f59e0b',
    accentBg: 'rgba(245, 158, 11, 0.12)',
    accentBorder: 'rgba(245, 158, 11, 0.35)',
    description: 'Săn trader, khách tìm sàn uy tín, kèo vàng XAU/USD, copytrade & thi quỹ FTMO',
    icon: '📈',
  },
};

const MODE_CONFIG_FILE = path.resolve('./data/active_mode.json');
const FOREX_DATA_FILE = path.resolve('./data/forex_leads_pool.json');

// Danh mục các hội nhóm chuẩn ngành Forex Tài Chính
const SEED_FOREX_GROUPS: Array<{ name: string; url: string; membersCount?: number }> = [
  {
    name: 'CỘNG ĐỒNG TRADER FOREX VIỆT NAM (KÈO VÀNG XAU/USD) 📈',
    url: 'https://www.facebook.com/groups/forextradervietnam/',
    membersCount: 148500,
  },
  {
    name: 'HỘI SĂN QUỸ FTMO & MFF VIỆT NAM (CHIA SẺ KINH NGHIỆM PASS QUỸ) 🎯',
    url: 'https://www.facebook.com/groups/traderquyvietnam/',
    membersCount: 82300,
  },
  {
    name: 'DIỄN ĐÀN ĐẦU TƯ NGOẠI HỐI & CHỨNG KHOÁN QUỐC TẾ 💎',
    url: 'https://www.facebook.com/groups/diendanforexvn/',
    membersCount: 195000,
  },
  {
    name: 'CHIA SẺ TÍN HIỆU SCALPING VÀNG & COPYTRADE TỰ ĐỘNG (EA MT4/MT5) 🤖',
    url: 'https://www.facebook.com/groups/scalpingcopytrade/',
    membersCount: 64200,
  },
  {
    name: 'REVIEW SÀN UY TÍN & CẢNH BÁO SÀN FOREX LỪA ĐẢO 🛡️',
    url: 'https://www.facebook.com/groups/reviewsanforex/',
    membersCount: 112000,
  },
];

// Danh mục từ khóa quét tự động ngành Forex
export const FOREX_KEYWORDS: string[] = [
  'kèo vàng',
  'xauusd',
  'tín hiệu',
  'xin sàn',
  'sàn nào uy tín',
  'nạp rút',
  'copytrade',
  'bot ea',
  'ftmo',
  'thi quỹ',
  'cháy tk',
  'cứu lệnh',
  'exness',
  'ic markets',
  'xm',
  'học trade',
  'pass quỹ',
  'spread thấp',
];

// Mẫu bài cào / lead mẫu được phân loại thực tế
export interface ClassifiedForexMemberLead {
  id: string;
  name: string;
  profileUrl: string;
  sourceGroup: string;
  scannedAt: string;
  lead: ParsedForexLead;
  status: 'new' | 'contacted' | 'vip' | 'ignored';
}

class DataModeService {
  private currentMode: OperatingMode = 'bds_ecopark';

  constructor() {
    this.loadState();
    this.seedForexGroupsIfMissing();
  }

  private loadState() {
    try {
      if (fs.existsSync(MODE_CONFIG_FILE)) {
        const raw = JSON.parse(fs.readFileSync(MODE_CONFIG_FILE, 'utf8'));
        if (raw.currentMode === 'bds_ecopark' || raw.currentMode === 'forex_finance') {
          this.currentMode = raw.currentMode;
        }
      }
    } catch {
      this.currentMode = 'bds_ecopark';
    }
  }

  private saveState() {
    try {
      fs.mkdirSync(path.dirname(MODE_CONFIG_FILE), { recursive: true });
      fs.writeFileSync(
        MODE_CONFIG_FILE,
        JSON.stringify({ currentMode: this.currentMode, updatedAt: new Date().toISOString() }, null, 2),
        'utf8'
      );
    } catch (err: any) {
      console.warn('[DataModeService] Lỗi lưu active_mode.json:', err.message);
    }
  }

  public getCurrentMode(): OperatingMode {
    return this.currentMode;
  }

  public getModeMetadata(mode?: OperatingMode): ModeInfo {
    return MODE_METADATA[mode || this.currentMode];
  }

  public setMode(mode: OperatingMode): ModeInfo {
    if (mode === 'bds_ecopark' || mode === 'forex_finance') {
      this.currentMode = mode;
      this.saveState();
      console.log(`🔀 [Mode Switcher] Đã chuyển sang chế độ: ${MODE_METADATA[mode].name} (${mode})`);
    }
    return MODE_METADATA[this.currentMode];
  }

  /**
   * Nạp nhóm Forex mẫu vào cơ sở dữ liệu nếu chưa có
   */
  public seedForexGroupsIfMissing() {
    try {
      const allGroups = getTargetGroups();
      const hasForex = allGroups.some(
        (g) => (g as any).mode === 'forex_finance' || g.category?.toLowerCase().includes('forex')
      );

      if (!hasForex) {
        console.log('🌱 [DataModeService] Đang nạp danh mục nhóm Facebook mẫu cho MODE FOREX TÀI CHÍNH...');
        for (const item of SEED_FOREX_GROUPS) {
          const added = addTargetGroup(item.url, item.name);
          (added as any).mode = 'forex_finance';
          added.category = 'Forex Tài Chính';
        }
      }
    } catch (err: any) {
      console.warn('[DataModeService] Lỗi nạp seed nhóm Forex:', err.message);
    }
  }

  /**
   * Lọc danh sách Groups theo Mode đang chọn
   */
  public getGroupsForMode(mode?: OperatingMode): TargetGroup[] {
    const targetMode = mode || this.currentMode;
    const all = getTargetGroups();

    if (targetMode === 'bds_ecopark') {
      return all.filter((g) => {
        const cat = (g.category || '').toLowerCase();
        const m = (g as any).mode;
        return m === 'bds_ecopark' || cat.includes('ecopark') || cat.includes('bđs') || (!m && !cat.includes('forex'));
      });
    } else {
      return all.filter((g) => {
        const cat = (g.category || '').toLowerCase();
        const m = (g as any).mode;
        return (
          m === 'forex_finance' ||
          cat.includes('forex') ||
          cat.includes('tài chính') ||
          cat.includes('trader') ||
          cat.includes('quỹ')
        );
      });
    }
  }

  /**
   * Lấy danh sách Member / Leads đã được thuật toán phân loại theo Mode
   */
  public getLeadsForMode(mode?: OperatingMode): ClassifiedForexMemberLead[] {
    const targetMode = mode || this.currentMode;

    if (targetMode === 'forex_finance') {
      return this.getOrGenerateForexLeads();
    }

    // Nếu là BĐS Ecopark, trả về danh sách lead BĐS
    return [];
  }

  private getOrGenerateForexLeads(): ClassifiedForexMemberLead[] {
    if (fs.existsSync(FOREX_DATA_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(FOREX_DATA_FILE, 'utf8'));
        if (Array.isArray(raw) && raw.length > 0) return raw;
      } catch {}
    }

    // Mẫu lead thực tế được bóc tách từ các group Forex để người dùng trải nghiệm phân loại ngay
    const samplePosts = [
      {
        name: 'Tuấn Hoàng (Trader)',
        post: 'Anh em cho mình hỏi sàn Exness dạo này nạp rút qua Vietcombank có bị delay không? Đang muốn nạp 5k đánh Vàng XAU/USD cần sàn spread mỏng và nạp rút trong 30s. Bác nào làm IB hỗ trợ hoàn com không?',
      },
      {
        name: 'Minh Đức FX',
        post: 'Bác nào có nhóm Telegram VIP bắn kèo XAUUSD scalping chuẩn không cho em xin vào với? Đang theo mấy nhóm toàn gồng lỗ 100 pips hãi quá. Cần nhóm có Entry, SL, TP rõ ràng!',
      },
      {
        name: 'Phương Linh',
        post: 'Em là newbie mới tìm hiểu thị trường Forex được 2 tuần. Cho em hỏi nên bắt đầu học từ nến hay chỉ báo Indicator ạ? Bác nào có tài liệu Price Action căn bản cho em xin với!',
      },
      {
        name: 'Trần Văn Long',
        post: 'Cứu em với các bác ơi! Lỡ vào nhồi 3 lệnh BUY Vàng XAUUSD ở giá 2745 đang âm 3500$, tài khoản sắp chạm mức margin call rồi. Có cao thủ nào giúp em tính điểm cân lệnh không ạ?',
      },
      {
        name: 'Quốc Đạt (FTMO Hunter)',
        post: 'Vừa pass vòng 1 gói 100k quỹ FTMO. Bác nào đang thi vòng 2 chia sẻ kinh nghiệm giữ max daily drawdown dưới 5% với. Chiến lược chủ yếu đánh theo xu hướng US30 và XAU.',
      },
      {
        name: 'Hải Nam EA',
        post: 'Có bác nào đang chạy Copytrade hoặc Bot EA trên sàn IC Markets lợi nhuận tầm 8-12%/tháng không? Em không có thời gian canh chart muốn tìm bên nào có Myfxbook chuẩn để copy vốn 10.000$.',
      },
      {
        name: 'Thanh Tùng',
        post: 'CẢNH BÁO LỪA ĐẢO: Anh em né sàn Fx...Pro đa cấp này ra nhé! Nạp vào 2000$ đánh có lời bấm rút tiền thì nó bắt đóng thuế 20% rồi chặn luôn Zalo. Scam 100%!',
      },
    ];

    const leads: ClassifiedForexMemberLead[] = samplePosts.map((sp, idx) => {
      const parsed = parseForexLead(sp.post);
      return {
        id: `forex_lead_${idx + 1}`,
        name: sp.name,
        profileUrl: `https://www.facebook.com/user.${100085000000 + idx}`,
        sourceGroup: idx % 2 === 0 ? 'CỘNG ĐỒNG TRADER FOREX VIỆT NAM' : 'HỘI SĂN QUỸ FTMO & MFF',
        scannedAt: new Date(Date.now() - idx * 3600000 * 4).toISOString(),
        lead: parsed,
        status: idx === 0 ? 'vip' : 'new',
      };
    });

    try {
      fs.writeFileSync(FOREX_DATA_FILE, JSON.stringify(leads, null, 2), 'utf8');
    } catch {}

    return leads;
  }

  /**
   * Thống kê tổng hợp số liệu theo từng Mode
   */
  public getModeStats() {
    const bdsGroups = this.getGroupsForMode('bds_ecopark');
    const forexGroups = this.getGroupsForMode('forex_finance');
    const forexLeads = this.getLeadsForMode('forex_finance');

    return {
      currentMode: this.currentMode,
      bds: {
        groupsCount: bdsGroups.length,
        buildingsCount: 49,
        activePostsCount: 8,
      },
      forex: {
        groupsCount: forexGroups.length,
        leadsCount: forexLeads.length,
        hotLeadsCount: forexLeads.filter((l) => l.lead.intent === 'lead_broker' || l.lead.intent === 'lead_signal').length,
        botCopytradeCount: forexLeads.filter((l) => l.lead.intent === 'lead_copytrade_ea').length,
        fundTradersCount: forexLeads.filter((l) => l.lead.intent === 'lead_fund').length,
      },
    };
  }
}

export const dataModeService = new DataModeService();
