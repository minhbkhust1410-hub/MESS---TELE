import { dataModeService } from './src/services/data-mode-service.js';
import { parseForexLead, generateForexTargetedComment } from './src/services/forex-parser.js';

console.log('=== TEST DATA MODE SERVICE & FOREX PARSER ===');
console.log('Chế độ hiện tại:', dataModeService.getCurrentMode());
console.log('Metadata BĐS:', dataModeService.getModeMetadata('bds_ecopark'));
console.log('Metadata Forex:', dataModeService.getModeMetadata('forex_finance'));

console.log('\n--- TEST THUẬT TOÁN PHÂN LOẠI LEAD FOREX TÀI CHÍNH ---');
const testPosts = [
  "Em cần tìm sàn nào nạp rút qua ngân hàng VN 30s không mất phí để đánh Vàng XAUUSD, bác nào làm IB Exness hoàn com 90% inbox em nhé!",
  "Bác nào có nhóm Telegram VIP bắn tín hiệu kèo vàng XAU hôm nay không? Cho em xin vào với!",
  "Cứu em với, lỡ gồng BUY vàng 2740 đang âm 2000$ sắp cháy tài khoản rồi!",
  "Em vừa pass vòng 1 quỹ FTMO gói 50k, bác nào có kinh nghiệm giữ drawdown vòng 2 chia sẻ em với",
  "Tìm bên nào có Bot EA Copytrade trên IC Markets lợi nhuận 10%/tháng có myfxbook kiểm chứng."
];

for (const post of testPosts) {
  const parsed = parseForexLead(post);
  console.log(`\nBài viết: "${post}"`);
  console.log(`-> Phân loại: [${parsed.intentLabel}] (Độ tin cậy: ${parsed.confidenceScore}%)`);
  console.log(`-> Cặp tiền: ${parsed.symbols.join(', ') || 'Không rõ'} | Sàn: ${parsed.brokers.join(', ') || 'Không rõ'}`);
  console.log(`-> Hành động gợi ý: ${parsed.suggestedAction}`);
  console.log(`💬 Bình luận tự động sinh: "${generateForexTargetedComment(parsed)}"`);
}

console.log('\n--- TEST LỌC GROUPS THEO MODE ---');
console.log('Số nhóm BĐS Ecopark:', dataModeService.getGroupsForMode('bds_ecopark').length);
console.log('Số nhóm Forex Tài Chính:', dataModeService.getGroupsForMode('forex_finance').length);
console.log('Danh sách nhóm Forex:');
dataModeService.getGroupsForMode('forex_finance').forEach((g, i) => {
  console.log(` ${i + 1}. [${g.category}] ${g.name}`);
});

console.log('\n✅ TEST HOÀN TẤT!');
