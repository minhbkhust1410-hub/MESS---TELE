import { chromium } from 'playwright';

async function main() {
  const ctx = await chromium.launchPersistentContext('./.user-data/fb-profile', {
    headless: true,
  });
  const page = await ctx.newPage();
  console.log('Opening Messenger...');
  await page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const analysis = await page.evaluate(() => {
    // 1. Phân tích các liên kết cuộc hội thoại ở sidebar
    const threadLinks = Array.from(document.querySelectorAll('a[href*="/messages/t/"]')).slice(0, 5);
    const threads = threadLinks.map((a) => {
      const href = a.getAttribute('href') || '';
      // Tìm tất cả các span có text
      const spans = Array.from(a.querySelectorAll('span'))
        .map((s) => s.innerText.trim())
        .filter((t) => t.length > 0);

      // Tìm ảnh đại diện
      const avatarImg = a.querySelector('img');
      const avatarSrc = avatarImg ? avatarImg.getAttribute('src') : null;

      return {
        href,
        allSpans: spans,
        avatarSrc: avatarSrc ? avatarSrc.substring(0, 60) + '...' : null,
      };
    });

    // 2. Tìm ô nhập tin nhắn & nút đính kèm ảnh/video
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map((i) => ({
      accept: i.getAttribute('accept'),
      multiple: i.hasAttribute('multiple'),
    }));

    // 3. Tìm các nút biểu tượng / đính kèm
    const attachmentButtons = Array.from(document.querySelectorAll('[aria-label]'))
      .map((el) => el.getAttribute('aria-label'))
      .filter((lbl) => lbl && /ảnh|tệp|file|sticker|nhãn dán|đính kèm|voice|âm thanh/i.test(lbl));

    return {
      threads,
      fileInputs,
      attachmentButtons: Array.from(new Set(attachmentButtons)),
    };
  });

  console.log('Analysis Result:\n', JSON.stringify(analysis, null, 2));
  await ctx.close();
}

main().catch(console.error);
