import fs from 'fs';
import path from 'path';
import {
  calculateGeoProximityScore,
  findBuildingGeo,
  EcoparkBuildingGeo,
  ECOPARK_BUILDINGS,
} from './ecopark-geo.js';
import {
  ParsedProperty,
  parsePropertiesFromMultiLineText,
  extractBuildingAndProject,
  extractType,
  extractBedroom,
  extractPrice,
} from './ecopark-parser.js';
import { PropertyItem, MatchResult, generateTargetedComment } from './property-inventory.js';

export interface AiKeyItem {
  id: string;
  provider: 'gemini' | 'groq' | 'openrouter';
  apiKey: string;
  maskedKey: string;
  status: 'active' | 'rate_limited' | 'quota_exhausted' | 'invalid';
  cooldownUntil?: number; // timestamp ms
  lastUsedAt?: string;
  successCount: number;
  failCount: number;
  lastError?: string;
  addedAt: string;
}

export interface FreeAiConfig {
  provider: 'gemini' | 'groq' | 'openrouter' | 'offline';
  apiKey: string;
  keysPool: AiKeyItem[];
  autoFailover: boolean;
  autoCascadeProvider: boolean;
  cooldownSeconds: number;
  model: string;
  autoAiComment: boolean;
  systemPromptStyle: string;
  lastTestedAt?: string;
  status: 'ready' | 'not_configured' | 'error';
  lastError?: string;
  activeKeyId?: string;
  activeProvider?: string;
  totalKeysCount?: number;
  activeKeysCount?: number;
}

export interface CustomerDemand {
  targetLocation: string;
  building?: string;
  project?: string;
  type: 'rent' | 'sale';
  budgetMax?: number;
  budgetMin?: number;
  budgetText?: string;
  bedroom: string;
  furniture?: string;
  specialNeeds: string[];
  rawSummary: string;
}

export interface AiMatchAnalysis {
  demand: CustomerDemand;
  bestMatch: PropertyItem | null;
  matchResult: MatchResult | null;
  aiComment: string;
  confidenceScore: number;
  explanation: string;
  providerUsed?: string;
  keyUsedMasked?: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'ai_config.json');

/**
 * Che giấu chuỗi API Key
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

/**
 * Tự động nhận diện Provider từ tiền tố Key
 */
export function detectProviderFromKey(key: string, fallback: string = 'gemini'): 'gemini' | 'groq' | 'openrouter' {
  const clean = (key || '').trim();
  if (clean.startsWith('AIza')) return 'gemini';
  if (clean.startsWith('gsk_')) return 'groq';
  if (clean.startsWith('sk-or-')) return 'openrouter';
  if (fallback === 'groq' || fallback === 'openrouter') return fallback;
  return 'gemini';
}

/**
 * Đọc cấu hình Free AI hiện tại
 */
export function getAiConfig(): FreeAiConfig {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const envKey = process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || '';
  const envProvider = process.env.GEMINI_API_KEY ? 'gemini' : process.env.GROQ_API_KEY ? 'groq' : 'gemini';

  const defaults: FreeAiConfig = {
    provider: (envProvider as any) || 'gemini',
    apiKey: envKey,
    keysPool: [],
    autoFailover: true,
    autoCascadeProvider: true,
    cooldownSeconds: 60,
    model: 'gemini-1.5-flash',
    autoAiComment: true,
    systemPromptStyle: 'chuyên_nghiệp_thân_thiện',
    status: envKey ? 'ready' : 'not_configured',
  };

  if (envKey) {
    defaults.keysPool.push({
      id: 'key_env_default',
      provider: defaults.provider as any,
      apiKey: envKey,
      maskedKey: maskApiKey(envKey),
      status: 'active',
      successCount: 0,
      failCount: 0,
      addedAt: new Date().toISOString(),
    });
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2), 'utf-8');
    } catch {}
    return defaults;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const result: FreeAiConfig = { ...defaults, ...parsed };

    // Migrate legacy apiKey to keysPool if keysPool is empty
    if ((!result.keysPool || result.keysPool.length === 0) && result.apiKey) {
      result.keysPool = [{
        id: `key_${Date.now()}_legacy`,
        provider: (result.provider !== 'offline' ? result.provider : 'gemini') as any,
        apiKey: result.apiKey,
        maskedKey: maskApiKey(result.apiKey),
        status: 'active',
        successCount: 0,
        failCount: 0,
        addedAt: new Date().toISOString(),
      }];
    }

    // Auto clear expired cooldowns
    const now = Date.now();
    let activeCount = 0;
    for (const k of (result.keysPool || [])) {
      if (k.status === 'rate_limited' && k.cooldownUntil && now >= k.cooldownUntil) {
        k.status = 'active';
        k.cooldownUntil = undefined;
      }
      if (k.status === 'active') activeCount++;
    }

    result.totalKeysCount = (result.keysPool || []).length;
    result.activeKeysCount = activeCount;

    return result;
  } catch (err) {
    return defaults;
  }
}

/**
 * Lưu cấu hình Free AI
 */
export function saveAiConfig(update: Partial<FreeAiConfig>): FreeAiConfig {
  const current = getAiConfig();
  const pool = update.keysPool || current.keysPool || [];

  const updated: FreeAiConfig = {
    ...current,
    ...update,
    keysPool: pool,
    status: pool.length > 0 || update.apiKey || current.apiKey ? 'ready' : 'not_configured',
  };

  const now = Date.now();
  let activeCount = 0;
  for (const k of pool) {
    if (k.status === 'rate_limited' && k.cooldownUntil && now >= k.cooldownUntil) {
      k.status = 'active';
      k.cooldownUntil = undefined;
    }
    if (k.status === 'active') activeCount++;
  }
  updated.totalKeysCount = pool.length;
  updated.activeKeysCount = activeCount;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.error('[FreeAIService] Lỗi ghi cấu hình AI:', err);
  }

  return updated;
}

/**
 * Thêm một hoặc nhiều Key vào Bể Khóa Dự Phòng (Pool)
 */
export function addKeysToPool(rawKeysInput: string | string[], defaultProvider?: string): FreeAiConfig {
  const current = getAiConfig();
  const pool = current.keysPool || [];

  let keyStrings: string[] = [];
  if (Array.isArray(rawKeysInput)) {
    keyStrings = rawKeysInput;
  } else if (typeof rawKeysInput === 'string') {
    keyStrings = rawKeysInput
      .split(/[\n,;]+/)
      .map(k => k.trim())
      .filter(k => k.length > 6);
  }

  let addedCount = 0;
  for (const rawKey of keyStrings) {
    if (rawKey.includes('••••')) continue; // Bỏ qua key đã bị che

    // Kiểm tra trùng lặp
    const existing = pool.find(k => k.apiKey === rawKey);
    if (existing) {
      existing.status = 'active';
      existing.cooldownUntil = undefined;
      continue;
    }

    const detected = detectProviderFromKey(rawKey, defaultProvider || current.provider);
    pool.push({
      id: `key_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      provider: detected,
      apiKey: rawKey,
      maskedKey: maskApiKey(rawKey),
      status: 'active',
      successCount: 0,
      failCount: 0,
      addedAt: new Date().toISOString(),
    });
    addedCount++;
  }

  const primaryKey = pool.length > 0 ? pool[0].apiKey : current.apiKey;
  return saveAiConfig({
    keysPool: pool,
    apiKey: primaryKey,
    status: pool.length > 0 ? 'ready' : 'not_configured',
  });
}

/**
 * Xóa một Key khỏi Bể Khóa
 */
export function removeKeyFromPool(keyId: string): FreeAiConfig {
  const current = getAiConfig();
  const pool = (current.keysPool || []).filter(k => k.id !== keyId);
  const primaryKey = pool.length > 0 ? pool[0].apiKey : '';
  return saveAiConfig({
    keysPool: pool,
    apiKey: primaryKey,
    status: pool.length > 0 ? 'ready' : 'not_configured',
  });
}

/**
 * Reset trạng thái của 1 Key (từ rate_limited hoặc invalid về active)
 */
export function resetKeyStatus(keyId: string): FreeAiConfig {
  const current = getAiConfig();
  const pool = current.keysPool || [];
  const item = pool.find(k => k.id === keyId);
  if (item) {
    item.status = 'active';
    item.cooldownUntil = undefined;
    item.lastError = undefined;
  }
  return saveAiConfig({ keysPool: pool });
}

/**
 * Lớp điều phối dịch vụ Free AI với Bể Khóa Tự Động Failover & Chống Nghẽn 24/7
 */
export class FreeAiService {
  /**
   * Thực hiện gọi API trực tiếp tới nhà cung cấp
   */
  private async executeProviderCall(
    provider: string,
    apiKey: string,
    prompt: string,
    imageBase64?: string
  ): Promise<string> {
    if (provider === 'gemini') {
      const parts: any[] = [{ text: prompt }];
      if (imageBase64) {
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanBase64,
          },
        });
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
          },
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson.error?.message || `Gemini lỗi HTTP ${res.status}`;
        const err: any = new Error(msg);
        err.status = res.status;
        throw err;
      }

      const data = await res.json();
      const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!output) throw new Error('Gemini phản hồi dữ liệu rỗng.');
      return output;
    }

    if (provider === 'groq') {
      const url = 'https://api.groq.com/openai/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 1200,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson.error?.message || `Groq lỗi HTTP ${res.status}`;
        const err: any = new Error(msg);
        err.status = res.status;
        throw err;
      }

      const data = await res.json();
      const output = data.choices?.[0]?.message?.content;
      if (!output) throw new Error('Groq phản hồi dữ liệu rỗng.');
      return output;
    }

    if (provider === 'openrouter') {
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-exp:free',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 1200,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson.error?.message || `OpenRouter lỗi HTTP ${res.status}`;
        const err: any = new Error(msg);
        err.status = res.status;
        throw err;
      }

      const data = await res.json();
      const output = data.choices?.[0]?.message?.content;
      if (!output) throw new Error('OpenRouter phản hồi dữ liệu rỗng.');
      return output;
    }

    throw new Error(`Nhà cung cấp không hỗ trợ: ${provider}`);
  }

  /**
   * Gọi LLM với bể khóa dự phòng (Multi-Key Pool) và tự động Failover khi hết Quota / 429
   */
  public async callLlm(prompt: string, imageBase64?: string): Promise<{ text: string; providerUsed: string; keyUsedMasked: string }> {
    const config = getAiConfig();

    if (config.provider === 'offline') {
      throw new Error('Chế độ Offline đang được kích hoạt.');
    }

    let pool = config.keysPool || [];
    if (pool.length === 0 && config.apiKey) {
      pool = [{
        id: `key_${Date.now()}_legacy`,
        provider: config.provider as 'gemini' | 'groq' | 'openrouter',
        apiKey: config.apiKey,
        maskedKey: maskApiKey(config.apiKey),
        status: 'active',
        successCount: 0,
        failCount: 0,
        addedAt: new Date().toISOString(),
      }];
    }

    if (pool.length === 0) {
      throw new Error('Chưa cấu hình API Key nào trong Bể Khóa.');
    }

    // Tự động mở khóa các key đã hết thời gian cooldown
    const now = Date.now();
    for (const k of pool) {
      if (k.status === 'rate_limited' && k.cooldownUntil && now >= k.cooldownUntil) {
        k.status = 'active';
        k.cooldownUntil = undefined;
      }
    }

    // Xây dựng danh sách ứng viên theo thứ tự ưu tiên
    const preferredProvider = config.provider;
    const cascadeOrder = config.autoCascadeProvider
      ? [preferredProvider, 'gemini', 'groq', 'openrouter'].filter((v, i, a) => v !== 'offline' && a.indexOf(v) === i)
      : [preferredProvider];

    const candidateKeys: AiKeyItem[] = [];
    for (const prov of cascadeOrder) {
      const provKeys = pool.filter(k => k.provider === prov && k.status === 'active');
      // Sắp xếp cân bằng tải: ưu tiên key ít lượt dùng nhất
      provKeys.sort((a, b) => (a.successCount + a.failCount) - (b.successCount + b.failCount));
      candidateKeys.push(...provKeys);
    }

    if (candidateKeys.length === 0) {
      console.warn('[AI Failover] ⚠️ Tất cả Key đang cooldown hoặc hết quota. Chuyển sang Lõi NLP Offline.');
      throw new Error('Tất cả API Key đang trong thời gian giãn cách.');
    }

    let lastError: any = null;

    // VÒNG LẶP FAILOVER THỰC TẾ
    for (let i = 0; i < candidateKeys.length; i++) {
      const k = candidateKeys[i];
      try {
        console.log(`[AI Failover] 🚀 Đang thử Key ${k.maskedKey} (${k.provider.toUpperCase()}) - [Thử ${i + 1}/${candidateKeys.length}]...`);
        const text = await this.executeProviderCall(k.provider, k.apiKey, prompt, imageBase64);

        if (text && text.trim().length > 0) {
          k.successCount++;
          k.lastUsedAt = new Date().toISOString();
          k.status = 'active';
          k.lastError = undefined;

          saveAiConfig({
            keysPool: pool,
            activeKeyId: k.id,
            activeProvider: k.provider,
            status: 'ready',
          });

          return { text, providerUsed: k.provider, keyUsedMasked: k.maskedKey };
        }
      } catch (err: any) {
        lastError = err;
        k.failCount++;
        k.lastError = err.message || String(err);

        const isRateLimit = err.status === 429 || /rate limit|quota|resource_exhausted|429|too many requests/i.test(err.message);
        const isInvalid = err.status === 400 || err.status === 401 || err.status === 403 || /invalid_api_key|api key not valid|permission/i.test(err.message);

        if (isRateLimit) {
          const cooldownMs = (config.cooldownSeconds || 60) * 1000;
          k.status = 'rate_limited';
          k.cooldownUntil = Date.now() + cooldownMs;
          console.warn(`[AI Failover] ⚠️ Key ${k.maskedKey} (${k.provider}) chạm Quota 429! Cooldown ${config.cooldownSeconds || 60}s -> TỰ ĐỘNG CHUYỂN SANG KEY TIẾP THEO...`);
        } else if (isInvalid) {
          k.status = 'invalid';
          console.warn(`[AI Failover] ❌ Key ${k.maskedKey} (${k.provider}) không hợp lệ (${err.message}) -> Tự động loại khỏi bể...`);
        } else {
          k.status = 'rate_limited';
          k.cooldownUntil = Date.now() + 30000;
          console.warn(`[AI Failover] ⚠️ Kết nối tới ${k.maskedKey} gặp lỗi: ${err.message}. Đang chuyển tiếp sang key tiếp theo...`);
        }

        saveAiConfig({ keysPool: pool });
      }
    }

    throw new Error(`Tất cả ${candidateKeys.length} API Key đều không phản hồi: ${lastError?.message || 'Lỗi không xác định'}`);
  }

  /**
   * Kiểm tra kết nối API Key đơn lẻ
   */
  public async testConnection(provider: string, apiKey: string): Promise<{ success: boolean; message: string; modelUsed: string }> {
    if (!apiKey) {
      if (provider === 'offline') {
        return { success: true, message: 'Lõi NLP & GPS Offline sẵn sàng hoạt động 100%!', modelUsed: 'Ecopark NLP Engine' };
      }
      return { success: false, message: 'Vui lòng nhập API Key miễn phí.', modelUsed: '' };
    }

    try {
      if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Chào bạn, trả lời ngắn gọn: "OK FalconX Ecopark"' }] }],
            generationConfig: { maxOutputTokens: 20 },
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Lỗi HTTP ${res.status}`);
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'OK';
        return { success: true, message: `Kết nối Google Gemini thành công: "${text.trim()}"`, modelUsed: 'gemini-1.5-flash' };
      }

      if (provider === 'groq') {
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Say "OK FalconX"' }],
            max_tokens: 15,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Lỗi HTTP ${res.status}`);
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || 'OK';
        return { success: true, message: `Kết nối Groq Llama 3.3 thành công: "${text.trim()}"`, modelUsed: 'llama-3.3-70b-versatile' };
      }

      if (provider === 'openrouter') {
        const url = 'https://openrouter.ai/api/v1/chat/completions';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.0-flash-exp:free',
            messages: [{ role: 'user', content: 'Say OK' }],
            max_tokens: 10,
          }),
        });

        if (!res.ok) {
          throw new Error(`OpenRouter lỗi HTTP ${res.status}`);
        }

        return { success: true, message: 'Kết nối OpenRouter Free thành công!', modelUsed: 'gemini-2.0-flash-exp:free' };
      }

      return { success: true, message: 'Chế độ NLP Offline đã sẵn sàng.', modelUsed: 'Ecopark Offline Engine' };
    } catch (err: any) {
      return { success: false, message: `Lỗi kết nối API AI: ${err.message}`, modelUsed: '' };
    }
  }

  /**
   * Kiểm tra đồng loạt toàn bộ các Key trong Bể Khóa
   */
  public async testAllKeysInPool(): Promise<{ results: any[]; activeCount: number; totalCount: number }> {
    const config = getAiConfig();
    const pool = config.keysPool || [];
    const results: any[] = [];
    let activeCount = 0;

    for (const k of pool) {
      const test = await this.testConnection(k.provider, k.apiKey);
      if (test.success) {
        k.status = 'active';
        k.cooldownUntil = undefined;
        k.lastError = undefined;
        activeCount++;
      } else {
        k.status = 'invalid';
        k.lastError = test.message;
      }
      results.push({
        id: k.id,
        maskedKey: k.maskedKey,
        provider: k.provider,
        status: k.status,
        message: test.message,
      });
    }

    saveAiConfig({ keysPool: pool });
    return { results, activeCount, totalCount: pool.length };
  }

  /**
   * TÁC VỤ 1: Dùng AI Free phân loại và bóc tách dữ liệu căn nhập vào (từ văn bản hoặc ảnh)
   */
  public async classifyAndParsePropertiesWithAI(
    rawText: string,
    imageBase64?: string
  ): Promise<ParsedProperty[]> {
    const prompt = `
Bạn là Trợ lý AI chuyên gia BĐS Ecopark Hưng Yên. Nhiệm vụ: Phân tích nội dung tin nhắn hoặc bảng hàng dưới đây và bóc tách thành danh sách các căn hộ.
Nội dung nguồn:
"""
${rawText}
"""

DỮ LIỆU ĐỊA DANH ECOPARK CHUẨN:
- Cụm Vịnh Đảo: Sky Oasis (S1, S2, S3, S-Premium), Sol Forest (SO1, SO2), Haven Park (H1, H2), Swanlake Onsen (R1, R2, R3, Landmark L1, L2), The Island Bay, Grand Park Tokyo.
- Cụm Aqua Bay: Grand Park (Park 1, Park 2), Sky Residences (Lake 1, Lake 2), Central Lake, Marina Arc.
- Cụm Westbay: Westbay tháp A, B, C, D.
- Giai đoạn 1: Rừng Cọ (Dãy A, B, C, D, E), Phố Trúc, Phố Vườn Tùng, Vườn Mai.

Yêu cầu trả về DUY NHẤT một mảng JSON hợp lệ (không kèm giải thích markdown ngoài JSON), mỗi phần tử là 1 căn hộ có cấu trúc:
[
  {
    "project": "Tên dự án chuẩn (vd: Haven Park, Sol Forest, Sky Oasis, Westbay, Swanlake Onsen, Rừng Cọ)",
    "building": "Toà cụ thể nếu có (vd: Haven Park H2, Toà S2 Sky Oasis, Toà SO1 Sol Forest, Westbay C)",
    "cluster": "Cụm Vịnh Đảo | Cụm Aqua Bay | Cụm Westbay | Giai đoạn 1",
    "type": "rent (thuê) hoặc sale (bán)",
    "bedroom": "Studio | 1PN | 1N+1 | 2PN | 2N2VS | 3PN | Duplex",
    "bathroom": 1 hoặc 2,
    "price": giá tiền dạng số nguyên VND (vd: 7000000 hoặc 3500000000),
    "priceText": "7 Tr/tháng" hoặc "3.5 Tỷ",
    "furniture": "Full đồ | Cơ bản | Không đồ",
    "phone": "Số điện thoại liên hệ nếu có",
    "ownerNotes": "Đặc điểm nổi bật (vd: view hồ thiên nga, tầng trung thoáng, ban công ĐN...)",
    "rawText": "Câu gốc chứa thông tin căn này"
  }
]
`;

    try {
      const res = await this.callLlm(prompt, imageBase64);
      const jsonMatch = res.text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        const parsed: any[] = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item) => {
            const geo = findBuildingGeo(item.building || item.project);
            return {
              project: item.project || geo.project,
              building: item.building || geo.name,
              cluster: item.cluster || geo.cluster,
              type: item.type === 'sale' ? 'sale' : 'rent',
              bedroom: item.bedroom || '2PN',
              bathroom: item.bathroom || 1,
              price: typeof item.price === 'number' ? item.price : 0,
              priceText: item.priceText || (item.price ? `${item.price} đ` : 'Thỏa thuận'),
              furniture: item.furniture || 'Full đồ',
              phone: item.phone,
              ownerNotes: item.ownerNotes,
              rawText: item.rawText || `${item.project} ${item.bedroom} ${item.priceText}`,
            };
          });
        }
      }
    } catch (err: any) {
      console.warn('[FreeAIService] AI Cloud bóc tách gặp lỗi hoặc hết quota, chuyển sang bộ phân tích Regex Offline:', err.message);
    }

    // Fallback: Sử dụng bộ bóc tách Regex Ecopark Offline siêu chính xác (0 đồng, 0 nghẽn)
    return parsePropertiesFromMultiLineText(rawText);
  }

  /**
   * TÁC VỤ 2: Phân tích bài đăng của khách hàng bằng AI để bóc tách nhu cầu
   */
  public async analyzeCustomerPostWithAI(postContent: string): Promise<CustomerDemand> {
    const prompt = `
Phân tích bài viết tìm nhà/thuê nhà của khách hàng tại Ecopark:
"""
${postContent}
"""

Hãy bóc tách thành đối tượng JSON duy nhất:
{
  "targetLocation": "Địa điểm / toà / phân khu khách muốn (vd: Haven Park, Sol Forest, Vịnh Đảo, Westbay, toàn Ecopark...)",
  "project": "Tên dự án Ecopark dự đoán",
  "building": "Toà cụ thể nếu có",
  "type": "rent (thuê) hoặc sale (mua/bán)",
  "budgetMax": ngân sách tối đa dạng số VND (vd: 10000000),
  "budgetText": "Tầm giá khách nhắc tới (vd: 9-10tr)",
  "bedroom": "Studio | 1PN | 1N+1 | 2PN | 2N2VS | 3PN | Chưa rõ",
  "furniture": "Full đồ | Đồ cơ bản | Không yêu cầu",
  "specialNeeds": ["nuôi pet", "vào ở luôn", "tầng trung", ...],
  "rawSummary": "Tóm tắt ngắn gọn nhu cầu khách"
}
`;

    try {
      const res = await this.callLlm(prompt);
      const jsonMatch = res.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          targetLocation: parsed.targetLocation || 'Ecopark (Chung)',
          project: parsed.project,
          building: parsed.building,
          type: parsed.type === 'sale' ? 'sale' : 'rent',
          budgetMax: parsed.budgetMax,
          budgetText: parsed.budgetText,
          bedroom: parsed.bedroom || '2PN',
          furniture: parsed.furniture,
          specialNeeds: Array.isArray(parsed.specialNeeds) ? parsed.specialNeeds : [],
          rawSummary: parsed.rawSummary || postContent.slice(0, 100),
        };
      }
    } catch (err: any) {
      console.warn('[FreeAIService] AI bóc tách bài khách gặp lỗi hoặc hết quota, chuyển sang Offline NLP:', err.message);
    }

    // Fallback phân tích Offline
    const geo = extractBuildingAndProject(postContent);
    const type = extractType(postContent);
    const bed = extractBedroom(postContent);
    const pr = extractPrice(postContent, type);

    return {
      targetLocation: geo.building || geo.project,
      project: geo.project,
      building: geo.building,
      type,
      budgetMax: pr.price > 0 ? pr.price : undefined,
      budgetText: pr.priceText,
      bedroom: bed.bedroom,
      specialNeeds: [],
      rawSummary: `${geo.building || geo.project} - ${bed.bedroom} - ${pr.priceText}`,
    };
  }

  /**
   * TÁC VỤ 3: Tự động ghép căn gần nhất theo Google Maps & Haversine GPS Coordinates
   */
  public matchBestPropertyWithGeo(demand: CustomerDemand, availableProps: PropertyItem[]): MatchResult | null {
    if (!availableProps || availableProps.length === 0) return null;

    const requestedTarget = demand.building || demand.project || demand.targetLocation;
    const candidates: MatchResult[] = [];

    for (const prop of availableProps) {
      if (prop.type !== demand.type) continue;

      const reasons: string[] = [];

      // 1. Chấm điểm Khoảng cách Google Map (GPS Haversine - 40%)
      const propTarget = prop.building || prop.project;
      const geoProx = calculateGeoProximityScore(requestedTarget, propTarget);
      let geoScore = geoProx.score;

      if (requestedTarget !== 'Ecopark (Chung)') {
        if (geoProx.distanceKm === 0) {
          reasons.push(`Đúng toà/phân khu mục tiêu ${propTarget}`);
        } else {
          reasons.push(`${geoProx.text} so với ${requestedTarget}`);
        }
      } else {
        geoScore = 80;
      }

      // 2. Chấm điểm Giá tiền (35%)
      let budgetScore = 75;
      if (demand.budgetMax && demand.budgetMax > 0 && prop.price > 0) {
        const diff = (prop.price - demand.budgetMax) / demand.budgetMax;
        if (diff <= 0.05) {
          budgetScore = 100;
          reasons.push(`Đúng tầm tiền ngân sách (${prop.priceText})`);
        } else if (diff <= 0.20) {
          budgetScore = 80;
          reasons.push(`Sát tầm tiền (chênh nhẹ ~${Math.round(diff * 100)}%)`);
        } else {
          budgetScore = 30;
        }
      }

      // 3. Chấm điểm Loại phòng & Thiết kế (25%)
      let bedScore = 70;
      if (demand.bedroom && demand.bedroom !== 'Chưa rõ') {
        const reqB = demand.bedroom.toUpperCase();
        const propB = prop.bedroom.toUpperCase();
        if (reqB === propB) {
          bedScore = 100;
          reasons.push(`Chuẩn loại phòng ${prop.bedroom}`);
        } else if (reqB.includes('2') && propB.includes('2')) {
          bedScore = 85;
          reasons.push(`Gần đúng loại phòng (${prop.bedroom})`);
        } else {
          bedScore = 30;
        }
      }

      const totalScore = Math.round(geoScore * 0.40 + budgetScore * 0.35 + bedScore * 0.25);

      candidates.push({
        property: prop,
        score: totalScore,
        distanceKm: geoProx.distanceKm,
        distanceText: geoProx.text,
        reasons,
      });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (best.score < 40) return null;
    return best;
  }

  /**
   * TÁC VỤ 4: Sinh bình luận thông minh bằng AI (tự nhiên, thuyết phục, theo tọa độ & khoảng cách)
   */
  public async generateSmartCommentWithAI(
    postContent: string,
    matchedProp: PropertyItem,
    matchResult: MatchResult
  ): Promise<{ comment: string; providerUsed?: string; keyUsedMasked?: string }> {
    const config = getAiConfig();
    const buildingName = matchedProp.building || matchedProp.project;
    const distanceInfo = matchResult.distanceKm > 0
      ? `Toà này cách toà khách hỏi khoảng ${Math.round(matchResult.distanceKm * 1000)}m (đi bộ ~${Math.round(matchResult.distanceKm * 12)} phút).`
      : `Toà này CHÍNH LÀ toà khách đang hỏi (${buildingName}).`;

    const prompt = `
Bạn là chuyên viên tư vấn BĐS Ecopark duyên dáng, nhiệt tình, tinh tế của văn phòng Eco Trang.
Khách hàng vừa đăng bài trong nhóm cư dân Ecopark:
"""
${postContent}
"""

Hệ thống đã khớp được căn hộ tốt nhất trong quỹ căn:
- Dự án & Toà: ${buildingName} (${matchedProp.cluster})
- Khoảng cách Google Map: ${distanceInfo}
- Loại phòng: ${matchedProp.bedroom}
- Mức giá: ${matchedProp.priceText}
- Nội thất: ${matchedProp.furniture}
- Số liên hệ: ${matchedProp.phone || '0904555666'}

Yêu cầu viết 1 câu bình luận ngắn gọn (dưới 45 từ):
1. Thân thiện, tự nhiên, lịch sự như người thật nhắn, KHÔNG dùng từ ngữ máy móc, robot.
2. Nếu toà gần bên (cách vài trăm mét), khéo léo nói toà sát bên cạnh đi bộ vài bước chân rất tiện.
3. Kêu gọi khách check tin nhắn chờ hoặc inbox để gửi video/ảnh thực tế.
4. Kèm số điện thoại liên hệ nhẹ nhàng ở cuối.
Chỉ trả về DUY NHẤT nội dung bình luận, không kèm nháy kép hay lời dẫn.
`;

    try {
      if (config.provider !== 'offline') {
        const res = await this.callLlm(prompt);
        if (res.text && res.text.trim().length > 15) {
          const clean = res.text.trim().replace(/^["']|["']$/g, '');
          return { comment: clean, providerUsed: res.providerUsed, keyUsedMasked: res.keyUsedMasked };
        }
      }
    } catch (err: any) {
      console.warn('[FreeAIService] AI sinh comment lỗi hoặc hết quota, chuyển sang comment GPS tích hợp:', err.message);
    }

    // Fallback: Tạo comment GPS thông minh tích hợp sẵn
    return {
      comment: generateTargetedComment(matchedProp, matchResult),
      providerUsed: 'offline',
      keyUsedMasked: 'Lõi NLP GPS',
    };
  }

  /**
   * TÁC VỤ 5: Mô phỏng toàn trình dành cho UI Dashboard
   */
  public async simulateFullMatching(
    postContent: string,
    availableProps: PropertyItem[]
  ): Promise<AiMatchAnalysis> {
    const demand = await this.analyzeCustomerPostWithAI(postContent);
    const matchResult = this.matchBestPropertyWithGeo(demand, availableProps);

    let aiComment = '';
    let providerUsed = 'offline';
    let keyUsedMasked = 'Lõi NLP GPS';

    if (matchResult) {
      const generated = await this.generateSmartCommentWithAI(postContent, matchResult.property, matchResult);
      aiComment = generated.comment;
      providerUsed = generated.providerUsed || 'offline';
      keyUsedMasked = generated.keyUsedMasked || 'Lõi NLP GPS';
    } else {
      aiComment = 'Dạ em chào anh/chị, bên em có quỹ căn đa dạng toàn Ecopark đủ phân khu giá tốt. Anh/chị check tin nhắn em gửi thông tin chi tiết nhé ạ 🌸';
    }

    return {
      demand,
      bestMatch: matchResult ? matchResult.property : null,
      matchResult,
      aiComment,
      confidenceScore: matchResult ? matchResult.score : 0,
      explanation: matchResult
        ? `Đã khớp toà ${matchResult.property.building || matchResult.property.project} (${matchResult.distanceText}, giá ${matchResult.property.priceText})`
        : 'Không có căn cụ thể trùng khớp ngân sách hoặc phân khu trong kho.',
      providerUsed,
      keyUsedMasked,
    };
  }
}

export const freeAiService = new FreeAiService();
