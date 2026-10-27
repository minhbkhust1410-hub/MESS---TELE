const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3300', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Đăng nhập
  await page.click('#login-btn-submit');
  await page.waitForTimeout(1500);

  const baseDir = 'D:/KudoX_Mess_Tele/guide_assets';
  const fs = require('fs');
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

  // 1. Chụp Action Hub
  await page.screenshot({ path: path.join(baseDir, 'step1_hub.png') });

  // 2. Chụp Tab Đăng Bài
  await page.click('#nav-btn-posts');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(baseDir, 'step2_posts.png') });

  // 3. Chụp Tab Săn Khách & Quỹ Căn
  await page.click('#nav-btn-autocmt');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(baseDir, 'step3_inventory.png') });

  // 4. Chụp Tab Tin Nhắn Khách Hàng
  await page.click('#nav-btn-inbox');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(baseDir, 'step4_inbox.png') });

  // 5. Chụp Tab Tài Khoản & Proxy
  await page.click('#nav-btn-accounts');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(baseDir, 'step5_accounts.png') });

  // 6. Chụp Màn Hình Đăng Ký
  await page.click('button:has-text("Đăng Xuất")');
  await page.waitForTimeout(800);
  await page.click('#tab-auth-register-btn');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(baseDir, 'step0_register.png') });

  console.log('All guide asset screenshots taken successfully!');
  await browser.close();
})();
