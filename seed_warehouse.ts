import { globalLeadPoolService } from './src/services/global-lead-pool.js';

async function main() {
  const purged = globalLeadPoolService.purgeJunk();
  console.log('Purged junk count:', purged);

  const sampleScanned = [
    { id: '100004113335185', name: 'Trang Trang', url: 'https://www.facebook.com/100004113335185', timeCategory: '2_days' as const, timeCategoryLabel: '🔥 2 ngày gần nhất (Cực Hot)', subtitle: 'Mới tham gia / Vừa hoạt động' },
    { id: '100003856449410', name: 'Nhã Trang Triệu', url: 'https://www.facebook.com/100003856449410', timeCategory: '2_days' as const, timeCategoryLabel: '🔥 2 ngày gần nhất (Cực Hot)', subtitle: 'Mới tham gia / Vừa hoạt động' },
    { id: '100027242165837', name: 'Thương Trịnh', url: 'https://www.facebook.com/100027242165837', timeCategory: '2_days' as const, timeCategoryLabel: '🔥 2 ngày gần nhất (Cực Hot)', subtitle: 'Mới tham gia / Vừa hoạt động' },
    { id: '100001763272848', name: 'Hà Lê Sáu', url: 'https://www.facebook.com/100001763272848', timeCategory: '2_days' as const, timeCategoryLabel: '🔥 2 ngày gần nhất (Cực Hot)', subtitle: 'Vừa hoạt động' },
    { id: '100006483702631', name: 'Chúc Phúc', url: 'https://www.facebook.com/100006483702631', timeCategory: '2_days' as const, timeCategoryLabel: '🔥 2 ngày gần nhất (Cực Hot)', subtitle: 'Vừa hoạt động' },
    { id: '100004463403113', name: 'Hien Ha', url: 'https://www.facebook.com/100004463403113', timeCategory: '1_week' as const, timeCategoryLabel: '⚡ 1 tuần gần nhất', subtitle: '4 ngày trước' },
    { id: '100003510323890', name: 'Bốngg Tâyy', url: 'https://www.facebook.com/100003510323890', timeCategory: '1_week' as const, timeCategoryLabel: '⚡ 1 tuần gần nhất', subtitle: '5 ngày trước' }
  ];

  const ingestRes = globalLeadPoolService.ingestScannedMembers(
    sampleScanned,
    'https://www.facebook.com/groups/160934979480738/',
    'Cộng Đồng Cư Dân EcoPark Hưng Yên',
    'bds_ecopark'
  );

  console.log('Ingest result:', ingestRes);
  console.log('Warehouse stats:', globalLeadPoolService.getStats());
  console.log('Sample warehouse output:', globalLeadPoolService.getWarehouseLeads({ limit: 3 }));
}

main().catch(console.error);
