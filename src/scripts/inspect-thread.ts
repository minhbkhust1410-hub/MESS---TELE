import { chromium } from 'playwright';

async function main() {
  const ctx = await chromium.launchPersistentContext('./.user-data/fb-profile', {
    headless: true,
  });
  const page = await ctx.newPage();
  console.log('Navigating to thread...');
  await page.goto('https://www.facebook.com/messages/t/100041985709744/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const data = await page.evaluate(() => {
    // 1. Tên trên thanh tiêu đề header
    const headerTitle = document.querySelector('header h2, [role="main"] h2, h1, div[role="main"] span[dir="auto"]')?.textContent;

    // 2. Tìm input file
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map(i => ({
      accept: i.getAttribute('accept'),
      id: i.id,
      className: i.className
    }));

    // 3. Các tin nhắn gần nhất
    const msgNodes = Array.from(document.querySelectorAll('[role="row"], [data-scope="messages_table"] [role="gridcell"]'));
    const lastMsgs = msgNodes.slice(-5).map(m => (m as HTMLElement).innerText.replace(/\n+/g, ' | '));

    // 4. Các nút thao tác đính kèm dưới ô nhập
    const buttons = Array.from(document.querySelectorAll('[role="button"][aria-label]')).map(b => b.getAttribute('aria-label'));

    return {
      headerTitle,
      fileInputs,
      lastMsgs,
      buttons: buttons.filter(b => b && /ảnh|tệp|file|gửi|voice|sticker|nhãn|biểu tượng/i.test(b))
    };
  });

  console.log('Thread Data:\n', JSON.stringify(data, null, 2));
  await ctx.close();
}

main().catch(console.error);
