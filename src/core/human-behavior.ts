import type { Page, Locator } from 'playwright';
import {
  spinText,
  ensureUniqueHumanText,
  segmentGraphemes,
} from '../shared/fb-exten-core.js';

export { spinText, ensureUniqueHumanText };

export async function randomSleep(minMs: number, maxMs: number): Promise<void> {
  const duration = Math.floor(minMs + Math.random() * (maxMs - minMs));
  await new Promise((resolve) => setTimeout(resolve, duration));
}

/**
 * Di chuyển chuột ngẫu nhiên trên màn hình (Tạo sự kiện mousemove sinh học trước khi thao tác)
 */
export async function humanMoveMouseRandomly(page: Page): Promise<void> {
  try {
    const viewport = page.viewportSize() || { width: 1280, height: 800 };
    const x1 = Math.floor(viewport.width * (0.25 + Math.random() * 0.5));
    const y1 = Math.floor(viewport.height * (0.2 + Math.random() * 0.5));
    await page.mouse.move(x1, y1, { steps: 10 + Math.floor(Math.random() * 10) });
    await randomSleep(180, 420);
  } catch {}
}

/**
 * Mô phỏng gõ phím như người thật với tốc độ biến thiên, vi nghỉ tự nhiên theo dấu câu.
 * Hỗ trợ 100% chuẩn Unicode Grapheme Segmenter (bảo toàn trọn vẹn mọi Emoji phức tạp, Icon Facebook, không bao giờ bị lỗi ô vuông / dấu hỏi kim cương ).
 */
export async function humanType(page: Page, text: string): Promise<void> {
  const graphemes = segmentGraphemes(text);
  const isLongText = graphemes.length > 200;

  for (let i = 0; i < graphemes.length; i++) {
    const char = graphemes[i];

    if (char === '\n') {
      // Dùng Shift+Enter để xuống dòng an toàn tuyệt đối (không bao giờ kích hoạt Enter gửi tin nhắn nếu bị focus nhầm vào ô chat)
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
      await randomSleep(200, 450);
      continue;
    }

    // Tốc độ gõ biến thiên tự nhiên (18-40ms cho bài dài, 30-65ms cho bài ngắn)
    const delay = isLongText
      ? Math.floor(18 + Math.random() * 22)
      : Math.floor(30 + Math.random() * 35);

    await page.keyboard.type(char, { delay });

    // Nghỉ tự nhiên theo nhịp điệu người thật sau dấu chấm, phẩy hoặc cụm emoji
    if (char === '.' || char === '!' || char === '?') {
      await randomSleep(180, 350);
    } else if (char === ',' || char === ';') {
      await randomSleep(100, 200);
    } else if (Math.random() < 0.03 && i < graphemes.length - 1) {
      // 3% cơ hội khựng lại suy nghĩ như người thật
      await randomSleep(150, 300);
    }
  }
}

/**
 * Di chuyển chuột mượt mà tới phần tử và click tự nhiên
 */
export async function humanHoverAndClick(page: Page, locator: Locator): Promise<void> {
  try {
    const box = await locator.boundingBox({ timeout: 4000 });
    if (box) {
      // Di chuyển chuột với 8-15 bước mượt mà đến vùng giữa phần tử (có lệch ngẫu nhiên)
      const targetX = box.x + box.width / 2 + (Math.random() - 0.5) * (box.width * 0.3);
      const targetY = box.y + box.height / 2 + (Math.random() - 0.5) * (box.height * 0.3);
      await page.mouse.move(targetX, targetY, { steps: 8 + Math.floor(Math.random() * 8) });
      await randomSleep(150, 350); // Dừng rê chuột quan sát trước khi bấm
      await locator.click({ delay: 60 + Math.floor(Math.random() * 60) });
      return;
    }
  } catch {}
  await locator.click().catch(() => {});
}

/**
 * Cuộn trang tự nhiên với tốc độ phân mảnh
 */
export async function humanScroll(page: Page, distance = 400): Promise<void> {
  const steps = 3 + Math.floor(Math.random() * 4);
  const stepDistance = Math.round(distance / steps);

  for (let i = 0; i < steps; i++) {
    const deltaY = stepDistance + Math.floor((Math.random() - 0.5) * 40);
    await page.mouse.wheel(0, deltaY).catch(() => undefined);
    await randomSleep(80, 220);
  }

  await randomSleep(300, 600);
}

/**
 * Cuộn trang mượt theo chuẩn lõi KudoX (4-7 bước nhỏ + dừng đọc 800-1600ms)
 */
export async function smoothScrollDown(page: Page, count = 1): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await humanScroll(page, 650 + Math.floor(Math.random() * 300));
    await randomSleep(600, 1300);
  }
}

/**
 * Hành vi đọc lướt bảng tin Group tự nhiên trước khi đăng bài / bình luận
 * Giúp vượt qua hoàn toàn thuật toán phát hiện bot của Facebook
 */
export async function humanBrowseGroupFeed(page: Page): Promise<void> {
  // 1. Dừng quan sát ban đầu sau khi tải trang (1.5s - 3s) + di chuyển chuột tự nhiên
  await humanMoveMouseRandomly(page);
  await randomSleep(1500, 3000);

  // 2. Cuộn nhẹ xuống xem 1-2 bài viết
  await humanScroll(page, 350 + Math.floor(Math.random() * 250));
  await randomSleep(1000, 2500);

  // 3. Cuộn ngược nhẹ lên đầu trang để tạo bài hoặc tương tác
  await page.mouse.wheel(0, -200 - Math.floor(Math.random() * 150)).catch(() => {});
  await randomSleep(800, 1500);
}

/**
 * Hành vi đọc bài viết trước khi bấm vào ô Bình luận (Chống Ban Nick khi đi Comment)
 * Mô phỏng: Rê chuột -> Dừng đọc nội dung bài viết (1.8s-3.5s) -> Cuộn nhẹ xuống vùng bình luận
 */
export async function humanReadPostBeforeComment(page: Page): Promise<void> {
  await humanMoveMouseRandomly(page);
  await randomSleep(1400, 2800);
  await humanScroll(page, 180 + Math.floor(Math.random() * 160));
  await randomSleep(900, 1800);
}

/**
 * Tạm dừng kiểm tra lại nội dung trước khi bấm nút "Đăng" / "Gửi"
 */
export async function humanReviewBeforeSubmit(): Promise<void> {
  // Con người thường đọc lại 1.5-3.2 giây trước khi bấm Đăng/Enter
  await randomSleep(1500, 3200);
}

/**
 * Dừng nán lại xem kết quả sau khi vừa gửi bình luận/bài đăng (tránh đóng tab tức thì kiểu Bot)
 */
export async function humanLingerAfterAction(page: Page): Promise<void> {
  await humanMoveMouseRandomly(page);
  await randomSleep(2200, 4200);
}

/**
 * Giãn cách thông minh chống khóa tính năng giữa các Group (Adaptive Anti-Ban Cooldown)
 * Tự động nghỉ dài hơn sau mỗi 3 nhóm liên tiếp.
 */
export async function humanInterGroupCooldown(groupIndex: number): Promise<void> {
  if ((groupIndex + 1) % 3 === 0) {
    console.log('🛡️ [Anti-Ban Guard] Đã xử lý 3 nhóm liên tiếp -> Nghỉ giải lao sâu 30s-45s như người thật...');
    await randomSleep(30000, 45000);
  } else {
    console.log('🛡️ [Anti-Ban Guard] Giãn cách an toàn 18s-32s trước khi sang nhóm tiếp theo...');
    await randomSleep(18000, 32000);
  }
}
