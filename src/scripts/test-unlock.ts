import { chromium } from 'playwright';

async function main() {
  const ctx = await chromium.launchPersistentContext('./.user-data/fb-profile', {
    headless: true,
  });
  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Nhấn Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // Click nút "Không khôi phục tin nhắn"
  const btn = await page.$('div[role="button"]:has-text("Không khôi phục tin nhắn"), button:has-text("Không khôi phục tin nhắn")');
  if (btn) {
    console.log('Clicking "Không khôi phục tin nhắn"...');
    await btn.click();
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: './debug_unlocked.png' });
  console.log('Saved debug_unlocked.png');

  // Lấy danh sách cuộc trò chuyện
  const threads = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/messages/t/"]')).slice(0, 5);
    return links.map(a => {
      const spans = Array.from(a.querySelectorAll('span')).map(s => s.innerText.trim()).filter(Boolean);
      return { href: a.getAttribute('href'), spans };
    });
  });

  console.log('Threads after unlock:', JSON.stringify(threads, null, 2));
  await ctx.close();
}

main().catch(console.error);
