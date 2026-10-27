import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('1. Đang mở trang Web...');
  await page.goto('http://127.0.0.1:3300');
  await page.waitForTimeout(1000);

  // Đăng nhập nếu đang ở màn hình login
  const isLoginVisible = await page.locator('#login-username').isVisible().catch(() => false);
  if (isLoginVisible) {
    console.log('2. Đăng nhập tài khoản admin...');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'ecotrang2026');
    await page.click('#login-btn-submit');
    await page.waitForTimeout(2000);
  }

  // 1. Chụp màn hình Chế độ BĐS Ecopark (Màu xanh ngọc Emerald)
  console.log('3. Chụp màn hình Chế độ BĐS Ecopark...');
  await page.click('#topbar-btn-mode-bds');
  await page.waitForTimeout(1000);
  const proofBds = path.resolve('C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_mode_bds_ecopark.png');
  await page.screenshot({ path: proofBds, fullPage: false });
  console.log('-> Đã lưu ảnh BĐS:', proofBds);

  // 2. Chuyển sang Chế độ Forex Tài Chính (Màu vàng kim Amber)
  console.log('4. Chuyển sang Chế độ Forex Tài Chính...');
  await page.click('#topbar-btn-mode-forex');
  await page.waitForTimeout(1000);
  
  // Mở tab Săn Khách & Quỹ Căn để xem Radar Forex
  await page.click('#nav-btn-autocmt');
  await page.waitForTimeout(1000);
  const proofForexRadar = path.resolve('C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_mode_forex_radar.png');
  await page.screenshot({ path: proofForexRadar, fullPage: false });
  console.log('-> Đã lưu ảnh Forex Radar:', proofForexRadar);

  // 3. Mở tab Tương Tác & Kết Bạn để xem Bể Data Trader Phân Loại
  console.log('5. Xem Bể Data Trader Phân Loại...');
  await page.click('#nav-btn-growth');
  await page.waitForTimeout(1000);
  const proofForexLeads = path.resolve('C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_mode_forex_leads.png');
  await page.screenshot({ path: proofForexLeads, fullPage: false });
  console.log('-> Đã lưu ảnh Forex Leads:', proofForexLeads);

  await browser.close();
  console.log('✅ Hoàn tất chụp ảnh minh chứng cả 2 Mode!');
}

main().catch(console.error);
