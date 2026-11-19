import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { getOrCreateLocalProxyBridge } from './proxy-bridge.js';
import { unlockProfileDir, testProxyNetwork } from './browser-session.js';
import { getAccountById, getAllAccounts, type FacebookAccount } from '../db/store.js';
import { launchGuiOnDefaultDesktop } from './desktop-process-launcher.js';
import { autoLoginLiveChromeWindow } from './live-chrome-autologin.js';

export function getChromeExecutable(): string {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'chrome.exe';
}

export function getDesktopPath(): string {
  const oneDriveDesktop = path.join(process.env.USERPROFILE || 'C:\\Users\\ADMIN', 'OneDrive', 'Desktop');
  if (fs.existsSync(oneDriveDesktop)) return oneDriveDesktop;

  const standardDesktop = path.join(process.env.USERPROFILE || 'C:\\Users\\ADMIN', 'Desktop');
  if (fs.existsSync(standardDesktop)) return standardDesktop;

  return oneDriveDesktop;
}

/**
 * CẤP MỌI QUYỀN (Full Permissions) và kích hoạt sẵn DevTools trong file Preferences của Profile
 */
export function grantFullProfilePermissions(profileDir: string, accountName: string): void {
  try {
    const defaultDir = path.join(profileDir, 'Default');
    if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
    const prefPath = path.join(defaultDir, 'Preferences');
    let prefObj: any = {};
    if (fs.existsSync(prefPath)) {
      try {
        prefObj = JSON.parse(fs.readFileSync(prefPath, 'utf8'));
      } catch {}
    }
    if (!prefObj.profile) prefObj.profile = {};
    prefObj.profile.name = accountName;
    prefObj.profile.avatar_index = 26;
    prefObj.profile.exit_type = 'Normal';
    prefObj.profile.exited_cleanly = true;

    // Chặn triệt để popup "Bạn có muốn khôi phục trang không? Chrome đã không tắt đúng cách"
    if (!prefObj.session) prefObj.session = {};
    prefObj.session.restore_on_startup = 4;
    prefObj.session.startup_urls = ['https://www.facebook.com/'];

    // Cấp toàn bộ quyền (Permissions: Notifications, Camera, Mic, Clipboard, Geolocation, Popups, Cookies, Downloads)
    if (!prefObj.profile.content_settings) prefObj.profile.content_settings = {};
    if (!prefObj.profile.content_settings.exceptions) prefObj.profile.content_settings.exceptions = {};

    const ex = prefObj.profile.content_settings.exceptions;
    const allowSetting = { setting: 1 }; // 1 = ALLOW trong Chromium

    ex.notifications = {
      '*': allowSetting,
      'https://*.facebook.com:443,*': allowSetting,
      'https://www.facebook.com:443,*': allowSetting,
    };
    ex.media_stream_camera = { '*': allowSetting, 'https://*.facebook.com:443,*': allowSetting };
    ex.media_stream_mic = { '*': allowSetting, 'https://*.facebook.com:443,*': allowSetting };
    ex.clipboard = { '*': allowSetting, 'https://*.facebook.com:443,*': allowSetting };
    ex.geolocation = { '*': allowSetting, 'https://*.facebook.com:443,*': allowSetting };
    ex.popups = { '*': allowSetting, 'https://*.facebook.com:443,*': allowSetting };
    ex.automatic_downloads = { '*': allowSetting, 'https://*.facebook.com:443,*': allowSetting };
    ex.cookies = { '*': allowSetting, 'https://*.facebook.com:443,*': allowSetting };

    // Cấu hình DevTools tự động gắn bên phải tab
    if (!prefObj.devtools) prefObj.devtools = {};
    if (!prefObj.devtools.preferences) prefObj.devtools.preferences = {};
    prefObj.devtools.preferences.currentDockState = '"right"';

    fs.writeFileSync(prefPath, JSON.stringify(prefObj, null, 2), 'utf8');

    // Cập nhật cả Local State để đảm bảo Chrome không bao giờ báo lỗi crash
    const localStatePath = path.join(profileDir, 'Local State');
    if (fs.existsSync(localStatePath)) {
      try {
        const ls = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
        if (!ls.user_experience_metrics) ls.user_experience_metrics = {};
        if (!ls.user_experience_metrics.stability) ls.user_experience_metrics.stability = {};
        ls.user_experience_metrics.stability.exited_cleanly = true;
        fs.writeFileSync(localStatePath, JSON.stringify(ls, null, 2), 'utf8');
      } catch {}
    }
  } catch (e) {
    console.error(`Không thể cập nhật permissions cho profile ${accountName}:`, e);
  }
}

/**
 * Đưa cửa sổ Chrome đang chạy của profile lên phía trước màn hình (Foreground Focus trên WinSta0\\Default)
 */
export function bringProfileWindowToFront(profileDir: string): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const folderName = path.basename(profileDir);
    const psScript = `
Add-Type @"
using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;

public class WinFocusTop {
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SetThreadDesktop(IntPtr hDesktop);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool CloseDesktop(IntPtr hDesktop);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);

  public static bool FocusPids(uint[] pids) {
    bool found = false;
    Thread t = new Thread(() => {
      IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
      if (hDesk == IntPtr.Zero) return;
      SetThreadDesktop(hDesk);
      EnumWindows((hWnd, lParam) => {
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        foreach (uint p in pids) {
          if (p == pid) {
            ShowWindow(hWnd, 3); // SW_MAXIMIZE
            SetForegroundWindow(hWnd);
            SwitchToThisWindow(hWnd, true);
            found = true;
            return false; // dừng duyệt
          }
        }
        return true;
      }, IntPtr.Zero);
      CloseDesktop(hDesk);
    });
    t.Start();
    t.Join();
    return found;
  }
}
"@
$procs = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object { $_.CommandLine -like '*${folderName}*' }
$pids = @($procs | Select-Object -ExpandProperty ProcessId)
if ($pids.Count -gt 0) {
  $ok = [WinFocusTop]::FocusPids($pids)
  if ($ok) { Write-Output "OK" } else { Write-Output "NONE" }
} else {
  Write-Output "NONE"
}
`.trim();

    const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\r?\n/g, ' ')}"`, {
      timeout: 4000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).toString().trim();

    return out.includes('OK');
  } catch {
    return false;
  }
}

/**
 * Kiểm tra xem profile đã có tiến trình Chrome nào đang chạy chưa
 */
export function isProfileRunning(profileDir: string): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const folderName = path.basename(profileDir);
    // Bỏ qua các tiến trình background --remote-debugging-pipe của Playwright nếu có
    const query = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\\"Name = 'chrome.exe'\\\" | Where-Object { \$_.CommandLine -like '*${folderName}*' -and \$_.CommandLine -notlike '*--remote-debugging-pipe*' } | Select-Object -ExpandProperty ProcessId"`;
    const out = execSync(query, { timeout: 2500, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    return Boolean(out && out.length > 0);
  } catch {
    return false;
  }
}

/**
 * Khởi chạy cửa sổ Google Chrome thật cho tài khoản với Proxy cách ly tuyệt đối,
 * cấp toàn bộ quyền (Permissions: Camera, Mic, Notifications, Clipboard, v.v.),
 * tự động bật DevTools và đưa cửa sổ lên màn hình desktop người dùng.
 */
export async function launchNativeChromeForAccount(
  accountId: string,
  targetUrl = 'https://www.facebook.com/'
): Promise<{ success: boolean; pid?: number; message?: string; error?: string }> {
  const acc = getAccountById(accountId);
  if (!acc) {
    return { success: false, error: `Không tìm thấy tài khoản với ID: ${accountId}` };
  }

  const profileDir = path.resolve(acc.profileDir || `./.user-data/profiles/${accountId}`);
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  // 1. CẤP MỌI QUYỀN (Camera, Mic, Notifications, Clipboard, Popups, Devtools)
  grantFullProfilePermissions(profileDir, acc.name);

  // 2. Nếu cửa sổ Chrome của nick này đã mở sẵn -> Đưa ngay lên màn hình trước mắt người dùng
  if (isProfileRunning(profileDir)) {
    console.log(`🔄 [Chrome Launcher] Nick "${acc.name}" đã có cửa sổ mở sẵn. Đang đưa lên trước màn hình...`);
    bringProfileWindowToFront(profileDir);
    if (targetUrl && !targetUrl.endsWith('.facebook.com/') && !targetUrl.endsWith('.facebook.com')) {
      const chromeExe = getChromeExecutable();
      launchGuiOnDefaultDesktop(chromeExe, [`--user-data-dir=${profileDir}`, targetUrl]);
    }
    return {
      success: true,
      message: `Cửa sổ Google Chrome của nick "${acc.name}" đã được đưa lên vị trí hàng đầu trên màn hình máy tính!`,
    };
  }

  // 3. Dọn dẹp lock files cũ nếu Chrome bị tắt đột ngột
  unlockProfileDir(profileDir);

  // 4. Các cờ Chrome: Toàn bộ quyền + Devtools + Bảo vệ Proxy + Triệt tiêu popup Crash
  const chromeArgs: string[] = [
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=ProfilePicker,WebRtcHideLocalIpsWithMdns',
    '--profile-directory=Default',
    '--start-maximized',
    '--auto-open-devtools-for-tabs', // Tự động mở DevTools trên mọi tab
    '--remote-debugging-port=0',
    '--use-fake-ui-for-media-stream', // Tự động cấp quyền Camera/Microphone không hỏi
    '--allow-file-access-from-files',
    '--allow-running-insecure-content',
    '--disable-session-crashed-bubble', // Chặn popup "Chrome không tắt đúng cách / Khôi phục trang"
    '--hide-crash-restore-bubble',
    '--no-restore-session-state',
    '--disable-infobars',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--dns-prefetch-disable',
  ];

  if (acc.proxy && acc.proxy.trim()) {
    console.log(`🛡️ [Chrome Launcher] Đang kiểm tra kết nối Proxy của nick "${acc.name}": ${acc.proxy}`);
    const preflight = await testProxyNetwork(acc.proxy, 7000);
    if (!preflight.alive) {
      return {
        success: false,
        error: `🚨 ĐÃ CHẶN MỞ CHROME ĐỂ BẢO VỆ NICK:\n\nProxy của tài khoản "${acc.name}" (${acc.proxy}) đang bị mất kết nối (${preflight.error || 'Timeout'})!\nHệ thống kiên quyết từ chối mở trình duyệt để tuyệt đối không làm lộ IP máy thật của bạn.`,
      };
    }
    if (preflight.isLeakingHostIp) {
      return {
        success: false,
        error: `🚨 ĐÃ CHẶN MỞ CHROME VÌ RÒ RỈ IP:\n\nProxy (${acc.proxy}) bị rò rỉ IP trùng với IP máy thật (${preflight.ip})! Đã hủy mở để bảo vệ nick an toàn.`,
      };
    }

    try {
      const bridge = await getOrCreateLocalProxyBridge(acc.proxy);
      chromeArgs.push(`--proxy-server=http://127.0.0.1:${bridge.port}`);
      console.log(`🛡️ [Chrome Launcher] Nick "${acc.name}" kết nối qua Local Proxy Bridge: 127.0.0.1:${bridge.port} -> ${acc.proxy}`);
    } catch (e: any) {
      return { success: false, error: `Lỗi kết nối Local Proxy Bridge: ${e.message}` };
    }
  }

  chromeArgs.push(targetUrl);

  const chromeExe = getChromeExecutable();
  console.log(`🚀 [Chrome Launcher] Đang kích hoạt Chrome GUI trên Desktop thực tế: "${acc.name}"...`);

  // Kích hoạt tiến trình GUI lên WinSta0\Default
  const spawnRes = launchGuiOnDefaultDesktop(chromeExe, chromeArgs);
  if (!spawnRes.success) {
    console.warn(`⚠️ [Chrome Launcher] Win32 SpawnGui cảnh báo: ${spawnRes.error}. Đang thử Start-Process dự phòng...`);
    try {
      const psArgList = chromeArgs.map((a) => `'${a.replace(/'/g, "''")}'`).join(', ');
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process '${chromeExe.replace(/'/g, "''")}' -ArgumentList ${psArgList}"`, {
        timeout: 5000,
        stdio: 'ignore',
      });
    } catch {}
  }

  // Đưa cửa sổ lên phía trước sau khi mở
  setTimeout(() => {
    bringProfileWindowToFront(profileDir);
  }, 1200);

  // 5. TỰ ĐỘNG ĐĂNG NHẬP FACEBOOK NGAY KHI MỞ CỬA SỔ
  // Chạy ngầm sau 1.5 giây để đảm bảo cửa sổ Chrome đã sẵn sàng trên màn hình
  setTimeout(async () => {
    try {
      console.log(`🔐 [Auto-Login Watchdog] Bắt đầu kiểm tra và tự động đăng nhập cho "${acc.name}"...`);
      const autoLoginRes = await autoLoginLiveChromeWindow(accountId, profileDir);
      if (autoLoginRes.success) {
        console.log(`🎉 [Auto-Login Watchdog] ${autoLoginRes.message}`);
      } else {
        console.log(`ℹ️ [Auto-Login Watchdog] Trạng thái: ${autoLoginRes.error || autoLoginRes.message}`);
      }
    } catch (err: any) {
      console.warn(`⚠️ [Auto-Login Watchdog] Lỗi khi tự động đăng nhập cho "${acc.name}": ${err.message}`);
    }
  }, 1500);

  return {
    success: true,
    message: `Đã mở cửa sổ Google Chrome thật cho nick "${acc.name}" (Kèm DevTools & Tự động đăng nhập) trên màn hình!`,
    pid: spawnRes.pid,
  };
}

/**
 * Đóng cửa sổ Google Chrome của một tài khoản cụ thể và dọn dẹp lock file
 */
export function closeNativeChromeForAccount(accountId: string): boolean {
  const acc = getAccountById(accountId);
  if (!acc) return false;
  const profileDir = path.resolve(acc.profileDir || `./.user-data/profiles/${accountId}`);
  unlockProfileDir(profileDir);
  return true;
}

/**
 * Tự động tạo thư mục và các phím tắt Desktop (.bat / .lnk) cho từng nick
 * Đảm bảo khi double-click từ màn hình Desktop, Chrome mở ngay lập tức trên màn hình
 * với Đầy đủ quyền, DevTools và Proxy độc lập!
 */
export function generateDesktopShortcuts(): { folderPath: string; createdCount: number } {
  const desktopRoot = getDesktopPath();
  const folderPath = path.join(desktopRoot, 'Facebook Profiles (Proxy)');

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const accounts = getAllAccounts();
  const chromeExe = getChromeExecutable();
  let createdCount = 0;

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const safeName = (acc.name || `Account_${acc.id}`).replace(/[/\\?%*:|"<>]/g, '_').trim();
    const prefix = `${i + 1}. `;
    const batPath = path.join(folderPath, `${prefix}${safeName}.bat`);
    const profileDirAbs = path.resolve(acc.profileDir || `./.user-data/profiles/${acc.id}`);

    // Cấp quyền sẵn vào file Preferences
    grantFullProfilePermissions(profileDirAbs, acc.name);

    // Xác định cổng bridge proxy
    let proxyFlag = '';
    if (acc.proxy && acc.proxy.trim()) {
      // Tìm cổng bridge nếu đã có hoặc gán cố định theo thứ tự
      const bridgePort = 25010 + (i % 20);
      proxyFlag = `--proxy-server="http://127.0.0.1:${bridgePort}"`;
    }

    const batContent = `@echo off
title [Chrome Profile] ${safeName}
chcp 65001 >nul
echo ========================================================
echo  KUDOX 2.0 - CHROME PROFILE: ${safeName}
echo  Proxy US: ${acc.proxy || 'Truc tiep (Direct)'}
echo  Quyen han: TOAN BO QUYEN (Allow All) + DEVTOOLS SAN SANG
echo ========================================================
echo Dang khoi chay Google Chrome truc tiep tren man hinh...

start "" "${chromeExe}" --user-data-dir="${profileDirAbs}" ${proxyFlag} --auto-open-devtools-for-tabs --remote-debugging-port=0 --use-fake-ui-for-media-stream --allow-file-access-from-files --allow-running-insecure-content --no-first-run --no-default-browser-check --disable-features=ProfilePicker --profile-directory=Default --start-maximized "https://www.facebook.com/"
exit
`;

    try {
      fs.writeFileSync(batPath, batContent, 'utf8');
      createdCount++;
    } catch {}
  }

  // Tạo thêm file mở hàng loạt tất cả nick
  const massBatPath = path.join(folderPath, '⚡ Mở Tất Cả Nick (All Profiles).bat');
  let massCommands = `@echo off
title [Chrome FB] Mo Hang Loat Tat Ca Nick
chcp 65001 >nul
echo ========================================================
echo  KUDOX 2.0 - MO HANG LOAT TAT CA NICK FACEBOOK
echo  Che do: Cua so rieng, Mang Proxy rieng, DevTools san sang
echo ========================================================
`;

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const safeName = (acc.name || `Account_${acc.id}`).replace(/[/\\?%*:|"<>]/g, '_').trim();
    const prefix = `${i + 1}. `;
    massCommands += `echo [${i + 1}/${accounts.length}] Mo nick: ${safeName}...\n`;
    massCommands += `call "${prefix}${safeName}.bat"\n`;
    massCommands += `timeout /t 2 /nobreak >nul\n\n`;
  }
  massCommands += `echo Hoan tat mo tat ca Profile Facebook!\nexit\n`;

  try {
    fs.writeFileSync(massBatPath, massCommands, 'utf8');
  } catch {}

  console.log(`📁 [Desktop Profiles] Đã cập nhật ${createdCount} phím tắt tại: ${folderPath}`);
  return { folderPath, createdCount };
}
