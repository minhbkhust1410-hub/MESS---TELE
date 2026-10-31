import { onlineCloudDb } from '../db/online-cloud-db.js';

async function main() {
  console.log('\n===========================================================');
  console.log('☁️ ĐỒNG BỘ CƠ SỞ DỮ LIỆU ĐÁM MÂY (GITHUB CLOUD VAULT)');
  console.log('===========================================================');

  await onlineCloudDb.init();
  console.log('⏳ Đang mã hóa và đẩy toàn bộ dữ liệu lên GitHub Cloud Database...');

  const result = await onlineCloudDb.syncToCloudNow();
  if (result.success) {
    console.log(`✅ Đồng bộ Cloud DB thành công!`);
    console.log(`   - Tổng số bảng dữ liệu: ${result.filesCount} bảng`);
    console.log(`   - Commit SHA: ${result.sha}`);
    console.log(`   - Ổ cứng máy Local: 0 Bytes`);
  } else {
    console.error(`❌ Đồng bộ thất bại: ${result.error}`);
    process.exit(1);
  }
}

main().catch(console.error);
