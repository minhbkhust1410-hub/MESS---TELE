import fs from 'fs';

// Ghi nhận sự cố và nhật ký thoát tiến trình ra tệp độc lập
process.on('uncaughtException', (err) => {
  const msg = `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${err?.stack || err}\n`;
  console.error(msg);
  try { fs.appendFileSync('./daemon_crash.log', msg); } catch {}
});
process.on('unhandledRejection', (reason: any) => {
  const msg = `[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason?.stack || reason}\n`;
  console.error(msg);
  try { fs.appendFileSync('./daemon_crash.log', msg); } catch {}
});
process.on('exit', (code) => {
  const msg = `[${new Date().toISOString()}] PROCESS EXIT WITH CODE: ${code}\n`;
  console.log(msg);
  try { fs.appendFileSync('./daemon_crash.log', msg); } catch {}
});

import { config, validateConfig } from './config/env.js';
import { getBot, forwardFbMessageToTelegram, notifyCustomerTyping, ensureControlTopics } from './telegram/bot.js';
import { messengerEngine } from './engine/messenger-engine.js';
import { autoCommentEngine } from './engine/auto-comment-engine.js';
import { startDashboard } from './ui/dashboard.js';
import { systemDiagnosticService } from './services/system-diagnostic-service.js';

async function bootstrap() {
  console.log('===========================================================');
  console.log('🚀 KHỞI ĐỘNG HỆ THỐNG FALCONX MESS x TELE REALTIME INSTANT');
  console.log('===========================================================\n');

  const check = validateConfig();
  if (!check.valid) {
    console.error('❌ Thiếu biến môi trường trong file .env:');
    check.missing.forEach((m) => console.error(`  - ${m}`));
    process.exit(1);
  }

  // 1. Kết nối Inbound Message (FB -> Telegram) hỗ trợ Text, Ảnh, Video, Icon
  messengerEngine.setOnMessageCallback(async (inboundMsg) => {
    await forwardFbMessageToTelegram(inboundMsg);
  });

  // 2. Kết nối hiệu ứng Đang soạn tin nhắn (FB -> Telegram)
  messengerEngine.setOnTypingCallback(async (threadId) => {
    await notifyCustomerTyping(threadId);
  });

  // 2. Khởi chạy Telegram Bot
  const bot = getBot();
  bot.start({
    onStart: async (info) => {
      console.log(`✅ Telegram Bot [@${info.username}] đang trực tuyến!`);
      // Tự động tạo 3 Topics quản lý chuyên nghiệp cho doanh nghiệp (nếu chưa có)
      await ensureControlTopics(bot).catch((e) => console.warn('[Telegram Topics] Lỗi khởi tạo:', e.message));
      // Khởi chạy nền AutoComment Engine
      autoCommentEngine.startWatcher(10);
    },
  }).catch((err) => {
    console.error('🚨 [Telegram Bot Polling Error]:', err.message);
  });

  // 3. Khởi chạy FalconX Web Dashboard
  startDashboard();

  // 3.1. Khởi chạy Trình Kiểm Định Toàn Bộ Chức Năng App Hàng Ngày (Facebook Compat Engine)
  systemDiagnosticService.initDailyDiagnosticScheduler();

  // 4. Khởi chạy FalconX Messenger Engine với MutationObserver Realtime
  try {
    await messengerEngine.start();
    console.log('\n🎉 TOÀN BỘ HỆ THỐNG FALCONX MESS x TELE ĐÃ SẴN SÀNG ĐỒNG BỘ TỨC THÌ!\n');
  } catch (err: any) {
    console.error('⚠️ Lỗi khởi chạy Messenger Engine:', err.message);
  }

  const shutdown = async () => {
    console.log('\n🛑 Đang dừng hệ thống FalconX an toàn...');
    autoCommentEngine.stopWatcher();
    await messengerEngine.stop();
    bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Bảo vệ tiến trình không bao giờ bị dừng đột ngột bởi lỗi ngoại lệ
  process.on('uncaughtException', (err) => {
    console.error('🚨 [Process UncaughtException]', err.message);
  });
  process.on('unhandledRejection', (reason: any) => {
    console.error('🚨 [Process UnhandledRejection]', reason?.message || reason);
  });
}

bootstrap().catch(console.error);
