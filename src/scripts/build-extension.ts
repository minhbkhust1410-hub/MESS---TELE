import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Jimp } from 'jimp';

const ROOT_DIR = process.cwd();
const EXT_DIR = path.join(ROOT_DIR, 'fb-exten');
const CORE_BUILD_DIR = path.join(EXT_DIR, 'core-build');
const ICONS_DIR = path.join(EXT_DIR, 'icons');

/**
 * Tạo bộ icon PNG sắc nét cho Chrome Extension FB EXTEN (16px, 48px, 128px)
 */
async function generateExtensionIcons(): Promise<void> {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  const sizes = [16, 48, 128];

  for (const size of sizes) {
    const iconPath = path.join(ICONS_DIR, `icon${size}.png`);
    const img = new Jimp({ width: size, height: size, color: 0x0b1220ff });

    const radius = size * 0.22;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Bo góc tròn hiện đại (Squircle)
        const dx = Math.max(radius - x, 0, x - (size - 1 - radius));
        const dy = Math.max(radius - y, 0, y - (size - 1 - radius));
        if (dx * dx + dy * dy > radius * radius) {
          img.setPixelColor(0x00000000, x, y);
          continue;
        }

        // Gradient xanh công nghệ (#0071e3 -> #10b981)
        const t = (x + y) / (2 * size);
        const r = Math.round(0 + t * 16);
        const g = Math.round(113 + t * (185 - 113));
        const b = Math.round(227 + t * (129 - 227));

        // Chữ "FB" cách điệu tối giản ở vùng trung tâm cho icon >= 48px
        const nx = x / size;
        const ny = y / size;
        let isLetter = false;
        if (size >= 16) {
          // Thanh chữ F bên trái
          const inFStem = nx >= 0.24 && nx <= 0.34 && ny >= 0.26 && ny <= 0.74;
          const inFTop = nx >= 0.24 && nx <= 0.48 && ny >= 0.26 && ny <= 0.36;
          const inFMid = nx >= 0.24 && nx <= 0.44 && ny >= 0.46 && ny <= 0.55;
          // Ký hiệu E/B bên phải
          const inEStem = nx >= 0.54 && nx <= 0.64 && ny >= 0.26 && ny <= 0.74;
          const inETop = nx >= 0.54 && nx <= 0.77 && ny >= 0.26 && ny <= 0.36;
          const inEMid = nx >= 0.54 && nx <= 0.73 && ny >= 0.46 && ny <= 0.55;
          const inEBot = nx >= 0.54 && nx <= 0.77 && ny >= 0.64 && ny <= 0.74;
          isLetter = inFStem || inFTop || inFMid || inEStem || inETop || inEMid || inEBot;
        }

        const color = isLetter
          ? 0xffffffff
          : ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | 0xff;
        img.setPixelColor(color >>> 0, x, y);
      }
    }

    const buf = await img.getBuffer('image/png');
    fs.writeFileSync(iconPath, buf);
  }
}

async function main() {
  console.log('===========================================================');
  console.log('🧩 BUILD FB EXTEN — PRIVATE CHROME EXTENSION (MANIFEST V3)');
  console.log('===========================================================');

  fs.mkdirSync(EXT_DIR, { recursive: true });
  if (fs.existsSync(CORE_BUILD_DIR)) {
    fs.rmSync(CORE_BUILD_DIR, { recursive: true, force: true });
  }

  console.log('⚙️  Đang biên dịch thuật toán dùng chung (src/shared + parsers) sang ES2022...');
  execSync('npx tsc -p tsconfig.ext.json', { cwd: ROOT_DIR, stdio: 'inherit' });

  console.log('🎨 Đang tạo bộ Icon PNG cho Extension...');
  await generateExtensionIcons();

  console.log('✅ Build hoàn tất! Thư mục Extension Private sẵn sàng nạp vào Chrome:');
  console.log(`   👉 ${EXT_DIR}`);
}

main().catch((err) => {
  console.error('❌ Lỗi build FB EXTEN:', err);
  process.exit(1);
});
