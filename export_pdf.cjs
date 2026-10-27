const { chromium } = require('playwright');
const path = require('path');

async function main() {
  console.log('Bắt đầu khởi động Playwright để xuất PDF...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const htmlPath = path.resolve(__dirname, 'manual_template.html');
  console.log('Mở file HTML:', htmlPath);
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  
  const targetPdf = path.resolve(__dirname, 'KUDOX_HUONG_DAN_SU_DUNG_DOANH_NGHIEP.pdf');
  await page.pdf({
    path: targetPdf,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '15mm',
      bottom: '15mm',
      left: '15mm',
      right: '15mm',
    },
  });
  console.log('✅ Đã xuất thành công Master PDF tại:', targetPdf);
  await browser.close();
}

main().catch((err) => {
  console.error('❌ Lỗi xuất PDF:', err);
  process.exit(1);
});
