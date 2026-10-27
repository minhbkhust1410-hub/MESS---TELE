import { chromium } from 'playwright';

async function main() {
  const ctx = await chromium.launchPersistentContext('./.user-data/fb-profile', {
    headless: true,
  });
  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const threads = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/messages/t/"], a[href*="/messages/e2ee/t/"]'));
    return links.map(a => {
      const href = a.getAttribute('href') || '';
      const match = href.match(/\/messages\/(?:e2ee\/)?t\/([0-9a-zA-Z._]+)/);
      const spans = Array.from(a.querySelectorAll('span')).map(s => s.innerText.trim()).filter(Boolean);
      return {
        href,
        threadId: match ? match[1] : null,
        spans
      };
    });
  });

  console.log('ALL THREADS (Normal + E2EE):\n', JSON.stringify(threads, null, 2));
  await ctx.close();
}

main().catch(console.error);
