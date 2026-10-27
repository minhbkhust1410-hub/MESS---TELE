import fs from 'fs';
import path from 'path';

export interface CannedRepliesMap {
  [key: string]: string;
}

const CANNED_FILE = path.resolve('./data/canned_replies.json');

const defaultReplies: CannedRepliesMap = {
  stk: '💳 THÔNG TIN CHUYỂN KHOẢN:\n• Ngân hàng: Quân Đội (MB Bank)\n• Số tài khoản: 0988888888\n• Chủ tài khoản: NGUYEN VAN A\n• Nội dung: [Tên của bạn]',
  diachi: '📍 ĐỊA CHỈ LIÊN HỆ:\n• 123 Đường Cầu Giấy, Quận Cầu Giấy, Hà Nội\n• Hotline: 0988.888.888\n• Mở cửa: 8h30 - 22h00 tất cả các ngày.',
  gia: '🏷️ BẢNG GIÁ DỊCH VỤ:\n• Gói Cơ Bản: 150.000đ / tháng\n• Gói Pro: 350.000đ / 3 tháng\n• Gói VIP Trọn Đời: 990.000đ\n(Bảo hành & Hỗ trợ kỹ thuật 24/7)',
  chao: 'Dạ shop xin chào bạn! Cảm ơn bạn đã nhắn tin. Shop có thể hỗ trợ gì cho bạn ngay bây giờ ạ? 😊',
};

export function loadCannedReplies(): CannedRepliesMap {
  if (fs.existsSync(CANNED_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CANNED_FILE, 'utf-8'));
    } catch {
      return defaultReplies;
    }
  }
  const dir = path.dirname(CANNED_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CANNED_FILE, JSON.stringify(defaultReplies, null, 2), 'utf-8');
  return defaultReplies;
}

export function saveCannedReply(key: string, content: string): void {
  const all = loadCannedReplies();
  all[key.toLowerCase().replace(/^\//, '').trim()] = content.trim();
  fs.writeFileSync(CANNED_FILE, JSON.stringify(all, null, 2), 'utf-8');
}
