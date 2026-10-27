import { Page } from 'playwright';
import { InputFile, InputMediaBuilder } from 'grammy';
import fs from 'fs';
import path from 'path';

/**
 * Đánh dấu các ảnh lịch sử đã tồn tại trên DOM để không gửi nhầm ảnh cũ
 * Chỉ gọi 1 lần khi khởi động bot lần đầu vào thread
 */
export async function markExistingImagesAsSeen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const mainEl = document.querySelector('div[role="main"]') || document.body;
    if (!mainEl) return;
    const imgs = mainEl.querySelectorAll('img');
    imgs.forEach((img) => {
      (img as HTMLElement).dataset.kudoxSent = 'true';
    });
  }).catch(() => {});
}

/**
 * Quét và lấy toàn bộ ảnh mới của khách hàng trong khung chat hiện tại.
 * Hỗ trợ: 1 ảnh, nhiều ảnh (Album), ảnh dọc, ảnh ngang, ảnh E2EE blob/base64/CDN.
 * Tốc độ cực cao: 150ms - 450ms, hoàn toàn miễn nhiễm lỗi CORS và tainted canvas.
 */
export async function extractNewCustomerImages(page: Page): Promise<string[]> {
  const tempDir = path.resolve('./.tmp_media');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // Thử tối đa 10 nhịp x 150ms = 1.5 giây
  for (let attempt = 0; attempt < 10; attempt++) {
    // 1. Ép cuộn khung chat xuống đáy để kích hoạt hiển thị ảnh
    await page.evaluate(() => {
      const mainEl = document.querySelector('div[role="main"]') || document.body;
      if (!mainEl) return;
      const scrollers = Array.from(mainEl.querySelectorAll('div')).filter((el) => {
        const style = window.getComputedStyle(el);
        return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
      });
      for (const scroller of scrollers) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    }).catch(() => {});

    // 2. Tìm danh sách ảnh candidate trong DOM
    const scanResult = await page.evaluate(async () => {
      const mainEl = document.querySelector('div[role="main"]') || document.body;
      if (!mainEl) return { count: 0, items: [] };

      // Tìm các dòng tin nhắn
      const rawRows = Array.from(mainEl.querySelectorAll('div[role="row"]'));
      // Đánh dấu các dòng cũ từ trước để không bao giờ bóc tách nhầm
      if (rawRows.length > 6) {
        for (let r = 0; r < rawRows.length - 6; r++) {
          rawRows[r].querySelectorAll('img').forEach((i) => ((i as HTMLElement).dataset.kudoxSent = 'true'));
        }
      }

      const rows = rawRows.length > 0 ? rawRows.slice(-6) : [mainEl];
      const headerEl = mainEl.querySelector('[role="banner"], header');

      const foundItems: Array<{ type: 'base64' | 'url'; data: string }> = [];

      for (const row of rows) {
        // Bỏ qua tin nhắn do shop gửi đi (Anti-echo ảnh)
        if (rawRows.length > 0) {
          const rowText = (row as HTMLElement).innerText || '';
          if (rowText.includes('Bạn đã gửi') || rowText.startsWith('Bạn:')) {
            row.querySelectorAll('img').forEach((i) => ((i as HTMLElement).dataset.kudoxSent = 'true'));
            continue;
          }
        }

        const imgs = Array.from(row.querySelectorAll('img')) as HTMLImageElement[];
        for (const img of imgs) {
          if (img.dataset.kudoxSent === 'true') continue;

          const src = img.src || '';
          const alt = (img.alt || '').toLowerCase();

          // LỌC BỎ AVATAR, ICON HỆ THỐNG & HEADER BẰNG CẤU TRÚC F12
          if (
            !src ||
            (headerEl && headerEl.contains(img)) ||
            img.closest('svg') !== null ||
            src.includes('30808-1') ||
            src.includes('emoji.php') ||
            src.includes('static.xx.fbcdn.net') ||
            src.includes('rsrc.php') ||
            src.includes('p80x80') ||
            src.includes('p50x50') ||
            alt.includes('seen by') ||
            alt.includes('đã xem') ||
            alt.includes('profile') ||
            alt.includes('avatar')
          ) {
            img.dataset.kudoxSent = 'true';
            continue;
          }

          // Kiểm tra kích thước: chỉ bỏ qua nếu CẢ 2 CHIỀU đều nhỏ <= 65px (icon / reaction nhỏ)
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          const isLarge = w > 65 || h > 65 || src.startsWith('blob:') || src.startsWith('data:');

          if (!isLarge) {
            img.dataset.kudoxSent = 'true';
            continue;
          }

          // Bắt dữ liệu ảnh và đánh dấu đã gửi
          img.dataset.kudoxSent = 'true';

          if (src.startsWith('data:image/')) {
            foundItems.push({ type: 'base64', data: src });
          } else if (src.startsWith('blob:')) {
            try {
              const res = await fetch(src);
              const blob = await res.blob();
              const reader = new FileReader();
              const b64 = await new Promise<string>((resolve, reject) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              if (b64 && b64.startsWith('data:image/')) {
                foundItems.push({ type: 'base64', data: b64 });
              } else {
                foundItems.push({ type: 'url', data: src });
              }
            } catch {
              foundItems.push({ type: 'url', data: src });
            }
          } else if (src.startsWith('http')) {
            foundItems.push({ type: 'url', data: src });
          }
        }
      }

      return { count: foundItems.length, items: foundItems };
    }).catch(() => ({ count: 0, items: [] }));

    if (scanResult.items.length > 0) {
      console.log(`📸 [KudoX Media Extractor] Bóc tách thành công ${scanResult.items.length} ảnh từ DOM ở nhịp ${attempt + 1}!`);

      const finalOutputs: string[] = [];
      for (let i = 0; i < scanResult.items.length; i++) {
        const item = scanResult.items[i];
        if (item.type === 'base64') {
          const rawBase64 = item.data.replace(/^data:image\/\w+;base64,/, '');
          const filePath = path.join(tempDir, `dom_b64_${Date.now()}_${i}.jpg`);
          fs.writeFileSync(filePath, Buffer.from(rawBase64, 'base64'));
          finalOutputs.push(filePath);
        } else if (item.type === 'url') {
          try {
            const filePath = path.join(tempDir, `dom_cdn_${Date.now()}_${i}.jpg`);
            const response = await page.context().request.get(item.data, { timeout: 8000 });
            if (response.ok()) {
              const buffer = await response.body();
              fs.writeFileSync(filePath, buffer);
              finalOutputs.push(filePath);
            }
          } catch (err: any) {
            console.warn('[KudoX Media Extractor] Lỗi tải CDN ảnh:', err.message);
          }
        }
      }

      if (finalOutputs.length > 0) {
        return finalOutputs;
      }
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  return [];
}

/**
 * Gửi sang Telegram (Tự động phân loại 1 ảnh hoặc Gom Album nhiều ảnh)
 * Hỗ trợ cả file cục bộ (.jpg/.png) lẫn Base64
 */
export async function sendExtractedImagesToTelegram(
  bot: any,
  chatId: number | string,
  topicId: number,
  images: string[],
  caption?: string
) {
  if (!images || images.length === 0) {
    return;
  }

  const files: InputFile[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (fs.existsSync(img)) {
      files.push(new InputFile(img));
    } else if (img.startsWith('data:image/')) {
      const rawBase64 = img.replace(/^data:image\/\w+;base64,/, '');
      files.push(new InputFile(Buffer.from(rawBase64, 'base64'), `img_${Date.now()}_${i}.jpg`));
    }
  }

  if (files.length === 0) return;

  // Nếu khách gửi 1 ảnh -> Gửi đơn
  if (files.length === 1) {
    await bot.api.sendPhoto(chatId, files[0], {
      message_thread_id: topicId,
      caption: caption || undefined,
    });
    return;
  }

  // Nếu khách gửi từ 2 ảnh trở lên -> Gom thành MediaGroup (Album tối đa 10 ảnh/lần)
  for (let i = 0; i < files.length; i += 10) {
    const batch = files.slice(i, i + 10);
    const mediaGroup = batch.map((file, idx) =>
      InputMediaBuilder.photo(file, i === 0 && idx === 0 && caption ? { caption } : undefined)
    );

    await bot.api.sendMediaGroup(chatId, mediaGroup, {
      message_thread_id: topicId,
    });
  }
}
