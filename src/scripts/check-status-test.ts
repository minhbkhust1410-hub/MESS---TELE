import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const profileDir = 'D:\\KudoX_Mess_Tele\\.user-data\\profiles\\acc_61577949601039';

async function main() {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled']
  });

  const page = await context.newPage();
  
  const testUrls = [
    'https://www.facebook.com/support/',
    'https://www.facebook.com/accountquality/',
    'https://www.facebook.com/marketplace/you/selling'
  ];

  for (const url of testUrls) {
    try {
      console.log(`\nTesting: ${url} ...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(3500);

      const title = await page.title();
      const currentUrl = page.url();
      const bodyText = await page.evaluate(() => document.body.innerText || '');
      console.log('Title:', title);
      console.log('URL:', currentUrl);
      console.log('Body Text Snippet:');
      console.log(bodyText.slice(0, 400).replace(/\n+/g, ' '));

      const proofDir = path.resolve('./.tmp_media/proofs');
      fs.mkdirSync(proofDir, { recursive: true });
      const filename = `proof_${url.split('facebook.com/')[1]?.replace(/[^a-z0-9]/gi, '_')}.png`;
      await page.screenshot({ path: path.join(proofDir, filename), fullPage: false });
      console.log('Saved screenshot:', filename);
    } catch (err: any) {
      console.error(`Error on ${url}:`, err.message);
    }
  }

  await context.close();
}

main().catch(console.error);
