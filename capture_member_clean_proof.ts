import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  console.log('1. Đang mở Dashboard...');
  await page.goto('http://127.0.0.1:3300');
  await page.waitForTimeout(1500);

  // Đăng nhập nếu đang ở màn hình login
  const isLoginVisible = await page.locator('#login-username').isVisible().catch(() => false);
  if (isLoginVisible) {
    console.log('2. Đăng nhập tài khoản admin...');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'ecotrang2026');
    await page.click('#login-btn-submit');
    await page.waitForTimeout(2500);
  }

  console.log('3. Chờ nút nav-btn-growth hiển thị...');
  await page.waitForSelector('#nav-btn-growth', { state: 'visible', timeout: 10000 });
  
  console.log('4. Click #nav-btn-growth...');
  await page.click('#nav-btn-growth');
  await page.waitForTimeout(2000);

  // Chụp ảnh Tab Quét Mem Clean với 4 KPI Cards và bộ lọc 2 ngày, 1 tuần, 2 tuần
  const proofTab = path.resolve('C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_member_scanner_tab.png');
  await page.screenshot({ path: proofTab, fullPage: false });
  console.log('-> Đã lưu ảnh Tab Quét Mem:', proofTab);

  // Mở modal F12
  console.log('5. Click #btn-open-f12-script...');
  await page.waitForSelector('#btn-open-f12-script', { state: 'visible', timeout: 5000 });
  await page.click('#btn-open-f12-script');
  await page.waitForTimeout(1500);

  // Chụp ảnh Modal Script F12
  const proofModal = path.resolve('C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_f12_modal_script.png');
  await page.screenshot({ path: proofModal, fullPage: false });
  console.log('-> Đã lưu ảnh Modal F12 Script:', proofModal);

  await browser.close();
  console.log('Hoàn tất!');
}

main().catch(console.error);
