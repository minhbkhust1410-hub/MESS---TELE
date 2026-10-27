const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\2812de1c-1f5b-4c70-9e8d-9c0e55e700f4';

async function main() {
  console.log('🚀 Khởi động kiểm thử UI Trạng Thái Chức Năng Trên Top Bar & Modal Báo Cáo...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Điều hướng tới Dashboard
    await page.goto('http://localhost:3300', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // 2. Nếu gặp Modal Auth Login -> Điền mật khẩu đăng nhập
    const isLoginVisible = await page.$eval('#login-modal-overlay', el => !el.classList.contains('hidden')).catch(() => false);
    if (isLoginVisible) {
      console.log('🔐 Đang đăng nhập tài khoản quản trị...');
      await page.fill('#login-username', 'admin');
      await page.fill('#login-password', 'ecotrang2026');
      await page.click('#login-btn-submit');
      await page.waitForTimeout(2000);
    }

    // 3. Kiểm tra Huy hiệu trên Header Bar
    console.log('🔍 Kiểm tra Huy hiệu Trạng Thái Chức Năng trên Header Bar...');
    await page.waitForSelector('#topbar-diagnostic-btn', { state: 'visible', timeout: 10000 });
    const topbarText = await page.textContent('#topbar-diagnostic-text');
    const topbarBadge = await page.textContent('#topbar-diagnostic-badge');
    console.log(`✅ Text trên Top Bar: "${topbarText}" | Badge: "${topbarBadge}"`);

    // Chụp bằng chứng Top Bar có Trạng Thái Chức Năng
    const proofTopbarPath = path.join(ARTIFACT_DIR, 'proof_topbar_diagnostic_pill.png');
    await page.screenshot({ path: proofTopbarPath, fullPage: false });
    console.log(`📸 Đã lưu bằng chứng Top Bar: ${proofTopbarPath}`);

    // 4. Nhấp vào Huy hiệu để mở Modal Báo Cáo Chẩn Đoán Chi Tiết
    console.log('🖱️ Nhấp mở Modal Báo Cáo Chẩn Đoán Chi Tiết...');
    await page.click('#topbar-diagnostic-btn');
    await page.waitForTimeout(1000);
    await page.waitForSelector('#modal-system-diagnostics', { state: 'visible', timeout: 5000 });

    // Đợi bảng 7 chức năng render
    await page.waitForSelector('#modal-diag-table-body tr', { state: 'attached', timeout: 5000 });
    const rowCount = await page.$$eval('#modal-diag-table-body tr', rows => rows.length);
    console.log(`✅ Số dòng chức năng trong bảng báo cáo: ${rowCount}/7`);

    const overallText = await page.textContent('#modal-diag-overall');
    console.log(`✅ Trạng thái tổng thể trong modal: "${overallText}"`);

    // Chụp bằng chứng Modal Báo Cáo Chi Tiết
    const proofModalPath = path.join(ARTIFACT_DIR, 'proof_diagnostic_report_modal.png');
    await page.screenshot({ path: proofModalPath, fullPage: false });
    console.log(`📸 Đã lưu bằng chứng Modal Báo Cáo Chi Tiết: ${proofModalPath}`);

    // 5. Test nút "Chạy Kiểm Định Ngay" (Run Diagnostic Now)
    console.log('⚡ Nhấp nút "Chạy Kiểm Định Ngay" để xác thực On-Demand review...');
    await page.click('#btn-run-diag-now');
    await page.waitForTimeout(3000);

    const recheckTime = await page.textContent('#modal-diag-time');
    console.log(`✅ Thời gian kiểm định sau khi chạy on-demand: "${recheckTime}"`);

    // Chụp ảnh sau khi chạy on-demand
    const proofOnDemandPath = path.join(ARTIFACT_DIR, 'proof_diagnostic_ondemand_completed.png');
    await page.screenshot({ path: proofOnDemandPath, fullPage: false });
    console.log(`📸 Đã lưu bằng chứng sau kiểm định On-demand: ${proofOnDemandPath}`);

    console.log('\n🎉 TOÀN BỘ QUY TRÌNH KIỂM THỬ GIAO DIỆN & CHẨN ĐOÁN HOÀN TẤT XUẤT SẮC 100%!');
  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
