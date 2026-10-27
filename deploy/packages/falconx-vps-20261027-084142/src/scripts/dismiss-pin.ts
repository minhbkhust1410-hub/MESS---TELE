import { chromium } from 'playwright';

async function main() {
  const ctx = await chromium.launchPersistentContext('./.user-data/fb-profile', {
    headless: true,
  });
  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Tìm nút đóng popup mã PIN
  const closeBtn = await page.$('[aria-label="Đóng" i], [aria-label="Close" i], div[role="dialog"] [role="button"]');
  if (closeBtn) {
    console.log('Found modal close button, clicking...');
    await closeBtn.click();
    await page.waitForTimeout(2000);
  } else {
    console.log('No close button found');
  }

  // Chụp ảnh lại sau khi đóng
  await page.screenshot({ path: './debug_after_close_pin.png' });
  console.log('Screenshot saved to debug_after_close_pin.png');

  // Lấy danh sách thread
  const threads = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/messages/t/"]')).slice(0, 5);
    return links.map(a => {
      const spans = Array.from(a.querySelectorAll('span')).map(s => s.innerText.trim()).filter(Boolean);
      return { href: a.getAttribute('href'), spans };
    });
  });

  console.log('Threads after modal close:', JSON.stringify(threads, null, 2));
  await ctx.close();
}

main().catch(console.error);
