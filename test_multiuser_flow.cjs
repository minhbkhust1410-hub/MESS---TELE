const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3300 ...');
  await page.goto('http://localhost:3300', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // 1. Chuyển sang Tab Tạo Tài Khoản
  console.log('Switching to Register tab...');
  await page.click('#tab-auth-register-btn');
  await page.waitForTimeout(800);

  // Chụp ảnh màn hình Tạo Tài Khoản
  const regProofPath = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_register_screen.png';
  await page.screenshot({ path: regProofPath });
  console.log('1. Register screen screenshot saved to:', regProofPath);

  // 2. Điền thông tin người quản lý mới
  console.log('Filling registration form...');
  await page.fill('#reg-name', 'Bùi Anh Minh');
  await page.fill('#reg-username', 'buianhminh');
  await page.fill('#reg-password', 'password123');
  await page.waitForTimeout(500);

  // 3. Submit tạo tài khoản
  console.log('Submitting register form...');
  page.on('dialog', async dialog => {
    console.log('Dialog popped up:', dialog.message());
    await dialog.accept();
  });

  await page.click('#reg-btn-submit');
  await page.waitForTimeout(2500);

  // 4. Chụp ảnh màn hình Dashboard với user profile hiển thị
  const userDashProofPath = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_user_profile_dashboard.png';
  await page.screenshot({ path: userDashProofPath });
  console.log('2. User profile dashboard screenshot saved to:', userDashProofPath);

  // 5. Kiểm tra thông tin hiển thị trên UI
  const headerName = await page.textContent('#header-user-name');
  const sidebarName = await page.textContent('#sidebar-manager-name');
  console.log('Header user name:', headerName);
  console.log('Sidebar manager name:', sidebarName);

  await browser.close();
  console.log('Multi-user test finished successfully.');
})();
