const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  await page.goto('http://localhost:3300', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Bấm vào nút Xem Số Liệu Thống Kê
  await page.click('#btn-toggle-stats');
  await page.waitForTimeout(1000);

  const outputPath = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_stats_expanded.png';
  await page.screenshot({ path: outputPath, fullPage: true });
  console.log('Expanded stats screenshot saved to:', outputPath);

  await browser.close();
})();
