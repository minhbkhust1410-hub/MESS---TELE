import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
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

  // Switch to Autocmt / Quỹ Căn Tab
  console.log('3. Switching to tab autocmt...');
  await page.click('#nav-btn-autocmt');
  await page.waitForTimeout(1500);

  // Scroll to top of bds inventory card
  await page.evaluate(() => {
    const el = document.getElementById('bds-inventory-card');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(1000);

  const proofAutocmt = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_quy_can_moi_nap_trong_ngay.png';
  await page.screenshot({ path: proofAutocmt, fullPage: false });
  console.log('Saved Autocmt Proof to:', proofAutocmt);

  // Scroll down to today panel and click today filter button
  console.log('4. Scrolling to today panel & filtering...');
  await page.evaluate(() => {
    const el = document.getElementById('inv-today-panel');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(800);

  await page.click('#btn-inv-flt-today');
  await page.waitForTimeout(1200);

  const proofFiltered = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_loc_can_moi_nap_hom_nay.png';
  await page.screenshot({ path: proofFiltered, fullPage: false });
  console.log('Saved Filtered Proof to:', proofFiltered);

  await browser.close();
  console.log('All inventory proofs captured successfully!');
}

run().catch(err => {
  console.error('Error running capture:', err);
  process.exit(1);
});
