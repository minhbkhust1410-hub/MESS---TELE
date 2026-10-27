const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const ffmpegPath = 'D:/KudoX_Mess_Tele/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe';
const outputDir = 'D:/KudoX_Mess_Tele/presentation';
const rawVideoDir = path.join(outputDir, 'raw_video');

if (!fs.existsSync(rawVideoDir)) fs.mkdirSync(rawVideoDir, { recursive: true });

async function run() {
  console.log('🎥 Khởi động trình duyệt Playwright quay video màn hình Full HD (1920x1080)...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: rawVideoDir,
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();

  console.log('1. [00:00 - 00:18] Mở Dashboard, đăng nhập & giới thiệu tổng quan...');
  await page.goto('http://127.0.0.1:3300', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Đăng nhập
  const isLoginVisible = await page.locator('#login-username').isVisible().catch(() => false);
  if (isLoginVisible) {
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'ecotrang2026');
    await page.waitForTimeout(1000);
    await page.click('#login-btn-submit');
    await page.waitForTimeout(2500);
  }

  // Cuộn nhẹ xem tổng quan Bento Cards Overview
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.scrollBy({ top: -300, behavior: 'smooth' }));
  await page.waitForTimeout(8000);

  console.log('2. [00:18 - 00:39] Trình diễn chuyển đổi 2 chế độ BĐS & Forex...');
  // Bấm chuyển sang Forex
  const btnForex = page.locator('#operating-mode-forex');
  if (await btnForex.isVisible()) {
    await btnForex.click();
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollBy({ top: 350, behavior: 'smooth' }));
    await page.waitForTimeout(6000);
    await page.evaluate(() => window.scrollBy({ top: -350, behavior: 'smooth' }));
    await page.waitForTimeout(2000);
  }

  // Bấm chuyển lại BĐS Ecopark
  const btnBds = page.locator('#operating-mode-bds');
  if (await btnBds.isVisible()) {
    await btnBds.click();
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(5000);

  console.log('3. [00:39 - 01:03] Chuyển sang Tab Đăng Bài Lên Group (Topic 1)...');
  await page.click('#nav-btn-posts');
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
  await page.waitForTimeout(8000);
  await page.evaluate(() => window.scrollBy({ top: -400, behavior: 'smooth' }));
  await page.waitForTimeout(13000);

  console.log('4. [01:03 - 01:34] Chuyển sang Tab Tương Tác: Quét Mem Nhóm & Kho Data Leads...');
  await page.click('#nav-btn-growth');
  await page.waitForTimeout(3000);

  // Cuộn xem khối quét thành viên mới
  await page.evaluate(() => {
    const el = document.getElementById('member-scanner-card');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  await page.waitForTimeout(8000);

  // Cuộn xem Kho Dữ Liệu Khách Đã Quét (Warehouse Leads)
  await page.evaluate(() => {
    const el = document.getElementById('warehouse-leads-card');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  await page.waitForTimeout(10000);

  // Bấm lọc mốc 24h
  const flt24h = page.locator('#warehouse-flt-24h');
  if (await flt24h.isVisible().catch(() => false)) {
    await flt24h.click();
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(7000);

  console.log('5. [01:34 - 01:57] Chuyển sang Tab Săn Khách & Quỹ Căn - Căn Mới Nạp Hôm Nay...');
  await page.click('#nav-btn-autocmt');
  await page.waitForTimeout(3000);

  // Cuộn tới khối Căn Mới Nạp Trong Ngày
  await page.evaluate(() => {
    const el = document.getElementById('inv-today-panel');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  await page.waitForTimeout(8000);

  // Bấm lọc căn mới nạp hôm nay
  const fltToday = page.locator('#btn-inv-flt-today');
  if (await fltToday.isVisible().catch(() => false)) {
    await fltToday.click();
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(12000);

  console.log('6. [01:57 - 02:22] Trình diễn Nạp Căn Bằng AI (Chữ & Ảnh OCR)...');
  await page.evaluate(() => {
    const el = document.getElementById('inv-input-text');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(10000);

  // Cuộn nhẹ xem ô nạp ảnh OCR
  await page.evaluate(() => {
    const el = document.getElementById('btn-scan-image');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(15000);

  console.log('7. [02:22 - 02:51] Bể Khóa AI Chống Nghẽn 24/7 (Multi-Key Pool & Failover)...');
  await page.evaluate(() => {
    const el = document.getElementById('free-ai-control-panel');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  await page.waitForTimeout(3000);

  // Kiểm tra mở rộng cấu hình key nếu chưa mở
  const isSettingsHidden = await page.locator('#ai-settings-expandable').evaluate(el => el.classList.contains('hidden')).catch(() => false);
  if (isSettingsHidden) {
    await page.click('button:has-text("Cấu Hình Key AI")');
    await page.waitForTimeout(1500);
  }

  // Cuộn xem bảng Bể Khóa Dự Phòng
  await page.evaluate(() => {
    const el = document.getElementById('ai-settings-expandable');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  await page.waitForTimeout(12000);

  // Bấm kiểm tra toàn bộ bể key
  const btnTestPool = page.locator('#btn-test-all-keys');
  if (await btnTestPool.isVisible().catch(() => false)) {
    await btnTestPool.click();
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(11000);

  console.log('8. [02:51 - 03:12] Chạy Thử Nghiệm AI Ghép Căn Theo Tọa Độ GPS Google Maps...');
  await page.evaluate(() => {
    const el = document.getElementById('ai-sim-input');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(2000);

  await page.fill('#ai-sim-input', 'Cần tìm thuê gấp căn 2PN Sky Oasis hoặc Sol Forest tầm 9-10tr full đồ vào ở luôn cuối tuần này');
  await page.waitForTimeout(1500);
  await page.click('#btn-run-ai-sim');

  await page.waitForSelector('#ai-sim-result:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(2000);

  // Cuộn xem trọn vẹn kết quả 3 bước ghép căn & cự ly mét
  await page.evaluate(() => {
    const el = document.getElementById('ai-sim-result');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(15000);

  console.log('9. [03:12 - 03:24] Cầu nối Messenger <-> Telegram & Kết bài...');
  await page.evaluate(() => {
    const el = document.getElementById('nav-btn-inbox');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(5000);

  // Cuộn lên đầu trang ngắm giao diện tổng thể
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(7000);

  // Lấy đường dẫn file video đã ghi
  const videoPath = await page.video().path();
  console.log('🎬 Video thô đã lưu tại:', videoPath);

  await context.close();
  await browser.close();

  // Ghép audio thuyết minh vào video
  const voiceoverPath = path.join(outputDir, 'voiceover_full.mp3');
  const finalMp4Path = path.join(outputDir, 'FalconX_Demo_Video_Full_Features.mp4');
  const publicMp4Path = 'D:/KudoX_Mess_Tele/public/FalconX_Demo_Video_Full_Features.mp4';

  console.log('🔄 Đang xuất xưởng Video MP4 Full HD 1080p có giọng nói thuyết minh tiếng Việt...');

  // Muxing video + audio with ffmpeg
  const muxCmd = `"${ffmpegPath}" -y -i "${videoPath}" -i "${voiceoverPath}" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${finalMp4Path}"`;
  execSync(muxCmd, { stdio: 'inherit' });

  // Copy sang thư mục public để người dùng xem trực tiếp trên web
  fs.copyFileSync(finalMp4Path, publicMp4Path);

  console.log('🎉 XUẤT BẢN THÀNH CÔNG VIDEO DEMO! 🎉');
  console.log(`📁 File lưu trữ cục bộ: ${finalMp4Path}`);
  console.log(`🌐 Link web xem trực tiếp: http://localhost:3300/FalconX_Demo_Video_Full_Features.mp4`);
}

run().catch(err => {
  console.error('❌ Lỗi khi quay video demo:', err);
  process.exit(1);
});
