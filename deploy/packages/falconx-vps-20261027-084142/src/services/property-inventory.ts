import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import {
  ParsedProperty,
  parsePropertiesFromMultiLineText,
  parseSingleProperty,
  extractProject,
  extractBuildingAndProject,
  extractType,
  extractBedroom,
  extractPrice,
} from './ecopark-parser.js';
import {
  calculateGeoProximityScore,
  findBuildingGeo,
  getProjectGeo,
  getDistanceBetweenProjects,
  EcoparkBuildingGeo,
} from './ecopark-geo.js';

export interface PropertyItem extends ParsedProperty {
  id: string;
  source: 'telegram_text' | 'telegram_image' | 'web_manual' | 'web_image';
  status: 'available' | 'reserved' | 'done';
  createdAt: string;
  matchedPostsCount: number;
  building?: string;
  cluster?: string;
  geoCoords?: { lat: number; lng: number };
  images?: string[];
}

interface PropertyInventoryDb {
  properties: PropertyItem[];
  lastUpdated: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'property_inventory.json');

function ensureDb(): PropertyInventoryDb {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const initial: PropertyInventoryDb = {
      properties: [],
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[PropertyInventory] Lỗi đọc DB, tạo mới:', err);
    const initial: PropertyInventoryDb = {
      properties: [],
      lastUpdated: new Date().toISOString(),
    };
    return initial;
  }
}

function saveDb(db: PropertyInventoryDb) {
  try {
    db.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('[PropertyInventory] Lỗi ghi DB:', err);
  }
}

/**
 * Lấy toàn bộ danh sách quỹ căn trong kho
 */
export function getAllProperties(): PropertyItem[] {
  const db = ensureDb();
  return db.properties || [];
}

/**
 * Lấy danh sách căn đang sẵn sàng bắt khách (status === 'available')
 */
export function getAvailableProperties(): PropertyItem[] {
  return getAllProperties().filter((p) => p.status === 'available');
}

/**
 * Thêm một hoặc nhiều căn vào kho
 */
export function addProperties(
  items: ParsedProperty[],
  source: PropertyItem['source'] = 'telegram_text',
  images: string[] = []
): PropertyItem[] {
  const db = ensureDb();
  const added: PropertyItem[] = [];

  for (const item of items) {
    const geo = findBuildingGeo(item.building || item.project);
    const newProp: PropertyItem = {
      ...item,
      id: `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      source,
      status: 'available',
      createdAt: new Date().toISOString(),
      matchedPostsCount: 0,
      building: item.building || geo.name,
      cluster: item.cluster || geo.cluster,
      geoCoords: { lat: geo.lat, lng: geo.lng },
      images: images.length > 0 ? images : undefined,
    };
    db.properties.unshift(newProp);
    added.push(newProp);
  }

  saveDb(db);
  return added;
}

/**
 * Cập nhật trạng thái hoặc thông tin căn hộ
 */
export function updateProperty(
  id: string,
  update: Partial<PropertyItem>
): PropertyItem | null {
  const db = ensureDb();
  const prop = db.properties.find((p) => p.id === id);
  if (!prop) return null;

  Object.assign(prop, update);
  saveDb(db);
  return prop;
}

/**
 * Chuyển trạng thái căn hộ: available <-> done
 */
export function togglePropertyStatus(id: string): PropertyItem | null {
  const db = ensureDb();
  const prop = db.properties.find((p) => p.id === id);
  if (!prop) return null;

  prop.status = prop.status === 'available' ? 'done' : 'available';
  saveDb(db);
  return prop;
}

/**
 * Xóa căn khỏi kho
 */
export function deleteProperty(id: string): boolean {
  const db = ensureDb();
  const initialLen = db.properties.length;
  db.properties = db.properties.filter((p) => p.id !== id);
  if (db.properties.length !== initialLen) {
    saveDb(db);
    return true;
  }
  return false;
}

/**
 * Tăng số lần căn này đã được tự động bình luận / khớp khách
 */
export function incrementMatchedCount(id: string) {
  const db = ensureDb();
  const prop = db.properties.find((p) => p.id === id);
  if (prop) {
    prop.matchedPostsCount = (prop.matchedPostsCount || 0) + 1;
    saveDb(db);
  }
}

/**
 * OCR Nhận diện chữ từ ảnh bằng Tesseract.js (Chạy offline nội bộ trên máy, hoàn toàn miễn phí)
 */
export async function extractTextFromImage(
  imagePathOrBuffer: string | Buffer
): Promise<string> {
  console.log('🔍 [Tesseract OCR] Đang phân tích chữ từ ảnh bảng hàng...');
  let worker: any = null;
  try {
    worker = await createWorker(['vie', 'eng'], undefined, {
      errorHandler: (e) => console.warn('[Tesseract Worker Warning]', e),
    });
    const ret = await worker.recognize(imagePathOrBuffer);
    const text = ret.data.text || '';
    console.log(`✅ [Tesseract OCR] Đã đọc xong ảnh! Kích thước văn bản: ${text.length} ký tự.`);
    return text;
  } catch (err: any) {
    console.error('❌ [Tesseract OCR] Lỗi nhận diện chữ từ ảnh:', err.message);
    throw err;
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }
}

/**
 * Nạp căn trực tiếp từ ảnh (OCR Tesseract -> Ecopark Parser -> Lưu vào Kho)
 */
export async function ingestPropertiesFromImage(
  imagePathOrBuffer: string | Buffer,
  source: PropertyItem['source'] = 'telegram_image'
): Promise<{ textExtracted: string; properties: PropertyItem[] }> {
  const text = await extractTextFromImage(imagePathOrBuffer);
  const parsedItems = parsePropertiesFromMultiLineText(text);
  const added = addProperties(parsedItems, source);
  return {
    textExtracted: text,
    properties: added,
  };
}

/**
 * Nạp căn từ chuỗi text thô (Tích hợp AI Phân Loại Thông Minh)
 */
export function ingestPropertiesFromText(
  text: string,
  source: PropertyItem['source'] = 'telegram_text'
): PropertyItem[] {
  const parsedItems = parsePropertiesFromMultiLineText(text);
  return addProperties(parsedItems, source);
}

/**
 * Nạp căn từ chuỗi text thô sử dụng Free AI
 */
export async function ingestPropertiesFromTextWithAI(
  text: string,
  source: PropertyItem['source'] = 'web_manual'
): Promise<PropertyItem[]> {
  try {
    const { freeAiService } = await import('./free-ai-service.js');
    const parsedItems = await freeAiService.classifyAndParsePropertiesWithAI(text);
    if (parsedItems && parsedItems.length > 0) {
      return addProperties(parsedItems, source);
    }
  } catch (err) {
    console.warn('[PropertyInventory] AI Ingestion fallback sang Offline Parser:', err);
  }
  return ingestPropertiesFromText(text, source);
}

/**
 * Nhận diện ảnh bảng hàng qua Free AI Vision & OCR
 */
export async function ingestPropertiesFromImageWithAI(
  imageBuffer: Buffer,
  source: PropertyItem['source'] = 'web_image'
): Promise<{ textExtracted: string; properties: PropertyItem[] }> {
  try {
    const { freeAiService } = await import('./free-ai-service.js');
    const base64 = imageBuffer.toString('base64');
    const aiParsed = await freeAiService.classifyAndParsePropertiesWithAI('Hãy bóc tách bảng hàng trong ảnh này', base64).catch(() => []);
    if (aiParsed && aiParsed.length > 0) {
      const added = addProperties(aiParsed, source);
      return {
        textExtracted: 'Bóc tách thành công qua Free AI Vision (Gemini)',
        properties: added,
      };
    }
  } catch {}

  // Fallback sang Tesseract OCR
  return ingestPropertiesFromImage(imageBuffer, source);
}

/**
 * Lấy danh sách căn mới nạp trong ngày hôm nay (today)
 */
export function getTodayProperties(): PropertyItem[] {
  const props = getAllProperties();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return props.filter((p) => {
    if (!p.createdAt) return false;
    const d = new Date(p.createdAt);
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return dStr === todayStr;
  });
}

/**
 * Thống kê tình trạng kho nguồn trong ngày
 */
export function getPropertyInventoryStats() {
  const props = getAllProperties();
  const available = props.filter((p) => p.status === 'available');
  const rent = props.filter((p) => p.type === 'rent');
  const sale = props.filter((p) => p.type === 'sale');
  const done = props.filter((p) => p.status === 'done');
  const todayProps = getTodayProperties();

  // Thống kê theo phân khu
  const byProject: Record<string, number> = {};
  for (const p of props) {
    byProject[p.project] = (byProject[p.project] || 0) + 1;
  }

  return {
    total: props.length,
    todayCount: todayProps.length,
    availableCount: available.length,
    doneCount: done.length,
    rentCount: rent.length,
    saleCount: sale.length,
    byProject,
  };
}

export interface MatchResult {
  property: PropertyItem;
  score: number;
  distanceKm: number;
  distanceText: string;
  reasons: string[];
}

/**
 * Tìm căn hộ trong kho khớp nhất theo Đa Tiêu Chí BĐS Ecopark:
 * 1. Nhu cầu (Thuê / Bán) -> Bắt buộc trùng
 * 2. Khoảng cách địa lý Google Map Ecopark (Haversine) -> Ưu tiên căn gần nhất
 * 3. Tầm tiền -> Lệch ngân sách khách < 15%
 * 4. Loại phòng & Diện tích (2N2VS, 2PN, 1PN, Studio, 83m²...)
 */
export function findBestMatchingPropertyWithDistance(postContent: string): MatchResult | null {
  const available = getAvailableProperties();
  if (available.length === 0) return null;

  const requestedGeo = extractBuildingAndProject(postContent);
  const requestedTarget = requestedGeo.building || requestedGeo.project;
  const requestedType = extractType(postContent);
  const requestedBedObj = extractBedroom(postContent);
  const requestedPrice = extractPrice(postContent, requestedType);

  const candidates: MatchResult[] = [];

  for (const prop of available) {
    // 1. Phải cùng loại hình (Thuê hoặc Bán)
    if (prop.type !== requestedType) continue;

    const reasons: string[] = [];

    // 2. Chấm điểm Khoảng cách Google Map Ecopark (Weight 35%)
    const propTarget = prop.building || prop.project;
    const geoProx = calculateGeoProximityScore(requestedTarget, propTarget);
    let geoScore = geoProx.score;
    if (requestedTarget !== 'Ecopark (Chung)') {
      if (geoProx.distanceKm === 0) {
        reasons.push(`Đúng toà/phân khu ${propTarget}`);
      } else {
        reasons.push(`${geoProx.text} so với ${requestedTarget}`);
      }
    } else {
      geoScore = 75; // Khách hỏi chung toàn Ecopark
    }

    // 3. Chấm điểm Tầm tiền (Weight 35%)
    let budgetScore = 75;
    if (requestedPrice.price > 0 && prop.price > 0) {
      const diffPercent = Math.abs(prop.price - requestedPrice.price) / requestedPrice.price;
      if (diffPercent <= 0.08) {
        budgetScore = 100;
        reasons.push(`Đúng chuẩn tầm tiền (~${prop.priceText})`);
      } else if (diffPercent <= 0.18) {
        budgetScore = 80;
        reasons.push(`Sát tầm tiền (chênh ${Math.round(diffPercent * 100)}%)`);
      } else if (diffPercent <= 0.35) {
        budgetScore = 50;
      } else {
        budgetScore = 20;
      }
    } else {
      reasons.push(`Giá ${prop.priceText}`);
    }

    // 4. Chấm điểm Loại phòng & Diện tích (Weight 30%)
    let bedScore = 70;
    if (requestedBedObj.bedroom !== 'Chưa rõ') {
      const reqBed = requestedBedObj.bedroom.toUpperCase();
      const propBed = prop.bedroom.toUpperCase();

      if (reqBed === propBed) {
        bedScore = 100;
        reasons.push(`Đúng loại phòng ${prop.bedroom}`);
      } else if (
        (reqBed.includes('2N') && propBed.includes('2N')) ||
        (reqBed.includes('2PN') && propBed.includes('2N')) ||
        (reqBed.includes('2N') && propBed.includes('2PN')) ||
        (reqBed.includes('1PN') && propBed.includes('1N'))
      ) {
        bedScore = 85;
        reasons.push(`Gần đúng loại phòng (${prop.bedroom})`);
      } else if (reqBed.includes('2') && propBed.includes('1N+1')) {
        bedScore = 60;
        reasons.push(`Giải pháp thay thế 1N+1`);
      } else {
        bedScore = 25;
      }
    }

    // Tính tổng điểm Matching
    const totalScore = Math.round(geoScore * 0.35 + budgetScore * 0.35 + bedScore * 0.30);

    candidates.push({
      property: prop,
      score: totalScore,
      distanceKm: geoProx.distanceKm,
      distanceText: geoProx.text,
      reasons,
    });
  }

  if (candidates.length === 0) return null;

  // Sắp xếp theo điểm cao nhất
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (best.score < 45) return null;
  return best;
}

/**
 * Tìm căn hộ trong kho khớp nhất với nhu cầu trong bài viết của khách (tích hợp khoảng cách Google Map)
 */
export function findBestMatchingProperty(postContent: string): PropertyItem | null {
  const result = findBestMatchingPropertyWithDistance(postContent);
  return result ? result.property : null;
}

/**
 * Tạo bình luận tự nhiên, thuyết phục dựa trên căn hộ khớp và khoảng cách địa lý
 */
export function generateTargetedComment(prop: PropertyItem, matchResult?: MatchResult | null): string {
  const areaPart = prop.areaText ? ` (${prop.areaText})` : '';
  const buildingDisplay = prop.building || prop.project;

  // Nếu vị trí căn ở toà kế bên (khoảng cách > 0 và <= 600m), thông báo khéo léo cho khách
  if (matchResult && matchResult.distanceKm > 0 && matchResult.distanceKm <= 0.6) {
    const meters = Math.round(matchResult.distanceKm * 1000);
    return `Dạ em có căn ${prop.bedroom} ở ${buildingDisplay}${areaPart} ngay sát bên (cách chỉ ~${meters}m đi bộ) cực đẹp, giá ${prop.priceText}, ${prop.furniture.toLowerCase()} vào ở ngay. Anh/chị check tin nhắn chờ em gửi video thực tế nhé ạ 🌸${prop.phone ? ` (LH: ${prop.phone})` : ''}`;
  }

  const templates = [
    `Dạ em có sẵn căn ${prop.bedroom} ${buildingDisplay}${areaPart} ${prop.furniture.toLowerCase()}, giá ${prop.priceText} vào ở ngay. Anh/chị check tin nhắn chờ em gửi video chi tiết nhé ạ 🌸${prop.phone ? ` (Hotline: ${prop.phone})` : ''}`,
    `Bên em vừa trống căn ${prop.bedroom} ${buildingDisplay}${areaPart} cực đẹp ${prop.priceText}, full đồ xịn. Anh/chị check hộp thư đến em gửi thông tin và ảnh thực tế nhé! 🏡${prop.phone ? ` Zalo: ${prop.phone}` : ''}`,
    `Căn ${prop.bedroom} ${buildingDisplay}${areaPart} đúng nhu cầu của anh/chị đây ạ, giá ${prop.priceText}. Em vừa gửi ảnh qua inbox, anh/chị xem thử nha ✨${prop.phone ? ` SĐT: ${prop.phone}` : ''}`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

