import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();

  console.log('Opening dashboard...');
  await page.goto('http://127.0.0.1:3300', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Login if needed
  const isLoginVisible = await page.locator('#login-username').isVisible().catch(() => false);
  if (isLoginVisible) {
    console.log('Logging in...');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'ecotrang2026');
    await page.click('#login-btn-submit');
    await page.waitForTimeout(2000);
  }

  // Switch to Member Scanner Tab
  console.log('Clicking #nav-btn-growth (Quét Thành Viên)...');
  await page.click('#nav-btn-growth');
  await page.waitForTimeout(2500);

  const proofPath = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_live_member_scanner_success.png';
  await page.screenshot({ path: proofPath });
  console.log('Saved screenshot to:', proofPath);

  await browser.close();
}

run().catch(console.error);
