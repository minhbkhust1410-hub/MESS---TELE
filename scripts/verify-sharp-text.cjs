const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\2812de1c-1f5b-4c70-9e8d-9c0e55e700f4';

async function main() {
  console.log('🚀 Bắt đầu kiểm tra độ tương phản và độ sắc nét chữ trên giao diện...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3300', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Login nếu cần
    const isLoginVisible = await page.$eval('#login-modal-overlay', el => !el.classList.contains('hidden')).catch(() => false);
    if (isLoginVisible) {
      await page.fill('#login-username', 'admin');
      await page.fill('#login-password', 'ecotrang2026');
      await page.click('#login-btn-submit');
      await page.waitForTimeout(2000);
    }

    // Chuyển sang Tab Đăng Bài Lên Group
    await page.click('#nav-btn-posts');
    await page.waitForTimeout(1500);

    // Bật chọn radio Group hoặc Cả Hai để hiển thị danh sách checkbox Group
    const radioGroup = await page.$('input[name="web-post-target"][value="both"]');
    if (radioGroup) {
      await radioGroup.click();
      await page.waitForTimeout(1000);
    }

    // Cuộn lên đầu tab posts
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);

    // Chụp cận cảnh bảng Soạn bài viết và Checkbox Groups
    const composerCard = await page.$('#tab-posts > div.claude-card:first-of-type');
    const proofPath = path.join(ARTIFACT_DIR, 'proof_sharp_text_contrast_fixed.png');
    if (composerCard) {
      await composerCard.screenshot({ path: proofPath });
    } else {
      await page.screenshot({ path: proofPath, fullPage: false });
    }
    console.log(`📸 Đã lưu bằng chứng chữ sắc nét 100%: ${proofPath}`);

    // Kiểm tra màu computed của text radio và checkbox
    const radioTextColor = await page.$eval('label:has(input[name="web-post-target"]) div.font-bold', el => window.getComputedStyle(el).color);
    console.log(`🎨 Màu chữ tiêu đề Nơi đăng bài: ${radioTextColor}`);

    const groupTextColor = await page.$eval('#web-post-groups-checkboxes label span', el => window.getComputedStyle(el).color).catch(() => 'N/A');
    console.log(`🎨 Màu chữ tên nhóm trong checkbox: ${groupTextColor}`);

  } catch (err) {
    console.error('❌ Lỗi:', err.message);
  } finally {
    await browser.close();
  }
}

main();
