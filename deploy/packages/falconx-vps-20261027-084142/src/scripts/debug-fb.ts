import { chromium } from 'playwright';

async function main() {
  const ctx = await chromium.launchPersistentContext('./.user-data/fb-profile', {
    headless: true,
  });
  const page = await ctx.newPage();
  console.log('Navigating to https://www.facebook.com/messages ...');
  await page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  console.log('Page Title:', await page.title());
  console.log('Page URL:', page.url());

  await page.screenshot({ path: './debug_playwright_fb.png' });
  console.log('Screenshot saved to debug_playwright_fb.png');

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/messages/t/"]')).slice(0, 8).map(a => ({
      href: a.getAttribute('href'),
      text: (a as HTMLElement).innerText.replace(/\n+/g, ' | ')
    }));
  });

  console.log('Threads in Playwright:\n', JSON.stringify(links, null, 2));
  await ctx.close();
}

main().catch(console.error);
