/**
 * FB EXTEN — SHARED CORE ALGORITHMS ENGINE (PLATFORM-AGNOSTIC)
 * Chuyên biệt cho Cộng đồng AI, Dựng Phim AI, Job AI / Job Phim AI & Các Trường / CLB Sáng Tạo.
 * Dùng chung cho cả Phần mềm Node.js/Playwright và Chrome Extension Private (MV3).
 */

// ============================================================================
// 1. HUMAN BEHAVIOR, SPINTAX & ANTI-SPAM ENGINE
// ============================================================================

export function randomInt(min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Xử lý Spintax dạng {A|B|C} để tạo biến thể tự nhiên, tránh trùng lặp spam.
 */
export function spinText(template: string): string {
  if (!template) return '';
  const regex = /\{([^{}]+)\}/g;
  let text = template;
  while (regex.test(text)) {
    text = text.replace(regex, (_match, group: string) => {
      const choices = group.split('|');
      return choices[Math.floor(Math.random() * choices.length)].trim();
    });
  }
  return text;
}

/**
 * Đảm bảo nội dung bình luận/bài viết luôn có độ biến thiên tự nhiên.
 */
export function ensureUniqueHumanText(template: string, groupIdx = 0): string {
  const spun = spinText(template).trim();
  if (!spun) return '';
  const hasSpintax = /\{[^{}]+\}/.test(template);
  if (hasSpintax && groupIdx === 0) return spun;

  const naturalEndings = [
    '',
    ' ạ!',
    ' nhé!',
    ' nha!',
    ' ạ ✨',
    ' nhé ạ!',
    ' nhé mọi người!',
    ' ạ ❤️',
  ];
  const chosenEnding =
    naturalEndings[(groupIdx + Math.floor(Math.random() * naturalEndings.length)) % naturalEndings.length];
  if (!chosenEnding || spun.endsWith(chosenEnding.trim())) {
    return spun;
  }
  return `${spun}${chosenEnding}`;
}

/**
 * Tách chuỗi theo cụm ký tự Unicode Grapheme để bảo toàn dấu tiếng Việt & Emoji khi gõ.
 */
export function segmentGraphemes(text: string): string[] {
  const IntlAny = Intl as any;
  if (typeof IntlAny?.Segmenter === 'function') {
    const segmenter = new IntlAny.Segmenter('vi', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (s: any) => s.segment);
  }
  return Array.from(text);
}

/**
 * Tính toán nhịp nghỉ sinh học thích ứng (có Coffee Break sau mỗi chu kỳ N thao tác).
 */
export function computeAdaptiveDelaySec(
  stepCount: number,
  minSec = 18,
  maxSec = 35,
  deepRestEvery = 4,
  deepRestMinSec = 45,
  deepRestMaxSec = 75
): { delaySec: number; isCoffeeBreak: boolean } {
  if (stepCount > 0 && deepRestEvery > 0 && stepCount % deepRestEvery === 0) {
    return {
      delaySec: randomInt(deepRestMinSec, deepRestMaxSec),
      isCoffeeBreak: true,
    };
  }
  return {
    delaySec: randomInt(minSec, maxSec),
    isCoffeeBreak: false,
  };
}

// ============================================================================
// 2. CHECKPOINT & ANTI-BOT GUARD CLASSIFIER
// ============================================================================

export type CheckpointReasonType =
  | 'CHECKPOINT'
  | 'CAPTCHA'
  | 'SUSPENDED'
  | 'TWO_FACTOR'
  | 'LOGIN_REQUIRED'
  | 'RATE_LIMITED'
  | 'ACTION_BLOCKED'
  | 'FRIEND_WARNING'
  | 'OK';

export interface CheckpointCheckResult {
  isCheckpoint: boolean;
  type: CheckpointReasonType;
  reason?: string;
}

/**
 * Nhận diện nhanh cảnh báo Checkpoint / Action Block / Captcha từ văn bản trang hoặc hộp thoại.
 */
export function classifyCheckpointText(text: string, currentUrl = ''): CheckpointCheckResult {
  const lowerUrl = (currentUrl || '').toLowerCase();
  const body = text || '';

  if (/confirm that you're human|enter the text from the image|xác nhận bạn là con người|nhập các ký tự bạn nhìn thấy/i.test(body)) {
    return {
      isCheckpoint: true,
      type: 'CAPTCHA',
      reason: 'Phát hiện yêu cầu xác minh CAPTCHA từ Facebook.',
    };
  }

  if (lowerUrl.includes('/checkpoint/')) {
    return {
      isCheckpoint: true,
      type: 'CHECKPOINT',
      reason: `Đang ở trang checkpoint: ${currentUrl}`,
    };
  }

  if (/account suspended|tài khoản bị đình chỉ|tài khoản đã bị vô hiệu hóa/i.test(body)) {
    return {
      isCheckpoint: true,
      type: 'SUSPENDED',
      reason: 'Tài khoản bị đình chỉ hoặc vô hiệu hóa.',
    };
  }

  if (
    /bạn có biết người này|chỉ gửi lời mời kết bạn cho những người bạn biết|do you know this person|only send friend requests to people you know/i.test(
      body
    )
  ) {
    return {
      isCheckpoint: true,
      type: 'FRIEND_WARNING',
      reason: 'Cảnh báo giới hạn kết bạn ("Bạn có biết người này ngoài đời không?").',
    };
  }

  if (/tạm thời bị chặn|temporarily blocked|hạn chế tần suất|limit how often you can post|tried too many times/i.test(body)) {
    return {
      isCheckpoint: true,
      type: 'ACTION_BLOCKED',
      reason: 'Facebook tạm thời giới hạn tốc độ thao tác (Action Block / Rate Limit).',
    };
  }

  if (lowerUrl.includes('/login')) {
    return {
      isCheckpoint: true,
      type: 'LOGIN_REQUIRED',
      reason: 'Phiên đăng nhập Facebook đã hết hạn hoặc đang ở trang đăng nhập.',
    };
  }

  return { isCheckpoint: false, type: 'OK' };
}

// ============================================================================
// 3. FACEBOOK PROFILE PARSER, JOIN-TIME & EXACT BUTTON FILTER
// ============================================================================

export const JUNK_FB_KEYS = new Set([
  'groups', 'pages', 'events', 'watch', 'marketplace', 'reel', 'reels', 'stories',
  'friends', 'messages', 'notifications', 'search', 'photo', 'photos', 'login',
  'help', 'settings', 'saved', 'gaming', 'dialog', 'reg', 'r.php', 'r_php',
  'lite', 'l.php', 'l_php', 'careers', 'allactivity', 'about', 'privacy',
  'terms', 'policies', 'ad_center', 'ads', 'groupslanding', 'undefined', 'null',
]);

/**
 * Chuẩn hóa link Facebook thành UID/username và profileUrl sạch.
 */
export function extractFacebookProfileId(href: string): { id: string; profileUrl: string } | null {
  try {
    if (!href || !href.includes('facebook.com')) return null;
    const u = new URL(href);

    const groupUserMatch = u.pathname.match(/\/groups\/[^/]+\/user\/([^/?#]+)/i);
    if (groupUserMatch) {
      const id = groupUserMatch[1];
      if (!JUNK_FB_KEYS.has(id.toLowerCase())) {
        const profileUrl = /^\d+$/.test(id)
          ? `https://www.facebook.com/profile.php?id=${id}`
          : `https://www.facebook.com/${id}`;
        return { id, profileUrl };
      }
    }

    if (u.pathname.includes('/people/')) {
      const peopleMatch = u.pathname.match(/\/people\/[^/]+\/(\d+)/i);
      if (peopleMatch) {
        return {
          id: peopleMatch[1],
          profileUrl: `https://www.facebook.com/profile.php?id=${peopleMatch[1]}`,
        };
      }
    }

    if (u.pathname.includes('profile.php') && u.searchParams.get('id')) {
      const id = u.searchParams.get('id')!;
      return { id, profileUrl: `https://www.facebook.com/profile.php?id=${id}` };
    }

    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length === 1 && !JUNK_FB_KEYS.has(parts[0].toLowerCase()) && parts[0].length >= 3) {
      return { id: parts[0], profileUrl: `https://www.facebook.com/${parts[0]}` };
    }
  } catch {
    return null;
  }
  return null;
}

export interface JoinTimeClassification {
  category: '2_days' | '1_week' | '2_weeks' | 'older';
  label: string;
  timeText: string;
}

/**
 * Phân loại mốc thời gian gia nhập nhóm của thành viên.
 */
export function classifyJoinTime(text: string): JoinTimeClassification {
  const clean = (text || '').toLowerCase();

  if (/vừa xong|phút trước|giờ trước|hôm nay|hôm qua|1 ngày|2 ngày|minute|hour|today|yesterday|1 day|2 days/i.test(clean)) {
    let timeText = 'Hôm nay / Trong 48h';
    const m = clean.match(/([0-9]+)\s*(?:giờ|ngày|hour|day)/i);
    if (m) timeText = `${m[1]} ${/ngày|day/i.test(clean) ? 'ngày' : 'giờ'} trước`;
    else if (/hôm qua|yesterday/i.test(clean)) timeText = 'Hôm qua (~1 ngày)';
    else if (/hôm nay|today/i.test(clean)) timeText = 'Hôm nay (< 24h)';
    return { category: '2_days', label: '🔥 2 ngày gần nhất', timeText };
  }

  if (/3 ngày|4 ngày|5 ngày|6 ngày|7 ngày|1 tuần|tuần qua|tuần này|3 days|4 days|5 days|6 days|7 days|1 week|past week/i.test(clean)) {
    let timeText = '1 tuần gần nhất';
    const m = clean.match(/([3-7])\s*(?:ngày|days)/i);
    if (m) timeText = `${m[1]} ngày trước`;
    else if (/1 tuần|1 week/i.test(clean)) timeText = '1 tuần trước';
    return { category: '1_week', label: '⚡ 1 tuần gần nhất', timeText };
  }

  if (/8 ngày|9 ngày|10 ngày|11 ngày|12 ngày|13 ngày|14 ngày|2 tuần|2 weeks/i.test(clean)) {
    let timeText = '2 tuần gần nhất';
    const m = clean.match(/([0-9]+)\s*(?:ngày|days)/i);
    if (m) timeText = `${m[1]} ngày trước`;
    else if (/2 tuần|2 weeks/i.test(clean)) timeText = '2 tuần trước';
    return { category: '2_weeks', label: '📅 2 tuần gần nhất', timeText };
  }

  return { category: 'older', label: 'Thành viên cũ (> 2 tuần)', timeText: 'Trước đó' };
}

/**
 * Kiểm tra chính xác nhãn nút "Thêm bạn bè" / "Add friend" (loại bỏ Tìm bạn bè, Hủy lời mời, Nhắn tin).
 */
export function isExactAddFriendButtonText(ariaLabel: string, visibleText: string): boolean {
  const aria = (ariaLabel || '').replace(/\s+/g, ' ').trim();
  const text = (visibleText || '').replace(/\s+/g, ' ').trim();

  const forbidden =
    /tìm bạn bè|hủy lời mời|huỷ lời mời|đã gửi lời mời|đã gửi yêu cầu|nhắn tin|theo dõi|bạn bè chung|chỉnh sửa trang cá nhân|xem trang|find friends|cancel request|request sent|message|follow/i;
  if (forbidden.test(aria) || forbidden.test(text)) {
    if (!(/^Thêm\s+.+\s+làm bạn( bè)?$/i.test(aria) && /thêm bạn( bè)?/i.test(text))) {
      return false;
    }
  }

  return (
    /^(thêm bạn bè|thêm bạn)$/i.test(aria) ||
    /^(thêm bạn bè|thêm bạn)$/i.test(text) ||
    text.includes('Thêm bạn bè') ||
    aria.includes('Thêm bạn bè') ||
    (/^Thêm\s+.+\s+làm bạn( bè)?$/i.test(aria) && (text.includes('Thêm') || text === '')) ||
    /^(add friend)$/i.test(aria) ||
    /^(add friend)$/i.test(text) ||
    text.includes('Add friend') ||
    /^Add\s+.+\s+as a friend$/i.test(aria)
  );
}

// ============================================================================
// 4. UNIVERSAL CONTACT EXTRACTOR & CUSTOM WORKFLOW RULE ENGINE
// ============================================================================

export interface ExtractedContacts {
  phones: string[];
  telegrams: string[];
  emails: string[];
}

export function extractUniversalContacts(text: string): ExtractedContacts {
  const clean = text || '';
  const phones = Array.from(
    new Set(clean.match(/(?:\+84|0)(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}/g) || [])
  );
  const telegrams = Array.from(
    new Set(
      (clean.match(/(?:@[a-zA-Z0-9_]{4,32}|t\.me\/[a-zA-Z0-9_]{4,32})/gi) || []).map((t) =>
        t.startsWith('t.me/') ? `@${t.slice(5)}` : t
      )
    )
  );
  const emails = Array.from(
    new Set(clean.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])
  );
  return { phones, telegrams, emails };
}

export interface CustomWorkflowRule {
  workflowName: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  replyTemplate: string;
  aiSystemPrompt: string;
}

export type AnalyzerMode = 'ai_film' | 'ai_job' | 'ai_edu' | 'custom';

export interface UnifiedAnalysisResult {
  mode: AnalyzerMode;
  matched: boolean;
  label: string;
  badgeColor: string;
  score: number;
  matchedTokens: string[];
  contacts: ExtractedContacts;
  suggestedReply: string;
  summary: string;
}

/**
 * Chuẩn hóa Mode an toàn (tự quy đổi các giá trị mode cũ nếu có trong storage về 'auto'/'custom').
 */
export function normalizeThreadMode(raw?: string): ThreadMode {
  if (raw === 'ai_film' || raw === 'ai_job' || raw === 'ai_edu' || raw === 'custom' || raw === 'auto') {
    return raw;
  }
  return 'auto';
}

/**
 * Đánh giá nội dung theo bộ luật tùy biến cho công việc mới (không cần sửa code).
 */
export function evaluateCustomLeadRules(text: string, rule: CustomWorkflowRule): UnifiedAnalysisResult {
  const clean = (text || '').trim();
  const lower = clean.toLowerCase();
  const contacts = extractUniversalContacts(clean);

  const excluded = (rule.excludeKeywords || []).filter((kw) => kw && lower.includes(kw.toLowerCase().trim()));
  if (excluded.length > 0) {
    return {
      mode: 'custom',
      matched: false,
      label: `Loại trừ (${excluded[0]})`,
      badgeColor: '#64748b',
      score: 10,
      matchedTokens: [],
      contacts,
      suggestedReply: '',
      summary: `Chứa từ khóa loại trừ: ${excluded.join(', ')}`,
    };
  }

  const matchedTokens = (rule.includeKeywords || []).filter((kw) => kw && lower.includes(kw.toLowerCase().trim()));
  const baseScore = matchedTokens.length > 0 ? Math.min(95, 65 + matchedTokens.length * 10) : 25;
  const contactBonus = contacts.phones.length > 0 || contacts.telegrams.length > 0 ? 5 : 0;
  const score = Math.min(100, baseScore + contactBonus);
  const matched = matchedTokens.length > 0 || rule.includeKeywords.length === 0;

  return {
    mode: 'custom',
    matched,
    label: matched ? `${rule.workflowName || 'Khớp Mục Tiêu'} (${matchedTokens.length} từ khóa)` : 'Tin thường',
    badgeColor: matched ? '#10b981' : '#64748b',
    score,
    matchedTokens,
    contacts,
    suggestedReply: matched ? ensureUniqueHumanText(rule.replyTemplate || '') : '',
    summary: matched
      ? `Khớp từ khóa: ${matchedTokens.join(', ') || 'Mặc định'}`
      : 'Chưa khớp bộ từ khóa mục tiêu.',
  };
}

/**
 * Bộ phân tích hợp nhất chuyên biệt cho: Job AI / Job Phim AI, Dựng Phim AI & Video AI, Trường Học / SV AI & Custom.
 */
export function analyzeContentUnified(
  text: string,
  mode: AnalyzerMode,
  customRule?: CustomWorkflowRule
): UnifiedAnalysisResult {
  const clean = (text || '').trim();
  const lower = clean.toLowerCase();
  const contacts = extractUniversalContacts(clean);

  if (mode === 'ai_job') {
    const jobTags: string[] = [];
    if (/tvc|quảng cáo|commercial|viral|brand/i.test(lower)) jobTags.push('TVC / Video QC AI');
    if (/phim\s*ngắn|mv\s*ai|phim\s*ai|hoạt\s*hình|animation|trailer|storyboard/i.test(lower)) jobTags.push('Phim / Hoạt hình AI');
    if (/editor|dựng\s*(?:phim|video|clip)|cắt\s*ghép|hậu\s*kỳ|vfx|reels|tiktok|youtube/i.test(lower)) jobTags.push('Dựng Video / Editor AI');
    if (/automation|agent|n8n|chatbot|workflow|prompt\s*engineer|dev\s*ai/i.test(lower)) jobTags.push('AI Automation / Tech');

    const isHiring =
      /tuyển|cần\s*(?:tìm|người|bạn|team|đội|freelancer|editor|dựng|làm)|tìm\s*(?:freelancer|editor|team|người\s*làm|đối\s*tác)|job\s*(?:ai|phim|video|dựng)|booking|nhận\s*brief|gửi\s*(?:portfolio|showreel|cv)|deadline|budget|ngân\s*sách|catse|thù\s*lao/i.test(
        lower
      );
    const hasBudget = /(\d+(?:[.,]\d+)?\s*(?:tr|triệu|k|usd|\$|m\b))|ngân\s*sách|budget|lương|thù\s*lao|catse/i.test(lower);
    const score = isHiring ? (hasBudget ? 94 : 84) : jobTags.length > 0 ? 60 : 30;
    const focusLabel = jobTags[0] || 'Dự án / Job AI';

    return {
      mode: 'ai_job',
      matched: isHiring || jobTags.length > 0,
      label: isHiring ? `💼 Tuyển / Job: ${focusLabel}` : `Chủ đề ${focusLabel}`,
      badgeColor: isHiring ? '#10b981' : '#3b82f6',
      score,
      matchedTokens: jobTags,
      contacts,
      suggestedReply: isHiring
        ? spinText(
            `{Chào bạn|Chào anh/chị}, mình có kinh nghiệm làm ${focusLabel.toLowerCase()} khá nhiều dự án thực tế. Cho mình xin thêm brief để gửi showreel/mẫu tương ứng qua inbox nhé!`
          )
        : '',
      summary: `${isHiring ? 'Tuyển / Cần người làm' : 'Thảo luận'} | ${focusLabel}${hasBudget ? ' | Có ngân sách rõ' : ''}`,
    };
  }

  if (mode === 'ai_film') {
    const toolMatches = Array.from(
      new Set(
        (
          clean.match(
            /\b(?:veo\s*\d*|kling|runway|sora|hailuo|minimax|pika|luma|midjourney|flux|comfyui|stable\s*diffusion|krea|magnific|elevenlabs|suno|udio|heygen|capcut|premiere|after\s*effects|davinci|blender|wan\s*2\.?\d*|seedance|vidu)\b/gi
          ) || []
        ).map((m) => m.trim())
      )
    );
    const techTopics: string[] = [];
    if (/nhất\s*quán|consistent|character|nhân\s*vật|face\s*swap|lora/i.test(lower)) techTopics.push('Nhất quán nhân vật');
    if (/lip[\s-]*sync|nhép\s*miệng|lồng\s*tiếng|voice|giọng\s*đọc|âm\s*thanh/i.test(lower)) techTopics.push('Voice / Lip-sync');
    if (/prompt|câu\s*lệnh|workflow|node|pipeline|storyboard|kịch\s*bản/i.test(lower)) techTopics.push('Prompt & Workflow');
    if (/chuyển\s*cảnh|camera|cinematic|ánh\s*sáng|render|upscale|4k/i.test(lower)) techTopics.push('Kỹ thuật quay dựng AI');

    const isAsking =
      /cho\s*(?:mình|em)\s*hỏi|hỏi\s*chút|có\s*ai\s*biết|bác\s*nào\s*biết|dùng\s*(?:tool|app|web|con)\s*nào|làm\s*sao|cách\s*làm|workflow|bị\s*lỗi|xin\s*kinh\s*nghiệm|review|nên\s*dùng|hướng\s*dẫn|\?/i.test(
        lower
      );
    const topicText = techTopics[0] || toolMatches[0] || 'Dựng phim AI';
    const score = isAsking ? 85 : toolMatches.length > 0 ? 68 : 35;

    return {
      mode: 'ai_film',
      matched: isAsking || toolMatches.length > 0 || techTopics.length > 0,
      label: isAsking ? `🎬 Hỏi kỹ thuật: ${topicText}` : `🎬 Phim AI • ${topicText}`,
      badgeColor: isAsking ? '#10b981' : '#3b82f6',
      score,
      matchedTokens: [...toolMatches, ...techTopics].slice(0, 5),
      contacts,
      suggestedReply: isAsking
        ? spinText(
            `Chỗ ${topicText.toLowerCase()}${toolMatches[0] ? ` trên ${toolMatches[0]}` : ''} mấu chốt nằm ở khâu khóa keyframe đầu vào chứ không phải prompt dài đâu bác. Còn 1 mẹo xử lý nhỏ nữa nói đây hơi dài, bác muốn tìm hiểu thêm thì nhắn em chỉ nhanh cho nhé!`
          )
        : '',
      summary: `${isAsking ? 'Hỏi workflow/kỹ thuật' : 'Chia sẻ'} | ${[...toolMatches.slice(0, 2), ...techTopics.slice(0, 2)].join(' • ') || 'Dựng phim AI'}`,
    };
  }

  if (mode === 'ai_edu') {
    const eduTags: string[] = [];
    if (/đồ\s*án|tốt\s*nghiệp|bài\s*tập\s*lớn|luận\s*văn|capstone/i.test(lower)) eduTags.push('Đồ án / Bài tập');
    if (/sinh\s*viên|sv\b|trường|đại\s*học|học\s*viện|fpt|rmit|arena|sân\s*khấu\s*điện\s*ảnh|báo\s*chí|kiến\s*trúc|mỹ\s*thuật|bách\s*khoa|hust|ptit|uit|vlu|van\s*lang/i.test(lower)) {
      eduTags.push('Trường ĐH / Sinh viên');
    }
    if (/workshop|talkshow|cuộc\s*thi|hackathon|clb|câu\s*lạc\s*bộ|mentoring|thực\s*tập|intern/i.test(lower)) {
      eduTags.push('Workshop / Cuộc thi / CLB');
    }

    const isNeed =
      /cho\s*(?:em|mình)\s*hỏi|tìm\s*(?:đồng\s*đội|team|mentor|người\s*hướng\s*dẫn)|cần\s*hỗ\s*trợ|giúp\s*(?:em|mình)|xin\s*kinh\s*nghiệm|học\s*(?:ai|dựng\s*phim)|lộ\s*trình|tài\s*liệu|thực\s*tập|\?/i.test(
        lower
      );
    const focus = eduTags[0] || 'Cộng đồng Học thuật & AI';
    const score = isNeed ? 84 : eduTags.length > 0 ? 64 : 32;

    return {
      mode: 'ai_edu',
      matched: isNeed || eduTags.length > 0,
      label: isNeed ? `🎓 Hỗ trợ: ${focus}` : `🎓 ${focus}`,
      badgeColor: isNeed ? '#10b981' : '#3b82f6',
      score,
      matchedTokens: eduTags,
      contacts,
      suggestedReply: isNeed
        ? spinText(
            `Làm ${focus.toLowerCase()} với AI ăn điểm nhất ở bước tách phân cảnh ngắn + chốt ánh sáng đồng bộ ngay từ đầu đó bạn. Mình có sẵn bộ flow rút gọn đỡ đốt credit lắm, cần tìm hiểu thêm cứ nhắn mình gửi cho nhé!`
          )
        : '',
      summary: `${isNeed ? 'Cần hỗ trợ / kết nối' : 'Thảo luận'} | ${eduTags.join(' • ') || 'Trường học & AI'}`,
    };
  }

  return evaluateCustomLeadRules(
    clean,
    customRule || {
      workflowName: 'Cộng Đồng AI & Dựng Phim AI',
      includeKeywords: [],
      excludeKeywords: [],
      replyTemplate: 'Chỗ này chỉ cần tinh chỉnh nhẹ thứ tự pipeline đầu vào là khác bọt hẳn đó bác. Còn 1 mẹo nhỏ nữa nói ở đây hơi dài, bác muốn tìm hiểu thêm thì nhắn em chỉ nhanh cho nhé!',
      aiSystemPrompt: '',
    }
  );
}

// ============================================================================
// 5. AI MULTI-KEY POOL & AUTO-FAILOVER ENGINE (GEMINI / GROQ / OPENROUTER)
// ============================================================================

export type AiProvider = 'gemini' | 'groq' | 'openrouter';

export interface AiPoolKeyItem {
  id: string;
  provider: AiProvider;
  apiKey: string;
  maskedKey: string;
  status: 'active' | 'rate_limited' | 'invalid';
  cooldownUntil?: number;
  successCount: number;
  failCount: number;
  lastError?: string;
}

export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function detectProviderFromKey(key: string, fallback: AiProvider = 'gemini'): AiProvider {
  const clean = (key || '').trim();
  if (clean.startsWith('AIza')) return 'gemini';
  if (clean.startsWith('gsk_')) return 'groq';
  if (clean.startsWith('sk-or-')) return 'openrouter';
  return fallback;
}

async function executeSingleAiCall(
  provider: AiProvider,
  apiKey: string,
  prompt: string,
  systemPrompt?: string,
  imageBase64?: string
): Promise<string> {
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const cleanB64 = imageBase64 ? imageBase64.replace(/^data:image\/\w+;base64,/, '') : '';

  if (provider === 'gemini') {
    const parts: any[] = [{ text: fullPrompt }];
    if (cleanB64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanB64 } });
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
      }),
    });
    if (!res.ok) {
      const errJson: any = await res.json().catch(() => ({}));
      const err: any = new Error(errJson?.error?.message || `Gemini HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const data: any = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini trả về phản hồi rỗng.');
    return text.trim();
  }

  if (provider === 'groq' || provider === 'openrouter') {
    const isGroq = provider === 'groq';
    const url = isGroq
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';
    const model = isGroq ? 'llama-3.3-70b-versatile' : 'google/gemini-2.0-flash-exp:free';
    const userContent: any =
      !isGroq && cleanB64
        ? [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${cleanB64}` } },
          ]
        : prompt;

    const messages = systemPrompt
      ? [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ]
      : [{ role: 'user', content: userContent }];

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 1000 }),
    });
    if (!res.ok) {
      const errJson: any = await res.json().catch(() => ({}));
      const err: any = new Error(errJson?.error?.message || `${provider} HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${provider} trả về phản hồi rỗng.`);
    return text.trim();
  }

  throw new Error(`Không hỗ trợ provider: ${provider}`);
}

/**
 * Gọi AI với cơ chế xoay vòng nhiều Key & tự động Failover + Cooldown khi gặp 429/Quota.
 */
export async function callAiPoolWithFailover(
  keysPool: AiPoolKeyItem[],
  prompt: string,
  options?: {
    preferredProvider?: AiProvider;
    systemPrompt?: string;
    cooldownSeconds?: number;
    imageBase64?: string;
  }
): Promise<{
  text: string;
  providerUsed: AiProvider;
  keyUsedMasked: string;
  updatedPool: AiPoolKeyItem[];
}> {
  if (!Array.isArray(keysPool) || keysPool.length === 0) {
    throw new Error('Chưa cấu hình API Key nào trong Pool.');
  }

  const now = Date.now();
  const pool: AiPoolKeyItem[] = keysPool.map((k) => {
    if (k.status === 'rate_limited' && k.cooldownUntil && now >= k.cooldownUntil) {
      return { ...k, status: 'active', cooldownUntil: undefined };
    }
    return { ...k };
  });

  const pref = options?.preferredProvider || 'gemini';
  const order: AiProvider[] = [pref, 'gemini', 'groq', 'openrouter'].filter(
    (v, idx, arr) => arr.indexOf(v as AiProvider) === idx
  ) as AiProvider[];

  const candidates: AiPoolKeyItem[] = [];
  for (const prov of order) {
    const list = pool
      .filter((k) => k.provider === prov && k.status === 'active')
      .sort((a, b) => a.successCount + a.failCount - (b.successCount + b.failCount));
    candidates.push(...list);
  }

  if (candidates.length === 0) {
    throw new Error('Tất cả API Key hiện đang trong thời gian cooldown hoặc không hợp lệ.');
  }

  let lastError: any = null;
  const cooldownMs = (options?.cooldownSeconds || 60) * 1000;

  for (const cand of candidates) {
    const target = pool.find((item) => item.id === cand.id)!;
    try {
      const text = await executeSingleAiCall(
        cand.provider,
        cand.apiKey,
        prompt,
        options?.systemPrompt,
        options?.imageBase64
      );
      target.successCount += 1;
      target.status = 'active';
      target.lastError = undefined;
      return {
        text,
        providerUsed: cand.provider,
        keyUsedMasked: cand.maskedKey || maskApiKey(cand.apiKey),
        updatedPool: pool,
      };
    } catch (err: any) {
      lastError = err;
      target.failCount += 1;
      target.lastError = err?.message || String(err);

      const isRateLimit =
        err?.status === 429 || /rate limit|quota|resource_exhausted|429|too many requests/i.test(target.lastError || '');
      const isInvalid =
        err?.status === 400 ||
        err?.status === 401 ||
        err?.status === 403 ||
        /invalid_api_key|api key not valid|unauthorized/i.test(target.lastError || '');

      if (isInvalid) {
        target.status = 'invalid';
      } else if (isRateLimit) {
        target.status = 'rate_limited';
        target.cooldownUntil = Date.now() + cooldownMs;
      } else {
        target.status = 'rate_limited';
        target.cooldownUntil = Date.now() + 15_000;
      }
    }
  }

  throw new Error(lastError?.message || 'Toàn bộ API Key đều thất bại.');
}

// ============================================================================
// 6. SELF-LEARNING AI & THREAD BUYER-VS-SELLER INTELLIGENCE ENGINE
// ============================================================================

export type ParticipantRole = 'buyer' | 'seller' | 'neutral';
export type ThreadMode = 'auto' | 'ai_film' | 'ai_job' | 'ai_edu' | 'custom';

export interface ThreadCommentInput {
  index: number;
  author: string;
  authorUid?: string;
  text: string;
  isReply?: boolean;
}

export interface ThreadReadInput {
  url: string;
  postAuthor: string;
  postAuthorUid?: string;
  postText: string;
  createdAtSec?: number;
  postAgeMinutes?: number;
  source?: 'dom' | 'graphql_enriched';
  comments: ThreadCommentInput[];
}

export interface ThreadCommentEvaluation {
  index: number;
  author: string;
  text: string;
  role: ParticipantRole;
  need: string;
  shouldEngage: boolean;
  skipReason?: string;
  suggestedReply: string;
  confidence: number;
}

export interface ThreadAnalysisResult {
  url: string;
  modeUsed: 'ai_film' | 'ai_job' | 'ai_edu' | 'custom';
  engine: 'ai' | 'offline';
  aiProvider?: string;
  postType: string;
  topicSummary: string;
  postAuthor: string;
  postAuthorRole: ParticipantRole;
  postAuthorNeed: string;
  shouldCommentPost: boolean;
  postSkipReason?: string;
  suggestedPostComment: string;
  commentEvaluations: ThreadCommentEvaluation[];
  newSellerSignals: string[];
  newBuyerSignals: string[];
  learnedLesson: string;
}

export interface LearningExample {
  text: string;
  role: ParticipantRole;
  need: string;
  goodReply?: string;
  updatedAt: string;
}

export interface SelfLearningMemory {
  totalAnalyzed: number;
  learnedSellerSignals: string[];
  learnedBuyerSignals: string[];
  recentLessons: Array<{ timestamp: string; mode: string; postType: string; summary: string }>;
  fewShotExamples: LearningExample[];
}

export function createDefaultLearningMemory(): SelfLearningMemory {
  return {
    totalAnalyzed: 0,
    learnedSellerSignals: [],
    learnedBuyerSignals: [],
    recentLessons: [],
    fewShotExamples: [],
  };
}

const BASE_SELLER_SIGNALS = [
  'bán tài khoản', 'bán acc', 'cấp acc', 'share acc', 'acc giá rẻ', 'tài khoản dùng chung',
  'bán key', 'bán tool', 'bán prompt', 'bộ 1000 prompt', 'kho prompt giá rẻ',
  'khai giảng khóa', 'tuyển học viên', 'ưu đãi học phí', 'chốt slot khóa học', 'đăng ký khóa học',
  'bên mình nhận làm', 'bên em nhận làm', 'bên mình chuyên nhận', 'nhận làm video ai giá rẻ',
  'nhận dựng phim ai giá rẻ', 'nhận làm tvc ai', 'nhận làm thuê', 'dịch vụ seeding',
  'tăng tương tác', 'mua bán follow', 'tuyển ctv', 'tuyển cộng tác viên', 'giá sỉ', 'sỉ lẻ',
  'liên hệ ngay', 'lh/zalo', 'zalo em', 'ib em báo giá', 'inbox em báo giá',
  'link đăng ký', 'chiết khấu', 'bên mình chuyên cung cấp', 'agency chuyên nhận',
];

const BASE_BUYER_SIGNALS = [
  'tuyển freelancer', 'cần tìm freelancer', 'tuyển editor', 'cần editor', 'cần người dựng',
  'cần dựng video ai', 'cần làm video ai', 'cần làm phim ai', 'tìm đội làm', 'tìm team',
  'tìm bạn làm', 'job ai', 'job phim ai', 'job dựng', 'job video', 'cần booking',
  'nhận brief', 'gửi portfolio', 'gửi showreel', 'gửi cv', 'có bác nào nhận', 'bác nào nhận làm',
  'deadline', 'ngân sách', 'budget', 'tuyển dụng', 'tuyển thực tập', 'tuyển intern',
  'cho mình hỏi', 'cho em hỏi', 'hỏi chút', 'mọi người cho hỏi', 'cả nhà cho hỏi',
  'có ai biết', 'bác nào biết', 'dùng tool nào', 'workflow nào', 'prompt nào',
  'cách làm', 'làm sao để', 'hướng dẫn giúp', 'xin kinh nghiệm', 'review tool',
  'nên dùng', 'ổn không', 'ok không', 'bị lỗi', 'giúp mình', 'nhờ tư vấn',
  'đồ án', 'tốt nghiệp', 'sinh viên', 'học dựng phim ai', 'cần hỗ trợ', 'gấp ạ',
];

/**
 * Tự động nhận diện Mode phù hợp nếu người dùng chọn chế độ "AI Auto-Detect"
 */
export function detectThreadMode(text: string): 'ai_film' | 'ai_job' | 'ai_edu' | 'custom' {
  const clean = (text || '').toLowerCase();
  if (
    /job\s*(?:ai|phim|video|dựng|edit)|tuyển\s*(?:freelancer|editor|dựng|làm\s*video|làm\s*phim|ai|intern|thực\s*tập)|cần\s*(?:người\s*dựng|dựng\s*video|làm\s*video\s*ai|làm\s*phim\s*ai|tìm\s*freelancer|booking)|gửi\s*(?:showreel|portfolio|cv)|nhận\s*brief|tvc\s*ai/i.test(
      clean
    )
  ) {
    return 'ai_job';
  }
  if (
    /đồ\s*án|tốt\s*nghiệp|sinh\s*viên|đại\s*học|học\s*viện|fpt|rmit|arena|sân\s*khấu\s*điện\s*ảnh|báo\s*chí|mỹ\s*thuật|kiến\s*trúc|bách\s*khoa|workshop|cuộc\s*thi|hackathon|câu\s*lạc\s*bộ|\bclb\b/i.test(
      clean
    )
  ) {
    return 'ai_edu';
  }
  if (
    /dựng\s*phim\s*ai|phim\s*ai|video\s*ai|filmmak|veo\s*\d*|kling|runway|sora|hailuo|minimax|pika|luma|midjourney|flux|comfyui|stable\s*diffusion|elevenlabs|suno|heygen|storyboard|lip[\s-]*sync|nhép\s*miệng|nhất\s*quán\s*nhân\s*vật|vfx|hoạt\s*hình\s*ai|mv\s*ai|capcut|premiere|after\s*effects|davinci|blender|prompt/i.test(
      clean
    )
  ) {
    return 'ai_film';
  }
  return 'custom';
}

/**
 * Phân loại vai trò người đăng / người bình luận: Người hỏi có nhu cầu (buyer) vs Người bán (seller).
 */
export function classifyParticipantRole(
  text: string,
  memory?: SelfLearningMemory,
  customRule?: CustomWorkflowRule
): {
  role: ParticipantRole;
  confidence: number;
  matchedSellerSignals: string[];
  matchedBuyerSignals: string[];
} {
  const clean = (text || '').trim();
  const lower = clean.toLowerCase();

  const sellerDict = Array.from(new Set([...BASE_SELLER_SIGNALS, ...(memory?.learnedSellerSignals || [])]));
  const buyerDict = Array.from(
    new Set([
      ...BASE_BUYER_SIGNALS,
      ...(memory?.learnedBuyerSignals || []),
      ...(customRule?.includeKeywords || []),
    ])
  );

  const matchedSellerSignals = sellerDict.filter((kw) => kw && lower.includes(kw.toLowerCase()));
  const matchedBuyerSignals = buyerDict.filter((kw) => kw && lower.includes(kw.toLowerCase()));

  // Kiểm tra thêm dấu hiệu rao bán đặc trưng (nhiều SĐT + giá chào bán hoặc kêu gọi inbox mua hàng)
  const hasPhone = /(?:\+84|0)(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}/.test(clean);
  const looksLikeCatalog = /(?:lh|liên\s*hệ|hotline|call|zalo)\s*[:\-]?\s*0\d{8,10}/i.test(clean) && !/cần\s*(?:mua|thuê|tìm)/i.test(clean);
  if (looksLikeCatalog && !matchedSellerSignals.includes('hotline bán hàng')) {
    matchedSellerSignals.push('hotline bán hàng');
  }

  const hasQuestionMark = /\?/.test(clean);
  let sellerScore = matchedSellerSignals.length * 32 + (hasPhone && matchedBuyerSignals.length === 0 ? 22 : 0);
  let buyerScore = matchedBuyerSignals.length * 30 + (hasQuestionMark && clean.length >= 10 ? 26 : 0);

  if (customRule?.excludeKeywords?.some((kw) => kw && lower.includes(kw.toLowerCase()))) {
    sellerScore += 45;
  }

  if (sellerScore > buyerScore && sellerScore >= 30) {
    return {
      role: 'seller',
      confidence: Math.min(98, 60 + sellerScore),
      matchedSellerSignals,
      matchedBuyerSignals,
    };
  }

  if (buyerScore >= 25 && buyerScore >= sellerScore) {
    return {
      role: 'buyer',
      confidence: Math.min(98, 58 + buyerScore),
      matchedSellerSignals,
      matchedBuyerSignals,
    };
  }

  return {
    role: 'neutral',
    confidence: 50,
    matchedSellerSignals,
    matchedBuyerSignals,
  };
}

/**
 * Làm sạch chuỗi bình luận: loại bỏ trường hợp câu bị dính/lặp đôi ngay bên trong cùng 1 chuỗi (VD: "ABC!ABC!").
 */
export function sanitizeSingleCommentText(raw: string): string {
  let clean = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  // Chống lặp đoạn liền kề y hệt nhau (VD: "...nhé!Hello bác...nhé!Hello bác...")
  const repeatedBlock = /^(.{12,}?)\s*(?:\1\s*){1,}$/i;
  const m = clean.match(repeatedBlock);
  if (m && m[1]) {
    clean = m[1].trim();
  }
  return clean.slice(0, 420);
}

function tokenizeVietnameseWords(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/**
 * Đo độ tương đồng (0..1) giữa 2 bình luận để chống lặp câu chữ giữa các bài/Group.
 */
export function computeCommentSimilarity(a: string, b: string): number {
  const ta = tokenizeVietnameseWords(a);
  const tb = tokenizeVietnameseWords(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  for (const w of setA) {
    if (setB.has(w)) inter++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

export function isCommentTooSimilar(candidate: string, recentComments: string[] = [], threshold = 0.58): boolean {
  const clean = sanitizeSingleCommentText(candidate);
  if (!clean || !Array.isArray(recentComments) || recentComments.length === 0) return false;
  return recentComments.some((prev) => computeCommentSimilarity(clean, prev) >= threshold);
}

export interface CommentValidationResult {
  ok: boolean;
  cleanedText: string;
  reason: string;
}

/**
 * Cổng soát lỗi & độ phù hợp BẮT BUỘC trước khi dán bình luận vào khung Facebook:
 * - Không rỗng, không quá ngắn/quá dài
 * - Không dính lỗi code/template/JSON/Markdown/AI nói chuyện meta
 * - Không bị lặp đoạn ngay bên trong câu
 * - Không trùng lặp với lịch sử câu đã gửi gần đây
 * - Phù hợp với ngữ cảnh bài viết & không chứa dấu hiệu spam/link rác
 */
export function validateCommentBeforePaste(
  rawText: string,
  context: {
    postText?: string;
    targetText?: string;
    postAuthorRole?: ParticipantRole;
    recentSentComments?: string[];
    groupPlaybook?: GroupPlaybook;
    allowManualOverride?: boolean;
  } = {}
): CommentValidationResult {
  const rawStr = String(rawText || '').trim();
  if (!rawStr) {
    return { ok: false, cleanedText: '', reason: 'Nội dung bình luận bị rỗng.' };
  }

  // Kiểm tra placeholder chưa thay (VD: {{AI}}) NGAY TRƯỚC khi chạy spinText
  if (/\{\{|\}\}/.test(rawStr)) {
    return { ok: false, cleanedText: rawStr, reason: 'Phát hiện biến {{AI}} / template chưa được AI điền nội dung.' };
  }

  const spun = spinText(rawStr);
  const cleanedText = sanitizeSingleCommentText(spun);

  if (!cleanedText) {
    return { ok: false, cleanedText: '', reason: 'Nội dung bình luận bị rỗng.' };
  }

  // 1. Kiểm tra độ dài hợp lệ (tự nhiên, không cộc lốc, không quá dài lê thê)
  const words = tokenizeVietnameseWords(cleanedText);
  if (cleanedText.length < 10 || words.length < 3) {
    return { ok: false, cleanedText, reason: 'Nội dung quá ngắn hoặc cụt lủn (< 3 từ).' };
  }
  if (cleanedText.length > 380) {
    return { ok: false, cleanedText, reason: 'Nội dung quá dài (> 380 ký tự), dễ giống spam.' };
  }

  // 2. Chặn lỗi template chưa thay, lỗi JSON, lỗi code/HTML, Markdown rác
  if (/\{\{|\}\}|\{[^{}|]+\|[^{}]+\}|\[object\s+object\]|\bundefined\b|\bnull\b|\bNaN\b|```|<\/?(?:div|span|p|br|script|a)\b|"(?:suggestedPostComment|suggestedReply|detectedMode)"/i.test(cleanedText)) {
    return { ok: false, cleanedText, reason: 'Phát hiện lỗi cú pháp/template/JSON chưa được xử lý sạch.' };
  }
  if (/\*\*[^*]+\*\*|^#{1,3}\s/m.test(cleanedText)) {
    return { ok: false, cleanedText, reason: 'Nội dung dính ký tự Markdown (** / ###) không tự nhiên.' };
  }

  // 3. Chặn câu AI trả lời kiểu máy móc/meta (VD: "Dưới đây là gợi ý bình luận...")
  if (
    /^(?:dưới đây là|chắc chắn rồi|tôi là trợ lý|bạn có thể bình luận|gợi ý bình luận|câu trả lời gợi ý|here is|sure,)/i.test(
      cleanedText
    )
  ) {
    return { ok: false, cleanedText, reason: 'Phát hiện câu trả lời meta của AI (không phải lời bình luận thật).' };
  }

  // 4. Chặn lặp cụm ngay bên trong cùng 1 câu (VD: câu dài lặp nửa đầu ở nửa sau)
  const sentences = cleanedText
    .split(/[.!?\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 12);
  if (sentences.length >= 2) {
    const seenSent = new Set<string>();
    for (const s of sentences) {
      if (seenSent.has(s)) {
        return { ok: false, cleanedText, reason: 'Phát hiện câu bị lặp lại ngay bên trong nội dung.' };
      }
      seenSent.add(s);
    }
  }

  // 5. Chặn spam link / số điện thoại lộ liễu nếu không phải người dùng tự gõ tay
  if (!context.allowManualOverride) {
    if (/https?:\/\/|bit\.ly|tinyurl|t\.me\//i.test(cleanedText)) {
      return { ok: false, cleanedText, reason: 'Chặn link trần trong bình luận để tránh Facebook ẩn/spam.' };
    }
    if (/(?:bán acc|cấp acc|giá rẻ nhất|mua ngay kẻo lỡ|cam kết 100%)/i.test(cleanedText)) {
      return { ok: false, cleanedText, reason: 'Nội dung mang sắc thái quảng cáo/spam không phù hợp cộng đồng.' };
    }
  }

  // 6. Chặn bình luận vào bài rao bán/spam hoặc bài quá rỗng không đọc được ngữ cảnh
  if (!context.allowManualOverride) {
    if (context.postAuthorRole === 'seller') {
      return { ok: false, cleanedText, reason: 'Bài viết thuộc nhóm Spam/Bán acc-khóa học nên không dán bình luận.' };
    }
    const sourceCtx = `${context.postText || ''} ${context.targetText || ''}`.trim();
    if (context.postText !== undefined && sourceCtx.length < 10) {
      return { ok: false, cleanedText, reason: 'Chưa đọc được nội dung bài viết để kiểm chứng độ phù hợp.' };
    }
  }

  // 7. Chặn lặp lại câu đã gửi gần đây (chống spam đa bài / đa nhóm)
  if (!context.allowManualOverride && Array.isArray(context.recentSentComments) && context.recentSentComments.length > 0) {
    if (isCommentTooSimilar(cleanedText, context.recentSentComments, 0.58)) {
      return { ok: false, cleanedText, reason: 'Nội dung trùng lặp quá cao với bình luận vừa gửi gần đây.' };
    }
  }

  return { ok: true, cleanedText, reason: 'Nội dung sạch lỗi, tự nhiên và phù hợp ngữ cảnh.' };
}

/**
 * Sinh bình luận ngữ cảnh tự nhiên theo đúng nội dung bài viết AI / Dựng Phim AI / Job AI / Trường ĐH
 * và xoay vòng chống lặp tuyệt đối dựa trên lịch sử câu đã gửi.
 */
export function generateContextualOfflineReply(
  text: string,
  mode: AnalyzerMode,
  options: {
    recentSentComments?: string[];
    groupPlaybook?: GroupPlaybook;
    customRule?: CustomWorkflowRule;
    isCommentReply?: boolean;
  } = {}
): string {
  const clean = String(text || '').trim();
  const lower = clean.toLowerCase();
  const recent = options.recentSentComments || [];

  const tools = Array.from(
    new Set(
      (
        clean.match(
          /\b(?:veo\s*\d*|kling|runway|sora|hailuo|minimax|pika|luma|midjourney|flux|comfyui|stable\s*diffusion|krea|magnific|elevenlabs|suno|udio|heygen|capcut|premiere|after\s*effects|davinci|blender|wan\s*2\.?\d*|seedance|vidu|n8n)\b/gi
        ) || []
      ).map((t) => t.trim())
    )
  );
  const mainTool = tools[0] || '';

  const isJob =
    mode === 'ai_job' ||
    /tuyển\s*(?:freelancer|editor|dựng|làm\s*video|làm\s*phim|ai|intern|thực\s*tập)|cần\s*(?:tìm|người\s*dựng|dựng\s*video|làm\s*video|làm\s*phim|booking|team)|job\s*(?:ai|phim|video|dựng)|gửi\s*(?:showreel|portfolio|cv)|nhận\s*brief|tvc\s*ai/i.test(
      lower
    );
  const isEdu =
    mode === 'ai_edu' ||
    /đồ\s*án|tốt\s*nghiệp|sinh\s*viên|\bsv\b|đại\s*học|học\s*viện|fpt|rmit|arena|sân\s*khấu|điện\s*ảnh|báo\s*chí|mỹ\s*thuật|kiến\s*trúc|bách\s*khoa|workshop|cuộc\s*thi|hackathon/i.test(
      lower
    );

  const candidates: string[] = [];

  if (isJob) {
    const projectType = /tvc|quảng cáo/i.test(lower)
      ? 'TVC AI'
      : /mv\b|âm nhạc/i.test(lower)
        ? 'MV AI'
        : /hoạt hình|animation/i.test(lower)
          ? 'hoạt hình AI'
          : /reels|tiktok|short/i.test(lower)
            ? 'video ngắn AI'
            : 'dựng phim/video AI';
    const toolNote = mainTool ? ` bằng ${mainTool} kết hợp hậu kỳ` : '';
    candidates.push(
      `Mảng ${projectType} này bên e vừa làm xong mấy bộ chạy thực tế${toolNote}, có mấy trick giữ đồng nhất sản phẩm khá nét. A/c cần xem showreel kín thì ib e gửi qua xem thử nhé`,
      `Job ${projectType} kiểu này mấu chốt nằm ở khâu giữ mạch sáng + chuyển cảnh ko bị nhựa AI${toolNote}, a/c tiện nhắn e xin brief để e gửi vài demo thật đã làm cho dễ hình dung nhé`,
      `Bên e hay xử lý ${projectType} theo flow rút gọn thời gian nhma vẫn ra chất điện ảnh, bác muốn xem mấy bản demo chưa public thì ib e gửi liền cho`,
      `Nhìn yêu cầu ${projectType} này khá hợp gu bên e luôn, làm đúng pipeline sẽ đỡ đc gần nửa công sửa. Bác nhắn e xin brief e gửi showreel khớp style xem thử nhé`,
      `Mảng ${projectType} này làm kỹ từ storyboard tới hậu kỳ tiếng thì lên hình mới đắt — bác quan tâm cứ nhắn e gửi vài case thực tế vừa bàn giao cho tham khảo nhé`,
      `E vừa dựng xong mấy dự án ${projectType}${toolNote} giữ góc máy khá chắc, a/c đang lọc team làm gọn việc thì nhắn e gửi portfolio qua ib nhé`
    );
  } else if (isEdu) {
    const eduTopic = /đồ\s*án|tốt\s*nghiệp/i.test(lower)
      ? 'đồ án tốt nghiệp'
      : /cuộc\s*thi|hackathon/i.test(lower)
        ? 'dự án dự thi'
        : 'bài tập/dự án AI';
    const toolNote = mainTool ? ` với ${mainTool}` : '';
    candidates.push(
      `Làm ${eduTopic}${toolNote} ăn điểm nhất ko nằm ở prompt dài đâu b, mà ở bước khóa ảnh gốc + tách shot 4-5s trước khi gen, còn 1 bước hậu kỳ nữa nhma nói đây hơi dài, cần thì nhắn mình chỉ nhanh cho`,
      `Chủ đề ${eduTopic} này làm đúng flow thì máy cấu hình vừa chạy vẫn khá mượt luôn á, mình có sẵn bộ quy trình rút gọn đỡ đốt credit, b muốn tham khảo cứ ib mình gửi cho nhé`,
      `Với ${eduTopic}${toolNote} thì chốt storyboard + ánh sáng đồng bộ ngay từ ảnh đầu là đỡ vỡ nét hẳn luôn, có mấy mẹo nhỏ làm phim AI hay lắm b tò mò thì nhắn mình chỉ cho đỡ mất công mò`,
      `Kinh nghiệm góp ý cho ${eduTopic}: tách riêng hình, chuyển động với lớp sound ở bước cuối nhìn khác bọt hẳn so với gen 1 mạch đó e, cần xem cấu trúc flow mẫu thì nhắn mình gửi cho`,
      `Làm ${eduTopic} kiểu này chỉ cần đổi nhẹ cách setup đầu vào là chất lượng lên rõ luôn, phần chỉnh thông số hơi dài b muốn tìm hiểu kỹ hơn cứ nhắn mình hướng dẫn nhanh cho nhé`
    );
  } else if (/nhất\s*quán|consistent|nhân\s*vật|giữ\s*mặt|face\s*swap|lora/i.test(lower)) {
    const t = mainTool || 'video AI';
    candidates.push(
      `Giữ mặt trên ${t} thực ra mấu chốt ko nằm ở prompt dài đâu bác, mà ở bước khóa 3 góc keyframe với cách dẫn cảnh nối nhau. Còn 1 mẹo nhỏ lúc quay nghiêng nữa nhma viết đây hơi dài, bác cần thì nhắn e chỉ nhanh cho nhé`,
      `Lỗi đổi mặt trên ${t} đợt trước e cũng dính y chang, sau chuyển sang chốt character sheet sáng trung tính rồi chạy flow riêng thấy giữ nét chắc hơn mặc định nhiều, bác tò mò thì ib e gửi full flow test thử nhé`,
      `Khâu nhất quán nhân vật khi làm phim AI trên ${t} chỉ cần đổi nhẹ cách mồi keyframe đầu cảnh là đỡ lệch mặt tới 80% luôn á bác, còn 1 bước tinh chỉnh hậu kỳ nữa bác muốn tìm hiểu thêm cứ nhắn e chỉ cho 2 phút là đc`,
      `Nhân vật quay nghiêng bị biến dạng trên ${t} là bệnh chung nếu để tool tự đoán góc — bên e có cách khóa khung trung cảnh kết hợp hậu kỳ nhìn khá mượt, bác quan tâm cứ nhắn e chia sẻ flow thực tế đang chạy nhé`
    );
  } else if (/lip[\s-]*sync|nhép\s*miệng|lồng\s*tiếng|voice|giọng\s*đọc|âm\s*thanh/i.test(lower)) {
    candidates.push(
      `Lip-sync tiếng Việt muốn khớp miệng ko bị nhựa thì phải xử lý lại nhịp ngắt file thoại trước khi đẩy vào tool bác ạ, gen thẳng hay méo lắm. Còn 1 trick chỉnh tốc độ với khung hình nữa, bác muốn tìm hiểu thêm nhắn e chỉ nhanh cho`,
      `Làm thoại phim AI bên e ko bao giờ thả thẳng audio vào lip-sync mà qua 1 bước lọc nhịp trước — khớp khẩu hình tự nhiên hơn hẳn luôn, bác tò mò flow gọn bên e đang xài cứ ib e gửi cho tham khảo nhé`,
      `Bí quyết để giọng AI nghe có hồn hơn nằm ở cách tách lớp âm nền + ngắt nhịp thoại trước khi đồng bộ miệng đó bác, nói đây hơi dài bác cần tìm hiểu kỹ hơn thì nhắn e chỉ cho làm phát ăn ngay`
    );
  } else if (/chuyển\s*cảnh|camera|cinematic|ánh\s*sáng|render|upscale|4k|lỗi|bị\s*mờ|vỡ/i.test(lower)) {
    const t = mainTool || 'workflow AI';
    candidates.push(
      `Cảnh chạy từ ${t} bị giả hay mờ thường do nhồi nhiều chuyển động camera cùng lúc á bác — bên e tách riêng lớp camera motion + khóa tiêu cự là ra chất phim ngay. Còn 1 bước hậu kỳ chống nhựa AI nữa, bác cần thì nhắn e chỉ cho nhé`,
      `Muốn clip từ ${t} nhìn đỡ giả thì giữ shot gọn 4-5s rồi chạy qua bước nâng chi tiết với hạt phim nhẹ ở khâu cuối là khác bọt hẳn luôn bác, e có sẵn preset đang chạy cho job thật bác tò mò ib e gửi xem thử nhé`,
      `Khóa đúng key light với rim light ngay từ khung ảnh đầu là ${t} tự giữ sáng đẹp hơn hẳn luôn bác ạ, còn vài mẹo dẫn góc máy nữa nhma viết đây hơi dài bác cần cứ nhắn e chia sẻ nhanh cho`
    );
  } else if (mainTool) {
    candidates.push(
      `Chạy ${mainTool} muốn ra chất phim thật thì khâu chuẩn bị ảnh keyframe đầu vào ăn tới 70% chứ ko phải riêng prompt đâu bác. Bên e có bộ flow kết hợp ${mainTool} chạy khá ổn áp, bác muốn tìm hiểu sâu hơn cứ nhắn e chỉ cho nhé`,
      `Dạo này e đẩy ${mainTool} vào pipeline dựng phim thực tế thấy lên tay rõ — nhất là sau khi rút gọn lại cách viết chuyển động. Còn 1 mẹo nhỏ giúp đỡ tốn credit mà vẫn nét căng, bác tò mò nhắn e chia sẻ nhanh cho nhé`,
      `Xài ${mainTool} mà để cấu hình mặc định hay bị giật đoạn cuối shot lắm bác, chỉ cần đổi nhẹ cách setup đầu ra với hậu kỳ là nhìn khác hẳn luôn, bác muốn xem thử cách bên e setup cứ ib e gửi cho tham khảo`,
      `Điểm ăn tiền khi chạy ${mainTool} là chọn đúng góc máy hợp model rồi mới ghép mạch phim + sound design, phần quy trình chi tiết hơi dài bác muốn tìm hiểu thêm nhắn e hướng dẫn nhanh cho đỡ mất công mò nhé`
    );
  } else if (options.isCommentReply) {
    candidates.push(
      `Chỗ này bác tách riêng bước khóa hình gốc rồi mới đưa sang dựng chuyển động là đỡ lỗi hơn hẳn đó, còn 1 mẹo nhỏ ở bước hậu kỳ nữa nhma nói đây hơi dài bác muốn tìm hiểu thêm nhắn e chỉ nhanh cho nhé`,
      `Kinh nghiệm làm mấy dự án phim AI gần đây của e là chỉ cần đảo đúng thứ tự pipeline là chất lượng lên hẳn 1 bậc luôn bác, bác tò mò muốn xem flow rút gọn bên e đang chạy thì ib e gửi cho tham khảo nhé`,
      `Đợt trước e cũng vướng y hệt chỗ này luôn — thực ra có 1 cách setup khá gọn đỡ đc gần nửa công sửa mà ít người để ý, bác quan tâm cứ nhắn e chỉ nhanh cho 2 phút là làm đc ngay`,
      `Làm đúng kỹ thuật thì đoạn này xử lý khá mượt ko bị nhựa đâu bác, nếu bác muốn xem thử quy trình thực tế bên e đang chạy cho job thì nhắn e gửi qua xem nhé`
    );
  } else {
    candidates.push(
      `Hướng này ổn đó bác — thực ra chỉ cần siết thêm khâu đồng bộ sáng từ ảnh keyframe là chất phim lên tầm khác liền. Bên e có mấy mẹo dựng pipeline khá hay nhma viết đây hơi dài, bác muốn tìm hiểu thêm cứ nhắn e chỉ cho nhé`,
      `Mấy bài toán dựng video AI kiểu này mấu chốt nằm ở cách tách phân cảnh ngắn + hậu kỳ chứ ko phải cố gen 1 phát ăn ngay đâu bác, bác tò mò cách bên e setup cho dự án thật thì nhắn e chia sẻ nhanh cho nhé`,
      `Anh em làm phim AI hay mắc đúng chỗ này lắm — chỉ cần đổi nhẹ 1 bước chuẩn bị đầu vào là kết quả khác hẳn luôn, bác cần tìm hiểu kỹ hơn cứ ib e gửi quy trình rút gọn cho đỡ mất công mò nhé`,
      `Kinh nghiệm thực chiến mảng AI film bên e là phối đúng tool theo từng cảnh vừa nét vừa đỡ đốt credit hơn hẳn, bác quan tâm muốn xem thử bộ flow bên e đang chạy cứ nhắn e nhé`
    );
  }

  // Chọn câu có độ khác biệt CAO NHẤT so với các bình luận đã gửi gần đây (chống lặp tuyệt đối)
  let best = candidates[0] || '';
  let lowestSim = 2;
  const startOffset = Math.floor(Math.random() * candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    const cand = sanitizeSingleCommentText(spinText(candidates[(startOffset + i) % candidates.length]));
    const maxSim = recent.reduce((mx, prev) => Math.max(mx, computeCommentSimilarity(cand, prev)), 0);
    if (maxSim < lowestSim) {
      lowestSim = maxSim;
      best = cand;
    }
    if (maxSim < 0.25) break;
  }

  return best;
}

/**
 * Tự động ghi nhận câu bình luận thật người dùng gõ trong lúc Làm Mẫu để AI học đúng giọng văn.
 */
export function recordUserStyleSample(
  kb: MachineF12KnowledgeBase | undefined,
  sample: { text: string; groupId?: string; groupName?: string; intent: string }
): MachineF12KnowledgeBase {
  const base = normalizeMachineKnowledge(kb);
  const clean = sanitizeSingleCommentText(sample.text);
  if (clean.length < 10 || clean.includes('{{AI}}')) return base;
  const list = [...(base.learnedStyleSamples || [])];
  if (list.some((s) => computeCommentSimilarity(s.text, clean) >= 0.8)) return base;
  list.unshift({
    text: clean.slice(0, 260),
    groupId: sample.groupId,
    groupName: sample.groupName,
    intent: sample.intent,
    savedAt: new Date().toISOString(),
  });
  if (list.length > 25) list.length = 25;
  base.learnedStyleSamples = list;
  return base;
}

/**
 * Lưu lịch sử các câu bình luận đã gửi gần đây (tối đa 45 câu) để chống lặp câu chữ xuyên suốt mọi Group.
 */
export function recordSentComment(
  kb: MachineF12KnowledgeBase | undefined,
  commentText: string
): MachineF12KnowledgeBase {
  const base = normalizeMachineKnowledge(kb);
  const clean = sanitizeSingleCommentText(commentText);
  if (clean.length < 8) return base;
  const list = [clean, ...(base.recentSentComments || []).filter((c) => c !== clean)];
  if (list.length > 45) list.length = 45;
  base.recentSentComments = list;
  return base;
}

/**
 * Phân tích bài viết & bình luận ngoại tuyến (dùng bộ luật + kiến thức đã tự học + chống lặp ngữ cảnh).
 */
export function analyzeThreadOffline(
  input: ThreadReadInput,
  mode: ThreadMode,
  memory?: SelfLearningMemory,
  customRule?: CustomWorkflowRule,
  recentSentComments: string[] = [],
  groupPlaybook?: GroupPlaybook
): ThreadAnalysisResult {
  const combinedText = `${input.postText}\n${input.comments.map((c) => c.text).join('\n')}`;
  const normMode = normalizeThreadMode(mode);
  const resolvedMode: AnalyzerMode = normMode === 'auto' ? detectThreadMode(combinedText) : normMode;

  const postRoleInfo = classifyParticipantRole(input.postText, memory, customRule);
  const postUnified = analyzeContentUnified(input.postText, resolvedMode, customRule);

  // Chỉ bình luận bài chính khi thực sự có nhu cầu / câu hỏi / tuyển Job (KHÔNG spam comment lên bài chia sẻ chung)
  const shouldCommentPost =
    postRoleInfo.role === 'buyer' ||
    (postRoleInfo.role === 'neutral' &&
      postUnified.matched &&
      (/\?/.test(input.postText || '') || postUnified.score >= 78));

  const postType =
    postRoleInfo.role === 'seller'
      ? 'Bài rao bán acc/khóa học hoặc chào dịch vụ (Bỏ qua)'
      : postRoleInfo.role === 'buyer'
        ? `Bài có nhu cầu / Job / Hỏi đáp (${resolvedMode.toUpperCase()})`
        : `Bài thảo luận / showcase (${resolvedMode.toUpperCase()})`;

  const postAuthorNeed =
    postRoleInfo.role === 'seller'
      ? `Rao bán / Chào dịch vụ (${postRoleInfo.matchedSellerSignals.slice(0, 2).join(', ') || 'rao bán'})`
      : postUnified.summary || (input.postText || '').slice(0, 110);

  const usedHistory = [...recentSentComments];
  let suggestedPostComment = '';
  if (shouldCommentPost) {
    suggestedPostComment = generateContextualOfflineReply(input.postText || '', resolvedMode, {
      recentSentComments: usedHistory,
      groupPlaybook,
      customRule,
      isCommentReply: false,
    });
    if (suggestedPostComment) usedHistory.unshift(suggestedPostComment);
  }

  const commentEvaluations: ThreadCommentEvaluation[] = (input.comments || []).map((cmt) => {
    const cRole = classifyParticipantRole(cmt.text, memory, customRule);
    const cUnified = analyzeContentUnified(cmt.text, resolvedMode, customRule);

    if (cRole.role === 'seller') {
      return {
        index: cmt.index,
        author: cmt.author,
        text: cmt.text,
        role: 'seller',
        need: `Rao dịch vụ / Bán acc-khóa học (${cRole.matchedSellerSignals.slice(0, 2).join(', ') || 'chào hàng'})`,
        shouldEngage: false,
        skipReason: 'Bỏ qua: Phát hiện là người bán acc/khóa học hoặc đối thủ chào dịch vụ',
        suggestedReply: '',
        confidence: cRole.confidence,
      };
    }

    const needDesc =
      cRole.role === 'buyer'
        ? cUnified.summary || `Đang hỏi: ${cmt.text.slice(0, 80)}`
        : `Bình luận thảo luận: ${cmt.text.slice(0, 80)}`;

    const shouldEngage = cRole.role === 'buyer';
    let reply = '';
    if (shouldEngage) {
      reply = generateContextualOfflineReply(`${input.postText.slice(0, 160)}\n${cmt.text}`, resolvedMode, {
        recentSentComments: usedHistory,
        groupPlaybook,
        customRule,
        isCommentReply: true,
      });
      if (reply) usedHistory.unshift(reply);
    }

    return {
      index: cmt.index,
      author: cmt.author,
      text: cmt.text,
      role: cRole.role,
      need: needDesc,
      shouldEngage,
      skipReason: shouldEngage ? undefined : 'Bình luận xã giao / không có câu hỏi cụ thể',
      suggestedReply: reply,
      confidence: cRole.confidence,
    };
  });

  return {
    url: input.url,
    modeUsed: resolvedMode,
    engine: 'offline',
    postType,
    topicSummary: (input.postText || '').slice(0, 140),
    postAuthor: input.postAuthor,
    postAuthorRole: postRoleInfo.role,
    postAuthorNeed,
    shouldCommentPost,
    postSkipReason: shouldCommentPost
      ? undefined
      : postRoleInfo.role === 'seller'
        ? 'Chủ bài viết là người bán acc/khóa học hoặc rao dịch vụ -> Bỏ qua bài chính'
        : 'Bài chia sẻ/showcase không hỏi nhu cầu -> Chỉ thả tim tự nhiên, không bình luận spam',
    suggestedPostComment,
    commentEvaluations,
    newSellerSignals: [],
    newBuyerSignals: [],
    learnedLesson: 'Phân tích theo ngữ cảnh AI/Phim AI/Job AI + xoay vòng câu trả lời chống lặp.',
  };
}

/**
 * Tạo Prompt có cấu trúc để AI đọc bài viết, phân loại topic, nhu cầu từng người và tự học.
 */
export function buildThreadAiPrompt(
  input: ThreadReadInput,
  mode: ThreadMode,
  memory?: SelfLearningMemory,
  customRule?: CustomWorkflowRule,
  naturalGoal?: string,
  productKnowledge?: string,
  groupPlaybook?: GroupPlaybook,
  strategyMemory?: GlobalStrategyMemory,
  styleSamples?: LearnedStyleSample[],
  recentSentComments?: string[]
): string {
  const normMode = normalizeThreadMode(mode);
  const modeDesc =
    normMode === 'ai_job'
      ? 'Job AI / Job Dựng Phim AI / Tuyển Freelancer Video AI, TVC AI, Editor AI, Dự án AI'
      : normMode === 'ai_film'
        ? 'Dựng Phim AI & Video AI (Veo, Kling, Runway, Sora, ComfyUI, Midjourney, Flux, VFX, Storyboard, Workflow)'
        : normMode === 'ai_edu'
          ? 'Các Trường Đại Học / Sinh Viên / CLB Truyền Thông – Điện Ảnh – Thiết Kế – CNTT, Đồ án & Workshop AI'
          : normMode === 'custom'
            ? `${customRule?.workflowName || 'Chủ đề tùy chỉnh'} (Từ khóa mục tiêu: ${(customRule?.includeKeywords || []).join(', ')})`
            : 'Tự động nhận diện chủ đề (Dựng phim AI / Job AI & Phim AI / Trường học & Cộng đồng AI)';

  const goalBlock = naturalGoal?.trim()
    ? `\nCHỈ THỊ MỤC TIÊU TỪ NGƯỜI DÙNG (ƯU TIÊN TUÂN THỦ):\n"${naturalGoal.trim()}"\n`
    : '';

  const productKbBlock = productKnowledge?.trim()
    ? `\nHỒ SƠ NĂNG LỰC / PORTFOLIO / THẾ MẠNH THỰC TẾ CỦA BẠN (Dùng đúng thông tin thật này, không bịa đặt):\n"${productKnowledge.trim().slice(0, 1500)}"\n`
    : '';

  const playbookBlock = groupPlaybook
    ? `\nCHIẾN LƯỢC RIÊNG CHO TỆP NHÓM HIỆN TẠI (BẮT BUỘC BÁM SÁT ĐỂ TƯƠNG TÁC ĐÚNG TỆP):\n` +
      `- Tệp thành viên của nhóm: ${groupPlaybook.audienceType}\n` +
      `- Văn hóa nhóm: ${groupPlaybook.cultureNotes}\n` +
      `- Văn phong phù hợp nhất: ${groupPlaybook.recommendedTone}\n` +
      `${groupPlaybook.doList?.length ? `- NÊN làm: ${groupPlaybook.doList.slice(0, 4).join(' | ')}\n` : ''}` +
      `${groupPlaybook.dontList?.length ? `- TRÁNH làm: ${groupPlaybook.dontList.slice(0, 4).join(' | ')}\n` : ''}` +
      `${groupPlaybook.conversionTip ? `- Mẹo kết nối tự nhiên: ${groupPlaybook.conversionTip}\n` : ''}`
    : '';

  const strategyBlock =
    strategyMemory && (strategyMemory.workingPrinciples?.length || strategyMemory.toneGuidelines)
      ? `\nNGUYÊN TẮC LÀM VIỆC HIỆU QUẢ ĐÃ ĐƯỢC AI CỐ VẤN RÚT RA:\n` +
        `${strategyMemory.workingPrinciples?.length ? `- Nguyên tắc: ${strategyMemory.workingPrinciples.slice(0, 5).join(' ; ')}\n` : ''}` +
        `${strategyMemory.toneGuidelines ? `- Định hướng giọng văn: ${strategyMemory.toneGuidelines}\n` : ''}`
      : '';

  const styleBlock =
    Array.isArray(styleSamples) && styleSamples.length > 0
      ? `\nGIỌNG VĂN THẬT ĐÃ HỌC TỪ CÁC BÌNH LUẬN MẪU CỦA NGƯỜI DÙNG (Chỉ học cách xưng hô, độ ngắn gọn & chất tự nhiên — TUYỆT ĐỐI KHÔNG copy y nguyên):\n` +
        styleSamples
          .slice(0, 5)
          .map((s) => `- "${s.text.slice(0, 140)}"`)
          .join('\n') +
        '\n'
      : '';

  const antiRepeatBlock =
    Array.isArray(recentSentComments) && recentSentComments.length > 0
      ? `\nCÁC BÌNH LUẬN VỪA GỬI GẦN ĐÂY (TUYỆT ĐỐI CẤM LẶP LẠI Ý, CÂU CHỮ HOẶC CÁCH MỞ ĐẦU GIỐNG CÁC CÂU NÀY):\n` +
        recentSentComments
          .slice(0, 6)
          .map((c) => `- "${c.slice(0, 140)}"`)
          .join('\n') +
        '\n'
      : '';

  const learnedSellerStr = (memory?.learnedSellerSignals || []).slice(-20).join(', ') || 'Chưa có';
  const learnedBuyerStr = (memory?.learnedBuyerSignals || []).slice(-20).join(', ') || 'Chưa có';
  const examplesStr = (memory?.fewShotExamples || [])
    .slice(-5)
    .map((ex) => `- "${ex.text.slice(0, 100)}" => role: ${ex.role} (${ex.need})${ex.goodReply ? ` | Mẫu hay: "${ex.goodReply}"` : ''}`)
    .join('\n');

  const commentsBlock =
    input.comments.length > 0
      ? input.comments
          .slice(0, 25)
          .map((c) => `[#${c.index}] ${c.author}: ${c.text.slice(0, 260)}`)
          .join('\n')
      : '(Chưa có bình luận nào)';

  return `Bạn là AI phân tích cộng đồng AI, Dựng Phim AI, Job AI & tự học cho hệ thống FB EXTEN.
Chế độ hiện tại: ${modeDesc}
${goalBlock}${productKbBlock}${playbookBlock}${strategyBlock}${styleBlock}${antiRepeatBlock}${customRule?.aiSystemPrompt ? `Hướng dẫn phong cách trả lời riêng: ${customRule.aiSystemPrompt}` : ''}

KIẾN THỨC ĐÃ TỰ HỌC TỪ CÁC BÀI TRƯỚC:
- Dấu hiệu RAO BÁN ACC/KHÓA HỌC/SPAM DỊCH VỤ (phải bỏ qua): ${learnedSellerStr}
- Dấu hiệu BÀI TUYỂN JOB / NGƯỜI HỎI WORKFLOW / CÓ NHU CẦU THẬT: ${learnedBuyerStr}
${examplesStr ? `- Ví dụ mẫu đã học:\n${examplesStr}` : ''}

BÀI VIẾT CẦN ĐỌC:
- Link: ${input.url}
- Chủ bài viết: ${input.postAuthor}
- Nội dung bài viết: "${(input.postText || '').slice(0, 1200)}"

DANH SÁCH BÌNH LUẬN:
${commentsBlock}

NHIỆM VỤ BẮT BUỘC:
1. Xác định bài viết thuộc dạng gì ("postType") và tóm tắt chủ đề ("topicSummary").
2. Xác định chủ bài viết ("postAuthorRole") là "buyer" (nhà tuyển dụng/khách đăng Job AI-Phim AI, người hỏi kỹ thuật/tool/workflow AI, hoặc sinh viên/thành viên cần hỗ trợ), "seller" (người bán tài khoản/tool giá rẻ, bán khóa học đại trà, đối thủ vào rao nhận dịch vụ spam), hay "neutral" (chia sẻ showcase/thảo luận).
   - Nếu chủ bài viết là "seller" => "shouldCommentPost": false (bỏ qua không bình luận vào bài bán acc/khóa học hay đối thủ chào dịch vụ).
   - Nếu chủ bài viết là "buyer" hoặc "neutral" thực sự đáng trao đổi => "shouldCommentPost": true và viết "suggestedPostComment" theo ĐÚNG CÔNG THỨC CAO THỦ GỢI MỞ DƯỚI ĐÂY:
     * **Bật mí 20-30% điểm mấu chốt trình cao**: Nói trúng "bệnh" hoặc 1 chi tiết kỹ thuật/kinh nghiệm thực chiến sắc nét (đúng tên tool, lỗi workflow, cách giữ nhất quán, ánh sáng, brief...) để người đọc thấy ngay mình là cao thủ làm nghề thật — TUYỆT ĐỐI KHÔNG hướng dẫn hết toàn bộ cách làm trong comment!
     * **Gợi mở tạo sự tò mò / FOMO kéo Inbox tự nhiên**: Chốt bằng 1 vế lấp lửng cuốn hút để họ tự muốn nhắn tin hỏi thêm (VD: "còn 1 bước xử lý nhỏ nữa nói ở đây hơi dài, bác muốn tìm hiểu thêm thì nhắn em chỉ nhanh cho nhé", "bên em có bộ flow/preset chạy thực tế mượt hơn hẳn, bác tò mò cứ nhắn em gửi qua test thử", "anh/chị tiện nhắn em xin brief để gửi mấy demo kín bên em vừa làm nhé"...).
     * Ngắn gọn **1-2 câu tiếng Việt**, phong thái tự tin, ngang hàng, không nài nỉ, không rao bán lộ liễu, KHÔNG dùng câu sáo rỗng và TUYỆT ĐỐI KHÔNG lặp lại cách mở đầu/kết câu của các bình luận vừa gửi gần đây.
3. Đọc TỪNG bình luận ở trên:
   - Phân loại "role": "buyer" (có nhu cầu tuyển/đặt job/hỏi tool/hỏi cách làm), "seller" (người bán acc/khóa học/đối thủ vào chào dịch vụ -> BỎ QUA!), hoặc "neutral" (spam/icon/không rõ).
   - Chỉ đặt "shouldEngage": true cho người có nhu cầu thật ("buyer"), tuyệt đối đặt "shouldEngage": false nếu là "seller".
   - Viết "suggestedReply" riêng biệt theo cùng công thức **hé lộ 1 ý trình cao + gợi mở tò mò kéo nhắn tin**, bám sát câu hỏi của từng người (mỗi người 1 cách diễn đạt khác hẳn nhau).
4. Tự học ("newSellerSignals", "newBuyerSignals", "learnedLesson"): Rút ra tối đa 2-3 cụm từ khóa ngắn mới giúp phân biệt Người rao bán/spam vs Người có nhu cầu/Job thật và 1 câu bài học ngắn.

CHỈ TRẢ VỀ JSON HỢP LỆ THEO ĐÚNG CẤU TRÚC SAU (không thêm giải thích ngoài JSON):
{
  "detectedMode": "ai_film|ai_job|ai_edu|custom",
  "postType": "string",
  "topicSummary": "string",
  "postAuthorRole": "buyer|seller|neutral",
  "postAuthorNeed": "string",
  "shouldCommentPost": true,
  "postSkipReason": "string",
  "suggestedPostComment": "string",
  "commentEvaluations": [
    {
      "index": 0,
      "role": "buyer|seller|neutral",
      "need": "string",
      "shouldEngage": true,
      "skipReason": "string",
      "suggestedReply": "string",
      "confidence": 90
    }
  ],
  "newSellerSignals": ["string"],
  "newBuyerSignals": ["string"],
  "learnedLesson": "string"
}`;
}

/**
 * Parse JSON trả về từ AI (tự động rơi về Offline Engine nếu JSON lỗi + làm sạch chống lặp câu).
 */
export function parseThreadAiResponse(
  rawText: string,
  input: ThreadReadInput,
  mode: ThreadMode,
  aiProvider: string,
  memory?: SelfLearningMemory,
  customRule?: CustomWorkflowRule,
  recentSentComments: string[] = [],
  groupPlaybook?: GroupPlaybook
): ThreadAnalysisResult {
  const offlineFallback = analyzeThreadOffline(input, mode, memory, customRule, recentSentComments, groupPlaybook);
  try {
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return offlineFallback;

    const parsed: any = JSON.parse(jsonMatch[0]);
    const aiMap = new Map<number, any>();
    for (const item of parsed.commentEvaluations || []) {
      if (typeof item?.index === 'number') {
        aiMap.set(item.index, item);
      }
    }

    const mergedComments: ThreadCommentEvaluation[] = input.comments.map((orig) => {
      const aiItem = aiMap.get(orig.index);
      if (!aiItem) {
        return offlineFallback.commentEvaluations.find((c) => c.index === orig.index)!;
      }
      const role: ParticipantRole =
        aiItem.role === 'buyer' || aiItem.role === 'seller' || aiItem.role === 'neutral' ? aiItem.role : 'neutral';
      const shouldEngage = role === 'seller' ? false : Boolean(aiItem.shouldEngage);

      return {
        index: orig.index,
        author: orig.author,
        text: orig.text,
        role,
        need: String(aiItem.need || ''),
        shouldEngage,
        skipReason: shouldEngage ? undefined : String(aiItem.skipReason || (role === 'seller' ? 'Spam/Rao bán (AI bỏ qua)' : 'Không có nhu cầu')),
        suggestedReply: shouldEngage ? sanitizeSingleCommentText(String(aiItem.suggestedReply || '')) : '',
        confidence: Number(aiItem.confidence) || 85,
      };
    });

    const postRole: ParticipantRole =
      parsed.postAuthorRole === 'buyer' || parsed.postAuthorRole === 'seller' || parsed.postAuthorRole === 'neutral'
        ? parsed.postAuthorRole
        : offlineFallback.postAuthorRole;

    const shouldCommentPost = postRole === 'seller' ? false : Boolean(parsed.shouldCommentPost);
    const resolvedMode: AnalyzerMode =
      normalizeThreadMode(mode) === 'auto' &&
      (parsed.detectedMode === 'ai_film' ||
        parsed.detectedMode === 'ai_job' ||
        parsed.detectedMode === 'ai_edu' ||
        parsed.detectedMode === 'custom')
        ? parsed.detectedMode
        : offlineFallback.modeUsed;

    const cleanPostComment = shouldCommentPost
      ? sanitizeSingleCommentText(String(parsed.suggestedPostComment || offlineFallback.suggestedPostComment))
      : '';

    return {
      url: input.url,
      modeUsed: resolvedMode,
      engine: 'ai',
      aiProvider,
      postType: String(parsed.postType || offlineFallback.postType),
      topicSummary: String(parsed.topicSummary || offlineFallback.topicSummary),
      postAuthor: input.postAuthor,
      postAuthorRole: postRole,
      postAuthorNeed: String(parsed.postAuthorNeed || offlineFallback.postAuthorNeed),
      shouldCommentPost: Boolean(shouldCommentPost && cleanPostComment),
      postSkipReason: shouldCommentPost
        ? undefined
        : String(parsed.postSkipReason || 'Chủ bài viết là người bán/spam -> Bỏ qua bài chính'),
      suggestedPostComment: cleanPostComment,
      commentEvaluations: mergedComments,
      newSellerSignals: Array.isArray(parsed.newSellerSignals) ? parsed.newSellerSignals.map(String).filter(Boolean) : [],
      newBuyerSignals: Array.isArray(parsed.newBuyerSignals) ? parsed.newBuyerSignals.map(String).filter(Boolean) : [],
      learnedLesson: String(parsed.learnedLesson || 'Đã phân tích xong ngữ cảnh bài viết & bình luận.'),
    };
  } catch {
    return offlineFallback;
  }
}

/**
 * Cập nhật Bộ nhớ Tự Học AI sau mỗi lần đọc bài hoặc được người dùng dạy thêm.
 */
export function mergeLearningFromAnalysis(
  current: SelfLearningMemory | undefined,
  input: ThreadReadInput,
  analysis: ThreadAnalysisResult
): SelfLearningMemory {
  const mem: SelfLearningMemory = {
    totalAnalyzed: (current?.totalAnalyzed || 0) + 1,
    learnedSellerSignals: [...(current?.learnedSellerSignals || [])],
    learnedBuyerSignals: [...(current?.learnedBuyerSignals || [])],
    recentLessons: [...(current?.recentLessons || [])],
    fewShotExamples: [...(current?.fewShotExamples || [])],
  };

  const pushUnique = (arr: string[], items: string[], maxLen = 80) => {
    for (const raw of items) {
      const clean = String(raw || '').trim().toLowerCase();
      if (clean.length >= 3 && clean.length <= 45 && !arr.includes(clean)) {
        arr.push(clean);
      }
    }
    while (arr.length > maxLen) arr.shift();
  };

  pushUnique(mem.learnedSellerSignals, analysis.newSellerSignals || []);
  pushUnique(mem.learnedBuyerSignals, analysis.newBuyerSignals || []);

  if (analysis.learnedLesson) {
    mem.recentLessons.unshift({
      timestamp: new Date().toISOString(),
      mode: analysis.modeUsed,
      postType: analysis.postType,
      summary: analysis.learnedLesson,
    });
    if (mem.recentLessons.length > 25) mem.recentLessons.length = 25;
  }

  // Lưu 1-2 ví dụ tiêu biểu (ưu tiên buyer có câu trả lời và seller để nhận diện sau này)
  if (input.postText && input.postText.length >= 15) {
    mem.fewShotExamples.push({
      text: input.postText.slice(0, 140),
      role: analysis.postAuthorRole,
      need: analysis.postAuthorNeed.slice(0, 100),
      goodReply: analysis.suggestedPostComment ? analysis.suggestedPostComment.slice(0, 140) : undefined,
      updatedAt: new Date().toISOString(),
    });
  }
  const firstBuyerCmt = analysis.commentEvaluations.find((c) => c.role === 'buyer' && c.suggestedReply);
  if (firstBuyerCmt) {
    mem.fewShotExamples.push({
      text: firstBuyerCmt.text.slice(0, 140),
      role: 'buyer',
      need: firstBuyerCmt.need.slice(0, 100),
      goodReply: firstBuyerCmt.suggestedReply.slice(0, 140),
      updatedAt: new Date().toISOString(),
    });
  }
  while (mem.fewShotExamples.length > 20) mem.fewShotExamples.shift();

  return mem;
}

/**
 * Người dùng dạy trực tiếp cho AI khi bấm sửa vai trò (Người bán <-> Khách có nhu cầu).
 */
export function teachAiCorrection(
  current: SelfLearningMemory | undefined,
  sampleText: string,
  role: ParticipantRole,
  need: string,
  goodReply?: string
): SelfLearningMemory {
  const mem: SelfLearningMemory = {
    totalAnalyzed: current?.totalAnalyzed || 0,
    learnedSellerSignals: [...(current?.learnedSellerSignals || [])],
    learnedBuyerSignals: [...(current?.learnedBuyerSignals || [])],
    recentLessons: [...(current?.recentLessons || [])],
    fewShotExamples: [...(current?.fewShotExamples || [])],
  };

  mem.fewShotExamples.push({
    text: (sampleText || '').slice(0, 140),
    role,
    need: (need || (role === 'seller' ? 'Người bán hàng' : 'Khách có nhu cầu')).slice(0, 100),
    goodReply: goodReply ? goodReply.slice(0, 140) : undefined,
    updatedAt: new Date().toISOString(),
  });
  while (mem.fewShotExamples.length > 20) mem.fewShotExamples.shift();

  mem.recentLessons.unshift({
    timestamp: new Date().toISOString(),
    mode: 'user_taught',
    postType: role === 'seller' ? 'Mẫu Người Bán (Bỏ qua)' : 'Mẫu Khách Có Nhu Cầu',
    summary: `Người dùng đã dạy AI nhận diện: "${sampleText.slice(0, 60)}..." là ${role === 'seller' ? 'Người bán' : 'Khách hỏi'}`,
  });
  if (mem.recentLessons.length > 25) mem.recentLessons.length = 25;

  return mem;
}

// ============================================================================
// 7. MUSE-STYLE VISION SET-OF-MARK AGENT (TỰ NHÌN MÀN HÌNH TÌM ĐÚNG Ô F12)
// ============================================================================

export interface SomElementItem {
  markId: number;
  tag: string;
  role: string;
  ariaLabel: string;
  text: string;
  isEditable: boolean;
  rect: { x: number; y: number; w: number; h: number };
}

export interface VisionLocateResult {
  targetMarkId: number | null;
  action: 'click' | 'hover' | 'type' | 'scroll_down' | 'none';
  reason: string;
}

/**
 * Tạo prompt đa phương thức (Ảnh chụp Set-of-Mark + Danh sách phần tử) để AI tự nhìn màn hình chọn đúng ô.
 */
export function buildVisionLocatePrompt(goalDescription: string, somCatalog: SomElementItem[]): string {
  const catalogLines = (somCatalog || [])
    .slice(0, 60)
    .map(
      (el) =>
        `[${el.markId}] <${el.tag || 'div'}${el.role ? ` role="${el.role}"` : ''}> aria="${el.ariaLabel || ''}" text="${(el.text || '').slice(0, 45)}" editable=${Boolean(el.isEditable)} @(${el.rect?.x ?? 0},${el.rect?.y ?? 0})`
    )
    .join('\n');

  return `Bạn là Browser Vision Agent (kiểu Muse AI) đang nhìn ảnh chụp màn hình Facebook có gắn các số đánh dấu màu cam/xanh [1], [2], [3]... lên các nút và ô nhập liệu.

MỤC TIÊU CẦN TÌM: "${goalDescription}"

DANH SÁCH CÁC PHẦN TỬ ĐƯỢC ĐÁNH SỐ TRÊN MÀN HÌNH:
${catalogLines}

YÊU CẦU:
- Quan sát ảnh chụp màn hình kèm danh sách [markId] ở trên.
- Chọn đúng 1 số markId phù hợp nhất với mục tiêu "${goalDescription}".
- Nếu chưa thấy trên màn hình hiện tại, đặt "targetMarkId": null và "action": "scroll_down" hoặc "none".

CHỈ TRẢ VỀ JSON HỢP LỆ:
{
  "targetMarkId": 12,
  "action": "click|hover|type|scroll_down|none",
  "reason": "Giải thích ngắn 1 câu lý do chọn số này"
}`;
}

export function parseVisionLocateResponse(rawText: string): VisionLocateResult {
  try {
    const cleaned = (rawText || '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return { targetMarkId: null, action: 'none', reason: 'AI không trả về JSON hợp lệ.' };
    const parsed: any = JSON.parse(m[0]);
    const markId = typeof parsed.targetMarkId === 'number' ? parsed.targetMarkId : null;
    const action =
      parsed.action === 'click' || parsed.action === 'hover' || parsed.action === 'type' || parsed.action === 'scroll_down'
        ? parsed.action
        : 'none';
    return {
      targetMarkId: markId,
      action,
      reason: String(parsed.reason || ''),
    };
  } catch {
    return { targetMarkId: null, action: 'none', reason: 'Lỗi parse JSON phản hồi từ Vision AI.' };
  }
}

// ============================================================================
// 8. URL GROUP TỔNG / POST CLASSIFIER & DEDUP HELPERS
// ============================================================================

export interface ClassifiedFacebookUrl {
  kind: 'group_feed' | 'post' | 'page_or_profile' | 'invalid';
  cleanUrl: string;
  navigateUrl: string;
  groupId?: string;
}

/**
 * Phân loại link người dùng dán vào là Link Group Tổng hay Link Bài Viết cụ thể.
 * Với Link Group Tổng, tự động chuẩn hóa URL sang luồng bài viết mới nhất (CHRONOLOGICAL).
 */
export function classifyFacebookTargetUrl(rawUrl: string, sortNewest = true): ClassifiedFacebookUrl {
  const input = (rawUrl || '').trim();
  if (!input) return { kind: 'invalid', cleanUrl: '', navigateUrl: '' };

  let parsed: URL;
  try {
    const withProto = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    parsed = new URL(withProto);
  } catch {
    return { kind: 'invalid', cleanUrl: input, navigateUrl: input };
  }

  if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) {
    return { kind: 'invalid', cleanUrl: input, navigateUrl: input };
  }

  // Chuẩn hóa m.facebook.com / web.facebook.com -> www.facebook.com để đồng bộ DOM desktop
  if (/^(m|mbasic|touch|web)\.facebook\.com$/i.test(parsed.hostname)) {
    parsed.hostname = 'www.facebook.com';
  }

  const fullHref = parsed.toString();
  const pathLower = parsed.pathname.toLowerCase();

  const isPostUrl =
    /\/posts\/|\/permalink\/|\/videos\/|\/reel\/|\/share\/p\/|story\.php|photo\.php/i.test(pathLower) ||
    parsed.searchParams.has('multi_permalinks') ||
    parsed.searchParams.has('story_fbid') ||
    parsed.searchParams.has('fbid');

  const groupMatch = parsed.pathname.match(/\/groups\/([^/?#]+)/i);
  if (isPostUrl) {
    return {
      kind: 'post',
      cleanUrl: fullHref,
      navigateUrl: fullHref,
      groupId: groupMatch?.[1],
    };
  }

  if (groupMatch && groupMatch[1]) {
    const groupId = groupMatch[1];
    const base = `https://www.facebook.com/groups/${groupId}`;
    const hasCustomSort = parsed.searchParams.has('sorting_setting');
    const navigateUrl = hasCustomSort
      ? fullHref
      : sortNewest
        ? `${base}/?sorting_setting=CHRONOLOGICAL`
        : `${base}/`;
    return {
      kind: 'group_feed',
      cleanUrl: `${base}/`,
      navigateUrl,
      groupId,
    };
  }

  return {
    kind: 'page_or_profile',
    cleanUrl: fullHref,
    navigateUrl: fullHref,
  };
}

/**
 * Tạo khóa định danh ổn định để tránh xử lý trùng lặp cùng 1 bài viết trong Group.
 */
export function buildPostDedupKey(postUrl: string, author: string, text: string): string {
  const url = String(postUrl || '');
  const idMatch =
    url.match(/\/posts\/(\d+)/i) ||
    url.match(/\/permalink\/(\d+)/i) ||
    url.match(/[?&](?:multi_permalinks|story_fbid|fbid)=([a-zA-Z0-9]+)/i) ||
    url.match(/(pfbid[a-zA-Z0-9]+)/i);
  if (idMatch?.[1]) {
    return `id_${idMatch[1]}`;
  }
  const cleanSignature = `${(author || '').trim().toLowerCase()}|${(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)
    .toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < cleanSignature.length; i++) {
    hash = (hash * 31 + cleanSignature.charCodeAt(i)) | 0;
  }
  return `sig_${(hash >>> 0).toString(16)}`;
}

// ============================================================================
// 9. TEACH-BY-DEMONSTRATION: F12 PROFILE LEARNER & UNIVERSAL MXH WORKFLOW ENGINE
// ============================================================================

export type LearnedTargetRole =
  | 'like_btn'
  | 'love_btn'
  | 'comment_trigger'
  | 'comment_editor'
  | 'comment_submit'
  | 'reply_btn'
  | 'reply_editor'
  | 'share_btn'
  | 'create_post_trigger'
  | 'create_post_editor'
  | 'create_post_submit'
  | 'add_friend_btn'
  | 'message_btn'
  | 'messenger_editor'
  | 'messenger_send'
  | 'join_group_btn'
  | 'search_input'
  | 'custom';

export const LEARNED_ROLE_LABELS: Record<LearnedTargetRole, string> = {
  like_btn: '👍 Nút Thích bài viết',
  love_btn: '❤️ Biểu tượng Yêu thích (Thả tim)',
  comment_trigger: '💬 Nút Mở Bình luận',
  comment_editor: '✍️ Ô Nhập Bình luận bài chính',
  comment_submit: '📨 Nút Gửi Bình luận',
  reply_btn: '↩️ Nút Trả lời bình luận',
  reply_editor: '✍️ Ô Nhập Trả lời bình luận',
  share_btn: '↗️ Nút Chia sẻ bài viết',
  create_post_trigger: '📝 Ô Mở Tạo bài viết mới',
  create_post_editor: '📄 Ô Soạn nội dung đăng bài',
  create_post_submit: '🚀 Nút Đăng bài (Post)',
  add_friend_btn: '🤝 Nút Thêm bạn bè / Kết bạn',
  message_btn: '💌 Nút Nhắn tin (Profile/Card)',
  messenger_editor: '💬 Ô Nhập tin nhắn Messenger',
  messenger_send: '📨 Nút Gửi tin nhắn Messenger',
  join_group_btn: '👥 Nút Tham gia nhóm',
  search_input: '🔍 Ô Tìm kiếm Facebook',
  custom: '✨ Nút / Ô MXH tùy chỉnh',
};

export interface F12ElementFingerprint {
  tag: string;
  role: string;
  ariaLabel: string;
  childAria: string;
  placeholder: string;
  text: string;
  adRenderingRole: string;
  testId: string;
  name: string;
  inputType: string;
  contentEditable: boolean;
  containerKind: 'dialog' | 'feed_card' | 'comment' | 'main' | 'nav' | 'body';
  ancestorRoles: string[];
  semanticSelector: string;
  domPath: string;
  hrefPattern: string;
  rect: { x: number; y: number; w: number; h: number };
  viewport: { w: number; h: number };
  relPos: { rx: number; ry: number };
  cardRelPos?: { rx: number; ry: number };
  learnedAt: string;
  sampleUrl: string;
}

export interface GroupPlaybook {
  audienceType: string;
  cultureNotes: string;
  recommendedTone: string;
  bestActions: string[];
  doList: string[];
  dontList: string[];
  conversionTip: string;
  updatedAt: string;
  engine: 'ai' | 'offline';
}

export interface WorkflowStrategyReview {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  distilledStrategy: string;
  bestFitGroupTypes: string[];
  reviewedAt: string;
  engine: 'ai' | 'offline';
}

export interface GlobalStrategyMemory {
  overallCritique: string;
  workingPrinciples: string[];
  toneGuidelines: string;
  topRecommendations: string[];
  updatedAt: string;
  engine: 'ai' | 'offline';
}

export interface LearnedGroupItem {
  id: string;
  url: string;
  name: string;
  kind: 'group_feed' | 'page' | 'profile' | 'messenger' | 'post' | 'other';
  addedAt: string;
  lastVisitedAt: string;
  visitCount: number;
  tags: string[];
  postsScanned?: number;
  hotLeadsFound?: number;
  warmLeadsFound?: number;
  sellersSkipped?: number;
  commentsSent?: number;
  lastScannedAt?: string;
  roiScore?: number;
  tier?: 'A' | 'B' | 'C';
  sampleSnippets?: string[];
  playbook?: GroupPlaybook;
}

export type RecordedStepType = 'navigate' | 'click' | 'hover' | 'input' | 'keypress' | 'scroll' | 'wait';

export interface RecordedActionStep {
  id: string;
  type: RecordedStepType;
  intent: LearnedTargetRole;
  label: string;
  url: string;
  pageTitle: string;
  fingerprint?: F12ElementFingerprint;
  value?: string;
  key?: string;
  scrollDeltaY?: number;
  delayMs: number;
  timestamp: number;
}

export type WorkflowCategory =
  | 'group_engage'
  | 'post_publish'
  | 'inbox_dm'
  | 'add_friend'
  | 'feed_nurture'
  | 'custom';

export interface RecordedSocialWorkflow {
  id: string;
  name: string;
  description: string;
  category: WorkflowCategory;
  createdAt: string;
  updatedAt: string;
  runCount: number;
  steps: RecordedActionStep[];
  aiReview?: WorkflowStrategyReview;
}

export interface ActionBudgetConfig {
  maxCommentsPerHour: number;
  maxCommentsPerDay: number;
  maxPostsPerGroupRun: number;
  maxPostAgeHours: number;
  dedupAuthorDays: number;
  activeStartHour: number;
  activeEndHour: number;
  enableHumanWarmup: boolean;
  notifyHotLeadTelegram: boolean;
  hotLeadMinScore: number;
}

export interface ActionBudgetState {
  dateKey: string;
  hourKey: string;
  commentsThisHour: number;
  commentsToday: number;
  lovesToday: number;
  postsScannedToday: number;
}

export interface AutoPilotConfig {
  enabled: boolean;
  intervalMinutes: number;
  groupsPerCycle: number;
  lastCycleAt?: string;
}

export interface SellerBlacklistEntry {
  key: string;
  uid?: string;
  name: string;
  reason: string;
  addedAt: string;
}

export interface AuthorEngagementRecord {
  key: string;
  uid?: string;
  name: string;
  groupId?: string;
  postUrl: string;
  engagedAt: string;
}

export interface LeadCrmItem {
  id: string;
  author: string;
  authorUid?: string;
  groupId?: string;
  groupName: string;
  postUrl: string;
  snippet: string;
  need: string;
  leadScore: number;
  temperature: 'hot' | 'warm' | 'cold';
  suggestedReply: string;
  status: 'new' | 'engaged' | 'replied' | 'inbox' | 'closed';
  createdAt: string;
  telegramNotified?: boolean;
}

export interface LearnedStyleSample {
  text: string;
  groupId?: string;
  groupName?: string;
  intent: string;
  savedAt: string;
}

export interface MachineF12KnowledgeBase {
  version: number;
  machineSignature: {
    viewportW: number;
    viewportH: number;
    lang: string;
    dpr: number;
    updatedAt: string;
  };
  roleProfiles: Record<string, F12ElementFingerprint[]>;
  learnedGroups: LearnedGroupItem[];
  workflows: RecordedSocialWorkflow[];
  totalDemosRecorded: number;
  productKnowledgeBase?: string;
  sellerBlacklist?: SellerBlacklistEntry[];
  recentAuthorEngagements?: AuthorEngagementRecord[];
  leadsCrm?: LeadCrmItem[];
  budgetConfig?: ActionBudgetConfig;
  budgetState?: ActionBudgetState;
  autoPilot?: AutoPilotConfig;
  strategyMemory?: GlobalStrategyMemory;
  learnedStyleSamples?: LearnedStyleSample[];
  recentSentComments?: string[];
}

export function createDefaultBudgetConfig(): ActionBudgetConfig {
  return {
    maxCommentsPerHour: 8,
    maxCommentsPerDay: 35,
    maxPostsPerGroupRun: 6,
    maxPostAgeHours: 24,
    dedupAuthorDays: 7,
    activeStartHour: 7,
    activeEndHour: 23,
    enableHumanWarmup: true,
    notifyHotLeadTelegram: true,
    hotLeadMinScore: 75,
  };
}

function getDateHourKeys(now = new Date()): { dateKey: string; hourKey: string } {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  return { dateKey: `${y}-${m}-${d}`, hourKey: `${y}-${m}-${d}-${h}` };
}

export function createDefaultBudgetState(now = new Date()): ActionBudgetState {
  const { dateKey, hourKey } = getDateHourKeys(now);
  return {
    dateKey,
    hourKey,
    commentsThisHour: 0,
    commentsToday: 0,
    lovesToday: 0,
    postsScannedToday: 0,
  };
}

export function createDefaultMachineKnowledge(): MachineF12KnowledgeBase {
  return {
    version: 4,
    machineSignature: {
      viewportW: 1366,
      viewportH: 768,
      lang: 'vi',
      dpr: 1,
      updatedAt: new Date().toISOString(),
    },
    roleProfiles: {},
    learnedGroups: [],
    workflows: [],
    totalDemosRecorded: 0,
    productKnowledgeBase: '',
    sellerBlacklist: [],
    recentAuthorEngagements: [],
    leadsCrm: [],
    budgetConfig: createDefaultBudgetConfig(),
    budgetState: createDefaultBudgetState(),
    autoPilot: {
      enabled: false,
      intervalMinutes: 30,
      groupsPerCycle: 2,
    },
  };
}

/**
 * Di trú an toàn 100% dữ liệu cũ (v3 -> v4): giữ nguyên toàn bộ roleProfiles, learnedGroups, workflows
 * đã lưu trước đó và chỉ điền mặc định cho các trường thông minh mới.
 */
export function normalizeMachineKnowledge(raw: any, now = new Date()): MachineF12KnowledgeBase {
  const def = createDefaultMachineKnowledge();
  if (!raw || typeof raw !== 'object') return def;

  const { dateKey, hourKey } = getDateHourKeys(now);
  const prevBudget = raw.budgetState || {};
  const budgetState: ActionBudgetState = {
    dateKey,
    hourKey,
    commentsThisHour: prevBudget.hourKey === hourKey ? Number(prevBudget.commentsThisHour) || 0 : 0,
    commentsToday: prevBudget.dateKey === dateKey ? Number(prevBudget.commentsToday) || 0 : 0,
    lovesToday: prevBudget.dateKey === dateKey ? Number(prevBudget.lovesToday) || 0 : 0,
    postsScannedToday: prevBudget.dateKey === dateKey ? Number(prevBudget.postsScannedToday) || 0 : 0,
  };

  return {
    ...def,
    ...raw,
    version: 4,
    machineSignature: { ...def.machineSignature, ...(raw.machineSignature || {}) },
    roleProfiles: raw.roleProfiles && typeof raw.roleProfiles === 'object' ? { ...raw.roleProfiles } : {},
    learnedGroups: Array.isArray(raw.learnedGroups) ? raw.learnedGroups.map((g: any) => ({ ...g })) : [],
    workflows: Array.isArray(raw.workflows) ? raw.workflows.map((w: any) => ({ ...w })) : [],
    totalDemosRecorded: Number(raw.totalDemosRecorded) || 0,
    productKnowledgeBase: typeof raw.productKnowledgeBase === 'string' ? raw.productKnowledgeBase : '',
    sellerBlacklist: Array.isArray(raw.sellerBlacklist) ? raw.sellerBlacklist : [],
    recentAuthorEngagements: Array.isArray(raw.recentAuthorEngagements) ? raw.recentAuthorEngagements : [],
    leadsCrm: Array.isArray(raw.leadsCrm) ? raw.leadsCrm : [],
    budgetConfig: { ...def.budgetConfig!, ...(raw.budgetConfig || {}) },
    budgetState,
    autoPilot: { ...def.autoPilot!, ...(raw.autoPilot || {}) },
    strategyMemory: raw.strategyMemory && typeof raw.strategyMemory === 'object' ? { ...raw.strategyMemory } : undefined,
    learnedStyleSamples: Array.isArray(raw.learnedStyleSamples) ? raw.learnedStyleSamples.slice(0, 30) : [],
    recentSentComments: Array.isArray(raw.recentSentComments) ? raw.recentSentComments.slice(0, 50) : [],
  };
}

function normalizeLabelCore(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(dưới tên|với tư cách|comment as|reply to|trả lời)\s+.+$/i, '$1')
    .trim();
}

function isReactionStatsFingerprint(fp?: Partial<F12ElementFingerprint>): boolean {
  if (!fp) return false;
  const joined = `${fp.ariaLabel || ''} ${fp.childAria || ''} ${fp.text || ''}`.trim();
  return /:\s*\d|\d+\s*(người|people|bình luận|comment|chia sẻ|share)|xem ai|see who|tất cả cảm xúc|all reactions|lượt thích/i.test(
    joined
  );
}

/**
 * Tự động phân loại hành động người dùng vừa thao tác thuộc vai trò MXH nào
 * (hỗ trợ toàn bộ tác vụ MXH: tương tác bài, đăng bài, kết bạn, nhắn tin Messenger, tham gia nhóm, tìm kiếm...).
 */
export function classifyRecordedActionIntent(
  stepType: RecordedStepType,
  fp?: Partial<F12ElementFingerprint>,
  url = ''
): LearnedTargetRole {
  if (!fp) return 'custom';
  const aria = `${fp.ariaLabel || ''} ${fp.childAria || ''}`.toLowerCase().trim();
  const txt = (fp.text || '').toLowerCase().trim();
  const ph = (fp.placeholder || '').toLowerCase().trim();
  const adRole = (fp.adRenderingRole || '').toLowerCase().trim();
  const urlLower = (url || '').toLowerCase();
  const all = `${aria} ${txt} ${ph}`.trim();
  const isMessenger = /\/messages\/|messenger\.com/i.test(urlLower) || /tin nhắn|message|messenger/i.test(aria);

  if (stepType === 'input' || fp.contentEditable || fp.role === 'textbox' || fp.tag === 'textarea' || fp.tag === 'input') {
    if (/tìm kiếm|search/i.test(all) || fp.inputType === 'search') return 'search_input';
    if (isMessenger || /nhắn tin|nhập tin nhắn|aa|message/i.test(all)) return 'messenger_editor';
    if (/trả lời|reply/i.test(all) || fp.containerKind === 'comment') return 'reply_editor';
    if (/bạn đang nghĩ gì|bạn viết gì đi|tạo bài viết công khai|create a public post|write something/i.test(all)) {
      return 'create_post_editor';
    }
    if (/viết bình luận|bình luận|comment/i.test(all)) return 'comment_editor';
    if (fp.containerKind === 'dialog' && fp.contentEditable) return 'create_post_editor';
  }

  if (adRole === 'like_button') return 'like_btn';
  if (adRole === 'comment_button') return 'comment_trigger';
  if (adRole === 'share_button') return 'share_btn';

  if (/^(yêu thích|love)$/i.test(aria) || /^(yêu thích|love)$/i.test(txt)) return 'love_btn';
  if (!isReactionStatsFingerprint(fp) && (/^(thích|like|bày tỏ cảm xúc|thả cảm xúc|react)$/i.test(aria) || /^(thích|like)$/i.test(txt))) {
    return 'like_btn';
  }
  if (/^(trả lời|reply)$/i.test(txt) || /^(trả lời|reply)\b/i.test(aria)) return 'reply_btn';
  if (/^(bình luận|đăng bình luận|gửi|comment|post comment|send)$/i.test(aria) && fp.ancestorRoles?.includes('form')) {
    return isMessenger ? 'messenger_send' : 'comment_submit';
  }
  if (/nhấn enter để gửi|gửi tin nhắn|press enter to send/i.test(all)) return 'messenger_send';
  if (/^(viết bình luận|bình luận|để lại bình luận|comment)$/i.test(txt) || /viết bình luận|leave a comment/i.test(aria)) {
    return 'comment_trigger';
  }
  if (/^(chia sẻ|share)$/i.test(txt) || /^(chia sẻ|share)\b/i.test(aria)) return 'share_btn';
  if (/bạn viết gì đi|bạn đang nghĩ gì|tạo bài viết|write something|what's on your mind/i.test(all)) {
    return 'create_post_trigger';
  }
  if (/^(đăng|post)$/i.test(txt) || /^(đăng|post)$/i.test(aria)) return 'create_post_submit';
  if (/thêm bạn bè|kết bạn|add friend/i.test(all)) return 'add_friend_btn';
  if (/^(nhắn tin|message)$/i.test(txt) || /^(nhắn tin|message)\b/i.test(aria)) return 'message_btn';
  if (/tham gia nhóm|join group/i.test(all)) return 'join_group_btn';

  return 'custom';
}

/**
 * Chấm điểm tương đồng giữa 1 phần tử DOM hiện tại và mẫu F12 đã học từ chính máy người dùng.
 * Kháng lại class hash ngẫu nhiên của Facebook, kết hợp ngữ nghĩa + đường dẫn tương đối + vị trí màn hình.
 */
export function scoreCandidateAgainstFingerprint(
  candidate: Partial<F12ElementFingerprint>,
  learned: Partial<F12ElementFingerprint>
): number {
  if (!candidate || !learned) return 0;

  // Chặn tuyệt đối bẫy nút thống kê ("Thích: 364 người") nếu mẫu đã học không phải stats badge
  if (!isReactionStatsFingerprint(learned) && isReactionStatsFingerprint(candidate)) {
    return -100;
  }

  // Không khớp giữa nút bấm và ô nhập nếu contentEditable khác biệt lớn khi đang tìm textbox
  if (learned.contentEditable && !candidate.contentEditable && candidate.tag !== 'input' && candidate.tag !== 'textarea') {
    return -25;
  }

  let score = 0;

  // 1. Thuộc tính ngữ nghĩa bền vững nhất của Facebook
  if (learned.adRenderingRole && candidate.adRenderingRole && learned.adRenderingRole === candidate.adRenderingRole) {
    score += 55;
  }
  if (learned.testId && candidate.testId && learned.testId === candidate.testId) {
    score += 50;
  }
  if (learned.name && candidate.name && learned.name === candidate.name) {
    score += 35;
  }

  // 2. Aria-label (khớp chính xác hoặc khớp lõi sau khi bỏ tên nick)
  const lAria = (learned.ariaLabel || '').trim().toLowerCase();
  const cAria = (candidate.ariaLabel || '').trim().toLowerCase();
  if (lAria && cAria) {
    if (lAria === cAria) {
      score += 48;
    } else {
      const lCore = normalizeLabelCore(lAria);
      const cCore = normalizeLabelCore(cAria);
      if (lCore.length >= 3 && (lCore === cCore || cCore.includes(lCore) || lCore.includes(cCore))) {
        score += 34;
      }
    }
  }

  // 3. Text hiển thị & Placeholder
  const lTxt = (learned.text || '').trim().toLowerCase();
  const cTxt = (candidate.text || '').trim().toLowerCase();
  if (lTxt && cTxt) {
    if (lTxt === cTxt) {
      score += 36;
    } else if (lTxt.length >= 3 && (cTxt.includes(lTxt) || lTxt.includes(cTxt))) {
      score += 18;
    }
  }

  const lPh = (learned.placeholder || '').trim().toLowerCase();
  const cPh = (candidate.placeholder || '').trim().toLowerCase();
  if (lPh && cPh && (lPh === cPh || cPh.includes(lPh) || lPh.includes(cPh))) {
    score += 30;
  }

  // 4. Tag, Role, Editable, HrefPattern
  if (learned.role && candidate.role && learned.role === candidate.role) score += 14;
  if (learned.tag && candidate.tag && learned.tag === candidate.tag) score += 8;
  if (learned.contentEditable && candidate.contentEditable) score += 16;
  if (learned.hrefPattern && candidate.hrefPattern && learned.hrefPattern === candidate.hrefPattern) score += 22;

  // 5. Ngữ cảnh cấu trúc F12 (Container + Ancestor Roles + DOM Path)
  if (learned.containerKind && candidate.containerKind && learned.containerKind === candidate.containerKind) {
    score += 10;
  }
  if (Array.isArray(learned.ancestorRoles) && Array.isArray(candidate.ancestorRoles) && learned.ancestorRoles.length > 0) {
    const overlap = learned.ancestorRoles.filter((r) => candidate.ancestorRoles!.includes(r)).length;
    score += Math.min(12, overlap * 4);
  }
  if (learned.domPath && candidate.domPath && learned.domPath === candidate.domPath) {
    score += 20;
  }

  // 6. Tọa độ tương đối trên khung bài viết / màn hình của riêng máy người dùng
  if (learned.cardRelPos && candidate.cardRelPos) {
    const dist = Math.hypot(learned.cardRelPos.rx - candidate.cardRelPos.rx, learned.cardRelPos.ry - candidate.cardRelPos.ry);
    if (dist < 0.08) score += 18;
    else if (dist < 0.18) score += 10;
  } else if (learned.relPos && candidate.relPos) {
    const dist = Math.hypot(learned.relPos.rx - candidate.relPos.rx, learned.relPos.ry - candidate.relPos.ry);
    if (dist < 0.08) score += 14;
    else if (dist < 0.18) score += 7;
  }

  return score;
}

/**
 * Lưu thêm mẫu F12 mới cho 1 vai trò (tự chống trùng, giữ tối đa 5 mẫu mới nhất cho từng loại nút/ô).
 */
export function upsertLearnedRoleProfile(
  kb: MachineF12KnowledgeBase | undefined,
  role: LearnedTargetRole,
  fp: F12ElementFingerprint
): MachineF12KnowledgeBase {
  const base: MachineF12KnowledgeBase = kb
    ? {
        ...kb,
        roleProfiles: { ...(kb.roleProfiles || {}) },
        learnedGroups: [...(kb.learnedGroups || [])],
        workflows: [...(kb.workflows || [])],
      }
    : createDefaultMachineKnowledge();

  if (!role || role === 'custom') return base;

  const existing = [...(base.roleProfiles[role] || [])];
  const dedupSig = `${fp.adRenderingRole}|${fp.ariaLabel}|${fp.text}|${fp.domPath}|${fp.containerKind}`;
  const filtered = existing.filter(
    (item) => `${item.adRenderingRole}|${item.ariaLabel}|${item.text}|${item.domPath}|${item.containerKind}` !== dedupSig
  );
  filtered.unshift({ ...fp, learnedAt: new Date().toISOString() });
  if (filtered.length > 5) filtered.length = 5;

  base.roleProfiles[role] = filtered;
  if (fp.viewport?.w && fp.viewport?.h) {
    base.machineSignature = {
      ...base.machineSignature,
      viewportW: fp.viewport.w,
      viewportH: fp.viewport.h,
      updatedAt: new Date().toISOString(),
    };
  }
  return base;
}

/**
 * Tự động ghi nhận đường dẫn Group / Page / Profile / Messenger người dùng ghé qua khi làm mẫu.
 */
export function upsertLearnedGroup(
  kb: MachineF12KnowledgeBase | undefined,
  rawUrl: string,
  pageTitle = '',
  extraTag?: string
): MachineF12KnowledgeBase {
  const base: MachineF12KnowledgeBase = kb
    ? {
        ...kb,
        roleProfiles: { ...(kb.roleProfiles || {}) },
        learnedGroups: [...(kb.learnedGroups || [])],
        workflows: [...(kb.workflows || [])],
      }
    : createDefaultMachineKnowledge();

  const classified = classifyFacebookTargetUrl(rawUrl, false);
  if (classified.kind === 'invalid') return base;

  const now = new Date().toISOString();
  const cleanTitle = (pageTitle || '')
    .replace(/^\(\d+\+?\)\s*/, '')
    .replace(/\s*\|\s*Facebook\s*$/i, '')
    .trim();

  let itemKind: LearnedGroupItem['kind'] = 'other';
  let canonicalUrl = classified.cleanUrl;
  let id = '';

  if (classified.groupId) {
    itemKind = classified.kind === 'post' ? 'group_feed' : 'group_feed';
    canonicalUrl = `https://www.facebook.com/groups/${classified.groupId}/`;
    id = `group_${classified.groupId}`;
  } else if (/\/messages\//i.test(classified.cleanUrl)) {
    itemKind = 'messenger';
    id = `msg_${buildPostDedupKey(classified.cleanUrl, 'messenger', cleanTitle)}`;
  } else if (classified.kind === 'post') {
    itemKind = 'post';
    id = `post_${buildPostDedupKey(classified.cleanUrl, 'post', cleanTitle)}`;
  } else {
    itemKind = /profile\.php/i.test(classified.cleanUrl) ? 'profile' : 'page';
    id = `fb_${buildPostDedupKey(classified.cleanUrl, itemKind, cleanTitle)}`;
  }

  const idx = base.learnedGroups.findIndex((g) => g.id === id || g.url === canonicalUrl);
  if (idx >= 0) {
    const prev = base.learnedGroups[idx];
    const nextTags = extraTag && !prev.tags.includes(extraTag) ? [...prev.tags, extraTag] : prev.tags;
    base.learnedGroups[idx] = {
      ...prev,
      name: cleanTitle && cleanTitle !== 'Facebook' ? cleanTitle.slice(0, 90) : prev.name,
      lastVisitedAt: now,
      visitCount: (prev.visitCount || 1) + 1,
      tags: nextTags,
    };
  } else {
    base.learnedGroups.unshift({
      id,
      url: canonicalUrl,
      name: (cleanTitle && cleanTitle !== 'Facebook' ? cleanTitle : classified.groupId || canonicalUrl).slice(0, 90),
      kind: itemKind,
      addedAt: now,
      lastVisitedAt: now,
      visitCount: 1,
      tags: extraTag ? [extraTag] : [],
    });
    if (base.learnedGroups.length > 150) base.learnedGroups.length = 150;
  }

  return base;
}

/**
 * Dọn gọn chuỗi thao tác ghi mẫu (gộp gõ phím liên tiếp, gộp cuộn liên tiếp, chuẩn hóa delay hợp lý).
 */
export function compactRecordedSteps(rawSteps: RecordedActionStep[]): RecordedActionStep[] {
  const out: RecordedActionStep[] = [];
  for (const step of rawSteps || []) {
    if (!step || !step.type) continue;
    const prev = out[out.length - 1];

    // Gộp nhiều lần gõ vào cùng 1 ô nhập liệu thành 1 bước input sạch với nội dung cuối cùng
    if (
      prev &&
      prev.type === 'input' &&
      step.type === 'input' &&
      prev.fingerprint?.domPath &&
      prev.fingerprint.domPath === step.fingerprint?.domPath
    ) {
      prev.value = step.value;
      prev.label = step.label;
      prev.timestamp = step.timestamp;
      continue;
    }

    // Gộp các bước cuộn liên tiếp
    if (prev && prev.type === 'scroll' && step.type === 'scroll' && Math.abs((step.timestamp || 0) - (prev.timestamp || 0)) < 2500) {
      prev.scrollDeltaY = (prev.scrollDeltaY || 0) + (step.scrollDeltaY || 0);
      prev.label = `Cuộn trang ${prev.scrollDeltaY > 0 ? '+' : ''}${Math.round(prev.scrollDeltaY)}px`;
      prev.timestamp = step.timestamp;
      continue;
    }

    // Tránh ghi trùng 2 bước navigate cùng URL liên tiếp
    if (prev && prev.type === 'navigate' && step.type === 'navigate' && prev.url === step.url) {
      continue;
    }

    const boundedDelay = Math.max(400, Math.min(8000, Number(step.delayMs) || 1000));
    out.push({ ...step, delayMs: boundedDelay });
  }
  return out;
}

/**
 * Áp dụng 1 Kịch Bản Làm Mẫu sang 1 Group/Link đích khác (tự thay bước navigate đầu tiên nếu cần).
 */
export function buildReplayWorkflowPlan(
  workflow: RecordedSocialWorkflow,
  overrideTargetUrl?: string
): RecordedActionStep[] {
  const steps = (workflow?.steps || []).map((s) => ({ ...s }));
  if (!overrideTargetUrl || !overrideTargetUrl.trim()) return steps;

  const cleanTarget = classifyFacebookTargetUrl(overrideTargetUrl, false).navigateUrl || overrideTargetUrl.trim();
  const navIdx = steps.findIndex((s) => s.type === 'navigate');
  if (navIdx >= 0) {
    steps[navIdx] = {
      ...steps[navIdx],
      url: cleanTarget,
      label: `Mở đích: ${cleanTarget}`,
    };
  } else {
    steps.unshift({
      id: `nav_override_${Date.now()}`,
      type: 'navigate',
      intent: 'custom',
      label: `Mở đích: ${cleanTarget}`,
      url: cleanTarget,
      pageTitle: '',
      delayMs: 1200,
      timestamp: Date.now(),
    });
  }
  return steps;
}

// ============================================================================
// 10. SMART GROUP MINING CORE (LEAD SCORING, BLACKLIST, DEDUP, ROI, BUDGET)
// ============================================================================

export function makeIdentityKey(uid?: string, name?: string): string {
  const cleanUid = String(uid || '').replace(/[^0-9]/g, '');
  if (cleanUid.length >= 6) return `uid_${cleanUid}`;
  const cleanName = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (cleanName.length < 3 || /^(thanh vien|nguoi dung|member|anonymous|nguoi tham gia an danh)/.test(cleanName)) {
    return '';
  }
  return `name_${cleanName}`;
}

/**
 * Chuyển chuỗi thời gian tương đối của Facebook ("5 phút", "2 giờ", "1 ngày", "3h", "Just now") sang số phút.
 */
export function parseVietnameseRelativeAgeMinutes(timeText: string): number | null {
  const raw = String(timeText || '').trim().toLowerCase();
  if (!raw) return null;
  if (/vừa xong|just now|now|vài giây|few seconds/.test(raw)) return 1;

  const mMin = raw.match(/(\d+)\s*(?:phút|phut|min|mins|minute|minutes|m\b)/);
  if (mMin) return Number(mMin[1]);

  const mHour = raw.match(/(\d+)\s*(?:giờ|gio|hr|hrs|hour|hours|h\b)/);
  if (mHour) return Number(mHour[1]) * 60;

  if (/hôm qua|yesterday/.test(raw)) return 24 * 60;

  const mDay = raw.match(/(\d+)\s*(?:ngày|ngay|day|days|d\b)/);
  if (mDay) return Number(mDay[1]) * 24 * 60;

  const mWeek = raw.match(/(\d+)\s*(?:tuần|tuan|week|weeks|w\b)/);
  if (mWeek) return Number(mWeek[1]) * 7 * 24 * 60;

  return null;
}

export interface LeadHotnessScore {
  score: number;
  temperature: 'hot' | 'warm' | 'cold';
  reasons: string[];
}

/**
 * Chấm điểm độ nóng của Lead (0–100đ) để ưu tiên tương tác & bắn cảnh báo Telegram tức thì.
 */
export function scoreLeadHotness(
  analysis: ThreadAnalysisResult,
  input: Partial<ThreadReadInput>,
  hotMinScore = 75
): LeadHotnessScore {
  if (analysis.postAuthorRole === 'seller') {
    const hotBuyerCmt = (analysis.commentEvaluations || []).find((c) => c.role === 'buyer' && c.shouldEngage);
    if (!hotBuyerCmt) {
      return { score: 0, temperature: 'cold', reasons: ['Chủ bài là người bán & không có khách hỏi'] };
    }
    return scoreSingleTextLead(hotBuyerCmt.text, input.postAgeMinutes, hotMinScore, ['Khách hỏi dưới bài người bán']);
  }

  const baseReasons: string[] = [];
  let bonus = 0;
  if (analysis.postAuthorRole === 'buyer') {
    bonus += 32;
    baseReasons.push('Chủ bài viết đang có nhu cầu');
  } else if (analysis.shouldCommentPost) {
    bonus += 16;
  }

  const buyerCommentsCount = (analysis.commentEvaluations || []).filter((c) => c.role === 'buyer' && c.shouldEngage).length;
  if (buyerCommentsCount > 0) {
    bonus += Math.min(14, buyerCommentsCount * 7);
    baseReasons.push(`${buyerCommentsCount} người hỏi thêm ở bình luận`);
  }

  const textRes = scoreSingleTextLead(input.postText || analysis.topicSummary || '', input.postAgeMinutes, hotMinScore, baseReasons, bonus);
  return textRes;
}

function scoreSingleTextLead(
  rawText: string,
  postAgeMinutes: number | undefined,
  hotMinScore: number,
  seedReasons: string[] = [],
  baseBonus = 25
): LeadHotnessScore {
  const clean = (rawText || '').toLowerCase();
  const reasons = [...seedReasons];
  let score = baseBonus;

  if (
    /tuyển\s*(?:freelancer|editor|dựng|làm\s*video|làm\s*phim|ai|intern|thực\s*tập)|cần\s*(?:tìm|người\s*dựng|dựng\s*video|làm\s*video|làm\s*phim|booking|team|hỗ\s*trợ)|job\s*(?:ai|phim|video|dựng)/.test(
      clean
    )
  ) {
    score += 24;
    reasons.push('Nhu cầu tuyển Job / Dự án AI rõ ràng');
  }
  if (/(\d+(?:[.,]\d+)?\s*(?:tr|triệu|k|usd|\$|m\b))|ngân sách|budget|lương|thù lao|catse|báo giá/.test(clean)) {
    score += 18;
    reasons.push('Có ngân sách / thù lao cụ thể');
  }
  if (/gấp|ngay|deadline|tuần này|trong tuần|hôm nay|gửi\s*(?:showreel|portfolio|cv)|nhận\s*brief/.test(clean)) {
    score += 14;
    reasons.push('Có deadline / yêu cầu gửi Showreel-Brief ngay');
  }
  if (
    /phim\s*ai|video\s*ai|tvc\s*ai|mv\s*ai|dựng\s*phim|hoạt\s*hình|veo|kling|runway|sora|hailuo|comfyui|midjourney|flux|vfx|storyboard|lip\s*sync|automation|n8n|agent|đồ\s*án/.test(
      clean
    )
  ) {
    score += 12;
    reasons.push('Đúng chuyên môn AI / Dựng phim AI / Đồ án');
  }
  if (/inbox|ib\b|zalo|tele|email|liên hệ|trao đổi|hướng dẫn|tư vấn/.test(clean)) {
    score += 8;
    reasons.push('Chủ động chờ kết nối/inbox');
  }
  if (typeof postAgeMinutes === 'number' && postAgeMinutes >= 0 && postAgeMinutes <= 120) {
    score += 12;
    reasons.push(`Bài siêu mới (${Math.round(postAgeMinutes)}p)`);
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const temperature: 'hot' | 'warm' | 'cold' =
    finalScore >= hotMinScore ? 'hot' : finalScore >= 45 ? 'warm' : 'cold';
  return { score: finalScore, temperature, reasons };
}

export function isBlacklistedSeller(
  kb: MachineF12KnowledgeBase | undefined,
  uid?: string,
  name?: string
): boolean {
  const list = kb?.sellerBlacklist || [];
  if (list.length === 0) return false;
  const uidKey = uid ? makeIdentityKey(uid, '') : '';
  const nameKey = name ? makeIdentityKey('', name) : '';
  return list.some(
    (e) =>
      (uidKey && (e.key === uidKey || (e.uid && makeIdentityKey(e.uid, '') === uidKey))) ||
      (nameKey && (e.key === nameKey || makeIdentityKey('', e.name) === nameKey))
  );
}

export function addSellerToBlacklist(
  kb: MachineF12KnowledgeBase | undefined,
  entry: { uid?: string; name: string; reason: string }
): MachineF12KnowledgeBase {
  const base = normalizeMachineKnowledge(kb);
  const key = makeIdentityKey(entry.uid, entry.name);
  if (!key) return base;
  const filtered = (base.sellerBlacklist || []).filter((e) => e.key !== key);
  filtered.unshift({
    key,
    uid: entry.uid,
    name: (entry.name || 'Nick rao bán / Spam').slice(0, 80),
    reason: (entry.reason || 'Rao bán acc/khóa học hoặc spam dịch vụ').slice(0, 120),
    addedAt: new Date().toISOString(),
  });
  if (filtered.length > 600) filtered.length = 600;
  base.sellerBlacklist = filtered;
  return base;
}

export function hasRecentlyEngagedAuthor(
  kb: MachineF12KnowledgeBase | undefined,
  uid?: string,
  name?: string,
  dedupDays = 7,
  nowMs = Date.now()
): boolean {
  if (dedupDays <= 0) return false;
  const list = kb?.recentAuthorEngagements || [];
  if (list.length === 0) return false;
  const cutoff = nowMs - dedupDays * 24 * 60 * 60 * 1000;
  const uidKey = uid ? makeIdentityKey(uid, '') : '';
  const nameKey = name ? makeIdentityKey('', name) : '';
  return list.some((rec) => {
    const ts = Date.parse(rec.engagedAt);
    if (!Number.isFinite(ts) || ts < cutoff) return false;
    return (
      (uidKey && (rec.key === uidKey || (rec.uid && makeIdentityKey(rec.uid, '') === uidKey))) ||
      (nameKey && (rec.key === nameKey || makeIdentityKey('', rec.name) === nameKey))
    );
  });
}

export function recordAuthorEngagement(
  kb: MachineF12KnowledgeBase | undefined,
  rec: { uid?: string; name: string; groupId?: string; postUrl: string }
): MachineF12KnowledgeBase {
  const base = normalizeMachineKnowledge(kb);
  const key = makeIdentityKey(rec.uid, rec.name);
  if (!key) return base;
  const filtered = (base.recentAuthorEngagements || []).filter((e) => e.key !== key);
  filtered.unshift({
    key,
    uid: rec.uid,
    name: (rec.name || '').slice(0, 80),
    groupId: rec.groupId,
    postUrl: rec.postUrl,
    engagedAt: new Date().toISOString(),
  });
  if (filtered.length > 500) filtered.length = 500;
  base.recentAuthorEngagements = filtered;
  return base;
}

export function checkActionBudget(
  kb: MachineF12KnowledgeBase | undefined,
  now = new Date()
): { allowed: boolean; reason?: string; state: ActionBudgetState; config: ActionBudgetConfig } {
  const norm = normalizeMachineKnowledge(kb, now);
  const cfg = norm.budgetConfig || createDefaultBudgetConfig();
  const { dateKey, hourKey } = getDateHourKeys(now);
  const st: ActionBudgetState = {
    dateKey,
    hourKey,
    commentsThisHour: norm.budgetState?.hourKey === hourKey ? norm.budgetState.commentsThisHour : 0,
    commentsToday: norm.budgetState?.dateKey === dateKey ? norm.budgetState.commentsToday : 0,
    lovesToday: norm.budgetState?.dateKey === dateKey ? norm.budgetState.lovesToday : 0,
    postsScannedToday: norm.budgetState?.dateKey === dateKey ? norm.budgetState.postsScannedToday : 0,
  };

  const hour = now.getHours();
  const startH = Number(cfg.activeStartHour ?? 7);
  const endH = Number(cfg.activeEndHour ?? 23);
  const inActiveWindow = startH <= endH ? hour >= startH && hour <= endH : hour >= startH || hour <= endH;
  if (!inActiveWindow) {
    return {
      allowed: false,
      reason: `Đang ngoài khung giờ hoạt động an toàn (${startH}h–${endH}h).`,
      state: st,
      config: cfg,
    };
  }
  if (st.commentsThisHour >= cfg.maxCommentsPerHour) {
    return {
      allowed: false,
      reason: `Đã đạt hạn mức an toàn ${st.commentsThisHour}/${cfg.maxCommentsPerHour} bình luận trong giờ này.`,
      state: st,
      config: cfg,
    };
  }
  if (st.commentsToday >= cfg.maxCommentsPerDay) {
    return {
      allowed: false,
      reason: `Đã đạt hạn mức an toàn ${st.commentsToday}/${cfg.maxCommentsPerDay} bình luận hôm nay.`,
      state: st,
      config: cfg,
    };
  }
  return { allowed: true, state: st, config: cfg };
}

export function recordBudgetUsage(
  kb: MachineF12KnowledgeBase | undefined,
  delta: { comments?: number; loves?: number; postsScanned?: number },
  now = new Date()
): MachineF12KnowledgeBase {
  const base = normalizeMachineKnowledge(kb, now);
  const { dateKey, hourKey } = getDateHourKeys(now);
  const prev = base.budgetState || createDefaultBudgetState(now);
  base.budgetState = {
    dateKey,
    hourKey,
    commentsThisHour: (prev.hourKey === hourKey ? prev.commentsThisHour : 0) + (delta.comments || 0),
    commentsToday: (prev.dateKey === dateKey ? prev.commentsToday : 0) + (delta.comments || 0),
    lovesToday: (prev.dateKey === dateKey ? prev.lovesToday : 0) + (delta.loves || 0),
    postsScannedToday: (prev.dateKey === dateKey ? prev.postsScannedToday : 0) + (delta.postsScanned || 0),
  };
  return base;
}

/**
 * Cập nhật điểm chất lượng ROI & tự phân hạng Tier A / B / C cho từng Group Facebook.
 */
export function updateGroupRoiStats(
  kb: MachineF12KnowledgeBase | undefined,
  groupUrlOrId: string,
  delta: { postsScanned?: number; hotLeads?: number; warmLeads?: number; sellersSkipped?: number; commentsSent?: number }
): MachineF12KnowledgeBase {
  const base = normalizeMachineKnowledge(kb);
  const classified = classifyFacebookTargetUrl(groupUrlOrId, false);
  const targetId = classified.groupId ? `group_${classified.groupId}` : groupUrlOrId;

  const idx = base.learnedGroups.findIndex(
    (g) => g.id === targetId || (classified.groupId && g.url.includes(`/groups/${classified.groupId}`))
  );
  if (idx < 0) return base;

  const g = { ...base.learnedGroups[idx] };
  g.postsScanned = (g.postsScanned || 0) + (delta.postsScanned || 0);
  g.hotLeadsFound = (g.hotLeadsFound || 0) + (delta.hotLeads || 0);
  g.warmLeadsFound = (g.warmLeadsFound || 0) + (delta.warmLeads || 0);
  g.sellersSkipped = (g.sellersSkipped || 0) + (delta.sellersSkipped || 0);
  g.commentsSent = (g.commentsSent || 0) + (delta.commentsSent || 0);
  g.lastScannedAt = new Date().toISOString();

  const total = Math.max(1, g.postsScanned);
  const weightedLeads = g.hotLeadsFound * 2 + g.warmLeadsFound;
  const sellerRatio = g.sellersSkipped / total;
  const rawScore = Math.round(Math.min(100, (weightedLeads / total) * 85 + 25 - sellerRatio * 35));
  g.roiScore = Math.max(0, Math.min(100, rawScore));
  g.tier = g.roiScore >= 65 ? 'A' : g.roiScore >= 35 ? 'B' : 'C';

  base.learnedGroups[idx] = g;
  return base;
}

/**
 * Chọn các Group đến hạn quét tiếp theo theo xếp hạng Tier A (ưu tiên) -> B -> C & thời gian chưa quét lâu nhất.
 */
export function pickNextScheduledGroups(
  kb: MachineF12KnowledgeBase | undefined,
  count = 2,
  nowMs = Date.now()
): LearnedGroupItem[] {
  const norm = normalizeMachineKnowledge(kb);
  const groupOnly = (norm.learnedGroups || []).filter((g) => g.kind === 'group_feed');
  if (groupOnly.length === 0) return [];

  const tierCooldownMin: Record<'A' | 'B' | 'C', number> = { A: 20, B: 60, C: 180 };
  const tierWeight: Record<'A' | 'B' | 'C', number> = { A: 30, B: 15, C: 0 };

  const scored = groupOnly.map((g) => {
    const tier = g.tier || 'B';
    const lastMs = g.lastScannedAt ? Date.parse(g.lastScannedAt) : 0;
    const elapsedMin = lastMs ? (nowMs - lastMs) / 60000 : 9999;
    const overdue = elapsedMin >= tierCooldownMin[tier] ? 50 : 0;
    const priority = overdue + tierWeight[tier] + Math.min(40, elapsedMin / 5) + ((g.roiScore ?? 50) / 5);
    return { g, priority };
  });

  scored.sort((a, b) => b.priority - a.priority);
  return scored.slice(0, Math.max(1, count)).map((x) => x.g);
}

export function upsertLeadCrmItem(
  kb: MachineF12KnowledgeBase | undefined,
  item: LeadCrmItem
): MachineF12KnowledgeBase {
  const base = normalizeMachineKnowledge(kb);
  const existing = [...(base.leadsCrm || [])];
  const idx = existing.findIndex((l) => l.id === item.id || (l.postUrl === item.postUrl && l.author === item.author));
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...item };
  } else {
    existing.unshift(item);
  }
  if (existing.length > 250) existing.length = 250;
  base.leadsCrm = existing;
  return base;
}

// ============================================================================
// 11. AI STRATEGY COACH & GROUP-ADAPTIVE PLAYBOOK ENGINE (v4.1)
//     (KHÔNG chạy lặp máy móc y chang kịch bản mẫu — AI nhận xét cách làm việc,
//      phân tích văn hóa & tệp từng Group, rút chiến lược và tự tùy biến khi chạy)
// ============================================================================

function parseJsonObjectSafe(rawText: string): any | null {
  try {
    const cleaned = String(rawText || '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function cleanStringList(arr: any, max = 6): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const s = String(item || '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Tìm Group đã lưu theo ID hoặc URL (khớp linh hoạt /groups/<id> hoặc URL chuẩn).
 */
export function findLearnedGroupByUrl(
  kb: MachineF12KnowledgeBase | undefined,
  urlOrId: string
): LearnedGroupItem | undefined {
  if (!urlOrId) return undefined;
  const norm = normalizeMachineKnowledge(kb);
  const clean = String(urlOrId).trim();
  const classified = classifyFacebookTargetUrl(clean, false);
  const targetGroupId = classified.groupId ? `group_${classified.groupId}` : '';

  return (norm.learnedGroups || []).find(
    (g) =>
      g.id === clean ||
      (targetGroupId && g.id === targetGroupId) ||
      (classified.groupId && g.url.includes(`/groups/${classified.groupId}`)) ||
      g.url.split('?')[0].replace(/\/+$/, '') === clean.split('?')[0].replace(/\/+$/, '')
  );
}

/**
 * Tự động lưu trích đoạn bài viết thực tế của từng Group (tối đa 8 mẫu ngắn/Group)
 * để AI đọc hiểu đúng văn hóa & tệp khách hàng của từng Group riêng biệt.
 */
export function appendGroupSampleSnippet(
  kb: MachineF12KnowledgeBase | undefined,
  groupUrlOrId: string,
  snippet: string,
  groupTitle?: string
): MachineF12KnowledgeBase {
  let base = normalizeMachineKnowledge(kb);
  const cleanSnippet = String(snippet || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  if (cleanSnippet.length < 18) return base;

  let existing = findLearnedGroupByUrl(base, groupUrlOrId);
  if (!existing && /facebook\.com/i.test(groupUrlOrId)) {
    base = upsertLearnedGroup(base, groupUrlOrId, groupTitle || '', 'auto_sample');
    existing = findLearnedGroupByUrl(base, groupUrlOrId);
  }
  if (!existing) return base;

  const idx = base.learnedGroups.findIndex((g) => g.id === existing!.id);
  if (idx < 0) return base;

  const g = { ...base.learnedGroups[idx] };
  const prev = Array.isArray(g.sampleSnippets) ? [...g.sampleSnippets] : [];
  const normKey = cleanSnippet.slice(0, 60).toLowerCase();
  if (!prev.some((p) => p.slice(0, 60).toLowerCase() === normKey)) {
    prev.unshift(cleanSnippet);
    if (prev.length > 8) prev.length = 8;
    g.sampleSnippets = prev;
    base.learnedGroups[idx] = g;
  }
  return base;
}

/**
 * Phân tích & nhận xét bản làm mẫu của người dùng (Offline Coach fallback thông minh).
 */
export function analyzeDemoOffline(
  input: { name?: string; category?: string; steps: RecordedActionStep[] },
  kb?: MachineF12KnowledgeBase
): WorkflowStrategyReview {
  const steps = Array.isArray(input.steps) ? input.steps : [];
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const improvements: string[] = [];

  const clickSteps = steps.filter((s) => s.type === 'click');
  const inputSteps = steps.filter((s) => s.type === 'input');
  const navSteps = steps.filter((s) => s.type === 'navigate');
  const scrollSteps = steps.filter((s) => s.type === 'scroll');

  const hasWarmupReaction = clickSteps.some((s) => s.intent === 'like_btn' || s.intent === 'love_btn');
  const hasCommentOrPost = inputSteps.some(
    (s) => s.intent === 'comment_editor' || s.intent === 'reply_editor' || s.intent === 'create_post_editor'
  );
  const staticInputs = inputSteps.filter((s) => {
    const v = String(s.value || '').trim();
    return v.length > 0 && !v.includes('{{AI}}') && !/\{[^{}|]+\|[^{}]+\}/.test(v);
  });
  const avgDelay =
    steps.length > 1 ? steps.reduce((acc, s) => acc + (Number(s.delayMs) || 800), 0) / steps.length : 1200;

  let score = 68;

  if (hasWarmupReaction) {
    score += 10;
    strengths.push('Có bước thả cảm xúc (Like/Tim) tạo thiện cảm trước khi tương tác sâu.');
  } else if (hasCommentOrPost) {
    score -= 6;
    weaknesses.push('Đi thẳng vào bình luận/đăng bài mà chưa có tương tác mồi (đọc bài/thả tim) nên dễ giống hành vi spam.');
    improvements.push('Nên lướt đọc bài 2–4 giây và thả tim khách thật trước khi bình luận.');
  }

  if (scrollSteps.length > 0) {
    score += 6;
    strengths.push('Có nhịp cuộn trang giống người thật giúp Facebook đánh giá phiên hoạt động tự nhiên.');
  } else if (steps.length >= 3) {
    improvements.push('Bổ sung bước lướt/đọc bài trước khi thao tác để tăng độ tin cậy tài khoản.');
  }

  if (staticInputs.length > 0) {
    score -= 10;
    weaknesses.push(
      `Có ${staticInputs.length} câu gõ cố định ("${String(staticInputs[0].value || '').slice(0, 36)}...") — nếu lặp y chang qua nhiều Group sẽ giảm hiệu quả và dễ bị lọc spam.`
    );
    improvements.push('Bật chế độ "Chạy AI Tùy Biến" để AI tự đổi giọng văn & nội dung theo đúng tệp từng Group thay vì dán nguyên câu cũ.');
  } else if (inputSteps.length > 0) {
    score += 10;
    strengths.push('Đã biết dùng biến động ({{AI}} hoặc Spintax) để tránh lặp nội dung.');
  }

  if (avgDelay < 900 && steps.length >= 3) {
    score -= 6;
    weaknesses.push(`Nhịp thao tác trung bình khá nhanh (${Math.round(avgDelay)}ms/bước), nên giữ khoảng nghỉ tự nhiên.`);
    improvements.push('Giữ khoảng nghỉ ngẫu nhiên 8–18 giây giữa các bài/Group và tôn trọng Ngân sách bảo vệ nick.');
  } else {
    score += 5;
    strengths.push('Nhịp thao tác vừa phải, phù hợp để chạy an toàn trên cấu hình máy này.');
  }

  if (navSteps.length > 0) {
    strengths.push(`Đã tự lưu ngữ cảnh ${navSteps.length} đường dẫn mục tiêu & cấu trúc F12 chính xác.`);
  }

  if (!kb?.productKnowledgeBase?.trim()) {
    improvements.push('Nạp thêm Kho Kiến Thức Sản Phẩm (Tab AI & Kho) để AI viết câu trả lời bám sát giá/dịch vụ thật của bạn.');
  }

  if (strengths.length === 0) {
    strengths.push('Đã ghi nhận khung thao tác chuẩn F12 riêng cho máy này để AI hiểu quy trình.');
  }
  if (improvements.length === 0) {
    improvements.push('Phân tích tệp từng Group trong Thư viện Groups để AI tối ưu giọng văn riêng cho từng nhóm.');
  }

  score = Math.max(35, Math.min(96, score));

  const distilledStrategy = hasCommentOrPost
    ? 'Ưu tiên đọc ngữ cảnh bài viết + lọc bỏ Người bán trước, thả tim tự nhiên rồi để AI viết câu tư vấn ngắn gọn (1-2 câu) bám đúng tệp văn hóa từng Group thay vì dán câu mẫu cố định.'
    : 'Duy trì tương tác tự nhiên theo nhịp sinh học, kết hợp phân tích tệp từng Group và chỉ tập trung vào khách có nhu cầu thực tế.';

  const bestFitGroupTypes =
    input.category === 'post_publish'
      ? ['Nhóm chia sẻ sản phẩm / Showcase Phim AI & Video AI', 'Nhóm cộng đồng AI / CLB trường cho phép chia sẻ kinh nghiệm']
      : input.category === 'inbox_dm'
        ? ['Bài tuyển Job AI / Job Phim AI nóng (>= 75đ) cần gửi Showreel/Brief', 'Client / Team đang tìm cộng tác dựng video AI']
        : ['Nhóm Dựng Phim AI & Video AI (hỏi workflow/tool)', 'Nhóm Job AI / Tuyển Freelancer & Cộng đồng sinh viên các trường'];

  return {
    score,
    summary:
      staticInputs.length > 0
        ? 'Quy trình làm mẫu rõ ràng về thao tác F12, nhưng cần để AI tùy biến nội dung theo từng Group thay vì lặp lại y chang câu đã gõ.'
        : 'Quy trình làm mẫu hợp lý và tự nhiên — rất phù hợp để kết hợp Playbook tệp từng Group nhằm nâng tỷ lệ khách phản hồi.',
    strengths,
    weaknesses,
    improvements,
    distilledStrategy,
    bestFitGroupTypes,
    reviewedAt: new Date().toISOString(),
    engine: 'offline',
  };
}

/**
 * Tạo Prompt để AI Cố vấn nhận xét cách người dùng làm mẫu và rút ra chiến lược hiệu quả (KHÔNG lặp máy móc).
 */
export function buildDemoCritiquePrompt(
  input: { name?: string; category?: string; steps: RecordedActionStep[] },
  kb?: MachineF12KnowledgeBase
): string {
  const norm = normalizeMachineKnowledge(kb);
  const stepsSummary = (input.steps || [])
    .slice(0, 30)
    .map(
      (s, i) =>
        `${i + 1}. [${s.type}/${s.intent}] ${s.label}${s.value ? ` | Nội dung gõ: "${s.value.slice(0, 140)}"` : ''} | delay=${s.delayMs}ms | url=${(s.url || '').slice(0, 80)}`
    )
    .join('\n');

  const groupPreview = (norm.learnedGroups || [])
    .slice(0, 8)
    .map((g) => `- ${g.name} (Tier ${g.tier || 'B'}, ROI ${g.roiScore ?? 50}đ, Quét ${g.postsScanned || 0}, Hot ${g.hotLeadsFound || 0}, Sale ${g.sellersSkipped || 0})`)
    .join('\n');

  return `Bạn là Chuyên gia Chiến lược Social Media & Growth Marketing (AI Strategy Coach) của hệ thống FB EXTEN.
Người dùng vừa thực hiện 1 lượt LÀM MẪU trên Facebook.
QUAN TRỌNG: Người dùng KHÔNG muốn chạy tự động lặp y chang máy móc bản mẫu này. Họ muốn bạn NHẬN XÉT thẳng thắn cách làm việc này, chỉ ra điểm tốt, rủi ro/điểm yếu, đề xuất cách làm thông minh hơn, và RÚT RA CHIẾN LƯỢC TƯƠNG TÁC hiệu quả nhất theo từng tệp nhóm.

THÔNG TIN MẪU NGƯỜI DÙNG VỪA LÀM:
- Tên/nhóm tác vụ: ${input.name || 'Bản làm mẫu mới'} (${input.category || 'custom'})
- Các bước thao tác thực tế:
${stepsSummary || '(Chưa có bước chi tiết)'}

KHO KIẾN THỨC SẢN PHẨM / DỊCH VỤ CỦA NGƯỜI DÙNG:
${norm.productKnowledgeBase ? norm.productKnowledgeBase.slice(0, 900) : '(Chưa nhập)'}

DANH SÁCH GROUPS NGƯỜI DÙNG ĐANG KHAI THÁC:
${groupPreview || '(Chưa có danh sách Group)'}

CHỈ TRẢ VỀ JSON HỢP LỆ THEO ĐÚNG CẤU TRÚC SAU (tiếng Việt ngắn gọn, thực chiến, không thêm text ngoài JSON):
{
  "score": 80,
  "summary": "Nhận xét tổng quan 1-2 câu về cách làm việc hiện tại",
  "strengths": ["Điểm làm tốt 1", "Điểm làm tốt 2"],
  "weaknesses": ["Rủi ro hoặc điểm kém hiệu quả 1", "Điểm yếu 2"],
  "improvements": ["Cách cải tiến cụ thể 1", "Cách cải tiến 2", "Cách cải tiến 3"],
  "distilledStrategy": "1-2 câu chiến lược cốt lõi rút ra để AI áp dụng linh hoạt cho mọi nhóm sau này (không copy máy móc)",
  "bestFitGroupTypes": ["Loại tệp nhóm phù hợp 1", "Loại tệp nhóm phù hợp 2"]
}`;
}

export function parseDemoCritiqueResponse(
  rawText: string,
  input: { name?: string; category?: string; steps: RecordedActionStep[] },
  kb?: MachineF12KnowledgeBase
): WorkflowStrategyReview {
  const fallback = analyzeDemoOffline(input, kb);
  const parsed = parseJsonObjectSafe(rawText);
  if (!parsed || typeof parsed !== 'object') return fallback;

  const scoreNum = Number(parsed.score);
  return {
    score: Number.isFinite(scoreNum) ? Math.max(0, Math.min(100, Math.round(scoreNum))) : fallback.score,
    summary: String(parsed.summary || '').trim() || fallback.summary,
    strengths: cleanStringList(parsed.strengths, 5).length ? cleanStringList(parsed.strengths, 5) : fallback.strengths,
    weaknesses: cleanStringList(parsed.weaknesses, 5).length ? cleanStringList(parsed.weaknesses, 5) : fallback.weaknesses,
    improvements: cleanStringList(parsed.improvements, 5).length
      ? cleanStringList(parsed.improvements, 5)
      : fallback.improvements,
    distilledStrategy: String(parsed.distilledStrategy || '').trim() || fallback.distilledStrategy,
    bestFitGroupTypes: cleanStringList(parsed.bestFitGroupTypes, 4).length
      ? cleanStringList(parsed.bestFitGroupTypes, 4)
      : fallback.bestFitGroupTypes,
    reviewedAt: new Date().toISOString(),
    engine: 'ai',
  };
}

/**
 * Phân tích tệp nhóm & tạo Playbook tương tác riêng cho 1 Group (Offline fallback thông minh).
 */
export function analyzeGroupPlaybookOffline(
  group: LearnedGroupItem,
  kb?: MachineF12KnowledgeBase
): GroupPlaybook {
  const hay = `${group.name || ''} ${(group.sampleSnippets || []).join(' ')} ${(group.tags || []).join(' ')}`.toLowerCase();
  const total = Math.max(1, group.postsScanned || 0);
  const sellerRatio = (group.sellersSkipped || 0) / total;
  const highSellerNoise = (group.postsScanned || 0) >= 3 && sellerRatio >= 0.45;

  let audienceType = 'Thành viên cộng đồng AI, sáng tạo nội dung & làm việc số có nhu cầu trao đổi thực tế';
  let cultureNotes = highSellerNoise
    ? 'Nhóm có khá nhiều bài bán acc/khóa học hoặc chào dịch vụ đại trà — cần lọc mạnh Seller/Spam và chỉ tập trung vào bài hỏi thật hoặc Job thật.'
    : 'Nhóm trao đổi thực tế, thành viên đánh giá cao người chia sẻ kinh nghiệm thật, gọn gàng và không bán hàng lộ liễu.';
  let recommendedTone = 'Tự nhiên như đồng nghiệp trong ngành (xưng mình/bạn hoặc mình/bác), ngắn gọn 1-2 câu, đi thẳng vào giải pháp hoặc giá trị thực tế.';
  let bestActions = [
    'Thả tim bài/bình luận của người đăng Job hoặc người hỏi kỹ thuật thật trước khi trả lời',
    'Góp ý 1 điểm đúng trọng tâm (tool/workflow/kinh nghiệm) rồi mở lời trao đổi thêm qua Inbox',
    'Bỏ qua hoàn toàn các nick bán acc dùng chung, bán khóa học spam và đối thủ chào dịch vụ',
  ];
  let doList = [
    'Trả lời đúng vấn đề kỹ thuật hoặc yêu cầu brief trong bài',
    'Lồng ghép thế mạnh thực tế từ Kho Kiến Thức / Portfolio của bạn',
    'Giữ giọng văn thân thiện, ngang hàng, không sáo rỗng',
  ];
  let dontList = [
    'Không copy-paste cùng 1 câu comment cho nhiều nhóm/nhiều bài',
    'Không thả link bán hàng, link affiliate hay báo giá đại trà ngay comment đầu',
    'Không chào hàng ngược vào bài của người bán acc/khóa học hoặc đối thủ',
  ];
  let conversionTip = 'Nêu 1 góc nhìn/kinh nghiệm thực tế đúng chủ đề bài viết, rồi gợi ý gửi mẫu sản phẩm/workflow chi tiết qua Inbox.';

  if (/job|tuyển|freelancer|booking|dự án|cast|editor|client|outsourc|việc làm|tvc|agency|hợp tác/i.test(hay)) {
    audienceType = 'Nhà tuyển dụng, Client, Producer & Agency đăng Job AI / Job Dựng Phim AI / Video AI';
    cultureNotes = highSellerNoise
      ? 'Nhóm Job cạnh tranh cao, nhiều freelancer & agency comment rải rác — ai đọc kỹ brief và phản hồi chuyên nghiệp sớm nhất sẽ nắm lợi thế.'
      : 'Client ưu tiên người hiểu rõ yêu cầu sản phẩm (thời lượng, style, deadline), có mẫu sản phẩm/showreel thật và trao đổi gọn gàng.';
    recommendedTone = 'Chuyên nghiệp, thẳng thắn, tự tin (xưng mình/bạn hoặc em/anh chị), nhắc đúng dạng sản phẩm client cần (TVC AI, phim ngắn AI, dựng clip AI).';
    bestActions = [
      'Ưu tiên quét bài đăng mới (< 2 giờ) bằng Auto-Pilot để không bị trễ Job ngon',
      'Comment ngắn xác nhận đúng chuyên môn theo brief và xin gửi Showreel/Portfolio qua Inbox',
      'Lọc bỏ các comment của đối thủ/freelancer khác vào tự quảng cáo',
    ];
    dontList = [
      'Không comment mỗi chữ "ib", "chấm" hay copy mẫu dài lê thê không ăn nhập brief',
      'Không tự hạ giá công khai hay tranh cãi dưới bài tuyển',
      'Không spam link nặng dễ bị Facebook ẩn bình luận',
    ];
    conversionTip = 'Nêu 1 nút thắt chuyên môn trong brief cho thấy mình làm thật trình cao (VD: giữ đồng nhất sản phẩm/ánh sáng), rồi gợi mở gửi showreel/demo kín qua Inbox.';
  } else if (
    /phim\s*ai|video\s*ai|dựng\s*phim|filmmak|sora|kling|runway|veo|hailuo|comfyui|midjourney|flux|vfx|3d|hoạt\s*hình|animation|creative|sáng\s*tạo|prompt|capcut|premiere|davinci|blender/i.test(
      hay
    )
  ) {
    audienceType = 'Cộng đồng làm Phim AI, Video AI, VFX, Prompt & Creative Director (rất chuộng cao thủ chia sẻ thực chiến)';
    cultureNotes = 'Thành viên đặc biệt dị ứng với bài bán khóa học lùa gà hoặc seeding lộ liễu — nhưng cực kỳ tò mò & nể người chỉ ra đúng "bệnh" kỹ thuật trình cao (nhất quán nhân vật, camera motion, lip-sync, hậu kỳ).';
    recommendedTone = 'Phong thái cao thủ/anh em làm nghề thực thụ (mình/bác hoặc em/bác), chỉ hé lộ 20-30% điểm mấu chốt sắc nét rồi gợi mở tò mò kéo nhắn tin.';
    bestActions = [
      'Thả tim showcase đẹp và bắt trúng "bệnh" ở các bài hỏi lỗi tool/workflow/nhất quán nhân vật',
      'Chỉ chia sẻ 1 nút thắt kỹ thuật cốt lõi (không giải hết bài), chốt bằng vế gợi mở FOMO để họ tự nhắn hỏi full flow/preset',
      'Cho các nick spam bán acc/bán bộ prompt đại trà vào Blacklist 0ms',
    ];
    dontList = [
      'Tuyệt đối không rao bán lộ liễu hay chê bai tác phẩm người khác',
      'Không viết hướng dẫn dài lê thê lộ hết bí quyết ngay ở comment',
      'Không spam link ngoài nhóm nếu chưa được hỏi',
    ];
    conversionTip = 'Nói trúng 1 mẹo kỹ thuật trình cao (20-30%) rồi bỏ ngỏ phần sâu hơn ("còn 1 bước xử lý nhỏ nữa nói đây hơi dài, bác muốn xem full flow thì nhắn em chỉ nhanh cho").';
  } else if (
    /trường|đại\s*học|sinh\s*viên|\bsv\b|học\s*viện|\bclb\b|câu\s*lạc\s*bộ|đồ\s*án|tốt\s*nghiệp|fpt|rmit|arena|sân\s*khấu|điện\s*ảnh|báo\s*chí|mỹ\s*thuật|kiến\s*trúc|bách\s*khoa|hust|ptit|uit|vlu|van\s*lang|workshop|cuộc\s*thi|hackathon/i.test(
      hay
    )
  ) {
    audienceType = 'Sinh viên, giảng viên, CLB Truyền thông – Điện ảnh – Thiết kế – CNTT & cộng đồng học làm AI/Phim AI';
    cultureNotes = 'Môi trường cởi mở, ham học hỏi, rất dễ ấn tượng với đàn anh/mentor có kinh nghiệm dự án thực tế và sẵn sàng chỉ mẹo làm đồ án/phim AI nhanh đẹp.';
    recommendedTone = 'Gần gũi kiểu đàn anh trình cao (xưng mình/bạn hoặc anh/em), chỉ ra đúng 1 điểm ăn tiền trong đồ án rồi gợi mở gửi bộ flow mẫu qua Inbox.';
    bestActions = [
      'Gợi ý đúng 1 điểm mấu chốt giúp đồ án video AI đẹp hơn & tiết kiệm credit (không chỉ hết toàn bộ ở comment)',
      'Gợi mở tạo tò mò về quy trình rút gọn/tài liệu thực chiến để sinh viên chủ động nhắn tin xin hướng dẫn',
      'Bỏ qua các bài rao bán tài khoản giá rẻ / làm thuê bài tập kém uy tín',
    ];
    dontList = [
      'Không dùng văn phong bán hàng cứng nhắc hay chèo kéo khóa học',
      'Không viết câu quá dài hàn lâm khiến sinh viên ngại tương tác',
      'Không spam nhiều bình luận giống nhau trong các nhóm cùng trường',
    ];
    conversionTip = 'Chỉ ra 1 nút thắt khiến đồ án/video AI dễ ăn điểm hơn hẳn, rồi gợi mở "còn vài bước xử lý gọn nữa, cần thì nhắn mình gửi bộ flow mẫu & chỉ nhanh cho nhé".';
  } else if (/ai|trí\s*tuệ\s*nhân\s*tạo|chatgpt|gemini|claude|agent|n8n|automation|công\s*nghệ|tech/i.test(hay)) {
    audienceType = 'Người dùng ứng dụng AI, Automation, Creator & người làm việc số tìm giải pháp tối ưu công việc';
    cultureNotes = 'Thành viên thích câu trả lời thực dụng, nói rõ dùng công cụ gì và áp dụng ra sao thay vì nói lý thuyết chung chung.';
    recommendedTone = 'Súc tích, thực tế, ngang hàng, tập trung thẳng vào công cụ & cách làm hiệu quả.';
    bestActions = [
      'Trả lời đúng trọng tâm câu hỏi về công cụ/quy trình AI và chia sẻ trải nghiệm thật',
      'Săn các bài hỏi tìm người dựng quy trình AI / sản xuất nội dung AI cho doanh nghiệp',
      'Lọc bỏ các bài bán acc dùng chung và spam link affiliate',
    ];
    conversionTip = 'Đưa ra 1 gợi ý công cụ/quy trình cụ thể đúng bài toán của họ rồi mời trao đổi chi tiết qua tin nhắn riêng.';
  } else if (kb?.productKnowledgeBase?.trim()) {
    conversionTip = 'Lồng ghép 1 thế mạnh/dự án thực tế sát nhất trong Kho Kiến Thức của bạn rồi mời trao đổi chi tiết qua Inbox.';
  }

  return {
    audienceType,
    cultureNotes,
    recommendedTone,
    bestActions,
    doList,
    dontList,
    conversionTip,
    updatedAt: new Date().toISOString(),
    engine: 'offline',
  };
}

/**
 * Tạo Prompt để AI phân tích sâu 1 Group cụ thể thành GroupPlaybook (cách làm việc đúng tệp nhóm nhất).
 */
export function buildGroupPlaybookPrompt(
  group: LearnedGroupItem,
  kb?: MachineF12KnowledgeBase
): string {
  const norm = normalizeMachineKnowledge(kb);
  const snippets = (group.sampleSnippets || [])
    .slice(0, 8)
    .map((s, i) => `${i + 1}. "${s}"`)
    .join('\n');

  return `Bạn là Chuyên gia phân tích tệp khách hàng Facebook Group cho hệ thống FB EXTEN.
Hãy phân tích Group dưới đây để xây dựng PLAYBOOK CHIẾN LƯỢC TƯƠNG TÁC RIÊNG ĐÚNG TỆP NHÓM NHẤT (nhằm giúp AI và người dùng tương tác tự nhiên, hiệu quả cao, không spam máy móc).

THÔNG TIN GROUP:
- Tên Group: ${group.name || group.id}
- Link: ${group.url}
- Hạng ROI hiện tại: Tier ${group.tier || 'B'} (${group.roiScore ?? 50}đ)
- Số liệu đã quét: ${group.postsScanned || 0} bài | Lead nóng: ${group.hotLeadsFound || 0} | Lead ấm: ${group.warmLeadsFound || 0} | Đã bỏ qua Seller: ${group.sellersSkipped || 0} | Comment đã gửi: ${group.commentsSent || 0}
- Các trích đoạn bài viết thực tế trong nhóm:
${snippets || '(Chưa có bài mẫu — hãy phân tích dựa trên tên nhóm, chủ đề và dữ liệu sản phẩm)'}

SẢN PHẨM / DỊCH VỤ CỦA NGƯỜI DÙNG:
${norm.productKnowledgeBase ? norm.productKnowledgeBase.slice(0, 900) : '(Chưa nhập — phân tích theo chủ đề của Group)'}

CHỈ TRẢ VỀ JSON HỢP LỆ THEO ĐÚNG CẤU TRÚC SAU (tiếng Việt thực chiến, súc tích):
{
  "audienceType": "Mô tả ngắn đúng tệp thành viên/khách hàng trong nhóm này",
  "cultureNotes": "Văn hóa nhóm, mức độ nhạy cảm với quảng cáo/sale, hành vi hỏi đáp đặc trưng",
  "recommendedTone": "Giọng văn, cách xưng hô, độ dài bình luận hiệu quả nhất cho nhóm này",
  "bestActions": ["Cách làm việc hiệu quả nhất 1", "Cách làm việc 2", "Cách làm việc 3"],
  "doList": ["Nên làm 1", "Nên làm 2", "Nên làm 3"],
  "dontList": ["Tuyệt đối tránh 1", "Tránh 2", "Tránh 3"],
  "conversionTip": "1 mẹo cụ thể để kéo khách từ comment sang Inbox/chốt đơn tự nhiên nhất trong nhóm này"
}`;
}

export function parseGroupPlaybookResponse(
  rawText: string,
  group: LearnedGroupItem,
  kb?: MachineF12KnowledgeBase
): GroupPlaybook {
  const fallback = analyzeGroupPlaybookOffline(group, kb);
  const parsed = parseJsonObjectSafe(rawText);
  if (!parsed || typeof parsed !== 'object') return fallback;

  return {
    audienceType: String(parsed.audienceType || '').trim() || fallback.audienceType,
    cultureNotes: String(parsed.cultureNotes || '').trim() || fallback.cultureNotes,
    recommendedTone: String(parsed.recommendedTone || '').trim() || fallback.recommendedTone,
    bestActions: cleanStringList(parsed.bestActions, 4).length
      ? cleanStringList(parsed.bestActions, 4)
      : fallback.bestActions,
    doList: cleanStringList(parsed.doList, 4).length ? cleanStringList(parsed.doList, 4) : fallback.doList,
    dontList: cleanStringList(parsed.dontList, 4).length ? cleanStringList(parsed.dontList, 4) : fallback.dontList,
    conversionTip: String(parsed.conversionTip || '').trim() || fallback.conversionTip,
    updatedAt: new Date().toISOString(),
    engine: 'ai',
  };
}

/**
 * Nhận xét chiến lược tổng thể cho toàn bộ danh sách Groups + Kịch bản mẫu + CRM (Offline fallback thông minh).
 */
export function analyzePortfolioStrategyOffline(kb?: MachineF12KnowledgeBase): GlobalStrategyMemory {
  const norm = normalizeMachineKnowledge(kb);
  const groups = (norm.learnedGroups || []).filter((g) => g.kind === 'group_feed');
  const tierA = groups.filter((g) => g.tier === 'A');
  const tierC = groups.filter((g) => g.tier === 'C');
  const workflows = norm.workflows || [];
  const leads = norm.leadsCrm || [];
  const hotLeads = leads.filter((l) => l.temperature === 'hot');

  const workingPrinciples: string[] = [
    'Chỉ xem thao tác Làm Mẫu là khung F12 & quy trình chuẩn, luôn để AI tùy biến câu chữ theo đúng văn hóa từng Group.',
    'Ưu tiên săn bài mới (< 24h) tại các Group Tier A/B và tự động loại bỏ Người bán bằng Blacklist 0ms.',
    'Tương tác kiểu người thật: đọc bài ngắn + thả tim khách thật rồi bình luận 1-2 câu có giá trị trước khi mời Inbox.',
  ];

  for (const wf of workflows) {
    if (wf.aiReview?.distilledStrategy && workingPrinciples.length < 5) {
      if (!workingPrinciples.includes(wf.aiReview.distilledStrategy)) {
        workingPrinciples.push(wf.aiReview.distilledStrategy);
      }
    }
  }

  const topRecommendations: string[] = [];
  if (groups.length === 0) {
    topRecommendations.push('Nạp danh sách các Group Facebook mục tiêu vào Thư viện Groups để AI phân tích từng tệp nhóm.');
  } else {
    const missingPlaybook = groups.filter((g) => !g.playbook).length;
    if (missingPlaybook > 0) {
      topRecommendations.push(`Còn ${missingPlaybook}/${groups.length} Group chưa có Playbook riêng — bấm "Phân tích tệp" để AI tối ưu cách tương tác từng nhóm.`);
    }
    if (tierA.length > 0) {
      topRecommendations.push(`Tập trung Auto-Pilot vào ${tierA.length} Group Tier A chất lượng cao nhất: ${tierA.slice(0, 3).map((g) => g.name).join(', ')}.`);
    }
    if (tierC.length > 0) {
      topRecommendations.push(`Giảm tần suất ở ${tierC.length} Group Tier C nhiều sale/ít khách để tiết kiệm ngân sách comment bảo vệ nick.`);
    }
  }
  if (!norm.productKnowledgeBase?.trim()) {
    topRecommendations.push('Điền Kho Kiến Thức Sản Phẩm / Dịch Vụ thật (bảng giá, ưu đãi, cách xưng hô) để AI tư vấn trúng đích thay vì trả lời chung chung.');
  }
  if (hotLeads.length > 0) {
    topRecommendations.push(`Đang có ${hotLeads.length} Lead Nóng trong Mini-CRM — ưu tiên kiểm tra và nhắn tin chốt sớm!`);
  }

  return {
    overallCritique:
      groups.length > 0
        ? `Hệ thống đang theo dõi ${groups.length} Group (${tierA.length} Tier A, ${tierC.length} Tier C), ${workflows.length} quy trình mẫu và ${leads.length} khách tiềm năng. Trọng tâm là dùng Playbook từng nhóm để cá nhân hóa từng bình luận thay vì chạy lặp khuôn mẫu.`
        : 'Hệ thống đã sẵn sàng bộ khung F12 & chiến lược. Hãy nạp danh sách Groups và Kho Kiến Thức sản phẩm để AI Cố Vấn cá nhân hóa chiến lược sâu theo đúng ngành của bạn.',
    workingPrinciples,
    toneGuidelines:
      'Ngắn gọn 1-2 câu tiếng Việt tự nhiên, trả lời đúng trọng tâm người hỏi, không spam link/SĐT công khai, luôn thích nghi giọng văn theo từng Group.',
    topRecommendations: topRecommendations.slice(0, 4),
    updatedAt: new Date().toISOString(),
    engine: 'offline',
  };
}

export function buildPortfolioStrategyPrompt(kb?: MachineF12KnowledgeBase): string {
  const norm = normalizeMachineKnowledge(kb);
  const groupsBlock = (norm.learnedGroups || [])
    .slice(0, 20)
    .map(
      (g) =>
        `- ${g.name} [${g.kind}] | Tier ${g.tier || 'B'} (${g.roiScore ?? 50}đ) | Quét ${g.postsScanned || 0} | Hot ${g.hotLeadsFound || 0} | Sale bỏ qua ${g.sellersSkipped || 0}${g.playbook ? ` | Tệp: ${g.playbook.audienceType}` : ''}${g.sampleSnippets?.length ? ` | Bài mẫu: "${g.sampleSnippets[0].slice(0, 90)}"` : ''}`
    )
    .join('\n');

  const wfBlock = (norm.workflows || [])
    .slice(0, 10)
    .map(
      (w) =>
        `- "${w.name}" (${w.category}, ${w.steps.length} bước, đã chạy ${w.runCount}x)${w.aiReview?.distilledStrategy ? ` | Chiến lược rút ra: ${w.aiReview.distilledStrategy}` : ''}`
    )
    .join('\n');

  const crmHot = (norm.leadsCrm || []).filter((l) => l.temperature === 'hot').length;
  const crmTotal = (norm.leadsCrm || []).length;

  return `Bạn là AI Giám đốc Chiến lược khai thác Group Facebook (AI Strategy Coach) của FB EXTEN.
Hãy đánh giá toàn bộ danh sách Groups, thói quen làm mẫu, và kết quả thực tế của người dùng để đưa ra chiến lược làm việc thông minh, hiệu quả và đúng tệp nhất (tuyệt đối không máy móc lặp khuôn).

SẢN PHẨM / DỊCH VỤ CỦA NGƯỜI DÙNG:
${norm.productKnowledgeBase ? norm.productKnowledgeBase.slice(0, 1000) : '(Chưa nhập)'}

DANH SÁCH GROUPS ĐÃ LƯU (${(norm.learnedGroups || []).length}):
${groupsBlock || '(Chưa có Group nào)'}

CÁC MẪU THAO TÁC ĐÃ GHI (${(norm.workflows || []).length}):
${wfBlock || '(Chưa có mẫu thao tác)'}

HIỆU QUẢ MINI-CRM: ${crmTotal} khách tiềm năng (${crmHot} Lead Nóng >= 75đ), Blacklist: ${(norm.sellerBlacklist || []).length} nick người bán.

CHỈ TRẢ VỀ JSON HỢP LỆ THEO ĐÚNG CẤU TRÚC SAU (tiếng Việt sắc bén, thực chiến):
{
  "overallCritique": "Nhận xét tổng thể 2-3 câu về cách người dùng đang khai thác nhóm & điểm nút cần tối ưu nhất",
  "workingPrinciples": ["Nguyên tắc cốt lõi 1", "Nguyên tắc cốt lõi 2", "Nguyên tắc cốt lõi 3", "Nguyên tắc cốt lõi 4"],
  "toneGuidelines": "Định hướng văn phong chuẩn để AI tự động áp dụng khi tương tác",
  "topRecommendations": ["Hành động ưu tiên ngay 1", "Hành động ưu tiên ngay 2", "Hành động ưu tiên ngay 3"]
}`;
}

export function parsePortfolioStrategyResponse(
  rawText: string,
  kb?: MachineF12KnowledgeBase
): GlobalStrategyMemory {
  const fallback = analyzePortfolioStrategyOffline(kb);
  const parsed = parseJsonObjectSafe(rawText);
  if (!parsed || typeof parsed !== 'object') return fallback;

  return {
    overallCritique: String(parsed.overallCritique || '').trim() || fallback.overallCritique,
    workingPrinciples: cleanStringList(parsed.workingPrinciples, 5).length
      ? cleanStringList(parsed.workingPrinciples, 5)
      : fallback.workingPrinciples,
    toneGuidelines: String(parsed.toneGuidelines || '').trim() || fallback.toneGuidelines,
    topRecommendations: cleanStringList(parsed.topRecommendations, 4).length
      ? cleanStringList(parsed.topRecommendations, 4)
      : fallback.topRecommendations,
    updatedAt: new Date().toISOString(),
    engine: 'ai',
  };
}

/**
 * Hợp nhất chiến lược rút ra từ 1 lượt AI Nhận xét mẫu vào Bộ nhớ Chiến lược Toàn cục (không trùng lặp).
 */
export function mergeDistilledStrategyIntoMemory(
  kb: MachineF12KnowledgeBase | undefined,
  review: WorkflowStrategyReview
): MachineF12KnowledgeBase {
  const base = normalizeMachineKnowledge(kb);
  const existing = base.strategyMemory || analyzePortfolioStrategyOffline(base);
  const principles = [...(existing.workingPrinciples || [])];
  const distilled = String(review.distilledStrategy || '').trim();
  if (distilled && !principles.some((p) => p.toLowerCase() === distilled.toLowerCase())) {
    principles.unshift(distilled);
    if (principles.length > 6) principles.length = 6;
  }
  base.strategyMemory = {
    ...existing,
    workingPrinciples: principles,
    updatedAt: new Date().toISOString(),
  };
  return base;
}

/**
 * Tạo Prompt để AI tự động viết lại / tùy biến câu gõ từ bản Làm Mẫu sao cho khớp đúng
 * tệp khách hàng, văn hóa và giọng văn của Group đích (tránh lặp y chang máy móc).
 */
export function buildSmartAdaptInputPrompt(
  rawRecordedText: string,
  targetGroup: LearnedGroupItem | undefined,
  kb?: MachineF12KnowledgeBase,
  pageTitle?: string,
  naturalGoal?: string,
  customPrompt?: string
): string {
  const norm = normalizeMachineKnowledge(kb);
  const pb = targetGroup?.playbook;
  const sm = norm.strategyMemory;

  const recentBlock = (norm.recentSentComments || []).length
    ? `CÁC CÂU ĐÃ GỬI GẦN ĐÂY (CẤM LẶP LẠI CÂU CHỮ HOẶC CÁCH MỞ ĐẦU):\n${(norm.recentSentComments || [])
        .slice(0, 6)
        .map((c) => `- "${c.slice(0, 120)}"`)
        .join('\n')}`
    : '';

  const styleBlock = (norm.learnedStyleSamples || []).length
    ? `GIỌNG VĂN THẬT CỦA NGƯỜI DÙNG (chỉ học nhịp câu & cách xưng hô, không copy nguyên):\n${(norm.learnedStyleSamples || [])
        .slice(0, 4)
        .map((s) => `- "${s.text.slice(0, 120)}"`)
        .join('\n')}`
    : '';

  return `Bạn là trợ lý tương tác Facebook thông minh của FB EXTEN.
Người dùng đã làm mẫu 1 câu nhập liệu gốc, nhưng KHÔNG muốn dán y chang máy móc vào mọi Group.
Hãy viết lại nội dung mới giữ đúng ý định cốt lõi nhưng TÙY BIẾN TỰ NHIÊN 100% cho phù hợp với tệp thành viên và văn hóa của trang/Group đích hiện tại.

TRANG / GROUP ĐÍCH HIỆN TẠI: ${targetGroup?.name || pageTitle || 'Facebook'}
${
  pb
    ? `PLAYBOOK TỆP NHÓM NÀY:
- Tệp thành viên: ${pb.audienceType}
- Văn hóa nhóm: ${pb.cultureNotes}
- Giọng văn khuyên dùng: ${pb.recommendedTone}
- Nên làm: ${(pb.doList || []).slice(0, 3).join('; ')}
- Tránh làm: ${(pb.dontList || []).slice(0, 3).join('; ')}
- Mẹo kết nối: ${pb.conversionTip}`
    : ''
}
${sm?.workingPrinciples?.length ? `NGUYÊN TẮC CỐT LÕI: ${sm.workingPrinciples.slice(0, 3).join('; ')}` : ''}
${norm.productKnowledgeBase ? `HỒ SƠ NĂNG LỰC / PORTFOLIO THẬT: ${norm.productKnowledgeBase.slice(0, 900)}` : ''}
${styleBlock}
${recentBlock}
${naturalGoal ? `MỤC TIÊU RIÊNG: ${naturalGoal}` : ''}
${customPrompt ? `PHONG CÁCH RIÊNG: ${customPrompt}` : ''}

Ý ĐỊNH / CÂU MẪU GỐC NGƯỜI DÙNG TỪNG GÕ:
"${rawRecordedText}"

YÊU CẦU:
- Viết lại thành 1-2 câu tiếng Việt thật tự nhiên như cao thủ làm nghề AI/dựng phim AI đang bình luận trực tiếp trong Group này.
- Áp dụng nguyên tắc "Hé lộ 20-30% ý chuyên môn trình cao + Gợi mở tạo tò mò/FOMO để họ tự muốn nhắn tin hỏi thêm" (không giải thích hết toàn bộ cách làm trong comment, không nài nỉ bán hàng).
- Thay đổi hoàn toàn cách diễn đạt để không bao giờ bị trùng lặp máy móc giữa các Group.
- Không bịa đặt thông tin, không spam link.
- CHỈ TRẢ VỀ ĐÚNG 1 CÂU/ĐOẠN DUY NHẤT CẦN GÕ (không ngoặc kép, không giải thích).`;
}

/**
 * Tùy biến nội dung an toàn khi chưa có API Key (Offline Smart Adaptation + chống lặp).
 */
export function applyOfflineSmartAdaptation(
  rawRecordedText: string,
  targetGroup?: LearnedGroupItem,
  kb?: MachineF12KnowledgeBase
): string {
  let text = sanitizeSingleCommentText(rawRecordedText);
  if (!text) return '';

  if (text.includes('{{AI}}')) {
    const context = `${targetGroup?.name || ''} ${(targetGroup?.sampleSnippets || []).slice(0, 2).join(' ')}`;
    const detected = detectThreadMode(context);
    const replacement = generateContextualOfflineReply(context || text, detected, {
      recentSentComments: kb?.recentSentComments || [],
      groupPlaybook: targetGroup?.playbook,
      isCommentReply: false,
    });
    text = text.replace(/\{\{AI\}\}/g, replacement);
  }

  return sanitizeSingleCommentText(spinText(text));
}

// ============================================================================
// 12. META AI WEB BRIDGE PROMPTING & DUAL JSON / NATURAL PARSER (v4.3)
//     (Tận dụng trực tiếp Tab meta.ai & Bộ nhớ đã train sẵn trên Chrome của bạn)
// ============================================================================

export type AiBrainSource = 'auto_smart' | 'meta_ai_tab' | 'api_pool' | 'offline';

/**
 * Tạo tin nhắn nạp quy luật 1-Click vào Tab Meta AI để Meta AI ghi nhớ đúng giọng điệu,
 * công thức 20-30% kiến thức trình cao + gợi mở FOMO kéo Inbox và hồ sơ năng lực của bạn.
 */
export function buildMetaAiTrainingPrompt(
  kb?: MachineF12KnowledgeBase,
  customRule?: CustomWorkflowRule
): string {
  const norm = normalizeMachineKnowledge(kb);
  const styleBlock = (norm.learnedStyleSamples || []).length
    ? `\nMẪU GIỌNG VĂN THẬT CỦA MÌNH (chỉ học nhịp câu & cách xưng hô, không copy y nguyên):\n${(norm.learnedStyleSamples || [])
        .slice(0, 4)
        .map((s) => `- "${s.text.slice(0, 140)}"`)
        .join('\n')}`
    : '';

  const strategyBlock = norm.strategyMemory?.workingPrinciples?.length
    ? `\nNGUYÊN TẮC CỐT LÕI:\n${norm.strategyMemory.workingPrinciples
        .slice(0, 4)
        .map((p) => `- ${p}`)
        .join('\n')}`
    : '';

  return `Hãy ghi nhớ thật kỹ phong cách CÁ NHÂN HÓA của mình dưới đây để hỗ trợ mình tương tác trong các nhóm Facebook về AI, Dựng Phim AI, Job AI / Job Phim AI & Cộng đồng các Trường/Sinh viên:

1. CON NGƯỜI & THẾ MẠNH THẬT CỦA MÌNH:
${norm.productKnowledgeBase?.trim() ? norm.productKnowledgeBase.trim().slice(0, 900) : 'Mình là người làm nghề thực chiến mảng AI & Dựng Phim AI / Video AI (Veo, Kling, Runway, Sora, ComfyUI, Midjourney, Flux, VFX, hậu kỳ), hay nhận job TVC/phim AI và thích chia sẻ kinh nghiệm thực tế với anh em trong ngành & các bạn sinh viên.'}
${styleBlock}${strategyBlock}${customRule?.aiSystemPrompt ? `\nLưu ý riêng: ${customRule.aiSystemPrompt}` : ''}

2. ƯU TIÊN SỐ 1 — ĐỘ CHÂN THỰC 100% NHƯ NGƯỜI THẬT ĐANG GÕ TAY:
- Giọng điệu: **mộc mạc, chân thành, đời thường** như anh em ngồi cà phê nói chuyện nghề (xưng linh hoạt mình/bác, e/bác, mình/bạn hoặc e/a/c tùy bài).
- TUYỆT ĐỐI KHÔNG viết văn mẫu bóng bẩy kiểu AI (cấm tiệt kiểu "Chào bạn, thật là một câu hỏi tuyệt vời!", "Hy vọng hữu ích!", không gạch đầu dòng, không emoji lòe loẹt).
- **Cho phép hơi mộc & hơi lỗi viết tay tự nhiên 1 tí** (rất nhẹ, 1–2 chỗ/câu đủ nhìn ra người thật gõ phím/điện thoại chứ ko phải bot): VD viết tắt đời thường như "ko", "đc", "nhma", "ib", "e", đôi khi bỏ dấu chấm cuối câu hoặc nối vế bằng dấu phẩy/gạch ngang tự nhiên — tuyệt đối ko sai chính tả khó đọc hay làm giảm độ uy tín chuyên môn.

3. CÔNG THỨC CHIA SẺ + GỢI MỞ TẠO FOMO (TRÌNH CAO NHƯNG KHIÊM TỐN):
- Đọc kỹ link & nội dung bài viết (bắt đúng tên tool, lỗi kỹ thuật, brief job hoặc đồ án).
- CHỈ hé lộ **1 ý mấu chốt đắt giá nhất (khoảng 20–30%)** cho thấy mình đã làm thực tế nhiều & hiểu sâu gốc rễ vấn đề — KHÔNG hướng dẫn hết bài trong comment.
- Chốt bằng **1 vế gợi mở mộc mạc tạo tò mò/FOMO** để người đọc tự muốn nhắn tin hỏi thêm (VD: "còn 1 bước nhỏ xử lý ở đoạn sau nữa nhma viết đây hơi dài, bác muốn tìm hiểu thêm thì nhắn e chỉ nhanh cho đỡ mất công mò", "đợt rồi e có setup 1 bộ flow chạy khá mượt, b cần xem thử thì ib e gửi cho", "mảng này bên e vừa dựng mấy bộ giữ nét khá căng, a/c tiện ib e gửi showreel kín xem thử nhé").
- Chỉ viết **1–2 câu gọn gàng**, mỗi bài 1 kiểu mở đầu khác nhau (không lặp câu cũ).
- Nếu bài là bán acc dùng chung, bán khóa học spam, đối thủ chào dịch vụ hoặc ko liên quan -> trả lời đúng 1 chữ: SKIP.

Khi mình gửi link + nội dung bài viết, hãy trả đúng định dạng yêu cầu (JSON gọn hoặc 1 câu bình luận sạch không lời dẫn). Hãy xác nhận ngắn gọn "ĐÃ NHỚ QUY LUẬT!" nhé.`;
}

/**
 * Tạo Prompt Copy-Link + Cá nhân hóa chân thực gửi sang Tab Meta AI.
 */
export function buildMetaAiThreadPrompt(
  input: ThreadReadInput,
  mode: ThreadMode,
  kb?: MachineF12KnowledgeBase,
  customRule?: CustomWorkflowRule,
  naturalGoal?: string,
  groupPlaybook?: GroupPlaybook
): string {
  const norm = normalizeMachineKnowledge(kb);
  const recentSent = (norm.recentSentComments || []).slice(0, 5);
  const commentsPreview = (input.comments || [])
    .slice(0, 8)
    .map((c) => `[#${c.index}] ${c.author}: ${c.text.slice(0, 160)}`)
    .join('\n');

  const pbHint = groupPlaybook
    ? `Tệp nhóm: ${groupPlaybook.audienceType} | Giọng phù hợp: ${groupPlaybook.recommendedTone}`
    : `Ngách: ${mode === 'ai_job' ? 'Job AI / Job Phim AI' : mode === 'ai_edu' ? 'Trường học / Sinh viên AI' : 'AI / Dựng Phim AI'}`;

  return `Link bài viết: ${input.url || '(bài trong Group Facebook)'}
Tác giả: ${input.postAuthor}
${pbHint}
${naturalGoal ? `Ghi chú thêm: ${naturalGoal}` : ''}${customRule?.aiSystemPrompt ? `\nGu riêng: ${customRule.aiSystemPrompt}` : ''}
${recentSent.length ? `Cấm lặp lại câu/mở đầu giống mấy câu vừa cmt:\n${recentSent.map((c) => `- ${c.slice(0, 95)}`).join('\n')}` : ''}

Nội dung bài viết:
"${(input.postText || '').slice(0, 950)}"
${commentsPreview ? `Bình luận đáng chú ý:\n${commentsPreview}` : ''}

Nhờ bạn đóng đúng vai mình (người làm thực chiến AI / dựng phim AI) đọc kỹ link & bài trên rồi viết 1 bình luận thật CHÂN THỰC, MỘC MẠC như người thật đang gõ tay:
- Chia sẻ 1 chút kiến thức/kinh nghiệm mấu chốt đúng "bệnh" (20-30%, đủ thấy mình trình cao & làm thật, ko chỉ hết bài).
- Thêm 1 vế gợi mở tò mò/FOMO tự nhiên để họ muốn nhắn tin hỏi thêm (kiểu "nói đây hơi dài, bác cần thì nhắn e chỉ nhanh cho" / "bên e có flow chạy mượt hơn, b muốn xem thì ib e gửi").
- Viết đời thường, đôi khi hơi viết tắt nhẹ kiểu gõ tay ("ko", "đc", "nhma", "ib", "e"), gọn 1-2 câu, tuyệt đối ko mùi AI, ko văn mẫu. Nếu bài bán acc/khóa học/spam thì đặt shouldCommentPost=false.

CHỈ trả về JSON gọn (ko giải thích ngoài JSON):
{"postAuthorRole":"buyer|seller|neutral","shouldCommentPost":true,"suggestedPostComment":"1-2 câu mộc mạc chân thực sát bài","commentEvaluations":[{"index":0,"role":"buyer|seller|neutral","shouldEngage":false,"suggestedReply":""}]}`;
}

/**
 * Parse phản hồi từ Tab Meta AI — hỗ trợ thông minh CẢ JSON LẪN câu tiếng Việt tự nhiên
 * (vẫn giữ lớp bảo vệ lọc Spam/Seller và soát lỗi validateCommentBeforePaste).
 */
export function parseMetaAiThreadResponse(
  rawText: string,
  input: ThreadReadInput,
  mode: ThreadMode,
  memory?: SelfLearningMemory,
  customRule?: CustomWorkflowRule,
  recentSentComments: string[] = [],
  groupPlaybook?: GroupPlaybook
): ThreadAnalysisResult {
  const raw = String(rawText || '').trim();
  const offlineFallback = analyzeThreadOffline(input, mode, memory, customRule, recentSentComments, groupPlaybook);

  // 1. Nếu Meta AI trả về JSON hợp lệ -> dùng parser JSON đầy đủ
  if (/\{[\s\S]*"(?:shouldCommentPost|suggestedPostComment|postAuthorRole)"[\s\S]*\}/.test(raw)) {
    return parseThreadAiResponse(
      raw,
      input,
      mode,
      'Meta AI Tab (Bộ nhớ sẵn)',
      memory,
      customRule,
      recentSentComments,
      groupPlaybook
    );
  }

  // 2. Nếu Meta AI trả lời tự nhiên (chữ thường theo bộ nhớ đã train)
  if (!raw || /^(?:skip|bỏ qua|khong binh luan|không bình luận)\b/i.test(raw)) {
    return {
      ...offlineFallback,
      engine: 'ai',
      aiProvider: 'Meta AI Tab (Bộ nhớ sẵn)',
      shouldCommentPost: false,
      suggestedPostComment: '',
      postSkipReason: 'Meta AI đánh giá nên bỏ qua bài này (SKIP).',
      learnedLesson: 'Meta AI lọc bỏ bài không phù hợp.',
    };
  }

  // Không bao giờ cho phép comment lên bài bán acc/khóa học/spam kể cả khi Meta AI trả lời tự nhiên
  if (offlineFallback.postAuthorRole === 'seller') {
    return {
      ...offlineFallback,
      engine: 'ai',
      aiProvider: 'Meta AI Tab (Bộ nhớ sẵn)',
      shouldCommentPost: false,
      suggestedPostComment: '',
    };
  }

  // Làm sạch lời dẫn nếu Meta AI có viết mở đầu (VD: "Gợi ý bình luận:\n\"...\"")
  let cleaned = raw
    .replace(/^```[\s\S]*?\n|```$/g, '')
    .replace(/^(?:dưới đây là|gợi ý bình luận|câu bình luận|bình luận gợi ý|comment gợi ý|trả lời)\s*[:\-–]?\s*/i, '')
    .trim();

  // Nếu có nhiều dòng và dòng đầu là lời dẫn meta -> lấy dòng nội dung thật phía sau
  const lines = cleaned
    .split('\n')
    .map((l) => l.replace(/^[-*•>\s]+/, '').replace(/^["'“”]+|["'“”]+$/g, '').trim())
    .filter((l) => l.length >= 10);
  if (lines.length > 0) {
    cleaned = lines.find((l) => !/^(?:dưới đây|chắc chắn|bạn có thể|gợi ý|ví dụ)/i.test(l)) || lines[0];
  }
  cleaned = sanitizeSingleCommentText(cleaned.replace(/^["'“”]+|["'“”]+$/g, '').trim());

  const check = validateCommentBeforePaste(cleaned, {
    postText: input.postText || '',
    postAuthorRole: offlineFallback.postAuthorRole,
    recentSentComments,
    groupPlaybook,
  });

  if (check.ok) {
    return {
      ...offlineFallback,
      engine: 'ai',
      aiProvider: 'Meta AI Tab (Bộ nhớ sẵn)',
      shouldCommentPost: true,
      suggestedPostComment: check.cleanedText,
      learnedLesson: 'Đã nhận bình luận trực tiếp từ Tab Meta AI (bộ nhớ sẵn).',
    };
  }

  return offlineFallback;
}







