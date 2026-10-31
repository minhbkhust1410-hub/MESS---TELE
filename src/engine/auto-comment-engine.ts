import type { BrowserContext, Page } from 'playwright';
import { createBrowserSession } from '../core/browser-session.js';
import { facebookComposer } from '../core/facebook-composer.js';
import { getAllAccounts, FacebookAccount } from '../db/store.js';
import { messengerEngine } from './messenger-engine.js';
import {
  spinText,
  ensureUniqueHumanText,
  humanBrowseGroupFeed,
  humanReadPostBeforeComment,
  humanLingerAfterAction,
  humanInterGroupCooldown,
  smoothScrollDown,
  randomSleep,
  humanReviewBeforeSubmit,
} from '../core/human-behavior.js';
import { assertAccountSafeOrAbort } from '../core/checkpoint-guard.js';
import fs from 'fs';
import path from 'path';
import {
  getAutoCommentConfig,
  getCommentTemplates,
  getRandomTemplate,
  getTargetGroups,
  getKeywords,
  isPostProcessed,
  markPostProcessed,
  addCommentLog,
  CommentLog,
} from '../db/auto-comment-store.js';
import {
  findBestMatchingProperty,
  findBestMatchingPropertyWithDistance,
  generateTargetedComment,
  incrementMatchedCount,
} from '../services/property-inventory.js';
import { dataModeService } from '../services/data-mode-service.js';
import { parseForexLead, generateForexTargetedComment } from '../services/forex-parser.js';

export interface ScrapedPost {
  id: string;
  url: string;
  author: string;
  content: string;
  matchedKeywords: string[];
}

export type OnCommentReportCallback = (report: {
  success: boolean;
  postUrl: string;
  postAuthor: string;
  postSnippet: string;
  commentText: string;
  accountName: string;
  proxyUsed?: string;
  commentPermalink?: string;
  screenshotPath?: string;
  error?: string;
}) => Promise<void>;

export class AutoCommentEngine {
  private isScanning = false;
  private scanTimer: NodeJS.Timeout | null = null;
  private reportCallback: OnCommentReportCallback | null = null;

  public setReportCallback(cb: OnCommentReportCallback) {
    this.reportCallback = cb;
  }

  /**
   * Khởi chạy vòng lặp tự động quét nhóm & bình luận
   */
  public startWatcher(intervalMinutes = 10) {
    if (this.scanTimer) clearInterval(this.scanTimer);
    const currentConfig = getAutoCommentConfig();
    console.log(
      `🤖 [AutoComment Engine] Watcher nền sẵn sàng; quét tự động hiện ${currentConfig.enabled ? 'đang bật' : 'đang tắt'} (kiểm tra mỗi ${intervalMinutes} phút).`
    );
    
    // Quét chu kỳ
    this.scanTimer = setInterval(async () => {
      const config = getAutoCommentConfig();
      if (!config.enabled) return;
      await this.runScanCycle().catch((err) => {
        console.error('[AutoComment Engine] Lỗi chu kỳ quét:', err.message);
      });
    }, intervalMinutes * 60 * 1000);
  }

  public stopWatcher() {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  /**
   * Chạy 1 chu kỳ quét qua toàn bộ các nhóm đã cấu hình
   */
  public async runScanCycle(): Promise<{ scannedGroups: number; postsFound: number; commentsMade: number }> {
    if (this.isScanning) {
      console.log('[AutoComment Engine] Đang có 1 phiên quét chạy, bỏ qua chu kỳ này.');
      return { scannedGroups: 0, postsFound: 0, commentsMade: 0 };
    }

    const groups = getTargetGroups().filter((g) => g.status === 'active');
    const keywords = getKeywords();
    const config = getAutoCommentConfig();

    if (groups.length === 0) {
      console.log('[AutoComment Engine] Chưa có nhóm nào trong danh sách quét.');
      return { scannedGroups: 0, postsFound: 0, commentsMade: 0 };
    }

    if (keywords.length === 0) {
      console.log('[AutoComment Engine] Chưa cấu hình từ khóa mục tiêu.');
      return { scannedGroups: 0, postsFound: 0, commentsMade: 0 };
    }

    this.isScanning = true;
    let totalPostsFound = 0;
    let totalCommentsMade = 0;

    const accounts = getAllAccounts().filter((a) => {
      if (a.status !== 'live' && a.status !== 'active') return false;
      if (a.isDefault) return true;
      return Array.isArray(a.cookies) && a.cookies.length > 0;
    });
    if (accounts.length === 0) {
      const defaultAcc = getDefaultAccount();
      if (defaultAcc) accounts.push(defaultAcc);
    }
    if (accounts.length === 0) {
      console.warn('[AutoComment Engine] Không có tài khoản Facebook nào đang hoạt động.');
      this.isScanning = false;
      return { scannedGroups: 0, postsFound: 0, commentsMade: 0 };
    }

    let accIndex = 0;

    try {
      for (const group of groups) {
        // Chọn tài khoản luân phiên theo round-robin
        const account = accounts[accIndex % accounts.length];
        accIndex++;

        console.log(`\n🔍 [AutoComment Engine] Đang quét nhóm: ${group.name} qua Nick [${account.name}]...`);
        const posts = await this.scanGroupPosts(group.url, account);
        totalPostsFound += posts.length;

        for (const post of posts) {
          if (isPostProcessed(post.id)) continue;

          console.log(`🎯 [AutoComment Engine] PHÁT HIỆN BÀI VIẾT PHÙ HỢP!`);
          console.log(`• Tác giả: ${post.author}`);
          console.log(`• Từ khóa khớp: ${post.matchedKeywords.join(', ')}`);
          console.log(`• Link bài: ${post.url}`);

          const currentMode = dataModeService.getCurrentMode();
          let finalComment = getRandomTemplate();

          if (currentMode === 'forex_finance') {
            const forexLead = parseForexLead(post.content);
            finalComment = generateForexTargetedComment(forexLead);
            console.log(`📈 [Forex Engine] Đã nhận diện Lead: [${forexLead.intentLabel}] (${forexLead.symbols.join(', ') || 'XAU/USD'} - Độ tin cậy: ${forexLead.confidenceScore}%)!`);
          } else {
            // Khớp bài viết với Quỹ Căn BĐS Trong Ngày theo khoảng cách Google Maps & ngân sách
            const matchResult = findBestMatchingPropertyWithDistance(post.content);
            if (matchResult) {
              const matchedProp = matchResult.property;
              // Sử dụng Free AI (Gemini / Groq / NLP) để sinh bình luận cá nhân hóa (Đã tắt GPS)
              try {
                const { freeAiService, getAiConfig } = await import('../services/free-ai-service.js');
                const aiCfg = getAiConfig();
                if (aiCfg.autoAiComment && aiCfg.apiKey && aiCfg.provider !== 'offline') {
                  const aiRes = await freeAiService.generateSmartCommentWithAI(post.content, matchedProp, matchResult);
                  finalComment = aiRes.comment;
                  console.log(`🤖 [Free AI Comment Engine] Đã sinh bình luận qua ${aiCfg.provider}: "${finalComment}"`);
                } else {
                  finalComment = generateTargetedComment(matchedProp, matchResult);
                }
              } catch (err) {
                finalComment = generateTargetedComment(matchedProp, matchResult);
              }

              const bName = matchedProp.building || matchedProp.project;
              console.log(`🏠 [Kho Nguồn Ecopark] Đã khớp toà/căn: ${bName} (${matchedProp.bedroom} - ${matchedProp.priceText}) - Điểm: ${matchResult.score}%!`);
              incrementMatchedCount(matchedProp.id);
            } else {
              console.log(`ℹ️ [AutoComment] Không có căn cụ thể khớp trong kho, dùng mẫu chung ngẫu nhiên.`);
            }
          }

          // Delay ngẫu nhiên bảo vệ tài khoản
          const delaySec = Math.floor(
            Math.random() * (config.delayMaxSeconds - config.delayMinSeconds + 1) + config.delayMinSeconds
          );
          console.log(`⏳ Giãn cách an toàn ${delaySec}s trước khi đăng bình luận...`);
          await new Promise((r) => setTimeout(r, delaySec * 1000));

          // Thực hiện bình luận
          const res = await this.commentOnPost(post.url, finalComment, account);
          if (res.success) {
            markPostProcessed(post.id, account.id);
            totalCommentsMade++;
          }
        }
      }
    } finally {
      this.isScanning = false;
    }

    return {
      scannedGroups: groups.length,
      postsFound: totalPostsFound,
      commentsMade: totalCommentsMade,
    };
  }

  /**
   * Quét và trích xuất các bài viết mới từ một Group Facebook
   * Tránh hoàn toàn lỗi tranh chấp khóa profile bằng việc dùng withNewFacebookPage cho nick đang chạy
   */
  public async scanGroupPosts(groupUrl: string, account: FacebookAccount): Promise<ScrapedPost[]> {
    const keywords = getKeywords();
    let session = null;
    const matchedPosts: ScrapedPost[] = [];

    const currentActiveAccId = messengerEngine.getCurrentAccountId();
    const isCurrentActive = account.id === currentActiveAccId || !currentActiveAccId;

    const performScrape = async (page: Page) => {
      const seenIds = new Set<string>();

      // Chuẩn hóa link nhóm theo chế độ sắp xếp bài mới nhất (CHRONOLOGICAL) từ lõi KudoX
      const cleanBase = groupUrl.split('?')[0].replace(/\/$/, '');
      const chronoUrl = `${cleanBase}/?sorting_setting=CHRONOLOGICAL`;

      console.log(`[FalconX Scanner] Đang mở nhóm để tìm bài viết mới nhất: ${chronoUrl}`);
      await page.goto(chronoUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await randomSleep(2200, 3600);

      // Bảo vệ Nick: Kiểm tra Checkpoint / Giới hạn thao tác ngay khi vào nhóm
      await assertAccountSafeOrAbort(page, `Mở nhóm ${groupUrl}`);

      // Đóng popup nếu có
      const popups = page.locator('div[aria-label="Đóng"], div[aria-label="Close"], div[role="button"]:has-text("Để sau")');
      if (await popups.first().isVisible({ timeout: 1500 }).catch(() => false)) {
        await popups.first().click().catch(() => {});
      }

      // Cuộn mượt theo chuẩn lõi KudoX (smoothScrollDown) để nạp các bài viết mới nhất như người thật
      await smoothScrollDown(page, 2);

      // Quét DOM tìm các bài viết với bộ lọc phân loại ý định Khách Hàng (Customer Intent Filter)
      const domPosts = await page.evaluate((kws) => {
        const results: Array<{ id: string; author: string; content: string; url: string; matched: string[] }> = [];
        const articles = document.querySelectorAll('[role="feed"] [role="article"], [role="article"]');

        const DEMAND_KEYWORDS = [
          'cần thuê', 'tìm thuê', 'cần tìm', 'tìm căn', 'ai có căn', 'cần mua',
          'tìm 1pn', 'tìm 2pn', 'tìm 3pn', 'tìm studio', 'muốn thuê', 'tài chính',
          'ngân sách', 'dọn vào', 'tìm phòng', 'có căn nào', 'inbox mình', 'thuê căn hộ'
        ];

        const BROKER_SUPPLY_KEYWORDS = [
          'chính chủ gửi', 'bán gấp', 'cắt lỗ', 'độc quyền', 'giỏ hàng', 'bảng hàng',
          'quỹ căn độc quyền', 'lh xem nhà', 'bên em có căn', 'liên hệ ngay', 'quỹ căn ngoại giao',
          'chuyên cho thuê', 'chuyên chuyển nhượng', 'chính chủ cho thuê'
        ];

        articles.forEach((art, idx) => {
          const text = (art as HTMLElement).innerText || '';
          const lowerText = text.toLowerCase();

          // 1. LOẠI BỎ NGAY BÀI VIẾT CỦA MÔI GIỚI KHÁC CHÀO BÁN (Tránh cmt vào bài của sale khác)
          const isBrokerPost = BROKER_SUPPLY_KEYWORDS.some((bw) => lowerText.includes(bw));
          if (isBrokerPost) return;

          // 2. Tìm link bài viết chi tiết hợp lệ (bắt buộc phải là permalink thực tế)
          const links = art.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="multi_permalinks="]');
          let postLink = '';
          links.forEach((l) => {
            const href = (l as HTMLAnchorElement).href;
            if (href && !postLink && (href.includes('/posts/') || href.includes('/permalink/'))) {
              postLink = href.split('?')[0];
            }
          });

          // Nếu không bóc tách được permalink cụ thể của bài viết, bỏ qua (không bao giờ lấy link chung của group)
          if (!postLink) return;

          // 3. Kiểm tra xem bài viết có bị tắt tính năng bình luận ngay trên feed không
          if (lowerText.includes('tính năng bình luận đã bị tắt') || lowerText.includes('comments have been turned off')) {
            return;
          }

          // 4. Kiểm tra xem có chứa từ khóa mục tiêu hoặc từ khóa nhu cầu khách hỏi không
          const matchedKws = kws.filter((kw: string) => lowerText.includes(kw.toLowerCase()));
          const matchedDemand = DEMAND_KEYWORDS.filter((dk) => lowerText.includes(dk));
          const allMatched = Array.from(new Set([...matchedKws, ...matchedDemand]));

          // Chỉ nhận bài viết nếu có ít nhất 1 từ khóa nhu cầu của khách hàng
          if (allMatched.length > 0) {
            const authorEl = art.querySelector('h2, h3, h4, strong, a[role="link"]');
            const author = authorEl ? (authorEl as HTMLElement).innerText.trim() : 'Khách hỏi Ecopark';
            const id = postLink.replace(/[^0-9]/g, '') || `post_${Date.now()}_${idx}`;

            results.push({
              id,
              author,
              content: text.slice(0, 300),
              url: postLink,
              matched: allMatched,
            });
          }
        });
        return results;
      }, keywords);

      for (const dp of domPosts) {
        if (!seenIds.has(dp.id)) {
          seenIds.add(dp.id);
          matchedPosts.push({
            id: dp.id,
            url: dp.url,
            author: dp.author,
            content: dp.content,
            matchedKeywords: dp.matched,
          });
        }
      }
    };

    try {
      if (isCurrentActive && messengerEngine.isReady()) {
        await messengerEngine.withNewFacebookPage(performScrape);
      } else if (Array.isArray(account.cookies) && account.cookies.length > 0) {
        session = await createBrowserSession({
          userDataDir: account.profileDir,
          proxy: account.proxy || undefined,
          headless: true,
        });
        await performScrape(session.page);
        await session.close();
        session = null;
      } else if (messengerEngine.isReady()) {
        console.log(`[FalconX Scanner] Nick [${account.name}] chưa có phiên riêng -> Tự động điều phối qua Nick chính [Eco Trang]...`);
        await messengerEngine.withNewFacebookPage(performScrape);
      } else {
        console.warn(`[AutoComment Engine] Không có phiên đăng nhập hợp lệ cho nick ${account.name}`);
      }
    } catch (err: any) {
      if (session) await session.close().catch(() => {});
      console.warn(`[AutoComment Engine] Lỗi khi quét nhóm ${groupUrl}:`, err.message);
    }

    return matchedPosts;
  }

  /**
   * Thực hiện bình luận vào 1 bài viết Facebook cụ thể
   * Áp dụng đầy đủ Human Behavior (gõ phím tự nhiên, spintax, tạm dừng đọc lại)
   * Lưu ảnh minh chứng và trích xuất permalink trực tiếp để double-check
   */
  public async commentOnPost(
    postUrl: string,
    commentText: string | any,
    account?: FacebookAccount
  ): Promise<{ success: boolean; postUrl: string; commentPermalink?: string; screenshotPath?: string; error?: string }> {
    const acc = account || getAllAccounts().find((a) => a.isDefault) || getAllAccounts()[0];
    if (!acc) {
      return { success: false, postUrl, error: 'Không tìm thấy tài khoản Facebook nào để bình luận' };
    }

    // Chuẩn hóa tuyệt đối chống lỗi [object Object]
    let safeCommentText = '';
    if (typeof commentText === 'string') {
      safeCommentText = commentText;
    } else if (commentText && typeof commentText === 'object') {
      safeCommentText = commentText.comment || commentText.text || commentText.body || String(commentText);
    }
    if (!safeCommentText || safeCommentText.trim() === '' || safeCommentText === '[object Object]') {
      safeCommentText = getRandomTemplate();
    }
    commentText = safeCommentText;

    console.log(`🚀 [FalconX Comment Engine] Bắt đầu bình luận bài viết qua Nick [${acc.name}] (Proxy: ${acc.proxy || 'Trực tiếp'})...`);
    console.log(`🔗 Link: ${postUrl}`);
    console.log(`💬 Nội dung: "${commentText}"`);

    let session = null;
    try {
      const executeCommentTask = async (page: Page) => {
        await page.goto(postUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await randomSleep(2000, 3000);

        // Tự động vượt qua màn hình trung gian "Tiếp tục Eco Trang" nếu xuất hiện
        try {
          const continueBtn = page.locator('div[aria-label*="Eco Trang" i][role="button"], div[aria-label*="Tiếp tục" i][role="button"], button:has-text("Tiếp tục"), div[role="button"]:has-text("Tiếp tục")').first();
          if (await continueBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
            console.log('[FalconX Comment Engine] 🔘 Phát hiện nút "Tiếp tục Eco Trang", tự động click xác nhận...');
            await continueBtn.click().catch(() => {});
            await randomSleep(2000, 3200);
            await page.waitForLoadState('domcontentloaded').catch(() => {});
          }
        } catch {}

        // 1. Bảo vệ Nick trước khi thao tác: Kiểm tra Checkpoint / Rate Limit
        await assertAccountSafeOrAbort(page, 'Trước khi mở ô bình luận');

        // 2. Mô phỏng người thật đọc bài viết trước khi bình luận (rê chuột + dừng đọc 1.8-3.5s + cuộn nhẹ)
        await humanReadPostBeforeComment(page);

        // 3. Tìm và mở ô soạn thảo bình luận bằng rê chuột tự nhiên (hỗ trợ Lexical Editor 2026)
        const handle = await facebookComposer.openCommentComposer(page);
        if (!handle) {
          const detailedReason = await facebookComposer.diagnoseIneligibility(page);
          throw new Error(detailedReason);
        }

        // 4. Điền nội dung với Spintax và Human Typing (35-80ms/phím + nghỉ dấu câu)
        await facebookComposer.fillComment(page, handle, commentText);

        // 5. Gửi bình luận với Human review pause (đọc lại 1.5-3.2s trước khi bấm Enter)
        const submitted = await facebookComposer.submitComment(page, handle);
        if (!submitted) {
          throw new Error('Gửi bình luận thất bại: Không thể submit ô nhập');
        }

        // 6. Nán lại trang sau khi bình luận như người thật (2.2-4.2s) & kiểm tra cảnh báo Anti-Ban
        await humanLingerAfterAction(page);
        await assertAccountSafeOrAbort(page, 'Sau khi gửi bình luận');

        // Chụp ảnh bằng chứng
        const proofDir = path.resolve('./.tmp_media');
        if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
        const proofCommentPath = path.join(proofDir, `proof_comment_${Date.now()}.png`);
        await page.screenshot({ path: proofCommentPath, fullPage: false }).catch(() => {});

        // Trích xuất permalink comment
        const commentPermalink = await page.evaluate((textSnippet) => {
          const links = Array.from(document.querySelectorAll('a[href*="comment_id="], a[href*="/permalink/"]'));
          for (const a of links) {
            const href = (a as HTMLAnchorElement).href;
            if (href && href.includes('comment_id=')) return href;
          }
          return null;
        }, commentText.slice(0, 30)).catch(() => null);

        // Hậu kiểm: kiểm tra xem nội dung đã xuất hiện trong bài viết chưa
        const snippet = commentText.trim().substring(0, 30);
        const verified = await page.evaluate((s) => {
          return document.body.innerText.includes(s);
        }, snippet).catch(() => false);

        return {
          submitted,
          verified,
          screenshotPath: fs.existsSync(proofCommentPath) ? proofCommentPath : undefined,
          commentPermalink: commentPermalink || undefined,
        };
      };

      const currentActiveAccId = messengerEngine.getCurrentAccountId();
      const isCurrentActive = acc.id === currentActiveAccId || !currentActiveAccId;

      let result: { submitted: boolean; verified: boolean; screenshotPath?: string; commentPermalink?: string };

      if (isCurrentActive && messengerEngine.isReady()) {
        // Dùng tab riêng trong context đang chạy để tránh đè lockfile
        result = await messengerEngine.withNewFacebookPage(executeCommentTask);
      } else if (Array.isArray(acc.cookies) && acc.cookies.length > 0) {
        session = await createBrowserSession({
          userDataDir: acc.profileDir,
          proxy: acc.proxy || undefined,
          headless: true,
        });
        result = await executeCommentTask(session.page);
        await session.close();
        session = null;
      } else if (messengerEngine.isReady()) {
        console.log(`[FalconX AutoComment] Nick [${acc.name}] chưa có phiên riêng -> Điều phối bình luận qua Nick chính...`);
        result = await messengerEngine.withNewFacebookPage(executeCommentTask);
      } else {
        throw new Error(`Tài khoản ${acc.name} chưa đăng nhập và không có phiên hoạt động.`);
      }

      // Lưu nhật ký có kiểm chứng
      addCommentLog({
        accountId: acc.id,
        accountName: acc.name,
        postUrl,
        postAuthor: 'Thành viên Facebook',
        postSnippet: postUrl,
        commentText,
        status: result.submitted ? 'success' : 'failed',
      });

      // Bắn báo cáo sang Telegram nếu có callback
      if (this.reportCallback) {
        await this.reportCallback({
          success: result.submitted,
          postUrl,
          postAuthor: 'Bài viết Group',
          postSnippet: postUrl,
          commentText,
          accountName: acc.name,
          proxyUsed: acc.proxy,
          commentPermalink: result.commentPermalink,
          screenshotPath: result.screenshotPath,
        }).catch(() => {});
      }

      console.log(`✅ [FalconX Comment Engine] Đã bình luận thành công (Đã xác minh: ${result.verified})! Link: ${result.commentPermalink || postUrl}`);
      return {
        success: result.submitted,
        postUrl,
        commentPermalink: result.commentPermalink,
        screenshotPath: result.screenshotPath,
      };
    } catch (err: any) {
      if (session) await session.close().catch(() => {});
      console.error(`❌ [FalconX Comment Engine] Lỗi khi bình luận:`, err.message);

      addCommentLog({
        accountId: acc.id,
        accountName: acc.name,
        postUrl,
        postAuthor: 'Thành viên Facebook',
        postSnippet: postUrl,
        commentText,
        status: 'failed',
        error: err.message,
      });

      if (this.reportCallback) {
        await this.reportCallback({
          success: false,
          postUrl,
          postAuthor: 'Bài viết Group',
          postSnippet: postUrl,
          commentText,
          accountName: acc.name,
          proxyUsed: acc.proxy,
          error: err.message,
        }).catch(() => {});
      }

      return { success: false, postUrl, error: err.message };
    }
  }

  /**
   * Tự động đi phân tán bình luận vào các Group mục tiêu theo quy trình chuẩn
   * Hỗ trợ chia việc luân phiên đa nick (Multi-account Round-Robin)
   */
  public async distributeGroupComments(options: {
    commentTemplate: string;
    targetGroupUrls?: string[];
    maxGroups?: number;
    onProgress?: (idx: number, total: number, result: { success: boolean; groupUrl: string; postUrl?: string; commentPermalink?: string; screenshotPath?: string; error?: string }) => Promise<void>;
  }): Promise<{
    totalAttempted: number;
    successCount: number;
    receipts: Array<{
      groupUrl: string;
      postUrl?: string;
      commentPermalink?: string;
      screenshotPath?: string;
      success: boolean;
      error?: string;
    }>;
  }> {
    const allGroups = options.targetGroupUrls || getTargetGroups().filter((g) => g.status === 'active').map((g) => g.url);
    const groups = options.maxGroups ? allGroups.slice(0, options.maxGroups) : allGroups;

    if (groups.length === 0) {
      throw new Error('Chưa có nhóm nào trong danh sách mục tiêu. Hãy thêm nhóm bằng lệnh "+group <link>".');
    }

    const accounts = getAllAccounts().filter((a) => a.status === 'live' || a.status === 'active');
    if (accounts.length === 0) {
      throw new Error('Không có tài khoản Facebook nào đang hoạt động.');
    }

    console.log(`🚀 [FalconX Comment] Bắt đầu phân tán bình luận vào ${groups.length} nhóm qua ${accounts.length} tài khoản...`);
    const receipts: Array<{
      groupUrl: string;
      postUrl?: string;
      commentPermalink?: string;
      screenshotPath?: string;
      success: boolean;
      error?: string;
    }> = [];
    let successCount = 0;

    for (let i = 0; i < groups.length; i++) {
      const groupUrl = groups[i];
      // Luân phiên tài khoản theo round-robin
      const account = accounts[i % accounts.length];
      console.log(`\n📌 [${i + 1}/${groups.length}] Đang xử lý nhóm: ${groupUrl} qua Nick: ${account.name}...`);

      try {
        // Quét bài viết mới nhất trong nhóm
        const posts = await this.scanGroupPosts(groupUrl, account);
        if (!posts || posts.length === 0) {
          throw new Error('Không tìm thấy bài viết khả dụng trong nhóm để bình luận');
        }

        // Chọn bài viết đầu tiên chưa được xử lý
        const targetPost = posts.find((p) => !isPostProcessed(p.id)) || posts[0];
        // Biến thiên nội dung thông minh chống trùng lặp hash 100% giữa các nhóm
        const spunComment = ensureUniqueHumanText(options.commentTemplate, i);

        const res = await this.commentOnPost(targetPost.url, spunComment, account);
        if (res.success) {
          markPostProcessed(targetPost.id, account.id);
          successCount++;
        }

        const receiptItem = {
          groupUrl,
          postUrl: targetPost.url,
          commentPermalink: res.commentPermalink,
          screenshotPath: res.screenshotPath,
          success: res.success,
          error: res.error,
        };
        receipts.push(receiptItem);

        if (options.onProgress) {
          await options.onProgress(i + 1, groups.length, receiptItem).catch(() => {});
        }

        // Nếu phát hiện cảnh báo bảo vệ Nick (Checkpoint / Rate Limit / Action Blocked) -> Dừng ngay toàn bộ chuỗi để bảo vệ tài khoản!
        if (res.error && /CHẾ ĐỘ BẢO VỆ NICK|RATE_LIMITED|ACTION_BLOCKED|CHECKPOINT/i.test(res.error)) {
          console.warn('🛑 [Anti-Ban Guard] Phát hiện cảnh báo giới hạn từ Facebook -> Tự động dừng sớm phiên rải comment để bảo vệ Nick!');
          break;
        }
      } catch (err: any) {
        console.error(`❌ [FalconX Comment] Lỗi tại nhóm ${groupUrl}:`, err.message);
        const receiptItem = {
          groupUrl,
          success: false,
          error: err.message,
        };
        receipts.push(receiptItem);
        if (options.onProgress) {
          await options.onProgress(i + 1, groups.length, receiptItem).catch(() => {});
        }
        if (/CHẾ ĐỘ BẢO VỆ NICK|RATE_LIMITED|ACTION_BLOCKED|CHECKPOINT/i.test(err.message || '')) {
          console.warn('🛑 [Anti-Ban Guard] Dừng khẩn cấp phiên bình luận để bảo vệ an toàn cho Nick!');
          break;
        }
      }

      // Giãn cách thông minh chống khóa tính năng giữa các nhóm (18s-32s, nghỉ sâu 30s-45s sau mỗi 3 nhóm)
      if (i < groups.length - 1) {
        await humanInterGroupCooldown(i);
      }
    }

    return {
      totalAttempted: groups.length,
      successCount,
      receipts,
    };
  }

  /**
   * Trả lời (Reply) bình luận của khách hàng trên bài viết
   */
  public async replyCustomerComment(
    postUrl: string,
    replyText: string,
    targetAuthor?: string,
    account?: FacebookAccount
  ): Promise<{ success: boolean; error?: string }> {
    const acc = account || getAllAccounts().find((a) => a.isDefault) || getAllAccounts()[0];
    let session = null;
    try {
      session = await createBrowserSession({
        userDataDir: acc.profileDir,
        proxy: acc.proxy || undefined,
        headless: true,
      });

      await session.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await session.page.waitForTimeout(2000);

      const ok = await facebookComposer.replyToComment(session.page, {
        targetAuthor,
        replyText,
      });

      await session.close();
      if (ok) {
        addCommentLog({
          accountId: acc.id,
          accountName: acc.name,
          postUrl,
          postAuthor: targetAuthor || 'Khách hỏi',
          postSnippet: `Reply comment của ${targetAuthor}`,
          commentText: replyText,
          status: 'success',
        });
        return { success: true };
      } else {
        return { success: false, error: 'Không tìm thấy nút Trả lời cho bình luận này' };
      }
    } catch (err: any) {
      if (session) await session.close().catch(() => {});
      return { success: false, error: err.message };
    }
  }

  private extractPostsFromJson(
    obj: any,
    keywords: string[],
    results: ScrapedPost[],
    seenIds: Set<string>,
    groupUrl: string
  ) {
    if (!obj || typeof obj !== 'object') return;

    if (obj.message && typeof obj.message.text === 'string') {
      const text = obj.message.text;
      const lower = text.toLowerCase();
      const matched = keywords.filter((k) => lower.includes(k.toLowerCase()));

      if (matched.length > 0) {
        const id = String(obj.id || obj.post_id || Math.random());
        if (!seenIds.has(id)) {
          seenIds.add(id);
          const author = obj.actors?.[0]?.name || obj.story?.actors?.[0]?.name || 'Tác giả bài viết';
          const postUrl = obj.url || `${groupUrl}/posts/${id}`;
          results.push({
            id,
            url: postUrl,
            author,
            content: text.slice(0, 200),
            matchedKeywords: matched,
          });
        }
      }
    }

    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'object') {
        this.extractPostsFromJson(obj[k], keywords, results, seenIds, groupUrl);
      }
    }
  }
}

export const autoCommentEngine = new AutoCommentEngine();
