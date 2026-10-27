import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { getDefaultAccount, saveAccount } from '../db/store.js';

async function main() {
  const currentAcc = getDefaultAccount();
  const profileDir = currentAcc.profileDir || 'D:\\KudoX_Mess_Tele\\.user-data\\profiles\\acc_61577949601039';

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  console.log(`\n===========================================================`);
  console.log(`🔑 FALCONX - TIỆN ÍCH ĐĂNG NHẬP FACEBOOK`);
  console.log(`👤 Tài khoản: ${currentAcc.name} (ID: ${currentAcc.id})`);
  console.log(`📁 Hồ sơ Chrome: ${profileDir}`);
  console.log(`===========================================================\n`);

  console.log('⏳ Đang mở trình duyệt Google Chrome...');
  const hasRealChrome = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel: hasRealChrome ? 'chrome' : undefined,
    viewport: { width: 1366, height: 850 },
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || (await context.newPage());
  console.log('🔗 Đang mở https://www.facebook.com/ ...');
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });

  console.log('\n👉 BẠN CHỈ CẦN THAO TÁC TRÊN CỬA SỔ CHROME VỪA HIỆN:');
  console.log('1. Nhập mật khẩu nick Facebook "Eco Trang" (nếu có form).');
  console.log('2. Bấm "Đăng nhập" để vào Bảng tin Facebook bình thường.');
  console.log('3. Hệ thống sẽ TỰ ĐỘNG nhận diện khi bạn đăng nhập xong, lưu Cookie mới và hoàn tất!\n');

  // Vòng lặp tự động lắng nghe khi c_user xuất hiện
  let isDone = false;
  const checkTimer = setInterval(async () => {
    try {
      const cookies = await context.cookies(['https://www.facebook.com']);
      const cUser = cookies.find((c) => c.name === 'c_user');
      if (cUser && cUser.value && !isDone) {
        isDone = true;
        clearInterval(checkTimer);

        console.log(`\n🎉 ĐÃ ĐĂNG NHẬP THÀNH CÔNG! UID: ${cUser.value}`);
        // Lưu cookies vào cookies.json
        const cookieBackupPath = path.join(profileDir, 'cookies.json');
        fs.writeFileSync(cookieBackupPath, JSON.stringify(cookies, null, 2), 'utf-8');
        console.log(`💾 Đã lưu ${cookies.length} Cookies mới vào: ${cookieBackupPath}`);

        // Cập nhật database
        saveAccount({
          id: currentAcc.id,
          uid: cUser.value,
          status: 'live',
          cookies: cookies as any,
          lastActiveAt: new Date().toISOString(),
        });
        console.log(`✅ Đã cập nhật trạng thái Live cho tài khoản [${currentAcc.name}] trong cơ sở dữ liệu!`);

        console.log('\n✨ Đang đóng trình duyệt sau 3 giây...');
        setTimeout(async () => {
          await context.close().catch(() => {});
          process.exit(0);
        }, 3000);
      }
    } catch {}
  }, 2000);

  context.on('close', () => {
    if (!isDone) {
      clearInterval(checkTimer);
      console.log('ℹ️ Cửa sổ trình duyệt đã đóng.');
      process.exit(0);
    }
  });
}

main().catch(console.error);
