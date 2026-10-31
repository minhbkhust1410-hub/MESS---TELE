import { getAllAccounts } from '../db/store.js';
import { onlineCloudDb } from '../db/online-cloud-db.js';
import { orchestrationService } from '../engine/orchestration-service.js';
import { dataModeService } from '../services/data-mode-service.js';
import { config } from '../config/env.js';

async function main() {
  console.log('\n===========================================================');
  console.log('📊 BÁO CÁO TỔNG QUAN HỆ THỐNG FALCONX MESS x TELE');
  console.log('===========================================================');

  const accounts = getAllAccounts();
  const liveAccs = accounts.filter((a) => a.status === 'live' || a.status === 'active');
  const cloudDbStatus = onlineCloudDb.getStatus();
  const orchStatus = orchestrationService.getStatus();
  const currentMode = dataModeService.getCurrentMode();

  console.log(`\n1. Tài Khoản Facebook: ${liveAccs.length}/${accounts.length} nick Live`);
  for (const acc of accounts) {
    console.log(`   - [${acc.status === 'live' ? '🟢 Live' : '🔴 Offline'}] ${acc.name} (${acc.id}) | Vai trò: ${acc.role || 'satellite'} | Mảng: ${acc.verticalMode || 'bds_ecopark'}`);
  }

  console.log(`\n2. Cơ Sở Dữ Liệu Đám Mây (100% Cloud DB):`);
  console.log(`   - Trạng thái: ${cloudDbStatus.mode}`);
  console.log(`   - Mã hóa: ${cloudDbStatus.encryption}`);
  console.log(`   - Lưu trữ ổ đĩa Local: ${cloudDbStatus.localDiskBytesStored} Bytes`);
  console.log(`   - Tổng số bảng: ${cloudDbStatus.collectionsCount} bảng`);
  console.log(`   - Ảnh Proof trên Cloud: ${cloudDbStatus.proofImagesInCloudCount} ảnh`);
  console.log(`   - Lần đồng bộ gần nhất: ${cloudDbStatus.lastSyncAt || 'N/A'}`);

  console.log(`\n3. Trạng Thái Vận Hành & Tự Động Hóa:`);
  console.log(`   - Autopilot: ${orchStatus.autopilotEnabled ? '🟢 Đang Bật' : '⚪ Đang Tắt'}`);
  console.log(`   - Dashboard Port: ${config.dashboardPort}`);
  console.log(`   - Telegram Connected: ${config.telegramBotToken ? 'Có' : 'Không'}`);
  console.log(`   - Mode Đang Chạy: ${currentMode || 'bds_ecopark'}`);

  console.log('\n===========================================================\n');
}

main().catch(console.error);
