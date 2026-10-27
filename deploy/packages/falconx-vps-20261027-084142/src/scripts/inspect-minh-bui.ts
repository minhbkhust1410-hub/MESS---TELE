import { chromium } from 'playwright';

async function main() {
  const ctx = await chromium.launchPersistentContext('./.user-data/fb-profile', {
    headless: true,
  });
  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const elements = await page.evaluate(() => {
    // Tìm tất cả các phần tử chứa chữ "Minh Bùi"
    const all = Array.from(document.querySelectorAll('*'));
    const matched = all.filter(el => {
      return el.children.length === 0 && (el.textContent || '').includes('Minh Bùi');
    });

    return matched.map(el => {
      const parent = el.closest('a, div[role="row"], div[role="button"], div[role="gridcell"], div[tabindex]');
      return {
        tag: el.tagName,
        text: el.textContent,
        parentTag: parent ? parent.tagName : null,
        parentRole: parent ? parent.getAttribute('role') : null,
        parentHref: parent ? parent.getAttribute('href') : null,
        parentClass: parent ? parent.className.substring(0, 40) : null
      };
    });
  });

  console.log('Minh Bùi Elements:\n', JSON.stringify(elements, null, 2));
  await ctx.close();
}

main().catch(console.error);
