import { chromium } from 'playwright';

function normalizeString(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str.length > 0 ? str : null;
}

class KudoxMemberGraphqlInterceptor {
  constructor(page, targetGroupId, onMember) {
    this.page = page;
    this.targetGroupId = targetGroupId;
    this.onMember = onMember;
    this.members = new Map();
    this.isActive = true;
    this.page.on('response', this.handleResponse.bind(this));
  }

  stop() {
    this.isActive = false;
  }

  getMembers() {
    return Array.from(this.members.values());
  }

  async handleResponse(response) {
    if (!this.isActive) return;
    const url = response.url();
    if (!url.includes('/api/graphql/')) return;

    try {
      const text = await response.text().catch(() => '');
      if (!text) return;

      const lines = text.split('\n').filter(l => l.trim().length > 0);
      for (const line of lines) {
        try {
          const payload = JSON.parse(line);
          this.traversePayload(payload);
        } catch {}
      }
    } catch {}
  }

  traversePayload(root) {
    const seen = new WeakSet();
    const visit = (val, path = []) => {
      if (!val || typeof val !== 'object' || seen.has(val)) return;
      seen.add(val);

      if (Array.isArray(val)) {
        val.forEach((item, idx) => visit(item, [...path, String(idx)]));
        return;
      }

      const rec = val;
      const candidateUser = rec.user || rec.actor || rec.author || rec.commenter || rec.node || rec;
      if (candidateUser && typeof candidateUser === 'object') {
        const uid = normalizeString(candidateUser.id || candidateUser.uid || candidateUser.userID);
        const name = normalizeString(candidateUser.name);
        const profileUrl = normalizeString(candidateUser.url || candidateUser.permalink_url);

        // Filter out target group itself, non-human names, system labels
        if (uid && name && uid !== this.targetGroupId && uid.length >= 4 && !/^\d{1,3}$/.test(uid) && name.length >= 2) {
          const isBadName = /facebook|cộng đồng|thuê nhà|mua bán|bất động sản|ecopark|hội cư dân|group|admin|quản trị|thành viên|bạn bè/i.test(name);
          if (!isBadName && !this.members.has(uid)) {
            // Check created time if available in nearby fields
            const timeRaw = rec.created_time || rec.creation_time || rec.timestamp || rec.joined_time;
            let timeCategory = '2_days';
            let timeCategoryLabel = '🔥 2 ngày gần nhất (Cực Hot)';
            let joinedTimeText = 'Mới tham gia / Vừa hoạt động';

            if (timeRaw) {
              const postDate = new Date(typeof timeRaw === 'number' ? (timeRaw > 1e11 ? timeRaw : timeRaw * 1000) : timeRaw);
              const diffHours = (Date.now() - postDate.getTime()) / (1000 * 3600);
              if (diffHours <= 48) {
                timeCategory = '2_days';
                timeCategoryLabel = '🔥 2 ngày gần nhất (Cực Hot)';
                joinedTimeText = diffHours < 1 ? 'Vừa xong' : `${Math.round(diffHours)} giờ trước`;
              } else if (diffHours <= 168) {
                timeCategory = '1_week';
                timeCategoryLabel = '⚡ 1 tuần gần nhất';
                joinedTimeText = `${Math.round(diffHours / 24)} ngày trước`;
              } else if (diffHours <= 336) {
                timeCategory = '2_weeks';
                timeCategoryLabel = '📅 2 tuần gần nhất';
                joinedTimeText = `${Math.round(diffHours / 24)} ngày trước`;
              } else {
                timeCategory = 'older';
                timeCategoryLabel = 'Thành viên cũ (> 2 tuần)';
                joinedTimeText = `${Math.round(diffHours / 24)} ngày trước`;
              }
            }

            const memberObj = {
              id: uid,
              name,
              url: profileUrl || `https://www.facebook.com/${uid}`,
              subtitle: joinedTimeText,
              joinedTimeText,
              timeCategory,
              timeCategoryLabel,
              source: 'graphql'
            };
            this.members.set(uid, memberObj);
            this.onMember?.(memberObj);
          }
        }
      }

      for (const [k, v] of Object.entries(rec)) {
        visit(v, [...path, k]);
      }
    };

    visit(root);
  }
}

async function runDeepScanTest() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
  });

  const page = await ctx.newPage();
  const targetGroupId = '160934979480738';
  const groupTarget = `https://www.facebook.com/groups/${targetGroupId}/?sorting_setting=CHRONOLOGICAL`;

  const interceptor = new KudoxMemberGraphqlInterceptor(page, targetGroupId, (m) => {
    console.log(`[+ Member] ${m.name} | UID: ${m.id} | ${m.joinedTimeText}`);
  });

  console.log('Navigating to:', groupTarget);
  await page.goto(groupTarget, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);

  // Close popup
  const closeBtn = page.locator('div[aria-label="Đóng"], div[aria-label="Close"], [role="button"]:has-text("Đóng")').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click().catch(() => {});
    await page.waitForTimeout(1000);
  }

  // Scroll 12 times to load a rich batch of members
  console.log('Scrolling 12 times...');
  for (let i = 1; i <= 12; i++) {
    await page.evaluate(() => window.scrollBy(0, 1800)).catch(() => {});
    await page.waitForTimeout(1200);
  }

  interceptor.stop();
  const members = interceptor.getMembers();
  console.log(`\nScan finished. Total unique clean members: ${members.length}`);
  
  // Categorize
  const c2d = members.filter(m => m.timeCategory === '2_days');
  const c1w = members.filter(m => m.timeCategory === '1_week');
  const c2w = members.filter(m => m.timeCategory === '2_weeks');
  const cOlder = members.filter(m => m.timeCategory === 'older');

  console.log(`- 2 ngày gần nhất: ${c2d.length}`);
  console.log(`- 1 tuần gần nhất: ${c1w.length}`);
  console.log(`- 2 tuần gần nhất: ${c2w.length}`);
  console.log(`- Cũ hơn: ${cOlder.length}`);

  await browser.close();
}

runDeepScanTest().catch(console.error);
