const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });

  console.log('Navigating to http://localhost:3300 ...');
  await page.goto('http://localhost:3300', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const outputPath = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_github_clean_dashboard.png';
  await page.screenshot({ path: outputPath, fullPage: false });
  console.log('Screenshot saved to:', outputPath);

  // Chuyển sang tab Đăng bài để chụp thêm 1 bức
  await page.click('#nav-btn-posts');
  await page.waitForTimeout(1500);
  const postTabPath = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_github_clean_posts_tab.png';
  await page.screenshot({ path: postTabPath, fullPage: false });
  console.log('Posts tab screenshot saved to:', postTabPath);

  // Chuyển sang tab Săn khách & Quỹ căn để chụp
  await page.click('#nav-btn-autocmt');
  await page.waitForTimeout(1500);
  const autocmtTabPath = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_github_clean_autocmt_tab.png';
  await page.screenshot({ path: autocmtTabPath, fullPage: false });
  console.log('AutoCmt tab screenshot saved to:', autocmtTabPath);

  await browser.close();
  console.log('Done.');
})();
