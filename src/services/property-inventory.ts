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
      errorHandler: (e: any) => console.warn('[Tesseract Worker Warning]', e),
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

/**
 * Câu bình luận mặc định bên BĐS Ecopark khi không phát hiện có nhu cầu gần hoặc vị trí/ngân sách khách hỏi rất xa nguồn trong kho
 */
export const BDS_ECOPARK_FALLBACK_COMMENT = 'LH/Zalo: 0981992137 hoặc ib e có ngay ạ';

export interface MatchResult {
  property: PropertyItem;
  score: number;
  distanceKm: number;
  distanceMeters?: number;
  distanceText: string;
  isNearMatch: boolean;
  requestedLocation?: string;
  requestedCoords?: { lat: number; lng: number };
  propertyCoords?: { lat: number; lng: number };
  matchedKeywords?: string[];
  reasons: string[];
}

/**
 * Tìm căn hộ trong kho khớp nhất theo Đa Tiêu Chí BĐS Ecopark + Tọa Độ GPS Haversine:
 * 1. Nhu cầu (Thuê / Bán) & Từ khóa phân loại (Keyword Classification)
 * 2. Khoảng cách địa lý Google Map Ecopark (GPS Haversine: lat, lng) -> Ưu tiên căn cùng tòa / cùng cụm (< 1.0km)
 * 3. Tầm tiền -> Lệch ngân sách khách <= 25%
 * 4. Loại phòng & Diện tích (2N2VS, 2PN, 1PN, Studio, 3PN, Biệt thự...)
 * Nếu khoảng cách xa (> 1.0km) hoặc lệch loại phòng/tầm tiền xa -> đánh dấu isNearMatch = false để trả về câu bình luận chuẩn:
 * "LH/Zalo: 0981992137 hoặc ib e có ngay ạ"
 */
export function findBestMatchingPropertyWithDistance(postInput: string | any): MatchResult | null {
  const available = getAvailableProperties();
  if (available.length === 0) return null;

  const postContent =
    typeof postInput === 'string'
      ? postInput
      : postInput?.rawPost || postInput?.content || String(postInput || '');
  const lowerContent = postContent.toLowerCase();

  // Kiểm tra trường hợp khách hỏi khu vực ngoài Ecopark rất xa (Hà Nội nội thành, Ocean Park, Vinhomes, Văn Giang xa...)
  const FAR_OUTSIDE_KEYWORDS = [
    'ocean park',
    'vinhomes',
    'times city',
    'royal city',
    'cầu giấy',
    'mỹ đình',
    'hà đông',
    'tây hồ',
    'đống đa',
    'thanh xuân',
    'long biên',
    'gia lâm',
  ];
  const isOutsideEcopark =
    FAR_OUTSIDE_KEYWORDS.some((kw) => lowerContent.includes(kw)) && !lowerContent.includes('ecopark');

  const requestedGeo = extractBuildingAndProject(postContent);
  const hasSpecificLocation = requestedGeo.project !== 'Ecopark (Chung)' || Boolean(requestedGeo.building);
  const requestedTarget = requestedGeo.building || requestedGeo.project;
  const reqGeoInfo = findBuildingGeo(requestedTarget);
  const requestedType = extractType(postContent);
  const requestedBedObj = extractBedroom(postContent);
  const requestedPrice = extractPrice(postContent, requestedType);

  // Bóc tách danh sách từ khóa nhu cầu khớp được trong bình luận/bài viết của khách
  const matchedKeywords: string[] = [];
  if (requestedType === 'rent') matchedKeywords.push('Thuê căn hộ');
  else matchedKeywords.push('Mua / Chuyển nhượng');
  if (hasSpecificLocation) matchedKeywords.push(requestedTarget);
  if (requestedBedObj.bedroom !== 'Chưa rõ') matchedKeywords.push(requestedBedObj.bedroom);
  if (requestedPrice.price > 0) matchedKeywords.push(requestedPrice.priceText);

  const candidates: MatchResult[] = [];

  for (const prop of available) {
    // 1. Phải cùng loại hình (Thuê hoặc Bán)
    if (prop.type !== requestedType) continue;

    const reasons: string[] = [];
    const propTarget = prop.building || prop.project;
    const propGeoInfo = findBuildingGeo(propTarget);
    const propCoords = prop.geoCoords || { lat: propGeoInfo.lat, lng: propGeoInfo.lng };

    // 2. Tính khoảng cách tọa độ GPS thực tế (Haversine) giữa vị trí khách tìm và căn trong kho
    let geoScore = 92;
    let distanceKm = 0;
    let distanceMeters = 0;
    let distanceText = `Trung tâm Ecopark (${propTarget})`;

    if (hasSpecificLocation) {
      const prox = calculateGeoProximityScore(requestedTarget, propTarget);
      geoScore = prox.score;
      distanceKm = prox.distanceKm;
      distanceMeters = prox.distanceMeters;
      distanceText = prox.text;
      reasons.push(`📍 GPS: ${prox.text} [${propCoords.lat.toFixed(4)}, ${propCoords.lng.toFixed(4)}]`);
    } else {
      reasons.push(`📍 GPS Ecopark: ${propTarget} [${propCoords.lat.toFixed(4)}, ${propCoords.lng.toFixed(4)}]`);
    }

    // 3. Chấm điểm Tầm tiền
    let budgetScore = 85;
    let isBudgetFar = false;
    if (requestedPrice.price > 0 && prop.price > 0) {
      const diffPercent = Math.abs(prop.price - requestedPrice.price) / requestedPrice.price;
      if (diffPercent <= 0.15) {
        budgetScore = 100;
        reasons.push(`💰 Đúng tầm tiền (~${prop.priceText})`);
      } else if (diffPercent <= 0.28) {
        budgetScore = 82;
        reasons.push(`💰 Sát tầm tiền (~${prop.priceText})`);
      } else {
        budgetScore = 35;
        isBudgetFar = true;
        reasons.push(`⚠️ Lệch ngân sách (${prop.priceText} so với ${requestedPrice.priceText})`);
      }
    } else {
      reasons.push(`💰 Giá ${prop.priceText}`);
    }

    // 4. Chấm điểm Loại phòng & Diện tích
    let bedScore = 85;
    let isBedroomFar = false;
    if (requestedBedObj.bedroom !== 'Chưa rõ') {
      const reqBed = requestedBedObj.bedroom.toUpperCase();
      const propBed = prop.bedroom.toUpperCase();

      if (reqBed === propBed) {
        bedScore = 100;
        reasons.push(`🛏️ Đúng chuẩn loại phòng ${prop.bedroom}`);
      } else if (
        (reqBed.includes('2N') && propBed.includes('2N')) ||
        (reqBed.includes('2PN') && propBed.includes('2N')) ||
        (reqBed.includes('2N') && propBed.includes('2PN')) ||
        (reqBed.includes('1PN') && propBed.includes('1N')) ||
        (reqBed.includes('1N') && propBed.includes('1PN'))
      ) {
        bedScore = 92;
        reasons.push(`🛏️ Khớp loại phòng (${prop.bedroom})`);
      } else if (
        (reqBed.includes('STUDIO') && propBed.includes('1')) ||
        (reqBed.includes('1') && propBed.includes('STUDIO'))
      ) {
        bedScore = 75;
        reasons.push(`🛏️ Gần loại phòng (${prop.bedroom})`);
      } else {
        bedScore = 35;
        isBedroomFar = true;
        reasons.push(`⚠️ Khác loại phòng (${prop.bedroom} so với ${requestedBedObj.bedroom})`);
      }
    }

    // 5. Tổng hợp điểm theo trọng số (ưu tiên Khoảng cách tọa độ GPS khi khách chỉ định tòa/phân khu)
    const totalScore = hasSpecificLocation
      ? Math.round(geoScore * 0.45 + budgetScore * 0.3 + bedScore * 0.25)
      : Math.round(budgetScore * 0.55 + bedScore * 0.45);

    // Kiểm tra lệch phân khúc thấp tầng (Biệt thự / Nhà phố / Shophouse) vs Căn hộ chung cư
    const asksLowRise = /biệt thự|nhà phố|liền kề|shophouse|villa/i.test(postContent);
    const propIsLowRise = /biệt thự|nhà phố|liền kề|shophouse|villa|vườn tùng|vườn mai|park river|thủy nguyên|the island/i.test(
      `${prop.project} ${prop.building || ''} ${prop.rawText || ''}`
    );
    const isCategoryMismatch = asksLowRise !== propIsLowRise;

    // Xác định nhu cầu có "Gần nguồn trong kho" (isNearMatch) hay "Rất xa / Lệch nhu cầu"
    const isDifferentCluster =
      hasSpecificLocation && reqGeoInfo.cluster !== propGeoInfo.cluster && distanceKm > 0.35;
    const isGeoFar = isOutsideEcopark || isDifferentCluster || (hasSpecificLocation && distanceKm > 0.65);
    const isNearMatch =
      !isGeoFar && !isCategoryMismatch && !isBudgetFar && !isBedroomFar && totalScore >= 75;

    candidates.push({
      property: prop,
      score: totalScore,
      distanceKm,
      distanceMeters,
      distanceText,
      isNearMatch,
      requestedLocation: hasSpecificLocation ? requestedTarget : 'Ecopark (Chung)',
      requestedCoords: { lat: reqGeoInfo.lat, lng: reqGeoInfo.lng },
      propertyCoords: propCoords,
      matchedKeywords,
      reasons,
    });
  }

  if (candidates.length === 0) return null;

  // Ưu tiên căn có isNearMatch === true và điểm cao nhất, gần tọa độ GPS nhất
  candidates.sort((a, b) => {
    if (a.isNearMatch !== b.isNearMatch) return a.isNearMatch ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.distanceKm - b.distanceKm;
  });

  return candidates[0];
}

/**
 * Tìm căn hộ trong kho khớp gần nhất với nhu cầu trong bài viết/bình luận của khách
 * Chỉ trả về PropertyItem nếu căn đó thực sự GẦN nhu cầu (isNearMatch === true)
 */
export function findBestMatchingProperty(postContent: string): PropertyItem | null {
  const result = findBestMatchingPropertyWithDistance(postContent);
  return result && result.isNearMatch ? result.property : null;
}

/**
 * Tạo bình luận tự nhiên dựa trên căn hộ khớp gần trong kho.
 * Nếu không phát hiện nhu cầu gần hoặc khoảng cách GPS/nhu cầu rất xa (isNearMatch === false),
 * trả về đúng câu chuẩn bên BĐS Ecopark: "LH/Zalo: 0981992137 hoặc ib e có ngay ạ"
 */
export function generateTargetedComment(prop?: PropertyItem | null, matchResult?: MatchResult | null): string {
  if (!prop || (matchResult && !matchResult.isNearMatch)) {
    return BDS_ECOPARK_FALLBACK_COMMENT;
  }

  const areaPart = prop.areaText ? ` (${prop.areaText})` : '';
  const buildingDisplay = prop.building || prop.project;
  const nearGeoNote =
    matchResult && matchResult.distanceMeters && matchResult.distanceMeters > 0 && matchResult.distanceMeters <= 850
      ? ` (ngay sát vị trí anh/chị tìm ~${matchResult.distanceMeters}m)`
      : '';

  const templates = [
    `Dạ em có sẵn căn ${prop.bedroom} ${buildingDisplay}${areaPart}${nearGeoNote} ${prop.furniture.toLowerCase()}, giá ${prop.priceText} vào ở ngay. ${BDS_ECOPARK_FALLBACK_COMMENT}`,
    `Bên em đang trống căn ${prop.bedroom} ${buildingDisplay}${areaPart}${nearGeoNote} cực đẹp giá ${prop.priceText}, ${prop.furniture.toLowerCase()}. ${BDS_ECOPARK_FALLBACK_COMMENT}`,
    `Căn ${prop.bedroom} ${buildingDisplay}${areaPart}${nearGeoNote} đúng nhu cầu anh/chị tìm đây ạ, giá ${prop.priceText}. ${BDS_ECOPARK_FALLBACK_COMMENT}`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Phân tích toàn diện câu bình luận / bài viết của khách bên BĐS Ecopark
 * và trả về câu phản hồi chuẩn xác (Gần nguồn -> báo chi tiết căn; Xa nguồn/không rõ -> "LH/Zalo: 0981992137 hoặc ib e có ngay ạ")
 */
export function evaluateBdsCustomerComment(customerText: string): {
  isNearMatch: boolean;
  matchResult: MatchResult | null;
  suggestedComment: string;
  distanceKm: number;
  distanceText: string;
  reason: string;
  demand: {
    type: 'rent' | 'sale';
    bedroom: string;
    budgetText: string;
    targetLocation: string;
    building: string;
    project: string;
  };
} {
  const requestedGeo = extractBuildingAndProject(customerText);
  const requestedType = extractType(customerText);
  const requestedBed = extractBedroom(customerText);
  const requestedPrice = extractPrice(customerText, requestedType);
  const demand = {
    type: requestedType,
    bedroom: requestedBed.bedroom,
    budgetText: requestedPrice.priceText,
    targetLocation: requestedGeo.building || requestedGeo.project,
    building: requestedGeo.building || requestedGeo.project,
    project: requestedGeo.project,
  };

  const matchResult = findBestMatchingPropertyWithDistance(customerText);
  if (matchResult && matchResult.isNearMatch) {
    return {
      isNearMatch: true,
      matchResult,
      suggestedComment: generateTargetedComment(matchResult.property, matchResult),
      distanceKm: matchResult.distanceKm,
      distanceText: matchResult.distanceText,
      reason: matchResult.reasons.join(' · '),
      demand,
    };
  }
  return {
    isNearMatch: false,
    matchResult,
    suggestedComment: BDS_ECOPARK_FALLBACK_COMMENT,
    distanceKm: matchResult ? matchResult.distanceKm : 9.9,
    distanceText: matchResult ? matchResult.distanceText : 'Xa nguồn quỹ căn (> 1km)',
    reason: matchResult
      ? `Xa nguồn / lệch nhu cầu (${matchResult.distanceText}) ➔ Dùng bình luận chuẩn Ecopark`
      : 'Không có căn gần trong kho ➔ Dùng bình luận chuẩn Ecopark',
    demand,
  };
}

