import { config } from '../config/env.js';
import { getBot } from '../telegram/bot.js';

async function main() {
  console.log('\n===========================================================');
  console.log('🤖 KIỂM TRA KẾT NỐI TELEGRAM BOT');
  console.log('===========================================================');

  if (!config.telegramBotToken) {
    console.error('❌ Thiếu cấu hình TELEGRAM_BOT_TOKEN.');
    process.exit(1);
  }

  try {
    const bot = getBot();
    const me = await bot.api.getMe();
    console.log(`✅ Kết nối Telegram thành công!`);
    console.log(`   - Bot Username: @${me.username}`);
    console.log(`   - Bot Name: ${me.first_name}`);
    console.log(`   - Bot ID: ${me.id}`);
    console.log(`   - Target Group ID: ${config.telegramGroupId || 'Chưa thiết lập'}`);

    if (config.telegramGroupId) {
      console.log('⏳ Đang gửi tin nhắn kiểm tra tới nhóm Telegram...');
      await bot.api.sendMessage(
        config.telegramGroupId,
        `🔔 [FalconX System Test]\n\nKiểm tra kết nối Telegram Bot [@${me.username}] thành công vào lúc: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`
      );
      console.log('✅ Đã gửi tin nhắn test vào nhóm Telegram thành công!');
    }
  } catch (err: any) {
    console.error('❌ Lỗi kết nối Telegram:', err.message);
    process.exit(1);
  }
}

main().catch(console.error);
