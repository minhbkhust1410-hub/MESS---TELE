import type { Page, Locator } from 'playwright';
import {
  humanType,
  spinText,
  randomSleep,
  humanReviewBeforeSubmit,
  humanHoverAndClick,
} from './human-behavior.js';

export interface ComposerHandle {
  surface: string;
  editor: Locator;
  filledText?: string;
}

export class FacebookComposerService {
  /**
   * Vẽ khung ngắm F12 trực quan ngay trên cửa sổ trình duyệt Playwright để kiểm chứng đã trỏ đúng phần tử
   */
  public async highlightTarget(locator: Locator, label: string, color = '#10b981', durationMs = 3500): Promise<void> {
    try {
      await locator.evaluate(
        (el, opts) => {
          if (!(el instanceof HTMLElement)) return;
          const rect = el.getBoundingClientRect();
          if (rect.width < 4 || rect.height < 4) return;
          const box = document.createElement('div');
          box.className = 'fb-exten-pw-f12-box';
          box.style.cssText = `
            position: fixed;
            left: ${Math.max(0, rect.left - 3)}px;
            top: ${Math.max(0, rect.top - 3)}px;
            width: ${rect.width + 6}px;
            height: ${rect.height + 6}px;
            border: 2.5px solid ${opts.color};
            border-radius: 8px;
            box-shadow: 0 0 18px ${opts.color}99, inset 0 0 8px ${opts.color}33;
            pointer-events: none;
            z-index: 2147483645;
          `;
          const tag = document.createElement('div');
          tag.textContent = `${opts.label} <${el.tagName.toLowerCase()}>`;
          tag.style.cssText = `
            position: absolute;
            left: 0;
            top: ${rect.top > 26 ? '-22px' : `${rect.height + 5}px`};
            background: ${opts.color};
            color: #07090e;
            font-family: monospace;
            font-size: 11px;
            font-weight: 800;
            padding: 2px 7px;
            border-radius: 5px;
            white-space: nowrap;
          `;
          box.appendChild(tag);
          document.body.appendChild(box);
          setTimeout(() => box.remove(), opts.durationMs);
        },
        { label, color, durationMs }
      );
    } catch {}
  }

  /**
   * Chẩn đoán nguyên nhân chính xác nếu không thể mở khung bình luận
   */
  async diagnoseIneligibility(page: Page): Promise<string> {
    try {
      const pageText = await page.evaluate(() => document.body.innerText || '');
      if (/tiếp tục dưới tên|dùng trang cá nhân khác/i.test(pageText) && !/bình luận/i.test(pageText)) {
        return 'Facebook đang dừng ở màn hình xác nhận tài khoản ("Tiếp tục Eco Trang"). Hệ thống đã tự động click tiếp tục.';
      }
      if (/tính năng bình luận đã bị tắt|tắt tính năng bình luận|comments have been turned off|chỉ có thể xem bình luận/i.test(pageText)) {
        return 'Bài viết đã bị tác giả hoặc Quản trị viên tắt tính năng bình luận.';
      }
      if (/tham gia nhóm để bình luận|bạn phải là thành viên|chỉ thành viên nhóm mới có thể bình luận|join group to comment/i.test(pageText)) {
        return 'Tài khoản chưa được duyệt vào nhóm kín này (Cần tham gia nhóm và chờ Admin duyệt trước).';
      }
      if (/nội dung này hiện không khả dụng|bài viết này đã bị gỡ|bài viết không còn tồn tại|this content isn't available/i.test(pageText)) {
        return 'Bài viết đã bị xóa, bị ẩn hoặc cài đặt quyền riêng tư hạn chế người xem.';
      }
      if (/bạn tạm thời bị chặn|bạn đã dùng tính năng này quá nhanh|you’re temporarily blocked/i.test(pageText)) {
        return 'Tài khoản đang bị Facebook tạm hạn chế tính năng bình luận (Action Blocked).';
      }
    } catch {}
    return 'Không tìm thấy khung soạn thảo bình luận (Có thể bài viết bị tắt bình luận, yêu cầu duyệt thành viên hoặc giao diện Facebook chưa tải xong).';
  }

  /**
   * Mở hoặc tìm khung soạn thảo bình luận của bài viết
   * Hỗ trợ đầy đủ Facebook Lexical Editor v2026, tự động vượt màn hình Tiếp Tục & Lazy Render
   */
  async openCommentComposer(page: Page, targetPostId?: string): Promise<ComposerHandle | null> {
    // 0. Tự động vượt qua màn hình trung gian "Tiếp tục Eco Trang" / "Tiếp tục" nếu có
    try {
      const continueBtn = page.locator([
        'div[aria-label*="Eco Trang" i][role="button"]',
        'div[aria-label*="Tiếp tục" i][role="button"]',
        'div[aria-label*="Continue" i][role="button"]',
        'button:has-text("Tiếp tục")',
        'div[role="button"]:has-text("Tiếp tục")',
      ].join(', ')).first();

      if (await continueBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
        console.log('[FacebookComposer] 🔘 Phát hiện nút "Tiếp tục Eco Trang", tự động click đăng nhập...');
        await humanHoverAndClick(page, continueBtn).catch(() => continueBtn.click());
        await randomSleep(2000, 3200);
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      }
    } catch {}

    // Đóng các popup cản trở nếu có (Đóng, Để sau, Không phải bây giờ)
    try {
      const closeBtn = page.locator('div[aria-label="Đóng"], div[aria-label="Close"], div[role="button"]:has-text("Để sau"), div[role="button"]:has-text("Không phải bây giờ")').first();
      if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await closeBtn.click().catch(() => {});
        await randomSleep(400, 800);
      }
    } catch {}

    // Cuộn nhẹ trang để kích hoạt Lazy Rendering các thành phần bài viết
    await page.evaluate(() => {
      const post = document.querySelector('div[role="article"], div[role="main"], div[data-pagelet*="FeedUnit"], div[data-pagelet*="GroupFeed"]');
      if (post) {
        post.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollBy({ top: 400, behavior: 'smooth' });
      }
    }).catch(() => {});
    await randomSleep(800, 1500);

    // 0.3. Ưu tiên Popup Modal bài viết (div[role="dialog"]) nếu link mở dạng modal Group/Permalink
    try {
      const dialogModal = page.locator('div[role="dialog"]').filter({ hasText: /Thích|Bình luận|Chia sẻ|Like|Comment|Share/i }).last();
      if (await dialogModal.isVisible({ timeout: 1500 }).catch(() => false)) {
        const modalEditor = await this.resolveFirstVisible([
          dialogModal.locator('form [role="textbox"][contenteditable="true"]').last(),
          dialogModal.locator('[role="textbox"][contenteditable="true"][aria-label*="Viết bình luận" i]').last(),
          dialogModal.locator('[role="textbox"][contenteditable="true"][aria-label*="Bình luận" i]').last(),
          dialogModal.locator('[contenteditable="true"][data-lexical-editor="true"]').last(),
        ]);
        if (modalEditor) {
          await this.highlightTarget(modalEditor, '🎯 [F12] Ô Bình Luận Modal');
          console.log('[FacebookComposer] 🎯 Tìm thấy khung soạn thảo trong Popup Modal bài viết.');
          return { surface: 'dialog-modal-comment', editor: modalEditor };
        }
      }
    } catch {}

    // 0.5. Ưu tiên tìm trong bài viết đầu tiên (dành cho bài vừa đăng trên Group/Feed)
    try {
      const firstArticle = page.locator('div[role="feed"] div[role="article"], div[role="article"]').first();
      if (await firstArticle.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Kiểm tra xem bài đầu tiên đã có ô nhập comment chưa
        const firstArticleEditor = await this.resolveFirstVisible([
          firstArticle.locator('[role="textbox"][contenteditable="true"]').first(),
          firstArticle.locator('[contenteditable="true"][data-lexical-editor="true"]').first(),
          firstArticle.locator('[role="textbox"]').first(),
        ]);
        if (firstArticleEditor) {
          console.log('[FacebookComposer] 🎯 Tìm thấy khung soạn thảo trong bài viết đầu tiên.');
          return { surface: 'first-article-comment', editor: firstArticleEditor };
        }

        // Nếu chưa mở, click nút Bình luận của bài viết đầu tiên
        const firstArticleTrigger = await this.resolveFirstVisible([
          firstArticle.locator('[role="button"][aria-label*="Bình luận" i]').first(),
          firstArticle.locator('div[role="button"]:has-text("Bình luận")').first(),
          firstArticle.locator('span:text-is("Bình luận")').first(),
          firstArticle.locator('span:has-text("Viết bình luận")').first(),
          firstArticle.locator('div:has-text("Viết bình luận...")').first(),
        ]);
        if (firstArticleTrigger) {
          console.log('[FacebookComposer] 🎯 Đang click nút "Bình luận" của bài viết đầu tiên...');
          await humanHoverAndClick(page, firstArticleTrigger).catch(() => firstArticleTrigger.click());
          await randomSleep(800, 1500);

          const editorAfterFirstArticleClick = await this.resolveFirstVisible([
            firstArticle.locator('[role="textbox"][contenteditable="true"]').first(),
            firstArticle.locator('[contenteditable="true"][data-lexical-editor="true"]').first(),
            firstArticle.locator('[role="textbox"]').first(),
            firstArticle.locator('[contenteditable="true"]').first(),
          ]);
          if (editorAfterFirstArticleClick) {
            return { surface: 'first-article-comment', editor: editorAfterFirstArticleClick };
          }
        }
      }
    } catch {}

    // 1. Kiểm tra nếu khung soạn thảo đã hiển thị sẵn (hỗ trợ cả Lexical Editor 2026)
    const activeEditor = await this.resolveFirstVisible([
      page.locator('[role="textbox"][contenteditable="true"]').last(),
      page.locator('[contenteditable="true"][data-lexical-editor="true"]').last(),
      page.locator('form [role="textbox"]').last(),
      page.locator('form [contenteditable="true"]').last(),
      page.locator('[role="textbox"][aria-label*="Viết bình luận" i]').last(),
      page.locator('[role="textbox"][aria-label*="Bình luận công khai" i]').last(),
      page.locator('[role="textbox"][aria-label*="Bình luận dưới tên" i]').last(),
      page.locator('[role="textbox"][aria-label*="Bình luận với tư cách" i]').last(),
      page.locator('[role="textbox"][aria-label*="Viết câu trả lời" i]').last(),
      page.locator('[role="textbox"][aria-label*="Write a comment" i]').last(),
      page.locator('[role="textbox"][aria-label*="Comment as" i]').last(),
      page.locator('[contenteditable="true"][aria-label*="Viết bình luận" i]').last(),
      page.locator('[contenteditable="true"][aria-label*="Write a comment" i]').last(),
      page.locator('[contenteditable="true"][aria-label*="Bình luận" i]').last(),
      page.locator('[role="article"] [contenteditable="true"]').last(),
      page.locator('div[role="dialog"] [contenteditable="true"]').last(),
    ]);

    if (activeEditor) {
      await this.highlightTarget(activeEditor, '🎯 [F12] Ô Bình Luận Bài Chính');
      return { surface: 'main-post-comment', editor: activeEditor };
    }

    // 2. Tìm nút trigger mở khung soạn thảo bình luận (Click nút "Bình luận" của bài viết)
    const trigger = await this.resolveFirstVisible([
      page.locator('[role="button"][aria-label*="Viết bình luận" i]').first(),
      page.locator('[role="button"][aria-label*="Bình luận" i]').first(),
      page.locator('[role="button"][aria-label*="Để lại bình luận" i]').first(),
      page.locator('[role="button"][aria-label*="Write a comment" i]').first(),
      page.locator('[role="button"][aria-label*="Comment" i]').first(),
      page.locator('[role="article"] div[role="button"]:has-text("Bình luận")').first(),
      page.locator('div[role="button"]:has-text("Bình luận")').first(),
      page.locator('span:text-is("Bình luận")').first(),
      page.locator('span:has-text("Viết bình luận")').first(),
      page.locator('div:has-text("Viết bình luận công khai...")').first(),
      page.locator('div:has-text("Viết bình luận...")').first(),
    ]);

    if (trigger) {
      console.log('[FacebookComposer] 🎯 Đã tìm thấy nút/khung trigger "Bình luận", đang click mở editor...');
      await humanHoverAndClick(page, trigger);
      await randomSleep(900, 1600);

      const editorAfterClick = await this.resolveFirstVisible([
        page.locator('[role="textbox"][contenteditable="true"]').last(),
        page.locator('[contenteditable="true"][data-lexical-editor="true"]').last(),
        page.locator('form [role="textbox"]').last(),
        page.locator('form [contenteditable="true"]').last(),
        page.locator('[role="textbox"][aria-label*="Viết bình luận" i]').last(),
        page.locator('[role="textbox"][aria-label*="Bình luận công khai" i]').last(),
        page.locator('[role="textbox"][aria-label*="Write a comment" i]').last(),
        page.locator('[contenteditable="true"][aria-label*="Viết bình luận" i]').last(),
      ]);

      if (editorAfterClick) {
        return { surface: 'main-post-comment', editor: editorAfterClick };
      }
    }

    // 3. Chiến lược dự phòng (Fallback): Thử cuộn thêm và click vào placeholder của feed
    await page.evaluate(() => window.scrollBy({ top: 350, behavior: 'smooth' })).catch(() => {});
    await randomSleep(800, 1200);

    const fallbackPlaceholder = await this.resolveFirstVisible([
      page.locator('div[data-pagelet*="Comment"] [contenteditable="true"]').last(),
      page.locator('div:has-text("Viết bình luận...")').last(),
      page.locator('[contenteditable="true"]').last(),
    ]);

    if (fallbackPlaceholder) {
      await fallbackPlaceholder.click().catch(() => {});
      await randomSleep(500, 900);
      return { surface: 'fallback-comment', editor: fallbackPlaceholder };
    }

    return null;
  }

  /**
   * Gõ nội dung bình luận với phong cách tự nhiên (Human hover, click, typing & Spintax)
   * Tuyệt đối bảo vệ dữ liệu chống lỗi [object Object]
   */
  async fillComment(page: Page, handle: ComposerHandle, text: string | any): Promise<void> {
    let cleanText = '';
    if (typeof text === 'string') {
      cleanText = text;
    } else if (text && typeof text === 'object') {
      cleanText = text.comment || text.text || text.body || String(text);
    }

    const rawContent = cleanText.trim();
    if (!rawContent || rawContent === '[object Object]') {
      throw new Error('Nội dung bình luận không hợp lệ hoặc bị lỗi định dạng [object Object]');
    }

    // Áp dụng Spintax {A|B|C} để tạo biến thể tự nhiên chống spam
    const content = spinText(rawContent);

    // Di chuyển chuột tự nhiên tới ô bình luận rồi click
    await humanHoverAndClick(page, handle.editor);
    await randomSleep(450, 950);

    // Xóa nội dung cũ nếu có
    await handle.editor.fill('').catch(() => {});
    await handle.editor.focus().catch(() => {});
    await randomSleep(250, 550);

    // Gõ phím theo nhịp sinh học con người (35ms-80ms + pauses tại dấu câu)
    await humanType(page, content);
    handle.filledText = content;
    await randomSleep(600, 1200);
  }

  /**
   * Bấm Enter để gửi bình luận với khoảng dừng đọc lại trước khi gửi
   */
  async submitComment(page: Page, handle: ComposerHandle): Promise<boolean> {
    if (!handle.filledText) {
      throw new Error('Chưa có nội dung bình luận để gửi');
    }

    // Tạm dừng 1.2s - 2.8s mô phỏng đọc lại nội dung trước khi bấm gửi
    await humanReviewBeforeSubmit();

    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);

    // Kiểm tra xem ô soạn thảo đã được gửi đi chưa
    const remainingText = await handle.editor.textContent({ timeout: 2000 }).catch(() => '');
    if (!remainingText || remainingText.trim() === '') {
      return true;
    }

    // Nếu Enter chưa gửi, thử click nút Gửi / Post nếu xuất hiện
    const sendBtn = await this.resolveFirstVisible([
      page.locator('[aria-label*="Đăng bình luận"]').first(),
      page.locator('[aria-label*="Post comment"]').first(),
      page.locator('button[type="submit"]').last(),
    ]);

    if (sendBtn) {
      await sendBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
      return true;
    }

    return true;
  }

  /**
   * Tìm và trả lời (Reply) bình luận của một người cụ thể (Khắc phục lỗi F02)
   */
  async replyToComment(
    page: Page,
    options: { targetAuthor?: string; targetText?: string; replyText: string }
  ): Promise<boolean> {
    const replyText = options.replyText.trim();
    if (!replyText) throw new Error('Nội dung trả lời bình luận không được để trống.');

    // 1. Chuyển bộ lọc sang "Tất cả bình luận" để quét trọn vẹn
    await this.preferAllComments(page);

    // 2. Tìm khối bình luận mục tiêu chính xác
    let commentRoot = page.locator('[aria-label*="Bình luận dưới tên"], [aria-label*="Comment by"], [role="article"]');
    if (options.targetAuthor) {
      commentRoot = commentRoot.filter({ hasText: options.targetAuthor });
    }
    if (options.targetText) {
      commentRoot = commentRoot.filter({ hasText: options.targetText });
    }

    const replyButton = commentRoot.getByRole('button', { name: /^Trả lời$|^Reply$/i }).first();
    const isVisible = await replyButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isVisible) {
      console.warn('[FacebookComposer] Không tìm thấy đúng bình luận mục tiêu để trả lời (Không fallback để tránh reply nhầm người).');
      return false;
    }

    await this.highlightTarget(replyButton, '🎯 [F12] Nút Trả Lời', '#a855f7');
    await humanHoverAndClick(page, replyButton);
    await randomSleep(900, 1600);

    // 3. Tìm ô soạn thảo trả lời vừa xuất hiện trong ngữ cảnh
    const replyEditor = await this.resolveFirstVisible([
      page.getByRole('textbox', { name: /Trả lời|Reply/i }).last(),
      page.locator('[role="textbox"][aria-label*="Trả lời"]').last(),
      page.locator('[role="textbox"][aria-label*="Reply"]').last(),
      page.locator('[contenteditable="true"][aria-label*="Trả lời"]').last(),
    ]);

    if (!replyEditor) return false;

    await this.highlightTarget(replyEditor, '🎯 [F12] Ô Nhập Trả Lời', '#10b981');
    await humanHoverAndClick(page, replyEditor);
    await randomSleep(400, 800);
    await replyEditor.fill('').catch(() => {});
    await replyEditor.focus().catch(() => {});
    const finalReplyText = spinText(replyText);
    await humanType(page, finalReplyText);
    await humanReviewBeforeSubmit();
    await page.keyboard.press('Enter');
    await randomSleep(2500, 3800);

    // Hậu kiểm: kiểm tra xem text đã xuất hiện trên trang chưa
    const snippet = finalReplyText.substring(0, 25);
    const verified = await page.evaluate((s) => {
      return document.body.innerText.includes(s);
    }, snippet).catch(() => false);

    return verified;
  }

  /**
   * Tự động bật chế độ "Tất cả bình luận"
   */
  async preferAllComments(page: Page): Promise<void> {
    const sortBtn = await this.resolveFirstVisible([
      page.getByRole('button', { name: /^Phù hợp nhất|^Most relevant|^Mới nhất|^Newest/i }).first(),
      page.locator('[aria-label*="Phù hợp nhất"]').first(),
      page.locator('[aria-label*="Most relevant"]').first(),
    ]);

    if (!sortBtn) return;

    await sortBtn.click().catch(() => {});
    await page.waitForTimeout(500);

    const allCommentsOption = await this.resolveFirstVisible([
      page.getByRole('menuitem', { name: /^Tất cả bình luận|^All comments/i }).first(),
      page.getByRole('option', { name: /^Tất cả bình luận|^All comments/i }).first(),
    ]);

    if (allCommentsOption) {
      await allCommentsOption.click().catch(() => {});
      await page.waitForTimeout(800);
    }
  }

  private async resolveFirstVisible(locators: Locator[]): Promise<Locator | null> {
    for (const locator of locators) {
      try {
        if (await locator.isVisible({ timeout: 1200 })) {
          return locator;
        }
      } catch {}
    }
    return null;
  }
}

export const facebookComposer = new FacebookComposerService();
