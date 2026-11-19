import http from 'node:http';
import net from 'node:net';
import { parseProxy } from './browser-session.js';

interface BridgeInstance {
  server: http.Server;
  localPort: number;
  remoteServer: string;
  authHeader?: string;
}

const activeBridges = new Map<string, BridgeInstance>();
let nextPort = 25010;

/**
 * Kiểm tra xem một port cục bộ có đang mở hay có server lắng nghe không
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port, '127.0.0.1');
  });
}

/**
 * Tìm port còn trống bắt đầu từ startPort
 */
async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  while (port < 30000) {
    if (await isPortAvailable(port)) {
      return port;
    }
    port++;
  }
  return startPort;
}

/**
 * Tạo hoặc lấy Local Proxy Bridge cho một Proxy từ xa.
 * Trình duyệt Chrome chỉ cần trỏ tới http://127.0.0.1:<localPort> mà không bao giờ bị hỏi user/pass!
 */
export async function getOrCreateLocalProxyBridge(
  proxyInput: string,
  preferredPort?: number
): Promise<{ localUrl: string; port: number }> {
  const parsed = parseProxy(proxyInput);
  if (!parsed) {
    throw new Error('Proxy không hợp lệ');
  }

  const cacheKey = `${parsed.server}_${parsed.username || ''}_${parsed.password || ''}`;
  if (activeBridges.has(cacheKey)) {
    const existing = activeBridges.get(cacheKey)!;
    return {
      localUrl: `http://127.0.0.1:${existing.localPort}`,
      port: existing.localPort,
    };
  }

  // Phân tích remote host & port
  let remoteHost = '';
  let remotePort = 80;
  try {
    const url = new URL(parsed.server);
    remoteHost = url.hostname;
    remotePort = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
  } catch {
    const parts = parsed.server.replace(/^https?:\/\//, '').split(':');
    remoteHost = parts[0];
    remotePort = Number(parts[1]) || 80;
  }

  let authHeader: string | undefined;
  if (parsed.username && parsed.password) {
    authHeader = 'Basic ' + Buffer.from(`${parsed.username}:${parsed.password}`).toString('base64');
  }

  const startP = preferredPort || nextPort;
  const assignedPort = await findAvailablePort(startP);
  nextPort = assignedPort + 1;

  const server = http.createServer((req, res) => {
    const opt: http.RequestOptions = {
      hostname: remoteHost,
      port: remotePort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        ...(authHeader ? { 'Proxy-Authorization': authHeader } : {}),
      },
    };

    const pReq = http.request(opt, (pRes) => {
      res.writeHead(pRes.statusCode || 200, pRes.headers);
      pRes.pipe(res);
    });

    req.pipe(pReq);
    pReq.on('error', (err) => {
      if (!res.headersSent) res.writeHead(502);
      res.end(`Proxy Bridge Error: ${err.message}`);
    });
  });

  // HTTPS CONNECT Tunneling
  server.on('connect', (req, clientSocket, head) => {
    const proxySocket = net.connect(remotePort, remoteHost, () => {
      let connectReq = `CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\n`;
      if (authHeader) {
        connectReq += `Proxy-Authorization: ${authHeader}\r\n`;
      }
      connectReq += `Proxy-Connection: Keep-Alive\r\n\r\n`;

      proxySocket.write(connectReq);
      if (head && head.length > 0) {
        proxySocket.write(head);
      }
    });

    let connected = false;
    proxySocket.on('data', (chunk) => {
      if (!connected) {
        connected = true;
        const str = chunk.toString();
        if (str.includes('200 Connection established') || str.includes('200 OK') || str.includes('HTTP/1.1 200')) {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          const idx = chunk.indexOf('\r\n\r\n');
          if (idx !== -1 && idx + 4 < chunk.length) {
            clientSocket.write(chunk.slice(idx + 4));
          }
          clientSocket.pipe(proxySocket);
          proxySocket.pipe(clientSocket);
        } else {
          clientSocket.end('HTTP/1.1 502 Bad Gateway (Proxy Auth Failed)\r\n\r\n');
          proxySocket.end();
        }
      }
    });

    proxySocket.on('error', () => clientSocket.end());
    clientSocket.on('error', () => proxySocket.end());
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(assignedPort, '127.0.0.1', () => {
      console.log(`🛡️ [Proxy Bridge] Đã kích hoạt cầu nối cục bộ 127.0.0.1:${assignedPort} -> ${remoteHost}:${remotePort}`);
      activeBridges.set(cacheKey, {
        server,
        localPort: assignedPort,
        remoteServer: parsed.server,
        authHeader,
      });
      resolve();
    });
    server.on('error', reject);
  });

  return {
    localUrl: `http://127.0.0.1:${assignedPort}`,
    port: assignedPort,
  };
}

export function closeAllBridges(): void {
  for (const bridge of activeBridges.values()) {
    try {
      bridge.server.close();
    } catch {}
  }
  activeBridges.clear();
}
