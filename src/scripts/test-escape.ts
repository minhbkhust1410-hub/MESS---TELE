import { chromium } from 'playwright';

async function main() {
  const ctx = await chromium.launchPersistentContext('./.user-data/fb-profile', {
    headless: true,
  });
  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  console.log('Pressing Escape to dismiss modal...');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: './debug_escape_result.png' });
  console.log('Screenshot saved to debug_escape_result.png');
  await ctx.close();
}

main().catch(console.error);
