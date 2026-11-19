import fs from 'node:fs';
import path from 'node:path';

interface ExtDef {
  folder: string;
  name: string;
  port: number;
}

const exts: ExtDef[] = [
  { folder: 'proxy-11', name: 'KudoX Proxy - Eco Trang', port: 25010 },
  { folder: 'proxy-12', name: 'KudoX Proxy - Eco Chang', port: 25011 },
  { folder: 'proxy-13', name: 'KudoX Proxy - Lang Thang Eco', port: 25012 },
  { folder: 'proxy-14', name: 'KudoX Proxy - Lang Thang Eco 01', port: 25013 },
  { folder: 'proxy-15', name: 'KudoX Proxy - BDS Ecopark 04', port: 25014 },
];

for (const e of exts) {
  const dir = path.resolve(`./.user-data/extensions/${e.folder}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const manifest = {
    name: e.name,
    version: '1.0',
    manifest_version: 3,
    permissions: ['proxy'],
    host_permissions: ['<all_urls>'],
    background: {
      service_worker: 'background.js',
    },
  };

  const bg = `
const config = {
  mode: "fixed_servers",
  rules: {
    singleProxy: {
      scheme: "http",
      host: "127.0.0.1",
      port: ${e.port}
    },
    bypassList: ["<-loopback>"]
  }
};

function applyProxy() {
  chrome.proxy.settings.set({ value: config, scope: "regular" }, () => {
    console.log("${e.name} applied on port ${e.port}");
  });
}

chrome.runtime.onInstalled.addListener(applyProxy);
chrome.runtime.onStartup.addListener(applyProxy);
applyProxy();
`.trim();

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'background.js'), bg, 'utf8');
}

console.log('✅ Đã tạo thành công 5 tiện ích Proxy cho 5 Profile Chrome!');
