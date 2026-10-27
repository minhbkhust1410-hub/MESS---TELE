const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });

  const htmlPath = path.resolve('D:/KudoX_Mess_Tele/HDSD_FALCONX_BDS_AUTOMATION.html');
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });

  const proofPdfPreview = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_pdf_preview.png';
  await page.screenshot({ path: proofPdfPreview, fullPage: false });
  console.log('PDF Preview screenshot saved to:', proofPdfPreview);

  await browser.close();
})();
