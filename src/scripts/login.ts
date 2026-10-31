import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { getDefaultAccount, getAccountById, saveAccount } from '../db/store.js';

async function main() {
  const targetId = process.argv[2];
  const targetAcc = targetId ? getAccountById(targetId) : getDefaultAccount();
  const currentAcc = targetAcc || getDefaultAccount();
  const profileDir = currentAcc.profileDir || path.resolve('./.user-data/profiles', currentAcc.id || 'default');

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  console.log(`\n===========================================================`);
  console.log(`🔑 FALCONX CLI - ĐĂNG NHẬP FACEBOOK CHUẨN STEALTH`);
  console.log(`👤 Tài khoản: ${currentAcc.name} (ID: ${currentAcc.id})`);
  console.log(`📁 Thư mục Profile: ${profileDir}`);
  console.log(`===========================================================\n`);

  console.log('⏳ Đang khởi chạy trình duyệt bảo mật...');
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

  console.log('\n👉 HƯỚNG DẪN:');
  console.log('1. Nhập thông tin đăng nhập trên cửa sổ Chrome vừa mở.');
  console.log('2. Hệ thống sẽ TỰ ĐỘNG phát hiện cookie phiên mới và lưu vào cơ sở dữ liệu Cloud.\n');

  let isDone = false;
  const checkTimer = setInterval(async () => {
    try {
      const cookies = await context.cookies(['https://www.facebook.com']);
      const cUser = cookies.find((c) => c.name === 'c_user');
      if (cUser && cUser.value && !isDone) {
        isDone = true;
        clearInterval(checkTimer);

        console.log(`\n🎉 ĐĂNG NHẬP THÀNH CÔNG! UID Facebook: ${cUser.value}`);
        const cookieBackupPath = path.join(profileDir, 'cookies.json');
        fs.writeFileSync(cookieBackupPath, JSON.stringify(cookies, null, 2), 'utf-8');
        console.log(`💾 Đã lưu ${cookies.length} Cookies an toàn.`);

        saveAccount({
          id: currentAcc.id,
          uid: cUser.value,
          status: 'live',
          cookies: cookies as any,
          lastActiveAt: new Date().toISOString(),
        });
        console.log(`✅ Đã cập nhật trạng thái Live cho [${currentAcc.name}]!`);

        console.log('✨ Đang đóng trình duyệt sau 3 giây...');
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
