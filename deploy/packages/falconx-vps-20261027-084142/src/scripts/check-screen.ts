import { chromium } from 'playwright';

async function main() {
  const ctx = await chromium.launchPersistentContext('./.user-data/fb-profile', {
    headless: true,
  });
  const page = await ctx.newPage();
  await page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const title = await page.title();
  const url = page.url();

  await page.screenshot({ path: './current_screen.png' });
  console.log('Title:', title, 'URL:', url);

  // Kiểm tra các phần tử trên màn hình
  const modalInfo = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return { hasDialog: false };

    const inputs = Array.from(dialog.querySelectorAll('input')).map(i => ({
      type: i.type,
      maxLength: i.maxLength,
      ariaLabel: i.getAttribute('aria-label')
    }));

    const text = (dialog as HTMLElement).innerText;
    const buttons = Array.from(dialog.querySelectorAll('[role="button"], button')).map(b => (b as HTMLElement).innerText || b.getAttribute('aria-label'));

    return {
      hasDialog: true,
      text: text.substring(0, 300),
      inputs,
      buttons
    };
  });

  console.log('Modal Info:', JSON.stringify(modalInfo, null, 2));
  await ctx.close();
}

main().catch(console.error);
