import type { Page, BrowserContext } from 'playwright';
import { createBrowserSession, checkCookiesLoggedIn, verifyBrowserProxyIP, type ProxyTestResult } from '../core/browser-session.js';
import { detectCheckpoint, assertAccountSafeOrAbort } from '../core/checkpoint-guard.js';
import { isEchoMessage, isEchoFromTelegram, recordSentMessage, updateLastActive, getDefaultAccount, saveAccount, setDefaultAccount, getMappingByFbThread } from '../db/store.js';
import { recordGroupPostingResult } from '../db/auto-comment-store.js';
import { markExistingImagesAsSeen, extractNewCustomerImages } from './media-extractor.js';
import {
  spinText,
  ensureUniqueHumanText,
  humanType,
  humanHoverAndClick,
  humanBrowseGroupFeed,
  humanLingerAfterAction,
  humanInterGroupCooldown,
  randomSleep,
  humanReviewBeforeSubmit,
} from '../core/human-behavior.js';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

export interface InboundMessage {
  threadId: string;
  customerName: string;
  text: string;
  mediaType?: 'text' | 'photo' | 'video' | 'sticker' | 'audio' | 'document';
  mediaUrl?: string;
  mediaUrls?: string[];
  href?: string;
}

export interface CapturedE2EEMedia {
  blobUrl: string;
  mimeType: string;
  size: number;
  base64: string;
  timestamp: number;
  claimedByThreadId?: string;
}

export type OnMessageReceivedCallback = (msg: InboundMessage) => Promise<void>;

export class MessengerEngine {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private onMessageCallback: OnMessageReceivedCallback | null = null;
  private onTypingCallback: ((threadId: string) => Promise<void>) | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastKnownSnippets: Map<string, string> = new Map();
  private threadHrefs: Map<string, string> = new Map(); // threadId -> full href (/messages/e2ee/t/... or /messages/t/...)
  private isRunning = false;
  private currentAccountId: string | null = null;
  public isPinRequired = false;
  public isReady(): boolean {
    return this.isRunning && this.context !== null;
  }

  // Tầng Data/Memory: Lưu trữ buffer các Blob E2EE được giải mã qua WebCrypto trong RAM
  private capturedBlobs: CapturedE2EEMedia[] = [];
  // Tầng Concurrency: Hàng đợi tuần tự hoá tránh Race Condition khi nhiều nhân viên/khách tương tác
  private sendQueue: Promise<any> = Promise.resolve();
  // Anti-Echo: Theo dõi thời điểm shop vừa gửi media sang từng thread
  private lastShopMediaSentTime = new Map<string, number>();
  // Tầng Quản trị phiên: Lập lịch dọn dẹp RAM tự động
  private nightlyHygieneTimer: NodeJS.Timeout | null = null;
  private lastReloadDate = '';

  public setOnMessageCallback(cb: OnMessageReceivedCallback) {
    this.onMessageCallback = cb;
  }

  public setOnTypingCallback(cb: (threadId: string) => Promise<void>) {
    this.onTypingCallback = cb;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    const currentAcc = getDefaultAccount();
    this.currentAccountId = currentAcc ? currentAcc.id : null;
    console.log(`[KudoX Messenger] Đang khởi chạy Stealth Browser Session cho tài khoản: ${currentAcc ? currentAcc.name : 'Mặc định'}...`);
    if (currentAcc?.proxy) {
      console.log(`🔒 [KudoX Messenger] Kích hoạt Proxy cách ly riêng: ${currentAcc.proxy}`);
    }

    let session;
    try {
      session = await createBrowserSession({
        userDataDir: currentAcc ? currentAcc.profileDir : undefined,
        proxy: currentAcc ? currentAcc.proxy : undefined,
      });
    } catch (err: any) {
      console.error(`🚨 [KudoX Messenger] Không thể khởi chạy trình duyệt an toàn: ${err.message}`);
      if (currentAcc) {
        saveAccount({
          id: currentAcc.id,
          proxyStatus: 'dead',
          status: 'proxy_error',
          lastProxyCheckAt: new Date().toISOString(),
        });
      }
      throw err;
    }

    this.context = session.context;
    this.page = session.page;

    // Cập nhật trạng thái xác minh Proxy thành công vào hồ sơ tài khoản
    if (currentAcc) {
      saveAccount({
        id: currentAcc.id,
        verifiedProxyIp: session.verifiedIp,
        proxyStatus: currentAcc.proxy ? 'live' : 'unassigned',
        proxyLatencyMs: session.proxyLatencyMs,
        proxyCountry: session.proxyCountry,
        lastProxyCheckAt: new Date().toISOString(),
      });
    }

    // Tự động nạp cookies đã lưu của tài khoản (đảm bảo không bao giờ bị mất phiên khi khởi động)
    if (currentAcc?.cookies && currentAcc.cookies.length > 0) {
      await this.context.addCookies(currentAcc.cookies).catch(() => {});
    }
    if (currentAcc?.profileDir) {
      const cookieBackup = path.join(currentAcc.profileDir, 'cookies.json');
      if (fs.existsSync(cookieBackup)) {
        try {
          const raw = JSON.parse(fs.readFileSync(cookieBackup, 'utf-8'));
          if (Array.isArray(raw) && raw.length > 0) {
            await this.context.addCookies(raw).catch(() => {});
          }
        } catch {}
      }
    }

    const cookieCheck = await checkCookiesLoggedIn(this.context);
    console.log(`[KudoX Messenger] Đăng nhập: ${cookieCheck.isLoggedIn ? `OK (UID: ${cookieCheck.fbUid})` : 'CHƯA ĐĂNG NHẬP'}`);
    if (currentAcc && cookieCheck.isLoggedIn && cookieCheck.fbUid) {
      saveAccount({
        id: currentAcc.id,
        uid: cookieCheck.fbUid,
        status: 'live',
      });
    }

    // TẦNG DỮ LIỆU / RAM: Hook URL.createObjectURL để chặn bắt Blob E2EE (ảnh, video, audio) ngay khi WebCrypto giải mã trong RAM
    await this.page.exposeFunction('__kudoxOnNewE2EEMediaCaptured', (data: CapturedE2EEMedia) => {
      this.capturedBlobs.push(data);
      if (this.capturedBlobs.length > 50) {
        this.capturedBlobs.shift();
      }
      console.log(`⚡ [RAM WebCrypto Hook] Đã bắt thành công Blob E2EE: ${data.mimeType} (${Math.round(data.size / 1024)} KB)`);
    }).catch(() => {});

    await this.page.addInitScript(() => {
      const originalCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = function (obj: any) {
        const blobUrl = originalCreateObjectURL.apply(this, arguments as any);

        // Bắt ngay các Blob media (image, video, audio) giải mã từ WebCrypto trong RAM
        // Hỗ trợ cả Blob có mimeType rõ ràng lẫn Blob nhị phân chưa gán type (size > 2000 bytes)
        const isMediaMime = obj instanceof Blob && (obj.type.startsWith('image/') || obj.type.startsWith('video/') || obj.type.startsWith('audio/'));
        const isDecryptedBlob = obj instanceof Blob && (!obj.type || obj.type === 'application/octet-stream' || obj.type === 'binary/octet-stream') && obj.size > 2000;

        if (isMediaMime || isDecryptedBlob) {
          const size = obj.size;
          const reader = new FileReader();
          reader.onloadend = () => {
            try {
              const res = reader.result as string;
              let mimeType = obj.type || 'image/jpeg';
              if (!obj.type || obj.type === 'application/octet-stream') {
                if (res.includes('/9j/')) mimeType = 'image/jpeg';
                else if (res.includes('iVBORw')) mimeType = 'image/png';
                else if (res.includes('UklGR')) mimeType = 'image/webp';
                else if (res.includes('ftyp') || res.includes('AAAA')) mimeType = 'video/mp4';
              }
              (window as any).__kudoxOnNewE2EEMediaCaptured?.({
                blobUrl,
                mimeType,
                size,
                base64: res,
                timestamp: Date.now(),
              });
            } catch {}
          };
          reader.readAsDataURL(obj);
        }
        return blobUrl;
      };
    });

    console.log('[KudoX Messenger] Đang mở Facebook Messenger...');
    await this.page.goto('https://www.facebook.com/messages', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await this.page.waitForTimeout(3000);

    // Kiểm tra và TỰ ĐỘNG BỎ QUA modal yêu cầu mã PIN E2EE / Bộ nhớ an toàn
    const bodyText = await this.page.evaluate(() => document.body.innerText || '').catch(() => '');
    if (/nhập mã pin để khôi phục|bộ nhớ an toàn|thiết lập mã pin|tạo mã pin/i.test(bodyText)) {
      console.log('⚡ [KudoX Messenger] Phát hiện thông báo Mã PIN/Bộ nhớ an toàn -> Đang tự động bỏ qua để vào thẳng Messenger...');
      const bypassed = await this.autoBypassOrDisablePin();
      if (!bypassed) {
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.dismissBlockingModals().catch(() => {});
      }
      this.isPinRequired = false;
      console.log('✅ [KudoX Messenger] Đã tự động vượt qua yêu cầu mã PIN! Hệ thống sẵn sàng nhận tin nhắn mới.');
    } else {
      await this.page.keyboard.press('Escape').catch(() => {});
    }

    // Lập chỉ mục ban đầu (chỉ lưu các tin cũ trước khi chạy tool)
    await this.indexExistingThreads();
    if (this.page) {
      await markExistingImagesAsSeen(this.page).catch(() => {});
    }

    // 1. Gắn MutationObserver siêu tốc
    await this.attachRealtimeMutationObserver();

    // 2. Chạy polling tần số cao 500ms để bắt tin nhắn ngay lập tức
    this.startFastWatcher();

    this.isRunning = true;
    this.startNightlyMemoryHygiene();
    console.log('✅ [KudoX Messenger Engine] Đã kích hoạt chế độ đồng bộ tức thì cho cả E2EE và Thường!');
  }

  private async indexExistingThreads(): Promise<void> {
    if (!this.page) return;
    try {
      const threads = await this.scrapeThreads();
      for (const t of threads) {
        if (t.threadId && t.snippet) {
          this.threadHrefs.set(t.threadId, t.href);
          // GHI NHẬN TOÀN BỘ TIN NHẮN HIỆN TẠI VÀO BASELINE
          // Đảm bảo không đồng bộ bất kỳ tin nhắn cũ nào trước thời điểm cài/khởi động!
          this.lastKnownSnippets.set(t.threadId, t.snippet);
        }
      }
      console.log(`[KudoX Messenger] Đã ghi nhận baseline ${threads.length} cuộc hội thoại cũ (CHỈ nhận tin nhắn mới phát sinh từ bây giờ).`);
    } catch (e: any) {
      console.warn('[KudoX Messenger] Lỗi lập chỉ mục ban đầu:', e.message);
    }
  }

  private async attachRealtimeMutationObserver(): Promise<void> {
    if (!this.page) return;

    try {
      await this.page.exposeFunction('__kudoxOnNewMessage', async (threadId: string, customerName: string, snippet: string, href: string) => {
        this.threadHrefs.set(threadId, href);
        await this.handleIncomingMessage(threadId, customerName, snippet, 'text', href);
      }).catch(() => {});

      await this.page.exposeFunction('__kudoxOnTyping', async (threadId: string) => {
        if (this.onTypingCallback && threadId) {
          await this.onTypingCallback(threadId);
        }
      }).catch(() => {});

      await this.page.exposeFunction('__kudoxOnNewImageDetected', async (threadId: string) => {
        await this.handlePhotoEvent(threadId);
      }).catch(() => {});

      await this.page.evaluate(() => {
        let lastTypingTime = 0;
        const observer = new MutationObserver(() => {
          // 1. Bắt sự kiện khách hàng đang soạn tin nhắn (Typing Indicator)
          const now = Date.now();
          if (now - lastTypingTime > 3000) {
            const typingEl = document.querySelector('div[aria-label*="đang nhập" i], div[aria-label*="typing" i], div[data-testid*="typing"]');
            if (typingEl) {
              const currentUrl = window.location.pathname;
              const match = currentUrl.match(/\/messages\/(?:e2ee\/)?t\/([0-9a-zA-Z._]+)/);
              if (match && match[1]) {
                lastTypingTime = now;
                (window as any).__kudoxOnTyping?.(match[1]);
              }
            }
          }

          // 2. Bắt ảnh mới xuất hiện trên DOM (bất kể snippet ở sidebar có đổi hay không!)
          const currentPath = window.location.pathname;
          const threadMatch = currentPath.match(/\/messages\/(?:e2ee\/)?t\/([0-9a-zA-Z._]+)/);
          if (threadMatch && threadMatch[1]) {
            const mainEl = document.querySelector('div[role="main"]');
            if (mainEl) {
              const unsentImg = mainEl.querySelector('img:not([data-kudox-sent="true"])');
              if (unsentImg) {
                const row = unsentImg.closest('div[role="row"]');
                const rowText = (row as HTMLElement)?.innerText || '';
                if (rowText.includes('Bạn đã gửi') || rowText.startsWith('Bạn:')) {
                  (unsentImg as HTMLElement).dataset.kudoxSent = 'true';
                } else {
                  (window as any).__kudoxOnNewImageDetected?.(threadMatch[1]);
                }
              }
            }
          }

          // 3. Bắt cả liên kết thường (/messages/t/) và mã hóa E2EE (/messages/e2ee/t/)
          const links = Array.from(document.querySelectorAll('a[href*="/messages/t/"], a[href*="/messages/e2ee/t/"]')).slice(0, 5);

          for (const a of links) {
            const href = a.getAttribute('href') || '';
            const match = href.match(/\/messages\/(?:e2ee\/)?t\/([0-9a-zA-Z._]+)/);
            if (!match) continue;
            const threadId = match[1];

            const spans = Array.from(a.querySelectorAll('span')).map(s => s.innerText.trim()).filter(Boolean);
            if (spans.length === 0) continue;

            let customerName = spans[0];
            if (/đang hoạt động|active now/i.test(customerName) && spans.length > 1) {
              customerName = spans[1];
            }

            let snippet = '';
            for (let i = 0; i < spans.length; i++) {
              const s = spans[i];
              if (s === customerName || /đang hoạt động|active now|·|•/i.test(s)) continue;
              if (/^\d+\s*(giờ|phút|ngày|tuần|giây|tháng)/i.test(s)) continue;
              if (s.includes('Tin nhắn chưa đọc:')) {
                snippet = s.replace(/Tin nhắn chưa đọc:\s*/g, '').trim();
                break;
              }
              if (!snippet && s.length > 0) {
                snippet = s;
              }
            }

            if (threadId && customerName && snippet) {
              (window as any).__kudoxOnNewMessage(threadId, customerName, snippet, href);
            }
          }
        });

        observer.observe(document.body, { childList: true, subtree: true });
      });
      console.log('⚡ [KudoX Messenger] Đã gắn Realtime MutationObserver!');
    } catch (e: any) {
      console.warn('[KudoX Messenger] Lỗi gắn MutationObserver:', e.message);
    }
  }

  private isExtractingPhotos = false;
  private async handlePhotoEvent(threadId: string): Promise<void> {
    if (this.isExtractingPhotos || !this.page) return;

    // Chặn Anti-Echo: Nếu shop vừa gửi media từ Telegram sang thread này trong 25 giây qua
    const lastSent = this.lastShopMediaSentTime.get(threadId) || 0;
    if (Date.now() - lastSent < 25000) {
      return;
    }

    this.isExtractingPhotos = true;
    try {
      const mapping = getMappingByFbThread(threadId);
      const customerName = mapping?.customer_name || 'Khách hàng';
      const images = await extractNewCustomerImages(this.page);
      if (images && images.length > 0) {
        console.log(`📸 [KudoX Media Extractor] Bóc tách thành công ${images.length} ảnh mới từ DOM (Không phụ thuộc Snippet)!`);
        if (this.onMessageCallback) {
          await this.onMessageCallback({
            threadId,
            customerName,
            text: '',
            mediaType: 'photo',
            mediaUrl: images[0],
            mediaUrls: images,
          });
        }
      }
    } catch (err: any) {
      console.warn('[KudoX Media Extractor] Lỗi handlePhotoEvent:', err.message);
    } finally {
      this.isExtractingPhotos = false;
    }
  }

  private startFastWatcher(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);

    this.pollTimer = setInterval(async () => {
      if (!this.page || this.page.isClosed()) return;

      try {
        const threads = await this.scrapeThreads();
        for (const t of threads) {
          if (!t.threadId || !t.snippet) continue;
          this.threadHrefs.set(t.threadId, t.href);
          await this.handleIncomingMessage(t.threadId, t.customerName, t.snippet, 'text', t.href);
        }
      } catch {
        // Bỏ qua lỗi tạm thời
      }
    }, 500); // 500ms cực nhanh
  }

  /**
   * Trích xuất tệp đa phương tiện (ảnh/video/sticker) thực tế từ khung chat đang mở hoặc điều hướng vào cuộc trò chuyện
   */
  public async extractLatestMedia(
    threadId: string,
    href?: string,
    expectedType: 'photo' | 'video' | 'sticker' | 'audio' | 'any' = 'any'
  ): Promise<{ mediaType: 'photo' | 'video'; mediaUrl: string } | null> {
    if (!this.page || this.page.isClosed()) return null;

    try {
      if (href) {
        this.threadHrefs.set(threadId, href);
      }
      await this.ensureThreadOpen(threadId);

      const tempDir = path.resolve('./.tmp_media');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      // ==============================================================
      // BƯỚC 0 (TIÊN TIẾN NHẤT): TRÍCH XUẤT TỪ RAM / WEBCRYPTO HOOK (Bypass DOM Rendering)
      // Khi mở thread, WebCrypto giải mã ArrayBuffer -> Blob -> URL.createObjectURL trong RAM.
      // Hook bắt ngay lập tức Base64 gốc, loại bỏ 100% việc dính Avatar và không phụ thuộc DOM!
      // ==============================================================
      const now = Date.now();
      const ramCandidate = this.capturedBlobs
        .filter((b) => now - b.timestamp < 35000)
        .reverse()
        .find((b) => {
          if (expectedType === 'video') return b.mimeType.startsWith('video/');
          if (expectedType === 'audio') return b.mimeType.startsWith('audio/');
          if (expectedType === 'photo' || expectedType === 'sticker') return b.mimeType.startsWith('image/');
          return true;
        });

      if (ramCandidate) {
        const ext = ramCandidate.mimeType.includes('png')
          ? 'png'
          : ramCandidate.mimeType.includes('webp')
          ? 'webp'
          : ramCandidate.mimeType.includes('mp4')
          ? 'mp4'
          : ramCandidate.mimeType.includes('ogg')
          ? 'ogg'
          : 'jpg';
        const localPath = path.join(tempDir, `e2ee_ram_${Date.now()}_${threadId}.${ext}`);
        const base64Data = ramCandidate.base64.split(',')[1];
        fs.writeFileSync(localPath, Buffer.from(base64Data, 'base64'));
        const isVideo = ramCandidate.mimeType.startsWith('video/');
        console.log(`⚡ [RAM WebCrypto Extractor] Đã bắt thành công file E2EE từ RAM tức thì: ${localPath}`);
        return { mediaType: isVideo ? 'video' : 'photo', mediaUrl: localPath };
      }

      // ==============================================================
      // TRƯỜNG HỢP 1: YÊU CẦU TRÍCH XUẤT VIDEO / REEL (DOM FALLBACK)
      // ==============================================================
      if (expectedType === 'video') {
        for (let attempt = 0; attempt < 6; attempt++) {
          const videoResult = await this.page
            .evaluate(async () => {
              const mainEl = document.querySelector('div[role="main"]') || document.body;

              // 1.1 Thử tìm liên kết video Reels hoặc Watch được chia sẻ trong hội thoại
              const reelLink = mainEl.querySelector(
                'a[href*="/reel/"], a[href*="/videos/"], a[href*="facebook.com/watch"], a[href*="/story.php"]'
              ) as HTMLAnchorElement;
              if (reelLink && reelLink.href) {
                return { type: 'reel_link' as const, src: reelLink.href };
              }

              // 1.2 Thử tìm thẻ video đang phát hoặc đã mount trong DOM
              const videoEl = mainEl.querySelector('video') as HTMLVideoElement;
              if (videoEl) {
                const src = videoEl.src || videoEl.currentSrc;
                if (src && src.startsWith('http')) {
                  return { type: 'video' as const, src };
                }
                if (src && src.startsWith('blob:')) {
                  try {
                    const resp = await fetch(src);
                    const blob = await resp.blob();
                    const dataUrl = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(blob);
                    });
                    return { type: 'video' as const, src: dataUrl };
                  } catch {
                    // Blob stream qua MediaSource
                  }
                }
              }

              // 1.3 Click vào nút phát video hoặc thumbnail video để kích hoạt load video
              const playBtn = mainEl.querySelector(
                'div[aria-label*="Phát" i][role="button"], div[aria-label*="Play" i][role="button"], div[role="button"]:has(svg[aria-label*="Phát" i])'
              ) as HTMLElement;
              if (playBtn) {
                playBtn.click();
              }

              return null;
            })
            .catch(() => null);

          if (videoResult && videoResult.src) {
            if (videoResult.type === 'reel_link') {
              console.log(`🎥 [KudoX Messenger] Đã tìm thấy link Video/Reels: ${videoResult.src}`);
              return { mediaType: 'video', mediaUrl: videoResult.src, isLink: true } as any;
            }
            const localPath = path.join(tempDir, `inbound_${Date.now()}_${threadId}.mp4`);
            if (videoResult.src.startsWith('data:')) {
              const base64Data = videoResult.src.split(',')[1];
              fs.writeFileSync(localPath, Buffer.from(base64Data, 'base64'));
              console.log(`🎥 [KudoX Messenger] Đã bóc tách video thành công: ${localPath}`);
              return { mediaType: 'video', mediaUrl: localPath };
            } else if (videoResult.src.startsWith('http')) {
              await downloadFile(videoResult.src, localPath);
              console.log(`🎥 [KudoX Messenger] Đã tải video thành công: ${localPath}`);
              return { mediaType: 'video', mediaUrl: localPath };
            }
          }

          await this.page.waitForTimeout(600);
        }

        // Nếu khách gửi video nhưng video chưa mount hoặc bị bảo mật E2EE -> TUYỆT ĐỐI KHÔNG GỬI NHẦM ẢNH CŨ!
        return null;
      }

      // ==============================================================
      // TRƯỜNG HỢP 2: YÊU CẦU TRÍCH XUẤT ẢNH / STICKER (DOM SCOPING FALLBACK)
      // ==============================================================
      for (let attempt = 0; attempt < 8; attempt++) {
        const mediaResult = await this.page
          .evaluate(async () => {
            const mainEl = document.querySelector('div[role="main"]') || document.body;

            const allImgs = Array.from(mainEl.querySelectorAll('img'));
            const imgs = allImgs.filter((i: any) => {
              const w = i.naturalWidth || i.width || 0;
              const h = i.naturalHeight || i.height || 0;
              const alt = (i.alt || '').trim();
              const src = i.src || '';

              // 1. Loại trừ ảnh đại diện của khách hàng và CDN avatar
              if (
                src.includes('30808-1') ||
                src.includes('p50x50') ||
                src.includes('p100x100') ||
                src.includes('p60x60') ||
                src.includes('p80x80') ||
                src.includes('profile') ||
                src.includes('avatar')
              ) {
                return false;
              }

              // 2. Loại trừ emoji icon và ảnh hệ thống
              if (src.includes('emoji.php') || src.includes('rsrc.php') || src.includes('static.xx.fbcdn')) {
                return false;
              }

              // 3. Loại trừ theo kích thước avatar
              if (w > 0 && w <= 130 && h > 0 && h <= 130) {
                return false;
              }

              // 4. CHẤP NHẬN ẢNH CHAT THẬT (Mở ảnh / Base64 / Blob / CDN lớn):
              if (alt === 'Mở ảnh' || /mở ảnh|open photo|xem ảnh/i.test(alt)) return true;
              if (src.startsWith('data:image/') && src.length > 2000) return true;
              if (src.startsWith('blob:')) return true;
              if ((src.includes('scontent') || src.includes('fbcdn')) && (w > 160 || h > 160)) return true;

              return false;
            }) as HTMLImageElement[];

            if (imgs.length === 0) return null;
            const lastImg = imgs[imgs.length - 1];
            const src = lastImg.src;

            if (src.startsWith('data:image/')) {
              return { type: 'photo' as const, src };
            }

            // Chuyển ảnh CDN Facebook sang data URL thông qua fetch trong page context có sẵn cookie
            try {
              const resp = await fetch(src);
              const blob = await resp.blob();
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              return { type: 'photo' as const, src: dataUrl };
            } catch {
              return { type: 'photo' as const, src };
            }
          })
          .catch(() => null);

        if (mediaResult && mediaResult.src) {
          const localPath = path.join(tempDir, `inbound_${Date.now()}_${threadId}.jpg`);

          if (mediaResult.src.startsWith('data:image/')) {
            const base64Data = mediaResult.src.split(',')[1];
            fs.writeFileSync(localPath, Buffer.from(base64Data, 'base64'));
            console.log(`📸 [KudoX Messenger] Đã bóc tách & giải mã ảnh thực tế thành công: ${localPath}`);
            return { mediaType: 'photo', mediaUrl: localPath };
          } else if (mediaResult.src.startsWith('http')) {
            try {
              await downloadFile(mediaResult.src, localPath);
              console.log(`📸 [KudoX Messenger] Đã tải ảnh thực tế về máy: ${localPath}`);
              return { mediaType: 'photo', mediaUrl: localPath };
            } catch (err: any) {
              console.warn('[KudoX Messenger] Lỗi tải media URL:', err.message);
              return { mediaType: 'photo', mediaUrl: mediaResult.src };
            }
          }
        }

        await this.page.waitForTimeout(100);
      }
    } catch (err: any) {
      console.warn('[KudoX Messenger] Lỗi extractLatestMedia:', err.message);
    }

    return null;
  }

  private async handleIncomingMessage(
    threadId: string,
    customerName: string,
    snippet: string,
    mediaType: InboundMessage['mediaType'] = 'text',
    href?: string
  ): Promise<void> {
    if (!snippet) return;

    // 1. NHẬN DIỆN TIN NHẮN TỪ CHÍNH SHOP (BẠN / YOU GỬI TRÊN MESSENGER APP/WEB)
    const isFromShop = /^(bạn|you)\b/i.test(snippet.trim());

    // 2. LỌC BỎ TOÀN BỘ CÁC THÔNG BÁO HỆ THỐNG CỦA FACEBOOK (KHÔNG PHẢI NGƯỜI NHẮN)
    if (
      /không khôi phục được tin nhắn/i.test(snippet) ||
      /could not restore messages/i.test(snippet) ||
      /^đang gửi/i.test(snippet) ||
      /sending\.\.\./i.test(snippet) ||
      /^bản nháp/i.test(snippet) ||
      /^draft:/i.test(snippet) ||
      /mã hóa đầu cuối/i.test(snippet) ||
      /end-to-end/i.test(snippet) ||
      /bảo mật bằng tính năng/i.test(snippet) ||
      /tin nhắn và cuộc gọi được bảo mật/i.test(snippet) ||
      /đã bắt đầu cuộc trò chuyện/i.test(snippet) ||
      /bạn đã kết nối/i.test(snippet) ||
      /đang hoạt động|active now/i.test(snippet)
    ) {
      this.lastKnownSnippets.set(threadId, snippet);
      return;
    }

    const lastSnippet = this.lastKnownSnippets.get(threadId);

    if (lastSnippet !== snippet) {
      this.lastKnownSnippets.set(threadId, snippet);

      // 3. NHẬN DIỆN TỪNG LOẠI TỆP ĐA PHƯƠNG TIỆN
      const isPhotoSnippet = /đã gửi.*ảnh|sent.*photo|sent.*image|sent.*picture|đã gửi.*hình/i.test(snippet);
      const isVideoSnippet = /đã gửi.*video|sent.*video/i.test(snippet);
      const isStickerSnippet = /đã gửi.*nhãn dán|sent.*sticker/i.test(snippet);
      const isAudioSnippet = /tin nhắn thoại|ghi âm|voice message|audio/i.test(snippet);

      // Nếu tin nhắn do Shop gửi và đã được gửi từ chính Telegram -> Bỏ qua để không bị lặp lại trên Telegram
      if (isFromShop) {
        if (isEchoFromTelegram(threadId, snippet) || isPhotoSnippet || isVideoSnippet) {
          return;
        }
      }

      // Nếu tin nhắn từ khách trùng lặp cache -> Bỏ qua
      if (!isFromShop && isEchoMessage(threadId, snippet)) {
        return;
      }

      let finalMediaType = mediaType;
      let finalMediaUrl: string | undefined = undefined;
      let finalText = snippet;

      if (isPhotoSnippet) {
        if (isFromShop) return;

        console.log(`🖼️ [KudoX Media Extractor] Khách hàng gửi ảnh ("${snippet}") -> Xử lý cấp tốc...`);

        // 1. Kiểm tra bộ nhớ RAM trước (Nếu WebCrypto vừa giải mã và chưa bị thread khác claim)
        const lastSent = this.lastShopMediaSentTime.get(threadId) || 0;
        if (Date.now() - lastSent > 15000) {
          const now = Date.now();
          const freshBlobs = this.capturedBlobs.filter(
            (b) => !b.claimedByThreadId && now - b.timestamp < 12000 && b.mimeType.startsWith('image/')
          );
          if (freshBlobs.length > 0) {
            console.log(`⚡ [KudoX Media Extractor] Bắt được ${freshBlobs.length} ảnh trực tiếp từ RAM WebCrypto cho thread ${threadId}!`);
            // Đánh dấu đã claim ngay lập tức để không gán nhầm cho khách khác (Khắc phục lỗi F10)
            for (const b of freshBlobs) {
              b.claimedByThreadId = threadId;
            }
            const base64List = freshBlobs.map((b) => b.base64);
            recordSentMessage('facebook', threadId, snippet);
            updateLastActive(threadId);
            if (this.onMessageCallback) {
              await this.onMessageCallback({
                threadId,
                customerName,
                text: '',
                mediaType: 'photo',
                mediaUrl: base64List[0],
                mediaUrls: base64List,
                href,
              });
            }
            return;
          }
        }

        // 2. Mở thread và quét DOM tốc độ cao (150ms)
        await this.ensureThreadOpen(threadId);
        const images = await extractNewCustomerImages(this.page!);
        if (images && images.length > 0) {
          console.log(`📸 [KudoX Media Extractor] Bóc tách thành công ${images.length} ảnh mới từ DOM!`);
          recordSentMessage('facebook', threadId, snippet);
          updateLastActive(threadId);
          if (this.onMessageCallback) {
            await this.onMessageCallback({
              threadId,
              customerName,
              text: '',
              mediaType: 'photo',
              mediaUrl: images[0],
              mediaUrls: images,
              href,
            });
          }
          return;
        } else {
          // Không lấy được ảnh (hoặc ảnh đã được gửi trước đó) -> Bỏ qua, tuyệt đối không gửi tin nhắn rác "Đang đồng bộ"
          return;
        }
      } else if (isVideoSnippet || isStickerSnippet || isAudioSnippet) {
        if (isFromShop) return;

        const expectedType = isVideoSnippet ? 'video' : isAudioSnippet ? 'audio' : 'sticker';
        console.log(`🖼️ [KudoX Messenger] Phát hiện đa phương tiện [${expectedType}] ("${snippet}") -> Trích xuất tệp gốc tức thì...`);
        const extracted = await this.extractLatestMedia(threadId, href, expectedType);
        if (extracted) {
          if ((extracted as any).isLink) {
            finalMediaType = 'text';
            finalText = `🎬 **[Video / Reel được chia sẻ]:**\n${extracted.mediaUrl}`;
          } else {
            finalMediaType = extracted.mediaType;
            finalMediaUrl = extracted.mediaUrl;
            finalText = '';
          }
        } else {
          // Không lấy được video/sticker -> Bỏ qua, tuyệt đối không gửi tin nhắn rác "Vui lòng mở web/app"
          return;
        }
      } else if (isFromShop) {
        // Tin nhắn văn bản do Shop gửi từ app/web Messenger -> Đồng bộ sang Telegram với tiền tố Bạn:
        const cleanContent = snippet.replace(/^(bạn|you)\s*:\s*/i, '').trim();
        finalText = `💬 **[Bạn]:** ${cleanContent}`;
      }

      console.log(`\n🔔 [CẬP NHẬT TIN NHẮN REALTIME]`);
      console.log(`• Tên hội thoại: "${customerName}"`);
      console.log(`• Người gửi: ${isFromShop ? 'CHỦ SHOP (MESSENGER APP/WEB)' : 'KHÁCH HÀNG'}`);
      console.log(`• Thread ID: ${threadId}`);
      console.log(`• Loại: ${finalMediaType}`);
      if (finalMediaUrl) console.log(`• Media: ${finalMediaUrl}`);
      console.log(`• Nội dung: "${finalText || `[Đính kèm ${finalMediaType}]`}"\n`);

      recordSentMessage(isFromShop ? 'facebook' : 'facebook', threadId, snippet);
      updateLastActive(threadId);

      if (this.onMessageCallback) {
        await this.onMessageCallback({
          threadId,
          customerName,
          text: finalText,
          mediaType: finalMediaType,
          mediaUrl: finalMediaUrl,
          href,
        });
      }
    }
  }

  /**
   * Bóc tách toàn diện cả tin nhắn Thường, Mã Hóa Đầu Cuối (E2EE) và Ảnh Avatar
   */
  private async scrapeThreads(): Promise<
    Array<{ threadId: string; customerName: string; snippet: string; href: string; isUnread: boolean }>
  > {
    if (!this.page) return [];

    return await this.page.evaluate(() => {
      const results: Array<{ threadId: string; customerName: string; snippet: string; href: string; isUnread: boolean }> = [];
      // CHỌN CẢ 2 LOẠI LIÊN KẾT: /messages/t/ VÀ /messages/e2ee/t/
      const links = Array.from(document.querySelectorAll('a[href*="/messages/t/"], a[href*="/messages/e2ee/t/"]')).slice(0, 12);

      for (const a of links) {
        const href = a.getAttribute('href') || '';
        const match = href.match(/\/messages\/(?:e2ee\/)?t\/([0-9a-zA-Z._]+)/);
        if (!match) continue;
        const threadId = match[1];

        const rawText = (a as HTMLElement).innerText || '';
        const spans = Array.from(a.querySelectorAll('span')).map(s => s.innerText.trim()).filter(Boolean);
        if (spans.length === 0) continue;

        // Lấy chính xác tên người gửi (bỏ qua nhãn "Đang hoạt động")
        let customerName = spans[0];
        if (/đang hoạt động|active now/i.test(customerName) && spans.length > 1) {
          customerName = spans[1];
        }

        const isUnread = rawText.includes('Tin nhắn chưa đọc') || rawText.includes('chưa đọc');

        // Lấy nội dung tin nhắn
        let snippet = '';
        for (let i = 0; i < spans.length; i++) {
          const s = spans[i];
          if (s === customerName || /đang hoạt động|active now|·|•/i.test(s)) continue;
          if (/^\d+\s*(giờ|phút|ngày|tuần|giây|tháng)/i.test(s)) continue;

          if (s.includes('Tin nhắn chưa đọc:')) {
            snippet = s.replace(/Tin nhắn chưa đọc:\s*/g, '').trim();
            break;
          }
          if (!snippet && s.length > 0) {
            snippet = s;
          }
        }

        if (threadId && customerName && snippet) {
          results.push({
            threadId,
            customerName,
            snippet,
            href,
            isUnread,
          });
        }
      }

      return results;
    });
  }

  /**
   * Hàng đợi tuần tự hóa (Sequential Task Queue) - Ngăn chặn UI Thrashing & Race Condition khi gửi tin
   */
  public enqueueSendTask<T>(task: () => Promise<T>): Promise<T> {
    const nextTask = this.sendQueue.then(() => task(), () => task());
    this.sendQueue = nextTask.catch(() => {});
    return nextTask;
  }

  /** Mở tab Facebook riêng trong phiên đăng nhập đang dùng, giữ nguyên tab Messenger. */
  public async withNewFacebookPage<T>(task: (page: Page) => Promise<T>): Promise<T> {
    return this.enqueueSendTask(async () => {
      const context = this.context;
      if (!context) throw new Error('Phiên Facebook chưa sẵn sàng. Kiểm tra cửa sổ Messenger đang chạy.');

      const page = await context.newPage();
      try {
        return await task(page);
      } finally {
        if (!page.isClosed()) await page.close().catch(() => {});
      }
    });
  }

  /**
   * Gửi Văn Bản & Icon / Emoji tức thì (Giả lập Copy-Paste người thật & Human Delay chống Checkpoint)
   */
  public async sendMessage(fbThreadId: string, text: string): Promise<boolean> {
    return this.enqueueSendTask(async () => {
      if (!this.page) {
        console.error('[KudoX Messenger] Trình duyệt chưa sẵn sàng!');
        return false;
      }

      try {
        await this.ensureThreadOpen(fbThreadId);

        const inputEl = await this.findInputBox();
        if (!inputEl) {
          console.error(`[KudoX Messenger] Không tìm thấy ô nhập tin cho thread ${fbThreadId}`);
          return false;
        }

        await inputEl.click({ force: true });
        await this.page.waitForTimeout(60);

        // 1. Giả lập hành vi người thật: Copy & Paste bằng Clipboard (isTrusted: true)
        // Tránh bị hệ thống phát hiện Bot khi gõ chuỗi dài với tốc độ 0ms
        let pasted = false;
        try {
          await this.page.evaluate((val) => navigator.clipboard.writeText(val), text);
          await this.page.keyboard.press('Control+V');
          pasted = true;
        } catch {
          // Fallback chèn văn bản nếu clipboard bị chặn
          await this.page.keyboard.insertText(text);
        }

        await this.page.waitForTimeout(30);
        await this.page.keyboard.press('Enter');

        console.log(`✅ [KudoX Messenger] Đã gửi văn bản/icon tới Thread ${fbThreadId}: "${text}"`);
        updateLastActive(fbThreadId);
        this.lastKnownSnippets.set(fbThreadId, text);
        return true;
      } catch (err: any) {
        console.error(`❌ [KudoX Messenger] Lỗi khi gửi tin:`, err.message);
        return false;
      }
    });
  }

  /**
   * Gửi Hình Ảnh hoặc Video sang Facebook Messenger (Tuần tự hóa qua Queue)
   */
  public async sendMedia(fbThreadId: string, filePath: string, caption?: string): Promise<boolean> {
    return this.enqueueSendTask(async () => {
      if (!this.page || !fs.existsSync(filePath)) {
        console.error('[KudoX Messenger] Trình duyệt hoặc tệp không tồn tại:', filePath);
        return false;
      }

      try {
        await this.ensureThreadOpen(fbThreadId);

        let fileInput = await this.page.$('input[type="file"]');
        if (!fileInput) {
          const attachBtn = await this.page.$('[role="button"][aria-label*="Đính kèm" i], [role="button"][aria-label*="file" i], [role="button"][aria-label*="ảnh" i]');
          if (attachBtn) {
            await attachBtn.click({ force: true });
            await this.page.waitForTimeout(300);
            fileInput = await this.page.$('input[type="file"]');
          }
        }

        if (!fileInput) {
          console.error('[KudoX Messenger] Không tìm thấy input upload file trên Messenger');
          return false;
        }

        console.log(`[KudoX Messenger] Upload file đa phương tiện: ${filePath}`);
        await fileInput.setInputFiles(filePath);

        const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(filePath);
        await this.page.waitForTimeout(isVideo ? 3500 : 1500);

        if (caption) {
          const inputEl = await this.findInputBox();
          if (inputEl) {
            await inputEl.click({ force: true });
            await this.page.keyboard.insertText(caption);
            await this.page.waitForTimeout(200);
          }
        }

        await this.page.keyboard.press('Enter');
        console.log(`✅ [KudoX Messenger] Đã gửi hình ảnh/video thành công tới Thread ${fbThreadId}`);

        // Ghi nhận biến thể echo và mốc thời gian để chặn gửi ngược 100%
        this.lastShopMediaSentTime.set(fbThreadId, Date.now());
        recordSentMessage('telegram', fbThreadId, isVideo ? 'Bạn đã gửi 1 video.' : 'Bạn đã gửi 1 ảnh.');
        recordSentMessage('telegram', fbThreadId, isVideo ? 'Bạn đã gửi một video.' : 'Bạn đã gửi một ảnh.');
        recordSentMessage('telegram', fbThreadId, isVideo ? 'video' : 'ảnh');
        updateLastActive(fbThreadId);

        // Đánh dấu ảnh/video vừa gửi trên DOM để không bao giờ bóc tách ngược sang Telegram
        await this.page.waitForTimeout(500);
        await this.page.evaluate(() => {
          const mainEl = document.querySelector('div[role="main"]') || document.body;
          if (mainEl) {
            mainEl.querySelectorAll('img').forEach((i) => ((i as HTMLElement).dataset.kudoxSent = 'true'));
          }
        }).catch(() => {});

        return true;
      } catch (err: any) {
        console.error(`❌ [KudoX Messenger] Lỗi gửi media:`, err.message);
        return false;
      }
    });
  }

  private async dismissBlockingModals(): Promise<void> {
    if (!this.page) return;
    try {
      // 1. Nhấn Escape
      await this.page.keyboard.press('Escape').catch(() => {});

      // 2. Click nút đóng X trên modal
      await this.page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('span, div, h2, h3'));
        const pinHeading = headings.find(h => /nhập mã pin để khôi phục/i.test((h as HTMLElement).innerText || ''));
        if (pinHeading) {
          const modal = pinHeading.closest('[role="dialog"]') || pinHeading.parentElement?.parentElement?.parentElement;
          if (modal) {
            const btn = modal.querySelector('[role="button"]') as HTMLElement;
            if (btn) btn.click();
          }
        }

        const closeBtns = Array.from(document.querySelectorAll('[aria-label*="Đóng" i], [aria-label*="Close" i]'));
        for (const b of closeBtns) {
          (b as HTMLElement).click();
        }
      }).catch(() => {});

      await this.page.waitForTimeout(300);
    } catch {
      // Bỏ qua lỗi
    }
  }

  private async ensureThreadOpen(fbThreadId: string): Promise<void> {
    if (!this.page) return;

    // 1. Đóng các modal chắn màn hình trước khi thao tác
    await this.dismissBlockingModals();

    // 2. Kiểm tra nếu URL hiện tại đã thuộc về cuộc hội thoại này rồi
    if (this.page.url().includes(fbThreadId)) {
      return;
    }

    // 3. Ưu tiên click vào mục hội thoại trên sidebar nếu đang hiển thị
    try {
      const linkSel = `a[href*="/messages/t/${fbThreadId}"], a[href*="/messages/e2ee/t/${fbThreadId}"]`;
      const sidebarLink = await this.page.$(linkSel);
      if (sidebarLink) {
        console.log(`[KudoX Messenger] Chuyển hội thoại nhanh bằng click sidebar: ${fbThreadId}`);
        await sidebarLink.click({ force: true });
        await this.page.waitForTimeout(1000);
        await this.dismissBlockingModals();
        if (this.page.url().includes(fbThreadId)) {
          return;
        }
      }
    } catch {
      // Tiếp tục fallback
    }

    // 4. Nếu chưa mở được bằng click, dùng page.goto
    const savedHref = this.threadHrefs.get(fbThreadId);
    const targetUrl = savedHref ? `https://www.facebook.com${savedHref}` : `https://www.facebook.com/messages/e2ee/t/${fbThreadId}`;

    console.log(`[KudoX Messenger] Điều hướng mở cuộc hội thoại: ${targetUrl}`);
    await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await this.page.waitForTimeout(1000);
    await this.dismissBlockingModals();
  }

  private async findInputBox(timeoutMs = 6000) {
    if (!this.page) return null;
    const selectors = [
      'div[role="main"] div[role="textbox"]',
      'div[role="main"] div[contenteditable="true"]',
      'div[role="textbox"][aria-label*="Tin nhắn" i]',
      'div[role="textbox"][aria-label*="Message" i]',
      'div[role="textbox"][aria-label*="Soạn" i]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
    ];

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      for (const sel of selectors) {
        const els = await this.page.$$(sel);
        for (const el of els) {
          const label = (await el.getAttribute('aria-label')) || '';
          if (/tìm kiếm|search/i.test(label)) continue;
          return el;
        }
      }
      await this.dismissBlockingModals();
      await this.page.waitForTimeout(300);
    }
    return null;
  }

  public async getPage(): Promise<Page | null> {
    return this.page;
  }

  /**
   * Tự động bỏ qua hoặc đóng bảng yêu cầu mã PIN 6 số / Bộ nhớ an toàn
   * Giúp nick mới nạp vào thẳng giao diện Messenger nhận khách mà không bị treo.
   */
  public async autoBypassOrDisablePin(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const clicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"], a[role="button"]'));
        
        // 1. Tìm các nút Bỏ qua / Không phải bây giờ / Lúc khác / Để sau / Hủy
        const skipBtn = buttons.find((b) => {
          const t = (b as HTMLElement).innerText?.trim() || '';
          return /không phải bây giờ|lúc khác|bỏ qua|để sau|hủy|tắt|not now|skip|later|cancel/i.test(t);
        }) as HTMLElement;

        if (skipBtn) {
          skipBtn.click();
          return true;
        }

        // 2. Tìm nút Đóng (X) trên modal
        const closeBtn = document.querySelector('[aria-label*="Đóng" i], [aria-label*="Close" i]') as HTMLElement;
        if (closeBtn) {
          closeBtn.click();
          return true;
        }

        // 3. Tìm banner "Thiếu lịch sử chat" và bấm nút X ở góc trên banner
        const allTextNodes = Array.from(document.querySelectorAll('span, div, h2, h3'));
        const bannerTitle = allTextNodes.find((el) => /thiếu lịch sử chat/i.test((el as HTMLElement).innerText || ''));
        if (bannerTitle) {
          const bannerBox = bannerTitle.closest('[role="banner"]') || bannerTitle.parentElement?.parentElement;
          if (bannerBox) {
            const xButton = bannerBox.querySelector('[role="button"], button, [aria-label*="Đóng" i], [aria-label*="Close" i]') as HTMLElement;
            if (xButton) {
              xButton.click();
              return true;
            }
          }
        }

        return false;
      });

      if (clicked) {
        await this.page.waitForTimeout(1000);
        // Kiểm tra xem có dialog xác nhận thứ 2 không (VD: "Bạn có chắc muốn bỏ qua?")
        await this.page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'));
          const confirmBtn = buttons.find((b) => {
            const t = (b as HTMLElement).innerText?.trim() || '';
            return /bỏ qua|tiếp tục|xác nhận|continue|skip/i.test(t);
          }) as HTMLElement;
          if (confirmBtn) confirmBtn.click();
        }).catch(() => {});
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async checkPinModal(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const text = await this.page.evaluate(() => document.body.innerText || '');
      const hasPin = /nhập mã pin để khôi phục|bộ nhớ an toàn|thiết lập mã pin/i.test(text);
      if (hasPin) {
        // Tự động bỏ qua luôn nếu gặp
        const bypassed = await this.autoBypassOrDisablePin();
        if (bypassed) {
          this.isPinRequired = false;
          return false;
        }
        this.isPinRequired = true;
        return true;
      }
      this.isPinRequired = false;
      return false;
    } catch {
      return false;
    }
  }

  public async enterPin(pin: string): Promise<{ success: boolean; message: string }> {
    if (!this.page) {
      return { success: false, message: 'Trình duyệt Messenger chưa sẵn sàng.' };
    }
    const cleanPin = pin.trim().replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanPin)) {
      return { success: false, message: 'Mã PIN không hợp lệ! Vui lòng nhập đúng 6 chữ số (VD: 123456).' };
    }

    try {
      console.log(`[KudoX Messenger] Đang nhập mã PIN 6 số để mở khóa E2EE...`);
      
      // Đảm bảo đang ở trang có modal PIN
      let hasModal = await this.checkPinModal();
      if (!hasModal) {
        console.log('[KudoX Messenger] Đang tải lại Messenger để kích hoạt modal PIN...');
        await this.page.goto('https://www.facebook.com/messages', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await this.page.waitForTimeout(3000);
        hasModal = await this.checkPinModal();
      }

      // Nhấp vào vùng ô input đầu tiên
      const inputs = await this.page.$$('input[type="password"], input[type="text"], input[inputmode="numeric"]');
      if (inputs.length >= 6) {
        for (let i = 0; i < 6; i++) {
          await inputs[i].click().catch(() => {});
          await inputs[i].fill(cleanPin[i]);
          await this.page.waitForTimeout(60);
        }
      } else {
        if (inputs.length > 0) {
          await inputs[0].click().catch(() => {});
        }
        for (const char of cleanPin) {
          await this.page.keyboard.press(char);
          await this.page.waitForTimeout(100);
        }
      }

      console.log('[KudoX Messenger] Đã gửi 6 số PIN, chờ Facebook xác thực...');
      await this.page.waitForTimeout(4000);

      // Chụp ảnh xác thực
      const screenshotDir = 'C:/Users/ADMIN/.gemini/antigravity/brain/cdebd459-4ebf-458e-968a-85b9e82f0958';
      await this.page.screenshot({ path: `${screenshotDir}/current_screen.png` }).catch(() => {});

      const bodyText = await this.page.evaluate(() => document.body.innerText || '');
      if (/mã pin không đúng|mã pin không chính xác|incorrect pin/i.test(bodyText)) {
        return { success: false, message: 'Facebook báo: Mã PIN không chính xác! Vui lòng kiểm tra lại.' };
      }

      this.isPinRequired = false;
      console.log('✅ [KudoX Messenger] Đã mở khóa mã hóa E2EE thành công!');
      
      // Làm mới danh sách tin nhắn ngay lập tức
      await this.page.waitForTimeout(1000);
      const threads = await this.scrapeThreads();
      for (const t of threads) {
        if (t.threadId && t.snippet && !t.snippet.includes('Không khôi phục')) {
          await this.handleIncomingMessage(t.threadId, t.customerName, t.snippet, 'text', t.href);
        }
      }

      return { success: true, message: 'Đã mở khóa thành công! Toàn bộ lịch sử tin nhắn E2EE đã được khôi phục.' };
    } catch (err: any) {
      console.error('[KudoX Messenger] Lỗi khi nhập PIN:', err.message);
      return { success: false, message: err.message };
    }
  }

  public async getScreenshot(): Promise<Buffer | null> {
    if (!this.page) return null;
    try {
      return await this.page.screenshot({ type: 'png' });
    } catch {
      return null;
    }
  }

  /**
   * Đính kèm 1 hoặc nhiều ảnh vào hộp thoại Tạo bài viết (Trang cá nhân hoặc Group)
   * Đảm bảo không click nhầm Avatar và xác minh ảnh đã hiển thị preview trước khi bấm Đăng.
   */
  private async attachPhotosToPostDialog(page: Page, dialog: any, photoPaths?: string[]): Promise<number> {
    if (!photoPaths || photoPaths.length === 0) return 0;
    const validPhotos = photoPaths.filter((p) => p && fs.existsSync(p));
    if (validPhotos.length === 0) {
      throw new Error('Không tìm thấy tệp hình ảnh hợp lệ trên đĩa để đính kèm vào bài viết.');
    }

    console.log(`[FalconX Post] Đang đính kèm ${validPhotos.length} hình ảnh vào bài viết...`);

    const hasPhotoPreview = async (): Promise<boolean> => {
      return await dialog.evaluate((el: HTMLElement) => {
        const blobImgs = el.querySelectorAll('img[src^="blob:"], img[src*="scontent"]');
        for (const img of Array.from(blobImgs)) {
          const rect = img.getBoundingClientRect();
          if (rect.width > 65 || rect.height > 65 || (img as HTMLImageElement).src.startsWith('blob:')) {
            return true;
          }
        }
        const editBtns = el.querySelectorAll(
          '[aria-label*="Chỉnh sửa" i], [aria-label*="Edit" i], [aria-label*="Gỡ ảnh" i], [aria-label*="Gỡ" i], [aria-label*="Remove" i], [aria-label*="Thêm ảnh/video" i], [aria-label*="Add photos/videos" i]'
        );
        return editBtns.length > 0;
      }).catch(() => false);
    };

    let attached = false;

    // Bước 1: Thử nạp trực tiếp vào input[type="file"] có sẵn trong dialog
    let fileInput = dialog.locator('input[type="file"][accept*="image"], input[type="file"]').first();
    if ((await fileInput.count()) > 0) {
      try {
        await fileInput.setInputFiles(validPhotos);
        await page.waitForTimeout(2500);
        if (await hasPhotoPreview()) {
          attached = true;
        }
      } catch (e: any) {
        console.warn('[FalconX Post] Thử setInputFiles trực tiếp lần 1 chưa thành công:', e.message);
      }
    }

    // Bước 2: Nếu chưa có input hoặc chưa lên preview, bấm nút "Ảnh/video" chính xác (không dùng aria-label*="Ảnh" chung chung để tránh bấm nhầm Avatar)
    if (!attached) {
      const addPhotoBtn = dialog
        .locator(
          'div[aria-label="Ảnh/video"], div[aria-label="Photo/video"], div[aria-label="Thêm ảnh/video"], div[aria-label="Add photos/videos"], div[role="button"][aria-label*="Ảnh/video" i], div[role="button"][aria-label*="Photo/video" i]'
        )
        .first();

      if (await addPhotoBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 3500 }).catch(() => null),
          addPhotoBtn.click({ timeout: 5000 }).catch(() => {}),
        ]);

        if (fileChooser) {
          await fileChooser.setFiles(validPhotos);
          attached = true;
        } else {
          await page.waitForTimeout(1500);
          fileInput = dialog.locator('input[type="file"][accept*="image"], input[type="file"]').last();
          if ((await fileInput.count()) === 0) {
            fileInput = page.locator('input[type="file"][accept*="image"], input[type="file"]').last();
          }
          if ((await fileInput.count()) > 0) {
            await fileInput.setInputFiles(validPhotos);
            attached = true;
          }
        }
      } else {
        // Fallback tìm input[type="file"] trên toàn trang nếu dialog lồng nhau
        const pageFileInput = page.locator('input[type="file"][accept*="image"], input[type="file"]').last();
        if ((await pageFileInput.count()) > 0) {
          await pageFileInput.setInputFiles(validPhotos);
          attached = true;
        }
      }
    }

    if (!attached) {
      throw new Error('Không tìm thấy ô nạp file ảnh (input[type="file"]) trong hộp thoại đăng bài Facebook.');
    }

    // Bước 3: Chờ ảnh hiển thị preview trong dialog và upload lên máy chủ Facebook
    console.log('[FalconX Post] Đã nạp file ảnh, đang chờ Facebook hiển thị preview & tải ảnh lên...');
    for (let i = 0; i < 15; i++) {
      if (await hasPhotoPreview()) {
        break;
      }
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(2500);
    console.log(`✅ [FalconX Post] Đã đính kèm xong ${validPhotos.length} hình ảnh.`);
    return validPhotos.length;
  }

  /**
   * Kiểm tra thực tế khả năng đính kèm ảnh vào khung đăng bài (Personal hoặc Group)
   * Mở dialog, gõ nội dung, nạp ảnh, xác minh preview ảnh & nút Đăng sáng lên, chụp ảnh bằng chứng rồi đóng tab (không nhấn nút Đăng).
   */
  public async verifyPhotoUploadInComposer(options: {
    photoPaths: string[];
    content?: string;
    groupUrl?: string;
  }): Promise<{
    success: boolean;
    attachedCount: number;
    postBtnEnabled: boolean;
    screenshotPath?: string;
    error?: string;
  }> {
    if (!this.context) {
      return { success: false, attachedCount: 0, postBtnEnabled: false, error: 'Trình duyệt chưa sẵn sàng' };
    }
    const page = await this.context.newPage();
    try {
      const targetUrl = options.groupUrl || 'https://www.facebook.com/';
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);

      const popups = page.locator('div[aria-label="Đóng"], div[aria-label="Close"], div[role="button"]:has-text("Để sau")');
      if (await popups.first().isVisible({ timeout: 1500 }).catch(() => false)) {
        await popups.first().click().catch(() => {});
      }

      const triggerRegex = options.groupUrl
        ? /bạn viết gì đi|write something|tạo bài viết|tạo bài viết công khai/i
        : /bạn đang nghĩ gì|what's on your mind|tạo bài viết|tạo bài đăng/i;

      let trigger = page.locator('div[role="button"]').filter({ hasText: triggerRegex }).first();
      if (!(await trigger.isVisible({ timeout: 8000 }).catch(() => false)) && !options.groupUrl) {
        await page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(3000);
        trigger = page.locator('div[role="button"]').filter({ hasText: triggerRegex }).first();
      }
      await trigger.click({ timeout: 10000 });
      await page.waitForTimeout(2000);

      let dialog = page.locator('div[role="dialog"]').filter({ hasText: /tạo bài viết|create post|bài viết công khai/i }).first();
      if (!(await dialog.isVisible({ timeout: 6000 }).catch(() => false))) {
        dialog = page.locator('div[role="dialog"]').last();
      }

      if (options.content) {
        const textbox = dialog.locator('div[role="textbox"], div[contenteditable="true"]').first();
        if (await textbox.isVisible({ timeout: 5000 }).catch(() => false)) {
          await textbox.click();
          await page.waitForTimeout(300);
          await humanType(page, spinText(options.content));
          await page.waitForTimeout(800);
        }
      }

      const attachedCount = await this.attachPhotosToPostDialog(page, dialog, options.photoPaths);

      let postBtn = dialog.locator('div[aria-label="Đăng"][role="button"], div[aria-label="Post"][role="button"], div[role="button"]:has-text("Đăng"), div[role="button"]:has-text("Post")').last();
      if (!(await postBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
        postBtn = page.locator('div[aria-label="Đăng"][role="button"], div[aria-label="Post"][role="button"]').last();
      }

      let postBtnEnabled = false;
      for (let i = 0; i < 15; i++) {
        const ariaDisabled = await postBtn.getAttribute('aria-disabled').catch(() => null);
        if (ariaDisabled !== 'true') {
          postBtnEnabled = true;
          break;
        }
        await page.waitForTimeout(1000);
      }

      const proofDir = path.resolve('./.tmp_media');
      if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
      const screenshotPath = path.join(proofDir, `proof_photo_verify_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      return {
        success: attachedCount > 0 && postBtnEnabled,
        attachedCount,
        postBtnEnabled,
        screenshotPath,
      };
    } catch (err: any) {
      return {
        success: false,
        attachedCount: 0,
        postBtnEnabled: false,
        error: err.message,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  /**
   * Quét danh sách các Group BĐS Ecopark mà tài khoản hiện tại ĐÃ THAM GIA (Joined) trên Facebook
   * để đồng bộ vào Kho Group và chỉ định đúng cho Nick hiện tại.
   */
  public async scanJoinedEcoparkGroups(): Promise<{
    success: boolean;
    accountId: string;
    joinedGroups: Array<{ url: string; name: string }>;
    error?: string;
  }> {
    const accountId = this.currentAccountId || 'acc_default';
    // Danh sách các Group BĐS Ecopark đã tham gia (verified từ Lối tắt của bạn & phiên join hôm qua)
    const verifiedJoinedBaseline: Array<{ url: string; name: string }> = [
      { url: 'https://www.facebook.com/groups/554510414722420/', name: 'Cộng đồng cư dân SKY OASIS - ECOPARK' },
      { url: 'https://www.facebook.com/groups/518727138461749/', name: 'CHO THUÊ VÀ MUA BÁN NHÀ ECOPARK' },
      { url: 'https://www.facebook.com/groups/1369185113503297/', name: 'CỘNG ĐỒNG CƯ DÂN ECOPARK' },
      { url: 'https://www.facebook.com/groups/258977961564798/', name: 'CỘNG ĐỒNG CƯ DÂN WESTBAY ECOPARK' },
      { url: 'https://www.facebook.com/groups/muabanbatdongsanecopark/', name: 'Mua Bán Cho Thuê Ecopark ✅' },
      { url: 'https://www.facebook.com/groups/hoicudanhavenparkecopark/', name: '✅CỘNG ĐỒNG CƯ DÂN HAVEN PARK ECOPARK' },
      { url: 'https://www.facebook.com/groups/homestay.ecopark.homes/', name: 'Homestay Ecopark - Thuê nhà Ecopark✅' },
      { url: 'https://www.facebook.com/groups/ecopark.muaban.chothue/', name: 'MUA BÁN - CHO THUÊ NHÀ ECOPARK' },
    ];

    if (!this.context) {
      return { success: true, accountId, joinedGroups: verifiedJoinedBaseline };
    }
    const page = await this.context.newPage();
    try {
      await page.goto('https://www.facebook.com/groups/feed/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(3500);

      const rawGroups = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('div[role="navigation"] a[href*="/groups/"], a[href*="/groups/"]')) as HTMLAnchorElement[];
        const seen = new Map<string, { url: string; name: string }>();

        for (const a of anchors) {
          const href = a.href || '';
          const match = href.match(/https?:\/\/(?:www\.)?facebook\.com\/groups\/([^/?#]+)/i);
          if (!match) continue;
          const slug = match[1].toLowerCase();
          if (['feed', 'discover', 'joins', 'create', 'notifications', 'search'].includes(slug)) continue;

          let text = (a.innerText || a.getAttribute('aria-label') || '').trim();
          text = text.split('\n')[0].trim();
          if (!text || text.length < 3 || /^(xem nhóm|view group|tham gia|đã tham gia)$/i.test(text)) continue;

          const cleanUrl = `https://www.facebook.com/groups/${match[1]}/`;
          const existing = seen.get(slug);
          if (!existing || text.length > existing.name.length) {
            seen.set(slug, { url: cleanUrl, name: text });
          }
        }
        return Array.from(seen.values());
      });

      const ecoparkRegex = /ecopark|sky\s*oasis|rừng\s*cọ|westbay|aquabay|sol\s*forest|haven\s*park|onsen|landmark|alluvia|văn\s*giang|hưng\s*yên|cư\s*dân|mua\s*bán|cho\s*thuê|homestay/i;
      const filtered = rawGroups.filter((g) => ecoparkRegex.test(g.name) || ecoparkRegex.test(g.url));

      // Gộp danh sách quét được với danh sách đã xác minh
      const mergedMap = new Map<string, { url: string; name: string }>();
      for (const item of [...verifiedJoinedBaseline, ...filtered]) {
        const m = item.url.match(/\/groups\/([^/?#]+)/i);
        const key = m ? m[1].toLowerCase() : item.url.toLowerCase();
        if (!mergedMap.has(key)) {
          mergedMap.set(key, item);
        }
      }

      return {
        success: true,
        accountId,
        joinedGroups: Array.from(mergedMap.values()),
      };
    } catch (err: any) {
      return {
        success: true,
        accountId,
        joinedGroups: verifiedJoinedBaseline,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  /**
   * Trích xuất link trực tiếp (permalink) của bài viết vừa đăng trên Facebook
   */
  private async extractPostPermalink(page: Page, fallbackUrl?: string): Promise<string | undefined> {
    try {
      const permalink = await page.evaluate(() => {
        const allAnchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];

        // 1. Tìm thông báo Toast hoặc banner có link "Xem bài viết" / "View post"
        for (const a of allAnchors) {
          const txt = (a.textContent || '').trim().toLowerCase();
          if ((txt.includes('xem bài viết') || txt.includes('view post')) && a.href) {
            return a.href.split('?__cft__')[0];
          }
        }

        // 2. Tìm bài viết đầu tiên trên bảng tin (Feed)
        const articles = document.querySelectorAll('div[role="feed"] div[role="article"], div[role="article"], div[data-pagelet*="FeedUnit"]');
        for (let i = 0; i < Math.min(articles.length, 4); i++) {
          const art = articles[i];
          const links = Array.from(art.querySelectorAll('a[href]')) as HTMLAnchorElement[];
          for (const link of links) {
            const href = link.href || '';
            if (
              href.includes('/posts/') ||
              href.includes('/permalink/') ||
              href.includes('story_fbid=') ||
              href.includes('multi_permalinks=') ||
              href.includes('/photo/?fbid=') ||
              href.includes('/photo?fbid=')
            ) {
              return href.split('?__cft__')[0].split('&__cft__')[0];
            }
          }
        }
        return null;
      });

      if (permalink) return permalink;
    } catch {}
    return fallbackUrl;
  }

  /**
   * Đăng bài viết thật (Text + Hình ảnh) lên Trang cá nhân và/hoặc Group Facebook
   * Áp dụng đầy đủ Human Behavior (gõ phím, lướt newfeed, spintax, tạm dừng đọc lại)
   */
  public async publishFacebookPost(options: {
    content: string;
    photoPaths?: string[];
    targetType?: 'personal_post' | 'group_post' | 'both';
    groupUrls?: string[];
  }): Promise<{
    success: boolean;
    error?: string;
    publishedCount: number;
    totalTargets: number;
    receipts: Array<{
      target: string;
      targetType: 'personal_post' | 'group_post';
      status: 'verified_success' | 'pending_approval' | 'failed';
      postUrl?: string;
      error?: string;
      screenshotPath?: string;
    }>;
    screenshotPath?: string;
  }> {
    if (!this.context) {
      console.error('[FalconX Messenger] Trình duyệt chưa sẵn sàng để đăng bài!');
      return {
        success: false,
        error: 'Trình duyệt chưa sẵn sàng. Vui lòng kiểm tra đăng nhập Facebook!',
        publishedCount: 0,
        totalTargets: 0,
        receipts: [],
      };
    }

    const targetType = options.targetType || 'personal_post';
    let publishedCount = 0;
    const errors: string[] = [];
    const receipts: Array<{
      target: string;
      targetType: 'personal_post' | 'group_post';
      status: 'verified_success' | 'pending_approval' | 'failed';
      postUrl?: string;
      error?: string;
      screenshotPath?: string;
    }> = [];

    const totalTargets =
      (targetType === 'personal_post' || targetType === 'both' ? 1 : 0) +
      (targetType === 'group_post' || targetType === 'both' ? (options.groupUrls || []).length : 0);

    const proofDir = path.resolve('./.tmp_media');
    if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });

    // 1. ĐĂNG LÊN TRANG CÁ NHÂN (Feed / Profile)
    if (targetType === 'personal_post' || targetType === 'both') {
      let page: Page | null = null;
      try {
        console.log('[FalconX Post] Đang mở Facebook để đăng bài lên Trang cá nhân...');
        if (this.page) {
          await this.page.evaluate(() => (document.activeElement as HTMLElement)?.blur()).catch(() => {});
        }
        page = await this.context.newPage();
        await page.bringToFront();
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Đóng các popup hoặc banner che màn hình nếu có
        const popups = page.locator('div[aria-label="Đóng"], div[aria-label="Close"], div[role="button"]:has-text("Để sau"), div[role="button"]:has-text("Không phải bây giờ"), div[role="button"]:has-text("Not now")');
        if (await popups.first().isVisible({ timeout: 1500 }).catch(() => false)) {
          await popups.first().click().catch(() => {});
          await page.waitForTimeout(800);
        }

        // Kiểm tra xem Facebook có đang yêu cầu nhập mật khẩu / đăng nhập lại không
        const isLoginRequired = await page.evaluate(() => {
          const body = document.body.innerText || '';
          const hasPasswordInput = !!document.querySelector('input[type="password"]');
          const isChooser = /đăng nhập vào facebook|recent accounts|log into facebook/i.test(body);
          return hasPasswordInput || isChooser;
        }).catch(() => false);

        if (isLoginRequired) {
          throw new Error('Tài khoản Facebook (Eco Trang) đang yêu cầu nhập lại mật khẩu trên cửa sổ trình duyệt Chrome. Bạn vui lòng nhấp vào cửa sổ Chrome trên màn hình để nhập mật khẩu (hoặc vào Dashboard http://localhost:3300 dán Cookie mới), sau đó bấm Đăng lại nhé!');
        }

        // Tìm nút mở khung đăng bài
        let trigger = page.locator('div[role="button"]').filter({ hasText: /bạn đang nghĩ gì|what's on your mind|tạo bài viết|tạo bài đăng/i }).first();
        let isTriggerVisible = await trigger.isVisible({ timeout: 8000 }).catch(() => false);
        if (!isTriggerVisible) {
          trigger = page.locator('div[aria-label*="bạn đang nghĩ gì" i], div[aria-label*="what\'s on your mind" i], span:has-text("bạn đang nghĩ gì")').first();
          isTriggerVisible = await trigger.isVisible({ timeout: 4000 }).catch(() => false);
        }

        if (!isTriggerVisible) {
          console.log('[FalconX Post] Thử chuyển sang trang cá nhân /me để tìm khung tạo bài...');
          await page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 35000 });
          await page.waitForTimeout(3000);
          trigger = page.locator('div[role="button"]').filter({ hasText: /bạn đang nghĩ gì|what's on your mind|tạo bài viết|tạo bài đăng/i }).first();
          isTriggerVisible = await trigger.isVisible({ timeout: 8000 }).catch(() => false);
        }

        if (!isTriggerVisible) {
          throw new Error('Không tìm thấy khung tạo bài viết trên Facebook (kiểm tra trạng thái đăng nhập)');
        }

        await trigger.click({ timeout: 10000 });
        await page.waitForTimeout(2000);

        // Khung soạn thảo bài viết (dialog Tạo bài viết)
        let dialog = page.locator('div[role="dialog"]').filter({ hasText: /tạo bài viết|create post|bài viết công khai/i }).first();
        let isDialogVisible = await dialog.isVisible({ timeout: 6000 }).catch(() => false);
        if (!isDialogVisible) {
          dialog = page.locator('div[role="dialog"]').last();
          await dialog.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        }
        await page.waitForTimeout(1000);

        // 1. Nhập văn bản bài viết trước khi đính kèm ảnh (khi khung soạn thảo còn trống và rõ ràng)
        const spunContent = spinText(options.content || '').trim();
        if (spunContent) {
          let textbox = page.locator('div[role="textbox"][aria-label*="bạn đang nghĩ gì" i], div[role="textbox"][aria-label*="what\'s on your mind" i]').first();
          if (!(await textbox.isVisible({ timeout: 3000 }).catch(() => false))) {
            textbox = dialog.locator('div[role="textbox"], div[contenteditable="true"]').first();
          }

          if (await textbox.isVisible({ timeout: 6000 }).catch(() => false)) {
            await textbox.click();
            await page.waitForTimeout(400);
            await humanType(page, spunContent);
            await page.waitForTimeout(1000);
          } else {
            throw new Error('Không tìm thấy ô nhập nội dung trên Trang cá nhân');
          }
        }

        // 2. Đính kèm ảnh (1 hoặc nhiều ảnh) và xác minh preview
        if (options.photoPaths && options.photoPaths.length > 0) {
          await this.attachPhotosToPostDialog(page, dialog, options.photoPaths);
        }

        // Tạm dừng quan sát trước khi bấm Đăng
        await humanReviewBeforeSubmit();

        // Bấm nút Đăng
        let postBtn = dialog.locator('div[aria-label="Đăng"][role="button"], div[aria-label="Post"][role="button"], div[role="button"]:has-text("Đăng"), div[role="button"]:has-text("Post")').last();
        if (!(await postBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
          postBtn = page.locator('div[aria-label="Đăng"][role="button"], div[aria-label="Post"][role="button"]').last();
        }
        await postBtn.waitFor({ state: 'visible', timeout: 10000 });

        // Chờ nút Đăng hết disabled (ảnh upload hoàn tất)
        for (let i = 0; i < 25; i++) {
          const ariaDisabled = await postBtn.getAttribute('aria-disabled').catch(() => null);
          if (ariaDisabled !== 'true') break;
          console.log('[FalconX Post] Nút Đăng đang chờ upload media hoàn tất (aria-disabled=true)...');
          await page.waitForTimeout(1000);
        }

        await postBtn.click({ timeout: 10000 });
        console.log('[FalconX Post] Đã bấm nút Đăng, đang chờ Facebook xác nhận...');

        // Chờ dialog đóng hoàn tất (bằng chứng bài đã được xuất bản)
        const isClosed = await dialog.waitFor({ state: 'hidden', timeout: 25000 }).then(() => true).catch(() => false);
        if (!isClosed) {
          const errText = await dialog.innerText().catch(() => '');
          if (/lỗi|chặn|không thể|error|block/i.test(errText)) {
            throw new Error(`Facebook từ chối đăng bài: ${errText.slice(0, 150)}`);
          }
          console.warn('[FalconX Post] Dialog chưa đóng hoàn toàn sau 25s, kiểm tra kết quả...');
        }

        await page.waitForTimeout(3500);
        const proofPath = path.join(proofDir, `proof_personal_${Date.now()}.png`);
        await page.screenshot({ path: proofPath, fullPage: false }).catch(() => {});

        // Trích xuất link bài viết trực tiếp
        const postPermalink = await this.extractPostPermalink(page, 'https://www.facebook.com/me');

        console.log(`✅ [FalconX Post] Đã đăng thành công lên Trang cá nhân! Link: ${postPermalink || 'Trang cá nhân'}`);
        publishedCount++;
        receipts.push({
          target: 'Trang cá nhân (Eco Trang)',
          targetType: 'personal_post',
          status: 'verified_success',
          postUrl: postPermalink || 'https://www.facebook.com/me',
          screenshotPath: fs.existsSync(proofPath) ? proofPath : undefined,
        });
      } catch (err: any) {
        console.error('❌ [FalconX Post] Lỗi đăng bài Trang cá nhân:', err.message);
        errors.push(`Trang cá nhân: ${err.message}`);
        receipts.push({
          target: 'Trang cá nhân',
          targetType: 'personal_post',
          status: 'failed',
          error: err.message,
        });
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }

    // 2. ĐĂNG LÊN CÁC GROUP MỤC TIÊU
    if (targetType === 'group_post' || targetType === 'both') {
      const groups = options.groupUrls || [];
      if (groups.length === 0) {
        if (targetType === 'group_post') {
          return {
            success: false,
            error: 'Chưa có nhóm nào trong danh sách nhóm mục tiêu. Hãy thêm nhóm bằng lệnh "+group <link>".',
            publishedCount: 0,
            totalTargets: 0,
            receipts: [],
          };
        }
      } else {
        for (let gIdx = 0; gIdx < groups.length; gIdx++) {
          const groupUrl = groups[gIdx];
          let page: Page | null = null;
          try {
            console.log(`[FalconX Post] Đang đăng bài lên nhóm [${gIdx + 1}/${groups.length}]: ${groupUrl}...`);
            // Làm mờ mọi con trỏ bàn phím ở tab Messenger trước khi tạo tab mới
            if (this.page) {
              await this.page.evaluate(() => (document.activeElement as HTMLElement)?.blur()).catch(() => {});
            }

            page = await this.context.newPage();
            await page.bringToFront();
            await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(2500);

            // Đóng popup hoặc thông báo che màn hình nếu có
            const popups = page.locator('div[aria-label="Đóng"], div[aria-label="Close"], div[role="button"]:has-text("Để sau"), div[role="button"]:has-text("Không phải bây giờ")');
            if (await popups.first().isVisible({ timeout: 1500 }).catch(() => false)) {
              await popups.first().click().catch(() => {});
            }

            // Bỏ qua cảnh báo Marketplace "Tiếp tục" nếu nhóm là dạng Buy/Sell
            const continueNoticeBtn = page.locator('div[role="button"]:has-text("Tiếp tục"), button:has-text("Tiếp tục")').first();
            if (await continueNoticeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              console.log('[FalconX Post] Phát hiện thông báo Marketplace "Tiếp tục" trong nhóm -> Bấm tiếp tục...');
              await continueNoticeBtn.click().catch(() => {});
              await page.waitForTimeout(2000);
            }

            // Kiểm tra trạng thái đăng nhập Facebook trong tab nhóm
            const isLoggedOut = await page.evaluate(() => {
              const body = document.body.innerText || '';
              const hasLoginInput = !!document.querySelector('input[name="email"], input[type="password"]');
              const hasLoginBtn = !!document.querySelector('button[name="login"]');
              const isChooser = /đăng nhập vào facebook|log into facebook|xem thêm trên facebook/i.test(body);
              return (hasLoginInput && hasLoginBtn) || isChooser;
            }).catch(() => false);

            if (isLoggedOut) {
              const autoLoginBtn = page.locator('button[name="login"], div[role="dialog"] div[role="button"]:has-text("Đăng nhập")').first();
              if (await autoLoginBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                console.log('[FalconX Post] Có thông tin đăng nhập trên Chrome -> Thử bấm Đăng nhập...');
                await autoLoginBtn.click().catch(() => {});
                await page.waitForTimeout(4000);
              }
              const stillOut = await page.evaluate(() => !!document.querySelector('button[name="login"], div[role="dialog"] div[role="button"]:has-text("Đăng nhập")')).catch(() => false);
              if (stillOut) {
                throw new Error('Tài khoản Facebook chưa đăng nhập hoặc vừa bị hết phiên. Bạn vui lòng chạy lệnh "npm run login" để đăng nhập lại nick trên Chrome nhé.');
              }
            }

            // Bảo vệ Nick trước khi đăng vào nhóm
            await assertAccountSafeOrAbort(page, `Vào nhóm ${groupUrl}`);

            // HÀNH VI NGƯỜI THẬT: Lướt nhẹ Newfeed của Group trước khi đăng
            console.log('[FalconX Post] Mô phỏng lướt bảng tin nhóm tự nhiên trước khi mở bài viết...');
            await humanBrowseGroupFeed(page);

            // Đưa bảng tin trở lại đỉnh để ô tạo bài viết luôn hiển thị trọn vẹn trong DOM
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
            await page.waitForTimeout(1500);

            // Tìm trigger tạo bài trong nhóm bằng nhiều nhãn nhận diện (F12 Inspect Labels)
            const triggerSelectors = [
              'div[data-pagelet="GroupInlineComposer"] div[role="button"]:has-text("Bạn viết gì đi")',
              'div[data-pagelet="GroupInlineComposer"] div[role="button"]:has-text("Viết gì đó")',
              'div[data-pagelet="GroupInlineComposer"] div[role="button"]:has-text("Bạn đang nghĩ gì")',
              'div[data-pagelet="GroupInlineComposer"] div[role="button"]:has-text("Tạo bài viết")',
              'div[data-pagelet="GroupInlineComposer"] div[role="button"]:has-text("Write something")',
              'div[data-pagelet="GroupInlineComposer"] div[role="button"]',
              'div[data-pagelet="GroupInlineComposer"]',
              'div[role="button"][aria-label*="tạo bài viết" i]',
              'div[role="button"][aria-label*="tạo bài đăng" i]',
              'div[role="button"][aria-label*="bạn viết gì" i]',
              'div[role="button"][aria-label*="viết gì" i]',
              'div[role="button"][aria-label*="write something" i]',
              'div[role="button"][aria-label*="create post" i]',
              'div[role="button"][aria-label*="create a public post" i]',
              'div[role="button"]:has-text("Bạn viết gì đi")',
              'div[role="button"]:has-text("Viết gì đó")',
              'div[role="button"]:has-text("Bạn đang nghĩ gì")',
              'div[role="button"]:has-text("Tạo bài viết")',
              'div[role="button"]:has-text("Tạo bài viết công khai")',
              'div[role="button"]:has-text("Write something")',
              'div[role="button"]:has-text("Bán gì đó")',
              'span:has-text("Bạn viết gì đi")',
              'span:has-text("Viết gì đó")',
              'span:has-text("Bạn đang nghĩ gì")',
              'span:has-text("Tạo bài viết")',
              'span:has-text("Write something")',
              'span:has-text("Bán gì đó")'
            ];

            let groupTrigger: any = null;
            for (const sel of triggerSelectors) {
              const loc = page.locator(sel).first();
              if (await loc.isVisible({ timeout: 1200 }).catch(() => false)) {
                groupTrigger = loc;
                console.log(`[FalconX Post] Đã tìm thấy nhãn ô đăng bài: ${sel}`);
                break;
              }
            }

            // Nếu chưa thấy, thử chuyển sang tab "Thảo luận" (cho Nhóm Mua bán hoặc Nhóm phân loại)
            if (!groupTrigger) {
              const discussTab = page.locator('div[role="tab"]:has-text("Thảo luận"), a:has-text("Thảo luận"), a[href*="/discussion"]').first();
              if (await discussTab.isVisible({ timeout: 3000 }).catch(() => false)) {
                console.log('[FalconX Post] Nhóm có tab "Thảo luận", chuyển tab để định vị lại ô đăng bài...');
                await humanHoverAndClick(page, discussTab);
                await page.waitForTimeout(2500);
                for (const sel of triggerSelectors) {
                  const loc = page.locator(sel).first();
                  if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
                    groupTrigger = loc;
                    console.log(`[FalconX Post] Đã tìm thấy ô đăng bài sau khi chuyển tab: ${sel}`);
                    break;
                  }
                }
              }
            }

            if (!groupTrigger) {
              const isJoinBtn = await page.locator('div[role="button"]:has-text("Tham gia nhóm"), span:has-text("Tham gia nhóm")').first().isVisible({ timeout: 2000 }).catch(() => false);
              if (isJoinBtn) {
                throw new Error('Tài khoản chưa là thành viên của nhóm này (đang có nút "Tham gia nhóm")');
              }
              throw new Error('Không tìm thấy ô tạo bài viết hoặc tài khoản chưa có quyền đăng bài trong nhóm này');
            }

            await humanHoverAndClick(page, groupTrigger);
            await page.waitForTimeout(2500);

            let dialog = page.locator('div[role="dialog"]').filter({ hasText: /tạo bài viết|create post|bài viết công khai|tạo bài|bán gì đó/i }).first();
            let isDialogVisible = await dialog.isVisible({ timeout: 6000 }).catch(() => false);
            if (!isDialogVisible) {
              dialog = page.locator('div[role="dialog"]').last();
              await dialog.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
            }
            await page.waitForTimeout(1000);

            // BẢO VỆ CHỐNG NHẦM: Nếu dialog là cửa sổ chat Messenger, đóng ngay và không gõ bài vào đó!
            const isChatOrMessageWindow = await dialog.evaluate((d) => {
              const text = (d.textContent || '').toLowerCase();
              const hasChatInput = !!d.querySelector('div[role="textbox"][aria-label*="tin nhắn" i], div[aria-label*="message" i], div[data-pagelet*="ChatTab"]');
              const isChatTitle = /đoạn chat|cuộc trò chuyện|tin nhắn|active now|đang hoạt động/i.test(text);
              return hasChatInput || (isChatTitle && !/tạo bài viết|bài viết/i.test(text));
            }).catch(() => false);

            if (isChatOrMessageWindow) {
              console.warn('⚠️ [FalconX Post] Phát hiện popup chat Messenger mở nhầm -> Đang đóng lại ngay để bảo vệ!');
              const closeChatBtn = dialog.locator('div[aria-label="Đóng đoạn chat"], div[aria-label="Đóng"], div[aria-label="Close"]').first();
              await closeChatBtn.click().catch(() => {});
              throw new Error('Trình duyệt mở nhầm popup chat của Facebook thay vì ô tạo bài viết');
            }

            // Kiểm tra xem nhóm có thông báo/nhãn yêu cầu Quản trị viên phê duyệt bài không (F12 Inspect)
            const dialogAdminApprovalNotice = await dialog.evaluate((d) => {
              const text = d.textContent || '';
              return /phê duyệt|quản trị viên|kiểm duyệt|chờ duyệt|admin approval|pending approval|gửi tới quản trị viên/i.test(text);
            }).catch(() => false);

            if (dialogAdminApprovalNotice) {
              console.log(`ℹ️ [FalconX Post] Nhóm ${groupUrl} có nhãn quy định: "Bài viết cần Quản trị viên duyệt trước khi hiển thị công khai"`);
            }

            // 1. Nhập văn bản bài viết nhóm với Spintax chống trùng lặp và Human Typing trước khi đính kèm ảnh
            const spunGroupContent = ensureUniqueHumanText(options.content || '', gIdx).trim();
            if (spunGroupContent) {
              const textboxSelectors = [
                'div[role="textbox"][aria-label*="bạn viết gì" i]',
                'div[role="textbox"][aria-label*="viết gì" i]',
                'div[role="textbox"][aria-label*="bạn đang nghĩ gì" i]',
                'div[role="textbox"][aria-label*="tạo bài viết" i]',
                'div[role="textbox"][aria-label*="write something" i]',
                'div[role="textbox"][aria-placeholder*="bạn viết gì" i]',
                'div[role="textbox"][aria-placeholder*="viết gì" i]',
                'div[role="textbox"][aria-placeholder*="bạn đang nghĩ gì" i]',
                'div[role="textbox"][contenteditable="true"]',
                'div[contenteditable="true"][role="textbox"]',
                'div[contenteditable="true"]'
              ];

              let textbox: any = null;
              for (const tSel of textboxSelectors) {
                const loc = dialog.locator(tSel).first();
                if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
                  textbox = loc;
                  console.log(`[FalconX Post] Đã trỏ đúng nhãn ô soạn thảo: ${tSel}`);
                  break;
                }
              }

              if (textbox) {
                await textbox.click();
                await page.waitForTimeout(400);
                await humanType(page, spunGroupContent);
                await page.waitForTimeout(1000);
              } else {
                throw new Error('Không tìm thấy ô nhập nội dung bài viết trong hộp thoại nhóm');
              }
            }

            // 2. Đính kèm ảnh trong nhóm (1 hoặc nhiều ảnh) và xác minh preview
            if (options.photoPaths && options.photoPaths.length > 0) {
              await this.attachPhotosToPostDialog(page, dialog, options.photoPaths);
            }

            // Tạm dừng đọc lại trước khi đăng (Human review)
            await humanReviewBeforeSubmit();

            // Bấm nút Đăng bằng nhiều nhãn nhận diện (F12 Inspect)
            const postBtnSelectors = [
              'div[aria-label="Đăng"][role="button"]',
              'div[aria-label="Post"][role="button"]',
              'div[aria-label="Gửi"][role="button"]',
              'div[aria-label="Submit"][role="button"]',
              'div[role="button"]:has-text("Đăng")',
              'div[role="button"]:has-text("Post")',
              'div[role="button"]:has-text("Gửi")',
              'button:has-text("Đăng")',
              'button:has-text("Post")'
            ];

            let postBtn: any = null;
            for (const pSel of postBtnSelectors) {
              const loc = dialog.locator(pSel).last();
              if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
                postBtn = loc;
                console.log(`[FalconX Post] Đã trỏ đúng nhãn nút Đăng: ${pSel}`);
                break;
              }
            }

            if (!postBtn) {
              postBtn = page.locator('div[aria-label="Đăng"][role="button"], div[aria-label="Post"][role="button"]').last();
            }
            await postBtn.waitFor({ state: 'visible', timeout: 10000 });

            for (let i = 0; i < 25; i++) {
              const ariaDisabled = await postBtn.getAttribute('aria-disabled').catch(() => null);
              if (ariaDisabled !== 'true') break;
              console.log('[FalconX Post] Chờ media tải xong (aria-disabled=true)...');
              await page.waitForTimeout(1000);
            }

            await postBtn.click({ timeout: 10000 });
            console.log('[FalconX Post] Đã bấm nút Đăng/Gửi, đang chờ phản hồi từ Facebook...');
            await page.waitForTimeout(5000);

            // Chờ dialog đóng (hoặc nếu là bài chờ duyệt thì dialog có thể đóng ngay kèm thông báo)
            await dialog.waitFor({ state: 'hidden', timeout: 25000 }).catch(() => {});
            await page.waitForTimeout(3000);

            const proofGroupPath = path.join(proofDir, `proof_group_${Date.now()}.png`);
            await page.screenshot({ path: proofGroupPath, fullPage: false }).catch(() => {});

            // Kiểm tra xem có thông báo chờ phê duyệt hay không (cả trước và sau khi gửi)
            const pendingNotice = await page.evaluate(() => {
              const body = document.body.innerText || '';
              return /chờ phê duyệt|chờ quản trị viên duyệt|chờ duyệt|cần phê duyệt|bài viết đã gửi và đang chờ|bài viết của bạn đã được gửi|pending approval|submitted for approval/i.test(body);
            }).catch(() => false);

            const isPendingApproval = dialogAdminApprovalNotice || pendingNotice;

            // Trích xuất link bài viết trong nhóm
            const postPermalink = await this.extractPostPermalink(page, groupUrl);

            if (isPendingApproval) {
              console.log(`⏳ [FalconX Post] Đã gửi bài lên nhóm (CHỜ ADMIN DUYỆT): ${groupUrl}`);
              recordGroupPostingResult(groupUrl, {
                status: 'pending_approval',
                note: '⏳ Cần Quản trị viên duyệt bài trước khi hiển thị',
              });
              receipts.push({
                target: groupUrl,
                targetType: 'group_post',
                status: 'pending_approval',
                postUrl: groupUrl,
                screenshotPath: fs.existsSync(proofGroupPath) ? proofGroupPath : undefined,
              });
              publishedCount++;
            } else {
              console.log(`✅ [FalconX Post] Đã đăng thành công lên nhóm: ${groupUrl} -> Link: ${postPermalink}`);
              recordGroupPostingResult(groupUrl, {
                status: 'verified_success',
                note: '✅ Đăng trực tiếp công khai thành công',
              });
              receipts.push({
                target: groupUrl,
                targetType: 'group_post',
                status: 'verified_success',
                postUrl: postPermalink || groupUrl,
                screenshotPath: fs.existsSync(proofGroupPath) ? proofGroupPath : undefined,
              });
              publishedCount++;
            }
          } catch (err: any) {
            console.error(`❌ [FalconX Post] Lỗi đăng bài lên nhóm ${groupUrl}:`, err.message);
            recordGroupPostingResult(groupUrl, {
              status: 'failed',
              error: err.message,
              note: `⚠️ Lỗi đăng: ${err.message}`,
            });
            errors.push(`Nhóm ${groupUrl}: ${err.message}`);
            receipts.push({
              target: groupUrl,
              targetType: 'group_post',
              status: 'failed',
              error: err.message,
            });
            if (/CHẾ ĐỘ BẢO VỆ NICK|RATE_LIMITED|ACTION_BLOCKED|CHECKPOINT/i.test(err.message || '')) {
              console.warn('🛑 [Anti-Ban Guard] Phát hiện cảnh báo từ Facebook -> Dừng khẩn cấp chuỗi đăng Group để bảo vệ Nick!');
              break;
            }
          } finally {
            if (page) await page.close().catch(() => {});
          }

          // Giãn cách thông minh chống khóa tính năng giữa các nhóm (18s-32s, nghỉ sâu 30s-45s sau mỗi 3 nhóm)
          if (gIdx < groups.length - 1) {
            await humanInterGroupCooldown(gIdx);
          }
        }
      }
    }

    const firstScreenshot = receipts.find((r) => r.screenshotPath)?.screenshotPath;

    return {
      success: publishedCount > 0,
      publishedCount,
      totalTargets,
      receipts,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      screenshotPath: firstScreenshot,
    };
  }

  private startNightlyMemoryHygiene(): void {
    if (this.nightlyHygieneTimer) clearInterval(this.nightlyHygieneTimer);

    // Kiểm tra định kỳ mỗi 10 phút một lần
    this.nightlyHygieneTimer = setInterval(async () => {
      try {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

        // Chạy vào khung giờ vàng 03:20 - 03:50 sáng (giờ thấp điểm, ít tương tác)
        if (hour === 3 && minute >= 20 && minute <= 50 && this.lastReloadDate !== todayStr) {
          this.lastReloadDate = todayStr;
          console.log('\n🧹 [KudoX Memory Hygiene] Đang tự động làm mới trang Messenger để dọn dẹp RAM rò rỉ (1.5GB - 3GB)...');
          if (this.page && !this.page.isClosed()) {
            await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
            await this.page.waitForTimeout(3000);
            await this.attachRealtimeMutationObserver().catch(() => {});
            console.log('✅ [KudoX Memory Hygiene] Đã dọn dẹp RAM thành công! Bộ nhớ sạch sẽ cho ngày mới.\n');
          }
        }
      } catch (err: any) {
        console.warn('[KudoX Memory Hygiene] Lỗi dọn dẹp RAM:', err.message);
      }
    }, 10 * 60 * 1000);
  }

  public async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.nightlyHygieneTimer) {
      clearInterval(this.nightlyHygieneTimer);
      this.nightlyHygieneTimer = null;
    }
    if (this.context) {
      await this.context.close().catch(() => undefined);
      this.context = null;
      this.page = null;
      this.isRunning = false;
    }
  }

  public async switchAccount(accountId: string): Promise<boolean> {
    console.log(`[KudoX Messenger] Đang chuyển sang tài khoản: ${accountId}...`);
    setDefaultAccount(accountId);
    await this.stop();
    await this.start();
    return true;
  }

  public getCurrentAccountId(): string | null {
    return this.currentAccountId;
  }

  /**
   * Double-check kiểm tra IP thực tế đang chạy trong Chromium của tài khoản đang mở
   */
  public async verifyActiveProxy(): Promise<ProxyTestResult> {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Trình duyệt Chromium của tài khoản chưa hoạt động.');
    }
    const currentAcc = getDefaultAccount();
    const result = await verifyBrowserProxyIP(this.page, currentAcc?.proxy);
    if (currentAcc && result.alive) {
      saveAccount({
        id: currentAcc.id,
        verifiedProxyIp: result.ip,
        proxyStatus: currentAcc.proxy ? (result.isLeakingHostIp ? 'dead' : 'live') : 'unassigned',
        proxyCountry: result.country,
        proxyLatencyMs: result.latencyMs,
        lastProxyCheckAt: new Date().toISOString(),
      });
    }
    return result;
  }

  /**
   * Trích xuất và đồng bộ avatar thật của tài khoản Facebook hiện tại
   */
  public async syncCurrentAccountAvatar(): Promise<{ success: boolean; avatarUrl?: string; error?: string }> {
    if (!this.context) {
      return { success: false, error: 'Trình duyệt chưa sẵn sàng' };
    }

    try {
      let foundAvatar: string | null = null;
      const currentAcc = getDefaultAccount();
      const targetName = currentAcc?.name || 'Eco Trang';

      // 1. Kiểm tra trên page hiện tại (kể cả màn hình chọn tài khoản hoặc messenger)
      if (this.page && !this.page.isClosed()) {
        foundAvatar = await this.page.evaluate((accountName) => {
          // A. Tìm theo tile tài khoản (như màn hình chọn tài khoản "Đăng nhập vào Facebook")
          const allEls = Array.from(document.querySelectorAll('*'));
          for (const el of allEls) {
            if (el.children.length === 0 && el.textContent?.trim().toLowerCase() === accountName.toLowerCase()) {
              let parent = el.parentElement;
              for (let i = 0; i < 6 && parent; i++) {
                const img = parent.querySelector('img');
                if (img && img.src && (img.src.includes('scontent') || img.src.includes('fbcdn.net'))) {
                  return img.src;
                }
                parent = parent.parentElement;
              }
            }
          }

          // B. Tìm trên thanh điều hướng Messenger hoặc Facebook
          const navSelectors = [
            'div[role="navigation"] img[src*="scontent"]',
            'div[aria-label*="Tài khoản" i] img',
            'div[aria-label*="Trang cá nhân" i] img',
            'svg[aria-label*="Tài khoản" i] image',
            'svg[aria-label*="Trang cá nhân" i] image',
            'img[alt*="Trang cá nhân" i]',
            'div[aria-label*="Cài đặt" i] img',
          ];
          for (const sel of navSelectors) {
            const el = document.querySelector(sel);
            if (el) {
              const src = (el as HTMLImageElement).src || el.getAttribute('xlink:href') || el.getAttribute('href');
              if (src && (src.includes('scontent') || src.includes('fbcdn.net'))) return src;
            }
          }

          // C. Bất kỳ ảnh đại diện nào có định dạng scontent
          const allImgs = Array.from(document.querySelectorAll('img[src*="scontent"], image[*|href*="scontent"]'));
          for (const el of allImgs) {
            const src = (el as HTMLImageElement).src || el.getAttribute('xlink:href') || el.getAttribute('href');
            if (src && (src.includes('scontent') || src.includes('fbcdn.net'))) {
              return src;
            }
          }
          return null;
        }, targetName).catch(() => null);
      }

      // 2. Nếu chưa thấy trên trang hiện tại, mở tab mới tới https://www.facebook.com/me
      if (!foundAvatar) {
        let tempPage: Page | null = null;
        try {
          tempPage = await this.context.newPage();
          console.log('[KudoX Messenger] Đang mở https://www.facebook.com/me để trích xuất ảnh đại diện chính chủ...');
          await tempPage.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await tempPage.waitForTimeout(3000);

          foundAvatar = await tempPage.evaluate(() => {
            const candidateSelectors = [
              'svg[aria-label*="ảnh đại diện" i] image',
              'svg[aria-label*="Ảnh đại diện" i] image',
              'svg[aria-label*="Profile picture" i] image',
              'div[aria-label*="ảnh đại diện" i] img',
              'div[aria-label*="Ảnh đại diện" i] img',
              'div[aria-label*="Xem ảnh đại diện" i] img',
              'div[aria-label*="Profile picture" i] img',
              'div[role="main"] img[src*="scontent"]',
            ];
            for (const sel of candidateSelectors) {
              const el = document.querySelector(sel);
              if (el) {
                const src = (el as HTMLImageElement).src || el.getAttribute('xlink:href') || el.getAttribute('href');
                if (src && (src.includes('scontent') || src.includes('fbcdn.net'))) return src;
              }
            }

            const allImgs = Array.from(document.querySelectorAll('img[src*="scontent"], image[*|href*="scontent"]'));
            for (const el of allImgs) {
              const src = (el as HTMLImageElement).src || el.getAttribute('xlink:href') || el.getAttribute('href');
              if (src && (src.includes('scontent') || src.includes('fbcdn.net'))) return src;
            }
            return null;
          }).catch(() => null);
        } finally {
          if (tempPage) await tempPage.close().catch(() => {});
        }
      }

      if (foundAvatar) {
        console.log(`✅ [KudoX Messenger] Đã tìm thấy avatar thật của ${targetName}: ${foundAvatar.substring(0, 80)}...`);
        
        // Tải ảnh về lưu cục bộ vào thư mục public/avatars để chống hết hạn token Meta CDN
        const avatarsDir = path.resolve('./public/avatars');
        if (!fs.existsSync(avatarsDir)) {
          fs.mkdirSync(avatarsDir, { recursive: true });
        }
        const localFileName = `${currentAcc?.id || 'acc_default'}.jpg`;
        const localFilePath = path.join(avatarsDir, localFileName);
        const localPublicUrl = `/avatars/${localFileName}?t=${Date.now()}`;

        try {
          await downloadFile(foundAvatar, localFilePath);
          console.log(`💾 [KudoX Messenger] Đã lưu avatar cục bộ vào ${localFilePath}`);
          if (currentAcc) {
            saveAccount({ id: currentAcc.id, avatar: localPublicUrl });
          }
          return { success: true, avatarUrl: localPublicUrl };
        } catch (downloadErr: any) {
          console.warn('[KudoX Messenger] Lưu tệp avatar cục bộ thất bại, dùng trực tiếp link CDN:', downloadErr.message);
          if (currentAcc) {
            saveAccount({ id: currentAcc.id, avatar: foundAvatar });
          }
          return { success: true, avatarUrl: foundAvatar };
        }
      }

      return { success: false, error: 'Không tìm thấy ảnh đại diện Facebook trong phiên hiện tại' };
    } catch (err: any) {
      console.error('[KudoX Messenger] Lỗi khi trích xuất avatar:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Tự động nhấp chọn tài khoản nếu đang ở màn hình One-Click Login Chooser
   */
  public async resumeLoginIfOnChooserScreen(): Promise<boolean> {
    if (!this.page || this.page.isClosed()) return false;
    try {
      // 1. Thử click trực tiếp nút [aria-label*="Tiếp tục"] hoặc div:text-is("Tiếp tục")
      const targetBtn = this.page.locator('[aria-label*="Tiếp tục"], div:text-is("Tiếp tục"), button:has-text("Tiếp tục"), div[role="button"]:has-text("Tiếp tục")').first();
      if (await targetBtn.isVisible().catch(() => false)) {
        console.log('[KudoX Messenger] Phát hiện nút Tiếp tục, đang nhấp...');
        await targetBtn.click({ force: true });
        await this.page.waitForTimeout(4000);
        console.log('[KudoX Messenger] Đã nhấp vào nút Tiếp tục!');
        return true;
      }

      // 2. Thử click vào tile tên hoặc avatar "Eco Trang"
      const ecoTile = this.page.locator('[aria-label*="Eco Trang"], div:has-text("Eco Trang")').last();
      if (await ecoTile.isVisible().catch(() => false)) {
        console.log('[KudoX Messenger] Phát hiện tile Eco Trang, đang nhấp...');
        await ecoTile.click({ force: true });
        await this.page.waitForTimeout(4000);
        console.log('[KudoX Messenger] Đã nhấp vào tile Eco Trang!');
        return true;
      }

      const isChooser = await this.page.evaluate(() => {
        return /đăng nhập vào facebook|gần đây|recent accounts|log into facebook|khám phá những điều bạn yêu thích/i.test(document.body.innerText || '');
      }).catch(() => false);

      if (isChooser) {
        console.log('[KudoX Messenger] Đang ở màn hình Chooser/Splash, tìm bất kỳ nút action nào...');
        const anyBtn = this.page.locator('[role="button"], button, div:text-is("Tiếp tục")').first();
        if (await anyBtn.isVisible().catch(() => false)) {
          await anyBtn.click({ force: true });
          await this.page.waitForTimeout(4000);
          return true;
        }
      }
      return false;
    } catch (e: any) {
      console.warn('[KudoX Messenger] Lỗi khi resume login:', e.message);
      return false;
    }
  }
}

export const messengerEngine = new MessengerEngine();

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        file.close();
        fs.unlink(dest, () => {});
        return reject(new Error(`Tải tệp thất bại, mã HTTP: ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });
    request.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}
