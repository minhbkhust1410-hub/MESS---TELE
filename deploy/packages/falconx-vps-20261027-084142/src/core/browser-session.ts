import fs from 'node:fs';
import path from 'node:path';
import { chromium, request, type BrowserContext, type Page } from 'playwright';
import { config } from '../config/env.js';
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
  headless?: boolean;
  userDataDir?: string;
  viewport?: { width: number; height: number };
  proxy?: string | { server: string; username?: string; password?: string };
  skipProxyDoubleCheck?: boolean;
  requireProxyVerified?: boolean;
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
 * - Đo latency thực tế
 * - Kiểm tra IP ra ngoài
 * - Lấy thông tin quốc gia, thành phố, nhà mạng
 * - So sánh đối chứng với IP máy thật để phát hiện rò rỉ (Leak Check)
 */
export async function testProxyNetwork(
  proxyInput?: string | { server: string; username?: string; password?: string },
  timeoutMs = 8000
): Promise<ProxyTestResult> {
  const start = Date.now();
  const parsed = parseProxy(proxyInput);

  if (!parsed) {
    // Không có proxy -> Đo mạng trực tiếp của máy
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

    // 1. Lấy IP ngoại mạng qua tunnel proxy
    let detectedIp = '';
    const res = await reqCtx.get('https://api.ipify.org?format=json', { timeout: timeoutMs }).catch(() => null);
    if (res && res.ok()) {
      const data = await res.json().catch(() => null);
      if (data && data.ip) detectedIp = String(data.ip).trim();
    }

    if (!detectedIp) {
      // Fallback endpoint nếu ipify bị bận
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

    // 2. Kiểm tra rò rỉ IP (Leak Check)
    const isLeakingHostIp = Boolean(hostIp && detectedIp === hostIp);

    // 3. Tra cứu thông tin Quốc gia & Nhà mạng (Geo Lookup)
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
 * DOUBLE-CHECK trong trình duyệt Chromium:
 * Chạy lệnh truy vấn trực tiếp từ Page context của Chromium để đảm bảo 100%
 * trình duyệt Chromium đã được bọc trong Proxy tunnel trước khi mở Facebook.
 */
export async function verifyBrowserProxyIP(
  page: Page,
  proxyInput?: string | { server: string; username?: string; password?: string }
): Promise<ProxyTestResult> {
  const start = Date.now();
  const parsed = parseProxy(proxyInput);
  const hostIp = await getHostPublicIP();

  try {
    // Mở trang nhẹ kiểm tra IP trực tiếp từ nhân Chromium
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
      // Thử fallback evaluate fetch
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

    // Lấy thông tin quốc gia
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

export async function createBrowserSession(options: SessionOptions = {}): Promise<SessionResult> {
  const profileDir = options.userDataDir || config.fbProfileDir;

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  // Tự động dọn dẹp Chromium lockfiles nếu bị crash trước đó (KudoX Feature)
  for (const lockFileName of ['lockfile', 'parent.lock', 'SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const lockPath = path.join(profileDir, lockFileName);
    if (fs.existsSync(lockPath)) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // Bỏ qua nếu đang bị process khác giữ
      }
    }
  }

  const isHeadless = options.headless !== undefined ? options.headless : config.headless;
  const hasRealChrome = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  const parsedProxy = parseProxy(options.proxy);

  let verifiedIp: string | undefined;
  let proxyLatencyMs: number | undefined;
  let proxyCountry: string | undefined;

  // =========================================================================
  // BƯỚC 1: PRE-FLIGHT TEST PROXY (Kiểm tra trước khi mở trình duyệt)
  // Nếu nick được gắn Proxy mà Proxy chết -> DỪNG NGAY KHÔNG MỞ TRÌNH DUYỆT
  // Nhằm tuyệt đối chống rò rỉ IP máy thật hoặc làm Facebook checkpoint nick!
  // =========================================================================
  if (parsedProxy) {
    console.log(`🌐 [KudoX Pre-flight] Đang kiểm tra an toàn Proxy riêng: ${parsedProxy.server}...`);
    const preflight = await testProxyNetwork(options.proxy, 10_000);

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

  // Khởi chạy Chromium persistent context với cấu hình chống rò rỉ WebRTC & DNS
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: isHeadless,
    channel: hasRealChrome ? 'chrome' : undefined,
    proxy: parsedProxy,
    viewport: options.viewport || { width: 1366, height: 768 },
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
      // CHỐNG RÒ RỈ WEBRTC & DNS QUA MẠNG NỘI BỘ (WebRTC STUN Leak Armor)
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--enforce-webrtc-ip-permission-check',
      '--dns-prefetch-disable',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(45_000);

  // KudoX Stealth script injection: xóa cờ navigator.webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  // =========================================================================
  // BƯỚC 2: DOUBLE-CHECK NỘI BỘ TRÌNH DUYỆT (In-Browser Verification)
  // Thực hiện truy vấn IP trực tiếp từ trong nhân Chromium vừa mở.
  // Đảm bảo 100% Chromium thực sự đi qua Proxy, không bị bypass âm thầm.
  // =========================================================================
  if (parsedProxy && !options.skipProxyDoubleCheck) {
    console.log(`🛡️ [KudoX Double-Check] Đang kiểm tra lớp thứ 2 từ bên trong Chromium...`);
    try {
      const doubleCheck = await verifyBrowserProxyIP(page, options.proxy);

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
