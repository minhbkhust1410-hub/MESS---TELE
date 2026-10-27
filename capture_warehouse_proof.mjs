import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();

  console.log('1. Navigating to Dashboard...');
  await page.goto('http://127.0.0.1:3300', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Login
  const isLoginVisible = await page.locator('#login-username').isVisible().catch(() => false);
  if (isLoginVisible) {
    console.log('2. Logging in...');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'ecotrang2026');
    await page.click('#login-btn-submit');
    await page.waitForTimeout(2000);
  }

  // Go to Growth Tab
  console.log('3. Switching to tab growth...');
  await page.click('#nav-btn-growth');
  await page.waitForTimeout(2000);

  // Scroll to Warehouse Block header
  console.log('4. Scrolling to warehouse block header...');
  await page.evaluate(() => {
    const el = document.getElementById('scanned-warehouse-block');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(1500);

  const proofPath = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_kho_data_da_quet_warehouse.png';
  await page.screenshot({ path: proofPath, fullPage: false });
  console.log('5. Screenshot saved:', proofPath);

  await browser.close();
}

run().catch(console.error);
