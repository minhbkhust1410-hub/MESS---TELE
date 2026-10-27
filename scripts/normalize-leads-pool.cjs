const fs = require('fs');
const path = require('path');

const poolFile = path.resolve('D:/KudoX_Mess_Tele/data/global_leads_pool.json');
const forexFile = path.resolve('D:/KudoX_Mess_Tele/data/forex_leads_pool.json');

const pool = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
let forex = [];
if (fs.existsSync(forexFile)) {
  forex = JSON.parse(fs.readFileSync(forexFile, 'utf8'));
}

let bdsCount = 0;
let forexCount = 0;

// 1. Chuẩn hóa tất cả lead BĐS hiện có
for (const key of Object.keys(pool.leads)) {
  const lead = pool.leads[key];
  if (!lead.mode || lead.mode === 'bds_ecopark') {
    lead.mode = 'bds_ecopark';
    bdsCount++;
  } else if (lead.mode === 'forex') {
    forexCount++;
  }
}

// 2. Nạp thêm các lead Forex vào pool
for (const fx of forex) {
  const parts = (fx.profileUrl || '').split('/').filter(Boolean);
  const uid = parts[parts.length - 1] || fx.id;
  const key = uid.replace(/[^a-zA-Z0-9]/g, '_');
  if (!pool.leads[key]) {
    pool.leads[key] = {
      id: key,
      name: fx.name,
      url: fx.profileUrl || `https://www.facebook.com/${key}`,
      sourceGroup: 'https://www.facebook.com/groups/forexvietnam/',
      sourceGroupName: fx.sourceGroup || 'Cộng Đồng Trader Forex Việt Nam',
      mode: 'forex',
      timeCategory: '2_days',
      timeCategoryLabel: 'Vừa Hoạt Động / Hot Lead',
      subtitle: fx.lead?.rawText ? fx.lead.rawText.substring(0, 90) + '...' : 'Trader quan tâm nạp rút / bot tín hiệu',
      joinedTimeText: 'Mới đăng bài hỏi sàn / cứu lệnh',
      firstSeenAt: fx.scannedAt || new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      scanCount: 1,
      status: 'unassigned'
    };
    forexCount++;
  } else {
    pool.leads[key].mode = 'forex';
  }
}

// 3. Tính toán lại toàn bộ Stats
let requestedCount = 0;
let friendCount = 0;
let twoDaysCount = 0;
let oneWeekCount = 0;
let twoWeeksCount = 0;

for (const l of Object.values(pool.leads)) {
  if (l.status === 'requested') requestedCount++;
  if (l.status === 'friend') friendCount++;
  if (l.timeCategory === '2_days') twoDaysCount++;
  if (l.timeCategory === '1_week') oneWeekCount++;
  if (l.timeCategory === '2_weeks') twoWeeksCount++;
}

pool.stats = {
  totalScanned: Object.keys(pool.leads).length,
  requestedCount,
  friendCount,
  bdsCount,
  forexCount,
  twoDaysCount,
  oneWeekCount,
  twoWeeksCount
};

fs.writeFileSync(poolFile, JSON.stringify(pool, null, 2), 'utf8');
console.log('Normalized pool stats successfully:');
console.log(JSON.stringify(pool.stats, null, 2));
