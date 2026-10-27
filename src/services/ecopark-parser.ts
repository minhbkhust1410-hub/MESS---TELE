/**
 * ECOPARK REAL ESTATE PARSER (RULE-BASED NLP & REGEX)
 * Bóc tách đặc điểm BĐS Ecopark offline 100%, siêu nhanh, không tốn chi phí AI
 */

import { findBuildingGeo } from './ecopark-geo.js';

export interface ParsedProperty {
  project: string;
  building?: string;
  cluster?: string;
  type: 'rent' | 'sale';
  bedroom: string;
  bathroom?: number;
  area?: number;
  areaText?: string;
  price: number;
  priceText: string;
  furniture: 'Full đồ' | 'Cơ bản' | 'Thô' | 'Không rõ';
  phone?: string;
  ownerNotes?: string;
  rawText: string;
}

// Từ điển chi tiết từng toà nhà và phân khu Ecopark đối chiếu Google Maps
const ECOPARK_BUILDING_PATTERNS: { building: string; project: string; regex: RegExp }[] = [
  // Cụm Vịnh Đảo - Sky Oasis
  { building: 'Sky Oasis S-Premium', project: 'Sky Oasis', regex: /(?<!\p{L})(?:s-premium|s\s*premium|sprem|s-prem)(?!\p{L})/iu },
  { building: 'Sky Oasis S1', project: 'Sky Oasis', regex: /(?<!\p{L})(?:s1|toà\s*s1|toa\s*s1|tháp\s*s1)(?!\p{L})/iu },
  { building: 'Sky Oasis S2', project: 'Sky Oasis', regex: /(?<!\p{L})(?:s2|toà\s*s2|toa\s*s2|tháp\s*s2)(?!\p{L})/iu },
  { building: 'Sky Oasis S3', project: 'Sky Oasis', regex: /(?<!\p{L})(?:s3|toà\s*s3|toa\s*s3|tháp\s*s3)(?!\p{L})/iu },

  // Cụm Vịnh Đảo - Sol Forest
  { building: 'Sol Forest SO1', project: 'Sol Forest', regex: /(?<!\p{L})(?:so1|so-1|toà\s*so1|toa\s*so1|sf1|tháp\s*so1)(?!\p{L})/iu },
  { building: 'Sol Forest SO2', project: 'Sol Forest', regex: /(?<!\p{L})(?:so2|so-2|toà\s*so2|toa\s*so2|sf2|tháp\s*so2)(?!\p{L})/iu },

  // Cụm Vịnh Đảo - Haven Park
  { building: 'Haven Park H1', project: 'Haven Park', regex: /(?<!\p{L})(?:h1|toà\s*h1|toa\s*h1|tháp\s*h1)(?!\p{L})/iu },
  { building: 'Haven Park H2', project: 'Haven Park', regex: /(?<!\p{L})(?:h2|toà\s*h2|toa\s*h2|tháp\s*h2)(?!\p{L})/iu },

  // Cụm Vịnh Đảo - Sky Forest
  { building: 'Sky Forest', project: 'Sky Forest', regex: /(?<!\p{L})(?:sky\s*forest|skyforest|sf3)(?!\p{L})/iu },

  // Cụm Hồ Thiên Nga - Swanlake Onsen & Landmark
  { building: 'The Landmark L1', project: 'Swanlake Onsen', regex: /(?<!\p{L})(?:l1|toà\s*l1|toa\s*l1|landmark\s*1|landmark\s*l1)(?!\p{L})/iu },
  { building: 'The Landmark L2', project: 'Swanlake Onsen', regex: /(?<!\p{L})(?:l2|toà\s*l2|toa\s*l2|landmark\s*2|landmark\s*l2)(?!\p{L})/iu },
  { building: 'Swanlake Onsen R1', project: 'Swanlake Onsen', regex: /(?<!\p{L})(?:r1|toà\s*r1|toa\s*r1|onsen\s*r1|r1\s*onsen)(?!\p{L})/iu },
  { building: 'Swanlake Onsen R2', project: 'Swanlake Onsen', regex: /(?<!\p{L})(?:r2|toà\s*r2|toa\s*r2|onsen\s*r2|r2\s*onsen)(?!\p{L})/iu },
  { building: 'Swanlake Onsen R3', project: 'Swanlake Onsen', regex: /(?<!\p{L})(?:r3|toà\s*r3|toa\s*r3|onsen\s*r3|r3\s*onsen)(?!\p{L})/iu },

  // Cụm Westbay
  { building: 'Westbay Toà A', project: 'Westbay', regex: /(?<!\p{L})(?:toà\s*a\s*westbay|westbay\s*a|wba|wb-a|toà\s*a\s*wb)(?!\p{L})/iu },
  { building: 'Westbay Toà B', project: 'Westbay', regex: /(?<!\p{L})(?:toà\s*b\s*westbay|westbay\s*b|wbb|wb-b|toà\s*b\s*wb)(?!\p{L})/iu },
  { building: 'Westbay Toà C', project: 'Westbay', regex: /(?<!\p{L})(?:toà\s*c\s*westbay|westbay\s*c|wbc|wb-c|toà\s*c\s*wb)(?!\p{L})/iu },
  { building: 'Westbay Toà D', project: 'Westbay', regex: /(?<!\p{L})(?:toà\s*d\s*westbay|westbay\s*d|wbd|wb-d|toà\s*d\s*wb)(?!\p{L})/iu },

  // Cụm Aquabay
  { building: 'Aquabay Sky 1', project: 'Aquabay', regex: /(?<!\p{L})(?:sky\s*1\s*aqua|aqua\s*sky\s*1|sky1)(?!\p{L})/iu },
  { building: 'Aquabay Sky 2', project: 'Aquabay', regex: /(?<!\p{L})(?:sky\s*2\s*aqua|aqua\s*sky\s*2|sky2)(?!\p{L})/iu },
  { building: 'Aquabay Sky 3', project: 'Aquabay', regex: /(?<!\p{L})(?:sky\s*3\s*aqua|aqua\s*sky\s*3|sky3)(?!\p{L})/iu },
  { building: 'Aquabay Lake 1', project: 'Aquabay', regex: /(?<!\p{L})(?:lake\s*1|lake1)(?!\p{L})/iu },
  { building: 'Aquabay Lake 2', project: 'Aquabay', regex: /(?<!\p{L})(?:lake\s*2|lake2)(?!\p{L})/iu },
  { building: 'Aquabay Park 1', project: 'Aquabay', regex: /(?<!\p{L})(?:park\s*1|park1)(?!\p{L})/iu },
  { building: 'Aquabay Park 2', project: 'Aquabay', regex: /(?<!\p{L})(?:park\s*2|park2)(?!\p{L})/iu },

  // Cụm Rừng Cọ
  { building: 'Rừng Cọ Toà A', project: 'Rừng Cọ', regex: /(?<!\p{L})(?:toà\s*a\s*rừng\s*cọ|rừng\s*cọ\s*a|rc\s*a)(?!\p{L})/iu },
  { building: 'Rừng Cọ Toà B', project: 'Rừng Cọ', regex: /(?<!\p{L})(?:toà\s*b\s*rừng\s*cọ|rừng\s*cọ\s*b|rc\s*b)(?!\p{L})/iu },
  { building: 'Rừng Cọ Toà C', project: 'Rừng Cọ', regex: /(?<!\p{L})(?:toà\s*c\s*rừng\s*cọ|rừng\s*cọ\s*c|rc\s*c)(?!\p{L})/iu },
  { building: 'Rừng Cọ Toà D & E', project: 'Rừng Cọ', regex: /(?<!\p{L})(?:toà\s*[de]\s*rừng\s*cọ|rừng\s*cọ\s*[de]|rc\s*[de])(?!\p{L})/iu },

  // Meraki Residences
  { building: 'Meraki Residences', project: 'Meraki Residences', regex: /(?<!\p{L})(?:meraki|me\s*ra\s*ki)(?!\p{L})/iu },

  // Biệt Thự & Nhà Phố
  { building: 'Ecopark Grand The Island', project: 'Biệt Thự Đảo', regex: /(?<!\p{L})(?:ecopark\s*grand|biệt\s*thự\s*đảo|bt\s*đảo|vịnh\s*đảo\s*grand)(?!\p{L})/iu },
  { building: 'Shophouse Marina Arc', project: 'Marina Arc', regex: /(?<!\p{L})(?:marina\s*arc|arc\s*marina)(?!\p{L})/iu },
  { building: 'Nhà Phố Thủy Nguyên', project: 'Thủy Nguyên', regex: /(?<!\p{L})(?:thủy\s*nguyên|thuy\s*nguyen)(?!\p{L})/iu },
  { building: 'Nhà Phố Thảo Nguyên', project: 'Thảo Nguyên', regex: /(?<!\p{L})(?:thảo\s*nguyên|thao\s*nguyen)(?!\p{L})/iu },
  { building: 'Nhà Phố Thủy Trúc', project: 'Thủy Trúc', regex: /(?<!\p{L})(?:thủy\s*trúc|thuy\s*truc)(?!\p{L})/iu },
  { building: 'Biệt Thự Mimosa', project: 'Mimosa', regex: /(?<!\p{L})(?:mimosa|mi\s*mo\s*sa)(?!\p{L})/iu },
  { building: 'Biệt Thự Marina', project: 'Marina', regex: /(?<!\p{L})(?:biệt\s*thự\s*marina|bt\s*marina)(?!\p{L})/iu },
  { building: 'Biệt Thự Vườn Tùng', project: 'Vườn Tùng', regex: /(?<!\p{L})(?:vườn\s*tùng|vuon\s*tung)(?!\p{L})/iu },
  { building: 'Biệt Thự Vườn Mai', project: 'Vườn Mai', regex: /(?<!\p{L})(?:vườn\s*mai|vuon\s*mai)(?!\p{L})/iu },
  { building: 'Nhà Phố Trúc', project: 'Phố Trúc', regex: /(?<!\p{L})(?:phố\s*trúc|pho\s*truc)(?!\p{L})/iu },
  { building: 'Khu Đô Thị Park River', project: 'Park River', regex: /(?<!\p{L})(?:park\s*river|parkriver)(?!\p{L})/iu },
  { building: 'Làng Hà Lan', project: 'Làng Hà Lan', regex: /(?<!\p{L})(?:làng\s*hà\s*lan|lang\s*ha\s*lan)(?!\p{L})/iu },
  { building: 'Spring Valley', project: 'Spring Valley', regex: /(?<!\p{L})(?:spring\s*valley|springvalley)(?!\p{L})/iu },
];

// Từ điển phân khu chung (fallback khi không nhắc tên toà cụ thể)
const ECOPARK_PROJECTS: { name: string; aliases: RegExp }[] = [
  { name: 'Sky Oasis', aliases: /(?<!\p{L})(?:sky\s*oasis|skyoasis)(?!\p{L})/iu },
  { name: 'Haven Park', aliases: /(?<!\p{L})(?:haven\s*park|havenpark)(?!\p{L})/iu },
  { name: 'Sol Forest', aliases: /(?<!\p{L})(?:sol\s*forest|solforest)(?!\p{L})/iu },
  { name: 'Swanlake Onsen', aliases: /(?<!\p{L})(?:swanlake|swan\s*lake|onsen|khoáng\s*nóng)(?!\p{L})/iu },
  { name: 'Westbay', aliases: /(?<!\p{L})(?:westbay|west\s*bay|wb)(?!\p{L})/iu },
  { name: 'Aquabay', aliases: /(?<!\p{L})(?:aquabay|aqua\s*bay|sky\s*residences|grand\s*park)(?!\p{L})/iu },
  { name: 'Rừng Cọ', aliases: /(?<!\p{L})(?:rừng\s*cọ|rung\s*co)(?!\p{L})/iu },
  { name: 'Sky Forest', aliases: /(?<!\p{L})(?:sky\s*forest|skyforest)(?!\p{L})/iu },
  { name: 'Thảo Nguyên', aliases: /(?<!\p{L})(?:thảo\s*nguyên|thao\s*nguyen)(?!\p{L})/iu },
  { name: 'Thủy Nguyên', aliases: /(?<!\p{L})(?:thủy\s*nguyên|thuy\s*nguyen)(?!\p{L})/iu },
  { name: 'Vườn Mai / Vườn Tùng', aliases: /(?<!\p{L})(?:vườn\s*mai|vườn\s*tùng|park\s*river)(?!\p{L})/iu },
];

/**
 * Trích xuất tòa nhà và dự án Ecopark từ chuỗi text
 */
export function extractBuildingAndProject(text: string | any): {
  building?: string;
  project: string;
  cluster?: string;
} {
  const safeText = typeof text === 'string' ? text : (text?.content || text?.rawPost || String(text || ''));
  // 1. Tìm xem có khớp tòa nhà cụ thể không
  for (const item of ECOPARK_BUILDING_PATTERNS) {
    if (item.regex.test(safeText)) {
      const geo = findBuildingGeo(item.building);
      return {
        building: item.building,
        project: item.project,
        cluster: geo.cluster,
      };
    }
  }

  // 2. Nếu không có tên tòa, tìm dự án chung
  for (const item of ECOPARK_PROJECTS) {
    if (item.aliases.test(safeText)) {
      const geo = findBuildingGeo(item.name);
      return {
        project: item.name,
        cluster: geo.cluster,
      };
    }
  }

  return { project: 'Ecopark (Chung)' };
}

/**
 * Trích xuất dự án Ecopark từ chuỗi text (Backward compatible)
 */
export function extractProject(text: string): string {
  const result = extractBuildingAndProject(text);
  return result.project;
}

/**
 * Trích xuất loại hình: Thuê hoặc Bán
 */
export function extractType(text: string | any): 'rent' | 'sale' {
  const safeText = typeof text === 'string' ? text : (text?.content || text?.rawPost || String(text || ''));
  const rentKeywords = /\b(cho\s*thuê|thuê|thue|tháng|\/thang|\/th|cọc\s*[0-9]|homestay)\b/i;
  const saleKeywords = /\b(bán|chuyển\s*nhượng|nhượng|sổ\s*đỏ|bao\s*phí|tỷ|ty|tỉ)\b/i;

  if (rentKeywords.test(safeText) && !saleKeywords.test(safeText)) return 'rent';
  if (saleKeywords.test(safeText) && !rentKeywords.test(safeText)) return 'sale';

  // Nếu có từ tỷ thì ưu tiên bán
  if (/\b(?:tỷ|ty|tỉ)\b/i.test(safeText)) return 'sale';
  return 'rent'; // Mặc định ở Ecopark phân khúc thuê chiếm tỷ trọng lớn
}

/**
 * Trích xuất số phòng ngủ và vệ sinh theo chuẩn môi giới BĐS (VD: 2N2VS, 2N1VS, 1N+1, Studio...)
 */
export function extractBedroom(text: string | any): { bedroom: string; bathroom?: number } {
  const safeText = typeof text === 'string' ? text : (text?.content || text?.rawPost || String(text || ''));
  // Cú pháp đặc thù môi giới BĐS: 2N2VS, 2N1VS, 1N1VS, 3N2VS, 2PN2WC, 2PN1WC
  const nvsMatch = safeText.match(/\b([1-4])\s*(?:n|pn)\s*([1-3])\s*(?:vs|wc)\b/i);
  if (nvsMatch) {
    const beds = parseInt(nvsMatch[1], 10);
    const baths = parseInt(nvsMatch[2], 10);
    return {
      bedroom: `${beds}N${baths}VS`,
      bathroom: baths,
    };
  }

  if (/\b(studio|stu)\b/i.test(safeText)) return { bedroom: 'Studio', bathroom: 1 };
  if (/\b(1\s*pn\s*\+\s*1|1\s*n\s*\+\s*1)\b/i.test(safeText)) return { bedroom: '1PN+1' };
  if (/\b(1\s*pn|1\s*ngủ|1\s*phòng\s*ngủ|1\s*n)\b/i.test(safeText)) return { bedroom: '1PN' };
  if (/\b(2\s*pn\s*\+\s*1|2\s*n\s*\+\s*1)\b/i.test(safeText)) return { bedroom: '2PN+1' };
  if (/\b(2\s*pn|2\s*ngủ|2\s*phòng\s*ngủ|2\s*n)\b/i.test(safeText)) return { bedroom: '2PN' };
  if (/\b(3\s*pn|3\s*ngủ|3\s*phòng\s*ngủ|3\s*n)\b/i.test(safeText)) return { bedroom: '3PN' };
  if (/\b(duplex|penthouse|shophouse)\b/i.test(safeText)) return { bedroom: 'Đặc biệt (Duplex/Penthouse)' };

  return { bedroom: 'Chưa rõ' };
}

/**
 * Trích xuất diện tích căn hộ (VD: 83m², 83m2, 83m? do OCR nhận diện ²)
 */
export function extractArea(text: string): { area?: number; areaText?: string } {
  const match = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:m²|m2|m\?|mét\s*vuông|met\s*vuong)(?![0-9a-zA-Z])/i);
  if (match) {
    const val = parseFloat(match[1].replace(',', '.'));
    return { area: val, areaText: `${val}m²` };
  }
  return {};
}

/**
 * Trích xuất số phòng vệ sinh (WC)
 */
export function extractBathroom(text: string): number | undefined {
  const match = text.match(/([1-4])\s*(?:wc|ve\s*sinh|vệ\s*sinh)/i);
  if (match) return parseInt(match[1], 10);
  return undefined;
}

/**
 * Trích xuất mức giá (VND số thực và text hiển thị)
 */
export function extractPrice(text: string, type: 'rent' | 'sale'): { price: number; priceText: string } {
  // Tìm dạng số TỶ
  const tyMatch = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:tỷ|ty|tỉ)/i);
  if (tyMatch) {
    const val = parseFloat(tyMatch[1].replace(',', '.'));
    const price = Math.round(val * 1_000_000_000);
    return { price, priceText: `${val} Tỷ` };
  }

  // Tìm dạng số TRIỆU / TR
  const trMatch = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:tr|triệu|trieu|\/tháng|\/th)/i);
  if (trMatch) {
    const val = parseFloat(trMatch[1].replace(',', '.'));
    const price = Math.round(val * 1_000_000);
    return { price, priceText: `${val} Tr/tháng` };
  }

  // Tìm số đứng trước "tr" không dấu cách
  const directMatch = text.match(/([0-9]{1,2}(?:[.,][0-9]+)?)(?:tr)/i);
  if (directMatch) {
    const val = parseFloat(directMatch[1].replace(',', '.'));
    const price = Math.round(val * 1_000_000);
    return { price, priceText: `${val} Tr/tháng` };
  }

  return { price: 0, priceText: 'Thỏa thuận' };
}

/**
 * Trích xuất tình trạng nội thất
 */
export function extractFurniture(text: string): 'Full đồ' | 'Cơ bản' | 'Thô' | 'Không rõ' {
  if (/\b(full|full\s*đồ|đủ\s*đồ|full\s*nội\s*thất|xách\s*vali)\b/i.test(text)) return 'Full đồ';
  if (/\b(cơ\s*bản|co\s*ban|liền\s*tường|bếp\s*tủ|rèm\s*nóng\s*lạnh)\b/i.test(text)) return 'Cơ bản';
  if (/\b(thô|nguyên\s*bản)\b/i.test(text)) return 'Thô';
  return 'Full đồ'; // Phần lớn chung cư cho thuê ở Ecopark là full đồ
}

/**
 * Trích xuất số điện thoại (10 chữ số)
 */
export function extractPhone(text: string): string | undefined {
  const match = text.match(/(?:(?:\+84|0)(?:3[2-9]|5[6|8|9]|7[0|6-9]|8[1-9]|9[0-9])[0-9]{7})/);
  if (match) return match[0];
  return undefined;
}

/**
 * Phân tích 1 dòng text thành 1 căn hộ
 */
export function parseSingleProperty(line: string): ParsedProperty | null {
  const clean = line.trim();
  if (clean.length < 5) return null;

  const { building, project, cluster } = extractBuildingAndProject(clean);
  const type = extractType(clean);
  const bedObj = extractBedroom(clean);
  const bathroom = bedObj.bathroom || extractBathroom(clean);
  const { area, areaText } = extractArea(clean);
  const { price, priceText } = extractPrice(clean, type);
  const furniture = extractFurniture(clean);
  const phone = extractPhone(clean);

  // Nếu không nhận diện được ít nhất Dự án hoặc Số PN hoặc Giá thì có thể là câu chat thông thường
  if (project === 'Ecopark (Chung)' && bedObj.bedroom === 'Chưa rõ' && price === 0 && !area) {
    return null;
  }

  return {
    project,
    building,
    cluster,
    type,
    bedroom: bedObj.bedroom,
    bathroom,
    area,
    areaText,
    price,
    priceText,
    furniture,
    phone,
    rawText: clean,
  };
}

/**
 * Phân tích văn bản nhiều dòng (hỗ trợ cả dạng danh sách 1 dòng/căn và dạng 1 căn nhiều dòng chi tiết)
 */
export function parsePropertiesFromMultiLineText(fullText: string): ParsedProperty[] {
  const cleanFull = fullText.trim();
  if (!cleanFull) return [];

  // 1. Thử phân tích toàn bộ khối văn bản như 1 căn duy nhất (rất phổ biến khi copy tin nhắn Zalo mô tả 1 căn)
  const unifiedSingle = parseSingleProperty(cleanFull.replace(/\r?\n+/g, ' '));
  // Nếu nhận diện được cả phân khu/phòng và giá/diện tích thì đây chính là 1 căn hoàn chỉnh nhiều dòng
  if (
    unifiedSingle &&
    unifiedSingle.project !== 'Ecopark (Chung)' &&
    (unifiedSingle.price > 0 || unifiedSingle.area || unifiedSingle.bedroom !== 'Chưa rõ')
  ) {
    // Kiểm tra xem trong text có nhiều phân khu khác nhau không (nếu có thì là danh sách nhiều căn)
    const projectOccurrences = (cleanFull.match(/(?:sky\s*oasis|haven\s*park|sol\s*forest|rừng\s*cọ|westbay|aquabay|onsen)/gui) || []).length;
    if (projectOccurrences <= 1) {
      return [unifiedSingle];
    }
  }

  // 2. Thử tách theo các khối phân tách bằng 2 dòng trống hoặc tiêu đề số / icon nhà
  const blocks = cleanFull
    .split(/(?:\r?\n\s*\r?\n)|(?=(?:^|\r?\n)\s*(?:[0-9]+[.\-)]|[🏡🏠🏢🔹📌]))/g)
    .map((b) => b.trim())
    .filter((b) => b.length > 5);

  const results: ParsedProperty[] = [];

  for (const block of blocks) {
    const single = parseSingleProperty(block.replace(/\r?\n+/g, ' '));
    if (single) {
      results.push(single);
    }
  }

  if (results.length > 0) {
    return results;
  }

  // 3. Fallback: duyệt từng dòng đơn lẻ
  const lines = cleanFull
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 5);

  for (const line of lines) {
    const parsed = parseSingleProperty(line);
    if (parsed) {
      results.push(parsed);
    }
  }

  if (results.length === 0 && unifiedSingle) {
    results.push(unifiedSingle);
  }

  return results;
}
