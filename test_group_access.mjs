import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  
  const groupUrl = 'https://www.facebook.com/groups/160934979480738/';
  await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);

  // Close popup
  const popups = page.locator('div[aria-label="Đóng"], div[aria-label="Close"], div[role="button"]:has-text("Đóng")');
  if (await popups.first().isVisible().catch(() => false)) {
    await popups.first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }

  // Print all links
  const allLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]')).map(a => ({
      text: (a.textContent || '').trim().slice(0, 40),
      href: a.getAttribute('href') || '',
      ariaLabel: a.getAttribute('aria-label') || ''
    })).filter(x => x.text || x.ariaLabel);
  });

  console.log('Total links found:', allLinks.length);
  console.log('Sample links:', allLinks.slice(0, 30));

  // Take screenshot
  await page.screenshot({ path: 'D:/KudoX_Mess_Tele/scratch_group_nav.png' });
  console.log('Saved screenshot to D:/KudoX_Mess_Tele/scratch_group_nav.png');

  await browser.close();
}

run().catch(console.error);
