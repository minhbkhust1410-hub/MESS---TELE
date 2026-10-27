import { chromium } from 'playwright';
import path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();

  const artifactDir = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4';

  console.log('1. Navigating to http://127.0.0.1:3300 ...');
  await page.goto('http://127.0.0.1:3300', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Check login
  const isLoginVisible = await page.locator('#login-username').isVisible().catch(() => false);
  console.log('Login visible:', isLoginVisible);
  if (isLoginVisible) {
    console.log('Logging in...');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'ecotrang2026');
    await page.click('#login-btn-submit');
    await page.waitForTimeout(2000);
  }

  // Switch to Săn Khách & Quỹ Căn
  console.log('2. Switching to tab Săn Khách & Quỹ Căn (autocmt)...');
  await page.click('#nav-btn-autocmt');
  await page.waitForTimeout(1500);

  // Scroll to Free AI Control Panel
  await page.evaluate(() => {
    const el = document.getElementById('free-ai-control-panel');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(800);

  // Screenshot 1: Free AI Control Panel Overview
  const p1 = path.join(artifactDir, 'proof_free_ai_control_panel.png');
  await page.screenshot({ path: p1 });
  console.log('Saved screenshot 1:', p1);

  // Fill in AI Simulation Input
  console.log('3. Running AI Simulation...');
  await page.fill('#ai-sim-input', 'Cần tìm thuê căn Studio hoặc 1PN bên Haven Park hoặc Sol Forest tầm 5.5 - 6.5tr full đồ vào ở ngay trong tuần');
  await page.click('#btn-run-ai-sim');

  // Wait for result
  await page.waitForSelector('#ai-sim-result:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(1500);

  // Scroll result into view
  await page.evaluate(() => {
    const el = document.getElementById('ai-sim-result');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await page.waitForTimeout(800);

  // Screenshot 2: AI Simulation & GPS Matching Result
  const p2 = path.join(artifactDir, 'proof_free_ai_simulation_matching.png');
  await page.screenshot({ path: p2 });
  console.log('Saved screenshot 2:', p2);

  // Scroll up to view cả ô Quỹ Căn Hôm Nay và AI Ingestion
  console.log('4. Scrolling to Today Inventory Cards...');
  await page.evaluate(() => {
    const el = document.getElementById('inv-today-panel');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(800);

  const p3 = path.join(artifactDir, 'proof_free_ai_today_inventory.png');
  await page.screenshot({ path: p3 });
  console.log('Saved screenshot 3:', p3);

  await browser.close();
  console.log('🎉 Verification screenshots completed successfully!');
})();
