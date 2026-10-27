import fs from 'fs';
import path from 'path';

export interface CommentTemplate {
  id: string;
  content: string;
  createdAt: string;
  usageCount: number;
}

export interface TargetGroup {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'paused';
  addedAt: string;
  lastScannedAt?: string;
  postsFoundCount?: number;
  joinedStatus?: 'joined' | 'pending' | 'unknown';
  assignedAccountIds?: string[]; // Danh sách ID nick được chỉ định đăng/comment trong Kho Group
  category?: string; // Ví dụ: 'BĐS Ecopark'
  // Quản lý tình trạng đăng bài & Lưu ý của Group (Group Posting Health & Notes)
  postingStatus?: 'direct_success' | 'pending_approval' | 'failed' | 'restricted' | 'unknown';
  postNotes?: string;
  lastPostAt?: string;
  lastPostError?: string;
  postSuccessCount?: number;
  postFailCount?: number;
}

export interface CommentLog {
  id: string;
  timestamp: string;
  accountId: string;
  accountName: string;
  postUrl: string;
  postAuthor: string;
  postSnippet: string;
  commentText: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface AutoCommentConfig {
  enabled: boolean;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  maxCommentsPerDayPerAccount: number;
  mode: 'keyword_auto' | 'link_on_demand' | 'both';
  telegramTopicId?: number; // Topic quản lý mẫu cmt & group
  telegramPostManageTopicId?: number; // Topic quản lý bài đăng
  telegramReportTopicId?: number; // Topic báo cáo kết quả
  telegramMemberScanTopicId?: number; // Topic quét thành viên mới trong group
  telegramFriendTopicId?: number; // Topic gửi lời mời kết bạn theo yêu cầu
  telegramStoryTopicId?: number; // Topic tương tác Story theo yêu cầu
  telegramPostInteractionTopicId?: number; // Topic tương tác bài viết theo yêu cầu
  telegramAccountStatusTopicId?: number; // Topic theo dõi trạng thái, sức khỏe tài khoản & lệnh cấm
  telegramInventoryTopicId?: number; // Topic nạp & quản lý quỹ căn BĐS trong ngày
  telegramSalesOperatorIds?: number[]; // Thành viên sale được phép dùng các chức năng Facebook
  facebookSalesTopicsV1?: boolean; // Đã chuyển hướng dẫn sang quy trình Sale BĐS 5 topic
}

export interface DailyPost {
  id: string;
  type: 'personal_post' | 'group_post' | 'both';
  content: string;
  mediaUrls?: string[];
  status: 'pending' | 'confirmed' | 'scheduled' | 'running' | 'completed' | 'cancelled' | 'failed';
  createdAt: string;
  confirmedAt?: string;
  scheduledTime?: string; // Ví dụ: "11:30", "19:30" hoặc "now"
  scheduledAt?: string; // Thời điểm local đã được xác nhận, lưu theo ISO UTC
  completedAt?: string;
  targetAccounts?: string[];
  targetType?: 'personal_post' | 'group_post' | 'both';
  targetGroupIds?: string[];
  firstComment?: string;
  notes?: string;
  receipts?: Array<{
    target: string;
    targetType: string;
    status: 'verified_success' | 'pending_approval' | 'failed';
    postUrl?: string;
    screenshotPath?: string;
    error?: string;
  }>;
}

export interface PendingDraft {
  id: string;
  type: 'daily_post' | 'comment_template' | 'on_demand_comment';
  rawText: string;
  photos?: string[];
  postUrl?: string;
  scheduledTime?: string;
  scheduledAt?: string;
  targetType?: 'personal_post' | 'group_post' | 'both';
  targetAccount?: string;
  targetGroupIds?: string[];
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
  telegramMessageId?: number;
  telegramTopicId?: number;
  creatorTelegramId?: number;
  creatorName?: string;
  accountId?: string;
}

interface AutoCommentDatabase {
  config: AutoCommentConfig;
  templates: CommentTemplate[];
  groups: TargetGroup[];
  keywords: string[];
  processedPostIds: Record<string, { commentedAt: string; accountId: string }>;
  logs: CommentLog[];
  dailyPosts: DailyPost[];
  pendingDrafts: PendingDraft[];
}

const dbFilePath = path.resolve('./data/auto_comment_db.json');

const defaultDb: AutoCommentDatabase = {
  config: {
    enabled: false,
    delayMinSeconds: 45,
    delayMaxSeconds: 150,
    maxCommentsPerDayPerAccount: 30,
    mode: 'both',
  },
  templates: [
    {
      id: 'cmt_1',
      content: '{Dạ chào bạn|Chào bạn|Hello bạn}! {Shop mình có sẵn nguồn hàng này|Bên mình chuyên cung cấp mẫu này} giá cực tốt, {bạn check inbox mình tư vấn ngay nhé|inbox shop gửi bảng giá chi tiết nha} ạ ❤️',
      createdAt: new Date().toISOString(),
      usageCount: 0,
    },
    {
      id: 'cmt_2',
      content: '{Sản phẩm này bên em đang sẵn kho sỉ & lẻ|Mẫu này bên em có sẵn sll}! {Anh/chị quan tâm nhắn tin em gửi thông tin chi tiết ạ|Em đã nhắn tin qua Messenger cho mình rồi ạ}!',
      createdAt: new Date().toISOString(),
      usageCount: 0,
    },
  ],
  groups: [],
  keywords: ['tìm nguồn', 'báo giá', 'cần mua', 'sỉ lẻ', 'giá sỉ', 'tư vấn', 'inbox'],
  processedPostIds: {},
  logs: [],
  dailyPosts: [],
  pendingDrafts: [],
};

let memoryDb: AutoCommentDatabase | null = null;
let saveTimer: NodeJS.Timeout | null = null;

function loadDb(): AutoCommentDatabase {
  if (memoryDb) return memoryDb;

  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(dbFilePath)) {
    try {
      const data = fs.readFileSync(dbFilePath, 'utf-8');
      memoryDb = JSON.parse(data);
      if (!memoryDb!.dailyPosts) memoryDb!.dailyPosts = [];
      if (!memoryDb!.pendingDrafts) memoryDb!.pendingDrafts = [];
    } catch {
      memoryDb = { ...defaultDb };
    }
  } else {
    memoryDb = { ...defaultDb };
    persistNow();
  }
  return memoryDb!;
}

function persistNow(): void {
  if (!memoryDb) return;
  const tempPath = `${dbFilePath}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(memoryDb, null, 2), 'utf-8');
    fs.renameSync(tempPath, dbFilePath);
  } catch (err) {
    console.error('[AutoComment DB] Lỗi lưu file:', err);
  }
}

function schedulePersist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 400);
}

// ==========================================
// CRUD EXPORTS
// ==========================================

export function getAutoCommentConfig(): AutoCommentConfig {
  return loadDb().config;
}

export function updateAutoCommentConfig(partial: Partial<AutoCommentConfig>): AutoCommentConfig {
  const db = loadDb();
  db.config = { ...db.config, ...partial };
  schedulePersist();
  return db.config;
}

export function getCommentTemplates(): CommentTemplate[] {
  return loadDb().templates;
}

export function addCommentTemplate(content: string): CommentTemplate {
  const db = loadDb();
  const newTpl: CommentTemplate = {
    id: `cmt_${Date.now()}`,
    content: content.trim(),
    createdAt: new Date().toISOString(),
    usageCount: 0,
  };
  db.templates.push(newTpl);
  schedulePersist();
  return newTpl;
}

export function deleteCommentTemplate(id: string): boolean {
  const db = loadDb();
  const initLen = db.templates.length;
  db.templates = db.templates.filter((t) => t.id !== id);
  if (db.templates.length < initLen) {
    schedulePersist();
    return true;
  }
  return false;
}

export function getRandomTemplate(): string {
  const db = loadDb();
  if (db.templates.length === 0) {
    return 'Dạ shop xin chào bạn! Bạn kiểm tra tin nhắn chờ Messenger giúp shop nhé ạ ❤️';
  }
  const picked = db.templates[Math.floor(Math.random() * db.templates.length)];
  picked.usageCount += 1;
  schedulePersist();
  return picked.content;
}

export function getTargetGroups(): TargetGroup[] {
  return loadDb().groups;
}

/**
 * Lấy danh sách các Group BĐS Ecopark đã tham gia (Joined) từ Kho Group,
 * hỗ trợ lọc theo Nick được chỉ định (assignedAccountIds) và giới hạn số lượng (limit)
 */
export function getJoinedEcoparkGroups(accountId?: string, limit?: number): TargetGroup[] {
  const db = loadDb();
  const activeGroups = db.groups.filter((g) => g.status === 'active');

  // Ưu tiên các group đã được xác minh joinedStatus === 'joined'
  let candidates = activeGroups.filter((g) => g.joinedStatus === 'joined');
  if (candidates.length === 0) {
    candidates = activeGroups;
  }

  // Nếu có truyền accountId, ưu tiên các group được chỉ định cho nick đó hoặc group dùng chung
  if (accountId) {
    const assigned = candidates.filter(
      (g) => !g.assignedAccountIds || g.assignedAccountIds.length === 0 || g.assignedAccountIds.includes(accountId)
    );
    if (assigned.length > 0) {
      candidates = assigned;
    }
  }

  if (typeof limit === 'number' && limit > 0) {
    return candidates.slice(0, limit);
  }
  return candidates;
}

/**
 * Đồng bộ danh sách các Group thực tế đã tham gia (Joined) từ Facebook vào Kho Group,
 * đánh dấu các Group đã được duyệt làm 'joined' (active) và giữ các Group chờ duyệt ở trạng thái 'pending' (paused) trong Kho
 */
export function syncJoinedGroupsToPool(
  joinedList: Array<{ url: string; name: string }>,
  accountId = 'acc_default',
  category = 'BĐS Ecopark'
): { joinedCount: number; pendingCount: number; totalPool: number; joinedGroups: TargetGroup[] } {
  const db = loadDb();

  const normalizeSlug = (u: string): string => {
    const m = u.match(/facebook\.com\/groups\/([^/?#]+)/i);
    return m ? m[1].toLowerCase().trim() : u.toLowerCase().trim();
  };

  const joinedSlugs = new Map<string, { url: string; name: string }>();
  for (const item of joinedList) {
    const slug = normalizeSlug(item.url);
    if (slug) {
      joinedSlugs.set(slug, item);
    }
  }

  const matchedSlugs = new Set<string>();

  for (const g of db.groups) {
    const slug = normalizeSlug(g.url);
    g.category = g.category || category;
    if (joinedSlugs.has(slug)) {
      const info = joinedSlugs.get(slug)!;
      matchedSlugs.add(slug);
      g.joinedStatus = 'joined';
      g.status = 'active';
      if (info.name && info.name.length > 2) {
        g.name = info.name;
      }
      if (!g.assignedAccountIds) g.assignedAccountIds = [];
      if (!g.assignedAccountIds.includes(accountId)) {
        g.assignedAccountIds.push(accountId);
      }
    } else if (joinedSlugs.size > 0) {
      // Giữ trong Kho Group ở trạng thái chờ duyệt để không đăng nhầm vào nhóm chưa được duyệt
      g.joinedStatus = g.joinedStatus === 'joined' ? 'joined' : 'pending';
      if (g.joinedStatus === 'pending') {
        g.status = 'paused';
      }
    }
  }

  // Thêm các Group Ecopark mới đã join nhưng chưa có trong Kho
  for (const [slug, info] of joinedSlugs.entries()) {
    if (!matchedSlugs.has(slug)) {
      const cleanUrl = info.url.endsWith('/') ? info.url : `${info.url}/`;
      db.groups.unshift({
        id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: info.name || `Nhóm Ecopark (${slug})`,
        url: cleanUrl,
        status: 'active',
        joinedStatus: 'joined',
        category,
        assignedAccountIds: [accountId],
        addedAt: new Date().toISOString(),
        postsFoundCount: 0,
      });
    }
  }

  // Đưa các group đã join lên đầu danh sách Kho Group
  db.groups.sort((a, b) => {
    const aJ = a.joinedStatus === 'joined' ? 0 : 1;
    const bJ = b.joinedStatus === 'joined' ? 0 : 1;
    return aJ - bJ;
  });

  schedulePersist();
  const joinedGroups = db.groups.filter((g) => g.joinedStatus === 'joined' && g.status === 'active');
  const pendingCount = db.groups.length - joinedGroups.length;
  return {
    joinedCount: joinedGroups.length,
    pendingCount,
    totalPool: db.groups.length,
    joinedGroups,
  };
}

/**
 * Chỉ định danh sách Nick phụ trách cho 1 Group trong Kho Group
 */
export function assignGroupToAccounts(groupId: string, accountIds: string[]): TargetGroup | null {
  const db = loadDb();
  const g = db.groups.find((item) => item.id === groupId);
  if (!g) return null;
  g.assignedAccountIds = Array.from(new Set(accountIds));
  schedulePersist();
  return g;
}

/**
 * Tự động ghi nhận lịch sử và Note trạng thái đăng bài của Group (Thành công, Chờ duyệt hoặc Lỗi)
 */
export function recordGroupPostingResult(
  groupUrl: string,
  result: {
    status: 'verified_success' | 'pending_approval' | 'failed';
    error?: string;
    note?: string;
  }
): void {
  const db = loadDb();
  const normalize = (u: string) => {
    const m = u.match(/facebook\.com\/groups\/([^/?#]+)/i);
    return m ? m[1].toLowerCase().trim() : u.toLowerCase().trim();
  };
  const targetSlug = normalize(groupUrl);
  const grp = db.groups.find((g) => normalize(g.url) === targetSlug);
  if (grp) {
    grp.lastPostAt = new Date().toISOString();
    if (result.status === 'verified_success') {
      grp.postingStatus = 'direct_success';
      grp.postSuccessCount = (grp.postSuccessCount || 0) + 1;
      grp.postNotes = result.note || 'Đăng trực tiếp công khai thành công';
      grp.lastPostError = undefined;
    } else if (result.status === 'pending_approval') {
      grp.postingStatus = 'pending_approval';
      grp.postSuccessCount = (grp.postSuccessCount || 0) + 1;
      grp.postNotes = result.note || 'Cần Quản trị viên duyệt bài trước khi đăng';
      grp.lastPostError = undefined;
    } else {
      grp.postingStatus = 'failed';
      grp.postFailCount = (grp.postFailCount || 0) + 1;
      grp.lastPostError = result.error || 'Lỗi không xác định';
      grp.postNotes = `⚠️ Thường lỗi: ${result.error || 'Không thể đăng'}`;
    }
    schedulePersist();
  }
}

/**
 * Cập nhật Note ghi chú hoặc trạng thái đăng bài thủ công cho 1 Group từ Dashboard
 */
export function updateGroupNote(
  groupId: string,
  update: {
    postNotes?: string;
    postingStatus?: TargetGroup['postingStatus'];
    status?: 'active' | 'paused';
  }
): TargetGroup | null {
  const db = loadDb();
  const grp = db.groups.find((g) => g.id === groupId);
  if (grp) {
    if (update.postNotes !== undefined) grp.postNotes = update.postNotes;
    if (update.postingStatus !== undefined) grp.postingStatus = update.postingStatus;
    if (update.status !== undefined) grp.status = update.status;
    schedulePersist();
    return grp;
  }
  return null;
}

/**
 * Bật / Tắt trạng thái tham gia phân phối bài của 1 Group
 */
export function toggleGroupStatus(groupId: string): TargetGroup | null {
  const db = loadDb();
  const grp = db.groups.find((g) => g.id === groupId);
  if (grp) {
    grp.status = grp.status === 'active' ? 'paused' : 'active';
    schedulePersist();
    return grp;
  }
  return null;
}

export function addTargetGroup(url: string, name?: string): TargetGroup {
  const db = loadDb();
  const cleanUrl = url.trim();
  const existing = db.groups.find((g) => g.url === cleanUrl);
  if (existing) {
    if (name && existing.name.startsWith('Nhóm Facebook (')) {
      existing.name = name;
      schedulePersist();
    }
    return existing;
  }

  const newGroup: TargetGroup = {
    id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: name || `Nhóm Facebook (${cleanUrl.split('/groups/')[1]?.replace(/\/$/, '') || cleanUrl})`,
    url: cleanUrl,
    status: 'active',
    addedAt: new Date().toISOString(),
    postsFoundCount: 0,
  };
  db.groups.push(newGroup);
  schedulePersist();
  return newGroup;
}

export function addMultipleTargetGroups(groups: { url: string; name?: string }[]): { added: number; total: number } {
  const db = loadDb();
  let added = 0;
  for (const g of groups) {
    const cleanUrl = g.url.trim();
    const existing = db.groups.find((item) => item.url === cleanUrl);
    if (!existing) {
      db.groups.push({
        id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${added}`,
        name: g.name || `Nhóm Facebook (${cleanUrl.split('/groups/')[1]?.replace(/\/$/, '') || cleanUrl})`,
        url: cleanUrl,
        status: 'active',
        addedAt: new Date().toISOString(),
        postsFoundCount: 0,
      });
      added++;
    } else if (g.name && existing.name.startsWith('Nhóm Facebook (')) {
      existing.name = g.name;
    }
  }
  if (added > 0) {
    schedulePersist();
  }
  return { added, total: db.groups.length };
}

export function deleteTargetGroup(id: string): boolean {
  const db = loadDb();
  const initLen = db.groups.length;
  db.groups = db.groups.filter((g) => g.id !== id);
  if (db.groups.length < initLen) {
    schedulePersist();
    return true;
  }
  return false;
}

export function getKeywords(): string[] {
  return loadDb().keywords;
}

export function setKeywords(keywords: string[]): string[] {
  const db = loadDb();
  db.keywords = Array.from(new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean)));
  schedulePersist();
  return db.keywords;
}

export function addKeyword(keyword: string): string[] {
  const db = loadDb();
  const clean = keyword.trim().toLowerCase();
  if (clean && !db.keywords.includes(clean)) {
    db.keywords.push(clean);
    schedulePersist();
  }
  return db.keywords;
}

export function removeKeyword(keyword: string): string[] {
  const db = loadDb();
  const clean = keyword.trim().toLowerCase();
  db.keywords = db.keywords.filter((k) => k !== clean);
  schedulePersist();
  return db.keywords;
}

export function isPostProcessed(postId: string): boolean {
  const db = loadDb();
  return !!db.processedPostIds[postId];
}

export function markPostProcessed(postId: string, accountId: string): void {
  const db = loadDb();
  db.processedPostIds[postId] = {
    commentedAt: new Date().toISOString(),
    accountId,
  };
  schedulePersist();
}

export function addCommentLog(log: Omit<CommentLog, 'id' | 'timestamp'>): CommentLog {
  const db = loadDb();
  const newLog: CommentLog = {
    id: `log_${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...log,
  };
  db.logs.unshift(newLog);
  if (db.logs.length > 300) {
    db.logs = db.logs.slice(0, 300);
  }
  schedulePersist();
  return newLog;
}

export function getCommentLogs(limit = 50): CommentLog[] {
  return loadDb().logs.slice(0, limit);
}

// ==========================================
// DAILY POSTS CRUD
// ==========================================

export function getDailyPosts(): DailyPost[] {
  return loadDb().dailyPosts || [];
}

export function addDailyPost(post: Omit<DailyPost, 'id' | 'createdAt' | 'status'>): DailyPost {
  const db = loadDb();
  if (!db.dailyPosts) db.dailyPosts = [];
  const newPost: DailyPost = {
    id: `post_${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
    ...post,
  };
  db.dailyPosts.unshift(newPost);
  schedulePersist();
  return newPost;
}

export function updateDailyPostStatus(
  id: string,
  status: DailyPost['status'],
  notes?: string,
  receipts?: DailyPost['receipts']
): DailyPost | null {
  const db = loadDb();
  if (!db.dailyPosts) db.dailyPosts = [];
  const p = db.dailyPosts.find((item) => item.id === id);
  if (!p) return null;
  p.status = status;
  if (status === 'confirmed') p.confirmedAt = new Date().toISOString();
  if (status === 'completed') p.completedAt = new Date().toISOString();
  if (notes) p.notes = notes;
  if (receipts && receipts.length > 0) p.receipts = receipts;
  schedulePersist();
  return p;
}

export function getDailyPost(id: string): DailyPost | undefined {
  const db = loadDb();
  return (db.dailyPosts || []).find((item) => item.id === id);
}

export function deleteDailyPost(id: string): boolean {
  const db = loadDb();
  if (!db.dailyPosts) return false;
  const initLen = db.dailyPosts.length;
  db.dailyPosts = db.dailyPosts.filter((item) => item.id !== id);
  if (db.dailyPosts.length < initLen) {
    schedulePersist();
    return true;
  }
  return false;
}

export function clearDailyPosts(): void {
  const db = loadDb();
  db.dailyPosts = [];
  schedulePersist();
}

// ==========================================
// PENDING DRAFTS (2-STEP TELEGRAM CONFIRMATION)
// ==========================================

export function getPendingDrafts(): PendingDraft[] {
  return loadDb().pendingDrafts || [];
}

export function addPendingDraft(draft: Omit<PendingDraft, 'id' | 'createdAt' | 'status'>): PendingDraft {
  const db = loadDb();
  if (!db.pendingDrafts) db.pendingDrafts = [];
  const newDraft: PendingDraft = {
    id: `draft_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
    ...draft,
  };
  db.pendingDrafts.unshift(newDraft);
  if (db.pendingDrafts.length > 50) {
    db.pendingDrafts = db.pendingDrafts.slice(0, 50);
  }
  schedulePersist();
  return newDraft;
}

export function getPendingDraft(id: string): PendingDraft | undefined {
  const db = loadDb();
  return (db.pendingDrafts || []).find((d) => d.id === id);
}

export function updatePendingDraft(
  id: string,
  changes: Partial<Pick<PendingDraft, 'targetType' | 'targetAccount' | 'targetGroupIds' | 'scheduledAt' | 'photos' | 'rawText'>>,
): PendingDraft | undefined {
  const draft = getPendingDraft(id);
  if (!draft || draft.status !== 'pending') return undefined;
  Object.assign(draft, changes);
  schedulePersist();
  return draft;
}

export function getLatestPendingDraftByTopic(
  topicId: number,
  creatorTelegramId?: number
): PendingDraft | undefined {
  const db = loadDb();
  const list = (db.pendingDrafts || []).filter((d) => d.telegramTopicId === topicId && d.status === 'pending');
  if (creatorTelegramId) {
    const userDraft = list.find((d) => d.creatorTelegramId === creatorTelegramId);
    if (userDraft) return userDraft;
  }
  return list[0];
}

export function confirmDraft(
  id: string,
  customScheduleTime?: string,
  targetType?: 'personal_post' | 'group_post' | 'both',
  targetAccount?: string
): { draft: PendingDraft; post?: DailyPost; template?: CommentTemplate } | null {
  const db = loadDb();
  if (!db.pendingDrafts) db.pendingDrafts = [];
  const draft = db.pendingDrafts.find((d) => d.id === id);
  if (!draft || draft.status !== 'pending') return null;

  draft.status = 'confirmed';
  if (customScheduleTime) {
    draft.scheduledTime = customScheduleTime;
  }
  if (targetType) {
    draft.targetType = targetType;
  }
  if (targetAccount) {
    draft.targetAccount = targetAccount;
  }

  let post: DailyPost | undefined;
  let template: CommentTemplate | undefined;

  if (draft.type === 'daily_post') {
    const isScheduled = !!draft.scheduledTime && draft.scheduledTime !== 'now';
    const finalTargetType = draft.targetType || targetType || 'personal_post';
    post = addDailyPost({
      type: finalTargetType,
      targetType: finalTargetType,
      content: draft.rawText,
      mediaUrls: draft.photos,
      targetAccounts: draft.targetAccount ? [draft.targetAccount] : undefined,
      targetGroupIds: draft.targetGroupIds,
      scheduledAt: draft.scheduledAt,
    });
    post.status = isScheduled ? 'scheduled' : 'confirmed';
    post.confirmedAt = new Date().toISOString();
    post.scheduledTime = draft.scheduledTime;
  } else if (draft.type === 'comment_template') {
    template = addCommentTemplate(draft.rawText);
  }

  schedulePersist();
  return { draft, post, template };
}

export function cancelDraft(id: string): PendingDraft | null {
  const db = loadDb();
  if (!db.pendingDrafts) db.pendingDrafts = [];
  const draft = db.pendingDrafts.find((d) => d.id === id);
  if (!draft || draft.status !== 'pending') return null;
  draft.status = 'cancelled';
  schedulePersist();
  return draft;
}

export function getTodayStats(): {
  date: string;
  postsCount: number;
  commentsCount: number;
  groupsCount: number;
  activeAccountsCount: number;
} {
  const db = loadDb();
  const todayStr = new Date().toISOString().slice(0, 10);
  const postsCount = (db.dailyPosts || []).filter((p) => p.createdAt.startsWith(todayStr)).length;
  const commentsCount = (db.logs || []).filter((l) => l.timestamp.startsWith(todayStr) && l.status === 'success').length;
  return {
    date: todayStr,
    postsCount,
    commentsCount,
    groupsCount: (db.groups || []).length,
    activeAccountsCount: 1,
  };
}

