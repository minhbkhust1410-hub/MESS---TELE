import { onlineCloudDb } from './db/online-cloud-db.js';

// Bảo vệ tiến trình không bao giờ bị dừng đột ngột bởi lỗi ngoại lệ và không ghi rác ra ổ đĩa Local
process.on('uncaughtException', (err) => {
  console.error('🚨 [Process UncaughtException]', err?.message || err);
});
process.on('unhandledRejection', (reason: any) => {
  console.error('🚨 [Process UnhandledRejection]', reason?.message || reason);
});

async function bootstrap() {
  console.log('===========================================================');
  console.log('🚀 KHỞI ĐỘNG HỆ THỐNG FB EXTEN (HYBRID CORE + PRIVATE EXTENSION)');
  console.log('===========================================================\n');

  // 0. Khởi tạo Online Cloud Database trước khi nạp bất kỳ dịch vụ nào (0 Byte lưu Local)
  await onlineCloudDb.init();

  const { validateConfig } = await import('./config/env.js');
  const { getBot, forwardFbMessageToTelegram, notifyCustomerTyping, ensureControlTopics } = await import('./telegram/bot.js');
  const { messengerEngine } = await import('./engine/messenger-engine.js');
  const { autoCommentEngine } = await import('./engine/auto-comment-engine.js');
  const { startDashboard } = await import('./ui/dashboard.js');
  const { systemDiagnosticService } = await import('./services/system-diagnostic-service.js');

  const check = validateConfig();
  if (!check.valid) {
    console.warn('⚠️ Một số cấu hình Telegram đang trống, bạn có thể cập nhật trực tiếp trên Web Dashboard:', check.missing.join(', '));
  }

  // 1. Kết nối Inbound Message (FB -> Telegram) hỗ trợ Text, Ảnh, Video, Icon
  messengerEngine.setOnMessageCallback(async (inboundMsg) => {
    await forwardFbMessageToTelegram(inboundMsg);
  });

  // 2. Kết nối hiệu ứng Đang soạn tin nhắn (FB -> Telegram)
  messengerEngine.setOnTypingCallback(async (threadId) => {
    await notifyCustomerTyping(threadId);
  });

  // 3. Khởi chạy Telegram Bot
  const bot = getBot();
  bot.start({
    onStart: async (info) => {
      console.log(`✅ Telegram Bot [@${info.username}] đang trực tuyến!`);
      await ensureControlTopics(bot).catch((e) => console.warn('[Telegram Topics] Lỗi khởi tạo:', e.message));
      autoCommentEngine.startWatcher(10);
    },
  }).catch((err) => {
    console.error('🚨 [Telegram Bot Polling Error]:', err.message);
  });

  // 4. Khởi chạy FB EXTEN Web Dashboard
  startDashboard();

  // 4.1. Khởi chạy Trình Kiểm Định Toàn Bộ Chức Năng App Hàng Ngày (Facebook Compat Engine)
  systemDiagnosticService.initDailyDiagnosticScheduler();

  // 5. Khởi chạy FB EXTEN Messenger Engine với MutationObserver Realtime
  try {
    await messengerEngine.start();
    console.log('\n🎉 TOÀN BỘ HỆ THỐNG FB EXTEN ĐÃ SẴN SÀNG!\n');
  } catch (err: any) {
    console.error('⚠️ Lỗi khởi chạy Messenger Engine:', err.message);
  }

  const shutdown = async () => {
    console.log('\n🛑 Đang đồng bộ dữ liệu lên Cloud DB và dừng hệ thống an toàn...');
    await onlineCloudDb.syncToCloudNow().catch(() => {});
    autoCommentEngine.stopWatcher();
    await messengerEngine.stop();
    bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch(console.error);
