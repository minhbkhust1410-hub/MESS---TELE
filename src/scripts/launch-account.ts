import { launchNativeChromeForAccount } from '../core/native-chrome-launcher.js';
import { getAccountById, getAllAccounts } from '../db/store.js';

export async function launchVisualAccountChrome(accountId: string, targetUrl = 'https://www.facebook.com/'): Promise<void> {
  const acc = getAccountById(accountId);
  if (!acc) {
    console.error(`❌ Không tìm thấy tài khoản với ID: ${accountId}`);
    return;
  }

  console.log(`🚀 [Launcher] Đang khởi chạy Google Chrome Profile cho nick: "${acc.name}"...`);
  console.log(`🛡️ Proxy bảo vệ: ${acc.proxy || 'Trực tiếp (Direct)'}`);

  const res = await launchNativeChromeForAccount(accountId, targetUrl);
  if (res.success) {
    console.log(`✅ [THÀNH CÔNG] ${res.message}`);
    console.log(`🖥️ Cửa sổ Google Chrome thật đã xuất hiện trên màn hình máy tính của bạn!`);
  } else {
    console.error(`❌ [THẤT BẠI] ${res.error}`);
  }
}

// Nếu chạy từ command line: npx tsx src/scripts/launch-account.ts <accountId> [targetUrl]
const argAccId = process.argv[2];
if (argAccId) {
  const argUrl = process.argv[3];
  launchVisualAccountChrome(argAccId, argUrl).catch((err) => {
    console.error('Lỗi khi mở Chrome:', err);
  });
}
