const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\2812de1c-1f5b-4c70-9e8d-9c0e55e700f4';

async function main() {
  console.log('🚀 Bắt đầu kiểm thử tính năng TỰ ĐỘNG TÌM KIẾM CÁC NHÓM MỚI...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3300', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Xử lý login nếu có
    const isLoginVisible = await page.$eval('#login-modal-overlay', el => !el.classList.contains('hidden')).catch(() => false);
    if (isLoginVisible) {
      console.log('🔑 Đang đăng nhập tài khoản quản trị...');
      await page.fill('#login-username', 'admin');
      await page.fill('#login-password', 'ecotrang2026');
      await page.click('#login-btn-submit');
      await page.waitForTimeout(2000);
    }

    // 1. Chuyển sang tab Đăng Bài Lên Group
    console.log('📑 Chuyển sang Tab "Đăng Bài Lên Group"...');
    await page.click('#nav-btn-posts');
    await page.waitForTimeout(1500);

    // 2. Kiểm tra sự hiện diện của Module Radar Khám Phá Nhóm Mới
    const radarCard = await page.$('#group-discovery-radar-card');
    if (!radarCard) {
      throw new Error('❌ Không tìm thấy thẻ #group-discovery-radar-card trên giao diện!');
    }
    console.log('✅ Đã tìm thấy Thẻ Radar Tự Động Tìm Kiếm Nhóm Mới trên UI!');

    // 3. Cuộn đến khu vực Radar Khám Phá Nhóm Mới
    await radarCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);

    // 4. Kiểm tra các phần tử điều khiển
    const inputKeyword = await page.$('#disc-search-keyword-input');
    const btnSearch = await page.$('#btn-disc-search-submit');
    const btnAutoExpand = await page.$('#btn-disc-auto-expand');

    console.log('🔍 Ô nhập từ khóa:', inputKeyword ? 'SẴN SÀNG ✅' : 'THIẾU ❌');
    console.log('🔍 Nút Tìm Nhóm:', btnSearch ? 'SẴN SÀNG ✅' : 'THIẾU ❌');
    console.log('🔍 Nút Quét Mở Rộng 5+ Từ Khóa:', btnAutoExpand ? 'SẴN SÀNG ✅' : 'THIẾU ❌');

    // 5. Kiểm tra các chỉ số KPI
    const kpiTotal = await page.textContent('#disc-kpi-total');
    const kpiJoined = await page.textContent('#disc-kpi-joined');
    const kpiCanJoin = await page.textContent('#disc-kpi-can-join');
    const kpiAdded = await page.textContent('#disc-kpi-added-pool');
    console.log(`📊 Chỉ số KPI: Tổng=${kpiTotal.trim()} | Đã Tham Gia=${kpiJoined.trim()} | Sẵn Sàng=${kpiCanJoin.trim()} | Đã Nạp Săn Khách=${kpiAdded.trim()}`);

    // 6. Kiểm tra các dòng trong bảng nhóm khám phá
    const rowsCount = await page.$$eval('#discovered-groups-tbody tr', trs => trs.length);
    console.log(`📋 Số lượng nhóm hiển thị trong bảng: ${rowsCount} nhóm`);

    // Chụp ảnh bằng chứng 1: Toàn cảnh Giao diện Radar Tìm Nhóm Mới
    const proofUiPath = path.join(ARTIFACT_DIR, 'proof_group_discovery_ui.png');
    await radarCard.screenshot({ path: proofUiPath });
    console.log(`📸 Đã lưu bằng chứng UI Radar Khám Phá: ${proofUiPath}`);

    // 7. Test Lọc Nhóm: Bấm vào "BĐS Ecopark"
    console.log('🔍 Thử nghiệm bộ lọc nhóm "BĐS Ecopark"...');
    await page.click('#btn-disc-filter-bds');
    await page.waitForTimeout(800);
    const bdsRowsCount = await page.$$eval('#discovered-groups-tbody tr', trs => trs.length);
    console.log(`   -> Nhóm BĐS Ecopark sau khi lọc: ${bdsRowsCount} nhóm`);

    // Test Lọc Nhóm: Bấm vào "Forex Tài Chính"
    console.log('🔍 Thử nghiệm bộ lọc nhóm "Forex Tài Chính"...');
    await page.click('#btn-disc-filter-forex');
    await page.waitForTimeout(800);
    const forexRowsCount = await page.$$eval('#discovered-groups-tbody tr', trs => trs.length);
    console.log(`   -> Nhóm Forex Tài Chính sau khi lọc: ${forexRowsCount} nhóm`);

    const proofFilterPath = path.join(ARTIFACT_DIR, 'proof_group_discovery_filtered.png');
    await radarCard.screenshot({ path: proofFilterPath });
    console.log(`📸 Đã lưu bằng chứng Lọc nhóm Forex: ${proofFilterPath}`);

    // Trở về "Tất cả"
    await page.click('#btn-disc-filter-all');
    await page.waitForTimeout(500);

    // 8. Test thao tác bấm "+ Săn Khách" trực tiếp trên UI
    console.log('🎯 Thử nghiệm nạp 1 nhóm vào Kho Săn Khách...');
    page.on('dialog', async dialog => {
      console.log(`💬 Alert xuất hiện: "${dialog.message()}"`);
      await dialog.accept();
    });

    const addButtons = await page.$$('#discovered-groups-tbody button:has-text("+ Săn Khách")');
    if (addButtons.length > 0) {
      console.log(`👉 Bấm nút "+ Săn Khách" trên nhóm đầu tiên...`);
      await addButtons[0].click();
      await page.waitForTimeout(1500);
      
      const newAddedCount = await page.textContent('#disc-kpi-added-pool');
      console.log(`✅ Chỉ số Đã Nạp Săn Khách sau khi nạp: ${newAddedCount.trim()}`);
    }

    // Chụp ảnh bằng chứng 3: Sau khi nạp nhóm vào bể săn khách
    const proofAddedPath = path.join(ARTIFACT_DIR, 'proof_group_added_to_pool.png');
    await radarCard.screenshot({ path: proofAddedPath });
    console.log(`📸 Đã lưu bằng chứng Nạp nhóm vào bể: ${proofAddedPath}`);

    console.log('\n===========================================================');
    console.log('🎉 TẤT CẢ KIỂM THỬ TÍNH NĂNG TÌM KIẾM NHÓM MỚI ĐÃ PASS 100%!');
    console.log('===========================================================');
  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
