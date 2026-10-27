/**
 * =========================================================================
 * 🦁 KUDOX F12 MEMBER SCANNER PRO — TOOL QUÉT & PHÂN LOẠI THÀNH VIÊN GROUP
 * =========================================================================
 * Hướng dẫn sử dụng:
 * 1. Mở Facebook Group bất kỳ trên trình duyệt máy tính (Chrome, Edge, Cốc Cốc, Brave).
 * 2. Vào mục "Thành viên" (Members) hoặc link: https://www.facebook.com/groups/<group_id>/members/
 * 3. Bấm phím F12 (hoặc Ctrl + Shift + I) -> Chọn thẻ "Console".
 * 4. Dán toàn bộ mã này vào và nhấn ENTER.
 * 5. Bảng điều khiển nổi KudoX sẽ hiện ra ở góc phải màn hình để bạn quét và lọc sạch!
 * =========================================================================
 */

(() => {
  if (window.__KUDOX_MEMBER_SCANNER_ACTIVE__) {
    alert('🦁 KudoX Member Scanner đã đang chạy trên trang này!');
    return;
  }
  window.__KUDOX_MEMBER_SCANNER_ACTIVE__ = true;

  console.log('%c🦁 KUDOX F12 MEMBER SCANNER PRO KÍCH HOẠT THÀNH CÔNG!%c\nSẵn sàng quét và phân loại thành viên mới 2 ngày, 1 tuần, 2 tuần gần nhất.', 'background: #0071e3; color: white; font-size: 14px; font-weight: bold; padding: 4px 10px; border-radius: 6px;', 'color: #10b981; font-weight: bold;');

  // State
  let isScanning = false;
  let shouldStop = false;
  let activeFilter = 'all'; // 'all' | '2_days' | '1_week' | '2_weeks'
  const scannedMembers = new Map(); // id -> MemberObj

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

  // Quét các node DOM trên trang Facebook hiện tại
  function harvestCurrentDOM() {
    let newlyFound = 0;
    const anchors = Array.from(document.querySelectorAll('a[href]'));

    for (const anchor of anchors) {
      try {
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

        // Đào text xung quanh để lấy ngày tham gia
        let container = anchor.parentElement;
        for (let depth = 0; depth < 5 && container; depth++, container = container.parentElement) {
          const fullText = (container.innerText || '').trim();
          if (fullText && fullText.length < 300) {
            const lines = fullText.split('\n').map((l) => l.trim()).filter(Boolean);
            if (lines.length >= 1) {
              if (!name || name.length < 2) name = lines[0];
              if (lines.length >= 2) {
                subtitle = lines.slice(1).filter((l) => !/thêm bạn|nhắn tin|xem thêm/i.test(l)).join(' • ');
              }
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
          scannedAt: new Date().toISOString()
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
    top: 20px;
    right: 20px;
    width: 360px;
    max-height: 90vh;
    background: rgba(18, 18, 20, 0.95);
    backdrop-filter: blur(25px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 20px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 113, 227, 0.25);
    color: #f5f5f7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    z-index: 9999999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  overlay.innerHTML = `
    <div style="padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%);">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">🦁</span>
        <div>
          <div style="font-weight: 700; font-size: 13px; color: #fff; letter-spacing: -0.3px;">KudoX Member Scanner Pro</div>
          <div style="font-size: 10px; color: #86868b;">Bóc tách thành viên mới Clean 100%</div>
        </div>
      </div>
      <button id="kudox-btn-close" style="background: none; border: none; color: #86868b; font-size: 16px; cursor: pointer; padding: 2px 6px;">✕</button>
    </div>

    <div style="padding: 14px 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px;">
      
      <!-- Bộ lọc thời gian -->
      <div>
        <div style="font-size: 10px; text-transform: uppercase; font-weight: bold; color: #86868b; margin-bottom: 6px;">Lọc Thành Viên Mới Theo Mốc:</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <button id="kudox-flt-all" style="padding: 6px; border-radius: 8px; border: 1px solid rgba(0, 113, 227, 0.5); background: #0071e3; color: white; font-weight: bold; cursor: pointer; font-size: 11px;">Tất Cả (<span id="cnt-all">0</span>)</button>
          <button id="kudox-flt-2days" style="padding: 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #f5f5f7; font-weight: 600; cursor: pointer; font-size: 11px;">🔥 2 Ngày (<span id="cnt-2days">0</span>)</button>
          <button id="kudox-flt-1week" style="padding: 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #f5f5f7; font-weight: 600; cursor: pointer; font-size: 11px;">⚡ 1 Tuần (<span id="cnt-1week">0</span>)</button>
          <button id="kudox-flt-2weeks" style="padding: 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #f5f5f7; font-weight: 600; cursor: pointer; font-size: 11px;">📅 2 Tuần (<span id="cnt-2weeks">0</span>)</button>
        </div>
      </div>

      <!-- Trạng thái quét -->
      <div id="kudox-scan-status-box" style="padding: 10px; border-radius: 12px; background: rgba(0, 113, 227, 0.1); border: 1px solid rgba(0, 113, 227, 0.3); font-size: 11px; display: flex; align-items: center; gap: 8px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #30d158; display: inline-block;"></span>
        <span id="kudox-status-msg" style="color: #2997ff; font-weight: 500;">Sẵn sàng cuộn và bóc tách thành viên</span>
      </div>

      <!-- Các nút thao tác chính -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button id="kudox-btn-scan" style="padding: 10px; border-radius: 12px; background: #0071e3; color: white; font-weight: bold; border: none; cursor: pointer; font-size: 12px; box-shadow: 0 4px 15px rgba(0, 113, 227, 0.4); display: flex; align-items: center; justify-content: center; gap: 6px;">
          <span>▶</span> <span id="kudox-btn-scan-text">BẮT ĐẦU QUÉT TỰ ĐỘNG</span>
        </button>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <button id="kudox-btn-copy" style="padding: 8px; border-radius: 10px; background: rgba(255,255,255,0.08); color: white; font-weight: 600; border: 1px solid rgba(255,255,255,0.12); cursor: pointer; font-size: 11px;">
            📋 Copy Links
          </button>
          <button id="kudox-btn-csv" style="padding: 8px; border-radius: 10px; background: rgba(16, 185, 129, 0.2); color: #34d399; font-weight: 600; border: 1px solid rgba(16, 185, 129, 0.4); cursor: pointer; font-size: 11px;">
            📥 Xuất CSV Clean
          </button>
        </div>

        <button id="kudox-btn-sync" style="padding: 8px; border-radius: 10px; background: rgba(245, 158, 11, 0.15); color: #fbbf24; font-weight: 600; border: 1px solid rgba(245, 158, 11, 0.3); cursor: pointer; font-size: 11px;">
          🚀 Đẩy Dữ Liệu Về Web FalconX (Localhost:3300)
        </button>
      </div>

      <!-- Xem nhanh kết quả -->
      <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
        <div style="font-size: 10px; color: #86868b; margin-bottom: 4px;">Danh sách quét gần nhất:</div>
        <div id="kudox-preview-list" style="max-height: 140px; overflow-y: auto; background: rgba(0,0,0,0.4); border-radius: 8px; padding: 6px; font-size: 10px; font-family: monospace;">
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

    // Render preview
    const preview = document.getElementById('kudox-preview-list');
    if (preview && cAll > 0) {
      const filtered = activeFilter === 'all' ? all : all.filter((m) => m.category === activeFilter);
      preview.innerHTML = filtered.slice(-15).reverse().map((m, i) => `
        <div style="padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between;">
          <span style="color: #f5f5f7; font-weight: 500;">${m.name}</span>
          <span style="color: ${m.category === '2_days' ? '#34d399' : '#fbbf24'};">${m.timeText}</span>
        </div>
      `).join('');
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
    overlay.remove();
    window.__KUDOX_MEMBER_SCANNER_ACTIVE__ = false;
  };

  // Vòng lặp cuộn tự động
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

      window.scrollBy(0, 1500);
      await new Promise((r) => setTimeout(r, 1200));
    }

    isScanning = false;
    document.getElementById('kudox-btn-scan-text').textContent = 'TIẾP TỤC QUÉT';
    document.getElementById('kudox-btn-scan').style.background = '#0071e3';
    document.getElementById('kudox-status-msg').textContent = `Đã dừng. Tổng hồ sơ hợp lệ: ${scannedMembers.size}`;
  }

  document.getElementById('kudox-btn-scan').onclick = () => {
    if (isScanning) {
      shouldStop = true;
      document.getElementById('kudox-btn-scan-text').textContent = 'TIẾP TỤC QUÉT';
      document.getElementById('kudox-btn-scan').style.background = '#0071e3';
    } else {
      runAutoScroll();
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
    csvContent += 'STT,Họ Tên,Mốc Tham Gia,Chi Tiết Thời Gian,Link Profile Facebook,UID\n';

    filtered.forEach((m, idx) => {
      const nameSafe = `"${m.name.replace(/"/g, '""')}"`;
      const catSafe = `"${m.categoryLabel.replace(/"/g, '""')}"`;
      const timeSafe = `"${m.timeText.replace(/"/g, '""')}"`;
      csvContent += `${idx + 1},${nameSafe},${catSafe},${timeSafe},${m.url},${m.id}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kudox_members_clean_${activeFilter}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Đồng bộ về FalconX Web
  document.getElementById('kudox-btn-sync').onclick = async () => {
    const all = Array.from(scannedMembers.values());
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
        alert(`🎉 Đã đồng bộ thành công ${res.addedCount} thành viên mới vào hệ thống FalconX!`);
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
