const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\2812de1c-1f5b-4c70-9e8d-9c0e55e700f4';

async function main() {
  console.log('🚀 Bắt đầu kiểm thử di chuyển nút Trạng Thái FB 2026 xuống Sidebar...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3300', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Xử lý login nếu có
    const isLoginVisible = await page.$eval('#login-modal-overlay', el => !el.classList.contains('hidden')).catch(() => false);
    if (isLoginVisible) {
      await page.fill('#login-username', 'admin');
      await page.fill('#login-password', 'ecotrang2026');
      await page.click('#login-btn-submit');
      await page.waitForTimeout(2000);
    }

    // 1. Kiểm tra trên Topbar: nút cũ đã bị xóa bỏ
    const topbarBtn = await page.$('#topbar-diagnostic-btn');
    console.log('🔍 Kiểm tra nút cũ trên Topbar:', topbarBtn ? 'VẪN CÒN (Lỗi)' : 'ĐÃ ĐƯỢC XÓA SẠCH (Đạt chuẩn ✅)');

    // 2. Chụp ảnh Topbar sạch đẹp, thoáng đãng
    const topbarProofPath = path.join(ARTIFACT_DIR, 'proof_topbar_clean_spacing.png');
    await page.screenshot({ path: topbarProofPath, fullPage: false });
    console.log(`📸 Đã lưu bằng chứng Topbar thoáng đãng: ${topbarProofPath}`);

    // 3. Kiểm tra nút mới ở Sidebar bên trái
    await page.waitForSelector('#sidebar-diagnostic-btn', { state: 'visible', timeout: 5000 });
    const sidebarText = await page.textContent('#sidebar-diagnostic-text');
    const sidebarBadge = await page.textContent('#sidebar-diagnostic-badge');
    console.log(`✅ Text trên Sidebar: "${sidebarText.trim()}" | Badge: "${sidebarBadge.trim()}"`);

    // Chụp cận cảnh nút mới ở Sidebar
    const sidebarProofPath = path.join(ARTIFACT_DIR, 'proof_sidebar_diagnostic_relocated.png');
    await page.screenshot({ path: sidebarProofPath, fullPage: false });
    console.log(`📸 Đã lưu bằng chứng Nút ở Sidebar: ${sidebarProofPath}`);

    // 4. Test click vào nút ở Sidebar xem Modal có mở lên không
    console.log('🖱️ Nhấp vào nút tại Sidebar...');
    await page.click('#sidebar-diagnostic-btn');
    await page.waitForTimeout(1000);
    const modalVisible = await page.$eval('#modal-system-diagnostics', el => !el.classList.contains('hidden')).catch(() => false);
    console.log('✅ Modal Báo Cáo Chẩn Đoán mở thành công:', modalVisible ? 'CÓ ✅' : 'KHÔNG ❌');

    // Chụp màn hình khi modal mở
    const modalProofPath = path.join(ARTIFACT_DIR, 'proof_sidebar_click_modal_opened.png');
    await page.screenshot({ path: modalProofPath, fullPage: false });
    console.log(`📸 Đã lưu bằng chứng Modal mở từ Sidebar: ${modalProofPath}`);

    console.log('\n🎉 KIỂM THỬ DI CHUYỂN NÚT XUỐNG SIDEBAR HOÀN TẤT 100%!');
  } catch (err) {
    console.error('❌ Lỗi:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
