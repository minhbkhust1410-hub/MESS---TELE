const assert = require('assert');

// 1. Kiểm thử Logic Chuẩn Hóa Chuỗi Văn Bản (Chống [object Object])
function sanitizeCommentText(commentText) {
  let safeCommentText = '';
  if (typeof commentText === 'string') {
    safeCommentText = commentText;
  } else if (commentText && typeof commentText === 'object') {
    safeCommentText = commentText.comment || commentText.text || commentText.body || String(commentText);
  }
  if (!safeCommentText || safeCommentText.trim() === '' || safeCommentText === '[object Object]') {
    safeCommentText = 'Dạ em có căn phù hợp nhu cầu của anh/chị, anh/chị check tin nhắn chờ em gửi thông tin chi tiết nhé!';
  }
  return safeCommentText;
}

// 2. Kiểm thử Bộ Lọc Phân Loại Ý Định Khách Hàng (Customer Intent Filter)
function evaluatePostEligibility(text, postLink) {
  const lowerText = text.toLowerCase();

  const BROKER_SUPPLY_KEYWORDS = [
    'chính chủ gửi', 'bán gấp', 'cắt lỗ', 'độc quyền', 'giỏ hàng', 'bảng hàng',
    'quỹ căn độc quyền', 'lh xem nhà', 'bên em có căn', 'liên hệ ngay', 'quỹ căn ngoại giao',
    'chuyên cho thuê', 'chuyên chuyển nhượng', 'chính chủ cho thuê'
  ];

  const DEMAND_KEYWORDS = [
    'cần thuê', 'tìm thuê', 'cần tìm', 'tìm căn', 'ai có căn', 'cần mua',
    'tìm 1pn', 'tìm 2pn', 'tìm 3pn', 'tìm studio', 'muốn thuê', 'tài chính',
    'ngân sách', 'dọn vào', 'tìm phòng', 'có căn nào', 'inbox mình', 'thuê căn hộ'
  ];

  // 1. Loại bỏ bài môi giới
  const isBroker = BROKER_SUPPLY_KEYWORDS.some(bw => lowerText.includes(bw));
  if (isBroker) {
    return { eligible: false, reason: 'Bỏ qua: Bài viết là môi giới chào bán (tránh cmt trùng lặp / phản cảm)' };
  }

  // 2. Kiểm tra link permalink
  if (!postLink || (!postLink.includes('/posts/') && !postLink.includes('/permalink/'))) {
    return { eligible: false, reason: 'Bỏ qua: Không tìm thấy link permalink cụ thể của bài viết (tránh cmt link group)' };
  }

  // 3. Kiểm tra tính năng cmt bị tắt
  if (lowerText.includes('tính năng bình luận đã bị tắt') || lowerText.includes('comments have been turned off')) {
    return { eligible: false, reason: 'Bỏ qua: Tác giả hoặc Admin đã tắt tính năng bình luận' };
  }

  // 4. Kiểm tra nhu cầu khách hỏi
  const isDemand = DEMAND_KEYWORDS.some(dk => lowerText.includes(dk));
  if (!isDemand) {
    return { eligible: false, reason: 'Bỏ qua: Bài viết không chứa từ khóa nhu cầu tìm kiếm của khách' };
  }

  return { eligible: true, reason: 'HỢP LỆ: Bài viết khách hỏi thuê/mua có thể bình luận' };
}

console.log('🧪 BẮT ĐẦU KIỂM THỬ PIPELINE ĐIỀU PHỐI BÌNH LUẬN...');

// Test 1: Chuẩn hóa object -> string
const rawAiObject = {
  comment: 'Dạ em có căn 2N2VS ở Haven Park H1 cực đẹp, giá 10 Tr/tháng vào ở ngay. Anh/chị check tin nhắn chờ em gửi video nhé ạ!',
  providerUsed: 'offline',
  keyUsedMasked: 'Lõi NLP GPS'
};
const sanitized = sanitizeCommentText(rawAiObject);
assert.strictEqual(typeof sanitized, 'string');
assert(!sanitized.includes('[object Object]'));
assert(sanitized.includes('Haven Park H1'));
console.log('✅ Test 1 PASS: Đã bóc tách chuỗi comment sạch, loại bỏ hoàn toàn [object Object]!');

// Test 2: Phát hiện và loại bỏ bài viết của môi giới chào bán
const brokerPost = 'CHÍNH CHỦ GỬI BÁN GẤP CĂN 2PN SOL FOREST CẮT LỖ SÂU, LIÊN HỆ NGAY XEM NHÀ!';
const evalBroker = evaluatePostEligibility(brokerPost, 'https://facebook.com/groups/ecopark/posts/123456');
assert.strictEqual(evalBroker.eligible, false);
console.log(`✅ Test 2 PASS: ${evalBroker.reason}`);

// Test 3: Nhận diện chính xác bài viết của khách hàng thực sự cần thuê
const customerPost = 'Mình cần tìm thuê căn Studio hoặc 1PN bên Haven Park hoặc Sol Forest tài chính 7-8tr dọn vào ở ngay, ai có căn báo mình với!';
const evalCustomer = evaluatePostEligibility(customerPost, 'https://facebook.com/groups/ecopark/posts/987654');
assert.strictEqual(evalCustomer.eligible, true);
console.log(`✅ Test 3 PASS: ${evalCustomer.reason}`);

// Test 4: Chặn bài viết thiếu permalink (chỉ có link group)
const groupLinkOnly = evaluatePostEligibility(customerPost, 'https://facebook.com/groups/ecopark/');
assert.strictEqual(groupLinkOnly.eligible, false);
console.log(`✅ Test 4 PASS: ${groupLinkOnly.reason}`);

console.log('\n🎉 TOÀN BỘ 4/4 TEST ĐIỀU PHỐI & ĐIỀU KIỆN BÌNH LUẬN ĐẠT 100%!');
