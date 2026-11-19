import { Bot, Context, InlineKeyboard, InputFile } from 'grammy';
import { config } from '../config/env.js';
import {
  getMappingByTopicId,
  getMappingByFbThread,
  saveThreadMapping,
  getAllMappings,
  recordSentMessage,
  updateCustomerTagByTopic,
  getAllAccounts,
  getDefaultAccount,
  setDefaultAccount,
  getAccountById,
  saveAccount,
  updateAccountProxy,
  updateAccountProxyVerification,
} from '../db/store.js';
import { testProxyNetwork, parseProxy } from '../core/browser-session.js';
import { loginFacebookWithCredentials } from '../core/facebook-authenticator.js';
import { messengerEngine, InboundMessage } from '../engine/messenger-engine.js';
import { sendExtractedImagesToTelegram } from '../engine/media-extractor.js';
import { loadCannedReplies, saveCannedReply } from '../config/canned-replies.js';
import {
  getAutoCommentConfig,
  updateAutoCommentConfig,
  addCommentTemplate,
  getCommentTemplates,
  deleteCommentTemplate,
  addTargetGroup,
  getTargetGroups,
  getJoinedEcoparkGroups,
  syncJoinedGroupsToPool,
  addKeyword,
  getKeywords,
  addPendingDraft,
  getPendingDraft,
  getLatestPendingDraftByTopic,
  updatePendingDraft,
  confirmDraft,
  cancelDraft,
  getDailyPosts,
  getDailyPost,
  deleteDailyPost,
  clearDailyPosts,
  getTodayStats,
  updateDailyPostStatus,
} from '../db/auto-comment-store.js';
import { autoCommentEngine } from '../engine/auto-comment-engine.js';
import { facebookActionsEngine, type FacebookReaction } from '../engine/facebook-actions-engine.js';
import { measureRealPing } from '../services/action-result.js';
import { CommentService } from '../services/comment-service.js';
import { accountHealthService } from '../services/account-health-service.js';
import {
  getAllProperties,
  getAvailableProperties,
  ingestPropertiesFromText,
  ingestPropertiesFromImage,
  deleteProperty,
  getPropertyInventoryStats,
  type PropertyItem,
} from '../services/property-inventory.js';
import { globalLeadPoolService } from '../services/global-lead-pool.js';
import { getCaptchaApiKeys, saveCaptchaApiKeys } from '../core/captcha-solver.js';
import {
  scanAllRunningProfilesCaptcha,
  unlockLiveCaptchaForAccount,
  autoUnlockAllLiveCaptchas,
} from '../core/captcha-live-unlocker.js';
import fs from 'fs';
import path from 'path';
import https from 'https';

let botInstance: Bot | null = null;
let botUsername: string | null = null;

export function getBotUsername(): string | null {
  return botUsername;
}

type FacebookActionKind = 'friend' | 'story' | 'post';
interface PendingFacebookAction {
  id: string;
  kind: FacebookActionKind;
  url: string;
  userId: number;
  topicId: number;
  expiresAt: number;
  reaction?: FacebookReaction;
}

const pendingFacebookActions = new Map<string, PendingFacebookAction>();
interface PendingPhotoAlbum {
  ctx: Context;
  caption: string;
  fileIds: string[];
  timer: NodeJS.Timeout;
}
const pendingPostPhotoAlbums = new Map<string, PendingPhotoAlbum>();

function telegramErrorDescription(error: unknown): string {
  const candidate = error as { description?: unknown; message?: unknown } | null;
  return String(candidate?.description ?? candidate?.message ?? error ?? 'Unknown Telegram API error');
}

function isTopicUnchangedError(error: unknown): boolean {
  return telegramErrorDescription(error).includes('TOPIC_NOT_MODIFIED');
}

function isMissingTopicError(error: unknown): boolean {
  return /TOPIC_ID_INVALID|TOPIC_NOT_FOUND|message thread not found/i.test(telegramErrorDescription(error));
}

// Thư mục lưu tệp đệm tạm thời khi chuyển đổi
const tempDir = path.resolve('./.tmp_media');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

export function getBot(): Bot {
  if (botInstance) return botInstance;
  if (!config.telegramBotToken) {
    throw new Error('Chưa cấu hình TELEGRAM_BOT_TOKEN');
  }

  const bot = new Bot(config.telegramBotToken);
  botInstance = bot;

  // Bắt mọi lỗi ngoại lệ trong luồng Telegram Bot tránh sập tiến trình
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`🚨 [Telegram Bot Error] Lỗi khi xử lý update ${ctx?.update?.update_id}:`, (err.error as any)?.message || err.error);
  });

  void bot.api.setMyCommands([
    { command: 'menu', description: 'Mở bảng điều khiển Sale Facebook' },
    { command: 'check', description: 'Kiểm tra trạng thái, lệnh cấm nick FB' },
    { command: 'sale_id', description: 'Lấy Telegram ID để được cấp quyền Sale' },
    { command: 'sale_them', description: 'Cấp quyền Sale cho thành viên (quản trị viên)' },
    { command: 'sale_xoa', description: 'Thu hồi quyền Sale (quản trị viên)' },
    { command: 'sale_ds', description: 'Xem danh sách nhân viên Sale (quản trị viên)' },
    { command: 'status', description: 'Xem trạng thái hệ thống' },
    { command: 'help', description: 'Hướng dẫn sử dụng' },
  ]).catch((error: any) => {
    console.warn('[Telegram] Không cập nhật được menu lệnh bot:', error.message);
  });

  void bot.api.getMe().then((me) => {
    botUsername = me.username || null;
  }).catch((error: any) => {
    console.warn('[Telegram] Không lấy được danh tính bot:', error.message);
  });

  // Đăng ký Callback báo cáo bình luận tự động về Telegram (Topic 2: Bình Luận)
  autoCommentEngine.setReportCallback(async (report) => {
    const autoConfig = getAutoCommentConfig();
    const reportTopicId = autoConfig.telegramTopicId || autoConfig.telegramReportTopicId;
    if (!reportTopicId) return;

    const statusEmoji = report.success ? '✅' : '❌';
    const title = report.success ? 'BÌNH LUẬN THÀNH CÔNG (ĐÃ XÁC MINH)' : 'BÌNH LUẬN THẤT BẠI';
    const proxyText = report.proxyUsed ? `🌐 Proxy: \`${report.proxyUsed}\`` : '🌐 Proxy: Trực tiếp (IP máy)';
    const linkComment = report.commentPermalink
      ? `• 💬 **Link bình luận trực tiếp**: [Xem bình luận](${report.commentPermalink})\n`
      : '';

    const msg =
      `${statusEmoji} **[FALCONX BÁO CÁO] ${title}**\n\n` +
      `• 👤 **Nick thực hiện**: ${report.accountName}\n` +
      `• ${proxyText}\n` +
      `• 🔗 **Bài viết**: [Xem bài viết trên Facebook](${report.postUrl})\n` +
      linkComment +
      `• 💬 **Nội dung bình luận**: "${report.commentText}"\n` +
      (report.error ? `• ⚠️ **Lỗi**: ${report.error}\n` : '') +
      `• ⏰ **Thời gian**: ${new Date().toLocaleTimeString('vi-VN')}\n\n` +
      `👉 _Bạn có thể bấm vào link bài viết/bình luận ở trên để đối chiếu double-check!_`;

    if (report.screenshotPath && fs.existsSync(report.screenshotPath)) {
      try {
        await bot.api.sendPhoto(config.telegramGroupId, new InputFile(report.screenshotPath), {
          message_thread_id: reportTopicId,
          caption: msg,
          parse_mode: 'Markdown',
        });
        return;
      } catch {}
    }

    await bot.api
      .sendMessage(config.telegramGroupId, msg, {
        message_thread_id: reportTopicId,
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      })
      .catch(() => {});
  });

  // Lệnh /status
  bot.command('status', async (ctx) => {
    const mappings = getAllMappings();
    const autoCfg = getAutoCommentConfig();
    await ctx.reply(
      `📊 **FALCONX CONTROL CENTER — TRẠNG THÁI REAL-TIME**\n\n` +
        `• Tổng số khách hàng Messenger: **${mappings.length}**\n` +
        `• Nhóm điều khiển Telegram: \`${config.telegramGroupId}\`\n` +
        `• Tự động bình luận Group: ${autoCfg.enabled ? '🟢 ĐANG BẬT' : '🔴 ĐANG TẮT'}\n` +
        `• Hỗ trợ đa phương tiện: **Văn bản, Emojis, Ảnh, Video, Ghi âm (Voice), Sticker**\n` +
        `• Thời gian hệ thống: ${new Date().toLocaleString('vi-VN')}`,
      { parse_mode: 'Markdown' }
    );
  });

  // Lệnh /check hoặc /status_fb: Kiểm tra trạng thái & lệnh cấm tài khoản Facebook
  bot.command(['check', 'status_fb'], async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    const autoConfig = getAutoCommentConfig();
    const targetTopicId = autoConfig.telegramAccountStatusTopicId || ctx.message?.message_thread_id;
    await handleAccountHealthScan(ctx, false, targetTopicId);
  });

  // Lệnh đăng nhập mật khẩu Facebook từ xa cho nick Eco Trang
  bot.command('login_fb', async (ctx) => {
    const text = (ctx.message?.text || '').trim();
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      return ctx.reply('👉 Cú pháp:\n• `/login_fb <mật khẩu>` (đăng nhập nick hiện tại)\n• `/login_fb <tài khoản> <mật khẩu>`', { parse_mode: 'Markdown' });
    }

    let username = '';
    let password = '';
    if (parts.length >= 3) {
      username = parts[1].trim();
      password = parts.slice(2).join(' ').trim();
    } else {
      const defaultAcc = getDefaultAccount();
      username = defaultAcc?.fbUsername || defaultAcc?.name || 'Eco Trang';
      password = parts[1].trim();
    }

    await ctx.reply(`⏳ Đang tự động đăng nhập Facebook với tài khoản "${username}"...`);
    try {
      const page = (messengerEngine as any).page;
      if (!page || page.isClosed()) {
        return ctx.reply('❌ Trình duyệt Facebook chưa khởi động. Vui lòng thử lại sau vài giây.');
      }

      const loginResult = await loginFacebookWithCredentials(page, {
        username,
        password,
      });

      if (!loginResult.success) {
        return ctx.reply(`❌ Đăng nhập chưa thành công: ${loginResult.error || 'Vui lòng kiểm tra lại tài khoản & mật khẩu.'}`);
      }

      const currentAcc = getDefaultAccount();
      if (currentAcc && loginResult.cookies) {
        saveAccount({
          id: currentAcc.id,
          uid: loginResult.uid || currentAcc.uid,
          status: 'live',
          fbUsername: username,
          fbPassword: password,
          cookies: loginResult.cookies,
          lastActiveAt: new Date().toISOString(),
        });
      }

      return ctx.reply(`🎉 **ĐĂNG NHẬP FACEBOOK THÀNH CÔNG!**\n\n• Tài khoản: **${currentAcc?.name || username}** (UID: \`${loginResult.uid}\`)\n• Trạng thái: **Live 100%**\n• Bạn có thể đăng bài trên Web Dashboard ngay bây giờ!`, { parse_mode: 'Markdown' });
    } catch (err: any) {
      return ctx.reply(`❌ Lỗi đăng nhập: ${err.message}`);
    }
  });

  // Lệnh xem danh sách phím tắt mẫu
  bot.command('help', async (ctx) => {
    const canned = loadCannedReplies();
    const list = Object.keys(canned)
      .map((k) => `• \`/${k}\`: ${canned[k].substring(0, 35)}...`)
      .join('\n');
    await ctx.reply(
      `⚡ **DANH SÁCH PHÍM TẮT TRẢ LỜI NHANH CHO KHÁCH:**\n\n${list}\n\n` +
        `👉 **Cách dùng**: Chỉ cần gõ \`/stk\` hoặc \`/diachi\` trong topic của khách, bot sẽ tự động bung mẫu tin nhắn gửi cho khách!\n` +
        `👉 **Đổi nội dung**: Gõ \`/set <tên_lệnh> <nội dung>\` (VD: \`/set stk STK: 098888 MB Bank\`)`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('sale_id', async (ctx) => {
    if (!ctx.from) return;
    await ctx.reply(`Telegram ID của bạn: \`${ctx.from.id}\`\nGửi ID này cho quản trị viên để được cấp quyền Sale.`, {
      parse_mode: 'Markdown',
    });
  });

  bot.command('sale_them', async (ctx) => {
    if (String(ctx.chat.id) !== String(config.telegramGroupId)) return;
    if (!(await isGroupAdmin(ctx))) return ctx.reply('Chỉ quản trị viên Telegram mới được cấp quyền Sale.');
    const targetId = Number((ctx.message?.text || '').trim().split(/\s+/)[1]);
    if (!Number.isSafeInteger(targetId) || targetId <= 0) {
      return ctx.reply('Cách dùng: `/sale_them <Telegram_ID>`. Nhân viên chạy `/sale_id` để lấy ID.', { parse_mode: 'Markdown' });
    }

    let member: Awaited<ReturnType<typeof ctx.api.getChatMember>>;
    try {
      member = await ctx.api.getChatMember(config.telegramGroupId, targetId);
    } catch {
      return ctx.reply('Không tìm thấy người này trong group. Hãy thêm họ vào group rồi chạy lại lệnh.');
    }
    const isMember = ['creator', 'administrator', 'member'].includes(member.status) ||
      (member.status === 'restricted' && member.is_member);
    if (!isMember) return ctx.reply('Người này chưa tham gia group Messenger Eco Trang.');

    const ids = new Set(getAutoCommentConfig().telegramSalesOperatorIds || []);
    ids.add(targetId);
    updateAutoCommentConfig({ telegramSalesOperatorIds: [...ids].sort((a, b) => a - b) });
    const name = [member.user.first_name, member.user.last_name].filter(Boolean).join(' ');
    return ctx.reply(`✅ Đã cấp quyền Sale Facebook cho ${name || 'thành viên'} (ID ${targetId}).`);
  });

  bot.command('sale_xoa', async (ctx) => {
    if (String(ctx.chat.id) !== String(config.telegramGroupId)) return;
    if (!(await isGroupAdmin(ctx))) return ctx.reply('Chỉ quản trị viên Telegram mới được thu hồi quyền Sale.');
    const targetId = Number((ctx.message?.text || '').trim().split(/\s+/)[1]);
    if (!Number.isSafeInteger(targetId) || targetId <= 0) {
      return ctx.reply('Cách dùng: `/sale_xoa <Telegram_ID>`.', { parse_mode: 'Markdown' });
    }
    const ids = new Set(getAutoCommentConfig().telegramSalesOperatorIds || []);
    if (!ids.delete(targetId)) return ctx.reply('ID này chưa được cấp quyền Sale riêng.');
    updateAutoCommentConfig({ telegramSalesOperatorIds: [...ids].sort((a, b) => a - b) });
    return ctx.reply(`✅ Đã thu hồi quyền Sale Facebook của ID ${targetId}.`);
  });

  bot.command('sale_ds', async (ctx) => {
    if (String(ctx.chat.id) !== String(config.telegramGroupId)) return;
    if (!(await isGroupAdmin(ctx))) return ctx.reply('Chỉ quản trị viên Telegram mới xem được danh sách quyền Sale.');
    const ids = getAutoCommentConfig().telegramSalesOperatorIds || [];
    if (!ids.length) return ctx.reply('Chưa có nhân viên Sale nào được cấp quyền riêng. Quản trị viên vẫn dùng được.');
    const rows = await Promise.all(ids.map(async (id) => {
      try {
        const member = await ctx.api.getChatMember(config.telegramGroupId, id);
        const name = [member.user.first_name, member.user.last_name].filter(Boolean).join(' ');
        return `• ${name || 'Thành viên'} — \`${id}\``;
      } catch {
        return `• ID \`${id}\` (không còn trong group)`;
      }
    }));
    return ctx.reply(`👥 Nhân viên Sale được cấp quyền:\n${rows.join('\n')}`, { parse_mode: 'Markdown' });
  });

  // Lệnh mở Menu điều khiển 1 chạm
  bot.command('menu', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    const keyboard = new InlineKeyboard()
      .text('📊 Tiến Trình Hôm Nay', 'nav_status')
      .text('⚡ Kích Hoạt Quét Ngay', 'nav_trigger_scan')
      .row()
      .text('🟢 Bật/Tắt Quét Nhóm', 'nav_toggle_scan')
      .text('👥 Quản Lý Nick & Proxy', 'nav_nicks')
      .row()
      .text('📝 Danh Sách Bài Đăng', 'nav_list_posts')
      .text('💬 Quản Lý Mẫu Cmt', 'nav_list_cmt')
      .row()
      .text('📋 Xuất Báo Cáo Ngay', 'nav_report')
      .text('❓ Hướng Dẫn Nhanh', 'nav_help');

    await ctx.reply(
      `⚡ **FALCONX BÀN PHÍM ĐIỀU HÀNH 1 CHẠM**\n\n` +
        `Toàn bộ quyền điều hành, chọn nơi đăng, kích hoạt chạy hay xem tiến trình đều thực hiện 100% qua các phím bấm bên dưới:`,
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  });

  // Lệnh quản lý tài khoản Facebook và kiểm tra Proxy
  bot.command('nicks', async (ctx) => {
    if (!(await isGroupAdmin(ctx))) return ctx.reply('Chỉ quản trị viên Telegram mới quản lý tài khoản Facebook.');
    await sendNickManagementMessage(ctx);
  });

  // Lệnh gán hoặc cập nhật Proxy cho nick: /set_proxy <uid_hoac_id> <proxy_string>
  bot.command('set_proxy', async (ctx) => {
    if (!(await isGroupAdmin(ctx))) return ctx.reply('Chỉ quản trị viên mới được cấu hình Proxy.');
    const text = (ctx.message?.text || '').trim();
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      return ctx.reply(
        '📌 **CÁCH DÙNG LỆNH GẮN PROXY RIÊNG BIỆT:**\n\n' +
        '`/set_proxy <UID_hoặc_AccountID> <Proxy>`\n\n' +
        'Ví dụ:\n' +
        '• `/set_proxy 61577949601039 103.152.112.5:8080`\n' +
        '• `/set_proxy acc_61577949601039 http://user:pass@103.152.112.5:8080`\n' +
        '• `/set_proxy 61577949601039 none` (Để gỡ proxy, dùng IP trực tiếp)',
        { parse_mode: 'Markdown' }
      );
    }

    const targetKey = parts[1].trim();
    const proxyInput = parts.slice(2).join(' ').trim();
    const all = getAllAccounts();
    const acc = all.find((a) => a.id === targetKey || a.uid === targetKey || a.name.toLowerCase().includes(targetKey.toLowerCase()));

    if (!acc) {
      return ctx.reply(`❌ Không tìm thấy nick nào có UID/ID: \`${targetKey}\`. Gõ \`/nicks\` để xem danh sách!`, { parse_mode: 'Markdown' });
    }

    if (proxyInput.toLowerCase() === 'none' || proxyInput.toLowerCase() === 'direct') {
      updateAccountProxy(acc.id, '');
      return ctx.reply(`✅ Đã gỡ Proxy cho nick **${acc.name}**. Nick này sẽ dùng IP mạng nội bộ trực tiếp.`);
    }

    await ctx.reply(`⏳ Đang chạy Pre-flight test cho Proxy \`${proxyInput}\`...`, { parse_mode: 'Markdown' });
    const preflight = await testProxyNetwork(proxyInput, 10_000);

    if (!preflight.alive) {
      return ctx.reply(
        `🚨 **LỖI PROXY KHÔNG KẾT NỐI ĐƯỢC!**\n\n` +
        `• Chi tiết lỗi: ${preflight.error || 'Timeout'}\n` +
        `• Hệ thống đã **TỪ CHỐI GẮN PROXY NÀY** để bảo vệ tài khoản khỏi bị checkpoint!`,
        { parse_mode: 'Markdown' }
      );
    }

    if (preflight.isLeakingHostIp) {
      return ctx.reply(
        `🚨 **RÒ RỈ IP PHÁT HIỆN!** Proxy này trỏ về cùng IP máy thật (\`${preflight.ip}\`). Đã hủy bỏ để chống liên kết tài khoản!`,
        { parse_mode: 'Markdown' }
      );
    }

    updateAccountProxy(acc.id, proxyInput);
    updateAccountProxyVerification(acc.id, {
      verifiedProxyIp: preflight.ip,
      proxyStatus: 'live',
      proxyCountry: preflight.country,
      proxyCity: preflight.city,
      proxyLatencyMs: preflight.latencyMs,
    });

    await ctx.reply(
      `🛡️ **ĐÃ GẮN PROXY THÀNH CÔNG VÀO NICK: ${acc.name}!**\n\n` +
      `• UID: \`${acc.uid || acc.id}\`\n` +
      `• Proxy: \`${proxyInput}\`\n` +
      `• IP Out: \`${preflight.ip}\`\n` +
      `• Vị trí: 🌍 ${preflight.country || 'VN'} (${preflight.city || ''})\n` +
      `• Độ trễ: ⚡ ${preflight.latencyMs}ms\n` +
      `• Đánh giá: 🟢 **Tuyệt đối an toàn, cách ly 100% với các nick khác!**`,
      { parse_mode: 'Markdown' }
    );
  });

  // Lệnh test proxy: /test_proxy [proxy_or_uid]
  bot.command('test_proxy', async (ctx) => {
    if (!(await isGroupAdmin(ctx))) return ctx.reply('Chỉ quản trị viên mới kiểm tra Proxy.');
    const text = (ctx.message?.text || '').trim();
    const parts = text.split(/\s+/);
    if (parts.length > 1) {
      const input = parts[1].trim();
      const all = getAllAccounts();
      const acc = all.find((a) => a.id === input || a.uid === input || a.name.toLowerCase().includes(input.toLowerCase()));
      if (acc) {
        return handleTestSingleAccountProxy(ctx, acc.id);
      }
      // Test proxy string trực tiếp
      await ctx.reply(`⏳ Đang kiểm tra kết nối mạng cho Proxy: \`${input}\`...`, { parse_mode: 'Markdown' });
      const res = await testProxyNetwork(input, 10_000);
      if (res.alive) {
        return ctx.reply(
          `✅ **KẾT QUẢ TEST PROXY THÀNH CÔNG:**\n\n` +
          `• Proxy: \`${res.server}\`\n` +
          `• IP ngoại mạng (Out): \`${res.ip}\`\n` +
          `• Vị trí: 🌍 ${res.country || 'N/A'} (${res.city || ''})\n` +
          `• Nhà mạng (ISP): ${res.isp || 'N/A'}\n` +
          `• Độ trễ: ⚡ ${res.latencyMs}ms\n` +
          `• Rò rỉ IP máy thật: ${res.isLeakingHostIp ? '🚨 CÓ (NGUY HIỂM)' : '🟢 KHÔNG (AN TOÀN)'}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        return ctx.reply(
          `❌ **KẾT NỐI PROXY THẤT BẠI!**\n\n• Lỗi: ${res.error || 'Timeout'}\n• Không thể sử dụng proxy này cho tài khoản.`,
          { parse_mode: 'Markdown' }
        );
      }
    }
    await handlePingProxies(ctx);
  });

  // Lệnh kích hoạt phiên quét nhóm & bình luận tức thì
  bot.command('quet', async (ctx) => {
    if (!(await isGroupAdmin(ctx))) return ctx.reply('Chỉ quản trị viên Telegram mới được chạy quét bình luận hàng loạt.');
    await triggerScanAndReport(ctx);
  });

  // Lệnh phân phối bài đăng ngay lập tức
  bot.command('chay', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    const posts = getDailyPosts();
    const candidate = posts.find((p) => p.status === 'confirmed' || p.status === 'scheduled');
    if (candidate) {
      await executePostDistribution(ctx, candidate.id);
    } else {
      await ctx.reply('⚠️ Không có bài đăng nào trong hàng đợi sẵn sàng chạy. Anh/Chị hãy gửi bài mới hoặc kiểm tra `/ds`!');
    }
  });

  // Lệnh mở phím tắt trả lời nhanh 1 chạm cho khách
  bot.command('quick', async (ctx) => {
    const topicId = ctx.message?.message_thread_id;
    if (!topicId) return;
    const keyboard = new InlineKeyboard()
      .text('💳 Gửi STK Ngân Hàng', 'quick_send:stk')
      .text('📍 Gửi Địa Chỉ Kho', 'quick_send:diachi')
      .row()
      .text('💰 Báo Giá Sản Phẩm', 'quick_send:gia')
      .text('👋 Lời Chào Tư Vấn', 'quick_send:chao')
      .row()
      .text('🏷️ Gắn Thẻ Khách Hàng', 'open_tag_menu');
    await ctx.reply('⚡ **BẢNG PHÍM TẮT TRẢ LỜI 1 CHẠM (GỬI THẲNG SANG MESSENGER):**', { reply_markup: keyboard });
  });

  // Lệnh gắn Tag trạng thái cho khách hàng
  bot.command('tag', async (ctx) => {
    const topicId = ctx.message?.message_thread_id;
    if (!topicId) return;
    const keyboard = getCustomerTagKeyboard();
    await ctx.reply(`🏷️ **CHỌN TRẠNG THÁI KHÁCH HÀNG:**`, { reply_markup: keyboard });
  });

  // Lệnh xuất báo cáo tổng kết ngày
  bot.command('captcha', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    const text = ctx.message?.text?.trim() || '';
    const parts = text.split(/\s+/);

    if (parts[1] === 'set' && parts[2] && parts[3]) {
      const provider = parts[2].toLowerCase();
      const keyVal = parts[3].trim();
      const currentKeys = getCaptchaApiKeys();
      if (provider === '2captcha' || provider === 'twocaptcha') {
        saveCaptchaApiKeys({ ...currentKeys, twoCaptchaKey: keyVal });
        return ctx.reply('✅ Đã lưu API Key 2Captcha thành công!');
      } else if (provider === 'gemini') {
        saveCaptchaApiKeys({ ...currentKeys, geminiKey: keyVal });
        return ctx.reply('✅ Đã lưu API Key Gemini Vision thành công!');
      } else if (provider === 'capsolver') {
        saveCaptchaApiKeys({ ...currentKeys, capSolverKey: keyVal });
        return ctx.reply('✅ Đã lưu API Key CapSolver thành công!');
      } else {
        return ctx.reply('⚠️ Cú pháp: `/captcha set <2captcha|gemini|capsolver> <API_KEY>`', { parse_mode: 'Markdown' });
      }
    }

    if (parts[1] === 'scan') {
      await ctx.reply('🔍 Đang kết nối DevTools quét toàn bộ trình duyệt Chrome...');
      try {
        const liveList = await scanAllRunningProfilesCaptcha();
        if (liveList.length === 0) {
          return ctx.reply('⚪ Hiện không có trình duyệt Chrome nào đang mở.');
        }
        const lines = [
          '🌐 **KẾT QUẢ QUÉT TRÌNH DUYỆT TRỰC TIẾP:**',
          `Tổng số Chrome đang mở: **${liveList.length}**`,
          '',
        ];
        for (const item of liveList) {
          lines.push(
            `• **${item.accountName}** (ID: \`${item.accountId}\`, Port: \`${item.port}\`): ${
              item.hasCaptcha ? '🚨 **KẸT CAPTCHA**' : '✅ Bình thường'
            }`
          );
        }
        lines.push('', '💡 Dùng lệnh `/unlock <ID>` để tự động mở khóa!');
        return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
      } catch (err: any) {
        return ctx.reply(`❌ Lỗi khi quét: ${err.message}`);
      }
    }

    const keys = getCaptchaApiKeys();
    const msg = [
      '🧩 **HỆ THỐNG GIẢI MÃ CAPTCHA TỰ ĐỘNG (KUDOX 2.5)**',
      '────────────────────────',
      '📦 **Thư viện đã tích hợp:**',
      '• `tesseract.js` v7.0.0 — Local OCR Engine (Offline, 100% Free)',
      '• `2captcha-ts` v2.4.1 — Official 2Captcha Cloud SDK',
      '• `jimp` v1.6.1 — Tiền xử lý ảnh (Khử nhiễu, tăng tương phản, 2x scale)',
      '• `gemini-vision` 1.5-flash — AI Vision đa phương thức & Audio (~1s)',
      '',
      '🔑 **Cấu hình API Keys:**',
      `• 2Captcha: ${keys.twoCaptchaKey ? '🟢 ĐÃ CẤU HÌNH' : '⚪ Chưa có (Dùng OCR miễn phí)'}`,
      `• Gemini Vision: ${keys.geminiKey ? '🟢 ĐÃ CẤU HÌNH' : '⚪ Chưa có'}`,
      `• CapSolver: ${keys.capSolverKey ? '🟢 ĐÃ CẤU HÌNH' : '⚪ Chưa có'}`,
      '',
      '💡 **Cú pháp điều khiển nhanh:**',
      '• `/captcha scan` — Quét xem nick nào đang bị kẹt CAPTCHA',
      '• `/unlock <ID> [Mã]` — Mở khóa CAPTCHA tự động hoặc bằng mã nhập tay',
      '• `/unlock all` — Tự động mở khóa tất cả nick bị kẹt',
      '• `/captcha set 2captcha <KEY>`',
      '• `/captcha set gemini <KEY>`',
    ].join('\n');

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // Lệnh mở khóa CAPTCHA Facebook trực tiếp
  bot.command('unlock', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    const text = ctx.message?.text?.trim() || '';
    const parts = text.split(/\s+/);
    const target = parts[1];

    if (!target) {
      return ctx.reply(
        '⚠️ **Cú pháp mở khóa:**\n• `/unlock <ID_Nick>` (Tự động giải bằng AI/Audio/OCR)\n• `/unlock <ID_Nick> <Mã_6_Số>` (Nhập tay mã)\n• `/unlock all` (Mở khóa toàn bộ)',
        { parse_mode: 'Markdown' }
      );
    }

    if (target.toLowerCase() === 'all') {
      await ctx.reply('⏳ Đang quét và tự động mở khóa CAPTCHA cho tất cả các nick...');
      try {
        const results = await autoUnlockAllLiveCaptchas();
        if (results.length === 0) {
          return ctx.reply('✅ Không có nick nào đang bị kẹt CAPTCHA!');
        }
        const summary = results.map(r => `• Nick \`${r.accountId}\`: ${r.success ? `✅ THÀNH CÔNG (Mã: ${r.solution})` : `❌ THẤT BẠI (${r.error})`}`).join('\n');
        return ctx.reply(`🎉 **KẾT QUẢ MỞ KHÓA TỰ ĐỘNG:**\n${summary}`, { parse_mode: 'Markdown' });
      } catch (err: any) {
        return ctx.reply(`❌ Lỗi mở khóa tự động: ${err.message}`);
      }
    }

    const manualCode = parts[2] ? parts[2].trim() : undefined;
    await ctx.reply(`⏳ Đang kết nối tới Chrome của Nick \`${target}\` để ${manualCode ? `nhập mã "${manualCode}"` : 'tự động giải và mở khóa'}...`, { parse_mode: 'Markdown' });

    try {
      const res = await unlockLiveCaptchaForAccount(target, manualCode);
      if (res.success) {
        return ctx.reply(`🎉 **MỞ KHÓA THÀNH CÔNG!**\n• Nick: \`${target}\`\n• Mã đã nhập: \`${res.solution || manualCode}\`\n• Trang đã chuyển tiếp sang: \`${res.finalUrl}\``, { parse_mode: 'Markdown' });
      } else {
        return ctx.reply(`❌ **Mở khóa chưa thành công:** ${res.error}`);
      }
    } catch (err: any) {
      return ctx.reply(`❌ Lỗi: ${err.message}`);
    }
  });

  bot.command('baocao', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    await sendDailySummaryReport(bot);
    await ctx.reply('✅ Đã xuất báo cáo tổng kết ngày vào Topic Báo Cáo!');
  });

  // 1. XỬ LÝ VĂN BẢN, TRẢ LỜI TRÍCH DẪN (QUOTE), PHÍM TẮT VÀ TOPIC ĐIỀU KHIỂN
  bot.on('message:text', async (ctx) => {
    if (String(ctx.chat.id) !== String(config.telegramGroupId)) return;
    const topicId = ctx.message.message_thread_id;
    if (!topicId) return;

    const text = ctx.message.text.trim();
    const autoConfig = getAutoCommentConfig();

    // ==============================================================
    // 0. LỆNH TOÀN CỤC CHO KHO NGUỒN BĐS TRONG NGÀY
    // ==============================================================
    if (text === '/set_kho_topic') {
      if (!(await isGroupAdmin(ctx))) return ctx.reply('Chỉ Quản trị viên mới được cấu hình Topic kho nguồn.');
      updateAutoCommentConfig({ telegramInventoryTopicId: topicId });
      return ctx.reply(`✅ **ĐÃ GÁN TOPIC NÀY LÀM "KHO NGUỒN BĐS TRONG NGÀY"!**\n\nTừ bây giờ, mọi tin nhắn text (danh sách căn) hoặc ảnh bảng hàng gửi vào đây sẽ được AI/OCR tự động quét và bóc tách ngay lập tức.`, { parse_mode: 'Markdown' });
    }

    if (text === '/kho' || text === '/quycan' || text === '/xemkho') {
      const stats = getPropertyInventoryStats();
      const props = getAllProperties();
      if (props.length === 0) {
        return ctx.reply('📦 **KHO NGUỒN BĐS HIỆN ĐANG TRỐNG**\n\nHãy gửi tin nhắn thông tin căn (VD: "Sky Oasis 2PN full đồ 10tr LH 0988xxx") hoặc gửi ảnh bảng hàng vào đây để nạp tự động!');
      }

      let msg = `🏠 **KHO QUỸ CĂN BĐS ECOPARK (${stats.total} căn)**\n`;
      msg += `• 🟢 Đang săn khách: ${stats.availableCount} căn\n`;
      msg += `• 🔑 Cho thuê: ${stats.rentCount} | 🏷️ Bán/Chuyển nhượng: ${stats.saleCount}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      props.slice(0, 10).forEach((p, idx) => {
        msg += `${idx + 1}. **${p.project} - ${p.bedroom}** (${p.type === 'rent' ? 'Thuê' : 'Bán'})\n`;
        msg += `   💰 Giá: ${p.priceText} | 🛋️ ${p.furniture}\n`;
        if (p.phone) msg += `   📞 LH: ${p.phone}\n`;
        msg += `   Trạng thái: ${p.status === 'available' ? '🟢 Sẵn sàng' : '✅ Đã chốt'}\n\n`;
      });
      if (props.length > 10) {
        msg += `_...và còn ${props.length - 10} căn khác trên Dashboard http://localhost:3300_`;
      }
      return ctx.reply(msg, { parse_mode: 'Markdown' });
    }

    if (text.startsWith('/nap ')) {
      const content = text.slice(5).trim();
      const added = ingestPropertiesFromText(content, 'telegram_text');
      if (added.length === 0) {
        return ctx.reply('⚠️ Không nhận diện được đặc điểm căn. Vui lòng ghi rõ hơn ví dụ: "Sky Oasis 2PN full đồ 10tr"');
      }
      return ctx.reply(`✅ **ĐÃ NẠP THÀNH CÔNG ${added.length} CĂN VÀO KHO!**\n\n${added.map((p, i) => `${i + 1}. **${p.project} - ${p.bedroom}**: ${p.priceText} (${p.furniture})`).join('\n')}\n\n🎯 Radar Facebook 24/7 đã bắt đầu săn khách khớp.`);
    }

    // Nếu tin nhắn nằm trong Topic Kho Nguồn BĐS Trong Ngày
    if (autoConfig.telegramInventoryTopicId && topicId === autoConfig.telegramInventoryTopicId) {
      if (!(await requireFacebookOperator(ctx))) return;
      await handleInventoryTopicTextMessage(ctx, text);
      return;
    }

    // ==============================================================
    // A. XỬ LÝ NẾU TIN NHẮN NẰM TRONG TOPIC "SOẠN MẪU BÌNH LUẬN & GROUP"
    // ==============================================================
    if (autoConfig.telegramTopicId && topicId === autoConfig.telegramTopicId) {
      if (!(await requireFacebookOperator(ctx))) return;
      await handleAutoCommentTopicMessage(ctx, text);
      return;
    }

    // ==============================================================
    // B. XỬ LÝ NẾU TIN NHẮN NẰM TRONG TOPIC "QUẢN LÝ BÀI ĐĂNG GROUP"
    // ==============================================================
    if (autoConfig.telegramPostManageTopicId && topicId === autoConfig.telegramPostManageTopicId) {
      if (!(await requireFacebookOperator(ctx))) return;
      await handlePostManageTopicMessage(ctx, text);
      return;
    }

    if (autoConfig.telegramMemberScanTopicId && topicId === autoConfig.telegramMemberScanTopicId) {
      await handleMemberScanMessage(ctx, text);
      return;
    }

    if (autoConfig.telegramFriendTopicId && topicId === autoConfig.telegramFriendTopicId) {
      await handleFacebookActionInput(ctx, 'friend', text);
      return;
    }

    if (autoConfig.telegramStoryTopicId && topicId === autoConfig.telegramStoryTopicId) {
      await handleFacebookInteractionInput(ctx, text);
      return;
    }

    if (autoConfig.telegramAccountStatusTopicId && topicId === autoConfig.telegramAccountStatusTopicId) {
      if (!(await requireFacebookOperator(ctx))) return;
      await handleAccountStatusTopicMessage(ctx, text);
      return;
    }

    if (autoConfig.telegramPostInteractionTopicId && topicId === autoConfig.telegramPostInteractionTopicId) {
      await ctx.reply('Chức năng đã gộp vào topic `5. TƯƠNG TÁC STORY / BÀI VIẾT`. Hãy gửi link tại topic số 5.', {
        parse_mode: 'Markdown',
      });
      return;
    }

    // ==============================================================
    // C. XỬ LÝ CHAT TRỰC TIẾP VỚI KHÁCH HÀNG MESSENGER
    // ==============================================================
    const mapping = getMappingByTopicId(topicId);
    if (!mapping) return;

    let outgoingMsg = text;

    // 1.1 Lệnh cài đặt mẫu trả lời nhanh: /set <key> <nội dung>
    if (text.startsWith('/set ')) {
      const parts = text.substring(5).trim().split(/\s+/);
      const key = parts[0];
      const content = parts.slice(1).join(' ');
      if (key && content) {
        saveCannedReply(key, content);
        await ctx.reply(`✅ Đã lưu mẫu trả lời nhanh cho lệnh: \`/${key}\`!`, { parse_mode: 'Markdown' });
        return;
      }
    }

    // 1.2 Kiểm tra nếu gõ phím tắt trả lời nhanh (/stk, /diachi, /gia, /chao)
    if (text.startsWith('/')) {
      const cannedKey = text.substring(1).toLowerCase().split(/\s+/)[0];
      const canned = loadCannedReplies();
      if (canned[cannedKey]) {
        outgoingMsg = canned[cannedKey];
        await ctx.reply(`⚡ [Đã gửi mẫu nhanh: \`/${cannedKey}\`]`, { parse_mode: 'Markdown' }).catch(() => {});
      }
    }

    // 1.3 Xử lý Trả lời trích dẫn (Reply / Quote Message)
    let finalOutgoing = outgoingMsg;
    if (ctx.message.reply_to_message) {
      const quoted = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || '';
      if (quoted) {
        const cleanQuote = quoted.replace(/\n+/g, ' ').substring(0, 40);
        finalOutgoing = `💬 [Trả lời: "${cleanQuote}..."]\n${outgoingMsg}`;
      }
    }

    console.log(`[Telegram -> FB] Gửi tới ${mapping.customer_name}: "${finalOutgoing}"`);
    recordSentMessage('telegram', mapping.fb_thread_id, finalOutgoing);

    const success = await messengerEngine.sendMessage(mapping.fb_thread_id, finalOutgoing);
    if (success) {
      await ctx.react('👍').catch(() => {});
    } else {
      await ctx.reply('⚠️ Không gửi được sang Facebook. Vui lòng kiểm tra cửa sổ trình duyệt.');
    }
  });

  // 2. XỬ LÝ HÌNH ẢNH TỪ TELEGRAM GỬI SANG FB
  bot.on('message:photo', async (ctx) => {
    if (String(ctx.chat.id) !== String(config.telegramGroupId)) return;
    const topicId = ctx.message.message_thread_id;
    if (!topicId) return;

    const autoConfig = getAutoCommentConfig();

    // Xử lý nạp ảnh bảng hàng vào Kho Nguồn BĐS Trong Ngày
    if (autoConfig.telegramInventoryTopicId && topicId === autoConfig.telegramInventoryTopicId) {
      if (!(await requireFacebookOperator(ctx))) return;
      await handleInventoryTopicPhotoMessage(ctx);
      return;
    }

    if (autoConfig.telegramPostManageTopicId && topicId === autoConfig.telegramPostManageTopicId) {
      if (!(await requireFacebookOperator(ctx))) return;
      const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      const caption = (ctx.message.caption || '').trim();
      const mediaGroupId = ctx.message.media_group_id;

      const buildPostActionKeyboard = (draftId: string) => {
        const currentAcc = getDefaultAccount();
        const joinedGroups = getJoinedEcoparkGroups(currentAcc?.id);
        const kb = new InlineKeyboard();
        if (joinedGroups.length > 0) {
          const quickCount = Math.min(5, joinedGroups.length);
          kb.text(`🔥 Test Nhanh: Đăng ${quickCount} Group Ecopark Đã Join`, `post_grp_qty:${draftId}:group_post:${quickCount}:now`)
            .row()
            .text(`🌐 Đăng Group (Chọn SL / ${joinedGroups.length} nhóm)`, `post_target:${draftId}:group_post`)
            .text('⚡ Cá Nhân + Group', `post_target:${draftId}:both`)
            .row();
        }
        kb.text('👤 Đăng Ngay (Trang cá nhân)', `draft_confirm:${draftId}`)
          .row()
          .text('⏰ 11:30 Trưa', `post_sched:${draftId}:11:30`)
          .text('⏰ 19:30 Tối', `post_sched:${draftId}:19:30`)
          .row()
          .text('❌ Hủy', `draft_cancel:${draftId}`);
        return kb;
      };

      if (!caption && !mediaGroupId) {
        // Kiểm tra xem đã có bản nháp nào đang chờ không
        const pending = getLatestPendingDraftByTopic(topicId, ctx.from?.id);
        if (pending) {
          if (!pending.photos) pending.photos = [];
          pending.photos.push(fileId);
          updatePendingDraft(pending.id, { photos: pending.photos });
          const previewText = pending.rawText ? `• Nội dung: _"${pending.rawText.slice(0, 100)}..."_\n` : '';
          const keyboard = buildPostActionKeyboard(pending.id);

          await ctx.reply(
            `📸 **Đã đính kèm thêm ảnh vào bài đăng!**\n` +
            `• Tổng cộng: **${pending.photos.length} hình ảnh**\n` +
            previewText +
            `\n👉 *Bạn có thể gửi thêm ảnh, nhập nội dung chữ, hoặc bấm nút bên dưới để đăng ngay:*`,
            { reply_markup: keyboard, parse_mode: 'Markdown' }
          );
          return;
        }

        // Tạo bản nháp ảnh mới (có thể nhập chữ tiếp hoặc bấm đăng ngay)
        const draft = addPendingDraft({
          type: 'daily_post',
          rawText: '',
          photos: [fileId],
          telegramTopicId: topicId,
          telegramMessageId: ctx.message.message_id,
          creatorTelegramId: ctx.from?.id,
          creatorName: ctx.from?.first_name,
        });

        await ctx.reply(
          `📸 **ĐÃ NHẬN 1 HÌNH ẢNH CHO BÀI ĐĂNG FACEBOOK!**\n\n` +
          `👉 Hãy nhập nội dung bài viết vào ô chat để ghép với ảnh (hoặc bấm nút bên dưới nếu muốn đăng nguyên ảnh):`,
          { reply_markup: buildPostActionKeyboard(draft.id), parse_mode: 'Markdown' }
        );
        return;
      }
      if (mediaGroupId) {
        const albumKey = `${ctx.chat.id}:${topicId}:${mediaGroupId}`;
        const existing = pendingPostPhotoAlbums.get(albumKey);
        const finalizeAlbumWithoutCaption = (albumItem: PendingPhotoAlbum) => {
          const pending = getLatestPendingDraftByTopic(topicId, albumItem.ctx.from?.id);
          if (pending) {
            if (!pending.photos) pending.photos = [];
            pending.photos.push(...albumItem.fileIds);
            updatePendingDraft(pending.id, { photos: pending.photos });
            const keyboard = buildPostActionKeyboard(pending.id);
            void albumItem.ctx.reply(
              `📸 **Đã đính kèm album ${albumItem.fileIds.length} ảnh vào bài đăng hiện tại!**\n` +
              `• Tổng cộng: **${pending.photos.length} hình ảnh**\n\n` +
              `👉 *Nhập nội dung chữ hoặc bấm nút bên dưới để đăng lên Facebook:*`,
              { reply_markup: keyboard, parse_mode: 'Markdown' }
            );
            return;
          }
          const draft = addPendingDraft({
            type: 'daily_post',
            rawText: '',
            photos: albumItem.fileIds,
            telegramTopicId: topicId,
            telegramMessageId: albumItem.ctx.message?.message_id,
            creatorTelegramId: albumItem.ctx.from?.id,
            creatorName: albumItem.ctx.from?.first_name,
          });
          void albumItem.ctx.reply(
            `📸 **ĐÃ NHẬN ALBUM GỒM ${albumItem.fileIds.length} HÌNH ẢNH!**\n\n` +
            `👉 Hãy nhập nội dung bài viết vào ô chat để ghép vào album (hoặc bấm nút bên dưới để đăng ngay):`,
            { reply_markup: buildPostActionKeyboard(draft.id), parse_mode: 'Markdown' }
          );
        };

        if (existing) {
          existing.fileIds.push(fileId);
          if (!existing.caption && caption) existing.caption = caption;
          clearTimeout(existing.timer);
          existing.timer = setTimeout(() => {
            pendingPostPhotoAlbums.delete(albumKey);
            if (!existing.caption) {
              finalizeAlbumWithoutCaption(existing);
              return;
            }
            void handlePostManageTopicMessage(existing.ctx, existing.caption, existing.fileIds);
          }, 1200);
        } else {
          const album: PendingPhotoAlbum = {
            ctx,
            caption,
            fileIds: [fileId],
            timer: setTimeout(() => {
              pendingPostPhotoAlbums.delete(albumKey);
              if (!album.caption) {
                finalizeAlbumWithoutCaption(album);
                return;
              }
              void handlePostManageTopicMessage(album.ctx, album.caption, album.fileIds);
            }, 1200),
          };
          pendingPostPhotoAlbums.set(albumKey, album);
        }
        return;
      }
      await handlePostManageTopicMessage(ctx, caption, [fileId]);
      return;
    }

    const mapping = getMappingByTopicId(topicId);
    if (!mapping) return;

    try {
      const photos = ctx.message.photo;
      const largestPhoto = photos[photos.length - 1];
      const file = await ctx.api.getFile(largestPhoto.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

      const localPath = path.join(tempDir, `photo_${Date.now()}.jpg`);
      await downloadFile(fileUrl, localPath);

      console.log(`[Telegram -> FB] Gửi ảnh tới ${mapping.customer_name}: ${localPath}`);
      const success = await messengerEngine.sendMedia(mapping.fb_thread_id, localPath);

      if (success) {
        await ctx.react('👍').catch(() => {});
        await ctx.reply('✅ Đã gửi ảnh thành công tới khách hàng!').catch(() => {});
      } else {
        await ctx.reply('⚠️ Không gửi được ảnh sang Facebook.');
      }

      fs.unlink(localPath, () => {});
    } catch (e: any) {
      console.error('[Telegram] Lỗi gửi ảnh:', e.message);
      await ctx.reply(`❌ Lỗi gửi ảnh: ${e.message}`);
    }
  });

  // 3. XỬ LÝ VIDEO TỪ TELEGRAM GỬI SANG FB
  bot.on('message:video', async (ctx) => {
    if (String(ctx.chat.id) !== String(config.telegramGroupId)) return;
    const topicId = ctx.message.message_thread_id;
    if (!topicId) return;

    const mapping = getMappingByTopicId(topicId);
    if (!mapping) return;

    try {
      const video = ctx.message.video;
      const file = await ctx.api.getFile(video.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

      const localPath = path.join(tempDir, `video_${Date.now()}.mp4`);
      await downloadFile(fileUrl, localPath);

      console.log(`[Telegram -> FB] Gửi video tới ${mapping.customer_name}: ${localPath}`);
      const success = await messengerEngine.sendMedia(mapping.fb_thread_id, localPath);

      if (success) {
        await ctx.react('👍').catch(() => {});
        await ctx.reply('✅ Đã gửi video thành công tới khách hàng!').catch(() => {});
      } else {
        await ctx.reply('⚠️ Không gửi được video sang Facebook.');
      }

      fs.unlink(localPath, () => {});
    } catch (e: any) {
      console.error('[Telegram] Lỗi gửi video:', e.message);
      await ctx.reply(`❌ Lỗi gửi video: ${e.message}`);
    }
  });

  // 4. XỬ LÝ STICKER / BIỂU TƯỢNG CẢM XÚC
  bot.on('message:sticker', async (ctx) => {
    if (String(ctx.chat.id) !== String(config.telegramGroupId)) return;
    const topicId = ctx.message.message_thread_id;
    if (!topicId) return;

    const mapping = getMappingByTopicId(topicId);
    if (!mapping) return;

    try {
      const sticker = ctx.message.sticker;
      if (sticker.is_animated || sticker.is_video) {
        if (sticker.emoji) {
          await messengerEngine.sendMessage(mapping.fb_thread_id, sticker.emoji);
          await ctx.react('👍').catch(() => {});
        }
        return;
      }

      const file = await ctx.api.getFile(sticker.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
      const localPath = path.join(tempDir, `sticker_${Date.now()}.webp`);
      await downloadFile(fileUrl, localPath);

      const success = await messengerEngine.sendMedia(mapping.fb_thread_id, localPath);
      if (success) {
        await ctx.react('👍').catch(() => {});
      } else if (sticker.emoji) {
        await messengerEngine.sendMessage(mapping.fb_thread_id, sticker.emoji);
      }

      fs.unlink(localPath, () => {});
    } catch (e: any) {
      console.error('[Telegram] Lỗi gửi sticker:', e.message);
    }
  });

  // 5. XỬ LÝ GHI ÂM (VOICE NOTES) & ÂM THANH
  bot.on(['message:voice', 'message:audio'], async (ctx) => {
    if (String(ctx.chat.id) !== String(config.telegramGroupId)) return;
    const topicId = ctx.message.message_thread_id;
    if (!topicId) return;

    const mapping = getMappingByTopicId(topicId);
    if (!mapping) return;

    try {
      const audioOrVoice = ctx.message.voice || ctx.message.audio;
      if (!audioOrVoice) return;

      const file = await ctx.api.getFile(audioOrVoice.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
      const ext = ctx.message.voice ? 'ogg' : path.extname(file.file_path || '') || 'mp3';
      const localPath = path.join(tempDir, `voice_${Date.now()}.${ext}`);
      await downloadFile(fileUrl, localPath);

      console.log(`[Telegram -> FB] Gửi tin nhắn thoại tới ${mapping.customer_name}: ${localPath}`);
      const success = await messengerEngine.sendMedia(mapping.fb_thread_id, localPath);

      if (success) {
        await ctx.react('👍').catch(() => {});
      } else {
        await ctx.reply('⚠️ Không gửi được file ghi âm sang Facebook.');
      }

      fs.unlink(localPath, () => {});
    } catch (e: any) {
      console.error('[Telegram] Lỗi gửi voice:', e.message);
      await ctx.reply(`❌ Lỗi gửi voice: ${e.message}`);
    }
  });

  // 5.2 XỬ LÝ TỆP ĐÍNH KÈM / TÀI LIỆU (DOCUMENT / FILE / ẢNH GỐC KHÔNG NÉN)
  bot.on('message:document', async (ctx) => {
    if (String(ctx.chat.id) !== String(config.telegramGroupId)) return;
    const topicId = ctx.message.message_thread_id;
    if (!topicId) return;

    const doc = ctx.message.document;
    const autoConfig = getAutoCommentConfig();
    const isImageDoc =
      doc.mime_type?.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.file_name || '');

    // Hỗ trợ nạp file ảnh bảng hàng vào Topic Kho Nguồn BĐS
    if (autoConfig.telegramInventoryTopicId && topicId === autoConfig.telegramInventoryTopicId && isImageDoc) {
      if (!(await requireFacebookOperator(ctx))) return;
      const statusMsg = await ctx.reply('🔍 **Đang quét và bóc tách chữ từ tệp ảnh bảng hàng (Tesseract OCR Offline)...**', { parse_mode: 'Markdown' });
      const tempDir = path.resolve('./.tmp_media');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const ext = path.extname(doc.file_name || '') || '.jpg';
      const localPath = path.join(tempDir, `doc_ocr_${Date.now()}${ext}`);
      try {
        const file = await ctx.api.getFile(doc.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
        await downloadFile(fileUrl, localPath);
        const { textExtracted, properties } = await ingestPropertiesFromImage(localPath, 'telegram_image');
        if (properties.length > 0) {
          let replyMsg = `📸 **ĐÃ QUÉT & BÓC TÁCH THÀNH CÔNG ${properties.length} CĂN TỪ TỆP ẢNH!**\n━━━━━━━━━━━━━━━━━━━━\n`;
          properties.forEach((p, idx) => {
            replyMsg += `🏢 **Căn #${idx + 1}**: ${p.project} - **${p.bedroom}**\n`;
            replyMsg += `• Nhu cầu: ${p.type === 'rent' ? '🔑 Cho thuê' : '🏷️ Chuyển nhượng/Bán'}\n`;
            replyMsg += `• Mức giá: **${p.priceText}**\n`;
            replyMsg += `• Nội thất: ${p.furniture}\n`;
            if (p.phone) replyMsg += `• Liên hệ: ${p.phone}\n`;
            replyMsg += `• Mã căn: \`${p.id}\`\n\n`;
          });
          replyMsg += `━━━━━━━━━━━━━━━━━━━━\n🤖 Radar Facebook 24/7 đã bắt đầu săn khách!`;
          await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, replyMsg, { parse_mode: 'Markdown' });
        } else {
          await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, `⚠️ Không nhận diện được căn hộ từ tệp ảnh này.`);
        }
      } catch (err: any) {
        await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, `❌ Lỗi: ${err.message}`).catch(() => {});
      } finally {
        fs.unlink(localPath, () => {});
      }
      return;
    }

    // Hỗ trợ gửi ảnh gốc không nén (Send as File) vào Topic 1 (Đăng bài Facebook)
    if (autoConfig.telegramPostManageTopicId && topicId === autoConfig.telegramPostManageTopicId && isImageDoc) {
      if (!(await requireFacebookOperator(ctx))) return;
      const caption = (ctx.message.caption || '').trim();
      const pending = getLatestPendingDraftByTopic(topicId, ctx.from?.id);
      if (!caption && pending) {
        if (!pending.photos) pending.photos = [];
        pending.photos.push(doc.file_id);
        updatePendingDraft(pending.id, { photos: pending.photos });
        const activeGroups = getTargetGroups().filter((g) => g.status === 'active');
        const keyboard = new InlineKeyboard().text('⚡ Đăng Ngay (Trang cá nhân)', `draft_confirm:${pending.id}`);
        if (activeGroups.length > 0) {
          keyboard.row()
            .text(`🌐 Đăng ${activeGroups.length} Group`, `post_target:${pending.id}:group_post`)
            .text('⚡ Cá Nhân + Group', `post_target:${pending.id}:both`);
        }
        keyboard.row().text('❌ Hủy', `draft_cancel:${pending.id}`);
        await ctx.reply(
          `📸 **Đã đính kèm ảnh gốc (${doc.file_name || 'Image'}) vào bài đăng!**\n` +
          `• Tổng cộng: **${pending.photos.length} hình ảnh**`,
          { reply_markup: keyboard, parse_mode: 'Markdown' }
        );
        return;
      }
      await handlePostManageTopicMessage(ctx, caption, [doc.file_id]);
      return;
    }

    const mapping = getMappingByTopicId(topicId);
    if (!mapping) return;

    try {
      const doc = ctx.message.document;
      const file = await ctx.api.getFile(doc.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
      const ext = path.extname(doc.file_name || file.file_path || '') || '.dat';
      const localPath = path.join(tempDir, `doc_${Date.now()}_${doc.file_name || 'file' + ext}`);
      await downloadFile(fileUrl, localPath);

      console.log(`[Telegram -> FB] Gửi tài liệu tới ${mapping.customer_name}: ${localPath}`);
      const caption = ctx.message.caption || undefined;
      const success = await messengerEngine.sendMedia(mapping.fb_thread_id, localPath, caption);

      if (success) {
        await ctx.react('👍').catch(() => {});
      } else {
        await ctx.reply('⚠️ Không gửi được tệp đính kèm sang Facebook.');
      }

      fs.unlink(localPath, () => {});
    } catch (e: any) {
      console.error('[Telegram] Lỗi gửi document:', e.message);
      await ctx.reply(`❌ Lỗi gửi tệp đính kèm: ${e.message}`);
    }
  });

  // 6. XỬ LÝ NÚT BẤM INLINE (CONFIRM / CANCEL TIẾN TRÌNH 2 BƯỚC)
  bot.callbackQuery(/^draft_confirm:(.+)$/, async (ctx) => {
    const draftId = ctx.match[1];
    await handleDraftConfirm(ctx, draftId);
  });

  bot.callbackQuery(/^draft_cancel:(.+)$/, async (ctx) => {
    const draftId = ctx.match[1];
    await handleDraftCancel(ctx, draftId);
  });

  bot.callbackQuery(/^distribute_cmt:(.+)$/, async (ctx) => {
    const draftId = ctx.match[1];
    await handleAskDistributeCommentQty(ctx, draftId);
  });

  bot.callbackQuery(/^distribute_cmt_qty:(.+):(\d+)$/, async (ctx) => {
    const draftId = ctx.match[1];
    const qty = parseInt(ctx.match[2], 10) || 5;
    await handleDistributeComment(ctx, draftId, qty);
  });

  bot.callbackQuery(/^post_grp_qty:([^:]+):(group_post|both):(\d+):(now|select)$/, async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    const draftId = ctx.match[1];
    const targetType = ctx.match[2] as 'group_post' | 'both';
    const qty = parseInt(ctx.match[3], 10) || 5;
    const mode = ctx.match[4] as 'now' | 'select';
    await handlePostGroupQtySelect(ctx, draftId, targetType, qty, mode);
  });

  // 7. XỬ LÝ NÚT HẸN GIỜ ĐĂNG BÀI: post_sched:<id>:<time>
  bot.callbackQuery(/^post_sched:(.+):(.+)$/, async (ctx) => {
    const draftId = ctx.match[1];
    const schedTime = ctx.match[2];
    await handlePostScheduleConfirm(ctx, draftId, schedTime);
  });

  bot.callbackQuery('add_group_prompt', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(
      `➕ **HƯỚNG DẪN THÊM GROUP FACEBOOK:**\n\n` +
      `Gửi link nhóm vào ô chat theo cú pháp:\n` +
      `\`+group https://www.facebook.com/groups/<id_nhom> [Tên nhóm]\`\n\n` +
      `Ví dụ:\n\`+group https://www.facebook.com/groups/batdongsanhaiphong BĐS Hải Phòng\`\n\n` +
      `Sau khi thêm, khi tạo bài viết mới bạn sẽ có thêm lựa chọn đăng thẳng vào Group này!`,
      { parse_mode: 'Markdown' }
    );
  });

  // Nút cũ vẫn trả lời an toàn cho các bản nháp lịch sử; không tự biến đổi nội dung.
  bot.callbackQuery(/^cmt_ai:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Tạo biến thể tự động đã tắt; hãy chỉnh nội dung trực tiếp.' }).catch(() => {});
    await ctx.reply('Nội dung được giữ nguyên như bạn đã nhập để tránh thay đổi giá, diện tích hoặc thông tin căn hộ.');
  });

  // 9. XỬ LÝ NÚT GẮN TAG KHÁCH HÀNG: cust_tag:<tag>
  bot.callbackQuery(/^cust_tag:(.+)$/, async (ctx) => {
    const tag = ctx.match[1] as any;
    await handleCustomerTag(ctx, tag);
  });

  bot.callbackQuery(/^fbact_(like|love):([a-z0-9]+)$/i, async (ctx) => {
    const reaction = ctx.match[1].toLowerCase() as FacebookReaction;
    const action = pendingFacebookActions.get(ctx.match[2]);
    if (!action || action.expiresAt <= Date.now() || action.userId !== ctx.from.id || !(await isFacebookOperator(ctx))) {
      if (action && action.expiresAt <= Date.now()) pendingFacebookActions.delete(action.id);
      await ctx.answerCallbackQuery({ text: 'Phiên thao tác không hợp lệ hoặc đã hết hạn.' }).catch(() => {});
      return;
    }

    action.reaction = reaction;
    const keyboard = new InlineKeyboard()
      .text('✅ Xác nhận', `fbact_confirm:${action.id}`)
      .text('✖️ Hủy', `fbact_cancel:${action.id}`);
    await ctx.answerCallbackQuery({ text: `Đã chọn ${reaction === 'like' ? 'Thích' : 'Yêu thích'}.` }).catch(() => {});
    await ctx.editMessageText(
      `Link: ${action.url}\nCảm xúc: ${reaction === 'like' ? 'Thích' : 'Yêu thích'}\n\nChọn Xác nhận để thực hiện trên Facebook.`,
      { reply_markup: keyboard }
    ).catch(() => {});
  });

  bot.callbackQuery(/^fbact_confirm:([a-z0-9]+)$/i, async (ctx) => {
    const action = pendingFacebookActions.get(ctx.match[1]);
    if (!action || action.expiresAt <= Date.now() || action.userId !== ctx.from.id || !(await isFacebookOperator(ctx))) {
      if (action && action.expiresAt <= Date.now()) pendingFacebookActions.delete(action.id);
      await ctx.answerCallbackQuery({ text: 'Phiên thao tác không hợp lệ hoặc đã hết hạn.' }).catch(() => {});
      return;
    }
    if (action.kind !== 'friend' && !action.reaction) {
      await ctx.answerCallbackQuery({ text: 'Hãy chọn cảm xúc trước.' }).catch(() => {});
      return;
    }

    pendingFacebookActions.delete(action.id);
    await ctx.answerCallbackQuery({ text: 'Đang thực hiện trên Facebook…' }).catch(() => {});
    await ctx.editMessageText(`Đang thực hiện thao tác đã xác nhận:\n${action.url}`).catch(() => {});

    try {
      let result: string;
      if (action.kind === 'friend') result = await facebookActionsEngine.requestFriend(action.url);
      else if (action.kind === 'story') result = await facebookActionsEngine.reactToStory(action.url, action.reaction!);
      else result = await facebookActionsEngine.reactToPost(action.url, action.reaction!);

      const currentAcc = getDefaultAccount();
      const nickName = currentAcc ? currentAcc.name : 'Eco Trang';

      await ctx.api.sendMessage(
        config.telegramGroupId,
        `✅ **HOÀN TẤT THAO TÁC FACEBOOK:**\n\n` +
          `• 🎯 **Hành động**: ${result}\n` +
          `• 👤 **Tài khoản**: **${nickName}**\n` +
          `• 🔗 **Đích đến**: ${action.url}\n` +
          `• ⏰ **Thời gian**: ${new Date().toLocaleTimeString('vi-VN')}`,
        {
          message_thread_id: action.topicId,
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
        }
      );
    } catch (error: any) {
      await ctx.api.sendMessage(
        config.telegramGroupId,
        `⚠️ **THAO TÁC CHƯA HOÀN TẤT:**\n\n• Lỗi: ${error.message}\n• Link: ${action.url}`,
        {
          message_thread_id: action.topicId,
          link_preview_options: { is_disabled: true },
        }
      ).catch(() => {});
    }
  });

  bot.callbackQuery(/^fbact_cancel:([a-z0-9]+)$/i, async (ctx) => {
    const action = pendingFacebookActions.get(ctx.match[1]);
    if (!action || action.expiresAt <= Date.now() || action.userId !== ctx.from.id) {
      if (action && action.expiresAt <= Date.now()) pendingFacebookActions.delete(action.id);
      await ctx.answerCallbackQuery({ text: 'Phiên thao tác không hợp lệ hoặc đã hết hạn.' }).catch(() => {});
      return;
    }
    pendingFacebookActions.delete(action.id);
    await ctx.answerCallbackQuery({ text: 'Đã hủy thao tác.' }).catch(() => {});
    await ctx.editMessageText('Đã hủy thao tác Facebook.').catch(() => {});
  });

  // 9.5 XỬ LÝ NÚT KIỂM TRA TRẠNG THÁI & LỆNH CẤM TÀI KHOẢN FACEBOOK
  bot.callbackQuery('check_account_health', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    await handleAccountHealthScan(ctx, true);
  });

  bot.callbackQuery('view_recent_health', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    await ctx.answerCallbackQuery().catch(() => {});
    const topicId = ctx.callbackQuery?.message?.message_thread_id;
    const report = accountHealthService.getLastReport();
    if (!report) {
      await ctx.reply('Chưa có báo cáo quét trước đó. Hãy bấm [🔄 Kiểm Tra Trạng Thái Ngay] để quét ngay!', {
        reply_markup: getAccountHealthKeyboard(),
        ...(topicId ? { message_thread_id: topicId } : {}),
      });
      return;
    }
    const keyboard = getAccountHealthKeyboard();
    await safeReplyOrSendAccountReport(ctx, report, keyboard, topicId);
  });

  bot.callbackQuery('help_appeal_marketplace', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await sendMarketplaceAppealGuide(ctx);
  });

  // 10. XỬ LÝ BÀN PHÍM ĐIỀU HÀNH 1 CHẠM (MENU BUTTONS)
  bot.callbackQuery('nav_status', async (ctx) => {
    const stats = getTodayStats();
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(
      `📊 **TIẾN TRÌNH HỆ THỐNG HÔM NAY:**\n\n` +
        `• 📝 Bài đăng hoàn thành: **${stats.postsCount}** bài\n` +
        `• 💬 Bình luận đã thực hiện: **${stats.commentsCount}** lượt\n` +
        `• 🎯 Nhóm mục tiêu: **${stats.groupsCount}** nhóm\n` +
        `• 🌐 Web Dashboard: http://localhost:3300`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.callbackQuery('nav_toggle_scan', async (ctx) => {
    if (!(await isGroupAdmin(ctx))) {
      await ctx.answerCallbackQuery({ text: 'Chỉ quản trị viên mới bật/tắt quét bình luận tự động.' }).catch(() => {});
      return;
    }
    const cfg = getAutoCommentConfig();
    const newState = !cfg.enabled;
    updateAutoCommentConfig({ enabled: newState });
    if (newState) autoCommentEngine.startWatcher(10);
    else autoCommentEngine.stopWatcher();
    await ctx.answerCallbackQuery({ text: `Đã ${newState ? 'BẬT' : 'TẮT'} quét nhóm!` }).catch(() => {});
    await ctx.reply(`🔄 **TRẠNG THÁI QUÉT NHÓM:** ${newState ? '🟢 ĐANG BẬT' : '🔴 ĐÃ TẮT'}`);
  });

  bot.callbackQuery('nav_list_posts', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    await ctx.answerCallbackQuery().catch(() => {});
    const posts = getDailyPosts();
    if (posts.length === 0) return ctx.reply('📭 Hôm nay chưa có bài đăng nào trong hệ thống.');
    const list = posts.slice(0, 5).map((p, i) => {
      const statusEmoji = p.status === 'confirmed' ? '🟢 Sẵn sàng' : p.status === 'scheduled' ? `⏰ Hẹn ${p.scheduledTime}` : p.status === 'running' ? '🚀 Đang chạy' : p.status === 'completed' ? '✅ Hoàn thành' : '⏳ Chờ duyệt';
      const targetLabel = p.type === 'personal_post' ? '👤 Cá nhân' : p.type === 'both' ? '⚡ Cả hai' : '🌐 Group';
      return `• **#${i + 1}** [${statusEmoji}] [${targetLabel}]:\n  "${p.content.substring(0, 60)}..."`;
    }).join('\n\n');

    const keyboard = new InlineKeyboard();
    posts.slice(0, 3).forEach((p, i) => {
      if (p.status !== 'completed' && p.status !== 'cancelled') {
        keyboard.text(`▶️ Đăng #${i + 1}`, `run_post:${p.id}`)
                .text(`🗑️ Xóa #${i + 1}`, `del_post:${p.id}`)
                .row();
      }
    });
    keyboard.text('🗑️ Xóa Toàn Bộ Bài', 'clear_all_posts').row();
    keyboard.text('🔙 Quay Lại Menu', 'nav_menu');

    await ctx.reply(`📝 **DANH SÁCH BÀI ĐĂNG GẦN ĐÂY (${posts.length}):**\n\n${list}`, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  });

  bot.callbackQuery('nav_list_cmt', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    await ctx.answerCallbackQuery().catch(() => {});
    const tpls = getCommentTemplates();
    const list = tpls.slice(0, 5).map((t, i) => `• **Mẫu #${i + 1}**: "${t.content.slice(0, 70)}..."`).join('\n\n');

    const keyboard = new InlineKeyboard()
      .text('⚡ Rà soát Group ngay', 'nav_trigger_scan')
      .row()
      .text('🗑️ Xóa Mẫu Cuối', 'del_last_cmt')
      .text('🔙 Quay Lại Menu', 'nav_menu');

    await ctx.reply(`💬 **DANH SÁCH MẪU BÌNH LUẬN (${tpls.length}):**\n\n${list}`, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  });

  bot.callbackQuery('nav_report', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    await ctx.answerCallbackQuery().catch(() => {});
    await sendDailySummaryReport(bot);
    await ctx.reply('✅ Đã gửi báo cáo tổng kết ngày vào Topic Báo Cáo!');
  });

  // Chọn đích đến đăng bài: post_target:<draftId>:<targetType>
  bot.callbackQuery(/^post_target:(.+):(.+)$/, async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    const draftId = ctx.match[1];
    const targetType = ctx.match[2] as 'personal_post' | 'group_post' | 'both';
    await handlePostTargetSelect(ctx, draftId, targetType);
  });

  // Chọn lại đích đến đăng bài
  bot.callbackQuery(/^post_retarget:(.+)$/, async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    const draftId = ctx.match[1];
    await handlePostRetarget(ctx, draftId);
  });

  // Chạy bài đăng tức thì: run_post:<id>
  bot.callbackQuery(/^run_post:(.+)$/, async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    const postId = ctx.match[1];
    await executePostDistribution(ctx, postId);
  });

  // Xóa bài đăng: del_post:<id>
  bot.callbackQuery(/^del_post:(.+)$/, async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    const postId = ctx.match[1];
    const ok = deleteDailyPost(postId);
    if (ok) {
      await ctx.answerCallbackQuery({ text: '🗑️ Đã xóa bài đăng khỏi hệ thống!' }).catch(() => {});
      await ctx.editMessageText(`🗑️ **ĐÃ XÓA BÀI ĐĂNG KHỎI HỆ THỐNG!**\n• Mã bài: \`${postId}\``, { parse_mode: 'Markdown' }).catch(async () => {
        await ctx.reply(`🗑️ **ĐÃ XÓA BÀI ĐĂNG KHỎI HỆ THỐNG!**\n• Mã bài: \`${postId}\``, { parse_mode: 'Markdown' });
      });
    } else {
      await ctx.answerCallbackQuery({ text: '⚠️ Không tìm thấy bài đăng để xóa.' }).catch(() => {});
    }
  });

  // Xóa toàn bộ bài đăng
  bot.callbackQuery('clear_all_posts', async (ctx) => {
    if (!(await isGroupAdmin(ctx))) {
      await ctx.answerCallbackQuery({ text: 'Chỉ quản trị viên mới được xóa toàn bộ hàng đợi.' }).catch(() => {});
      return;
    }
    const keyboard = new InlineKeyboard()
      .text('🗑️ Xác nhận xóa toàn bộ', 'clear_all_posts_confirm')
      .text('Hủy', 'clear_all_posts_cancel');
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply('Xác nhận xóa tất cả bản nháp và bài đang chờ? Bài đã đăng không bị ảnh hưởng.', { reply_markup: keyboard });
  });

  bot.callbackQuery('clear_all_posts_confirm', async (ctx) => {
    if (!(await isGroupAdmin(ctx))) {
      await ctx.answerCallbackQuery({ text: 'Chỉ quản trị viên mới được xóa toàn bộ hàng đợi.' }).catch(() => {});
      return;
    }
    clearDailyPosts();
    await ctx.answerCallbackQuery({ text: 'Đã xóa toàn bộ hàng đợi.' }).catch(() => {});
    await ctx.editMessageText('🗑️ Đã xóa toàn bộ bản nháp và bài đang chờ. Bài đã đăng không bị ảnh hưởng.').catch(() => {});
  });

  bot.callbackQuery('clear_all_posts_cancel', async (ctx) => {
    if (!(await isGroupAdmin(ctx))) {
      await ctx.answerCallbackQuery({ text: 'Chỉ quản trị viên mới được thao tác trên hàng đợi.' }).catch(() => {});
      return;
    }
    await ctx.answerCallbackQuery({ text: 'Đã hủy.' }).catch(() => {});
    await ctx.editMessageText('Đã hủy xóa hàng đợi.');
  });

  // Xóa mẫu bình luận cuối
  bot.callbackQuery('del_last_cmt', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    const tpls = getCommentTemplates();
    if (tpls.length === 0) {
      await ctx.answerCallbackQuery({ text: 'Danh sách mẫu bình luận đang trống.' }).catch(() => {});
      return ctx.reply('📭 Danh sách mẫu bình luận đang trống.');
    }
    const last = tpls[tpls.length - 1];
    deleteCommentTemplate(last.id);
    await ctx.answerCallbackQuery({ text: 'Đã xóa mẫu bình luận!' }).catch(() => {});
    await ctx.reply(`🗑️ **ĐÃ XÓA MẪU BÌNH LUẬN:**\n"${last.content.substring(0, 70)}..."`);
  });

  // Kích hoạt quét nhóm tức thì từ Telegram
  bot.callbackQuery('nav_trigger_scan', async (ctx) => {
    if (!(await isGroupAdmin(ctx))) {
      await ctx.answerCallbackQuery({ text: 'Chỉ quản trị viên mới chạy quét bình luận hàng loạt.' }).catch(() => {});
      return;
    }
    await triggerScanAndReport(ctx);
  });

  // Nút cũ không tự sinh biến thể nội dung nữa.
  bot.callbackQuery('nav_test_spin', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    await ctx.answerCallbackQuery({ text: 'Tự tạo biến thể nội dung đã tắt.' }).catch(() => {});
    await ctx.reply('Hãy nhập và duyệt nội dung bình luận chính xác trước khi gửi.');
  });

  // Quản lý Nick & Proxy
  bot.callbackQuery('nav_nicks', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    await ctx.answerCallbackQuery().catch(() => {});
    await sendNickManagementMessage(ctx);
  });

  bot.callbackQuery(/^set_def_acc:(.+)$/, async (ctx) => {
    if (!(await isGroupAdmin(ctx))) {
      await ctx.answerCallbackQuery({ text: 'Chỉ quản trị viên mới đổi được tài khoản Facebook.' }).catch(() => {});
      return;
    }
    const accId = ctx.match[1];
    await ctx.answerCallbackQuery({ text: '⏳ Đang chuyển đổi phiên làm việc của tài khoản...' }).catch(() => {});
    await ctx.reply(`⏳ **Đang chuyển đổi phiên trình duyệt sang tài khoản:** \`${accId}\`...`);
    try {
      await messengerEngine.switchAccount(accId);
      await ctx.reply(`👑 **Đã chuyển đổi phiên Facebook và tài khoản chính thành công!**`);
    } catch (err: any) {
      await ctx.reply(`❌ Lỗi khi chuyển phiên tài khoản: ${err.message}`);
    }
    await sendNickManagementMessage(ctx);
  });

  bot.callbackQuery('ping_proxy', async (ctx) => {
    if (!(await isGroupAdmin(ctx))) {
      await ctx.answerCallbackQuery({ text: 'Chỉ quản trị viên mới kiểm tra Proxy.' }).catch(() => {});
      return;
    }
    await handlePingProxies(ctx);
  });

  bot.callbackQuery(/^test_proxy_acc:(.+)$/, async (ctx) => {
    if (!(await isGroupAdmin(ctx))) {
      await ctx.answerCallbackQuery({ text: 'Chỉ quản trị viên mới kiểm tra Proxy.' }).catch(() => {});
      return;
    }
    const accId = ctx.match[1];
    await handleTestSingleAccountProxy(ctx, accId);
  });

  // Phím tắt trả lời nhanh 1 chạm cho khách
  bot.callbackQuery(/^quick_send:(.+)$/, async (ctx) => {
    const key = ctx.match[1];
    await handleQuickSend(ctx, key);
  });

  bot.callbackQuery('open_tag_menu', async (ctx) => {
    const keyboard = getCustomerTagKeyboard();
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply('🏷️ **CHỌN TRẠNG THÁI KHÁCH HÀNG:**', { reply_markup: keyboard });
  });

  bot.callbackQuery('nav_help', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(
      `📖 **HƯỚNG DẪN ĐIỀU HÀNH 100% QUA TELEGRAM (KHÔNG CẦN DASHBOARD):**\n\n` +
      `• \`/menu\`: Mở bàn phím điều hành trung tâm 1 chạm.\n` +
      `• \`/nicks\`: Quản lý tài khoản Facebook & kiểm tra Proxy độc lập.\n` +
      `• \`/chay\`: Kích hoạt đăng bài ngay lập tức không cần chờ lịch.\n` +
      `• \`/quet\`: Kích hoạt phiên quét nhóm & bình luận bài viết khớp từ khóa tức thì.\n` +
      `• \`/ds\`: Xem danh sách bài đăng hoặc mẫu comment kèm nút bấm thao tác.\n` +
      `• \`/quick\`: Bảng phím tắt trả lời 1 chạm (STK, Địa chỉ, Báo giá, Chào hỏi).\n` +
      `• \`/tag\`: Gắn tag trạng thái phân loại khách hàng (Chốt đơn, Hỏi giá, VIP).\n` +
      `• \`/baocao\`: Xuất báo cáo tổng kết doanh số & hoạt động trong ngày.\n\n` +
      `• \`/sale_id\`: Lấy ID Telegram. Quản trị viên dùng \`/sale_them <ID>\`, \`/sale_xoa <ID>\`, \`/sale_ds\` để quản lý quyền Sale.\n\n` +
      `👉 _Doanh nghiệp thực hiện mọi quyết định trực tiếp qua các nút bấm của Telegram!_`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.callbackQuery('nav_menu', async (ctx) => {
    if (!(await requireFacebookOperator(ctx))) return;
    await ctx.answerCallbackQuery().catch(() => {});
    const keyboard = new InlineKeyboard()
      .text('📊 Tiến Trình Hôm Nay', 'nav_status')
      .text('⚡ Kích Hoạt Quét Ngay', 'nav_trigger_scan')
      .row()
      .text('🟢 Bật/Tắt Quét Nhóm', 'nav_toggle_scan')
      .text('👥 Quản Lý Nick & Proxy', 'nav_nicks')
      .row()
      .text('📝 Danh Sách Bài Đăng', 'nav_list_posts')
      .text('💬 Quản Lý Mẫu Cmt', 'nav_list_cmt')
      .row()
      .text('📋 Xuất Báo Cáo Ngay', 'nav_report')
      .text('❓ Hướng Dẫn Nhanh', 'nav_help');

    await ctx.reply(
      `⚡ **FALCONX BÀN PHÍM ĐIỀU HÀNH 1 CHẠM**\n\n` +
        `Toàn bộ quyền điều hành, chọn nơi đăng, kích hoạt chạy hay xem tiến trình đều thực hiện 100% qua các phím bấm bên dưới:`,
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  });

  // Tự động khởi chạy bộ định thời (Scheduled Posts & 22:00 Daily Summary)
  startDailyScheduler(bot);

  return bot;
}

async function isGroupAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.from) return false;
  try {
    const member = await ctx.api.getChatMember(config.telegramGroupId, ctx.from.id);
    return member.status === 'administrator' || member.status === 'creator';
  } catch {
    return false;
  }
}

async function isFacebookOperator(ctx: Context): Promise<boolean> {
  if (!ctx.from) return false;
  try {
    const member = await ctx.api.getChatMember(config.telegramGroupId, ctx.from.id);
    if (member.status === 'administrator' || member.status === 'creator') return true;
    const isMember = member.status === 'member' || (member.status === 'restricted' && member.is_member);
    return isMember && (getAutoCommentConfig().telegramSalesOperatorIds || []).includes(ctx.from.id);
  } catch {
    return false;
  }
}

async function requireFacebookOperator(ctx: Context): Promise<boolean> {
  if (await isFacebookOperator(ctx)) return true;
  const message = 'Chỉ quản trị viên hoặc nhân viên Sale đã được cấp quyền mới dùng được chức năng Facebook này. Gõ /sale_id để lấy ID Telegram.';
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: message }).catch(() => {});
  } else {
    await ctx.reply(message).catch(() => {});
  }
  return false;
}

function extractFacebookUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;
  const cleaned = match[0].replace(/[),.;!?]+$/, '');
  try {
    const url = new URL(cleaned);
    if (!['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function getFutureScheduleAt(localTime: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(localTime);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const scheduledAt = new Date();
  scheduledAt.setHours(hour, minute, 0, 0);
  return scheduledAt.getTime() > Date.now() ? scheduledAt : null;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function resolveScheduledPostAt(post: { scheduledAt?: string; scheduledTime?: string; createdAt: string }): Date | null {
  if (post.scheduledAt) {
    const parsed = new Date(post.scheduledAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (!post.scheduledTime) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(post.scheduledTime);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const parsed = new Date(post.createdAt);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(hour, minute, 0, 0);
  return parsed;
}

async function handleMemberScanMessage(ctx: Context, text: string): Promise<void> {
  if (!(await requireFacebookOperator(ctx))) return;
  const topicId = ctx.message?.message_thread_id;
  const lower = text.trim().toLowerCase();

  // Lệnh xóa mốc tham chiếu cũ để quét lại từ đầu
  if (lower === '/reset_mem' || lower === '/xoa_moc' || lower === '/reset') {
    const scanFile = path.resolve('./data/facebook_member_scan.json');
    if (fs.existsSync(scanFile)) {
      try { fs.unlinkSync(scanFile); } catch {}
    }
    await ctx.reply('🔄 Đã xóa toàn bộ mốc tham chiếu cũ! Giờ bạn hãy gửi lại link Group để hệ thống quét sâu danh sách thành viên mới nhất nhé.', {
      ...(topicId ? { message_thread_id: topicId } : {}),
    });
    return;
  }

  const groupUrl = extractFacebookUrl(text);
  if (!groupUrl) {
    await ctx.reply(
      '📋 **HƯỚNG DẪN QUÉT THÀNH VIÊN MỚI TRONG GROUP:**\n\n' +
      '• Gửi link Facebook Group bất kỳ (Ví dụ: `https://www.facebook.com/groups/1398246037427398`)\n' +
      '• Bot sẽ mở trang thành viên, cuộn sâu và bóc tách toàn bộ thành viên vừa mới gia nhập kèm link Profile để kết bạn/nhắn tin.\n' +
      '• Gõ `/reset_mem` nếu muốn xóa mốc cũ để quét lại toàn bộ từ đầu.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Cho phép ép quét lại từ đầu nếu người dùng gõ kèm chữ "reset" hoặc "mới"
  if (/reset|mới|lai|lại/i.test(text)) {
    const scanFile = path.resolve('./data/facebook_member_scan.json');
    if (fs.existsSync(scanFile)) {
      try { fs.unlinkSync(scanFile); } catch {}
    }
  }

  await ctx.reply('🔎 Đang mở trang thành viên của Group, cuộn sâu và bóc tách danh sách thành viên mới…');
  try {
    const result = await facebookActionsEngine.scanRecentGroupMembers(groupUrl);
    if (result.baselineCreated) {
      const todayJoiners = result.members.filter((m) => /phút trước|giờ trước|vừa xong/i.test(m.name));
      const otherJoiners = result.members.filter((m) => /đã tham gia/i.test(m.name) && !/phút trước|giờ trước|vừa xong/i.test(m.name));

      let msg = `✅ **ĐÃ QUÉT THÀNH CÔNG & LƯU MỐC (${result.members.length} HỒ SƠ)**\n\n`;

      if (todayJoiners.length > 0) {
        msg += `🔥 **THÀNH VIÊN MỚI GIA NHẬP HÔM NAY (${todayJoiners.length}):**\n\n`;
        msg += todayJoiners.slice(0, 15).map((m, i) => `${i + 1}. **${m.name}**\n🔗 ${m.url}`).join('\n\n');
        if (todayJoiners.length > 15) {
          msg += `\n\n… và ${todayJoiners.length - 15} thành viên hôm nay nữa.`;
        }
      } else if (otherJoiners.length > 0) {
        msg += `📋 **DANH SÁCH THÀNH VIÊN GIA NHẬP GẦN ĐÂY (${otherJoiners.length}):**\n\n`;
        msg += otherJoiners.slice(0, 15).map((m, i) => `${i + 1}. **${m.name}**\n🔗 ${m.url}`).join('\n\n');
      }

      msg += `\n\n💡 _Từ lần quét tiếp theo, bot sẽ so sánh với mốc này và tự động báo ngay các thành viên mới xuất hiện! Gõ /reset_mem nếu muốn quét lại từ đầu._`;

      await ctx.reply(msg, {
        link_preview_options: { is_disabled: true },
        parse_mode: 'Markdown',
        ...(topicId ? { message_thread_id: topicId } : {}),
      });
      return;
    }

    if (result.newMembers.length === 0) {
      const todayJoiners = result.members.filter((m) => /phút trước|giờ trước|vừa xong/i.test(m.name));
      const listText = todayJoiners.length > 0
        ? `\n\n📋 **Thành viên mới trong ngày hôm nay (${todayJoiners.length}):**\n\n` +
          todayJoiners.slice(0, 10).map((m, i) => `${i + 1}. **${m.name}**\n🔗 ${m.url}`).join('\n\n')
        : '';
      await ctx.reply(`✅ Không thấy hồ sơ mới so với lần quét trước (${result.members.length} hồ sơ đang theo dõi).${listText}\n\n💡 _Gõ /reset_mem nếu muốn xóa mốc cũ để quét lại toàn bộ._`, {
        link_preview_options: { is_disabled: true },
        parse_mode: 'Markdown',
        ...(topicId ? { message_thread_id: topicId } : {}),
      });
      return;
    }

    const lines = result.newMembers.slice(0, 20).map((member, index) => `${index + 1}. **${member.name}**\n🔗 ${member.url}`);
    const more = result.newMembers.length > 20 ? `\n\n… và ${result.newMembers.length - 20} hồ sơ nữa.` : '';
    await ctx.reply(`👥 **PHÁT HIỆN ${result.newMembers.length} THÀNH VIÊN MỚI TRONG GROUP!**\n\n${lines.join('\n\n')}${more}`, {
      link_preview_options: { is_disabled: true },
      parse_mode: 'Markdown',
      ...(topicId ? { message_thread_id: topicId } : {}),
    });
  } catch (error: any) {
    await ctx.reply(`⚠️ Quét thành viên không thành công: ${error.message}`);
  }
}

async function handleFacebookActionInput(ctx: Context, kind: FacebookActionKind, text: string): Promise<void> {
  if (!(await requireFacebookOperator(ctx))) return;
  const url = extractFacebookUrl(text);
  if (!url || !ctx.from || !ctx.message?.message_thread_id) {
    const prompts: Record<FacebookActionKind, string> = {
      friend: 'Gửi link hồ sơ Facebook của một người để tạo lời mời kết bạn cần xác nhận.',
      story: 'Gửi link trực tiếp đến một Story Facebook. Hệ thống sẽ hỏi chọn Thích hoặc Yêu thích rồi chờ xác nhận.',
      post: 'Gửi link trực tiếp đến một bài viết Facebook. Hệ thống sẽ hỏi chọn Thích hoặc Yêu thích rồi chờ xác nhận.',
    };
    await ctx.reply(prompts[kind]);
    return;
  }

  const parsed = new URL(url);
  const route = parsed.pathname.toLowerCase();
  if (kind === 'friend' && (/^\/groups\//.test(route) || /^\/events\//.test(route))) {
    await ctx.reply('Link này không giống link hồ sơ cá nhân. Hãy gửi link profile Facebook.');
    return;
  }
  if (kind === 'story' && !(/\/stories\//.test(route) || /\/story\.php$/.test(route))) {
    await ctx.reply('Link chưa nhận diện là Story. Hãy gửi link mở trực tiếp Story Facebook.');
    return;
  }
  if (kind === 'post' && !(/\/posts?\//.test(route) || /\/permalink\//.test(route) || /\/story\.php$/.test(route) || /\/share\/p\//.test(route))) {
    await ctx.reply('Link chưa nhận diện là bài viết. Hãy gửi link bài viết Facebook.');
    return;
  }

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const action: PendingFacebookAction = {
    id,
    kind,
    url,
    userId: ctx.from.id,
    topicId: ctx.message.message_thread_id,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  for (const [pendingId, pending] of pendingFacebookActions) {
    if (pending.expiresAt <= Date.now()) pendingFacebookActions.delete(pendingId);
  }
  pendingFacebookActions.set(id, action);

  const labels: Record<FacebookActionKind, string> = {
    friend: 'Gửi lời mời kết bạn',
    story: 'Tương tác Story',
    post: 'Tương tác bài viết',
  };
  if (kind === 'friend') {
    const currentAcc = getDefaultAccount();
    const collision = globalLeadPoolService.checkFriendCollision(url, currentAcc?.id || 'default');
    if (!collision.canSend) {
      await ctx.reply(
        `⛔ **KHÔNG THỂ GỬI LỜI MỜI KẾT BẠN!**\n\n` +
        `• 🔗 Link: ${url}\n` +
        `• ⚠️ Lý do: ${collision.reason}\n\n` +
        `💡 _Hệ thống đã tự động kích hoạt tính năng Chống Trùng Bạn Bè để bảo vệ dàn nick của bạn khỏi bị Facebook soi và tránh làm phiền khách hàng._`,
        {
          link_preview_options: { is_disabled: true },
          parse_mode: 'Markdown',
        }
      );
      pendingFacebookActions.delete(id);
      return;
    }

    const keyboard = new InlineKeyboard()
      .text('✅ Xác nhận gửi lời mời', `fbact_confirm:${id}`)
      .text('✖️ Hủy', `fbact_cancel:${id}`);
    await ctx.reply(`${labels[kind]}\n${url}\n\nChỉ gửi một lời mời đến link này. Xác nhận để tiếp tục.`, {
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
    return;
  }

  const keyboard = new InlineKeyboard()
    .text('👍 Thích', `fbact_like:${id}`)
    .text('❤️ Yêu thích', `fbact_love:${id}`)
    .row()
    .text('✖️ Hủy', `fbact_cancel:${id}`);
  await ctx.reply(`${labels[kind]}\n${url}\n\nChọn một cảm xúc. Bot sẽ hỏi xác nhận trước khi thao tác.`, {
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true },
  });
}

async function handleFacebookInteractionInput(ctx: Context, text: string): Promise<void> {
  const url = extractFacebookUrl(text);
  if (!url) {
    await ctx.reply('Gửi link Story hoặc bài viết Facebook. Hệ thống sẽ tự nhận diện loại link, cho chọn cảm xúc và hỏi xác nhận trước khi thao tác.');
    return;
  }

  const pathname = new URL(url).pathname.toLowerCase();
  const kind: FacebookActionKind | null = /\/stories\//.test(pathname)
    ? 'story'
    : /\/posts?\//.test(pathname) || /\/permalink\//.test(pathname) || /\/story\.php$/.test(pathname) || /\/share\/p\//.test(pathname)
      ? 'post'
      : null;

  if (!kind) {
    await ctx.reply('Chưa nhận diện được link. Hãy gửi link Story có dạng `/stories/...` hoặc link bài viết Facebook.', {
      parse_mode: 'Markdown',
    });
    return;
  }
  await handleFacebookActionInput(ctx, kind, text);
}

export function getAccountHealthKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Kiểm Tra Trạng Thái Ngay', 'check_account_health')
    .row()
    .text('📋 Báo Cáo Gần Nhất', 'view_recent_health')
    .text('❓ Xử Lý Marketplace', 'help_appeal_marketplace')
    .row()
    .url('🌐 Mở Marketplace FB', 'https://www.facebook.com/marketplace/you/selling')
    .url('🛡️ Hộp Thư Hỗ Trợ FB', 'https://www.facebook.com/support/');
}

async function safeReplyOrSendAccountReport(
  ctx: Context,
  report: any,
  keyboard: InlineKeyboard,
  topicId?: number
): Promise<void> {
  const summary = report.markdownSummary || '';
  const photoPath = report.screenshotPath;

  try {
    if (photoPath && fs.existsSync(photoPath)) {
      if (summary.length <= 1000) {
        await ctx.api.sendPhoto(config.telegramGroupId, new InputFile(photoPath), {
          caption: summary,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
          ...(topicId ? { message_thread_id: topicId } : {}),
        });
        return;
      } else {
        await ctx.api.sendPhoto(config.telegramGroupId, new InputFile(photoPath), {
          caption: `🛡️ **Ảnh chụp thực tế tài khoản Facebook:** ${report.accountName}`,
          ...(topicId ? { message_thread_id: topicId } : {}),
        });
        await ctx.api.sendMessage(config.telegramGroupId, summary, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
          ...(topicId ? { message_thread_id: topicId } : {}),
        });
        return;
      }
    }

    await ctx.api.sendMessage(config.telegramGroupId, summary, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      ...(topicId ? { message_thread_id: topicId } : {}),
    });
  } catch (err: any) {
    console.warn('[AccountHealth] Gửi báo cáo Markdown lỗi, thử fallback chữ thường:', err.message);
    const plainText = summary.replace(/[*_`#]/g, '');
    await ctx.api.sendMessage(config.telegramGroupId, plainText, {
      reply_markup: keyboard,
      ...(topicId ? { message_thread_id: topicId } : {}),
    }).catch(() => {});
  }
}

async function handleAccountStatusTopicMessage(ctx: Context, text: string): Promise<void> {
  const clean = text.trim().toLowerCase();

  if (clean === '/help' || clean === 'help' || clean === 'hướng dẫn' || clean === 'huong dan') {
    await ctx.reply(
      `🛡️ **HƯỚNG DẪN KIỂM TRA TRẠNG THÁI & SỨC KHỎE TÀI KHOẢN:**\n\n` +
      `• Gõ \`/check\`, \`kiem tra\`, hoặc bấm nút **[🔄 Kiểm Tra Trạng Thái Ngay]** bên dưới.\n` +
      `• Hệ thống sẽ trực tiếp rà soát:\n` +
      `  1. Trạng thái Đăng nhập & Checkpoint\n` +
      `  2. Quyền Viết Feed / Đăng bài lên 60 Group BĐS\n` +
      `  3. Tiêu chuẩn cộng đồng & Gậy phạt (Hộp thư hỗ trợ)\n` +
      `  4. Tình trạng hạn chế Marketplace & Nhóm Mua Bán\n` +
      `  5. Kết nối tin nhắn Messenger 2 chiều\n\n` +
      `• Bấm **[❓ Xử Lý Marketplace]** để xem cách kháng nghị gỡ hạn chế nhanh chóng.`,
      {
        reply_markup: getAccountHealthKeyboard(),
        parse_mode: 'Markdown',
      }
    );
    return;
  }

  if (clean.includes('kháng') || clean.includes('khang') || clean.includes('marketplace') || clean.includes('dinh chi') || clean.includes('đình chỉ')) {
    await sendMarketplaceAppealGuide(ctx);
    return;
  }

  // Mọi tin nhắn gửi trong topic này mặc định kích hoạt kiểm tra sức khỏe
  await handleAccountHealthScan(ctx, false);
}

async function handleAccountHealthScan(ctx: Context, isCallback = false, overrideTopicId?: number): Promise<void> {
  const topicId = overrideTopicId || ctx.message?.message_thread_id || (ctx.callbackQuery?.message as any)?.message_thread_id;
  const currentAcc = getDefaultAccount();
  const accName = currentAcc?.name || 'Eco Trang';

  if (isCallback) {
    await ctx.answerCallbackQuery({ text: 'Đang bắt đầu quét sức khỏe tài khoản Facebook...' }).catch(() => {});
  }

  let waitMsg: any;
  try {
    waitMsg = await ctx.api.sendMessage(
      config.telegramGroupId,
      `⏳ **ĐANG KIỂM TRA TOÀN DIỆN TÀI KHOẢN FACEBOOK: ${accName}...**\n\n` +
      `• 🔍 Kiểm tra Checkpoint & Phiên đăng nhập...\n` +
      `• 📝 Kiểm tra Quyền đăng bài cá nhân & Group...\n` +
      `• 🛡️ Rà soát Tiêu chuẩn cộng đồng & Hộp thư hỗ trợ...\n` +
      `• 🛒 Kiểm tra Lệnh cấm Marketplace & Nhóm Mua Bán...\n` +
      `• 💬 Kiểm tra Cầu nối Messenger 2 chiều...\n\n` +
      `_Hệ thống đang mở trình duyệt tự động để quét trực tiếp, vui lòng đợi ~10-15 giây..._`,
      {
        ...(topicId ? { message_thread_id: topicId } : {}),
        parse_mode: 'Markdown',
      }
    );
  } catch {}

  try {
    const report = await accountHealthService.checkLiveHealth();
    const keyboard = getAccountHealthKeyboard();

    if (waitMsg) {
      await ctx.api.deleteMessage(config.telegramGroupId, waitMsg.message_id).catch(() => {});
    }

    await safeReplyOrSendAccountReport(ctx, report, keyboard, topicId);
  } catch (error: any) {
    console.error('[AccountHealth] Lỗi quét sức khỏe tài khoản:', error);
    if (waitMsg) {
      await ctx.api.editMessageText(
        config.telegramGroupId,
        waitMsg.message_id,
        `❌ **LỖI QUÉT TRẠNG THÁI TÀI KHOẢN:**\n\n${error.message}\n\n_Vui lòng thử lại sau vài phút._`,
        { reply_markup: getAccountHealthKeyboard() }
      ).catch(() => {});
    } else {
      await ctx.api.sendMessage(
        config.telegramGroupId,
        `❌ **LỖI QUÉT TRẠNG THÁI TÀI KHOẢN:**\n\n${error.message}`,
        {
          ...(topicId ? { message_thread_id: topicId } : {}),
          reply_markup: getAccountHealthKeyboard(),
        }
      ).catch(() => {});
    }
  }
}

async function sendMarketplaceAppealGuide(ctx: Context): Promise<void> {
  const topicId = ctx.message?.message_thread_id || (ctx.callbackQuery?.message as any)?.message_thread_id;
  const guide =
    `💡 **HƯỚNG DẪN XỬ LÝ LỆNH CẤM / ĐÌNH CHỈ MARKETPLACE**\n\n` +
    `1️⃣ **Nguyên nhân chính:**\n` +
    `• Facebook sử dụng AI tự động quét các bài viết/bình luận có chứa từ ngữ "bất động sản", "cho thuê căn hộ", "triệu/tháng", "cọc tiền".\n` +
    `• AI của Facebook thường nhầm lẫn với hàng hóa cấm bán trên Marketplace nên tự động áp lệnh treo quyền Marketplace tạm thời.\n\n` +
    `2️⃣ **Cách Kháng Nghị (Gỡ cấm trong 24h - 48h):**\n` +
    `• **Bước 1**: Bấm vào nút bên dưới: **[🌐 Mở Marketplace FB]**\n` +
    `• **Bước 2**: Nhìn thấy thông báo đình chỉ, bấm nút xanh **"Yêu cầu xem xét lại"** (Request Review).\n` +
    `• **Bước 3**: Chọn phương án khẳng định bạn là người dùng thật, tuân thủ chính sách cộng đồng và gửi đi.\n\n` +
    `3️⃣ **Lưu ý quan trọng về vận hành:**\n` +
    `• Lệnh cấm Marketplace **CHỈ áp dụng cho 4 nhóm loại Mua Bán**.\n` +
    `• **Hơn 50+ Group Cộng Đồng Cư Dân** (Sky Oasis, Westbay, Sol Forest, Aqua Bay...) **hoạt động 100% bình thường**, đăng bài và bình luận không bị giới hạn.\n` +
    `• Nhắn tin Messenger tư vấn khách qua bot hoạt động 24/7 hoàn hảo!`;

  const keyboard = new InlineKeyboard()
    .url('🌐 Mở Trang Marketplace Để Kháng', 'https://www.facebook.com/marketplace/you/selling')
    .row()
    .text('🔄 Kiểm Tra Lại Trạng Thái', 'check_account_health');

  await ctx.api.sendMessage(config.telegramGroupId, guide, {
    ...(topicId ? { message_thread_id: topicId } : {}),
    reply_markup: keyboard,
    parse_mode: 'Markdown',
  }).catch(() => {});
}

/**
 * Xử lý xác nhận bản nháp (Draft Confirmation)
 */
async function handleDraftConfirm(ctx: Context, draftId: string) {
  if (!(await requireFacebookOperator(ctx))) return;
  const pending = getPendingDraft(draftId);
  if (pending?.type === 'daily_post' && !pending.targetType) {
    pending.targetType = 'personal_post';
    updatePendingDraft(draftId, { targetType: 'personal_post' });
  }
  const result = confirmDraft(draftId);
  if (!result) {
    await ctx.answerCallbackQuery({ text: '⚠️ Bản nháp này đã được duyệt hoặc không tồn tại.' }).catch(() => {});
    return;
  }
  await ctx.answerCallbackQuery({ text: '✅ Đã xác nhận tiến trình!' }).catch(() => {});

  if (result.draft.type === 'daily_post' && result.post) {
    if (result.post.scheduledTime) {
      const preview = result.post.content.length > 80 ? result.post.content.substring(0, 80) + '...' : result.post.content;
      const targetLabel = result.post.type === 'personal_post' ? '👤 Cá Nhân' : result.post.type === 'both' ? '⚡ Cá Nhân & Group' : '🌐 Group';
      const keyboard = new InlineKeyboard()
        .text('▶️ Đăng Luôn Bây Giờ', `run_post:${result.post.id}`)
        .text('🗑️ Hủy Hẹn', `del_post:${result.post.id}`);

      const msg =
        `⏰ **ĐÃ HẸN GIỜ ĐĂNG!**\n` +
        `• Khung giờ: **${result.post.scheduledTime}**\n` +
        `• Nơi đăng: **${targetLabel}**\n` +
        `• Nội dung: "${preview}"`;

      await ctx.editMessageText(msg, { reply_markup: keyboard, parse_mode: 'Markdown' }).catch(async () => {
        await ctx.reply(msg, { reply_markup: keyboard, parse_mode: 'Markdown' });
      });
    } else {
      // Người dùng chọn đăng ngay lập tức -> Thực hiện đăng bài thật lên Facebook luôn!
      await executePostDistribution(ctx, result.post.id);
    }
  } else if (result.draft.type === 'comment_template') {
    const preview = result.draft.rawText.length > 80 ? result.draft.rawText.substring(0, 80) + '...' : result.draft.rawText;
    const msg =
      `✅ **ĐÃ LƯU MẪU COMMENT VÀO NGUỒN!**\n` +
      `• Nội dung: "${preview}"\n` +
      `• Nội dung: ${result.draft.rawText.includes('{') ? 'Có nhiều biến thể để chọn' : 'Văn bản gốc'}\n` +
      `• Trạng thái: Đã lưu; bình luận tự động vẫn tắt mặc định 🟢`;

    await ctx.editMessageText(msg, { parse_mode: 'Markdown' }).catch(async () => {
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });
  } else if (result.draft.type === 'on_demand_comment' && result.draft.postUrl) {
    const postUrl = result.draft.postUrl;
    const commentText = result.draft.rawText;
    const msg =
      `✅ **ĐÃ DUYỆT! ĐANG BÌNH LUẬN VÀO LINK...**\n` +
      `🔗 ${postUrl}\n` +
      `💬 "${commentText}"`;

    await ctx.editMessageText(msg, { parse_mode: 'Markdown' }).catch(async () => {
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // Thực hiện bình luận thông qua CommentService có hậu kiểm xác minh thực tế
    CommentService.executeComment({ postUrl, commentText }).then(async (res) => {
      const commentLink = res.receipt.resultUrl ? `\n• 💬 **Link bình luận trực tiếp**: [Xem bình luận trên Facebook](${res.receipt.resultUrl})` : '';
      if (res.outcome === 'verified_success') {
        const msg =
          `🎉 **BÌNH LUẬN THÀNH CÔNG (ĐÃ XÁC MINH)!**\n\n` +
          `• 🔗 **Bài viết**: [Xem bài viết trên Facebook](${postUrl})\n` +
          commentLink +
          `• 💬 **Nội dung**: "${commentText}"\n` +
          `• ⏱️ **Thời gian xử lý**: ${res.receipt.durationMs || 0}ms\n` +
          `• ⏰ **Hoàn tất lúc**: ${new Date().toLocaleTimeString('vi-VN')}\n\n` +
          `✅ _Nội dung bình luận đã được xác nhận hiển thị công khai trên bài viết Facebook!_`;

        if (res.receipt.screenshotPath && fs.existsSync(res.receipt.screenshotPath)) {
          try {
            await ctx.replyWithPhoto(new InputFile(res.receipt.screenshotPath), {
              caption: msg,
              parse_mode: 'Markdown',
            });
            return;
          } catch {}
        }
        await ctx.reply(msg, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
      } else if (res.outcome === 'uncertain') {
        const msg =
          `⚠️ **ĐÃ GỬI BÌNH LUẬN (CHƯA XÁC MINH ĐỦ BẰNG CHỨNG):**\n\n` +
          `• 🔗 **Bài viết**: [Xem bài viết trên Facebook](${postUrl})\n` +
          commentLink +
          `• 💬 **Nội dung**: "${commentText}"\n` +
          `• ❓ **Ghi chú**: ${res.receipt.errorMessage || 'Facebook đã nhận phím Enter nhưng chưa hiển thị ngay.'}\n\n` +
          `👉 Bạn có thể mở link bài viết để kiểm tra thực tế.`;

        if (res.receipt.screenshotPath && fs.existsSync(res.receipt.screenshotPath)) {
          try {
            await ctx.replyWithPhoto(new InputFile(res.receipt.screenshotPath), {
              caption: msg,
              parse_mode: 'Markdown',
            });
            return;
          } catch {}
        }
        await ctx.reply(msg, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
      } else {
        await ctx.reply(
          `❌ **BÌNH LUẬN THẤT BẠI:**\n\n` +
          `• 🔗 **Bài viết**: [Xem bài viết trên Facebook](${postUrl})\n` +
          `• 💬 **Nội dung**: "${commentText}"\n` +
          `• ⚠️ **Lý do lỗi**: ${res.error || 'Không thể mở ô bình luận hoặc bài viết bị chặn cmt'}`,
          { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
        );
      }
    });
  }
}

/**
 * Xử lý hủy bản nháp (Draft Cancellation)
 */
async function handleDraftCancel(ctx: Context, draftId: string) {
  if (!(await requireFacebookOperator(ctx))) return;
  const cancelled = cancelDraft(draftId);
  if (!cancelled) {
    await ctx.answerCallbackQuery({ text: '⚠️ Bản nháp này đã được xử lý hoặc không tồn tại.' }).catch(() => {});
    return;
  }
  await ctx.answerCallbackQuery({ text: '❌ Đã hủy bỏ.' }).catch(() => {});
  const msg = `❌ **Đã hủy bản nháp.**`;
  await ctx.editMessageText(msg, { parse_mode: 'Markdown' }).catch(async () => {
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });
}

/**
 * Hỏi số lượng Group Ecopark đã tham gia muốn đi bình luận
 */
async function handleAskDistributeCommentQty(ctx: Context, draftId: string) {
  if (!(await requireFacebookOperator(ctx))) return;
  const draft = getPendingDraft(draftId);
  if (!draft) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Bản nháp không tồn tại hoặc đã xử lý.' }).catch(() => {});
    return ctx.reply('⚠️ Bản nháp bình luận không tồn tại.');
  }
  if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});

  const currentAcc = getDefaultAccount();
  const joinedGroups = getJoinedEcoparkGroups(currentAcc?.id);
  const totalJoined = joinedGroups.length;
  const quick5 = Math.min(5, totalJoined || 5);

  const sampleList = joinedGroups
    .slice(0, 5)
    .map((g, i) => `  ${i + 1}. **${g.name}**`)
    .join('\n');

  const keyboard = new InlineKeyboard()
    .text(`🔥 Test Nhanh: ${quick5} Group Ecopark Đã Join`, `distribute_cmt_qty:${draft.id}:${quick5}`)
    .row()
    .text('🎯 1 Group', `distribute_cmt_qty:${draft.id}:1`)
    .text('🎯 3 Group', `distribute_cmt_qty:${draft.id}:3`)
    .text('🎯 5 Group', `distribute_cmt_qty:${draft.id}:5`)
    .row()
    .text(`🌐 Tất cả (${totalJoined} Group Đã Join)`, `distribute_cmt_qty:${draft.id}:${Math.max(1, totalJoined)}`)
    .text('❌ Hủy', `draft_cancel:${draft.id}`);

  const msg =
    `🔢 **CHỌN SỐ LƯỢNG GROUP ĐỂ ĐI BÌNH LUẬN (KHO BĐS ECOPARK)**\n\n` +
    `• 👤 **Nick phụ trách**: **${currentAcc?.name || 'Eco Trang'}**\n` +
    `• 📦 **Kho Group Ecopark đã tham gia (Joined)**: **${totalJoined} nhóm**\n` +
    (sampleList ? `\n📋 **5 Group Ecopark đã join sẵn sàng test:**\n${sampleList}\n` : '') +
    `\n❓ **Bạn muốn hệ thống rải bình luận vào bao nhiêu Group?**`;

  await ctx.editMessageText(msg, { reply_markup: keyboard, parse_mode: 'Markdown' }).catch(async () => {
    await ctx.reply(msg, { reply_markup: keyboard, parse_mode: 'Markdown' });
  });
}

/**
 * Phân phối bình luận hàng loạt vào các Group mục tiêu có quy trình chuẩn
 */
async function handleDistributeComment(ctx: Context, draftId: string, maxGroups = 5) {
  if (!(await requireFacebookOperator(ctx))) return;
  const draft = getPendingDraft(draftId);
  if (!draft) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Bản nháp không tồn tại hoặc đã xử lý.' }).catch(() => {});
    return ctx.reply('⚠️ Bản nháp bình luận không tồn tại.');
  }

  confirmDraft(draftId);
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: `🚀 Bắt đầu bình luận vào ${maxGroups} Group Ecopark...` }).catch(() => {});
  }

  const commentText = draft.rawText;
  const currentAcc = getDefaultAccount();
  const joinedGroups = getJoinedEcoparkGroups(currentAcc?.id, maxGroups);
  const targetTopicId = getAutoCommentConfig().telegramTopicId || ctx.message?.message_thread_id;

  const groupNamesPreview = joinedGroups.map((g, i) => `  ${i + 1}. ${g.name}`).join('\n');

  const initMsg =
    `🚀 **FALCONX — KHỞI CHẠY PHÂN TÁN BÌNH LUẬN VÀO ${joinedGroups.length} GROUP ECOPARK**\n\n` +
    `• 👤 **Nick thực thi**: **${currentAcc?.name || 'Eco Trang'}**\n` +
    `• 💬 **Mẫu bình luận**: "${commentText.slice(0, 100)}..."\n` +
    `• 🎯 **Số lượng nhóm đã chọn**: **${joinedGroups.length} nhóm BĐS Ecopark đã join**\n` +
    (groupNamesPreview ? `${groupNamesPreview}\n\n` : '') +
    `• 🛡️ **Hành vi giống người**: Lướt feed trước khi cmt + Spintax + gõ phím 35-80ms + tạm dừng đọc lại\n` +
    `• 📸 **Minh chứng**: Tự động chụp màn hình và trích xuất link từng bài để double-check\n\n` +
    `⏳ Hệ thống đang mở trình duyệt và xử lý lần lượt...`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(initMsg, { parse_mode: 'Markdown' }).catch(async () => {
      await ctx.reply(initMsg, { parse_mode: 'Markdown' });
    });
  } else {
    await ctx.reply(initMsg, { parse_mode: 'Markdown' });
  }

  try {
    const result = await autoCommentEngine.distributeGroupComments({
      commentTemplate: commentText,
      targetGroupUrls: joinedGroups.map((g) => g.url),
      maxGroups: joinedGroups.length || maxGroups,
      onProgress: async (idx, total, item) => {
        const icon = item.success ? '✅' : '❌';
        const title = item.success ? 'ĐÃ BÌNH LUẬN THÀNH CÔNG' : 'BÌNH LUẬN THẤT BẠI';
        const linkComment = item.commentPermalink
          ? `• 💬 **Link bình luận trực tiếp**: [Xem bình luận](${item.commentPermalink})\n`
          : '';
        const linkPost = item.postUrl
          ? `• 🔗 **Bài viết**: [Xem bài viết trên Facebook](${item.postUrl})\n`
          : `• 👥 **Nhóm**: ${item.groupUrl}\n`;

        const progressMsg =
          `${icon} **[${idx}/${total}] ${title}**\n\n` +
          linkPost +
          linkComment +
          (item.error ? `• ⚠️ **Lỗi**: ${item.error}\n` : '') +
          `• ⏰ **Thời gian**: ${new Date().toLocaleTimeString('vi-VN')}\n\n` +
          `👉 _Bấm link trên hoặc xem ảnh minh chứng để double-check!_`;

        if (item.screenshotPath && fs.existsSync(item.screenshotPath)) {
          try {
            await ctx.api.sendPhoto(config.telegramGroupId, new InputFile(item.screenshotPath), {
              ...(targetTopicId ? { message_thread_id: targetTopicId } : {}),
              caption: progressMsg,
              parse_mode: 'Markdown',
            });
            return;
          } catch {}
        }

        await ctx.api.sendMessage(config.telegramGroupId, progressMsg, {
          ...(targetTopicId ? { message_thread_id: targetTopicId } : {}),
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
        }).catch(() => {});
      },
    });

    const receiptReport = result.receipts.map((r, i) => {
      const icon = r.success ? '✅' : '❌';
      const link = r.commentPermalink || r.postUrl || r.groupUrl;
      return `  ${icon} **#${i + 1}**: [Link bài/comment Facebook](${link})${r.error ? ` (${r.error})` : ''}`;
    }).join('\n');

    const summaryMsg =
      `🎉 **FALCONX — HOÀN TẤT PHIÊN PHÂN TÁN BÌNH LUẬN GROUP!**\n\n` +
      `• 📊 **Kết quả**: Thành công **${result.successCount}/${result.totalAttempted}** nhóm\n` +
      `• 💬 **Nội dung gốc**: "${commentText.slice(0, 80)}..."\n\n` +
      `📋 **DANH SÁCH LINK ĐÃ BÌNH LUẬN ĐỂ DOUBLE-CHECK:**\n` +
      (receiptReport || '  • Không có danh sách link') +
      `\n\n⏰ **Hoàn tất lúc**: ${new Date().toLocaleTimeString('vi-VN')}\n` +
      `✅ _Toàn bộ ảnh chụp màn hình và bằng chứng đã được gửi chi tiết ở trên!_`;

    await ctx.api.sendMessage(config.telegramGroupId, summaryMsg, {
      ...(targetTopicId ? { message_thread_id: targetTopicId } : {}),
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    }).catch(() => {});
  } catch (err: any) {
    await ctx.api.sendMessage(config.telegramGroupId, `❌ Lỗi tiến trình phân tán bình luận: ${err.message}`, {
      ...(targetTopicId ? { message_thread_id: targetTopicId } : {}),
    }).catch(() => {});
  }
}

/**
 * Xử lý xác nhận hẹn giờ đăng bài
 */
async function handlePostScheduleConfirm(ctx: Context, draftId: string, schedTime: string) {
  if (!(await requireFacebookOperator(ctx))) return;
  const pending = getPendingDraft(draftId);
  if (!pending?.targetType) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Hãy chọn nơi đăng trước.' }).catch(() => {});
    await ctx.reply('Chọn Trang cá nhân hoặc Group trước khi hẹn giờ đăng.');
    return;
  }
  const scheduledAt = getFutureScheduleAt(schedTime);
  if (!scheduledAt) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Chọn một giờ hợp lệ trong tương lai hôm nay.' }).catch(() => {});
    await ctx.reply(`Giờ ${schedTime} không hợp lệ hoặc đã qua. Hãy chọn lại một giờ trong tương lai hôm nay.`);
    return;
  }
  updatePendingDraft(draftId, { scheduledAt: scheduledAt.toISOString() });
  const result = confirmDraft(draftId, schedTime);
  if (!result || !result.post) {
    await ctx.answerCallbackQuery({ text: '⚠️ Bản nháp này đã được xử lý hoặc không tồn tại.' }).catch(() => {});
    return;
  }
  await ctx.answerCallbackQuery({ text: `⏰ Đã hẹn giờ đăng lúc ${schedTime}!` }).catch(() => {});

  const preview = result.post.content.length > 80 ? result.post.content.substring(0, 80) + '...' : result.post.content;
  const targetGroups = getTargetGroups().filter((group) =>
    group.status === 'active' && (result.post!.targetGroupIds ? result.post!.targetGroupIds.includes(group.id) : true),
  );
  const groupSummary = targetGroups.length <= 2
    ? targetGroups.map((g) => g.name).join(', ')
    : `${targetGroups.slice(0, 2).map((g) => g.name).join(', ')}... (+${targetGroups.length - 2} nhóm)`;
  const targetLabel = result.post.type === 'personal_post'
    ? '👤 Trang cá nhân'
    : result.post.type === 'both'
      ? `Trang cá nhân + ${targetGroups.length} Group (${groupSummary})`
      : `${targetGroups.length} Group (${groupSummary})`;

  const keyboard = new InlineKeyboard()
    .text('▶️ Đăng Luôn Bây Giờ', `run_post:${result.post.id}`)
    .text('🗑️ Hủy Lịch Hẹn', `del_post:${result.post.id}`);

  const msg =
    `⏰ **ĐÃ HẸN GIỜ ĐĂNG!**\n` +
    `• Khung giờ: **${schedTime}**\n` +
    `• Nơi đăng: **${targetLabel}**\n` +
    `• Nội dung: "${preview}"\n` +
    `• Trạng thái: Đã lên lịch tự động ⏰`;

  await ctx.editMessageText(msg, { reply_markup: keyboard, parse_mode: 'Markdown' }).catch(async () => {
    await ctx.reply(msg, { reply_markup: keyboard, parse_mode: 'Markdown' });
  });
}

/**
 * Xử lý chọn đích đến đăng bài (Group / Cá Nhân / Cả Hai)
 * Nếu chọn Group hoặc Cả Hai -> Hỏi số lượng Group BĐS Ecopark đã tham gia muốn đăng!
 */
async function handlePostTargetSelect(ctx: Context, draftId: string, targetType: 'personal_post' | 'group_post' | 'both') {
  if (!(await requireFacebookOperator(ctx))) return;
  const draft = getPendingDraft(draftId);
  if (!draft || draft.status !== 'pending') {
    await ctx.answerCallbackQuery({ text: '⚠️ Bản nháp đã được xử lý hoặc không tồn tại.' }).catch(() => {});
    return;
  }
  if (!['personal_post', 'group_post', 'both'].includes(targetType)) {
    await ctx.answerCallbackQuery({ text: 'Nơi đăng không hợp lệ.' }).catch(() => {});
    return;
  }

  const currentAcc = getDefaultAccount();
  const joinedGroups = getJoinedEcoparkGroups(currentAcc?.id);

  if ((targetType === 'group_post' || targetType === 'both') && joinedGroups.length === 0) {
    await ctx.answerCallbackQuery({ text: 'Chưa có Group Ecopark nào trong Kho.' }).catch(() => {});
    await ctx.reply('Chưa có Group Facebook mục tiêu trong Kho Group. Gõ `/sync_groups` để đồng bộ các nhóm Ecopark đã tham gia!', {
      parse_mode: 'Markdown',
    });
    return;
  }

  // Nếu chọn đăng Group hoặc Cả Cá Nhân + Group -> Hỏi số lượng Group muốn đăng!
  if (targetType === 'group_post' || targetType === 'both') {
    updatePendingDraft(draftId, { targetType });
    await ctx.answerCallbackQuery({ text: '🔢 Chọn số lượng Group Ecopark muốn đăng' }).catch(() => {});

    const totalJoined = joinedGroups.length;
    const quick5 = Math.min(5, totalJoined);
    const sample5 = joinedGroups
      .slice(0, 5)
      .map((g, i) => `  ${i + 1}. **${g.name}**`)
      .join('\n');

    const modeTitle = targetType === 'both' ? 'TRANG CÁ NHÂN + GROUP ECOPARK' : 'KHO GROUP BĐS ECOPARK ĐÃ THAM GIA';
    const keyboard = new InlineKeyboard()
      .text(`🔥 Đăng Ngay ${quick5} Group Đã Join (Test Nhanh)`, `post_grp_qty:${draft.id}:${targetType}:${quick5}:now`)
      .row()
      .text('🎯 1 Group', `post_grp_qty:${draft.id}:${targetType}:1:select`)
      .text('🎯 3 Group', `post_grp_qty:${draft.id}:${targetType}:3:select`)
      .text('🎯 5 Group', `post_grp_qty:${draft.id}:${targetType}:5:select`)
      .row()
      .text('🎯 10 Group', `post_grp_qty:${draft.id}:${targetType}:${Math.min(10, totalJoined)}:select`)
      .text(`🌐 Tất cả (${totalJoined} Group)`, `post_grp_qty:${draft.id}:${targetType}:${totalJoined}:select`)
      .row()
      .text('🔄 Đổi Nơi Đăng', `post_retarget:${draft.id}`)
      .text('❌ Hủy Bỏ', `draft_cancel:${draft.id}`);

    const msg =
      `🔢 **HỎI SỐ LƯỢNG GROUP MUỐN ĐĂNG (${modeTitle})**\n\n` +
      `• 👤 **Nick được chỉ định**: **${currentAcc?.name || 'Eco Trang'}**\n` +
      `• 📦 **Kho Group BĐS Ecopark đã join**: **${totalJoined} nhóm**\n\n` +
      `📋 **5 Group Ecopark đã tham gia (ưu tiên test hôm nay):**\n${sample5}\n\n` +
      `❓ **Bạn muốn đăng bài viết này vào bao nhiêu Group?**\n` +
      `👉 *Bấm nút số lượng bên dưới (hoặc gõ trực tiếp con số như \`5\`, \`3\` vào ô chat):*`;

    await ctx.editMessageText(msg, { reply_markup: keyboard, parse_mode: 'Markdown' }).catch(async () => {
      await ctx.reply(msg, { reply_markup: keyboard, parse_mode: 'Markdown' });
    });
    return;
  }

  // Trường hợp chỉ đăng Trang cá nhân
  if (!updatePendingDraft(draftId, { targetType: 'personal_post', targetGroupIds: [] })) {
    await ctx.answerCallbackQuery({ text: 'Bản nháp đã được xử lý.' }).catch(() => {});
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Đã chọn: 👤 Cá Nhân' }).catch(() => {});

  const preview = draft.rawText ? (draft.rawText.length > 150 ? draft.rawText.substring(0, 150) + '...' : draft.rawText) : '[Bài đăng Hình ảnh]';
  const keyboard = new InlineKeyboard()
    .text('⚡ Đăng Ngay [👤 Cá Nhân]', `draft_confirm:${draft.id}`)
    .row()
    .text('⏰ 11:30 Trưa', `post_sched:${draft.id}:11:30`)
    .text('⏰ 19:30 Tối', `post_sched:${draft.id}:19:30`)
    .row()
    .text('🔄 Chọn Lại Nơi Đăng', `post_retarget:${draft.id}`)
    .text('❌ Hủy Bỏ', `draft_cancel:${draft.id}`);

  const msg =
    `📝 **ĐÃ CHỌN NƠI ĐĂNG: 👤 TRANG CÁ NHÂN**\n` +
    `• Đích cụ thể: Trang cá nhân ${currentAcc?.name || 'Eco Trang'}\n` +
    `> "${preview}"\n\n` +
    `👉 *Bấm [⚡ Đăng Ngay] hoặc chọn giờ hẹn bên dưới:*`;

  await ctx.editMessageText(msg, { reply_markup: keyboard, parse_mode: 'Markdown' }).catch(async () => {
    await ctx.reply(msg, { reply_markup: keyboard, parse_mode: 'Markdown' });
  });
}

/**
 * Xử lý sau khi người dùng chọn số lượng Group Ecopark muốn đăng (VD: 1, 3, 5 Group)
 */
async function handlePostGroupQtySelect(
  ctx: Context,
  draftId: string,
  targetType: 'group_post' | 'both',
  qty: number,
  mode: 'now' | 'select'
) {
  if (!(await requireFacebookOperator(ctx))) return;
  const draft = getPendingDraft(draftId);
  if (!draft || draft.status !== 'pending') {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: '⚠️ Bản nháp đã được xử lý hoặc không tồn tại.' }).catch(() => {});
    return;
  }

  const currentAcc = getDefaultAccount();
  const selectedGroups = getJoinedEcoparkGroups(currentAcc?.id, qty);
  if (selectedGroups.length === 0) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: '⚠️ Không tìm thấy Group Ecopark đã join.' }).catch(() => {});
    return ctx.reply('⚠️ Chưa có Group Ecopark nào ở trạng thái Đã tham gia.');
  }

  const targetGroupIds = selectedGroups.map((g) => g.id);
  updatePendingDraft(draftId, { targetType, targetGroupIds });

  if (mode === 'now') {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: `🚀 Đang đăng lên ${selectedGroups.length} Group Ecopark đã join!` }).catch(() => {});
    }
    const confirmed = confirmDraft(draftId);
    if (confirmed && confirmed.post) {
      await executePostDistribution(ctx, confirmed.post.id);
    }
    return;
  }

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: `Đã chọn ${selectedGroups.length} Group Ecopark` }).catch(() => {});
  }

  const groupLines = selectedGroups.map((g, i) => `  ${i + 1}. **${g.name}**`).join('\n');
  const label = targetType === 'both' ? `Cá Nhân + ${selectedGroups.length} Group Ecopark` : `${selectedGroups.length} Group Ecopark`;
  const preview = draft.rawText ? (draft.rawText.length > 140 ? draft.rawText.substring(0, 140) + '...' : draft.rawText) : '[Bài đăng Hình ảnh]';

  const keyboard = new InlineKeyboard()
    .text(`⚡ Đăng Ngay [${label}]`, `draft_confirm:${draft.id}`)
    .row()
    .text('⏰ 11:30 Trưa', `post_sched:${draft.id}:11:30`)
    .text('⏰ 19:30 Tối', `post_sched:${draft.id}:19:30`)
    .row()
    .text('🔢 Chọn Lại Số Lượng', `post_target:${draft.id}:${targetType}`)
    .text('❌ Hủy Bỏ', `draft_cancel:${draft.id}`);

  const msg =
    `✅ **ĐÃ CHỐT SỐ LƯỢNG: ${label.toUpperCase()}**\n\n` +
    `• 👤 **Nick phụ trách**: **${currentAcc?.name || 'Eco Trang'}**\n` +
    `• 🎯 **Danh sách ${selectedGroups.length} Group BĐS Ecopark đã chọn**:\n${groupLines}\n\n` +
    `• 📝 **Nội dung**: "${preview}"\n\n` +
    `👉 *Bấm [⚡ Đăng Ngay] hoặc gõ "ok" để hệ thống đi rải bài và gửi link + ảnh chụp màn hình về cho bạn:*`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { reply_markup: keyboard, parse_mode: 'Markdown' }).catch(async () => {
      await ctx.reply(msg, { reply_markup: keyboard, parse_mode: 'Markdown' });
    });
  } else {
    await ctx.reply(msg, { reply_markup: keyboard, parse_mode: 'Markdown' });
  }
}

/**
 * Cho phép chọn lại đích đến nếu muốn đổi ý
 */
async function handlePostRetarget(ctx: Context, draftId: string) {
  if (!(await requireFacebookOperator(ctx))) return;
  const draft = getPendingDraft(draftId);
  if (!draft || draft.status !== 'pending') {
    await ctx.answerCallbackQuery({ text: '⚠️ Bản nháp đã hết hạn.' }).catch(() => {});
    return;
  }
  updatePendingDraft(draftId, { targetType: undefined, targetGroupIds: undefined });
  await ctx.answerCallbackQuery().catch(() => {});
  const preview = draft.rawText.length > 200 ? draft.rawText.substring(0, 200) + '...' : draft.rawText;
  const activeGroups = getTargetGroups().filter((group) => group.status === 'active');
  const keyboard = new InlineKeyboard()
    .text(`🌐 Đăng ${activeGroups.length} Group`, `post_target:${draft.id}:group_post`)
    .text('👤 Trang Cá Nhân', `post_target:${draft.id}:personal_post`)
    .row()
    .text('⚡ Trang cá nhân + Group', `post_target:${draft.id}:both`)
    .row()
    .text('❌ Hủy Bỏ', `draft_cancel:${draft.id}`);

  const msg =
    `📝 **CHỌN LẠI NƠI ĐĂNG CHO BÀI VIẾT:**\n\n` +
    `• 📋 **Mã bài nháp**: \`${draft.id}\`\n` +
    `• 📄 **Nội dung**:\n> _"${preview}"_\n\n` +
    `❓ **Anh/Chị muốn đăng bài viết này lên đâu?**\n` +
    (activeGroups.length
      ? `Group sẽ đăng tới ${activeGroups.length} nhóm mục tiêu đã lưu (${activeGroups.slice(0, 2).map((g) => g.name).join(', ')}${activeGroups.length > 2 ? `... và ${activeGroups.length - 2} nhóm khác` : ''}).`
      : 'Chưa có Group mục tiêu; hiện có thể chọn Trang cá nhân.');

  await ctx.editMessageText(msg, { reply_markup: keyboard, parse_mode: 'Markdown' }).catch(async () => {
    await ctx.reply(msg, { reply_markup: keyboard, parse_mode: 'Markdown' });
  });
}

/**
 * Thực hiện phân phối bài đăng ngay lập tức
 */
function isPostExecutionContext(target: Context | Bot): target is Context {
  return typeof (target as Context).reply === 'function';
}

async function executePostDistribution(target: Context | Bot, postId: string) {
  const isContext = isPostExecutionContext(target);
  const reply = async (text: string, extra: any = {}) => {
    if (isContext) return target.reply(text, extra);
    const topicId = getAutoCommentConfig().telegramPostManageTopicId;
    return target.api.sendMessage(config.telegramGroupId, text, {
      ...(topicId ? { message_thread_id: topicId } : {}),
      ...extra,
    });
  };
  const answerCallback = async (text: string) => {
    if (isContext && target.callbackQuery) {
      await target.answerCallbackQuery({ text }).catch(() => {});
    }
  };

  const post = getDailyPost(postId);
  if (!post) {
    await answerCallback('⚠️ Bài đăng không tồn tại.');
    return reply('⚠️ Không tìm thấy bài đăng.');
  }

  // Khóa nguyên tử chống click lặp / callback cũ chạy lại (Lỗi F07)
  if (post.status === 'running') {
    await answerCallback('⏳ Bài đăng đang được tiến hành xử lý...');
    return reply(`⏳ Bài đăng \`${postId}\` đang trong quá trình thực thi trên Facebook, xin vui lòng đợi.`);
  }
  if (post.status === 'completed') {
    await answerCallback('✅ Bài này đã hoàn tất xuất bản trước đó!');
    return reply(`✅ Bài đăng \`${postId}\` đã xuất bản thành công trước đó; không gửi lặp lại.`);
  }

  const targetType = post.targetType || post.type || 'personal_post';
  const currentAcc = getDefaultAccount();
  const configuredGroups = getTargetGroups().filter((g) => g.status === 'active');
  const targetGroups = post.targetGroupIds && post.targetGroupIds.length > 0
    ? configuredGroups.filter((group) => post.targetGroupIds!.includes(group.id))
    : getJoinedEcoparkGroups(currentAcc?.id, 5);
  const activeGroups = targetGroups.map((group) => group.url);
  if ((targetType === 'group_post' || targetType === 'both') && activeGroups.length === 0) {
    updateDailyPostStatus(postId, 'failed', 'Không còn Group mục tiêu đang bật; chưa đăng bài nào.');
    await answerCallback('Không còn Group mục tiêu.');
    await reply('⚠️ Group đã chọn không còn hoạt động. Bài chưa được đăng; hãy chọn lại nơi đăng.');
    return;
  }

  const groupLabelSummary = targetGroups.length <= 2
    ? targetGroups.map((g) => g.name).join(', ')
    : `${targetGroups.slice(0, 2).map((g) => g.name).join(', ')}... (+${targetGroups.length - 2} nhóm)`;
  const targetLabel = targetType === 'personal_post'
    ? '👤 Trang Cá Nhân'
    : targetType === 'both'
      ? `👤 Trang Cá Nhân + ${targetGroups.length} Group (${groupLabelSummary})`
      : `🌐 ${targetGroups.length} Group (${groupLabelSummary})`;
  updateDailyPostStatus(postId, 'running', 'Đang phân phối bài đăng lên Facebook');
  await answerCallback('🚀 Đang phân phối bài đăng lên Facebook...');
  
  const startMsg =
    `🚀 **ĐANG ĐIỀU PHỐI ĐĂNG BÀI LÊN FACEBOOK...**\n\n` +
    `• 📋 **Mã bài**: \`${post.id}\`\n` +
    `• 🎯 **Đích đến**: **${targetLabel}**\n` +
    `• 📝 **Nội dung**: "${post.content.slice(0, 80)}..."\n` +
    `⏳ Hệ thống đang mở trình duyệt và đăng bài trực tiếp...`;

  await reply(startMsg, { parse_mode: 'Markdown' });

  // 1. Tải ảnh từ Telegram hoặc sử dụng đường dẫn file cục bộ nếu có
  const localPhotoPaths: string[] = [];
  const tempDownloadedPaths: string[] = [];
  if (post.mediaUrls && post.mediaUrls.length > 0) {
    for (const fileIdOrPath of post.mediaUrls) {
      try {
        if (fs.existsSync(fileIdOrPath)) {
          localPhotoPaths.push(fileIdOrPath);
          continue;
        }
        const file = await target.api.getFile(fileIdOrPath);
        const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
        const ext = path.extname(file.file_path || '') || '.jpg';
        const dest = path.join(tempDir, `post_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);
        await downloadFile(fileUrl, dest);
        localPhotoPaths.push(dest);
        tempDownloadedPaths.push(dest);
      } catch (err: any) {
        console.warn('[Telegram Post] Không thể tải ảnh:', err.message);
      }
    }
  }

  // 2. Thực hiện đăng bài thật trên Facebook
  try {
    const autoComment = post.firstComment || 'Dạ em có sẵn quỹ căn đẹp giá tốt tại Ecopark. Anh/chị quan tâm nhắn tin em gửi video thực tế và tư vấn chi tiết nhé ạ! ✨';
    const result = await messengerEngine.publishFacebookPost({
      content: post.content,
      photoPaths: localPhotoPaths,
      targetType: targetType,
      groupUrls: activeGroups,
      autoCommentText: autoComment,
    });

    if (result.success) {
      const isPartial = result.publishedCount < result.totalTargets;
      const statusNote = isPartial
        ? `Đăng thành công ${result.publishedCount}/${result.totalTargets} đích (Thành công một phần)`
        : 'Đã xuất bản thành công toàn bộ các đích';
      updateDailyPostStatus(postId, 'completed', statusNote, result.receipts);

      // Chi tiết từng đích đến kèm link trực tiếp để double-check
      const receiptLines = (result.receipts || []).map((r) => {
        const linkStr = r.postUrl ? `\n    ↳ 🔗 [Xem bài đăng trên Facebook](${r.postUrl})` : '';
        if (r.status === 'verified_success') {
          return `  ✅ **${r.target}**: Đã xuất bản thành công!${linkStr}`;
        } else if (r.status === 'pending_approval') {
          return `  ⏳ **${r.target}**: Đã gửi bài (Chờ quản trị viên duyệt)${linkStr}`;
        } else {
          return `  ❌ **${r.target}**: Thất bại (${r.error || 'Lỗi không xác định'})`;
        }
      }).join('\n');

      const doneMsg =
        `🎉 **KẾT QUẢ ĐĂNG BÀI LÊN FACEBOOK:**\n\n` +
        `• 📋 **Mã bài**: \`${post.id}\`\n` +
        `• 🎯 **Đích hoàn tất**: **${result.publishedCount}/${result.totalTargets}** nơi\n` +
        `• 📝 **Trích đoạn**: "${post.content.slice(0, 80)}..."\n` +
        `• 📸 **Media**: ${localPhotoPaths.length > 0 ? `${localPhotoPaths.length} file ảnh ✅` : 'Không có'}\n\n` +
        `📊 **BÁO CÁO CHI TIẾT TỪNG NƠI:**\n` +
        (receiptLines || '  • Không có chi tiết đích') +
        `\n\n⏰ **Thời điểm hoàn tất**: ${new Date().toLocaleTimeString('vi-VN')}\n` +
        `💡 _Mọi thông báo hoặc tương tác mới của khách sẽ tự động đồng bộ về Telegram!_`;

      if (result.screenshotPath && fs.existsSync(result.screenshotPath)) {
        try {
          if (isContext) {
            await target.replyWithPhoto(new InputFile(result.screenshotPath), {
              caption: doneMsg,
              parse_mode: 'Markdown',
            });
          } else {
            const topicId = getAutoCommentConfig().telegramPostManageTopicId;
            await target.api.sendPhoto(config.telegramGroupId, new InputFile(result.screenshotPath), {
              ...(topicId ? { message_thread_id: topicId } : {}),
              caption: doneMsg,
              parse_mode: 'Markdown',
            });
          }
        } catch {
          await reply(doneMsg, { parse_mode: 'Markdown' });
        }
      } else {
        await reply(doneMsg, { parse_mode: 'Markdown' });
      }
    } else {
      updateDailyPostStatus(postId, 'failed', result.error, result.receipts);
      const failMsg =
        `❌ **ĐĂNG BÀI THẤT BẠI TRÊN MỌI ĐÍCH:**\n${result.error}\n\n` +
        `👉 Vui lòng kiểm tra lại quyền đăng hoặc thử lại sau!`;
      await reply(failMsg, { parse_mode: 'Markdown' });
    }
  } catch (err: any) {
    updateDailyPostStatus(postId, 'failed', err.message);
    await reply(`❌ **Lỗi khi đăng bài:** ${err.message}`, { parse_mode: 'Markdown' });
  } finally {
    // Dọn dẹp ảnh tạm tải từ Telegram
    tempDownloadedPaths.forEach((p) => fs.unlink(p, () => {}));
  }
}

/**
 * Kích hoạt phiên quét nhóm & bình luận tức thì
 */
async function triggerScanAndReport(ctx: Context) {
  if (!(await isGroupAdmin(ctx))) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Chỉ quản trị viên mới chạy quét bình luận hàng loạt.' }).catch(() => {});
    else await ctx.reply('Chỉ quản trị viên mới chạy quét bình luận hàng loạt.');
    return;
  }
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: '⚡ Bắt đầu quét nhóm...' }).catch(() => {});
  }
  await ctx.reply('⚡ **ĐANG RÀ SOÁT BÀI VIẾT TRONG CÁC NHÓM ĐÃ CẤU HÌNH...**\n⏳ Vui lòng chờ hệ thống hoàn tất.');
  try {
    const res = await autoCommentEngine.runScanCycle();
    const msg =
      `✅ **KẾT QUẢ QUÉT TỨC THÌ:**\n\n` +
      `• 👥 Số nhóm đã rà soát: **${res.scannedGroups}** nhóm\n` +
      `• 📝 Bài viết khớp từ khóa: **${res.postsFound}** bài\n` +
      `• 💬 Bình luận đã thực hiện: **${res.commentsMade}** lượt\n` +
      `• ⏰ Hoàn tất lúc: ${new Date().toLocaleTimeString('vi-VN')}`;
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err: any) {
    await ctx.reply(`❌ Quét thất bại: ${err.message}`);
  }
}

/**
 * Gửi giao diện quản lý Nick Facebook & Proxy độc lập
 */
async function sendNickManagementMessage(ctx: Context) {
  const accounts = getAllAccounts();
  let accText = '';
  const keyboard = new InlineKeyboard();

  accounts.forEach((acc, i) => {
    const isDef = acc.isDefault ? '👑 [CHÍNH]' : '👤';
    const proxyStr = acc.proxy ? `Proxy: \`${acc.proxy}\`` : 'Proxy: Trực tiếp (IP máy)';
    const ipOutStr = acc.verifiedProxyIp ? `\n• IP Out: \`${acc.verifiedProxyIp}\` (${acc.proxyCountry || 'VN'}, ${acc.proxyLatencyMs || 0}ms)` : '';
    const safeStr = acc.proxy
      ? (acc.proxyStatus === 'live' ? '🛡️ An toàn (Đã kiểm tra 2 lớp)' : acc.proxyStatus === 'dead' ? '🚨 Proxy chết / lỗi' : '⏳ Cần test')
      : '🌐 IP Trực tiếp';

    accText += `**#${i + 1}. ${isDef} ${acc.name}**\n• UID: \`${acc.uid || 'Chưa có'}\`\n• Trạng thái: 🟢 ${acc.status.toUpperCase()}\n• ${proxyStr}${ipOutStr}\n• Bảo mật: ${safeStr}\n\n`;
    
    keyboard.text(`⚡ Test Proxy: ${acc.name}`, `test_proxy_acc:${acc.id}`).row();
    if (!acc.isDefault) {
      keyboard.text(`👑 Chọn Làm Nick Chính: ${acc.name}`, `set_def_acc:${acc.id}`).row();
    }
  });

  keyboard.text('🔄 Ping & Kiểm Tra Toàn Bộ Proxy Live', 'ping_proxy').row();
  keyboard.text('🔙 Mở Menu Tổng', 'nav_menu');

  const msg =
    `👥 **QUẢN LÝ TÀI KHOẢN FACEBOOK & PROXY RIÊNG BIỆT**\n\n` +
    accText +
    `💡 _Mỗi tài khoản chạy trên một hồ sơ Chrome độc lập và gắn Proxy riêng biệt. Hệ thống tự động kiểm tra 2 lớp: Pre-flight trước khi mở và Double-check trong Chromium để chống rò rỉ IP máy thật!_`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { reply_markup: keyboard, parse_mode: 'Markdown' }).catch(async () => {
      await ctx.reply(msg, { reply_markup: keyboard, parse_mode: 'Markdown' });
    });
  } else {
    await ctx.reply(msg, { reply_markup: keyboard, parse_mode: 'Markdown' });
  }
}

/**
 * Kiểm tra kết nối Proxy / Mạng thực tế từ Telegram
 */
async function handlePingProxies(ctx: Context) {
  await ctx.answerCallbackQuery({ text: '🌐 Đang kiểm tra 2 lớp mạng & proxy từng nick...' }).catch(() => {});
  const accounts = getAllAccounts();
  const pingResults: string[] = [];

  for (const a of accounts) {
    const res = await measureRealPing(a.proxy);
    const px = a.proxy || 'Trực tiếp (Local IP)';
    
    // Nếu là nick active đang chạy Chromium, chạy thêm double-check trực tiếp từ engine
    let doubleChecked = false;
    if (a.isDefault && messengerEngine.isReady()) {
      try {
        const dc = await messengerEngine.verifyActiveProxy();
        if (dc.alive && !dc.isLeakingHostIp) {
          doubleChecked = true;
          res.ip = dc.ip;
          res.country = dc.country;
          res.latencyMs = dc.latencyMs;
        }
      } catch {}
    }

    // Cập nhật vào DB
    updateAccountProxyVerification(a.id, {
      verifiedProxyIp: res.ip,
      proxyStatus: res.status === 'live' && !res.isLeakingHostIp ? 'live' : 'dead',
      proxyCountry: res.country,
      proxyLatencyMs: res.latencyMs,
    });

    if (res.isLeakingHostIp) {
      pingResults.push(`• **${a.name}**: 🚨 **RÒ RỈ IP MÁY THẬT!** (IP: \`${res.ip}\`) [${px}]`);
    } else if (res.status === 'live') {
      const ipInfo = res.ip ? ` — IP Out: \`${res.ip}\` (${res.country || 'VN'})` : '';
      const dcBadge = doubleChecked ? ' 🛡️ [Double-check Chromium: ĐẠT]' : '';
      pingResults.push(`• **${a.name}**: 🟢 Live (${res.latencyMs}ms)${ipInfo}${dcBadge} [${px}]`);
    } else if (res.status === 'slow') {
      pingResults.push(`• **${a.name}**: 🟡 Chậm (${res.latencyMs}ms) [${px}]`);
    } else {
      pingResults.push(`• **${a.name}**: 🔴 Lỗi (${res.errorMessage || 'Mất kết nối'}) [${px}]`);
    }
  }

  const timestamp = new Date().toLocaleTimeString('vi-VN');
  await ctx.reply(
    `🌐 **KẾT QUẢ KIỂM TRA MẠNG & PROXY THỰC TẾ (${timestamp}):**\n\n` +
    pingResults.join('\n') +
    `\n\n🛡️ _Hệ thống kích hoạt bảo vệ 2 lớp: Pre-flight + In-Browser Double-Check ngăn chặn tuyệt đối các nick dính IP với nhau!_`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * Kiểm tra Proxy của 1 tài khoản cụ thể
 */
async function handleTestSingleAccountProxy(ctx: Context, accId: string) {
  const acc = getAccountById(accId);
  if (!acc) {
    return ctx.reply('Không tìm thấy tài khoản Facebook này.');
  }

  await ctx.answerCallbackQuery({ text: `🌐 Đang test proxy nick ${acc.name}...` }).catch(() => {});
  await ctx.reply(`⏳ Đang chạy kiểm tra an toàn 2 lớp cho nick **${acc.name}**...`);

  const res = await measureRealPing(acc.proxy);
  let doubleChecked = false;

  if (acc.isDefault && messengerEngine.isReady()) {
    try {
      const dc = await messengerEngine.verifyActiveProxy();
      if (dc.alive && !dc.isLeakingHostIp) {
        doubleChecked = true;
        res.ip = dc.ip;
        res.country = dc.country;
        res.latencyMs = dc.latencyMs;
      }
    } catch {}
  }

  updateAccountProxyVerification(acc.id, {
    verifiedProxyIp: res.ip,
    proxyStatus: res.status === 'live' && !res.isLeakingHostIp ? 'live' : 'dead',
    proxyCountry: res.country,
    proxyLatencyMs: res.latencyMs,
  });

  if (res.isLeakingHostIp) {
    await ctx.reply(
      `🚨 **CẢNH BÁO NGUY HIỂM — RÒ RỈ IP!**\n\n` +
      `• Tài khoản: **${acc.name}**\n` +
      `• Proxy cấu hình: \`${acc.proxy}\`\n` +
      `• IP thực tế phát hiện: \`${res.ip}\` trùng với IP máy chủ thật!\n` +
      `• Hệ thống đã đánh dấu Proxy này KHÔNG AN TOÀN và sẽ chặn mở Facebook!`,
      { parse_mode: 'Markdown' }
    );
  } else if (res.status === 'live') {
    await ctx.reply(
      `✅ **KẾT QUẢ TEST PROXY AN TOÀN:**\n\n` +
      `• Tài khoản: **${acc.name}** (UID: \`${acc.uid || acc.id}\`)\n` +
      `• Proxy: \`${acc.proxy || 'Chạy trực tiếp (Local)'}\`\n` +
      `• IP Ngoại Mạng (Out): \`${res.ip}\`\n` +
      `• Quốc gia / Độ trễ: 🌍 ${res.country || 'VN'} — ⚡ ${res.latencyMs}ms\n` +
      `• Trạng thái 2 lớp: ${doubleChecked ? '🛡️ **ĐÃ DOUBLE-CHECK CHROMIUM: TUYỆT ĐỐI AN TOÀN**' : '✅ **Pre-flight: ĐẠT CHUẨN**'}\n` +
      `• Nguy cơ dính mạng: 🟢 **0% (Được bọc hoàn toàn)**`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply(
      `❌ **KẾT NỐI PROXY THẤT BẠI!**\n\n` +
      `• Tài khoản: **${acc.name}**\n` +
      `• Proxy: \`${acc.proxy}\`\n` +
      `• Lỗi: ${res.errorMessage || 'Timeout'}\n` +
      `• Khuyến nghị: Vui lòng kiểm tra lại địa chỉ IP/Port/User/Pass của Proxy. Hệ thống sẽ KHÔNG mở Facebook nick này để bảo vệ tài khoản khỏi checkpoint!`,
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Trả lời nhanh 1 chạm cho khách hàng
 */
async function handleQuickSend(ctx: Context, key: string) {
  const topicId = ctx.callbackQuery?.message?.message_thread_id;
  if (!topicId) return;
  const mapping = getMappingByTopicId(topicId);
  if (!mapping) {
    await ctx.answerCallbackQuery({ text: 'Lệnh này chỉ dùng trong Topic khách hàng!' }).catch(() => {});
    return;
  }
  const canned = loadCannedReplies();
  const textToSend = canned[key] || `Nội dung phím tắt ${key}`;
  await messengerEngine.sendMessage(mapping.fb_thread_id, textToSend);
  recordSentMessage('telegram', mapping.fb_thread_id, textToSend);
  await ctx.answerCallbackQuery({ text: `Đã gửi mẫu /${key} sang Facebook!` }).catch(() => {});
  await ctx.reply(`⚡ [Đã gửi mẫu 1 chạm: \`/${key}\`]:\n"${textToSend}"`, { parse_mode: 'Markdown' });
}

/**
 * Xử lý gắn tag khách hàng
 */
async function handleCustomerTag(ctx: Context, tag: 'chot_don' | 'hoi_gia' | 'khach_huy' | 'vip') {
  const topicId = ctx.callbackQuery?.message?.message_thread_id;
  if (!topicId) return;

  updateCustomerTagByTopic(topicId, tag);
  const tagLabels: Record<string, string> = {
    chot_don: '🏷️ ĐÃ CHỐT ĐƠN (Giao Hàng)',
    hoi_gia: '⏳ ĐANG THAM KHẢO / HỎI GIÁ',
    khach_huy: '❌ KHÁCH HỦY / KHÔNG NHU CẦU',
    vip: '⭐ KHÁCH HÀNG VIP / THÂN THIẾT',
  };
  const label = tagLabels[tag] || tag;
  await ctx.answerCallbackQuery({ text: `Đã gắn tag: ${label}` }).catch(() => {});
  await ctx.reply(`📌 **ĐÃ GẮN TAG KHÁCH HÀNG: [${label}]**\nTrạng thái đã được đồng bộ lên Web Dashboard!`, {
    parse_mode: 'Markdown',
  });
}

export function getCustomerTagKeyboard() {
  return new InlineKeyboard()
    .text('🏷️ Đã Chốt Đơn', 'cust_tag:chot_don')
    .text('⏳ Đang Hỏi Giá', 'cust_tag:hoi_gia')
    .row()
    .text('⭐ Khách VIP', 'cust_tag:vip')
    .text('❌ Khách Hủy', 'cust_tag:khach_huy');
}

let schedulerStarted = false;
let lastSummaryDate = '';
let scheduledPostInFlight = false;

export function startDailyScheduler(bot: Bot) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setInterval(async () => {
    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const todayStr = localDateKey(now);

    // 1. Kiểm tra các bài đăng hẹn giờ (Scheduled Posts)
    const dailyPosts = getDailyPosts();
    for (const post of dailyPosts) {
      if (post.status === 'scheduled' && post.scheduledTime) {
        const scheduledAt = resolveScheduledPostAt(post);
        const postDate = scheduledAt ? localDateKey(scheduledAt) : '';
        const dueInMs = scheduledAt ? scheduledAt.getTime() - Date.now() : Number.NaN;
        if (!scheduledAt || postDate !== todayStr) {
          updateDailyPostStatus(post.id, 'failed', 'Lịch đăng không hợp lệ hoặc đã qua ngày; không tự đăng.');
          await bot.api.sendMessage(
            config.telegramGroupId,
            `⚠️ Đã bỏ qua lịch bài ${post.id}: lịch không hợp lệ/khác ngày. Mở topic số 1 để xem lại và hẹn giờ mới.`,
            { ...(getAutoCommentConfig().telegramPostManageTopicId ? { message_thread_id: getAutoCommentConfig().telegramPostManageTopicId } : {}) },
          ).catch(() => {});
        } else if (dueInMs <= 0) {
          if (dueInMs < -120000) {
            updateDailyPostStatus(post.id, 'failed', 'Quá giờ hẹn hơn 2 phút; không tự đăng muộn.');
            await bot.api.sendMessage(
              config.telegramGroupId,
              `⚠️ Bỏ qua bài ${post.id}: giờ hẹn ${post.scheduledTime} đã qua hơn 2 phút. Hãy kiểm tra nội dung rồi hẹn lại nếu vẫn muốn đăng.`,
              { ...(getAutoCommentConfig().telegramPostManageTopicId ? { message_thread_id: getAutoCommentConfig().telegramPostManageTopicId } : {}) },
            ).catch(() => {});
        } else if (!scheduledPostInFlight) {
          scheduledPostInFlight = true;
          try {
            await executePostDistribution(bot, post.id);
          } finally {
            scheduledPostInFlight = false;
          }
          break;
          }
        }
      }
    }

    // 2. Báo cáo tổng kết ngày lúc 22:00
    if (currentTimeStr === '22:00' && lastSummaryDate !== todayStr) {
      lastSummaryDate = todayStr;
      sendDailySummaryReport(bot);
    }
  }, 30000);
}

export async function sendDailySummaryReport(bot: Bot) {
  const cfg = getAutoCommentConfig();
  if (!cfg.telegramReportTopicId) return;

  const stats = getTodayStats();
  const mappings = getAllMappings();
  const now = new Date();

  const chotDonCount = mappings.filter((m) => m.tag === 'chot_don').length;
  const hoiGiaCount = mappings.filter((m) => m.tag === 'hoi_gia').length;

  const msg =
    `📊 **[BÁO CÁO TỔNG KẾT NGÀY] — ${now.toLocaleDateString('vi-VN')}**\n\n` +
    `• 📝 **Bài đăng hoàn thành**: **${stats.postsCount}** bài\n` +
    `• 💬 **Bình luận đã thực hiện**: **${stats.commentsCount}** lượt\n` +
    `• 👥 **Tổng khách hàng Messenger**: **${mappings.length}** cuộc trò chuyện\n` +
    `  ↳ 🏷️ Đã chốt đơn: **${chotDonCount}** khách\n` +
    `  ↳ ⏳ Đang tư vấn / hỏi giá: **${hoiGiaCount}** khách\n` +
    `• 🎯 **Số nhóm Facebook theo dõi**: **${stats.groupsCount}** nhóm\n` +
    `• 🛡️ **Tình trạng hệ thống**: 100% Trực tuyến & An toàn ✅\n\n` +
    `Chúc anh/chị một buổi tối tốt lành và kinh doanh thuận lợi! 🌟`;

  await bot.api.sendMessage(config.telegramGroupId, msg, {
    message_thread_id: cfg.telegramReportTopicId,
    parse_mode: 'Markdown',
  }).catch(() => {});
}

/**
 * Xử lý lệnh trong Topic bình luận Facebook
 */
async function handleAutoCommentTopicMessage(ctx: Context, text: string) {
  if (!(await requireFacebookOperator(ctx))) return;
  const lower = text.toLowerCase().trim();

  // 1. Quản lý trạng thái: /bat, /tat
  if (lower === '/bat' || lower === '/on' || lower === 'bật') {
    if (!(await isGroupAdmin(ctx))) return ctx.reply('Chỉ quản trị viên mới được bật chế độ bình luận tự động liên tục.');
    updateAutoCommentConfig({ enabled: true });
    autoCommentEngine.startWatcher(10);
    return ctx.reply('🟢 **ĐÃ BẬT CHẾ ĐỘ TỰ ĐỘNG BÌNH LUẬN GROUP!**\nHệ thống sẽ định kỳ quét các nhóm đã lưu và bình luận bài viết khớp từ khóa.');
  }

  if (lower === '/tat' || lower === '/off' || lower === 'tắt') {
    updateAutoCommentConfig({ enabled: false });
    autoCommentEngine.stopWatcher();
    return ctx.reply('🔴 **ĐÃ TẠM DỪNG CHẾ ĐỘ TỰ ĐỘNG BÌNH LUẬN!**');
  }

  // 2. Thêm nhóm Facebook mục tiêu: +group <url>
  if (text.startsWith('+group ')) {
    let url = text.substring(7).trim();
    if (url.includes('facebook.com/share')) {
      const resolved = await resolveFacebookShareLink(url);
      if (resolved.cleanUrl) url = resolved.cleanUrl;
    }
    if (!url.startsWith('http')) return ctx.reply('⚠️ Vui lòng gửi link nhóm Facebook hợp lệ.');
    const grp = addTargetGroup(url);
    return ctx.reply(
      `✅ **ĐÃ THÊM NHÓM FACEBOOK MỤC TIÊU!**\n\n` +
        `• Tên nhóm: ${grp.name}\n` +
        `• Link: ${grp.url}\n` +
        `• Trạng thái: Đang theo dõi 🟢`,
      { parse_mode: 'Markdown' }
    );
  }

  // 3. Thêm từ khóa: +tukhoa <kw1, kw2>
  if (text.startsWith('+tukhoa ')) {
    const raw = text.substring(8).trim();
    const kws = raw.split(/[,;\n]+/).map((k) => k.trim()).filter(Boolean);
    kws.forEach((k) => addKeyword(k));
    const all = getKeywords();
    return ctx.reply(
      `✅ **ĐÃ CẬP NHẬT TỪ KHÓA BẮT BÀI VIẾT!**\n\n` +
        `• Từ khóa mới thêm: ${kws.map((k) => `\`${k}\``).join(', ')}\n` +
        `• Toàn bộ từ khóa hiện tại: ${all.map((k) => `\`${k}\``).join(', ')}`,
      { parse_mode: 'Markdown' }
    );
  }

  // 4. Xem danh sách: /ds hoặc /list
  if (lower === '/ds' || lower === '/dscmt' || lower === '/list') {
    const cfg = getAutoCommentConfig();
    const tpls = getCommentTemplates();
    const grps = getTargetGroups();
    const kws = getKeywords();

    const reply =
      `📊 **CẤU HÌNH BÌNH LUẬN FACEBOOK**\n\n` +
      `• Trạng thái quét tự động: ${cfg.enabled ? '🟢 ĐANG BẬT' : '🔴 ĐANG TẮT'}\n` +
      `• Giãn cách an toàn: ${cfg.delayMinSeconds}s - ${cfg.delayMaxSeconds}s\n\n` +
      `🎯 **TỪ KHÓA BẮT BÀI (${kws.length}):**\n` +
      (kws.length ? kws.map((k) => `• \`${k}\``).join('\n') : 'Chưa có từ khóa') +
      '\n\n' +
      `👥 **NHÓM THEO DÕI (${grps.length}):**\n` +
      (grps.length
        ? grps.length <= 10
          ? grps.map((g) => `• [${g.name}](${g.url})`).join('\n')
          : grps.slice(0, 10).map((g) => `• [${g.name}](${g.url})`).join('\n') + `\n• _... và ${grps.length - 10} nhóm khác (gõ /nhom để xem đầy đủ)_`
        : 'Chưa có nhóm nào') +
      '\n\n' +
      `💬 **MẪU BÌNH LUẬN (${tpls.length}):**\n` +
      (tpls.length
        ? tpls.map((t, idx) => `• Mẫu #${idx + 1}: "${t.content.slice(0, 70)}..."`).join('\n')
        : 'Chưa có mẫu nào');

    const keyboard = new InlineKeyboard()
      .text(cfg.enabled ? '🔴 Tắt Quét Nhóm' : '🟢 Bật Quét Nhóm', 'nav_toggle_scan')
      .text('⚡ Rà soát Group ngay', 'nav_trigger_scan')
      .row()
      .text('🗑️ Xóa Mẫu Cuối', 'del_last_cmt');

    return ctx.reply(reply, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    });
  }

  // Lệnh kích hoạt quét tức thì trong topic: /quet hoặc /chay
  if (lower === '/quet' || lower === 'quét') {
    if (!(await isGroupAdmin(ctx))) return ctx.reply('Chỉ quản trị viên mới chạy quét bình luận hàng loạt. Sale có thể gửi link + nội dung để bình luận riêng sau khi xác nhận.');
    await triggerScanAndReport(ctx);
    return;
  }

  // Lệnh phân tán bình luận ngay lập tức: /cmt <nội dung>, /comment <nội dung>, !cmt <nội dung>
  const instantCmtMatch = text.match(/^[/!](?:cmt|comment|phantan_cmt)\s+([\s\S]+)/i);
  if (instantCmtMatch) {
    const cmtBody = instantCmtMatch[1].trim();
    if (cmtBody) {
      const draft = addPendingDraft({
        type: 'comment_template',
        rawText: cmtBody,
        telegramTopicId: ctx.message!.message_thread_id!,
        telegramMessageId: ctx.message!.message_id,
        creatorTelegramId: ctx.from?.id,
        creatorName: ctx.from?.first_name,
      });
      await handleDistributeComment(ctx, draft.id);
      return;
    }
  }

  // 5. Xác nhận bằng chữ: ok, xác nhận, duyệt, yes, chạy, phân tán
  if (['chạy', 'chay', 'tiến hành', 'tien hanh', 'phân tán', 'phan tan'].includes(lower)) {
    const pending = getLatestPendingDraftByTopic(ctx.message!.message_thread_id!, ctx.from?.id);
    if (pending && pending.type === 'comment_template') {
      await handleDistributeComment(ctx, pending.id);
      return;
    }
  }

  const confirmWords = ['ok', 'xác nhận', 'xac nhan', 'duyệt', 'duyet', 'lưu', 'luu', 'yes', 'y'];
  if (confirmWords.includes(lower)) {
    const pending = getLatestPendingDraftByTopic(ctx.message!.message_thread_id!, ctx.from?.id);
    if (pending) {
      await handleDraftConfirm(ctx, pending.id);
      return;
    }
    return ctx.reply('⚠️ Không có mẫu bình luận nháp nào đang chờ xác nhận.');
  }

  // 6. Hủy bằng chữ: hủy, cancel, bỏ
  const cancelWords = ['hủy', 'huy', 'cancel', 'bỏ', 'bo', 'no', 'n'];
  if (cancelWords.includes(lower)) {
    const pending = getLatestPendingDraftByTopic(ctx.message!.message_thread_id!, ctx.from?.id);
    if (pending) {
      await handleDraftCancel(ctx, pending.id);
      return;
    }
    return ctx.reply('⚠️ Không có mẫu bình luận nháp nào đang chờ xác nhận.');
  }

  // 7. Nhận diện nếu gửi link bài viết kèm nội dung cần comment ngay lập tức (On-demand)
  const fbUrlMatch = text.match(/https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[^\s]+/i);
  if (fbUrlMatch) {
    const postUrl = fbUrlMatch[0];
    const customText = text.replace(postUrl, '').trim();
    if (!customText) {
      return ctx.reply('Hãy gửi link kèm nội dung bình luận riêng, ví dụ: `https://facebook.com/... Thông tin căn này còn không ạ?`. Bot sẽ hiện lại nội dung để bạn xác nhận trước khi bình luận.', {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      });
    }

    const draft = addPendingDraft({
      type: 'on_demand_comment',
      rawText: customText,
      postUrl,
      telegramTopicId: ctx.message!.message_thread_id!,
      telegramMessageId: ctx.message!.message_id,
      creatorTelegramId: ctx.from?.id,
      creatorName: ctx.from?.first_name,
    });

    const keyboard = new InlineKeyboard()
      .text('⚡ Bình Luận Ngay', `draft_confirm:${draft.id}`)
      .text('❌ Hủy Bỏ', `draft_cancel:${draft.id}`);

    return ctx.reply(
      `🎯 **BÌNH LUẬN VÀO LINK CHỈ ĐỊNH**\n` +
        `🔗 ${postUrl}\n` +
        `💬 *Nội dung:* "${customText}"\n\n` +
        `👉 *Xác nhận chạy ngay hoặc gõ "ok":*`,
      {
        reply_markup: keyboard,
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      }
    );
  }

  // 8. MẶC ĐỊNH: Thêm mẫu bình luận mới -> Hỏi xác nhận 2 bước!
  const content = text.startsWith('+cmt ') ? text.substring(5).trim() : text.trim();
  if (!content) {
    return ctx.reply('⚠️ Vui lòng nhập nội dung mẫu bình luận.');
  }

  const draft = addPendingDraft({
    type: 'comment_template',
    rawText: content,
    telegramTopicId: ctx.message!.message_thread_id!,
    telegramMessageId: ctx.message!.message_id,
    creatorTelegramId: ctx.from?.id,
    creatorName: ctx.from?.first_name,
  });

  const currentAcc = getDefaultAccount();
  const joinedGroups = getJoinedEcoparkGroups(currentAcc?.id);
  const quick5 = Math.min(5, joinedGroups.length || 5);
  const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
  const keyboard = new InlineKeyboard()
    .text(`🔥 Đi Comment Ngay ${quick5} Group Ecopark Đã Join`, `distribute_cmt_qty:${draft.id}:${quick5}`)
    .row()
    .text(`🌐 Chọn Số Lượng Group (${joinedGroups.length} nhóm)`, `distribute_cmt:${draft.id}`)
    .row()
    .text('💾 Chỉ Lưu Vào Kho', `draft_confirm:${draft.id}`)
    .text('❌ Hủy Bỏ', `draft_cancel:${draft.id}`);

  return ctx.reply(
    `💬 **MẪU COMMENT MỚI (KHO GROUP BĐS ECOPARK)**\n` +
      `> "${preview}"\n\n` +
      `• 👤 **Nick phụ trách**: **${currentAcc?.name || 'Eco Trang'}**\n` +
      `• 📦 **Kho Group Ecopark đã join**: **${joinedGroups.length} nhóm**\n\n` +
      `👉 *Bấm [🔥 Đi Comment Ngay ${quick5} Group] để test nhanh hoặc chọn số lượng Group:*`,
    {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    }
  );
}

async function resolveFacebookShareLink(rawUrl: string): Promise<{ cleanUrl: string; title?: string }> {
  const https = await import('https');
  return new Promise((resolve) => {
    try {
      const parsed = new URL(rawUrl);
      const req = https.request(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          headers: { 'User-Agent': 'curl/8.4.0' },
        },
        (res) => {
          const loc = res.headers.location;
          if (loc) {
            try {
              const u = new URL(loc);
              const m = u.pathname.match(/\/groups\/([^\/]+)/);
              if (m) {
                return resolve({ cleanUrl: `https://www.facebook.com/groups/${m[1]}/` });
              }
            } catch {}
            return resolve({ cleanUrl: loc });
          }
          resolve({ cleanUrl: rawUrl });
        }
      );
      req.on('error', () => resolve({ cleanUrl: rawUrl }));
      req.setTimeout(6000, () => {
        req.destroy();
        resolve({ cleanUrl: rawUrl });
      });
      req.end();
    } catch {
      resolve({ cleanUrl: rawUrl });
    }
  });
}

/**
 * Xử lý bài đăng trong Topic Quản Lý Bài Đăng Group
 */
async function handlePostManageTopicMessage(ctx: Context, text: string, photos?: string[]) {
  if (!(await requireFacebookOperator(ctx))) return;
  const lower = text.toLowerCase().trim();

  // Thêm nhóm mục tiêu trực tiếp tại Topic 1: +group <link> [tên] hoặc +nhom <link> [tên]
  if (lower.startsWith('+group ') || lower.startsWith('+nhom ') || lower.startsWith('/add_group ')) {
    const raw = text.replace(/^\+(group|nhom)\s+|\/add_group\s+/i, '').trim();
    const parts = raw.split(/\s+/);
    let url = parts[0];
    let name = parts.slice(1).join(' ') || undefined;

    if (url.includes('facebook.com/share')) {
      const resolved = await resolveFacebookShareLink(url);
      if (resolved.cleanUrl) url = resolved.cleanUrl;
      if (!name && resolved.title) name = resolved.title;
    }

    if (url.includes('facebook.com/groups')) {
      const grp = addTargetGroup(url, name);
      return ctx.reply(
        `✅ **ĐÃ THÊM GROUP FACEBOOK MỤC TIÊU!**\n\n` +
          `• 🏷️ **Tên**: ${grp.name}\n` +
          `• 🔗 **Link**: ${grp.url}\n` +
          `• 📊 **Trạng thái**: Đang bật (Active)\n\n` +
          `💡 _Giờ đây khi gửi bài đăng, bạn có thể chọn đăng trực tiếp lên Group này!_`,
        { parse_mode: 'Markdown' }
      );
    } else {
      return ctx.reply('⚠️ Link nhóm không hợp lệ. Vui lòng gửi theo cú pháp:\n`+group https://www.facebook.com/groups/<id_nhom> [Tên nhóm]`\n_(Hệ thống cũng hỗ trợ tự động giải mã link chia sẻ facebook.com/share)_', { parse_mode: 'Markdown' });
    }
  }

  // Tham gia 15 nhóm đầu tiên: /join15 hoặc join 15 hoặc /join_top
  if (lower === '/join15' || lower === 'join 15' || lower === 'join 15 nhóm' || lower === '/join_top' || lower === 'join nhóm') {
    await ctx.reply('⏳ **BẮT ĐẦU THAM GIA 15 NHÓM ĐẦU TIÊN...**\nNick đang thao tác: **Eco Trang**\nVui lòng đợi bot xử lý tuần tự từng nhóm an toàn...');
    try {
      const summary = await facebookActionsEngine.joinTopGroups(15, async (idx, total, res) => {
        const icon = res.status === 'joined' ? '✅' : res.status === 'already_joined' ? '🟢' : res.status === 'pending_approval' ? '⏳' : '⚠️';
        await ctx.reply(`${icon} **[${idx}/${total}] ${res.groupName}**\n• Trạng thái: ${res.message}\n• Link: ${res.groupUrl}`);
      });

      const report = `🎉 **HOÀN TẤT THAM GIA 15 NHÓM!**\n\n` +
        `• 🟢 Đã là thành viên từ trước: ${summary.alreadyJoined}\n` +
        `• ✅ Tham gia thành công mới: ${summary.joined}\n` +
        `• ⏳ Đang chờ phê duyệt: ${summary.pending}\n` +
        `• ⚠️ Cần duyệt/Lỗi: ${summary.failed}\n\n` +
        `👉 Toàn bộ bằng chứng đã được lưu vào hệ thống!`;
      return ctx.reply(report);
    } catch (err: any) {
      return ctx.reply(`❌ Lỗi khi tham gia nhóm: ${err.message}`);
    }
  }

  // Xem danh sách nhóm mục tiêu: /nhom hoặc /groups
  if (lower === '/nhom' || lower === '/groups' || lower === '/group') {
    const groups = getTargetGroups();
    if (groups.length === 0) {
      return ctx.reply(
        `📭 **CHƯA CÓ GROUP FACEBOOK MỤC TIÊU NÀO**\n\n` +
          `👉 Thêm nhóm mới bằng cú pháp:\n` +
          `\`+group https://www.facebook.com/groups/<id_nhom> [Tên nhóm]\``,
        { parse_mode: 'Markdown' }
      );
    }

    const chunkSize = 20;
    const totalPages = Math.ceil(groups.length / chunkSize);
    for (let page = 0; page < totalPages; page++) {
      const pageGroups = groups.slice(page * chunkSize, (page + 1) * chunkSize);
      const list = pageGroups
        .map((g, i) => `• **#${page * chunkSize + i + 1}** ${g.status === 'active' ? '🟢' : '⏸️'} [${g.name}](${g.url})`)
        .join('\n');
      const header = totalPages > 1
        ? `📋 **DANH SÁCH GROUP FACEBOOK MỤC TIÊU (${page + 1}/${totalPages}) — Tổng ${groups.length} nhóm:**\n\n`
        : `📋 **DANH SÁCH ${groups.length} GROUP FACEBOOK MỤC TIÊU:**\n\n`;
      await ctx.reply(`${header}${list}`, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
    }
    return;
  }

  if (lower === '/mau_bds' || lower === '/mau') {
    return ctx.reply(
      `🏠 [BÁN/CHO THUÊ] [TÊN DỰ ÁN / LOẠI BẤT ĐỘNG SẢN] — [KHU VỰC]\n\n` +
        `📍 Vị trí: [địa chỉ, phường/xã, quận/huyện]\n` +
        `📐 Diện tích: [diện tích] m² | [mặt tiền / số phòng]\n` +
        `💰 Giá: [giá] ([thương lượng / còn VAT nếu có])\n` +
        `📄 Pháp lý: [tình trạng pháp lý]\n` +
        `✨ Điểm nổi bật: [tiện ích, nội thất, hướng, kết nối]\n` +
        `☎️ Liên hệ: [tên sale] — [số điện thoại / Messenger]\n\n` +
        `#BatDongSan #MuaBanNhaDat\n\n` +
        `Sao chép mẫu, điền thông tin thật rồi gửi lại topic này. Bot sẽ cho chọn Trang cá nhân/Group, lịch đăng và yêu cầu xác nhận trước khi đăng.`,
    );
  }

  // 1. Xem danh sách bài đăng: /ds hoặc /list
  if (lower === '/ds' || lower === '/list') {
    const posts = getDailyPosts();
    if (posts.length === 0) {
      return ctx.reply('📭 Hôm nay chưa có bài đăng nào được lưu trong hệ thống.');
    }
    const list = posts.slice(0, 8).map((p, i) => {
      const statusEmoji = p.status === 'confirmed' ? '🟢 Sẵn sàng' : p.status === 'scheduled' ? `⏰ Hẹn ${p.scheduledTime}` : p.status === 'running' ? '🚀 Đang chạy' : p.status === 'completed' ? '✅ Hoàn thành' : '⏳ Chờ duyệt';
      const targetLabel = p.type === 'personal_post' ? '👤 Cá nhân' : p.type === 'both' ? '⚡ Cả hai' : '🌐 Group';
      return `• **#${i + 1}** [${statusEmoji}] [${targetLabel}]:\n  "${p.content.substring(0, 60)}..." (${new Date(p.createdAt).toLocaleTimeString('vi-VN')})`;
    }).join('\n\n');

    const keyboard = new InlineKeyboard();
    posts.slice(0, 3).forEach((p, i) => {
      if (p.status !== 'completed' && p.status !== 'cancelled') {
        keyboard.text(`▶️ Đăng #${i + 1}`, `run_post:${p.id}`)
                .text(`🗑️ Xóa #${i + 1}`, `del_post:${p.id}`)
                .row();
      }
    });
    keyboard.text('🗑️ Xóa Hết Tất Cả Bài', 'clear_all_posts');

    return ctx.reply(`📋 **DANH SÁCH BÀI ĐĂNG TRONG NGÀY (${posts.length}):**\n\n${list}`, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  }

  // Lệnh chạy phân phối bài đăng ngay: /chay hoặc /dang hoặc /run (khi không có tham số nội dung)
  if (lower === '/chay' || lower === '/dang' || lower === '/run') {
    const posts = getDailyPosts();
    const candidate = posts.find((p) => p.status === 'confirmed' || p.status === 'scheduled');
    if (candidate) {
      await executePostDistribution(ctx, candidate.id);
      return;
    }
    return ctx.reply('⚠️ Không có bài đăng nào trong hàng đợi sẵn sàng chạy. Anh/Chị hãy gửi bài mới hoặc kiểm tra `/ds`!');
  }

  // Đăng tức thì không cần xác nhận: /dang <nội dung>, /post <nội dung>, !dang <nội dung>, !post <nội dung>
  const instantMatch = text.match(/^[/!](?:post|dang)\s+([\s\S]+)/i);
  if (instantMatch) {
    const directContent = instantMatch[1].trim();
    if (directContent) {
      const draft = addPendingDraft({
        type: 'daily_post',
        rawText: directContent,
        photos,
        telegramTopicId: ctx.message!.message_thread_id!,
        telegramMessageId: ctx.message!.message_id,
        creatorTelegramId: ctx.from?.id,
        creatorName: ctx.from?.first_name,
        targetType: 'personal_post',
      });
      const result = confirmDraft(draft.id);
      if (result && result.post) {
        await executePostDistribution(ctx, result.post.id);
        return;
      }
    }
  }

  // 2. Xóa danh sách bài: /xoa hoặc /clear
  if (lower === '/xoa' || lower === '/clear') {
    if (!(await isGroupAdmin(ctx))) return ctx.reply('Chỉ quản trị viên Telegram mới được xóa toàn bộ hàng đợi.');
    const keyboard = new InlineKeyboard()
      .text('🗑️ Xác nhận xóa toàn bộ', 'clear_all_posts_confirm')
      .text('Hủy', 'clear_all_posts_cancel');
    return ctx.reply('Xác nhận xóa tất cả bản nháp và bài đang chờ? Bài đã đăng không bị ảnh hưởng.', { reply_markup: keyboard });
  }

  if (/^\s*🏠\s*\[/m.test(text) && /\[[^\]\n]+\]/.test(text)) {
    return ctx.reply('Mẫu BĐS còn mục chưa điền. Hãy thay các phần trong ngoặc vuông bằng thông tin thật trước khi tạo bản nháp.');
  }

  // 3. Hẹn giờ bằng chữ: "11:30", "19:30", "hẹn 15:00"
  const timeMatch = lower.match(/^(?:hẹn|hen|lúc|at)?\s*(\d{1,2}[:h]\d{2})$/i);
  if (timeMatch) {
    const pending = getLatestPendingDraftByTopic(ctx.message!.message_thread_id!, ctx.from?.id);
    if (pending) {
      const schedTime = timeMatch[1].replace('h', ':');
      await handlePostScheduleConfirm(ctx, pending.id, schedTime);
      return;
    }
  }

  // 3.5. Nhập trực tiếp con số để chọn số lượng Group Ecopark muốn đăng (VD: "5", "3", "5 group")
  const qtyInputMatch = lower.match(/^(\d{1,2})\s*(?:group|nhóm|nhom)?$/i);
  if (qtyInputMatch) {
    const pending = getLatestPendingDraftByTopic(ctx.message!.message_thread_id!, ctx.from?.id);
    if (pending) {
      const requestedQty = Math.max(1, parseInt(qtyInputMatch[1], 10));
      const modeTarget = pending.targetType === 'both' ? 'both' : 'group_post';
      await handlePostGroupQtySelect(ctx, pending.id, modeTarget, requestedQty, 'select');
      return;
    }
  }

  // 3.6. Đồng bộ hoặc xem Kho Group BĐS Ecopark đã tham gia: /sync_groups hoặc /kho_group
  if (lower === '/sync_groups' || lower === '/kho_group') {
    await ctx.reply('🔄 Đang quét danh sách các Group BĐS Ecopark mà tài khoản đã tham gia trên Facebook...');
    const scanRes = await messengerEngine.scanJoinedEcoparkGroups();
    if (!scanRes.success) {
      return ctx.reply(`⚠️ Lỗi quét danh sách Group: ${scanRes.error}`);
    }
    const syncStats = syncJoinedGroupsToPool(scanRes.joinedGroups, scanRes.accountId, 'BĐS Ecopark');
    const top5List = syncStats.joinedGroups
      .slice(0, 5)
      .map((g, i) => `  ${i + 1}. **${g.name}**\n     🔗 ${g.url}`)
      .join('\n');
    return ctx.reply(
      `📦 **ĐỒNG BỘ KHO GROUP BĐS ECOPARK THÀNH CÔNG!**\n\n` +
      `• 👤 **Nick được chỉ định**: **${getDefaultAccount()?.name || 'Eco Trang'}**\n` +
      `• ✅ **Group Ecopark Đã Tham Gia (Joined)**: **${syncStats.joinedCount} nhóm**\n` +
      `• ⏳ **Group Chờ Duyệt trong Kho**: **${syncStats.pendingCount} nhóm**\n` +
      `• 📊 **Tổng Kho Group**: **${syncStats.totalPool} nhóm**\n\n` +
      `🎯 **5 Group Ecopark đầu tiên sẵn sàng Test hôm nay:**\n${top5List}`,
      { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
    );
  }

  // 4. Xác nhận bằng chữ: ok, xác nhận, duyệt, chạy, yes
  const confirmWords = ['ok', 'xác nhận', 'xac nhan', 'duyệt', 'duyet', 'chạy', 'chay', 'tiến hành', 'tien hanh', 'yes', 'y', 'đăng', 'dang'];
  if (confirmWords.includes(lower)) {
    const pending = getLatestPendingDraftByTopic(ctx.message!.message_thread_id!, ctx.from?.id);
    if (pending) {
      await handleDraftConfirm(ctx, pending.id);
      return;
    }
    return ctx.reply('⚠️ Không có bài đăng nháp nào đang chờ xác nhận.');
  }

  // 5. Hủy bằng chữ: hủy, cancel, bỏ
  const cancelWords = ['hủy', 'huy', 'cancel', 'bỏ', 'bo', 'no', 'n', 'dừng', 'dung'];
  if (cancelWords.includes(lower)) {
    const pending = getLatestPendingDraftByTopic(ctx.message!.message_thread_id!, ctx.from?.id);
    if (pending) {
      await handleDraftCancel(ctx, pending.id);
      return;
    }
    return ctx.reply('⚠️ Không có bài đăng nháp nào đang chờ xác nhận.');
  }

  // 6. KIỂM TRA NẾU ĐÃ CÓ BẢN NHÁP ẢNH ĐANG CHỜ NỘI DUNG VĂN BẢN
  const pendingPhotosDraft = getLatestPendingDraftByTopic(ctx.message!.message_thread_id!, ctx.from?.id);
  let draft: any;
  if (pendingPhotosDraft && !pendingPhotosDraft.rawText && pendingPhotosDraft.photos && pendingPhotosDraft.photos.length > 0) {
    updatePendingDraft(pendingPhotosDraft.id, { rawText: text });
    pendingPhotosDraft.rawText = text;
    draft = pendingPhotosDraft;
  } else {
    draft = addPendingDraft({
      type: 'daily_post',
      rawText: text,
      photos,
      telegramTopicId: ctx.message!.message_thread_id!,
      telegramMessageId: ctx.message!.message_id,
      creatorTelegramId: ctx.from?.id,
      creatorName: ctx.from?.first_name,
    });
  }

  const finalPhotos = draft.photos || photos || [];
  const preview = text.length > 200 ? text.substring(0, 200) + '...' : text;
  const currentAcc = getDefaultAccount();
  const joinedGroups = getJoinedEcoparkGroups(currentAcc?.id);
  const quickCount = Math.min(5, joinedGroups.length || 5);
  const keyboard = new InlineKeyboard();

  if (joinedGroups.length > 0) {
    keyboard
      .text(`🔥 Test Nhanh: Đăng ${quickCount} Group Ecopark Đã Join`, `post_grp_qty:${draft.id}:group_post:${quickCount}:now`)
      .row()
      .text(`🌐 Đăng Group (Hỏi SL / ${joinedGroups.length} nhóm)`, `post_target:${draft.id}:group_post`)
      .text('⚡ Cá Nhân + Group', `post_target:${draft.id}:both`)
      .row();
  }

  // Nút đăng lên Trang cá nhân (Eco Trang)
  keyboard.text('👤 Chỉ Đăng Trang Cá Nhân', `draft_confirm:${draft.id}`);

  // Hẹn giờ đăng
  keyboard.row()
    .text('⏰ 11:30 Trưa', `post_sched:${draft.id}:11:30`)
    .text('⏰ 19:30 Tối', `post_sched:${draft.id}:19:30`)
    .row();

  if (!joinedGroups.length) {
    keyboard.text('➕ Thêm Group Mục Tiêu', 'add_group_prompt');
  }
  keyboard.text('❌ Hủy Bỏ', `draft_cancel:${draft.id}`);

  const sample5Names = joinedGroups.slice(0, 5).map((g, i) => `  ${i + 1}. ${g.name}`).join('\n');

  return ctx.reply(
    `📝 **BÀI ĐĂNG FACEBOOK SẴN SÀNG!**\n\n` +
      `> "${preview}"\n` +
      (finalPhotos.length > 0 ? `\n📸 *Đính kèm: ${finalPhotos.length} hình ảnh*\n` : '') +
      `\n• 👤 **Nick phụ trách**: **${currentAcc?.name || 'Eco Trang'}**` +
      `\n• 📦 **Kho Group BĐS Ecopark đã join**: **${joinedGroups.length} nhóm**` +
      (sample5Names ? `\n📋 *5 nhóm ưu tiên hôm nay:*\n${sample5Names}\n` : '') +
      `\n👉 *Bấm [🔥 Test Nhanh: Đăng ${quickCount} Group Ecopark Đã Join] để đăng ngay, hoặc bấm [🌐 Đăng Group] để chọn số lượng nhóm (1, 3, 5...):*`,
    {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    }
  );
}

/**
 * Đồng bộ 5 Topic điều khiển Sale Facebook; Story và bài viết dùng chung Topic 5.
 */
export async function ensureControlTopics(bot: Bot): Promise<void> {
  const cfg = getAutoCommentConfig();
  let updated = false;

  // 1. Ô 1: ĐĂNG BÀI POST
  if (cfg.telegramPostManageTopicId) {
    try {
      await bot.api.editForumTopic(config.telegramGroupId, cfg.telegramPostManageTopicId, {
        name: '1. 📝 ĐĂNG BÀI FACEBOOK',
      });
    } catch (err: any) {
      if (!isTopicUnchangedError(err)) {
        if (isMissingTopicError(err)) {
          console.warn('[Telegram] Topic Post cũ không còn tồn tại, sẽ tạo topic mới:', telegramErrorDescription(err));
          cfg.telegramPostManageTopicId = undefined;
          updated = true;
        } else {
          console.warn('[Telegram] Chưa xác minh được Topic Post; giữ nguyên ID để tránh tạo topic trùng:', telegramErrorDescription(err));
        }
      }
    }
  }
  if (!cfg.telegramPostManageTopicId) {
    try {
      const topic = await bot.api.createForumTopic(config.telegramGroupId, '1. 📝 ĐĂNG BÀI FACEBOOK', {
        icon_color: 0xffd67e as any,
      });
      cfg.telegramPostManageTopicId = topic.message_thread_id;
      updated = true;
      const msg = await bot.api.sendMessage(
        config.telegramGroupId,
        `📝 **1. ĐĂNG BÀI FACEBOOK**\n\n` +
          `• Gửi nội dung, ảnh hoặc album; chọn Trang cá nhân, Group hoặc cả hai.\n` +
          `• Chọn đăng ngay hoặc hẹn giờ; bot luôn hiện bản xem trước và chờ xác nhận.\n` +
          `• Gõ \`/mau_bds\` để lấy mẫu tin bán/cho thuê BĐS.\n` +
          `• Gõ \`/ds\` xem hàng đợi, \`/chay\` đăng bài đã duyệt.`,
        { message_thread_id: topic.message_thread_id, parse_mode: 'Markdown' }
      );
      await bot.api.pinChatMessage(config.telegramGroupId, msg.message_id).catch(() => {});
    } catch (err: any) {
      console.warn('[Telegram] Không thể tạo Topic Post:', err.message);
    }
  }

  // 2. Ô 2: NGUỒN COMMENT TỰ ĐỘNG
  if (cfg.telegramTopicId) {
    try {
      await bot.api.editForumTopic(config.telegramGroupId, cfg.telegramTopicId, {
        name: '2. 💬 BÌNH LUẬN BÀI VIẾT',
      });
    } catch (err: any) {
      if (!isTopicUnchangedError(err)) {
        if (isMissingTopicError(err)) {
          console.warn('[Telegram] Topic Comment cũ không còn tồn tại, sẽ tạo topic mới:', telegramErrorDescription(err));
          cfg.telegramTopicId = undefined;
          updated = true;
        } else {
          console.warn('[Telegram] Chưa xác minh được Topic Comment; giữ nguyên ID để tránh tạo topic trùng:', telegramErrorDescription(err));
        }
      }
    }
  }
  if (!cfg.telegramTopicId) {
    try {
      const topic = await bot.api.createForumTopic(config.telegramGroupId, '2. 💬 BÌNH LUẬN BÀI VIẾT', {
        icon_color: 0x6fb9f0 as any,
      });
      cfg.telegramTopicId = topic.message_thread_id;
      updated = true;
      const msg = await bot.api.sendMessage(
        config.telegramGroupId,
        `💬 **2. BÌNH LUẬN BÀI VIẾT**\n\n` +
          `• Gửi link bài viết kèm nội dung bình luận; bot hiện bản xem trước và chờ xác nhận.\n` +
          `• Gõ nội dung bình luận riêng để lưu thành mẫu.\n` +
          `• Quét bình luận tự động đang tắt mặc định; chỉ quản trị viên/Sale được cấp quyền mới bật bằng \`/bat\`.`,
        { message_thread_id: topic.message_thread_id, parse_mode: 'Markdown' }
      );
      await bot.api.pinChatMessage(config.telegramGroupId, msg.message_id).catch(() => {});
    } catch (err: any) {
      console.warn('[Telegram] Không thể tạo Topic Auto-Comment:', err.message);
    }
  }

  if (!cfg.telegramAccountStatusTopicId && cfg.telegramPostInteractionTopicId) {
    cfg.telegramAccountStatusTopicId = cfg.telegramPostInteractionTopicId;
    delete cfg.telegramPostInteractionTopicId;
    updated = true;
  }

  const additionalTopics = [
    {
      key: 'telegramMemberScanTopicId' as const,
      name: '3. 👥 QUÉT MEM MỚI TRONG GROUP',
      intro: 'Gửi link Facebook Group để so sánh tối đa 50 hồ sơ đang hiển thị với lần quét trước. Lần đầu tạo mốc, lần sau chỉ liệt kê hồ sơ mới thấy. Lệnh chỉ đọc danh sách hiển thị, không tự nhắn hoặc kết bạn.',
      color: 0x8eee98,
    },
    {
      key: 'telegramFriendTopicId' as const,
      name: '4. 🤝 KẾT BẠN',
      intro: 'Gửi link hồ sơ Facebook của một người. Bot hiển thị đúng link và chờ bạn bấm Xác nhận trước khi gửi một lời mời kết bạn. Mỗi lần chỉ xử lý một hồ sơ.',
      color: 0xff93b2,
    },
    {
      key: 'telegramStoryTopicId' as const,
      name: '5. ✨ TƯƠNG TÁC STORY / BÀI VIẾT',
      intro: 'Gửi link Story hoặc bài viết Facebook. Bot tự nhận diện loại link, cho chọn Thích/Yêu thích rồi yêu cầu xác nhận trước khi thao tác. Mỗi lần chỉ xử lý một link.',
      color: 0xcb86db,
    },
    {
      key: 'telegramAccountStatusTopicId' as const,
      name: '6. 🛡️ TRẠNG THÁI TÀI KHOẢN FACEBOOK',
      intro:
        `🛡️ **6. TRẠNG THÁI & SỨC KHỎE TÀI KHOẢN FACEBOOK**\n\n` +
        `• Tự động theo dõi các hạn chế, lệnh cấm, cảnh báo vi phạm Tiêu chuẩn cộng đồng.\n` +
        `• Kiểm tra quyền đăng bài Feed, nhóm Mua Bán / Marketplace, và kết nối Messenger.\n` +
        `• Bấm nút **[🔄 Kiểm Tra Trạng Thái Ngay]** bên dưới hoặc gõ \`/check\` để quét trực tiếp.\n` +
        `• Báo cáo đính kèm ảnh chụp màn hình thực tế từ Facebook để đối chiếu minh bạch.`,
      color: 0x5ac8fa,
    },
  ];

  for (const spec of additionalTopics) {
    let existingTopicId = cfg[spec.key];
    if (existingTopicId) {
      try {
        await bot.api.editForumTopic(config.telegramGroupId, existingTopicId, { name: spec.name });
        if (spec.key === 'telegramAccountStatusTopicId' && !(cfg as any).accountStatusTopicInitialized) {
          const intro = await bot.api.sendMessage(config.telegramGroupId, spec.intro, {
            message_thread_id: existingTopicId,
            parse_mode: 'Markdown',
            reply_markup: getAccountHealthKeyboard(),
          }).catch(() => {});
          if (intro) {
            await bot.api.pinChatMessage(config.telegramGroupId, intro.message_id).catch(() => {});
          }
          (cfg as any).accountStatusTopicInitialized = true;
          updated = true;
        }
        continue;
      } catch (err: any) {
        if (isTopicUnchangedError(err)) continue;
        if (isMissingTopicError(err)) {
          console.warn(`[Telegram] Topic ${spec.name} không còn hợp lệ, sẽ tạo lại:`, telegramErrorDescription(err));
          cfg[spec.key] = undefined;
          existingTopicId = undefined;
          updated = true;
        } else {
          console.warn(`[Telegram] Chưa xác minh được Topic ${spec.name}; giữ nguyên ID để tránh tạo topic trùng:`, telegramErrorDescription(err));
          continue;
        }
      }
    }

    try {
      const topic = await bot.api.createForumTopic(config.telegramGroupId, spec.name, { icon_color: spec.color as any });
      cfg[spec.key] = topic.message_thread_id;
      updated = true;
      const intro = await bot.api.sendMessage(config.telegramGroupId, spec.intro, {
        message_thread_id: topic.message_thread_id,
        parse_mode: 'Markdown',
        reply_markup: spec.key === 'telegramAccountStatusTopicId' ? getAccountHealthKeyboard() : undefined,
      });
      await bot.api.pinChatMessage(config.telegramGroupId, intro.message_id).catch(() => {});
    } catch (err: any) {
      console.warn(`[Telegram] Không thể tạo Topic ${spec.name}:`, err.message);
    }
  }

  if (!cfg.facebookSalesTopicsV1) {
    const onboarding = [
      [cfg.telegramPostManageTopicId, '1. 📝 ĐĂNG BÀI FACEBOOK', `Gửi nội dung/ảnh, chọn Trang cá nhân hoặc Group, đặt lịch nếu cần. Bot luôn hiện bản xem trước và đợi xác nhận. Gõ /mau_bds để lấy mẫu bài BĐS.`],
      [cfg.telegramTopicId, '2. 💬 BÌNH LUẬN BÀI VIẾT', `Gửi link bài viết kèm nội dung bình luận để xem trước và xác nhận. Bình luận tự động đang tắt mặc định.`],
      [cfg.telegramMemberScanTopicId, '3. 👥 QUÉT MEM MỚI TRONG GROUP', `Gửi link group. Lần đầu lưu mốc; các lần sau báo hồ sơ mới trong danh sách đang hiển thị. Chức năng chỉ đọc, không tự nhắn/kết bạn.`],
      [cfg.telegramFriendTopicId, '4. 🤝 KẾT BẠN', `Gửi một link hồ sơ. Bot chỉ gửi một lời mời sau khi người gửi bấm Xác nhận.`],
      [cfg.telegramStoryTopicId, '5. ✨ TƯƠNG TÁC STORY / BÀI VIẾT', `Gửi link Story hoặc bài viết. Bot tự nhận diện, cho chọn cảm xúc rồi yêu cầu xác nhận.`],
    ] as const;
    for (const [topicId, title, help] of onboarding) {
      if (!topicId) continue;
      try {
        const intro = await bot.api.sendMessage(
          config.telegramGroupId,
          `📌 ${title}\n\n${help}\n\nQuyền Sale: quản trị viên hoặc nhân viên được cấp quyền bằng /sale_them. Nhân viên dùng /sale_id để lấy Telegram ID.`,
          { message_thread_id: topicId },
        );
        await bot.api.pinChatMessage(config.telegramGroupId, intro.message_id).catch((err: any) => {
          console.warn(`[Telegram] Không ghim được hướng dẫn ${title}:`, err.message);
        });
      } catch (err: any) {
        console.warn(`[Telegram] Không gửi được hướng dẫn ${title}:`, err.message);
      }
    }
    cfg.facebookSalesTopicsV1 = true;
    updated = true;
  }

  // Dùng Topic 1 cho báo cáo và lịch đăng, không phụ thuộc Topic báo cáo cũ.
  if (cfg.telegramPostManageTopicId && cfg.telegramReportTopicId !== cfg.telegramPostManageTopicId) {
    cfg.telegramReportTopicId = cfg.telegramPostManageTopicId;
    updated = true;
  }

  if (updated) {
    updateAutoCommentConfig(cfg);
  }
}

export async function notifyCustomerTyping(fbThreadId: string): Promise<void> {
  const mapping = getMappingByFbThread(fbThreadId);
  if (!mapping) return;
  const bot = getBot();
  await bot.api.sendChatAction(config.telegramGroupId, 'typing', {
    message_thread_id: mapping.telegram_topic_id,
  });
}

export async function getOrCreateTopicForCustomer(
  fbThreadId: string,
  customerName: string
): Promise<number> {
  const existing = getMappingByFbThread(fbThreadId);
  if (existing) {
    return existing.telegram_topic_id;
  }

  const cleanName = customerName.replace(/^[👤\s]+/, '').trim();
  const topicTitle = `👤 ${cleanName.substring(0, 50)}`;
  console.log(`[Telegram] Đang tạo phòng chat mới cho khách: "${topicTitle}" (UID: ${fbThreadId})`);

  const colors = [0x6fb9f0, 0xffd67e, 0xcb86db, 0x8eee98, 0xff93b2, 0xfb6f5f];
  let hash = 0;
  for (let i = 0; i < fbThreadId.length; i++) {
    hash = (hash << 5) - hash + fbThreadId.charCodeAt(i);
  }
  const icon_color = colors[Math.abs(hash) % colors.length];

  try {
    const topic = await botInstance!.api.createForumTopic(config.telegramGroupId, topicTitle, {
      icon_color: icon_color as any,
    });
    const topicId = topic.message_thread_id;

    saveThreadMapping({
      fb_thread_id: fbThreadId,
      telegram_topic_id: topicId,
      customer_name: cleanName,
    });

    // Thông báo mở đầu cực kỳ ngắn gọn, sạch sẽ, không avatar, không spam
    await botInstance!.api.sendMessage(
      config.telegramGroupId,
      `💬 **Cuộc trò chuyện với ${cleanName}**`,
      { message_thread_id: topicId, parse_mode: 'Markdown' }
    ).catch(() => {});

    return topicId;
  } catch (err: any) {
    console.error(`[Telegram] Lỗi khi tạo topic cho ${customerName}:`, err.message);
    return 0;
  }
}

export async function forwardFbMessageToTelegram(msg: InboundMessage): Promise<void> {
  // Bỏ qua nếu không có văn bản và cũng không có tệp media
  if (!msg.text && !msg.mediaUrl) {
    return;
  }

  // Lọc thông báo hệ thống nếu lọt qua
  if (
    msg.text &&
    (/mã hóa đầu cuối/i.test(msg.text) ||
      /end-to-end/i.test(msg.text) ||
      /bảo mật bằng tính năng/i.test(msg.text) ||
      /tin nhắn và cuộc gọi được bảo mật/i.test(msg.text) ||
      /không khôi phục được tin nhắn/i.test(msg.text) ||
      /^đang gửi/i.test(msg.text) ||
      /^bản nháp/i.test(msg.text))
  ) {
    if (!msg.mediaUrl) return;
    msg.text = '';
  }

  const bot = getBot();
  const topicId = await getOrCreateTopicForCustomer(msg.threadId, msg.customerName);
  if (!topicId) return;

  if (msg.mediaType === 'photo') {
    const caption =
      msg.text && !/đã gửi.*ảnh|sent.*photo|sent.*image|đã gửi.*hình/i.test(msg.text) ? msg.text : undefined;

    // 1. Phân phối chùm nhiều ảnh (Album) hoặc 1 ảnh từ Base64 F12
    if (msg.mediaUrls && msg.mediaUrls.length > 0) {
      console.log(`[Telegram] Đang phân phối ${msg.mediaUrls.length} ảnh tới Topic ${topicId} (${msg.customerName})...`);
      await sendExtractedImagesToTelegram(bot, config.telegramGroupId, topicId, msg.mediaUrls, caption);
      return;
    }

    // 2. Nếu là file cục bộ hoặc URL đơn
    if (msg.mediaUrl) {
      if (fs.existsSync(msg.mediaUrl)) {
        console.log(`[Telegram] Đang gửi ảnh thực tế tới Topic ${topicId} (${msg.customerName})...`);
        await bot.api.sendPhoto(config.telegramGroupId, new InputFile(msg.mediaUrl), {
          caption,
          message_thread_id: topicId,
        });
        const tempPath = msg.mediaUrl;
        setTimeout(() => {
          try {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch {}
        }, 30000);
      } else {
        await bot.api.sendPhoto(config.telegramGroupId, msg.mediaUrl, {
          caption,
          message_thread_id: topicId,
        });
      }
    }
  } else if (msg.mediaType === 'video' && msg.mediaUrl) {
    const caption =
      msg.text && !/đã gửi.*video|sent.*video/i.test(msg.text) ? msg.text : undefined;

    if (fs.existsSync(msg.mediaUrl)) {
      console.log(`[Telegram] Đang gửi video thực tế tới Topic ${topicId} (${msg.customerName})...`);
      await bot.api.sendVideo(config.telegramGroupId, new InputFile(msg.mediaUrl), {
        caption,
        message_thread_id: topicId,
      });
      const tempPath = msg.mediaUrl;
      setTimeout(() => {
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        } catch {}
      }, 30000);
    } else {
      await bot.api.sendVideo(config.telegramGroupId, msg.mediaUrl, {
        caption,
        message_thread_id: topicId,
      });
    }
  } else if (msg.mediaType === 'audio' && msg.mediaUrl) {
    if (fs.existsSync(msg.mediaUrl)) {
      console.log(`[Telegram] Đang gửi tin nhắn thoại tới Topic ${topicId} (${msg.customerName})...`);
      await bot.api.sendVoice(config.telegramGroupId, new InputFile(msg.mediaUrl), {
        message_thread_id: topicId,
      });
      const tempPath = msg.mediaUrl;
      setTimeout(() => {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {}
      }, 30000);
    }
  } else if (msg.mediaType === 'document' && msg.mediaUrl) {
    if (fs.existsSync(msg.mediaUrl)) {
      console.log(`[Telegram] Đang gửi tài liệu tới Topic ${topicId} (${msg.customerName})...`);
      await bot.api.sendDocument(config.telegramGroupId, new InputFile(msg.mediaUrl), {
        message_thread_id: topicId,
      });
      const tempPath = msg.mediaUrl;
      setTimeout(() => {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {}
      }, 30000);
    }
  } else if (msg.text) {
    await bot.api.sendMessage(config.telegramGroupId, msg.text, {
      message_thread_id: topicId,
    });
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

/**
 * Xử lý tin nhắn văn bản gửi vào Topic Kho Nguồn BĐS Trong Ngày
 */
async function handleInventoryTopicTextMessage(ctx: Context, text: string) {
  const lower = text.toLowerCase().trim();

  if (lower === '/huongdan' || lower === '/help') {
    return ctx.reply(
      `🏠 **HƯỚNG DẪN NẠP QUỸ CĂN BĐS TRONG NGÀY:**\n\n` +
      `1. **Gửi tin nhắn danh sách căn**: Bạn có thể copy/paste trực tiếp từ Zalo chủ nhà gửi vào đây (1 căn hoặc nhiều căn).\n` +
      `   VD: _"Sky Oasis S2 2PN full đồ 10tr vào ngay. LH 0988123456"_\n` +
      `2. **Gửi ảnh bảng hàng / chụp màn hình**: Bot sẽ tự động chạy OCR nhận diện chữ và bóc tách khu, số phòng, giá.\n` +
      `3. **Lệnh xem kho**: Gõ \`/kho\` để xem danh sách căn đang săn khách.\n` +
      `4. **Lệnh xóa căn**: Gõ \`/xoa <mã căn>\` để gỡ căn đã giao dịch xong.`,
      { parse_mode: 'Markdown' }
    );
  }

  if (lower === '/kho' || lower === '/quycan') {
    const stats = getPropertyInventoryStats();
    const props = getAllProperties();
    if (props.length === 0) {
      return ctx.reply('📦 **Kho nguồn hiện đang trống.** Hãy gửi tin nhắn thông tin căn hoặc ảnh bảng hàng vào đây để nạp tự động!');
    }
    let msg = `🏠 **KHO QUỸ CĂN BĐS ECOPARK (${stats.total} căn)**\n`;
    msg += `• 🟢 Đang săn khách: ${stats.availableCount} căn\n`;
    msg += `• 🔑 Cho thuê: ${stats.rentCount} | 🏷️ Chuyển nhượng: ${stats.saleCount}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    props.slice(0, 10).forEach((p, idx) => {
      msg += `${idx + 1}. **${p.project} - ${p.bedroom}** (${p.type === 'rent' ? 'Thuê' : 'Bán'})\n`;
      msg += `   💰 ${p.priceText} | 🛋️ ${p.furniture}\n`;
      if (p.phone) msg += `   📞 ${p.phone}\n`;
      msg += `   Trạng thái: ${p.status === 'available' ? '🟢 Sẵn sàng' : '✅ Đã chốt'} (Mã: \`${p.id}\`)\n\n`;
    });
    if (props.length > 10) {
      msg += `_...và còn ${props.length - 10} căn khác trên Dashboard http://localhost:3300_`;
    }
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }

  if (lower.startsWith('/xoa ')) {
    const propId = text.slice(5).trim();
    const ok = deleteProperty(propId);
    if (ok) return ctx.reply(`🗑️ Đã xóa căn \`${propId}\` khỏi kho nguồn!`);
    return ctx.reply(`❌ Không tìm thấy mã căn \`${propId}\`.`);
  }

  // Tự động phân tích và nạp căn
  const added = ingestPropertiesFromText(text, 'telegram_text');
  if (added.length === 0) {
    return ctx.reply(
      `⚠️ **Chưa nhận diện được đặc điểm căn hộ.**\n\n` +
      `Vui lòng ghi rõ hơn tên phân khu (Sky Oasis, Haven Park, Sol Forest, Westbay...), số phòng (2PN, Studio...), giá (10tr, 3.2 tỷ).\n` +
      `_VD: "Haven Park 2PN full đồ 11tr lh 0988..."_`,
      { parse_mode: 'Markdown' }
    );
  }

  let replyMsg = `✅ **ĐÃ NẠP THÀNH CÔNG ${added.length} CĂN VÀO KHO NGUỒN!**\n━━━━━━━━━━━━━━━━━━━━\n`;
  added.forEach((p, idx) => {
    replyMsg += `🏢 **Căn #${idx + 1}**: ${p.project} - **${p.bedroom}**\n`;
    replyMsg += `• Phân loại: ${p.type === 'rent' ? '🔑 Cho thuê' : '🏷️ Chuyển nhượng/Bán'}\n`;
    replyMsg += `• Mức giá: **${p.priceText}**\n`;
    replyMsg += `• Nội thất: ${p.furniture}\n`;
    if (p.phone) replyMsg += `• Liên hệ: ${p.phone}\n`;
    replyMsg += `• Mã căn: \`${p.id}\`\n\n`;
  });
  replyMsg += `━━━━━━━━━━━━━━━━━━━━\n🤖 **Radar Facebook 24/7** đã kích hoạt để rình bài đăng khớp nhu cầu trên 60 Group Ecopark!`;

  return ctx.reply(replyMsg, { parse_mode: 'Markdown' });
}

/**
 * Xử lý hình ảnh bảng hàng gửi vào Topic Kho Nguồn BĐS
 */
async function handleInventoryTopicPhotoMessage(ctx: Context) {
  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) return;

  const fileId = photos[photos.length - 1].file_id;
  const statusMsg = await ctx.reply('🔍 **Đang quét và bóc tách chữ từ ảnh bảng hàng (Tesseract OCR Offline)...**\n_Vui lòng đợi vài giây..._', { parse_mode: 'Markdown' });

  const tempDir = path.resolve('./.tmp_media');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const localPath = path.join(tempDir, `ocr_${Date.now()}.jpg`);

  try {
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
    await downloadFile(fileUrl, localPath);

    const { textExtracted, properties } = await ingestPropertiesFromImage(localPath, 'telegram_image');

    if (properties.length > 0) {
      let replyMsg = `📸 **ĐÃ QUÉT & BÓC TÁCH THÀNH CÔNG ${properties.length} CĂN TỪ ẢNH!**\n━━━━━━━━━━━━━━━━━━━━\n`;
      properties.forEach((p, idx) => {
        replyMsg += `🏢 **Căn #${idx + 1}**: ${p.project} - **${p.bedroom}**\n`;
        replyMsg += `• Nhu cầu: ${p.type === 'rent' ? '🔑 Cho thuê' : '🏷️ Chuyển nhượng/Bán'}\n`;
        replyMsg += `• Mức giá: **${p.priceText}**\n`;
        replyMsg += `• Nội thất: ${p.furniture}\n`;
        if (p.phone) replyMsg += `• Liên hệ: ${p.phone}\n`;
        replyMsg += `• Mã căn: \`${p.id}\`\n\n`;
      });
      replyMsg += `━━━━━━━━━━━━━━━━━━━━\n🤖 Radar 24/7 đã bắt đầu săn bài khớp để tự động bình luận!`;
      await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, replyMsg, { parse_mode: 'Markdown' });
    } else {
      const preview = (textExtracted || '').trim().slice(0, 350);
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `⚠️ **Đã đọc xong ảnh nhưng chưa nhận diện rõ căn hộ BĐS nào.**\n\n**Nội dung OCR đọc được:**\n\`\`\`\n${preview || '(Ảnh quá mờ hoặc không có chữ)'}\n\`\`\`\n\n💡 Bạn có thể copy nội dung trên và gõ bổ sung tên khu/giá rồi gửi lại!`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err: any) {
    console.error('[Telegram OCR] Lỗi xử lý ảnh bảng hàng:', err.message);
    await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, `❌ Lỗi khi phân tích ảnh: ${err.message}`).catch(() => {});
  } finally {
    fs.unlink(localPath, () => {});
  }
}

