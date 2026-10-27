import { Page } from 'playwright';
import { messengerEngine } from '../engine/messenger-engine.js';
import { facebookComposer } from '../core/facebook-composer.js';
import { getDefaultAccount } from '../db/store.js';
import { addCommentLog } from '../db/auto-comment-store.js';
import { TargetReceipt, ExecutionOutcome } from './action-result.js';
import {
  humanBrowseGroupFeed,
  humanReadPostBeforeComment,
  humanLingerAfterAction,
  randomSleep,
} from '../core/human-behavior.js';
import { assertAccountSafeOrAbort } from '../core/checkpoint-guard.js';
import fs from 'fs';
import path from 'path';

export interface PostCommentOptions {
  postUrl: string;
  commentText: string;
  replyToAuthor?: string;
  replyToText?: string;
  accountId?: string;
}

export interface CommentExecutionResult {
  success: boolean;
  outcome: ExecutionOutcome;
  receipt: TargetReceipt;
  error?: string;
}

export class CommentService {
  /**
   * Thực thi bình luận vào bài viết hoặc trả lời một bình luận cụ thể
   */
  public static async executeComment(options: PostCommentOptions): Promise<CommentExecutionResult> {
    const start = Date.now();
    const currentAcc = getDefaultAccount();
    const accountName = currentAcc?.name || 'Eco Trang';
    const accountId = currentAcc?.id || 'default';

    // Chuẩn hóa an toàn dữ liệu đầu vào chống lỗi [object Object]
    if (typeof options.commentText === 'object' && options.commentText !== null) {
      options.commentText = (options.commentText as any).comment || (options.commentText as any).text || String(options.commentText);
    }

    if (!messengerEngine.isReady()) {
      const receipt: TargetReceipt = {
        targetId: options.postUrl,
        targetType: 'post',
        outcome: 'session_checkpoint_required',
        errorMessage: 'Trình duyệt Facebook chưa sẵn sàng hoặc phiên đăng nhập chưa tải xong.',
        observedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
      return {
        success: false,
        outcome: 'session_checkpoint_required',
        receipt,
        error: receipt.errorMessage,
      };
    }

    try {
      const receipt = await messengerEngine.withNewFacebookPage<TargetReceipt>(async (page: Page) => {
        console.log(`[CommentService] Đang mở bài viết: ${options.postUrl}`);
        await page.goto(options.postUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await randomSleep(2200, 3500);

        // Bảo vệ Nick trước khi thao tác
        await assertAccountSafeOrAbort(page, 'Trước khi bình luận bài viết');

        // Mô phỏng người thật đọc bài viết trước khi bình luận
        await humanReadPostBeforeComment(page);

        let success = false;
        let isReply = false;

        if (options.replyToAuthor || options.replyToText) {
          isReply = true;
          console.log(`[CommentService] Đang trả lời bình luận của: ${options.replyToAuthor || 'bình luận chỉ định'}`);
          success = await facebookComposer.replyToComment(page, {
            targetAuthor: options.replyToAuthor,
            targetText: options.replyToText,
            replyText: options.commentText,
          });
        } else {
          console.log(`[CommentService] Đang mở khung soạn thảo bình luận bài viết...`);
          const handle = await facebookComposer.openCommentComposer(page);
          if (!handle) {
            const detailedReason = await facebookComposer.diagnoseIneligibility(page);
            throw new Error(detailedReason);
          }

          await facebookComposer.fillComment(page, handle, options.commentText);
          const submitted = await facebookComposer.submitComment(page, handle);
          if (!submitted) {
            throw new Error('Không thể gửi bình luận (Enter hoặc nút Gửi không phản hồi)');
          }

          await humanLingerAfterAction(page);
          await assertAccountSafeOrAbort(page, 'Sau khi gửi bình luận');

          // Hậu kiểm nội dung xuất hiện trên DOM
          const filled = handle.filledText || options.commentText.trim();
          const snippet = filled.substring(0, 25);
          const verified = await page.evaluate((s) => {
            return document.body.innerText.includes(s);
          }, snippet).catch(() => false);

          success = submitted && verified;
        }

        const durationMs = Date.now() - start;
        const proofDir = path.resolve('./.tmp_media');
        if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
        const proofCommentPath = path.join(proofDir, `proof_comment_${Date.now()}.png`);
        await page.screenshot({ path: proofCommentPath, fullPage: false }).catch(() => {});

        // Trích xuất link bình luận trực tiếp nếu có
        const commentPermalink = await page.evaluate((textSnippet) => {
          const links = Array.from(document.querySelectorAll('a[href*="comment_id="], a[href*="/permalink/"]'));
          for (const a of links) {
            const href = (a as HTMLAnchorElement).href;
            if (href && href.includes('comment_id=')) return href;
          }
          return null;
        }, options.commentText.slice(0, 30)).catch(() => null);

        if (success) {
          return {
            targetId: options.postUrl,
            targetName: isReply ? `Trả lời: ${options.replyToAuthor || 'Bình luận'}` : 'Bình luận bài viết',
            targetType: 'post',
            canonicalUrl: options.postUrl,
            resultUrl: commentPermalink || options.postUrl,
            outcome: 'verified_success',
            evidenceText: options.commentText.substring(0, 100),
            observedAt: new Date().toISOString(),
            durationMs,
            screenshotPath: fs.existsSync(proofCommentPath) ? proofCommentPath : undefined,
          };
        } else {
          return {
            targetId: options.postUrl,
            targetType: 'post',
            canonicalUrl: options.postUrl,
            resultUrl: commentPermalink || options.postUrl,
            outcome: 'uncertain',
            errorMessage: 'Facebook đã nhận lệnh nhưng chưa đọc được nội dung bình luận xuất hiện trên bài.',
            observedAt: new Date().toISOString(),
            durationMs,
            screenshotPath: fs.existsSync(proofCommentPath) ? proofCommentPath : undefined,
          };
        }
      });

      // Lưu log hệ thống
      addCommentLog({
        accountId,
        accountName,
        postUrl: options.postUrl,
        postAuthor: options.replyToAuthor || 'Facebook Post',
        postSnippet: options.postUrl,
        commentText: options.commentText,
        status: receipt.outcome === 'verified_success' ? 'success' : 'failed',
      });

      return {
        success: receipt.outcome === 'verified_success',
        outcome: receipt.outcome,
        receipt,
      };
    } catch (err: any) {
      console.error(`[CommentService] Lỗi khi thực thi bình luận:`, err.message);
      const receipt: TargetReceipt = {
        targetId: options.postUrl,
        targetType: 'post',
        outcome: 'failed',
        errorMessage: err.message,
        observedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };

      addCommentLog({
        accountId,
        accountName,
        postUrl: options.postUrl,
        postAuthor: 'Facebook Post',
        postSnippet: options.postUrl,
        commentText: options.commentText,
        status: 'failed',
      });

      return {
        success: false,
        outcome: 'failed',
        receipt,
        error: err.message,
      };
    }
  }
}
