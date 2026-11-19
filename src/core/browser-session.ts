import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { chromium, request, type BrowserContext, type Page } from 'playwright';
import { config } from '../config/env.js';
import { getAllAccounts, saveAccount } from '../db/store.js';
import { detectCheckpoint } from './checkpoint-guard.js';

export interface ProxyTestResult {
  alive: boolean;
  ip?: string;
  country?: string;
  city?: string;
  isp?: string;
  latencyMs: number;
  error?: string;
  server?: string;
  isLeakingHostIp?: boolean;
}

export interface SessionOptions {
  accountId?: string;
  headless?: boolean;
  userDataDir?: string;
  viewport?: { width: number; height: number };
  proxy?: string | { server: string; username?: string; password?: string };
  skipProxyDoubleCheck?: boolean;
  requireProxyVerified?: boolean;
  initialCookies?: Array<{ name: string; value: string; domain: string; path: string; expires?: number }>;
}

export interface SessionResult {
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
  verifiedIp?: string;
  proxyLatencyMs?: number;
  proxyCountry?: string;
}

let cachedHostIp: string | null = null;
let lastHostIpCheck = 0;

/**
 * Lấy IP Public thật của máy chủ / máy trạm (Dùng làm mốc đối chứng chống rò rỉ IP)
 */
export async function getHostPublicIP(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedHostIp && now - lastHostIpCheck < 600_000) {
    return cachedHostIp;
  }
  try {
    const req = await request.newContext({ timeout: 6000 });
    const res = await req.get('https://api.ipify.org?format=json').catch(() => null);
    if (res && res.ok()) {
      const data = await res.json().catch(() => null);
      if (data?.ip) {
        cachedHostIp = String(data.ip).trim();
        lastHostIpCheck = now;
        await req.dispose().catch(() => {});
        return cachedHostIp;
      }
    }
    await req.dispose().catch(() => {});
  } catch {}
  return cachedHostIp || '';
}

export function parseProxy(proxyInput?: string | { server: string; username?: string; password?: string }): {
  server: string;
  username?: string;
  password?: string;
} | undefined {
  if (!proxyInput) return undefined;
  if (typeof proxyInput === 'object') {
    if (!proxyInput.server) return undefined;
    return {
      server: proxyInput.server.trim(),
      username: proxyInput.username?.trim(),
      password: proxyInput.password?.trim(),
    };
  }

  const clean = proxyInput.trim().replace(/^['"]|['"]$/g, '');
  if (!clean) return undefined;

  // Format: http://user:pass@ip:port or socks5://user:pass@ip:port
  if (clean.includes('://')) {
    try {
      const url = new URL(clean);
      return {
        server: `${url.protocol}//${url.hostname}:${url.port}`,
        username: url.username ? decodeURIComponent(url.username) : undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
      };
    } catch {}
  }

  // Format: ip:port:user:pass
  const parts = clean.split(':');
  if (parts.length === 4) {
    return {
      server: `http://${parts[0].trim()}:${parts[1].trim()}`,
      username: parts[2].trim(),
      password: parts[3].trim(),
    };
  }

  // Format: ip:port
  if (parts.length === 2) {
    return {
      server: `http://${parts[0].trim()}:${parts[1].trim()}`,
    };
  }

  return { server: clean.startsWith('http') || clean.startsWith('socks') ? clean : `http://${clean}` };
}

/**
 * Kiểm tra kết nối mạng của Proxy trước khi mở trình duyệt (Pre-flight Test)
 */
export async function testProxyNetwork(
  proxyInput?: string | { server: string; username?: string; password?: string },
  timeoutMs = 8000
): Promise<ProxyTestResult> {
  const start = Date.now();
  const parsed = parseProxy(proxyInput);

  if (!parsed) {
    const hostIp = await getHostPublicIP(true);
    let country = 'Vietnam';
    let city = 'Hanoi';
    let isp = 'Local Host';
    try {
      if (hostIp) {
        const req = await request.newContext({ timeout: 4000 });
        const geoRes = await req.get(`http://ip-api.com/json/${hostIp}`).catch(() => null);
        if (geoRes && geoRes.ok()) {
          const geo = await geoRes.json().catch(() => null);
          if (geo && geo.status === 'success') {
            country = geo.country || country;
            city = geo.city || city;
            isp = geo.isp || isp;
          }
        }
        await req.dispose().catch(() => {});
      }
    } catch {}
    return {
      alive: true,
      ip: hostIp || 'Direct IP',
      country,
      city,
      isp,
      latencyMs: Date.now() - start,
      server: 'Direct (No Proxy)',
      isLeakingHostIp: false,
    };
  }

  let reqCtx = null;
  try {
    const hostIp = await getHostPublicIP();

    reqCtx = await request.newContext({
      proxy: parsed,
      timeout: timeoutMs,
    });

    let detectedIp = '';
    const res = await reqCtx.get('https://api.ipify.org?format=json', { timeout: timeoutMs }).catch(() => null);
    if (res && res.ok()) {
      const data = await res.json().catch(() => null);
      if (data && data.ip) detectedIp = String(data.ip).trim();
    }

    if (!detectedIp) {
      const res2 = await reqCtx.get('https://httpbin.org/ip', { timeout: timeoutMs }).catch(() => null);
      if (res2 && res2.ok()) {
        const data2 = await res2.json().catch(() => null);
        if (data2 && data2.origin) detectedIp = String(data2.origin).split(',')[0].trim();
      }
    }

    if (!detectedIp) {
      throw new Error(`Proxy kết nối được nhưng không phản hồi IP ra ngoài.`);
    }

    const latencyMs = Date.now() - start;
    const isLeakingHostIp = Boolean(hostIp && detectedIp === hostIp);

    let country = 'Unknown';
    let city = 'Unknown';
    let isp = 'Unknown';
    try {
      const geoRes = await reqCtx.get(`http://ip-api.com/json/${detectedIp}`, { timeout: 4000 }).catch(() => null);
      if (geoRes && geoRes.ok()) {
        const geo = await geoRes.json().catch(() => null);
        if (geo && geo.status === 'success') {
          country = geo.country || country;
          city = geo.city || city;
          isp = geo.isp || isp;
        }
      }
    } catch {}

    await reqCtx.dispose().catch(() => {});

    return {
      alive: true,
      ip: detectedIp,
      country,
      city,
      isp,
      latencyMs,
      server: parsed.server,
      isLeakingHostIp,
    };
  } catch (err: any) {
    if (reqCtx) await reqCtx.dispose().catch(() => {});
    return {
      alive: false,
      latencyMs: Date.now() - start,
      server: parsed.server,
      error: err.message || 'Lỗi không xác định khi kết nối Proxy',
      isLeakingHostIp: false,
    };
  }
}

/**
 * DOUBLE-CHECK trong trình duyệt Chromium
 */
export async function verifyBrowserProxyIP(
  page: Page,
  proxyInput?: string | { server: string; username?: string; password?: string }
): Promise<ProxyTestResult> {
  const start = Date.now();
  const parsed = parseProxy(proxyInput);
  const hostIp = await getHostPublicIP();

  try {
    const resp = await page.goto('https://api.ipify.org?format=json', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });

    let detectedIp = '';
    const bodyText = await resp?.text().catch(() => '');
    if (bodyText) {
      try {
        const parsedJson = JSON.parse(bodyText);
        if (parsedJson && parsedJson.ip) detectedIp = String(parsedJson.ip).trim();
      } catch {
        detectedIp = bodyText.trim();
      }
    }

    if (!detectedIp) {
      detectedIp = await page.evaluate(async () => {
        try {
          const r = await fetch('https://api.ipify.org?format=json');
          const j = await r.json();
          return j.ip || '';
        } catch {
          return '';
        }
      }).catch(() => '');
    }

    if (!detectedIp) {
      throw new Error('Trình duyệt Chromium không thể truy vấn IP kiểm tra ra ngoài.');
    }

    const latencyMs = Date.now() - start;
    const isLeakingHostIp = Boolean(parsed && hostIp && detectedIp === hostIp);

    let country = 'Vietnam';
    let city = 'Hanoi';
    let isp = 'ISP';
    try {
      const geoResp = await page.goto(`http://ip-api.com/json/${detectedIp}`, {
        waitUntil: 'domcontentloaded',
        timeout: 8_000,
      }).catch(() => null);
      if (geoResp) {
        const geoText = await geoResp.text().catch(() => '');
        const geoJson = JSON.parse(geoText);
        if (geoJson.status === 'success') {
          country = geoJson.country || country;
          city = geoJson.city || city;
          isp = geoJson.isp || isp;
        }
      }
    } catch {}

    return {
      alive: true,
      ip: detectedIp,
      country,
      city,
      isp,
      latencyMs,
      server: parsed?.server || 'Direct',
      isLeakingHostIp,
    };
  } catch (err: any) {
    return {
      alive: false,
      latencyMs: Date.now() - start,
      server: parsed?.server || 'Direct',
      error: err.message || 'Lỗi Double-check trong Chromium',
      isLeakingHostIp: false,
    };
  }
}


/**
 * Dọn dẹp tiến trình treo và xóa sạch các file lock của Chromium / Chrome trên Windows
 */
export function unlockProfileDir(profileDir: string): void {
  const absDir = path.resolve(profileDir);
  if (!fs.existsSync(absDir)) return;

  if (process.platform === 'win32') {
    try {
      const folderName = path.basename(absDir);
      const query = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\\"Name = 'chrome.exe'\\\" | Where-Object { \$_.CommandLine -like '*${folderName}*' } | Select-Object -ExpandProperty ProcessId"`;
      const out = execSync(query, { timeout: 3500, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      if (out) {
        const pids = out.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
        for (const pid of pids) {
          try {
            execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
          } catch {}
        }
      }
    } catch {}
  }

  for (const lockFileName of ['lockfile', 'parent.lock', 'SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const lockPath = path.join(absDir, lockFileName);
    if (fs.existsSync(lockPath)) {
      try {
        fs.unlinkSync(lockPath);
      } catch {}
    }
  }
}

export async function createBrowserSession(options: SessionOptions = {}): Promise<SessionResult> {
  const profileDir = options.userDataDir || config.fbProfileDir;

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  unlockProfileDir(profileDir);

  // Tìm tài khoản tương ứng trong Cloud DB (để lấy Proxy riêng & Cookie đồng bộ đám mây)
  const matchedAccount = getAllAccounts().find(
    (a) =>
      (options.accountId && a.id === options.accountId) ||
      path.resolve(a.profileDir || '') === path.resolve(profileDir)
  );

  const effectiveProxy = options.proxy !== undefined ? options.proxy : matchedAccount?.proxy;
  const isHeadless = options.headless !== undefined ? options.headless : config.headless;
  const hasRealChrome = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  const parsedProxy = parseProxy(effectiveProxy);

  let verifiedIp: string | undefined;
  let proxyLatencyMs: number | undefined;
  let proxyCountry: string | undefined;

  if (parsedProxy) {
    console.log(`🌐 [KudoX Pre-flight] Đang kiểm tra an toàn Proxy riêng: ${parsedProxy.server}...`);
    const preflight = await testProxyNetwork(effectiveProxy, 10_000);

    if (!preflight.alive) {
      const errDetail = `[PROXY LỖI KẾT NỐI] Proxy ${parsedProxy.server} không phản hồi (${preflight.error || 'Timeout'}). ĐÃ HỦY MỞ TRÌNH DUYỆT ĐỂ CHỐNG LỘ IP GỐC!`;
      console.error(`🚨 ${errDetail}`);
      throw new Error(errDetail);
    }

    if (preflight.isLeakingHostIp) {
      const leakDetail = `[RÒ RỈ IP CỰC KỲ NGUY HIỂM] Proxy ${parsedProxy.server} trả về IP trùng với IP máy thật (${preflight.ip})! ĐÃ NGẮT NGAY ĐỂ BẢO VỆ TÀI KHOẢN!`;
      console.error(`🚨 ${leakDetail}`);
      throw new Error(leakDetail);
    }

    console.log(`✅ [KudoX Pre-flight OK] Proxy sống tốt! IP Out: ${preflight.ip} | Quốc gia: ${preflight.country || 'N/A'} | Độ trễ: ${preflight.latencyMs}ms`);
    verifiedIp = preflight.ip;
    proxyLatencyMs = preflight.latencyMs;
    proxyCountry = preflight.country;
  } else {
    console.log(`🌐 [KudoX Network] Tài khoản không gắn Proxy -> Chạy IP trực tiếp của máy.`);
  }

  const isVisual = !isHeadless;
  const launchOptions: any = {
    headless: isHeadless,
    channel: hasRealChrome ? 'chrome' : undefined,
    proxy: parsedProxy,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    permissions: ['clipboard-read', 'clipboard-write'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-infobars',
      '--disable-notifications',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--enforce-webrtc-ip-permission-check',
      '--dns-prefetch-disable',
      ...(isVisual ? ['--start-maximized'] : []),
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };

  if (isVisual) {
    launchOptions.viewport = null; // Tự động tối ưu toàn màn hình không bị viền đen
  } else {
    launchOptions.viewport = options.viewport || { width: 1366, height: 768 };
  }

  const context = await chromium.launchPersistentContext(profileDir, launchOptions);

  // =========================================================================
  // KHÔI PHỤC COOKIE ĐÁM MÂY TỰ ĐỘNG (Cloud Portable Session Restore)
  // Giúp 40-100 nick chạy ngay trên bất kỳ Server Public / Container nào mà không cần copy thư mục .user-data
  // =========================================================================
  const cloudCookies = options.initialCookies || matchedAccount?.cookies;
  if (cloudCookies && Array.isArray(cloudCookies) && cloudCookies.length > 0) {
    try {
      const existingCookies = await context.cookies('https://www.facebook.com').catch(() => []);
      const hasLoggedInCookie = existingCookies.some((c) => c.name === 'c_user' && c.value);
      if (!hasLoggedInCookie) {
        const sanitized = cloudCookies
          .filter((c) => c && c.name && c.value)
          .map((c) => ({
            name: String(c.name),
            value: String(c.value),
            domain: c.domain || '.facebook.com',
            path: c.path || '/',
            ...(typeof c.expires === 'number' && c.expires > 0 ? { expires: c.expires } : {}),
          }));
        if (sanitized.length > 0) {
          await context.addCookies(sanitized);
          console.log(`☁️ [Cloud Cookie Vault] Đã tự động nạp ${sanitized.length} cookie đám mây cho tài khoản ${matchedAccount?.name || profileDir}`);
        }
      }
    } catch (e: any) {
      console.warn(`⚠️ [Cloud Cookie Vault] Không thể nạp cookie ban đầu: ${e.message}`);
    }
  }

  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(45_000);

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  if (parsedProxy && !options.skipProxyDoubleCheck) {
    console.log(`🛡️ [KudoX Double-Check] Đang kiểm tra lớp thứ 2 từ bên trong Chromium...`);
    try {
      const doubleCheck = await verifyBrowserProxyIP(page, effectiveProxy);

      if (!doubleCheck.alive) {
        await context.close().catch(() => {});
        throw new Error(`[DOUBLE-CHECK THẤT BẠI] Trình duyệt không thể kết nối ra ngoài qua Proxy (${doubleCheck.error}). Đã đóng Chromium ngay lập tức!`);
      }

      if (doubleCheck.isLeakingHostIp) {
        await context.close().catch(() => {});
        throw new Error(`[RÒ RỈ IP BÊN TRONG CHROMIUM] Trình duyệt báo IP ${doubleCheck.ip} trùng với IP máy thật! Đã đóng Chromium khẩn cấp để ngăn chặn dính nick!`);
      }

      console.log(`🛡️ [KudoX Double-Check THÀNH CÔNG] Xác nhận trình duyệt Chromium đang bọc an toàn qua Proxy: ${doubleCheck.ip} (${doubleCheck.country}, ping ${doubleCheck.latencyMs}ms). Tuyệt đối không rò rỉ!`);
      verifiedIp = doubleCheck.ip;
      proxyLatencyMs = doubleCheck.latencyMs;
      proxyCountry = doubleCheck.country;
    } catch (err: any) {
      await context.close().catch(() => {});
      throw err;
    }
  }

  const close = async () => {
    // Trước khi đóng Chromium, tự động chụp lại Cookie mới nhất đẩy vào Cloud DB
    if (matchedAccount) {
      try {
        const latestCookies = await context.cookies('https://www.facebook.com').catch(() => []);
        const cUser = latestCookies.find((c) => c.name === 'c_user' && c.value);
        if (cUser) {
          saveAccount({
            id: matchedAccount.id,
            uid: cUser.value,
            cookies: latestCookies.map((c) => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path,
              expires: c.expires,
            })),
            verifiedProxyIp: verifiedIp || matchedAccount.verifiedProxyIp,
            proxyLatencyMs: proxyLatencyMs || matchedAccount.proxyLatencyMs,
            proxyCountry: proxyCountry || matchedAccount.proxyCountry,
          });
        }
      } catch {}
    }
    await context.close().catch(() => undefined);
  };

  return { context, page, close, verifiedIp, proxyLatencyMs, proxyCountry };
}

export async function checkCookiesLoggedIn(context: BrowserContext): Promise<{
  isLoggedIn: boolean;
  fbUid?: string | null;
}> {
  try {
    const cookies = await context.cookies('https://www.facebook.com');
    const cUserCookie = cookies.find((c) => c.name === 'c_user');
    if (cUserCookie && cUserCookie.value) {
      return {
        isLoggedIn: true,
        fbUid: cUserCookie.value,
      };
    }
  } catch {
    // Bỏ qua lỗi
  }
  return { isLoggedIn: false };
}
