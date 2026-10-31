/**
 * =========================================================================
 * 🦁 KUDOX F12 MEMBER SCANNER & HUMAN AUTO-FRIEND PRO
 * =========================================================================
 * Hướng dẫn sử dụng:
 * 1. Mở Facebook Group bất kỳ trên trình duyệt máy tính (Chrome, Edge, Cốc Cốc, Brave).
 * 2. Vào mục "Thành viên" (Members) hoặc link: https://www.facebook.com/groups/<group_id>/members/
 * 3. Bấm phím F12 (hoặc Ctrl + Shift + I) -> Chọn thẻ "Console".
 * 4. Dán toàn bộ mã này vào và nhấn ENTER.
 * 5. Bảng điều khiển nổi KudoX sẽ hiện ra ở góc phải màn hình:
 *    - Quét & phân loại thành viên mới (2 ngày, 1 tuần, 2 tuần)
 *    - Tự động kết bạn với danh sách đã quét: Trỏ chuẩn xác nhãn F12 "Thêm bạn bè"
 *    - Hành vi Human Anti-Checkpoint (Cuộn mượt, rê chuột Hover, nghỉ nhịp sinh học, chặn popup cảnh báo)
 * =========================================================================
 */

(() => {
  if (window.__KUDOX_MEMBER_SCANNER_ACTIVE__) {
    alert('🦁 KudoX Member Scanner & Auto-Friend Pro đã đang chạy trên trang này!');
    return;
  }
  window.__KUDOX_MEMBER_SCANNER_ACTIVE__ = true;

  console.log(
    '%c🦁 KUDOX F12 MEMBER SCANNER & HUMAN AUTO-FRIEND PRO KÍCH HOẠT!%c\nSẵn sàng quét thành viên và tự động kết bạn chuẩn nhãn F12 "Thêm bạn bè" (Human Anti-Checkpoint).',
    'background: #0071e3; color: white; font-size: 14px; font-weight: bold; padding: 4px 10px; border-radius: 6px;',
    'color: #10b981; font-weight: bold;'
  );

  // State
  let isScanning = false;
  let shouldStop = false;
  let isAutoFriending = false;
  let shouldStopAutoFriend = false;
  let activeFilter = 'all'; // 'all' | '2_days' | '1_week' | '2_weeks'
  let sentFriendCount = 0;
  let skippedFriendCount = 0;
  const scannedMembers = new Map(); // id -> MemberObj
  const friendedIds = new Set();

  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Helper phân loại mốc thời gian gia nhập
  function classifyJoinTime(text) {
    const clean = (text || '').toLowerCase();

    // 1. Mốc 2 ngày gần nhất (≤ 48 giờ)
    if (/vừa xong|phút trước|giờ trước|hôm nay|hôm qua|1 ngày|2 ngày|minute|hour|today|yesterday|1 day|2 days/i.test(clean)) {
      let timeText = 'Hôm nay / Trong 48h';
      const m = clean.match(/([0-9]+)\s*(?:giờ|ngày|hour|day)/i);
      if (m) timeText = `${m[1]} ${/ngày|day/i.test(clean) ? 'ngày' : 'giờ'} trước`;
      else if (/hôm qua|yesterday/i.test(clean)) timeText = 'Hôm qua (~1 ngày)';
      else if (/hôm nay|today/i.test(clean)) timeText = 'Hôm nay (< 24h)';
      return { category: '2_days', label: '🔥 2 ngày gần nhất (Cực Hot)', timeText };
    }

    // 2. Mốc 1 tuần gần nhất (3 - 7 ngày)
    if (/3 ngày|4 ngày|5 ngày|6 ngày|7 ngày|1 tuần|tuần qua|tuần này|3 days|4 days|5 days|6 days|7 days|1 week|past week/i.test(clean)) {
      let timeText = '1 tuần gần nhất';
      const m = clean.match(/([3-7])\s*(?:ngày|days)/i);
      if (m) timeText = `${m[1]} ngày trước`;
      else if (/1 tuần|1 week/i.test(clean)) timeText = '1 tuần trước';
      return { category: '1_week', label: '⚡ 1 tuần gần nhất', timeText };
    }

    // 3. Mốc 2 tuần gần nhất (8 - 14 ngày)
    if (/8 ngày|9 ngày|10 ngày|11 ngày|12 ngày|13 ngày|14 ngày|2 tuần|2 weeks/i.test(clean)) {
      let timeText = '2 tuần gần nhất';
      const m = clean.match(/([0-9]+)\s*(?:ngày|days)/i);
      if (m) timeText = `${m[1]} ngày trước`;
      else if (/2 tuần|2 weeks/i.test(clean)) timeText = '2 tuần trước';
      return { category: '2_weeks', label: '📅 2 tuần gần nhất', timeText };
    }

    return { category: 'older', label: 'Thành viên cũ (> 2 tuần)', timeText: 'Trước đó' };
  }

  /**
   * 🎯 KIỂM TRA NHÃN F12 CHUẨN XÁC "Thêm bạn bè"
   * Chỉ nhận diện đúng nút có nhãn "Thêm bạn bè" (aria-label hoặc text hiển thị),
   * tuyệt đối bỏ qua "Tìm bạn bè", "Hủy lời mời", "Đã gửi lời mời", "Nhắn tin", "Bạn bè".
   */
  function isExactAddFriendButton(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.closest('#kudox-f12-scanner-overlay')) return false;
    if (el.closest('[role="banner"], [role="navigation"], header')) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 16) return false;

    const aria = (el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    const visibleText = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();

    // Tuyệt đối loại trừ các nút không phải "Thêm bạn bè"
    const forbiddenPattern = /tìm bạn bè|hủy lời mời|đã gửi lời mời|nhắn tin|theo dõi|bạn bè chung|xem trang|find friends|cancel request|request sent|message/i;
    if (forbiddenPattern.test(aria) || forbiddenPattern.test(visibleText)) {
      // Ngoại lệ duy nhất: aria-label dạng "Thêm <Tên> làm bạn bè" nhưng text là "Thêm bạn bè"
      if (!(/^Thêm\s+.+\s+làm bạn bè$/i.test(aria) && visibleText === 'Thêm bạn bè')) {
        return false;
      }
    }

    // Khớp chính xác chữ "Thêm bạn bè" trong F12
    const exactLabelMatch =
      aria === 'Thêm bạn bè' ||
      visibleText === 'Thêm bạn bè' ||
      (/^Thêm\s+.+\s+làm bạn bè$/i.test(aria) && (visibleText === 'Thêm bạn bè' || visibleText === '')) ||
      aria === 'Add friend' ||
      visibleText === 'Add friend';

    return exactLabelMatch;
  }

  /**
   * Tìm nút "Thêm bạn bè" nằm cùng dòng (card/listitem) với thành viên đã quét
   */
  function findAddFriendButtonForMember(member) {
    // 1. Nếu có tham chiếu row DOM còn sống trong trang
    if (member && member._rowEl && document.body.contains(member._rowEl)) {
      const candidates = Array.from(member._rowEl.querySelectorAll('[role="button"], button, div[aria-label]'));
      const found = candidates.find((el) => isExactAddFriendButton(el));
      if (found) return found;
    }

    // 2. Tìm lại theo link hoặc tên thành viên trên DOM hiện tại
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    for (const a of anchors) {
      const href = a.href || '';
      const txt = (a.innerText || a.getAttribute('aria-label') || '').trim();
      const idMatch = member.id && href.includes(member.id);
      const nameMatch = member.name && txt && txt.toLowerCase() === member.name.toLowerCase();

      if (idMatch || nameMatch) {
        let container = a.parentElement;
        for (let depth = 0; depth < 8 && container && container !== document.body; depth++, container = container.parentElement) {
          const btns = Array.from(container.querySelectorAll('[role="button"], button, div[aria-label="Thêm bạn bè"]'));
          const exactBtn = btns.find((el) => isExactAddFriendButton(el));
          if (exactBtn) {
            // Đảm bảo container này không quá lớn (chỉ bao quanh 1-2 member card)
            if (btns.filter((el) => isExactAddFriendButton(el)).length <= 2) {
              member._rowEl = container;
              return exactBtn;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * 🛡️ CHỐNG CHECKPOINT: Kiểm tra hộp thoại cảnh báo của Facebook
   * ("Bạn có biết người này ngoài đời không?" / "Chỉ gửi lời mời kết bạn cho những người bạn biết")
   */
  async function checkAndHandleCheckpointWarning() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    for (const dlg of dialogs) {
      if (dlg.closest('#kudox-f12-scanner-overlay')) continue;
      const text = (dlg.innerText || '').toLowerCase();
      if (
        text.includes('bạn có biết người này') ||
        text.includes('chỉ gửi lời mời kết bạn cho những người bạn biết') ||
        text.includes('do you know this person') ||
        text.includes('only send friend requests to people you know') ||
        text.includes('tạm thời bị chặn') ||
        text.includes('temporarily blocked')
      ) {
        // Tìm nút Đóng / Hủy để bảo vệ nick ngay lập tức
        const closeBtn = Array.from(dlg.querySelectorAll('[role="button"], button')).find((b) => {
          const l = ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).toLowerCase();
          return /hủy|đóng|cancel|close|ok/i.test(l) && !/xác nhận|confirm/i.test(l);
        });
        if (closeBtn) {
          closeBtn.click();
          await sleep(800);
        }
        return {
          warned: true,
          reason: 'Phát hiện cảnh báo giới hạn kết bạn từ Facebook ("Bạn có biết người này ngoài đời không?"). Đã tự động đóng hộp thoại và dừng bảo vệ nick chống Checkpoint!'
        };
      }
    }
    return { warned: false, reason: '' };
  }

  /**
   * 🧬 HÀNH VI HUMAN (ANTI-CHECKPOINT) KHI BẤM NÚT "Thêm bạn bè"
   * 1. Cuộn mượt đưa dòng thành viên vào giữa màn hình + lệch ngẫu nhiên tự nhiên
   * 2. Dừng đọc hồ sơ 1.6s - 3.2s
   * 3. Mô phỏng di chuyển chuột (pointerover -> mouseover -> mousemove) + dừng Hover 450ms - 850ms
   * 4. Nhấn giữ chuột (mousedown 80-140ms -> mouseup -> click) đúng nhãn "Thêm bạn bè"
   * 5. Kiểm tra trạng thái nút đổi sang "Hủy lời mời" / "Đã gửi lời mời"
   */
  async function performHumanClickAddFriend(btn, member) {
    // Bước 1: Cuộn mượt tới vị trí nút "Thêm bạn bè"
    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(randInt(700, 1200));
    window.scrollBy({ top: randInt(-35, 35), behavior: 'smooth' });

    // Bước 2: Highlight nhãn "Thêm bạn bè" đang được nhắm tới
    const prevOutline = btn.style.outline;
    const prevBoxShadow = btn.style.boxShadow;
    btn.style.outline = '2px solid #10b981';
    btn.style.boxShadow = '0 0 18px rgba(16, 185, 129, 0.85)';

    // Bước 3: Thời gian mắt người đọc tên & thông tin thành viên (1.5s - 3.0s)
    await sleep(randInt(1500, 3000));

    // Bước 4: Mô phỏng đường đi chuột & Hover vào đúng nút "Thêm bạn bè"
    const rect = btn.getBoundingClientRect();
    const clientX = Math.round(rect.left + rect.width / 2 + randInt(-6, 6));
    const clientY = Math.round(rect.top + rect.height / 2 + randInt(-3, 3));

    const mouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY + 80
    };

    btn.dispatchEvent(new PointerEvent('pointerover', mouseEventInit));
    btn.dispatchEvent(new MouseEvent('mouseover', mouseEventInit));
    btn.dispatchEvent(new PointerEvent('pointerenter', { ...mouseEventInit, bubbles: false }));
    btn.dispatchEvent(new MouseEvent('mouseenter', { ...mouseEventInit, bubbles: false }));

    // Rê nhẹ 3 điểm trong nút giống tay người cầm chuột
    for (let step = 0; step < 3; step++) {
      btn.dispatchEvent(
        new MouseEvent('mousemove', {
          ...mouseEventInit,
          clientX: clientX + randInt(-3, 3),
          clientY: clientY + randInt(-2, 2)
        })
      );
      await sleep(randInt(90, 180));
    }

    // Hover dwell trước khi bấm (380ms - 780ms)
    await sleep(randInt(380, 780));

    // Bước 5: Nhấn chuột (mousedown -> giữ 90ms -> mouseup -> click)
    btn.dispatchEvent(new PointerEvent('pointerdown', { ...mouseEventInit, button: 0, buttons: 1 }));
    btn.dispatchEvent(new MouseEvent('mousedown', { ...mouseEventInit, button: 0, buttons: 1 }));
    await sleep(randInt(75, 145));
    btn.dispatchEvent(new PointerEvent('pointerup', { ...mouseEventInit, button: 0, buttons: 0 }));
    btn.dispatchEvent(new MouseEvent('mouseup', { ...mouseEventInit, button: 0, buttons: 0 }));
    btn.click();

    // Bước 6: Nán lại quan sát phản hồi sau khi bấm (1.8s - 3.0s)
    await sleep(randInt(1800, 3000));

    btn.style.outline = prevOutline;
    btn.style.boxShadow = prevBoxShadow;
  }

  // Quét các node DOM trên trang Facebook hiện tại
  function harvestCurrentDOM() {
    let newlyFound = 0;
    const anchors = Array.from(document.querySelectorAll('a[href]'));

    for (const anchor of anchors) {
      try {
        if (anchor.closest('#kudox-f12-scanner-overlay')) continue;
        const href = anchor.href || '';
        if (!href.includes('facebook.com')) continue;
        const u = new URL(href);

        let id = '';
        let profileUrl = '';

        // 1. Nhận diện dạng /groups/<slug>/user/<id_or_username>/
        const groupUserMatch = u.pathname.match(/\/groups\/[^/]+\/user\/([^/?#]+)/i);
        if (groupUserMatch) {
          id = groupUserMatch[1];
          profileUrl = /^\d+$/.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : `https://www.facebook.com/${id}`;
        }
        // 2. Nhận diện dạng /people/<name>/<uid>/
        else if (u.pathname.includes('/people/')) {
          const peopleMatch = u.pathname.match(/\/people\/[^/]+\/(\d+)/i);
          if (peopleMatch) {
            id = peopleMatch[1];
            profileUrl = `https://www.facebook.com/profile.php?id=${id}`;
          }
        }
        // 3. Nhận diện dạng /profile.php?id=<uid>
        else if (u.pathname.includes('profile.php') && u.searchParams.get('id')) {
          id = u.searchParams.get('id');
          profileUrl = `https://www.facebook.com/profile.php?id=${id}`;
        }
        // 4. Nhận diện dạng vanity username: /<username>
        else {
          const parts = u.pathname.split('/').filter(Boolean);
          const ignored = new Set([
            'groups', 'pages', 'events', 'watch', 'marketplace', 'reel', 'stories', 'friends', 'messages',
            'notifications', 'search', 'photo', 'photos', 'login', 'help', 'settings', 'saved', 'gaming', 'dialog',
            'reg', 'r.php', 'lite', 'l.php', 'careers', 'allactivity'
          ]);
          if (parts.length === 1 && !ignored.has(parts[0].toLowerCase())) {
            id = parts[0];
            profileUrl = `https://www.facebook.com/${id}`;
          }
        }

        if (!id || id.length < 3 || scannedMembers.has(id)) continue;

        let name = (anchor.innerText || anchor.getAttribute('aria-label') || '').trim();
        let subtitle = '';
        let rowEl = null;

        // Đào text xung quanh để lấy ngày tham gia và khung dòng chứa nút "Thêm bạn bè"
        let container = anchor.parentElement;
        for (let depth = 0; depth < 7 && container; depth++, container = container.parentElement) {
          const fullText = (container.innerText || '').trim();
          if (fullText && fullText.length < 360) {
            const lines = fullText.split('\n').map((l) => l.trim()).filter(Boolean);
            if (lines.length >= 1) {
              if (!name || name.length < 2) name = lines[0];
              if (lines.length >= 2) {
                subtitle = lines.slice(1).filter((l) => !/thêm bạn|nhắn tin|xem thêm|hủy lời mời/i.test(l)).join(' • ');
              }
              rowEl = container;
              break;
            }
          }
        }

        // Clean: Bỏ nhãn hệ thống / Admin / Bot / Footer
        if (!name || /^(xem tất cả|thành viên|quản trị viên|admin|người kiểm duyệt|tham gia|tìm kiếm|nhóm|bạn bè|đăng ký|đăng nhập|facebook lite|instagram|tuyển dụng|nhật ký hoạt động)$/i.test(name)) continue;
        if (/đã mời bạn tham gia nhóm/i.test(name)) continue;

        const timeInfo = classifyJoinTime(subtitle);

        scannedMembers.set(id, {
          id,
          name,
          url: profileUrl,
          subtitle,
          category: timeInfo.category,
          categoryLabel: timeInfo.label,
          timeText: timeInfo.timeText,
          scannedAt: new Date().toISOString(),
          friendStatus: 'pending',
          _rowEl: rowEl
        });

        newlyFound++;
      } catch (e) {}
    }

    return newlyFound;
  }

  // Tạo Floating Widget UI trên Facebook
  const widgetId = 'kudox-f12-scanner-overlay';
  const old = document.getElementById(widgetId);
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = widgetId;
  overlay.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    width: 385px;
    max-height: 92vh;
    background: rgba(15, 16, 22, 0.96);
    backdrop-filter: blur(25px);
    border: 1px solid rgba(16, 185, 129, 0.35);
    border-radius: 20px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85), 0 0 30px rgba(16, 185, 129, 0.2);
    color: #f5f5f7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    z-index: 9999999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  overlay.innerHTML = `
    <div style="padding: 13px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; background: linear-gradient(180deg, rgba(16,185,129,0.15) 0%, rgba(255,255,255,0) 100%);">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">🦁</span>
        <div>
          <div style="font-weight: 800; font-size: 13px; color: #fff; letter-spacing: -0.3px;">KudoX F12 Scanner & Auto-Friend</div>
          <div style="font-size: 10px; color: #34d399; font-weight: 600;">Trỏ chuẩn nhãn F12 "Thêm bạn bè" • Human Anti-Checkpoint</div>
        </div>
      </div>
      <button id="kudox-btn-close" style="background: none; border: none; color: #86868b; font-size: 16px; cursor: pointer; padding: 2px 6px;">✕</button>
    </div>

    <div style="padding: 13px 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 11px;">
      
      <!-- Bộ lọc thời gian -->
      <div>
        <div style="font-size: 10px; text-transform: uppercase; font-weight: bold; color: #86868b; margin-bottom: 6px;">1. Lọc Thành Viên Đã Quét Theo Mốc:</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <button id="kudox-flt-all" style="padding: 6px; border-radius: 8px; border: 1px solid rgba(0, 113, 227, 0.5); background: #0071e3; color: white; font-weight: bold; cursor: pointer; font-size: 11px;">Tất Cả (<span id="cnt-all">0</span>)</button>
          <button id="kudox-flt-2days" style="padding: 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #f5f5f7; font-weight: 600; cursor: pointer; font-size: 11px;">🔥 2 Ngày (<span id="cnt-2days">0</span>)</button>
          <button id="kudox-flt-1week" style="padding: 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #f5f5f7; font-weight: 600; cursor: pointer; font-size: 11px;">⚡ 1 Tuần (<span id="cnt-1week">0</span>)</button>
          <button id="kudox-flt-2weeks" style="padding: 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #f5f5f7; font-weight: 600; cursor: pointer; font-size: 11px;">📅 2 Tuần (<span id="cnt-2weeks">0</span>)</button>
        </div>
      </div>

      <!-- Trạng thái quét -->
      <div id="kudox-scan-status-box" style="padding: 9px 11px; border-radius: 11px; background: rgba(0, 113, 227, 0.12); border: 1px solid rgba(0, 113, 227, 0.35); font-size: 11px; display: flex; align-items: center; gap: 8px;">
        <span id="kudox-status-dot" style="width: 8px; height: 8px; border-radius: 50%; background: #30d158; display: inline-block; flex-shrink: 0;"></span>
        <span id="kudox-status-msg" style="color: #60a5fa; font-weight: 600; line-height: 1.35;">Sẵn sàng quét hoặc tự động kết bạn chuẩn nhãn "Thêm bạn bè"</span>
      </div>

      <!-- Khối Quét Thành Viên -->
      <div style="display: flex; flex-direction: column; gap: 7px;">
        <button id="kudox-btn-scan" style="padding: 9px; border-radius: 11px; background: #0071e3; color: white; font-weight: bold; border: none; cursor: pointer; font-size: 12px; box-shadow: 0 4px 14px rgba(0, 113, 227, 0.4); display: flex; align-items: center; justify-content: center; gap: 6px;">
          <span>▶</span> <span id="kudox-btn-scan-text">BẮT ĐẦU QUÉT DANH SÁCH THÀNH VIÊN</span>
        </button>

        <!-- KHỐI MỚI: CHẾ ĐỘ TỰ ĐỘNG KẾT BẠN VỚI DANH SÁCH ĐÃ QUÉT (HUMAN ANTI-CHECKPOINT) -->
        <div style="padding: 10px; border-radius: 12px; background: rgba(16, 185, 129, 0.09); border: 1px solid rgba(16, 185, 129, 0.35); display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 800; color: #34d399;">🤝 TỰ ĐỘNG KẾT BẠN DS ĐÃ QUÉT</span>
            <span style="font-size: 9px; padding: 2px 6px; border-radius: 6px; background: rgba(16,185,129,0.2); color: #6ee7b7; border: 1px solid rgba(16,185,129,0.4); font-family: monospace;">Nhãn F12: "Thêm bạn bè"</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 10px;">
            <div>
              <label style="color: #9ca3af; display: block; margin-bottom: 3px;">Nhịp nghỉ Human (giây):</label>
              <select id="kudox-af-delay" style="width: 100%; padding: 5px; border-radius: 7px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid rgba(255,255,255,0.15); font-size: 10px;">
                <option value="18-35" selected>🛡️ Siêu An Toàn (18s - 35s)</option>
                <option value="12-22">⚡ Tiêu Chuẩn Human (12s - 22s)</option>
                <option value="25-45">🐢 Nick Mới Nuôi (25s - 45s)</option>
              </select>
            </div>
            <div>
              <label style="color: #9ca3af; display: block; margin-bottom: 3px;">Giới hạn chống Checkpoint:</label>
              <select id="kudox-af-limit" style="width: 100%; padding: 5px; border-radius: 7px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid rgba(255,255,255,0.15); font-size: 10px;">
                <option value="15" selected>Max 15 người / phiên</option>
                <option value="25">Max 25 người / phiên</option>
                <option value="40">Max 40 người / phiên</option>
                <option value="5">Test nhanh 5 người</option>
              </select>
            </div>
          </div>

          <button id="kudox-btn-autofriend" style="padding: 10px; border-radius: 10px; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; font-weight: 800; border: none; cursor: pointer; font-size: 11.5px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.35); display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>🤝</span> <span id="kudox-btn-autofriend-text">CHẠY TỰ ĐỘNG KẾT BẠN (TRỎ "Thêm bạn bè")</span>
          </button>

          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; padding: 0 2px;">
            <span>Đã gửi kết bạn: <strong id="kudox-af-sent" style="color: #34d399;">0</strong></span>
            <span>Bỏ qua/Đã bạn: <strong id="kudox-af-skipped" style="color: #fbbf24;">0</strong></span>
            <span>Cơ chế: <strong style="color: #60a5fa;">Bezier + Hover</strong></span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <button id="kudox-btn-copy" style="padding: 8px; border-radius: 10px; background: rgba(255,255,255,0.08); color: white; font-weight: 600; border: 1px solid rgba(255,255,255,0.12); cursor: pointer; font-size: 11px;">
            📋 Copy Links
          </button>
          <button id="kudox-btn-csv" style="padding: 8px; border-radius: 10px; background: rgba(16, 185, 129, 0.2); color: #34d399; font-weight: 600; border: 1px solid rgba(16, 185, 129, 0.4); cursor: pointer; font-size: 11px;">
            📥 Xuất CSV Clean
          </button>
        </div>

        <button id="kudox-btn-sync" style="padding: 8px; border-radius: 10px; background: rgba(245, 158, 11, 0.16); color: #fbbf24; font-weight: 700; border: 1px solid rgba(245, 158, 11, 0.35); cursor: pointer; font-size: 11px;">
          🚀 Đồng Bộ & Chạy Dàn Nick Kết Bạn Trên FalconX
        </button>
      </div>

      <!-- Xem nhanh kết quả -->
      <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
        <div style="font-size: 10px; color: #86868b; margin-bottom: 4px;">Danh sách đã quét & trạng thái kết bạn:</div>
        <div id="kudox-preview-list" style="max-height: 135px; overflow-y: auto; background: rgba(0,0,0,0.45); border-radius: 8px; padding: 6px; font-size: 10px; font-family: monospace;">
          <div style="color: #86868b; text-align: center; padding: 10px;">Chưa có dữ liệu. Bấm "Bắt Đầu Quét" ở trên!</div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Cập nhật giao diện đếm
  function updateCountersUI() {
    const all = Array.from(scannedMembers.values());
    const cAll = all.length;
    const c2Days = all.filter((m) => m.category === '2_days').length;
    const c1Week = all.filter((m) => m.category === '1_week').length;
    const c2Weeks = all.filter((m) => m.category === '2_weeks').length;

    document.getElementById('cnt-all').textContent = cAll;
    document.getElementById('cnt-2days').textContent = c2Days;
    document.getElementById('cnt-1week').textContent = c1Week;
    document.getElementById('cnt-2weeks').textContent = c2Weeks;
    document.getElementById('kudox-af-sent').textContent = sentFriendCount;
    document.getElementById('kudox-af-skipped').textContent = skippedFriendCount;

    // Render preview
    const preview = document.getElementById('kudox-preview-list');
    if (preview && cAll > 0) {
      const filtered = activeFilter === 'all' ? all : all.filter((m) => m.category === activeFilter);
      preview.innerHTML = filtered
        .slice(-18)
        .reverse()
        .map((m) => {
          const statusBadge =
            m.friendStatus === 'sent'
              ? '<span style="color:#34d399;font-weight:bold;">[✓ Đã Thêm bạn bè]</span>'
              : m.friendStatus === 'skipped'
                ? '<span style="color:#9ca3af;">[Bỏ qua]</span>'
                : `<span style="color: ${m.category === '2_days' ? '#34d399' : '#fbbf24'};">${m.timeText}</span>`;
          return `
            <div style="padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; gap: 6px;">
              <span style="color: #f5f5f7; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${m.name}</span>
              ${statusBadge}
            </div>
          `;
        })
        .join('');
    }
  }

  // Chuyển đổi bộ lọc
  function setFilter(flt) {
    activeFilter = flt;
    const buttons = [
      { id: 'kudox-flt-all', key: 'all' },
      { id: 'kudox-flt-2days', key: '2_days' },
      { id: 'kudox-flt-1week', key: '1_week' },
      { id: 'kudox-flt-2weeks', key: '2_weeks' }
    ];
    buttons.forEach((b) => {
      const el = document.getElementById(b.id);
      if (!el) return;
      if (b.key === flt) {
        el.style.background = '#0071e3';
        el.style.borderColor = 'rgba(0, 113, 227, 0.5)';
      } else {
        el.style.background = 'rgba(255,255,255,0.05)';
        el.style.borderColor = 'rgba(255,255,255,0.1)';
      }
    });
    updateCountersUI();
  }

  document.getElementById('kudox-flt-all').onclick = () => setFilter('all');
  document.getElementById('kudox-flt-2days').onclick = () => setFilter('2_days');
  document.getElementById('kudox-flt-1week').onclick = () => setFilter('1_week');
  document.getElementById('kudox-flt-2weeks').onclick = () => setFilter('2_weeks');

  // Đóng widget
  document.getElementById('kudox-btn-close').onclick = () => {
    shouldStop = true;
    shouldStopAutoFriend = true;
    overlay.remove();
    window.__KUDOX_MEMBER_SCANNER_ACTIVE__ = false;
  };

  // Vòng lặp cuộn tự động quét thành viên
  async function runAutoScroll() {
    isScanning = true;
    shouldStop = false;
    document.getElementById('kudox-btn-scan-text').textContent = 'TẠM DỪNG QUÉT (PAUSE)';
    document.getElementById('kudox-btn-scan').style.background = '#e11d48';
    document.getElementById('kudox-status-msg').textContent = 'Đang tự động cuộn trang và bóc tách thành viên...';

    let noNewCount = 0;

    while (!shouldStop) {
      const newlyAdded = harvestCurrentDOM();
      updateCountersUI();

      if (newlyAdded === 0) {
        noNewCount++;
      } else {
        noNewCount = 0;
      }

      if (noNewCount >= 12) {
        document.getElementById('kudox-status-msg').textContent = 'Đã cuộn đến cuối danh sách hoặc Facebook đang chờ nạp!';
        break;
      }

      window.scrollBy({ top: randInt(1100, 1550), behavior: 'smooth' });
      await sleep(randInt(1100, 1500));
    }

    isScanning = false;
    document.getElementById('kudox-btn-scan-text').textContent = 'TIẾP TỤC QUÉT THÀNH VIÊN';
    document.getElementById('kudox-btn-scan').style.background = '#0071e3';
    document.getElementById('kudox-status-msg').textContent = `Đã dừng quét. Tổng hồ sơ hợp lệ: ${scannedMembers.size}`;
  }

  document.getElementById('kudox-btn-scan').onclick = () => {
    if (isScanning) {
      shouldStop = true;
      document.getElementById('kudox-btn-scan-text').textContent = 'TIẾP TỤC QUÉT THÀNH VIÊN';
      document.getElementById('kudox-btn-scan').style.background = '#0071e3';
    } else {
      runAutoScroll();
    }
  };

  /**
   * 🤝 VÒNG LẶP TỰ ĐỘNG KẾT BẠN VỚI DANH SÁCH ĐÃ QUÉT (HUMAN ANTI-CHECKPOINT)
   * Trỏ đúng nhãn trong F12: "Thêm bạn bè"
   */
  async function runHumanAutoFriendOnScannedList() {
    // Đảm bảo đã quét DOM hiện tại ít nhất 1 lần
    harvestCurrentDOM();
    updateCountersUI();

    const all = Array.from(scannedMembers.values());
    const targetList = (activeFilter === 'all' ? all : all.filter((m) => m.category === activeFilter)).filter(
      (m) => !friendedIds.has(m.id) && m.friendStatus !== 'sent'
    );

    if (targetList.length === 0) {
      alert('Chưa có thành viên nào trong danh sách lọc hiện tại! Hãy bấm "Bắt Đầu Quét" hoặc chọn bộ lọc khác.');
      return;
    }

    isAutoFriending = true;
    shouldStopAutoFriend = false;

    const btnEl = document.getElementById('kudox-btn-autofriend');
    const btnTextEl = document.getElementById('kudox-btn-autofriend-text');
    const statusEl = document.getElementById('kudox-status-msg');

    btnEl.style.background = '#e11d48';
    btnTextEl.textContent = 'DỪNG KẾT BẠN (ĐANG CHẠY HUMAN...)';

    const delayRangeStr = document.getElementById('kudox-af-delay').value || '18-35';
    const [minSec, maxSec] = delayRangeStr.split('-').map((n) => parseInt(n, 10) || 18);
    const maxLimit = parseInt(document.getElementById('kudox-af-limit').value || '15', 10);

    let sessionSent = 0;

    for (let i = 0; i < targetList.length; i++) {
      if (shouldStopAutoFriend) break;
      if (sessionSent >= maxLimit) {
        statusEl.textContent = `🛡️ Đã đạt giới hạn an toàn ${maxLimit} lời mời/phiên để bảo vệ nick chống Checkpoint!`;
        break;
      }

      // Kiểm tra hộp thoại cảnh báo Checkpoint trước mỗi lượt
      const preCheck = await checkAndHandleCheckpointWarning();
      if (preCheck.warned) {
        statusEl.textContent = preCheck.reason;
        alert(preCheck.reason);
        break;
      }

      const member = targetList[i];
      statusEl.textContent = `🔍 [${sessionSent + 1}/${maxLimit}] Đang tìm nhãn F12 "Thêm bạn bè" của: ${member.name}...`;

      const addFriendBtn = findAddFriendButtonForMember(member);
      if (!addFriendBtn) {
        member.friendStatus = 'skipped';
        skippedFriendCount++;
        updateCountersUI();
        continue;
      }

      // Thực thi hành vi Human: Cuộn mượt -> Đọc -> Rê chuột Hover -> Bấm "Thêm bạn bè"
      statusEl.textContent = `🧬 [Human] Đang rê chuột & bấm nhãn "Thêm bạn bè" -> ${member.name}...`;
      await performHumanClickAddFriend(addFriendBtn, member);

      // Kiểm tra hộp thoại cảnh báo sau khi bấm
      const postCheck = await checkAndHandleCheckpointWarning();
      if (postCheck.warned) {
        statusEl.textContent = postCheck.reason;
        alert(postCheck.reason);
        break;
      }

      friendedIds.add(member.id);
      member.friendStatus = 'sent';
      sentFriendCount++;
      sessionSent++;
      updateCountersUI();

      console.log(`%c[KudoX Human Auto-Friend] ✓ Đã bấm nhãn "Thêm bạn bè" cho: ${member.name} (${member.url})`, 'color: #10b981; font-weight: bold;');

      if (shouldStopAutoFriend || sessionSent >= maxLimit || i === targetList.length - 1) break;

      // Cơ chế nghỉ sâu (Deep Coffee Break) sau mỗi 4 lời mời kết bạn
      if (sessionSent > 0 && sessionSent % 4 === 0) {
        const deepRestSec = randInt(45, 75);
        for (let r = deepRestSec; r > 0; r--) {
          if (shouldStopAutoFriend) break;
          statusEl.textContent = `☕ Nghỉ giải lao chống Checkpoint sau ${sessionSent} lời mời (${r}s)...`;
          await sleep(1000);
        }
      } else {
        // Nhịp nghỉ sinh học ngẫu nhiên giữa 2 người
        const waitSec = randInt(minSec, maxSec);
        for (let w = waitSec; w > 0; w--) {
          if (shouldStopAutoFriend) break;
          statusEl.textContent = `✓ Đã kết bạn ${member.name}. Nghỉ Human ${w}s trước người tiếp theo...`;
          await sleep(1000);
        }
      }
    }

    isAutoFriending = false;
    btnEl.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
    btnTextEl.textContent = 'CHẠY TỰ ĐỘNG KẾT BẠN (TRỎ "Thêm bạn bè")';
    if (!shouldStopAutoFriend) {
      statusEl.textContent = `🎉 Hoàn tất phiên kết bạn Human! Đã gửi: ${sentFriendCount} lời mời.`;
    } else {
      statusEl.textContent = `⏸ Đã tạm dừng kết bạn tự động. Đã gửi: ${sentFriendCount} lời mời.`;
    }
  }

  document.getElementById('kudox-btn-autofriend').onclick = () => {
    if (isAutoFriending) {
      shouldStopAutoFriend = true;
      document.getElementById('kudox-btn-autofriend-text').textContent = 'ĐANG DỪNG...';
    } else {
      runHumanAutoFriendOnScannedList();
    }
  };

  // Copy Link
  document.getElementById('kudox-btn-copy').onclick = () => {
    const all = Array.from(scannedMembers.values());
    const filtered = activeFilter === 'all' ? all : all.filter((m) => m.category === activeFilter);
    if (filtered.length === 0) {
      alert('Chưa có hồ sơ nào thuộc bộ lọc này!');
      return;
    }
    const text = filtered.map((m) => `${m.name} - ${m.url} (${m.timeText})`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      alert(`✅ Đã sao chép ${filtered.length} link thành viên vào Clipboard!`);
    });
  };

  // Xuất file CSV (có UTF-8 BOM chống lỗi font tiếng Việt trong Excel)
  document.getElementById('kudox-btn-csv').onclick = () => {
    const all = Array.from(scannedMembers.values());
    const filtered = activeFilter === 'all' ? all : all.filter((m) => m.category === activeFilter);
    if (filtered.length === 0) {
      alert('Chưa có hồ sơ nào để xuất CSV!');
      return;
    }

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += 'STT,Họ Tên,Mốc Tham Gia,Chi Tiết Thời Gian,Trạng Thái Kết Bạn,Link Profile Facebook,UID\n';

    filtered.forEach((m, idx) => {
      const nameSafe = `"${m.name.replace(/"/g, '""')}"`;
      const catSafe = `"${m.categoryLabel.replace(/"/g, '""')}"`;
      const timeSafe = `"${m.timeText.replace(/"/g, '""')}"`;
      const statusSafe = m.friendStatus === 'sent' ? '"Đã gửi Thêm bạn bè"' : '"Chưa gửi"';
      csvContent += `${idx + 1},${nameSafe},${catSafe},${timeSafe},${statusSafe},${m.url},${m.id}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kudox_members_clean_${activeFilter}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Đồng bộ về FalconX Web & Kích hoạt dàn nick kết bạn
  document.getElementById('kudox-btn-sync').onclick = async () => {
    const all = Array.from(scannedMembers.values()).map((m) => {
      const copy = { ...m };
      delete copy._rowEl;
      return copy;
    });
    if (all.length === 0) {
      alert('Chưa có hồ sơ nào để đồng bộ!');
      return;
    }

    try {
      const res = await fetch('http://127.0.0.1:3300/api/members/ingest-f12', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: window.location.href,
          groupName: document.title || 'Facebook Group',
          members: all
        })
      }).then((r) => r.json());

      if (res && res.success) {
        alert(
          `🎉 Đã đồng bộ thành công ${res.addedCount} thành viên vào FalconX!\nBạn có thể bấm "Tự Động Kết Bạn Danh Sách Đã Quét" ngay trên bảng điều khiển để dàn nick tự động chạy kết bạn Human.`
        );
      } else {
        alert('Lỗi phản hồi từ server: ' + (res.error || 'Vui lòng kiểm tra server localhost:3300'));
      }
    } catch (e) {
      alert('Không kết nối được server FalconX tại http://127.0.0.1:3300. Hãy đảm bảo phần mềm đang chạy!');
    }
  };

  // Quét lần đầu ngay khi mở script
  harvestCurrentDOM();
  updateCountersUI();
})();
