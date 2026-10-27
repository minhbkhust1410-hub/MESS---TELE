import { chromium } from 'playwright';
import fs from 'fs';

// Helper to normalize strings
function normalizeString(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str.length > 0 ? str : null;
}

// Low-level GraphQL Interceptor inspired by KudoX 2 / Meta Tool
class KudoxMemberGraphqlInterceptor {
  constructor(page, onMember) {
    this.page = page;
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
      // Look for member / user / actor nodes
      const candidateUser = rec.user || rec.actor || rec.author || rec.node || rec;
      if (candidateUser && typeof candidateUser === 'object') {
        const uid = normalizeString(candidateUser.id || candidateUser.uid || candidateUser.userID);
        const name = normalizeString(candidateUser.name);
        const profileUrl = normalizeString(candidateUser.url || candidateUser.permalink_url);

        // Check if this looks like a valid Facebook user UID
        if (uid && name && (uid.length >= 4) && !/^\d{1,3}$/.test(uid) && name.length >= 2) {
          if (!/facebook|group|admin|quản trị|thành viên|bạn bè/i.test(name)) {
            if (!this.members.has(uid)) {
              const memberObj = {
                id: uid,
                name,
                url: profileUrl || `https://www.facebook.com/${uid}`,
                joinedTimeText: 'Hoạt động mới nhất',
                timeCategory: '2_days',
                timeCategoryLabel: '🔥 2 ngày gần nhất (Cực Hot)',
                source: 'graphql'
              };
              this.members.set(uid, memberObj);
              this.onMember?.(memberObj);
            }
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

async function testKudoxScanner() {
  console.log('🚀 Khởi chạy Playwright Browser kiểm thử tư duy KudoX 2...');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
  });

  const page = await ctx.newPage();
  const foundMembers = [];

  const interceptor = new KudoxMemberGraphqlInterceptor(page, (m) => {
    console.log(`⚡ [GraphQL Phát Hiện] UID: ${m.id} | Tên: ${m.name}`);
    foundMembers.push(m);
  });

  const groupTarget = 'https://www.facebook.com/groups/160934979480738/';
  console.log(`🌐 Đang mở nhóm Facebook: ${groupTarget}`);
  await page.goto(groupTarget, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);

  // 1. Tự động đóng Popup "Xem thêm trên Facebook"
  const closeBtn = page.locator('div[aria-label="Đóng"], div[aria-label="Close"], [role="button"]:has-text("Đóng")').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('👉 Đã đóng modal popup Facebook.');
    await closeBtn.click().catch(() => {});
    await page.waitForTimeout(1000);
  }

  // 2. Tìm và click vào nhãn / tab "Mọi người" hoặc "Thành viên" hoặc "Bạn bè"
  console.log('🔍 Đang tìm nhãn "Mọi người" / "Thành viên" / "Bạn bè"...');
  const memberTab = page.locator('a[href*="/members"], div[role="tab"]:has-text("Mọi người"), div[role="tab"]:has-text("Thành viên"), a:has-text("Mọi người"), a:has-text("Thành viên")').first();
  const hasMemberTab = await memberTab.isVisible({ timeout: 2500 }).catch(() => false);

  if (hasMemberTab) {
    console.log('🎯 Phát hiện nhãn Thành viên / Mọi người, đang click...');
    await memberTab.click().catch(() => {});
    await page.waitForTimeout(3000);
  } else {
    console.log('ℹ️ Không có tab Thành viên công khai -> Quét luồng thảo luận mới nhất (Chronological Feed)...');
  }

  // 3. Cuộn trang 5 lần để nạp dữ liệu GraphQL và DOM
  console.log('📜 Bắt đầu cuộn trang nạp thành viên...');
  for (let s = 1; s <= 6; s++) {
    await page.evaluate(() => window.scrollBy(0, 1600)).catch(() => {});
    await page.waitForTimeout(1500);
    console.log(`  Cuộn lần ${s}/6... Hiện tại GraphQL bắt được: ${interceptor.getMembers().length} thành viên.`);
  }

  // 4. Bóc tách DOM chính xác theo cấu trúc KudoX 2
  const domMembers = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    // Tìm tất cả các thẻ anchor hồ sơ người dùng
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (!href) continue;

      let uid = '';
      let url = '';

      // Check group user: /groups/.../user/<uid>/
      const guMatch = href.match(/\/groups\/[^/]+\/user\/([^/?#]+)/i);
      if (guMatch) {
        uid = guMatch[1];
        url = /^\d+$/.test(uid) ? `https://www.facebook.com/profile.php?id=${uid}` : `https://www.facebook.com/${uid}`;
      } else if (href.includes('/people/')) {
        const pMatch = href.match(/\/people\/[^/]+\/(\d+)/i);
        if (pMatch) {
          uid = pMatch[1];
          url = `https://www.facebook.com/profile.php?id=${uid}`;
        }
      } else if (href.includes('profile.php?id=')) {
        const idMatch = href.match(/profile\.php\?id=(\d+)/i);
        if (idMatch) {
          uid = idMatch[1];
          url = `https://www.facebook.com/profile.php?id=${uid}`;
        }
      }

      if (!uid || seen.has(uid)) continue;

      // Extract Name & Subtitle
      let name = (a.innerText || a.getAttribute('aria-label') || '').trim();
      let subtitle = '';

      let container = a.parentElement;
      for (let d = 0; d < 5 && container; d++, container = container.parentElement) {
        const txt = (container.innerText || '').trim();
        if (txt && txt.length < 250) {
          const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length >= 1) {
            if (!name || name.length < 2) name = lines[0];
            if (lines.length >= 2) {
              subtitle = lines.slice(1).filter(l => !/thêm bạn|nhắn tin|xem thêm/i.test(l)).join(' • ');
            }
            break;
          }
        }
      }

      if (!name || /^(xem tất cả|thành viên|quản trị viên|admin|tham gia|tìm kiếm|nhóm|bạn bè|đăng ký|đăng nhập)$/i.test(name)) continue;

      seen.add(uid);

      // Phân loại mốc thời gian
      const cleanSub = (subtitle || '').toLowerCase();
      let timeCategory = '2_days';
      let timeCategoryLabel = '🔥 2 ngày gần nhất (Cực Hot)';
      let joinedTimeText = subtitle || 'Vừa xong';

      if (/3 ngày|4 ngày|5 ngày|6 ngày|7 ngày|1 tuần|tuần qua|tuần này/i.test(cleanSub)) {
        timeCategory = '1_week';
        timeCategoryLabel = '⚡ 1 tuần gần nhất';
      } else if (/8 ngày|9 ngày|10 ngày|11 ngày|12 ngày|13 ngày|14 ngày|2 tuần/i.test(cleanSub)) {
        timeCategory = '2_weeks';
        timeCategoryLabel = '📅 2 tuần gần nhất';
      }

      results.push({
        id: uid,
        name,
        url,
        subtitle,
        joinedTimeText,
        timeCategory,
        timeCategoryLabel,
        source: 'dom'
      });
    }

    return results;
  }).catch(() => []);

  interceptor.stop();

  // Merge GraphQL members + DOM members
  const finalMap = new Map();
  for (const m of interceptor.getMembers()) {
    finalMap.set(m.id, m);
  }
  for (const m of domMembers) {
    if (!finalMap.has(m.id)) {
      finalMap.set(m.id, m);
    } else {
      const existing = finalMap.get(m.id);
      if (m.name && m.name.length > (existing.name || '').length) {
        existing.name = m.name;
      }
      if (m.subtitle) existing.subtitle = m.subtitle;
    }
  }

  const allFinal = Array.from(finalMap.values());
  console.log(`\n======================================================`);
  console.log(`🎉 KẾT QUẢ QUÉT THÀNH CÔNG: TỔNG CỘNG ${allFinal.length} THÀNH VIÊN!`);
  console.log(`======================================================`);

  allFinal.slice(0, 15).forEach((m, idx) => {
    console.log(`${idx + 1}. [${m.name}] | UID: ${m.id} | Link: ${m.url} | Mốc: ${m.timeCategoryLabel} (${m.joinedTimeText})`);
  });

  // Chụp ảnh bằng chứng
  const proofPath = 'C:/Users/ADMIN/.gemini/antigravity/brain/2812de1c-1f5b-4c70-9e8d-9c0e55e700f4/proof_kudox2_scanner_members.png';
  await page.screenshot({ path: proofPath });
  console.log(`📸 Đã chụp ảnh bằng chứng: ${proofPath}`);

  await browser.close();
}

testKudoxScanner().catch(console.error);
