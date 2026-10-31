import fs from 'fs';
import path from 'path';
import { TargetGroup, getTargetGroups, addTargetGroup } from '../db/auto-comment-store.js';
import { parseForexLead, ParsedForexLead, generateForexTargetedComment } from './forex-parser.js';

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

export interface ForexOfferItem {
  id: string;
  category: 'signal' | 'broker_ib' | 'copytrade_ea' | 'fund_ftmo' | 'recovery' | 'education';
  categoryLabel: string;
  title: string;
  symbolOrBroker: string;
  highlightText: string;
  ctaComment: string;
  status: 'available' | 'closed';
  createdAt: string;
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
const FOREX_INVENTORY_FILE = path.resolve('./data/forex_inventory.json');

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

export interface ClassifiedForexMemberLead {
  id: string;
  name: string;
  profileUrl: string;
  sourceGroup: string;
  scannedAt: string;
  lead: ParsedForexLead;
  status: 'new' | 'contacted' | 'vip' | 'ignored';
}

const DEFAULT_FOREX_OFFERS: ForexOfferItem[] = [
  {
    id: 'fx_offer_1',
    category: 'signal',
    categoryLabel: 'Tín Hiệu VIP',
    title: 'Channel Tín Hiệu Vàng XAU/USD Thực Chiến (3-5 Kèo/Ngày)',
    symbolOrBroker: 'XAU/USD · US30',
    highlightText: 'Winrate ~82% · Có Entry/SL/TP rõ ràng',
    ctaComment: 'Dạ bên em đang mở cửa trải nghiệm miễn phí 7 ngày nhóm VIP bắn kèo Vàng XAU/USD thực chiến (Entry/SL/TP rõ ràng, winrate ~82%). Bác check inbox em gửi link vào nhóm ngay nhé 📈',
    status: 'available',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fx_offer_2',
    category: 'broker_ib',
    categoryLabel: 'Hoàn Phí IB Sàn',
    title: 'Mở TK Exness / IC Markets Zero Spread — Tự Động Backcom 95%',
    symbolOrBroker: 'Exness · IC Markets',
    highlightText: 'Hoàn com 95% tự động · Nạp rút VietQR 30s',
    ctaComment: 'Dạ nếu bác đánh Vàng XAU/USD cần spread mỏng và nạp rút VietQR 30s thì Exness/IC Markets tài khoản Raw/Zero là chuẩn nhất. Bên em cài hoàn phí tự động 95% mỗi sáng, bác check inbox em hỗ trợ nhé 💸',
    status: 'available',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fx_offer_3',
    category: 'copytrade_ea',
    categoryLabel: 'Copytrade & Bot EA',
    title: 'Bot EA Quản Trị Vốn XAU/USD Đa Khung (MT4/MT5 Có Myfxbook)',
    symbolOrBroker: 'Bot EA · Copytrade',
    highlightText: 'Lợi nhuận 10-14%/tháng · Max DD < 8%',
    ctaComment: 'Dạ hệ thống Copytrade & Bot EA bên em chạy trực tiếp trên tài khoản Exness/IC Markets của khách, lịch sử Myfxbook 18 tháng chuẩn chỉ, Drawdown dưới 8%. Bác check tin nhắn em gửi link Myfxbook đối chiếu nhé 🤖',
    status: 'available',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fx_offer_4',
    category: 'fund_ftmo',
    categoryLabel: 'Thi Quỹ FTMO/MFF',
    title: 'Kèm 1-1 & Bộ Quản Trị Rủi Ro Pass Quỹ FTMO 100.000$',
    symbolOrBroker: 'FTMO · The5ers',
    highlightText: 'Giữ Max Daily DD < 3% · Tặng bảng tính Lot',
    ctaComment: 'Bác đang thi quỹ FTMO gói bao nhiêu thế ạ? Bên em có sẵn bảng Excel tính Volume tự động chống vi phạm Daily Drawdown 5% và lộ trình pass 2 vòng thực tế. Bác check inbox em gửi tặng file nhé 🎯',
    status: 'available',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fx_offer_5',
    category: 'recovery',
    categoryLabel: 'Cứu Lệnh & Gỡ Âm',
    title: 'Tổ Tư Vấn Cân Lệnh Hedge & Gỡ Âm XAU/USD An Toàn 24/7',
    symbolOrBroker: 'XAU/USD · Cứu TK',
    highlightText: 'Tính điểm Breakeven · Chống cháy Margin',
    ctaComment: 'Bác bình tĩnh đừng nhồi thêm lệnh vội nhé! Bác nhắn qua inbox các mốc giá đang kẹt và mức Margin Level hiện tại, kỹ thuật bên em tính điểm khóa Hedge và vùng hồi để gỡ hòa vốn an toàn cho bác ngay ạ 🛡️',
    status: 'available',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fx_offer_6',
    category: 'education',
    categoryLabel: 'Đào Tạo Newbie',
    title: 'Bộ Giáo Trình Price Action & Smart Money Concept (SMC) Thực Chiến',
    symbolOrBroker: 'Price Action · SMC',
    highlightText: 'Miễn phí 100% · Kèm mở TK Demo/Cent',
    ctaComment: 'Người mới bác cứ luyện trên tài khoản Demo hoặc Cent trước cho vững tâm lý nhé. Em gửi tặng bác trọn bộ Ebook Price Action & Video 5 bước đọc cấu trúc sóng qua inbox, bác mở tin nhắn nhận tài liệu nha 📚',
    status: 'available',
    createdAt: new Date().toISOString(),
  },
];

class DataModeService {
  private currentMode: OperatingMode = 'bds_ecopark';
  private userModes: Record<string, OperatingMode> = {};
  private forexOffers: ForexOfferItem[] = [];

  constructor() {
    this.loadState();
    this.loadForexOffers();
    this.seedForexGroupsIfMissing();
  }

  private loadState() {
    try {
      if (fs.existsSync(MODE_CONFIG_FILE)) {
        const raw = JSON.parse(fs.readFileSync(MODE_CONFIG_FILE, 'utf8').replace(/^\uFEFF/, ''));
        if (raw.currentMode === 'bds_ecopark' || raw.currentMode === 'forex_finance') {
          this.currentMode = raw.currentMode;
        }
        if (raw.userModes && typeof raw.userModes === 'object') {
          this.userModes = raw.userModes;
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
        JSON.stringify(
          {
            currentMode: this.currentMode,
            userModes: this.userModes,
            updatedAt: new Date().toISOString(),
          },
          null,
          2
        ),
        'utf8'
      );
    } catch (err: any) {
      console.warn('[DataModeService] Lỗi lưu active_mode.json:', err.message);
    }
  }

  private loadForexOffers() {
    try {
      if (fs.existsSync(FOREX_INVENTORY_FILE)) {
        const raw = JSON.parse(fs.readFileSync(FOREX_INVENTORY_FILE, 'utf8').replace(/^\uFEFF/, ''));
        if (Array.isArray(raw) && raw.length > 0) {
          this.forexOffers = raw;
          return;
        }
      }
    } catch {}
    this.forexOffers = [...DEFAULT_FOREX_OFFERS];
    this.saveForexOffers();
  }

  private saveForexOffers() {
    try {
      fs.mkdirSync(path.dirname(FOREX_INVENTORY_FILE), { recursive: true });
      fs.writeFileSync(FOREX_INVENTORY_FILE, JSON.stringify(this.forexOffers, null, 2), 'utf8');
    } catch {}
  }

  public getForexOffers(): ForexOfferItem[] {
    if (!this.forexOffers || this.forexOffers.length === 0) {
      this.loadForexOffers();
    }
    return this.forexOffers;
  }

  public toggleForexOfferStatus(offerId: string): ForexOfferItem | null {
    const item = this.forexOffers.find((o) => o.id === offerId);
    if (!item) return null;
    item.status = item.status === 'available' ? 'closed' : 'available';
    this.saveForexOffers();
    return item;
  }

  public ingestForexOfferFromText(rawText: string): ForexOfferItem {
    const parsed = parseForexLead(rawText);
    const categoryMap: Record<string, { cat: ForexOfferItem['category']; label: string }> = {
      lead_broker: { cat: 'broker_ib', label: 'Hoàn Phí IB Sàn' },
      lead_signal: { cat: 'signal', label: 'Tín Hiệu VIP' },
      lead_copytrade_ea: { cat: 'copytrade_ea', label: 'Copytrade & Bot EA' },
      lead_fund: { cat: 'fund_ftmo', label: 'Thi Quỹ FTMO/MFF' },
      lead_recovery: { cat: 'recovery', label: 'Cứu Lệnh & Gỡ Âm' },
      lead_newbie: { cat: 'education', label: 'Đào Tạo Newbie' },
    };
    const mapped = categoryMap[parsed.intent] || { cat: 'signal', label: 'Kèo Giao Dịch Mới' };
    const firstLine = rawText.split(/\r?\n/)[0].trim().slice(0, 85);
    const symbolStr =
      [...parsed.symbols, ...parsed.brokers].slice(0, 2).join(' · ') || 'XAU/USD · Forex VIP';

    const newOffer: ForexOfferItem = {
      id: `fx_offer_${Date.now()}`,
      category: mapped.cat,
      categoryLabel: mapped.label,
      title: firstLine || 'Kèo Tín Hiệu XAU/USD & Ưu Đãi Giao Dịch Mới',
      symbolOrBroker: symbolStr,
      highlightText: parsed.suggestedAction.slice(0, 48),
      ctaComment: generateForexTargetedComment(parsed),
      status: 'available',
      createdAt: new Date().toISOString(),
    };

    this.forexOffers.unshift(newOffer);
    this.saveForexOffers();
    return newOffer;
  }

  public matchBestForexOffer(lead: ParsedForexLead): { offer: ForexOfferItem; score: number } {
    const available = this.getForexOffers().filter((o) => o.status === 'available');
    const pool = available.length > 0 ? available : this.getForexOffers();

    const intentToCat: Record<string, ForexOfferItem['category']> = {
      lead_broker: 'broker_ib',
      lead_signal: 'signal',
      lead_copytrade_ea: 'copytrade_ea',
      lead_fund: 'fund_ftmo',
      lead_recovery: 'recovery',
      lead_newbie: 'education',
    };
    const targetCat = intentToCat[lead.intent] || 'signal';
    const matched = pool.find((o) => o.category === targetCat) || pool[0];
    return {
      offer: matched,
      score: Math.max(88, Math.min(99, lead.confidenceScore + 6)),
    };
  }

  /**
   * Lấy Mode độc lập theo từng User hoặc Header phiên trình duyệt
   * Giúp 2 người dùng (1 người làm BĐS Ecopark, 1 người làm Forex) hoạt động song song 100% độc lập
   */
  public getCurrentMode(userId?: string, explicitMode?: string): OperatingMode {
    if (explicitMode === 'bds_ecopark' || explicitMode === 'forex_finance') {
      return explicitMode;
    }
    if (userId && (this.userModes[userId] === 'bds_ecopark' || this.userModes[userId] === 'forex_finance')) {
      return this.userModes[userId];
    }
    return this.currentMode;
  }

  public getModeMetadata(mode?: OperatingMode): ModeInfo {
    return MODE_METADATA[mode || this.currentMode];
  }

  public setMode(mode: OperatingMode, userId?: string): ModeInfo {
    if (mode === 'bds_ecopark' || mode === 'forex_finance') {
      if (userId) {
        this.userModes[userId] = mode;
      }
      this.currentMode = mode;
      this.saveState();
      console.log(`🔀 [Mode Switcher] User [${userId || 'global'}] đã chuyển sang chế độ: ${MODE_METADATA[mode].name} (${mode})`);
    }
    return MODE_METADATA[mode];
  }

  public getUserModesMap(): Record<string, OperatingMode> {
    return { ...this.userModes };
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

    return [];
  }

  private getOrGenerateForexLeads(): ClassifiedForexMemberLead[] {
    if (fs.existsSync(FOREX_DATA_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(FOREX_DATA_FILE, 'utf8').replace(/^\uFEFF/, ''));
        if (Array.isArray(raw) && raw.length > 0) return raw;
      } catch {}
    }

    const samplePosts = [
      {
        name: 'Tuấn Hoàng (Trader)',
        post: 'Anh em cho mình hỏi sàn Exness dạo này nạp rút qua Vietcombank có bị delay không? Đang muốn nạp 5k đánh Vàng XAU/USD cần sàn spread mỏng và nạp rút trong 30s. Bác nào làm IB hỗ trợ hoàn com liên hệ Zalo 0988412569 giúp mình nhé!',
      },
      {
        name: 'Minh Đức FX',
        post: 'Bác nào có nhóm Telegram VIP bắn kèo XAUUSD scalping chuẩn không cho em xin vào với? Đang theo mấy nhóm toàn gồng lỗ 100 pips hãi quá. Cần nhóm có Entry, SL, TP rõ ràng! Nhắn Zalo em: 0912654890',
      },
      {
        name: 'Trần Văn Long',
        post: 'Cứu em với các bác ơi! Lỡ vào nhồi 3 lệnh BUY Vàng XAUUSD ở giá 2745 đang âm 3500$, tài khoản sắp chạm mức margin call rồi. Có cao thủ nào giúp em tính điểm cân lệnh không ạ? SĐT em: 0977321456',
      },
      {
        name: 'Hải Nam EA',
        post: 'Có bác nào đang chạy Copytrade hoặc Bot EA trên sàn IC Markets lợi nhuận tầm 8-12%/tháng không? Em không có thời gian canh chart muốn tìm bên nào có Myfxbook chuẩn để copy vốn 10.000$. LH: 0904889123',
      },
      {
        name: 'Quốc Đạt (FTMO Hunter)',
        post: 'Vừa pass vòng 1 gói 100k quỹ FTMO. Bác nào đang thi vòng 2 chia sẻ kinh nghiệm giữ max daily drawdown dưới 5% với. Chiến lược chủ yếu đánh theo xu hướng US30 và XAU. Tele: @quocdat_fx',
      },
      {
        name: 'Phương Linh',
        post: 'Em là newbie mới tìm hiểu thị trường Forex được 2 tuần. Cho em hỏi nên bắt đầu học từ nến hay chỉ báo Indicator ạ? Bác nào có tài liệu Price Action căn bản kèm mở TK Cent cho em xin với! Zalo: 0936712345',
      },
      {
        name: 'Thanh Tùng',
        post: 'CẢNH BÁO LỪA ĐẢO: Anh em né sàn Fx...Pro đa cấp này ra nhé! Nạp vào 2000$ đánh có lời bấm rút tiền thì nó bắt đóng thuế 20% rồi chặn luôn Zalo. Đang cần tìm sàn quốc tế có giấy phép FCA uy tín để chuyển sang!',
      },
    ];

    const leads: ClassifiedForexMemberLead[] = samplePosts.map((sp, idx) => {
      const parsed = parseForexLead(sp.post);
      return {
        id: `forex_lead_${idx + 1}`,
        name: sp.name,
        profileUrl: `https://www.facebook.com/groups/forextradervietnam/posts/${100085000000 + idx}`,
        sourceGroup: idx % 2 === 0 ? 'CỘNG ĐỒNG TRADER FOREX VIỆT NAM' : 'HỘI SĂN QUỸ FTMO & MFF',
        scannedAt: new Date(Date.now() - idx * 1800_000).toISOString(),
        lead: parsed,
        status: idx < 3 ? 'vip' : 'new',
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
  public getModeStats(requestedMode?: OperatingMode) {
    const bdsGroups = this.getGroupsForMode('bds_ecopark');
    const forexGroups = this.getGroupsForMode('forex_finance');
    const forexLeads = this.getLeadsForMode('forex_finance');
    const offers = this.getForexOffers();

    return {
      currentMode: requestedMode || this.currentMode,
      bds: {
        groupsCount: bdsGroups.length,
        buildingsCount: 49,
        activePostsCount: 8,
      },
      forex: {
        groupsCount: forexGroups.length,
        leadsCount: forexLeads.length,
        offersCount: offers.length,
        availableOffersCount: offers.filter((o) => o.status === 'available').length,
        hotLeadsCount: forexLeads.filter((l) => l.lead.intent === 'lead_broker' || l.lead.intent === 'lead_signal').length,
        botCopytradeCount: forexLeads.filter((l) => l.lead.intent === 'lead_copytrade_ea').length,
        fundTradersCount: forexLeads.filter((l) => l.lead.intent === 'lead_fund').length,
      },
    };
  }
}

export const dataModeService = new DataModeService();
