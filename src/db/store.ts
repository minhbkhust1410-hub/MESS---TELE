import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';

// Lưu con trỏ hàm fs nguyên bản từ hệ điều hành (tránh bị monkey-patching xóa mất)
const realFs = {
  readFileSync: fs.readFileSync,
  writeFileSync: fs.writeFileSync,
  existsSync: fs.existsSync,
  mkdirSync: fs.mkdirSync,
};

export interface ThreadMapping {
  id: number;
  fb_thread_id: string;
  telegram_topic_id: number;
  customer_name: string;
  customer_avatar?: string;
  tag?: 'chot_don' | 'hoi_gia' | 'khach_huy' | 'vip' | 'moi';
  created_at: string;
  last_message_at: string;
}

export interface SentMessageCache {
  source: 'telegram' | 'facebook';
  fb_thread_id: string;
  content_hash: string;
  timestamp: number;
}

export interface FacebookAccount {
  id: string; // e.g. "acc_100033213825091"
  uid: string;
  name: string;
  avatar?: string;
  proxy?: string; // e.g. "103.152.112.5:8080" or "http://user:pass@ip:port" or "ip:port:user:pass"
  verifiedProxyIp?: string;
  proxyStatus?: 'live' | 'dead' | 'unassigned' | 'checking';
  proxyCountry?: string;
  proxyCity?: string;
  proxyLatencyMs?: number;
  lastProxyCheckAt?: string;
  profileDir: string;
  status: 'active' | 'live' | 'disconnected' | 'pin_required' | 'checkpoint' | 'proxy_error';
  isDefault: boolean;
  cookies?: Array<{ name: string; value: string; domain: string; path: string; expires?: number }>;
  ownerId?: string; // ID của User quản lý nick này
  fbUsername?: string; // Tài khoản (email/SĐT/UID) để tự động đăng nhập lại
  fbPassword?: string; // Mật khẩu để tự động đăng nhập lại
  twoFactorSecret?: string; // Mã 2FA / TOTP nếu có
  role?: 'master' | 'satellite' | 'warmup'; // Phân vai Nick Chính / Nick Vệ Tinh / Làm Ấm 48h
  warmupMode?: boolean; // Chế độ làm ấm tự động giảm 70% tốc độ tác vụ
  verticalMode?: 'bds_ecopark' | 'forex_finance' | 'both'; // Phân mảng độc lập: BĐS Ecopark / Forex Tài Chính / Cả 2
  waveGroup?: number; // Nhóm luân phiên (Wave 1..34) khi chạy 40-100 nick
  createdAt: string;
  lastActiveAt: string;
}

interface DatabaseSchema {
  nextId: number;
  mappings: ThreadMapping[];
  cache: SentMessageCache[];
  accounts?: FacebookAccount[];
}

const defaultAccounts: FacebookAccount[] = [
  {
    id: 'acc_main',
    uid: '100033213825091',
    name: 'Anh Minh Trading',
    avatar: 'https://graph.facebook.com/100033213825091/picture?type=large',
    proxy: '',
    profileDir: './.user-data/fb-profile',
    status: 'active',
    isDefault: true,
    role: 'master',
    verticalMode: 'bds_ecopark',
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  },
];

const defaultData: DatabaseSchema = {
  nextId: 1,
  mappings: [],
  cache: [],
  accounts: defaultAccounts,
};

let memoryDb: DatabaseSchema | null = null;
let saveTimeout: NodeJS.Timeout | null = null;

/**
 * Chuẩn hóa profileDir khi đồng bộ từ máy khác về (tránh lỗi EPERM mkdir C:\Users\Administrator\...)
 */
export function normalizeProfileDir(profileDir: string | undefined, accountId: string): string {
  const clean = (profileDir || '').trim();
  if (!clean) return `./.user-data/profiles/${accountId}`;

  const isAbs = path.isAbsolute(clean) || /^[a-zA-Z]:[\\/]/.test(clean);
  if (!isAbs) return clean;

  const cwdNorm = path.resolve(process.cwd()).replace(/\\/g, '/').toLowerCase();
  const cleanNorm = clean.replace(/\\/g, '/').toLowerCase();
  if (cleanNorm === cwdNorm || cleanNorm.startsWith(cwdNorm + '/')) {
    return clean;
  }

  const userDataMatch = clean.replace(/\\/g, '/').match(/\/(\.user-data\/.+)$/i);
  if (userDataMatch && userDataMatch[1]) {
    return `./${userDataMatch[1]}`;
  }

  const folderName = path.basename(clean.replace(/[\\/]+$/, '')) || accountId;
  return `./.user-data/profiles/${folderName}`;
}

function loadDatabase(): DatabaseSchema {
  if (memoryDb) return memoryDb;

  // 1. Đọc sao lưu bảo vệ vĩnh viễn từ .user-data/accounts_vault_local.json trước tiên
  const backupVaultPath = path.resolve(process.cwd(), '.user-data/accounts_vault_local.json');
  let backupAccs: FacebookAccount[] = [];
  try {
    if (realFs.existsSync(backupVaultPath)) {
      const backupRaw = realFs.readFileSync(backupVaultPath, 'utf8');
      const parsed = JSON.parse(backupRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        backupAccs = parsed;
      }
    }
  } catch {}

  const dbFile = config.dbPath;
  const dbDir = path.dirname(dbFile);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(dbFile)) {
    try {
      const content = fs.readFileSync(dbFile, 'utf-8');
      memoryDb = JSON.parse(content);
    } catch {
      memoryDb = { ...defaultData };
    }
  } else {
    memoryDb = { ...defaultData };
  }

  if (!memoryDb) {
    memoryDb = { ...defaultData };
  }

  // Khôi phục tài khoản từ backup vault nếu memoryDb bị thiếu hoặc rỗng
  if (!memoryDb.accounts || memoryDb.accounts.length === 0) {
    memoryDb.accounts = backupAccs.length > 0 ? backupAccs : [...defaultAccounts];
  } else if (backupAccs.length > memoryDb.accounts.length) {
    // Merge: nếu backupAccs có nhiều tài khoản hơn (ví dụ các nick vệ tinh)
    const existingIds = new Set(memoryDb.accounts.map(a => a.id));
    for (const bAcc of backupAccs) {
      if (!existingIds.has(bAcc.id)) {
        memoryDb.accounts.push(bAcc);
        existingIds.add(bAcc.id);
      }
    }
  }

  if (Array.isArray(memoryDb.accounts)) {
    for (const acc of memoryDb.accounts) {
      acc.profileDir = normalizeProfileDir(acc.profileDir, acc.id);
      if (!acc.verticalMode) {
        acc.verticalMode = /trading|forex|fx|vàng|gold/i.test(acc.name || '') ? 'forex_finance' : 'bds_ecopark';
      }
    }
  }

  return memoryDb!;
}

function persistNow(): void {
  if (!memoryDb) return;
  const dbFile = config.dbPath;
  const dbDir = path.dirname(dbFile);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const tempFile = `${dbFile}.tmp`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(memoryDb, null, 2), 'utf-8');
    fs.renameSync(tempFile, dbFile);
  } catch (err) {
    console.error('[DB] Lỗi ghi dữ liệu:', err);
  }

  // Luôn ghi đè bản sao bất tử vào .user-data (không bao giờ bị xóa khi khởi động lại máy)
  try {
    const backupVaultDir = path.resolve(process.cwd(), '.user-data');
    if (!realFs.existsSync(backupVaultDir)) realFs.mkdirSync(backupVaultDir, { recursive: true });
    const backupVaultPath = path.join(backupVaultDir, 'accounts_vault_local.json');
    if (memoryDb.accounts && memoryDb.accounts.length > 0) {
      realFs.writeFileSync(backupVaultPath, JSON.stringify(memoryDb.accounts, null, 2), 'utf8');
    }
  } catch {}
}

function schedulePersist(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(persistNow, 400);
}

export function getMappingByFbThread(fbThreadId: string): ThreadMapping | null {
  const db = loadDatabase();
  return db.mappings.find((m) => m.fb_thread_id === fbThreadId) || null;
}

export function getMappingByTopicId(topicId: number): ThreadMapping | null {
  const db = loadDatabase();
  return db.mappings.find((m) => m.telegram_topic_id === topicId) || null;
}

export function saveThreadMapping(data: {
  fb_thread_id: string;
  telegram_topic_id: number;
  customer_name: string;
  customer_avatar?: string;
}): void {
  const db = loadDatabase();
  const existing = db.mappings.find((m) => m.fb_thread_id === data.fb_thread_id);
  const now = new Date().toISOString();

  if (existing) {
    existing.telegram_topic_id = data.telegram_topic_id;
    existing.customer_name = data.customer_name;
    if (data.customer_avatar) existing.customer_avatar = data.customer_avatar;
    existing.last_message_at = now;
  } else {
    db.mappings.push({
      id: db.nextId++,
      fb_thread_id: data.fb_thread_id,
      telegram_topic_id: data.telegram_topic_id,
      customer_name: data.customer_name,
      customer_avatar: data.customer_avatar,
      created_at: now,
      last_message_at: now,
    });
  }

  schedulePersist();
}

export function updateLastActive(fbThreadId: string): void {
  const db = loadDatabase();
  const item = db.mappings.find((m) => m.fb_thread_id === fbThreadId);
  if (item) {
    item.last_message_at = new Date().toISOString();
    schedulePersist();
  }
}

export function updateCustomerTag(fbThreadId: string, tag: ThreadMapping['tag']): ThreadMapping | null {
  const db = loadDatabase();
  const item = db.mappings.find((m) => m.fb_thread_id === fbThreadId);
  if (item) {
    item.tag = tag;
    schedulePersist();
    return item;
  }
  return null;
}

export function updateCustomerTagByTopic(topicId: number, tag: ThreadMapping['tag']): ThreadMapping | null {
  const db = loadDatabase();
  const item = db.mappings.find((m) => m.telegram_topic_id === topicId);
  if (item) {
    item.tag = tag;
    schedulePersist();
    return item;
  }
  return null;
}

export function getAllMappings(): ThreadMapping[] {
  const db = loadDatabase();
  return [...db.mappings].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
}

export function isEchoMessage(fbThreadId: string, contentHash: string): boolean {
  const db = loadDatabase();
  const halfMinuteAgo = Date.now() - 30000;
  const clean = contentHash.replace(/^(bạn|you)\s*:\s*/i, '').trim();

  return db.cache.some(
    (c) =>
      c.fb_thread_id === fbThreadId &&
      (c.content_hash === clean || contentHash.includes(c.content_hash) || c.content_hash.includes(clean)) &&
      c.timestamp > halfMinuteAgo
  );
}

export function isEchoFromTelegram(fbThreadId: string, contentHash: string): boolean {
  const db = loadDatabase();
  const halfMinuteAgo = Date.now() - 45000;
  const clean = contentHash.replace(/^(bạn|you)\s*:\s*/i, '').trim();
  const isMediaSnippet = /bạn đã gửi|you sent|đã gửi.*ảnh|đã gửi.*video|sent a photo|sent a video/i.test(contentHash);

  return db.cache.some(
    (c) =>
      c.source === 'telegram' &&
      c.fb_thread_id === fbThreadId &&
      c.timestamp > halfMinuteAgo &&
      (
        c.content_hash === clean ||
        contentHash.includes(c.content_hash) ||
        c.content_hash.includes(clean) ||
        (isMediaSnippet && (c.content_hash.includes('ảnh') || c.content_hash.includes('video') || c.content_hash.includes('media')))
      )
  );
}

export function recordSentMessage(source: 'telegram' | 'facebook', fbThreadId: string, contentHash: string): void {
  const db = loadDatabase();
  db.cache.push({
    source,
    fb_thread_id: fbThreadId,
    content_hash: contentHash,
    timestamp: Date.now(),
  });

  const oneHourAgo = Date.now() - 3600000;
  db.cache = db.cache.filter((c) => c.timestamp >= oneHourAgo);
  schedulePersist();
}

export function getAllAccounts(): FacebookAccount[] {
  const db = loadDatabase();
  return db.accounts || [];
}

export function getAccountById(id: string): FacebookAccount | null {
  const db = loadDatabase();
  return (db.accounts || []).find((a) => a.id === id) || null;
}

export function getDefaultAccount(): FacebookAccount {
  const db = loadDatabase();
  const accs = db.accounts || [];
  return (
    accs.find((a) => a.isDefault) ||
    accs[0] || {
      id: 'acc_main',
      uid: '100033213825091',
      name: 'Anh Minh Trading',
      avatar: '',
      proxy: '',
      profileDir: './.user-data/fb-profile',
      status: 'active',
      isDefault: true,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    }
  );
}

export function parseFacebookCookieInput(
  rawInput?: string | Array<{ name: string; value: string; domain?: string; path?: string; expires?: number }>
): Array<{ name: string; value: string; domain: string; path: string; expires?: number }> | undefined {
  if (!rawInput) return undefined;
  if (Array.isArray(rawInput)) {
    return rawInput
      .filter((c) => c && c.name && c.value)
      .map((c) => ({
        name: String(c.name).trim(),
        value: String(c.value).trim(),
        domain: c.domain || '.facebook.com',
        path: c.path || '/',
        ...(c.expires ? { expires: c.expires } : {}),
      }));
  }

  const trimmed = String(rawInput).trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parseFacebookCookieInput(parsed);
    } catch {}
  }

  // Raw semicolon cookie string: c_user=1000...; xs=...; datr=...
  const pairs = trimmed.split(';').map((s) => s.trim()).filter(Boolean);
  const cookies: Array<{ name: string; value: string; domain: string; path: string }> = [];
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const name = pair.slice(0, eqIdx).trim();
      const value = pair.slice(eqIdx + 1).trim();
      if (name && value) {
        cookies.push({
          name,
          value,
          domain: '.facebook.com',
          path: '/',
        });
      }
    }
  }
  return cookies.length > 0 ? cookies : undefined;
}

export function saveAccount(acc: Partial<FacebookAccount> & { id: string }): FacebookAccount {
  const db = loadDatabase();
  if (!db.accounts) db.accounts = [];
  const idx = db.accounts.findIndex((a) => a.id === acc.id);
  const now = new Date().toISOString();

  if (idx >= 0) {
    db.accounts[idx] = {
      ...db.accounts[idx],
      ...acc,
      profileDir: normalizeProfileDir(acc.profileDir ?? db.accounts[idx].profileDir, acc.id),
      lastActiveAt: now,
    };
    schedulePersist();
    return db.accounts[idx];
  } else {
    const newAcc: FacebookAccount = {
      id: acc.id,
      uid: acc.uid || '',
      name: acc.name || 'Tài khoản Facebook mới',
      avatar: acc.avatar || (acc.uid ? `https://graph.facebook.com/${acc.uid}/picture?type=large` : ''),
      proxy: acc.proxy ? acc.proxy.trim() : '',
      verifiedProxyIp: acc.verifiedProxyIp,
      proxyStatus: acc.proxyStatus || (acc.proxy ? 'checking' : 'unassigned'),
      proxyCountry: acc.proxyCountry,
      proxyCity: acc.proxyCity,
      proxyLatencyMs: acc.proxyLatencyMs,
      lastProxyCheckAt: acc.lastProxyCheckAt,
      ownerId: acc.ownerId || '',
      profileDir: normalizeProfileDir(acc.profileDir, acc.id),
      status: acc.status || 'live',
      isDefault: acc.isDefault !== undefined ? acc.isDefault : db.accounts.length === 0,
      cookies: acc.cookies,
      fbUsername: acc.fbUsername,
      fbPassword: acc.fbPassword,
      twoFactorSecret: acc.twoFactorSecret,
      role: acc.role || 'satellite',
      warmupMode: acc.warmupMode ?? false,
      verticalMode: acc.verticalMode || 'bds_ecopark',
      waveGroup: acc.waveGroup,
      createdAt: now,
      lastActiveAt: now,
    };
    if (newAcc.isDefault) {
      db.accounts.forEach((a) => (a.isDefault = false));
      newAcc.isDefault = true;
    }
    db.accounts.push(newAcc);
    schedulePersist();
    return newAcc;
  }
}

export function setDefaultAccount(id: string): boolean {
  const db = loadDatabase();
  if (!db.accounts) return false;
  let found = false;
  db.accounts.forEach((a) => {
    if (a.id === id) {
      a.isDefault = true;
      a.status = 'active';
      found = true;
    } else {
      a.isDefault = false;
    }
  });
  if (found) schedulePersist();
  return found;
}

export function updateAccountProxy(id: string, proxy: string): FacebookAccount | null {
  const db = loadDatabase();
  if (!db.accounts) return null;
  const acc = db.accounts.find((a) => a.id === id);
  if (!acc) return null;
  acc.proxy = proxy.trim();
  acc.verifiedProxyIp = undefined;
  acc.proxyStatus = acc.proxy ? 'checking' : 'unassigned';
  acc.lastProxyCheckAt = new Date().toISOString();
  schedulePersist();
  return acc;
}

export function updateAccountProxyVerification(
  id: string,
  data: {
    verifiedProxyIp?: string;
    proxyStatus?: 'live' | 'dead' | 'unassigned' | 'checking';
    proxyCountry?: string;
    proxyCity?: string;
    proxyLatencyMs?: number;
  }
): FacebookAccount | null {
  const db = loadDatabase();
  if (!db.accounts) return null;
  const acc = db.accounts.find((a) => a.id === id);
  if (!acc) return null;
  if (data.verifiedProxyIp !== undefined) acc.verifiedProxyIp = data.verifiedProxyIp;
  if (data.proxyStatus !== undefined) acc.proxyStatus = data.proxyStatus;
  if (data.proxyCountry !== undefined) acc.proxyCountry = data.proxyCountry;
  if (data.proxyCity !== undefined) acc.proxyCity = data.proxyCity;
  if (data.proxyLatencyMs !== undefined) acc.proxyLatencyMs = data.proxyLatencyMs;
  acc.lastProxyCheckAt = new Date().toISOString();
  schedulePersist();
  return acc;
}

export function deleteAccount(id: string): boolean {
  const db = loadDatabase();
  if (!db.accounts) return false;
  const initialLen = db.accounts.length;
  db.accounts = db.accounts.filter((a) => a.id !== id);
  if (db.accounts.length < initialLen) {
    if (db.accounts.length > 0 && !db.accounts.some((a) => a.isDefault)) {
      db.accounts[0].isDefault = true;
    }
    schedulePersist();
    return true;
  }
  return false;
}
