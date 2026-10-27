import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();

  console.log('1. Navigating to Dashboard...');
  await page.goto('http://127.0.0.1:3300', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Check login
  const isLoginVisible = await page.locator('#login-username').isVisible().catch(() => false);
  if (isLoginVisible) {
    console.log('2. Logging in...');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'ecotrang2026');
    await page.click('#login-btn-submit');
    await page.waitForTimeout(2000);
  }

  // 1. Overview tab
  await page.click('#nav-btn-overview');
  await page.waitForTimeout(1500);
  const proofOverview = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_giao_dien_sang_vang_overview.png';
  await page.screenshot({ path: proofOverview, fullPage: false });
  console.log('Saved Overview Proof to:', proofOverview);

  // 2. Sidebar specifically
  const sidebar = page.locator('aside');
  if (await sidebar.isVisible()) {
    const proofSidebar = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_sidebar_tin_nhan_bottom.png';
    await sidebar.screenshot({ path: proofSidebar });
    console.log('Saved Sidebar Proof to:', proofSidebar);
  }

  // 3. Growth tab (Kho Data Đã Quét)
  await page.click('#nav-btn-growth');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const el = document.getElementById('scanned-warehouse-block');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(1000);
  const proofGrowth = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_giao_dien_sang_vang_growth.png';
  await page.screenshot({ path: proofGrowth, fullPage: false });
  console.log('Saved Growth Proof to:', proofGrowth);

  await browser.close();
  console.log('All proofs captured successfully!');
}

run().catch(err => {
  console.error('Error running capture:', err);
  process.exit(1);
});
