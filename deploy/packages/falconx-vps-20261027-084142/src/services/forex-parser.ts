/**
 * FOREX & FINANCIAL LEAD PARSER & NLP CLASSIFICATION ENGINE
 * Thuật toán bóc tách dữ liệu & phân loại khách hàng tiềm năng ngành Forex / Tài chính
 * Hoạt động 100% offline, không tốn chi phí AI, tốc độ microsecond
 */

export type ForexIntent =
  | 'lead_broker'        // Cần tìm sàn uy tín, nạp rút nhanh, hoàn phí com, bonus
  | 'lead_signal'        // Xin tín hiệu, kèo vàng XAUUSD, nhóm tele VIP
  | 'lead_copytrade_ea'  // Tìm copytrade, bot EA tự động MT4/MT5
  | 'lead_fund'          // Săn quỹ, thi pass quỹ FTMO / MFF
  | 'lead_newbie'        // Người mới tìm hiểu, xin tài liệu, tìm mentor
  | 'lead_recovery'      // Cháy tài khoản, gồng lỗ, xin cứu lệnh
  | 'scam_alert'         // Cảnh báo lừa đảo, phốt sàn không rút được tiền
  | 'market_discussion'; // Bàn luận tin tức vĩ mô (Non-farm, CPI, FED)

export interface ParsedForexLead {
  rawText: string;
  intent: ForexIntent;
  intentLabel: string;
  intentColor: string; // Mã màu badge (Tailwind hoặc Hex)
  symbols: string[];   // Cặp tiền: XAUUSD, EURUSD, BTC...
  brokers: string[];   // Tên sàn: Exness, XM, IC Markets...
  confidenceScore: number; // 0 - 100%
  contact?: {
    phone?: string;
    telegram?: string;
    zalo?: string;
  };
  sentiment: 'positive' | 'neutral' | 'urgent_risk';
  suggestedAction: string;
}

// 1. Danh mục các cặp tiền / tài sản phổ biến
const FOREX_SYMBOLS_DICT: { symbol: string; regex: RegExp }[] = [
  { symbol: 'XAU/USD (Vàng)', regex: /(?<!\p{L})(?:xauusd|xau\s*\/\s*usd|xau|vàng|gold)(?!\p{L})/iu },
  { symbol: 'BTC/USD (Bitcoin)', regex: /(?<!\p{L})(?:btc|bitcoin|btcusd|btc\s*\/\s*usd|crypto)(?!\p{L})/iu },
  { symbol: 'EUR/USD', regex: /(?<!\p{L})(?:eurusd|eur\s*\/\s*usd|eu)(?!\p{L})/iu },
  { symbol: 'GBP/USD', regex: /(?<!\p{L})(?:gbpusd|gbp\s*\/\s*usd|gu)(?!\p{L})/iu },
  { symbol: 'USD/JPY', regex: /(?<!\p{L})(?:usdjpy|usd\s*\/\s*jpy|uj)(?!\p{L})/iu },
  { symbol: 'US30 (Dow Jones)', regex: /(?<!\p{L})(?:us30|dow\s*jones|dj30)(?!\p{L})/iu },
  { symbol: 'Dầu (OIL / USOIL)', regex: /(?<!\p{L})(?:usoil|wti|dầu|crude\s*oil)(?!\p{L})/iu },
  { symbol: 'Chỉ Số DXY', regex: /(?<!\p{L})(?:dxy|dollar\s*index|đô\s*la)(?!\p{L})/iu },
  { symbol: 'ETH/USD', regex: /(?<!\p{L})(?:eth|ethereum|ethusd)(?!\p{L})/iu },
];

// 2. Danh mục sàn giao dịch quốc tế
const FOREX_BROKERS_DICT: { broker: string; regex: RegExp }[] = [
  { broker: 'Exness', regex: /(?<!\p{L})(?:exness|sàn\s*ex)(?!\p{L})/iu },
  { broker: 'IC Markets', regex: /(?<!\p{L})(?:ic\s*markets|icmarket|icm)(?!\p{L})/iu },
  { broker: 'XM', regex: /(?<!\p{L})(?:xm|sàn\s*xm)(?!\p{L})/iu },
  { broker: 'FBS', regex: /(?<!\p{L})(?:fbs)(?!\p{L})/iu },
  { broker: 'FXTM', regex: /(?<!\p{L})(?:fxtm|forextime)(?!\p{L})/iu },
  { broker: 'Vantage', regex: /(?<!\p{L})(?:vantage|vantage\s*fx)(?!\p{L})/iu },
  { broker: 'Binance', regex: /(?<!\p{L})(?:binance|cz)(?!\p{L})/iu },
  { broker: 'Bybit', regex: /(?<!\p{L})(?:bybit)(?!\p{L})/iu },
  { broker: 'FTMO', regex: /(?<!\p{L})(?:ftmo)(?!\p{L})/iu },
  { broker: 'MFF (MyForexFunds)', regex: /(?<!\p{L})(?:mff|myforexfunds|my\s*forex\s*funds)(?!\p{L})/iu },
];

// 3. Quy tắc phát hiện Ý Định (Intent NLP Patterns)
const INTENT_PATTERNS: {
  intent: ForexIntent;
  label: string;
  color: string;
  keywords: RegExp;
  weight: number;
}[] = [
  {
    intent: 'scam_alert',
    label: 'Cảnh Báo Lừa Đảo / Phốt Sàn',
    color: '#ef4444', // Red
    keywords: /(?:lừa\s*đảo|scam|không\s*rút\s*được|chặn\s*rút|sập\s*sàn|ôm\s*lệnh|bùng\s*tiền|phốt|cháy\s*tài\s*khoản|cháy\s*tk\s*oan|bị\s*dụ|chuyên\s*gia\s*dỏm)/iu,
    weight: 95,
  },
  {
    intent: 'lead_broker',
    label: 'Khách Cần Sàn / Nạp Rút / Bonus',
    color: '#10b981', // Emerald
    keywords: /(?:tìm\s*sàn|sàn\s*nào\s*uy\s*tín|sàn\s*nạp\s*rút|nạp\s*rút\s*nhanh|rút\s*tiền\s*không\s*mất\s*phí|mở\s*tài\s*khoản|link\s*đăng\s*ký|bonus\s*[0-9]+|hoàn\s*phí|back\s*com|hoa\s*hồng\s*ib|sàn\s*spread\s*thấp)/iu,
    weight: 90,
  },
  {
    intent: 'lead_signal',
    label: 'Khách Tìm Tín Hiệu / Kèo VIP',
    color: '#f59e0b', // Amber / Gold
    keywords: /(?:kèo\s*vàng|xin\s*kèo|tín\s*hiệu|bắn\s*lệnh|nhóm\s*vip|kèo\s*hôm\s*nay|lệnh\s*hôm\s*nay|buy\s*hay\s*sell|entry\s*ở\s*đâu|tp\s*ở\s*đâu|sl\s*ở\s*đâu|target\s*bao\s*nhiêu|zoom\s*thực\s*chiến|chiến\s*lược\s*vàng)/iu,
    weight: 88,
  },
  {
    intent: 'lead_copytrade_ea',
    label: 'Khách Cần Copytrade / Bot EA',
    color: '#8b5cf6', // Violet
    keywords: /(?:copytrade|copy\s*trade|bot\s*ea|expert\s*advisor|auto\s*trade|robot\s*trade|treo\s*bot|quản\s*lý\s*vốn\s*tự\s*động|chạy\s*ea|myfxbook|lợi\s*nhuận\s*tháng)/iu,
    weight: 85,
  },
  {
    intent: 'lead_fund',
    label: 'Trader Săn Quỹ / Thi FTMO',
    color: '#3b82f6', // Blue
    keywords: /(?:thi\s*quỹ|pass\s*quỹ|ftmo|mff|quỹ\s*cấp\s*vốn|vòng\s*1\s*vòng\s*2|tài\s*khoản\s*quỹ|drawdown\s*quỹ|mua\s*gói\s*quỹ)/iu,
    weight: 85,
  },
  {
    intent: 'lead_recovery',
    label: 'Cứu Lệnh / Cháy Tài Khoản',
    color: '#f97316', // Orange
    keywords: /(?:cứu\s*lệnh|gồng\s*lỗ|đang\s*âm\s*[0-9]+|kẹt\s*lệnh|cháy\s*sạch|âm\s*vốn|bác\s*nào\s*giúp\s*em|lỡ\s*đu\s*đỉnh|gồng\s*sell|gồng\s*buy)/iu,
    weight: 82,
  },
  {
    intent: 'lead_newbie',
    label: 'Trader Newbie Cần Hướng Dẫn',
    color: '#06b6d4', // Cyan
    keywords: /(?:mới\s*tập\s*chơi|newbie|người\s*mới|bắt\s*đầu\s*từ\s*đâu|xin\s*tài\s*liệu|tự\s*học\s*forex|chỉ\s*dạy|tìm\s*thầy|khoá\s*học|price\s*action\s*cơ\s*bản|hướng\s*dẫn\s*trade)/iu,
    weight: 78,
  },
  {
    intent: 'market_discussion',
    label: 'Bàn Luận Thị Trường / Tin Vĩ Mô',
    color: '#64748b', // Slate
    keywords: /(?:cpi|non-farm|nonfarm|bảng\s*lương\s*phi\s*nông\s*nghiệp|fed\s*hạ\s*lãi\s*suất|fomc|tin\s*chiến\s*tranh|lạm\s*phát|tâm\s*lý\s*thị\s*trường)/iu,
    weight: 60,
  },
];

/**
 * Trích xuất danh sách cặp tiền được nhắc trong câu
 */
export function extractForexSymbols(text: string): string[] {
  const found: string[] = [];
  for (const item of FOREX_SYMBOLS_DICT) {
    if (item.regex.test(text)) {
      found.push(item.symbol);
    }
  }
  return found;
}

/**
 * Trích xuất tên sàn giao dịch được nhắc trong câu
 */
export function extractForexBrokers(text: string): string[] {
  const found: string[] = [];
  for (const item of FOREX_BROKERS_DICT) {
    if (item.regex.test(text)) {
      found.push(item.broker);
    }
  }
  return found;
}

/**
 * Trích xuất thông tin liên hệ (Phone, Zalo, Telegram handle)
 */
export function extractForexContact(text: string): { phone?: string; telegram?: string; zalo?: string } {
  const phoneMatch = text.match(/(?:(?:\+84|0)(?:3[2-9]|5[6|8|9]|7[0|6-9]|8[1-9]|9[0-9])[0-9]{7})/);
  const teleMatch = text.match(/(?:@([a-zA-Z0-9_]{4,32})|t\.me\/([a-zA-Z0-9_]{4,32}))/i);
  const zaloMatch = text.match(/(?:zalo(?:\s*:|\s*-\s*|\s+)([0-9]{9,11}))/i);

  return {
    phone: phoneMatch ? phoneMatch[0] : undefined,
    telegram: teleMatch ? (teleMatch[1] ? `@${teleMatch[1]}` : `@${teleMatch[2]}`) : undefined,
    zalo: zaloMatch ? zaloMatch[1] : phoneMatch ? phoneMatch[0] : undefined,
  };
}

/**
 * Thuật toán phân loại khách hàng tiềm năng ngành Forex
 */
export function parseForexLead(text: string): ParsedForexLead {
  const clean = text.trim();
  const symbols = extractForexSymbols(clean);
  const brokers = extractForexBrokers(clean);
  const contact = extractForexContact(clean);

  // Mặc định phân loại
  let matchedIntent = INTENT_PATTERNS[INTENT_PATTERNS.length - 1]; // market_discussion
  let highestScore = 40;

  for (const pattern of INTENT_PATTERNS) {
    if (pattern.keywords.test(clean)) {
      matchedIntent = pattern;
      highestScore = pattern.weight;
      break; // Ưu tiên intent có trọng số cao nhất (đã sắp xếp)
    }
  }

  // Tăng điểm tự tin nếu có kèm tên sàn hoặc tên cặp tiền
  if (symbols.length > 0) highestScore = Math.min(100, highestScore + 5);
  if (brokers.length > 0) highestScore = Math.min(100, highestScore + 5);
  if (contact.phone || contact.telegram) highestScore = Math.min(100, highestScore + 5);

  let sentiment: 'positive' | 'neutral' | 'urgent_risk' = 'neutral';
  if (matchedIntent.intent === 'scam_alert' || matchedIntent.intent === 'lead_recovery') {
    sentiment = 'urgent_risk';
  } else if (matchedIntent.intent === 'lead_broker' || matchedIntent.intent === 'lead_signal' || matchedIntent.intent === 'lead_copytrade_ea') {
    sentiment = 'positive';
  }

  // Gợi ý hành động thực tế cho đội sales
  let suggestedAction = 'Theo dõi thảo luận thị trường';
  switch (matchedIntent.intent) {
    case 'lead_broker':
      suggestedAction = 'Tư vấn mở tài khoản Exness / IC Markets, tặng bộ hoàn com 90%';
      break;
    case 'lead_signal':
      suggestedAction = 'Mời vào Channel Telegram VIP bắn kèo XAUUSD thực chiến';
      break;
    case 'lead_copytrade_ea':
      suggestedAction = 'Gửi Myfxbook bot EA lợi nhuận ổn định & hướng dẫn liên kết copy';
      break;
    case 'lead_fund':
      suggestedAction = 'Chia sẻ bộ giáo trình quản trị vốn thi quỹ FTMO & kinh nghiệm pass';
      break;
    case 'lead_newbie':
      suggestedAction = 'Gửi trọn bộ Ebook Price Action cơ bản + hướng dẫn mở tk demo';
      break;
    case 'lead_recovery':
      suggestedAction = 'Hỗ trợ tính điểm hòa vốn (breakeven) & gỡ lệnh âm an toàn';
      break;
    case 'scam_alert':
      suggestedAction = 'Cảnh báo né sàn lừa đảo, định hướng sang sàn có giấy phép FCA/CySEC';
      break;
  }

  return {
    rawText: clean,
    intent: matchedIntent.intent,
    intentLabel: matchedIntent.label,
    intentColor: matchedIntent.color,
    symbols,
    brokers,
    confidenceScore: highestScore,
    contact,
    sentiment,
    suggestedAction,
  };
}

/**
 * Tự động tạo kịch bản bình luận thông minh, tự nhiên theo đúng chuyên ngành Forex
 */
export function generateForexTargetedComment(lead: ParsedForexLead): string {
  const assetStr = lead.symbols.length > 0 ? lead.symbols[0] : 'Vàng (XAUUSD)';

  switch (lead.intent) {
    case 'lead_broker': {
      const templates = [
        `Dạ nếu bác đang tìm sàn nạp rút qua ngân hàng VN nhanh trong 30s không mất phí, spread vàng cực thấp thì Exness hoặc IC Markets là chuẩn bài nhất. Em có bộ tài liệu so sánh phí + hướng dẫn nhận hoàn com 90% mỗi lot, bác check inbox em gửi nhé 💸`,
        `Bên em chuyên hỗ trợ tài khoản Zero/Raw Spread phí thấp nhất thị trường cho anh em lướt sóng ${assetStr}. Nạp rút cổng VNPay/VietQR tức thì. Bác check tin nhắn chờ em gửi hướng dẫn chi tiết nha ⚡`,
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    }

    case 'lead_signal': {
      const templates = [
        `Dạ bên em đang có channel Telegram VIP bắn tín hiệu ${assetStr} thực chiến hàng ngày (có điểm Entry, SL, TP rõ ràng, không vẽ vời). Tỷ lệ Winrate trung bình ~78%. Anh/chị check hộp thư em gửi link trải nghiệm miễn phí 1 tuần nhé 📈`,
        `Hôm nay ${assetStr} có tin quan trọng chạy biên độ rộng. Team em vừa cập nhật kế hoạch giao dịch chi tiết kèm các vùng cản cứng trong nhóm Tele. Bác check inbox em gửi vé tham gia tham khảo nha 🎯`,
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    }

    case 'lead_copytrade_ea': {
      const templates = [
        `Bên em đang chạy dàn bot EA quản lý vốn đa khung ${assetStr} drawdown dưới 8%, lịch sử Myfxbook 2 năm chuẩn chỉ. Bác check inbox em gửi link track record thực tế tham khảo nha 🤖`,
        `Dạ hệ thống Copytrade bên em cài đặt trực tiếp trên Exness/IC Markets, vốn tự giữ trong tài khoản không lo scam. Bác check tin nhắn em gửi số liệu Myfxbook tuần qua xem thử nhé ✨`,
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    }

    case 'lead_fund': {
      const templates = [
        `Bác đang tính thi quỹ FTMO hay MFF thế? Bên em có sẵn bộ quy tắc quản trị rủi ro và chiến lược pass vòng 1, 2 đã kiểm chứng. Bác check inbox em chia sẻ kinh nghiệm nhé 🎯`,
        `Dạ thi quỹ quan trọng nhất là giữ Max Drawdown ngày dưới 5%. Em có file Excel tính Lot chuẩn theo % rủi ro từng lệnh, bác check tin nhắn em gửi tặng file dùng thử nhé 📊`,
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    }

    case 'lead_newbie': {
      const templates = [
        `Người mới thì bác nên bắt đầu với tài khoản demo hoặc cent để rèn tâm lý trước. Em gửi tặng bác bộ tài liệu Price Action & Quản lý vốn cơ bản qua inbox nhé, xem thử nha 📚`,
        `Chào bác, mới vào thị trường thì đừng vội nạp nhiều. Em có bộ video 5 bước cho người mới từ cài MT4/MT5 đến đọc nến chuẩn. Bác check inbox em gửi xem dần nha 💡`,
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    }

    case 'lead_recovery': {
      return `Lệnh ${assetStr} của bác đang kẹt ở giá nào thế ạ? Bác nhắn qua inbox em hỗ trợ tính các mốc cản để cân đối Volume gỡ hòa vốn an toàn, đừng nạp nhồi lệnh thêm vội nhé! 🛡️`;
    }

    default: {
      return `Phân tích ${assetStr} rất chuẩn bác ạ! Bên em cũng đang theo dõi phản ứng giá tại vùng này. Bác check inbox giao lưu thêm chiến lược nhé 🤝`;
    }
  }
}
