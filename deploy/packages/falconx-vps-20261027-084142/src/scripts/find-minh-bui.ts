import { chromium } from 'playwright';

async function main() {
  const ctx = await chromium.launchPersistentContext('./.user-data/fb-profile', {
    headless: true,
  });
  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const threads = await page.evaluate(() => {
    // Tìm tất cả các thẻ a hoặc phần tử trong danh sách đoạn chat bên trái
    const nav = document.querySelector('[role="navigation"], [aria-label*="Đoạn chat" i], [aria-label*="Chats" i]');
    const allLinks = Array.from((nav || document).querySelectorAll('a')).map(a => ({
      href: a.getAttribute('href'),
      text: (a as HTMLElement).innerText.replace(/\n+/g, ' | ')
    })).filter(item => item.text.includes('Minh Bùi') || item.text.includes('Hello') || (item.href && item.href.includes('/messages/')));

    return allLinks;
  });

  console.log('Detected Threads:\n', JSON.stringify(threads, null, 2));
  await ctx.close();
}

main().catch(console.error);
