import { chromium } from 'playwright';
import path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();

  const artifactDir = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4';

  console.log('1. Navigating to http://127.0.0.1:3300 ...');
  await page.goto('http://127.0.0.1:3300', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Login
  const isLoginVisible = await page.locator('#login-username').isVisible().catch(() => false);
  if (isLoginVisible) {
    console.log('Logging in...');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'ecotrang2026');
    await page.click('#login-btn-submit');
    await page.waitForTimeout(2000);
  }

  // Switch to Autocmt / Săn Khách & Quỹ Căn
  console.log('2. Switching to Săn Khách & Quỹ Căn...');
  await page.click('#nav-btn-autocmt');
  await page.waitForTimeout(1500);

  // Scroll into Free AI Control Panel
  await page.evaluate(() => {
    const el = document.getElementById('free-ai-control-panel');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(800);

  // Screenshot 1: Key Pool & Failover Settings
  const p1 = path.join(artifactDir, 'proof_ai_key_pool_failover.png');
  await page.screenshot({ path: p1 });
  console.log('Saved Screenshot 1 (Key Pool Table):', p1);

  // Run AI Simulation
  console.log('3. Running AI Simulation with Failover Banner...');
  await page.fill('#ai-sim-input', 'Tìm thuê căn 2PN Sky Oasis hoặc Sol Forest khoảng 9-10tr full đồ vào ở luôn cuối tuần này');
  await page.click('#btn-run-ai-sim');

  await page.waitForSelector('#ai-sim-result:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(1500);

  // Scroll to simulation result
  await page.evaluate(() => {
    const el = document.getElementById('ai-sim-result');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await page.waitForTimeout(800);

  // Screenshot 2: Simulation with Failover Banner
  const p2 = path.join(artifactDir, 'proof_ai_failover_simulation.png');
  await page.screenshot({ path: p2 });
  console.log('Saved Screenshot 2 (Failover Simulation):', p2);

  await browser.close();
  console.log('🎉 Proof capture completed successfully!');
})();
