import { chromium } from 'playwright';

async function main() {
  const ctx = await chromium.launchPersistentContext('./.user-data/fb-profile', {
    headless: true,
  });
  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Lấy link đầu tiên trong danh sách hội thoại (Minh Bùi)
  const firstThread = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/messages/t/"]');
    if (!a) return null;
    return {
      href: a.getAttribute('href'),
      text: (a as HTMLElement).innerText
    };
  });

  console.log('First Thread (Minh Bùi):', JSON.stringify(firstThread, null, 2));
  await ctx.close();
}

main().catch(console.error);
