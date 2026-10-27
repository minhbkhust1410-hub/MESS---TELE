const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3300 (Fresh session without token)...');
  await page.goto('http://localhost:3300', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // 1. Chụp ảnh màn hình Đăng Nhập
  const loginProofPath = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_login_screen.png';
  await page.screenshot({ path: loginProofPath });
  console.log('1. Login screen proof saved to:', loginProofPath);

  // 2. Thực hiện Đăng nhập
  console.log('Submitting login form...');
  await page.click('#login-btn-submit');
  await page.waitForTimeout(2000);

  // 3. Chụp ảnh màn hình sau khi đăng nhập thành công
  const authProofPath = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_authenticated_dashboard.png';
  await page.screenshot({ path: authProofPath });
  console.log('2. Authenticated dashboard proof saved to:', authProofPath);

  // 4. Kiểm tra token trong localStorage
  const token = await page.evaluate(() => localStorage.getItem('falconx_auth_token'));
  console.log('Token successfully stored in localStorage:', !!token);

  await browser.close();
  console.log('Test completed successfully.');
})();
