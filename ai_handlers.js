// ========================================================
// FREE AI ENGINE INTEGRATION & CLIENT HANDLERS (AUTO FAILOVER & KEY POOL)
// ========================================================
let currentAiConfig = null;

async function loadAiConfig() {
  try {
    const res = await fetch('/api/ai/config').then(r => r.json());
    if (res.success && res.config) {
      currentAiConfig = res.config;
      const cfg = res.config;

      const select = document.getElementById('ai-provider-select');
      if (select && cfg.provider) select.value = cfg.provider;

      const keyInput = document.getElementById('ai-api-key-input');
      if (keyInput && cfg.apiKey) {
        keyInput.value = cfg.apiKey;
      }

      const failoverCheck = document.getElementById('ai-autofailover-toggle');
      if (failoverCheck) failoverCheck.checked = cfg.autoFailover !== false;

      const cascadeCheck = document.getElementById('ai-autocascade-toggle');
      if (cascadeCheck) cascadeCheck.checked = cfg.autoCascadeProvider !== false;

      handleAiProviderChange();
      updateAiStatusBadge(cfg);
      renderKeyPoolTable(cfg.keysPool || []);
    }
  } catch (err) {
    console.warn('Lỗi tải cấu hình AI:', err);
  }
}

function updateAiStatusBadge(cfg) {
  const badge = document.getElementById('ai-status-badge');
  const poolBadge = document.getElementById('ai-pool-count-badge');
  if (!badge) return;

  const totalKeys = cfg.totalKeysCount || (cfg.keysPool ? cfg.keysPool.length : 0);
  const activeKeys = cfg.activeKeysCount || (cfg.keysPool ? cfg.keysPool.filter(k => k.status === 'active').length : 0);

  if (poolBadge) {
    poolBadge.textContent = `${activeKeys}/${totalKeys} Keys Khả Dụng`;
  }

  if (cfg.provider === 'offline') {
    badge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700 border border-blue-500/30 font-mono';
    badge.textContent = '● NLP & GPS Offline (Free 100%)';
  } else if (activeKeys > 1) {
    badge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 font-mono flex items-center gap-1';
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> <span>Chống Nghẽn Bật (${activeKeys} Keys Tự Động Failover)</span>`;
  } else if (activeKeys === 1) {
    badge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 font-mono';
    badge.textContent = '● 1 Key Sẵn Sàng (Thêm key để chống nghẽn)';
  } else {
    badge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 border border-amber-500/30 font-mono';
    badge.textContent = '● Sẵn Sàng (Dùng NLP & GPS Haversine)';
  }
}

function handleAiProviderChange() {
  const select = document.getElementById('ai-provider-select');
  const guideLink = document.getElementById('ai-key-guide-link');
  const keyInput = document.getElementById('ai-api-key-input');
  if (!select || !guideLink || !keyInput) return;

  const val = select.value;
  if (val === 'gemini') {
    guideLink.href = 'https://aistudio.google.com/app/apikey';
    guideLink.innerHTML = '<span>Lấy Key Gemini Free (Google AI Studio) ↗</span>';
    keyInput.placeholder = 'Dán Google Gemini API Key (AIzaSy...) hoặc nhiều key';
    keyInput.disabled = false;
  } else if (val === 'groq') {
    guideLink.href = 'https://console.groq.com/keys';
    guideLink.innerHTML = '<span>Lấy Key Groq Free (Siêu tốc Llama 3.3) ↗</span>';
    keyInput.placeholder = 'Dán Groq API Key (gsk_...) hoặc nhiều key';
    keyInput.disabled = false;
  } else if (val === 'openrouter') {
    guideLink.href = 'https://openrouter.ai/keys';
    guideLink.innerHTML = '<span>Lấy Key OpenRouter Free ↗</span>';
    keyInput.placeholder = 'Dán OpenRouter API Key (sk-or-...) hoặc nhiều key';
    keyInput.disabled = false;
  } else {
    guideLink.href = 'javascript:void(0)';
    guideLink.innerHTML = '<span>Không Cần API Key (Hoạt Động 100% Offline)</span>';
    keyInput.placeholder = 'Chế độ NLP & GPS Haversine tích hợp sẵn, không cần key';
    keyInput.disabled = true;
  }
}

function toggleAiSettingsBox() {
  const box = document.getElementById('ai-settings-expandable');
  if (!box) return;
  box.classList.toggle('hidden');
}

function toggleShowAiKey() {
  const inp = document.getElementById('ai-api-key-input');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function renderKeyPoolTable(keysPool) {
  const tbody = document.getElementById('ai-key-pool-tbody');
  const emptyWrap = document.getElementById('ai-key-pool-empty');
  if (!tbody) return;

  if (!keysPool || keysPool.length === 0) {
    tbody.innerHTML = '';
    if (emptyWrap) emptyWrap.classList.remove('hidden');
    return;
  }

  if (emptyWrap) emptyWrap.classList.add('hidden');

  tbody.innerHTML = keysPool.map((k, index) => {
    let statusBadge = '';
    if (k.status === 'active') {
      statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 font-mono">🟢 Hoạt động</span>';
    } else if (k.status === 'rate_limited') {
      const waitSec = k.cooldownUntil ? Math.max(0, Math.round((k.cooldownUntil - Date.now()) / 1000)) : 60;
      statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 border border-amber-500/30 font-mono">🟡 Giãn cách (' + waitSec + 's)</span>';
    } else {
      statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-700 border border-red-500/30 font-mono">🔴 Lỗi/Hết hạn</span>';
    }

    let providerBadge = '';
    if (k.provider === 'gemini') {
      providerBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/15 text-sky-800 border border-sky-500/30">Google Gemini</span>';
    } else if (k.provider === 'groq') {
      providerBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/15 text-orange-800 border border-orange-500/30">Groq Cloud</span>';
    } else {
      providerBadge = '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/15 text-purple-800 border border-purple-500/30">OpenRouter</span>';
    }

    const isCurrentActive = currentAiConfig && currentAiConfig.activeKeyId === k.id;

    return `
      <tr class="border-b border-stone-200/60 hover:bg-amber-50/50 transition">
        <td class="py-2 px-3 text-[11px] font-medium text-stone-600">#${index + 1}</td>
        <td class="py-2 px-3">${providerBadge}</td>
        <td class="py-2 px-3 font-mono text-xs font-bold text-stone-900">
          <div class="flex items-center gap-1.5">
            <span>${escapeHtml(k.apiKey || k.maskedKey)}</span>
            ${isCurrentActive ? '<span class="px-1.5 py-0.2 rounded text-[9px] bg-amber-500 text-white font-bold" title="Key vừa phục vụ request gần nhất">Đang Phục Vụ</span>' : ''}
          </div>
        </td>
        <td class="py-2 px-3">${statusBadge}</td>
        <td class="py-2 px-3 text-[11px] text-stone-600 font-mono">
          <span class="text-emerald-700 font-bold">${k.successCount || 0}</span> ok / <span class="text-rose-600">${k.failCount || 0}</span> lỗi
        </td>
        <td class="py-2 px-3 text-right space-x-1">
          <button onclick="resetKeyInPool('${k.id}')" title="Khôi phục trạng thái hoạt động" class="p-1 rounded-lg text-amber-700 hover:bg-amber-100 transition text-xs">🔄</button>
          <button onclick="deleteKeyFromPool('${k.id}')" title="Xóa key khỏi bể" class="p-1 rounded-lg text-rose-600 hover:bg-rose-100 transition text-xs">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function addMultipleKeysToPool() {
  const inputEl = document.getElementById('ai-api-key-input');
  const providerSelect = document.getElementById('ai-provider-select');
  const rawText = inputEl.value.trim();

  if (!rawText) {
    return alert('Vui lòng nhập hoặc dán ít nhất 1 API Key!');
  }

  const btn = document.getElementById('btn-add-ai-keys');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> <span>Đang nạp...</span>';

  try {
    const res = await fetch('/api/ai/keys/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: rawText, provider: providerSelect.value })
    }).then(r => r.json());

    if (res.success) {
      inputEl.value = '';
      alert(`✅ ${res.message}\nTổng số keys trong bể dự phòng: ${res.config?.keysPool?.length || 0}`);
      await loadAiConfig();
    } else {
      alert('Lỗi: ' + res.error);
    }
  } catch (err) {
    alert('Lỗi kết nối: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>➕</span> <span>Nạp Vào Bể Key</span>';
  }
}

async function deleteKeyFromPool(keyId) {
  if (!confirm('Bạn có chắc muốn xóa API Key này khỏi Bể Khóa Dự Phòng?')) return;
  try {
    const res = await fetch(`/api/ai/keys/${keyId}`, { method: 'DELETE' }).then(r => r.json());
    if (res.success) {
      await loadAiConfig();
    } else {
      alert('Lỗi: ' + res.error);
    }
  } catch (err) {
    alert('Lỗi kết nối: ' + err.message);
  }
}

async function resetKeyInPool(keyId) {
  try {
    const res = await fetch(`/api/ai/keys/${keyId}/reset`, { method: 'POST' }).then(r => r.json());
    if (res.success) {
      await loadAiConfig();
    } else {
      alert('Lỗi: ' + res.error);
    }
  } catch (err) {
    alert('Lỗi kết nối: ' + err.message);
  }
}

async function testEntireKeyPool() {
  const btn = document.getElementById('btn-test-all-keys');
  const resBox = document.getElementById('ai-test-result-box');

  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> <span>Đang test toàn bể...</span>';
  resBox.classList.remove('hidden');
  resBox.className = 'p-3 rounded-xl text-xs font-mono bg-amber-500/10 text-amber-900 border border-amber-500/30';
  resBox.innerHTML = 'Đang đồng loạt gửi kiểm tra tất cả các key trong bể dự phòng...';

  try {
    const res = await fetch('/api/ai/keys/test-pool', { method: 'POST' }).then(r => r.json());

    if (res.success) {
      const activeCount = res.activeCount || 0;
      const totalCount = res.totalCount || 0;

      let detailList = (res.results || []).map(r => `
        <div class="py-1 border-b border-amber-500/20 flex items-center justify-between">
          <span>• [${r.provider.toUpperCase()}] <b>${r.maskedKey}</b>:</span>
          <span class="${r.status === 'active' ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}">${escapeHtml(r.message)}</span>
        </div>
      `).join('');

      resBox.className = 'p-3 rounded-xl text-xs font-mono bg-emerald-500/10 text-emerald-900 border border-emerald-500/30 space-y-1.5';
      resBox.innerHTML = `
        <div class="flex items-center justify-between font-bold border-b border-emerald-500/30 pb-1">
          <span>✅ KẾT QUẢ TEST BỂ KHÓA CHỐNG NGHẼN:</span>
          <span>${activeCount}/${totalCount} Keys Sẵn Sàng</span>
        </div>
        <div class="space-y-0.5 max-h-48 overflow-y-auto pt-1">${detailList}</div>
        <div class="text-[10px] text-stone-600 pt-1">💡 Hệ thống sẽ tự động luân chuyển giữa các key này. Khi 1 key hết 15 RPM/Quota, tự động chuyển ngay sang key kế tiếp mà không làm gián đoạn!</div>
      `;

      await loadAiConfig();
    } else {
      resBox.className = 'p-3 rounded-xl text-xs font-mono bg-red-500/10 text-red-800 border border-red-500/30';
      resBox.innerHTML = `❌ Lỗi kiểm tra bể khóa: ${escapeHtml(res.error || 'Thất bại')}`;
    }
  } catch (err) {
    resBox.className = 'p-3 rounded-xl text-xs font-mono bg-red-500/10 text-red-800 border border-red-500/30';
    resBox.innerHTML = `❌ Lỗi kết nối: ${escapeHtml(err.message)}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>⚡</span> <span>Test Toàn Bộ Bể Key</span>';
  }
}

async function saveAiFailoverSettings() {
  const autofailover = document.getElementById('ai-autofailover-toggle').checked;
  const autocascade = document.getElementById('ai-autocascade-toggle').checked;
  const provider = document.getElementById('ai-provider-select').value;

  try {
    await fetch('/api/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        autoFailover: autofailover,
        autoCascadeProvider: autocascade
      })
    });
    await loadAiConfig();
  } catch (err) {
    console.warn('Lỗi lưu cài đặt failover:', err);
  }
}

async function saveAndTestAiKey() {
  const select = document.getElementById('ai-provider-select');
  const keyInput = document.getElementById('ai-api-key-input');
  const resBox = document.getElementById('ai-test-result-box');
  const btn = document.getElementById('btn-test-ai-key');

  const provider = select.value;
  const apiKey = keyInput.value.trim();

  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> <span>Đang kiểm tra...</span>';
  resBox.classList.remove('hidden');
  resBox.className = 'p-2.5 rounded-lg text-[11px] font-mono bg-amber-500/10 text-amber-900 border border-amber-500/20';
  resBox.innerHTML = 'Đang gửi yêu cầu kiểm tra tới máy chủ AI...';

  try {
    if (apiKey) {
      await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey })
      });
    }

    const testRes = await fetch('/api/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey })
    }).then(r => r.json());

    if (testRes.success) {
      resBox.className = 'p-2.5 rounded-lg text-[11px] font-mono bg-emerald-500/10 text-emerald-800 border border-emerald-500/30';
      resBox.innerHTML = '✅ <b>KẾT NỐI THÀNH CÔNG!</b><br/>• Nhà cung cấp: <b>' + provider.toUpperCase() + '</b><br/>• Model: <b>' + (testRes.modelUsed || 'default') + '</b><br/>• Phản hồi AI: "' + escapeHtml(testRes.message || '') + '"';
    } else {
      resBox.className = 'p-2.5 rounded-lg text-[11px] font-mono bg-red-500/10 text-red-800 border border-red-500/30';
      resBox.innerHTML = '❌ <b>KẾT NỐI THẤT BÀI:</b> ' + escapeHtml(testRes.message) + '<br/><span class="text-[10px] text-stone-600">Gợi ý: Kiểm tra lại API Key hoặc chọn chế độ NLP & GPS Offline (Free 100%).</span>';
    }

    await loadAiConfig();
  } catch (err) {
    resBox.className = 'p-2.5 rounded-lg text-[11px] font-mono bg-red-500/10 text-red-800 border border-red-500/30';
    resBox.innerHTML = '❌ Lỗi kết nối: ' + escapeHtml(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>⚡</span> <span>Lưu & Test</span>';
  }
}

async function runAiSimulation() {
  const inputEl = document.getElementById('ai-sim-input');
  const postContent = inputEl.value.trim();
  if (!postContent) {
    return alert('Vui lòng nhập bài viết hoặc nhu cầu của khách hàng để thử nghiệm AI!');
  }

  const btn = document.getElementById('btn-run-ai-sim');
  const resultBox = document.getElementById('ai-sim-result');

  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> <span>AI Đang Phân Tích...</span>';
  resultBox.classList.remove('hidden');
  resultBox.innerHTML = '<div class="flex items-center gap-2 text-stone-600 animate-pulse py-2">' +
    '<div class="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>' +
    '<span>Đang gửi bài viết tới AI, bóc tách nhu cầu và tính toán khoảng cách GPS Google Maps...</span>' +
  '</div>';

  try {
    const res = await fetch('/api/ai/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postContent })
    }).then(r => r.json());

    if (!res.success) {
      resultBox.innerHTML = '<div class="text-red-700">❌ Lỗi: ' + escapeHtml(res.error || 'Không thể mô phỏng') + '</div>';
      return;
    }

    const { demand, bestMatch, matchResult, aiComment, confidenceScore, explanation, providerUsed, keyUsedMasked } = res.analysis;

    let matchHtml = '';
    if (bestMatch && matchResult) {
      matchHtml = '<div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">' +
        '<div class="flex items-center justify-between">' +
          '<span class="font-bold text-amber-900 text-xs flex items-center gap-1">' +
            '<span>🏠</span> Căn Khớp Nhất Trong Kho: <b>' + escapeHtml(bestMatch.project) + ' — ' + escapeHtml(bestMatch.bedroom || 'Căn hộ') + '</b>' +
          '</span>' +
          '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white font-mono">' +
            'Độ Khớp: ' + confidenceScore + '%' +
          '</span>' +
        '</div>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-stone-800">' +
          '<div>📍 <b>Vị trí:</b> ' + escapeHtml(bestMatch.building || bestMatch.cluster || 'Ecopark') + '</div>' +
          '<div>💰 <b>Giá:</b> <span class="text-amber-800 font-bold">' + escapeHtml(bestMatch.priceText || 'Thỏa thuận') + '</span></div>' +
          '<div>🛋️ <b>Nội thất:</b> ' + escapeHtml(bestMatch.furniture || 'Full đồ') + '</div>' +
          '<div>📐 <b>Khoảng cách:</b> <span class="text-indigo-700 font-bold">' + escapeHtml(matchResult.distanceText) + '</span></div>' +
        '</div>' +
        '<div class="text-[10px] text-stone-600 pt-1 border-t border-amber-500/20">' +
          '<b>Tiêu chí khớp:</b> ' + matchResult.reasons.map(r => '• ' + escapeHtml(r)).join(' ') +
        '</div>' +
      '</div>';
    } else {
      matchHtml = '<div class="p-2.5 rounded-xl bg-stone-100 border border-stone-200 text-stone-700 text-xs">' +
        'ℹ️ <i>' + escapeHtml(explanation || 'Chưa tìm thấy căn hoàn toàn trùng khớp toà/giá trong kho nguồn hiện tại.') + '</i>' +
      '</div>';
    }

    const budgetDisplay = demand.budgetText || demand.budgetRaw || (demand.budgetMax ? (demand.budgetMax / 1000000) + ' tr' : (demand.maxBudget ? (demand.maxBudget / 1000000) + ' tr' : 'Thoả thuận'));
    const isRent = demand.type === 'rent' || demand.intent === 'rent';
    const isSale = demand.type === 'sale' || demand.intent === 'sale';
    const intentDisplay = isRent ? 'Thuê căn hộ' : (isSale ? 'Mua căn hộ' : 'Hỏi thông tin');
    const locationDisplay = demand.building || demand.project || demand.targetLocation || demand.buildingOrCluster || demand.requestedLocation || 'Ecopark chung';

    const providerTag = (providerUsed || 'AI Engine').toUpperCase();
    const keyTag = keyUsedMasked || 'Active Key';

    resultBox.innerHTML = '<div class="space-y-3">' +
      '<!-- Failover & Key Info Banner -->' +
      '<div class="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-[11px]">' +
        '<span class="text-emerald-800 font-medium flex items-center gap-1.5">' +
          '<span>🛡️</span> <b>Đã phục vụ bởi:</b> <span class="font-bold font-mono">' + providerTag + '</span> (Key: <span class="font-mono">' + keyTag + '</span>)' +
        '</span>' +
        '<span class="text-emerald-700 text-[10px] font-bold">● Thông suốt (0 gián đoạn)</span>' +
      '</div>' +

      '<!-- Phân tích nhu cầu khách -->' +
      '<div class="space-y-1">' +
        '<div class="text-[11px] uppercase font-bold text-stone-500 tracking-wider flex items-center gap-1">' +
          '<span>🔍</span> 1. AI Bóc Tách Nhu Cầu Khách Hàng (Tọa Độ Google Maps):' +
        '</div>' +
        '<div class="p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 grid grid-cols-1 sm:grid-cols-3 gap-2">' +
          '<div>• <b>Mục đích:</b> <span class="capitalize text-amber-700 font-bold">' + intentDisplay + '</span></div>' +
          '<div>• <b>Toà/Khu hỏi:</b> <span class="font-bold text-indigo-700">' + escapeHtml(locationDisplay) + '</span></div>' +
          '<div>• <b>Ngân sách:</b> <span class="font-bold text-emerald-700">' + escapeHtml(budgetDisplay) + '</span></div>' +
        '</div>' +
      '</div>' +

      '<!-- Căn khớp nhất -->' +
      '<div class="space-y-1">' +
        '<div class="text-[11px] uppercase font-bold text-stone-500 tracking-wider flex items-center gap-1">' +
          '<span>🎯</span> 2. Đối Chiếu Kho Căn Sẵn Có & Tọa Độ GPS Haversine:' +
        '</div>' +
        matchHtml +
      '</div>' +

      '<!-- Lời bình luận tự động AI -->' +
      '<div class="space-y-1">' +
        '<div class="text-[11px] uppercase font-bold text-stone-500 tracking-wider flex items-center gap-1">' +
          '<span>💬</span> 3. Lời Bình Luận AI Sẽ Tự Động Đăng Vào Bài Khách:' +
        '</div>' +
        '<div class="p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 text-stone-900 text-xs font-medium leading-relaxed relative">' +
          '<p class="whitespace-pre-line">' + escapeHtml(aiComment) + '</p>' +
          '<div class="mt-2 pt-2 border-t border-amber-200/60 flex items-center justify-between text-[10px] text-stone-500">' +
            '<span>✨ Bình luận tự nhiên, lịch sự, thuyết phục, dẫn chứng khoảng cách đi bộ thực tế.</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  } catch (err) {
    resultBox.innerHTML = '<div class="text-red-700">❌ Lỗi kết nối: ' + escapeHtml(err.message) + '</div>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🚀</span> <span>Chạy Thử AI</span>';
  }
}
