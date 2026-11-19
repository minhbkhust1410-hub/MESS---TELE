import {
  detectProviderFromKey,
  maskApiKey,
  createDefaultLearningMemory,
  classifyFacebookTargetUrl,
  createDefaultMachineKnowledge,
  LEARNED_ROLE_LABELS,
} from '../core-build/shared/fb-exten-core.js';

const STORAGE_KEYS = {
  AI_KEYS: 'fb_exten_ai_keys',
  AI_CONFIG: 'fb_exten_ai_config',
  CUSTOM_RULE: 'fb_exten_custom_rule',
  HYBRID_CONFIG: 'fb_exten_hybrid_config',
  LEARNING_MEMORY: 'fb_exten_learning_memory',
  RUN_HISTORY: 'fb_exten_run_history',
  RUNNER_PREFS: 'fb_exten_runner_prefs',
  SESSION_STATE: 'fb_exten_session_state',
  PROCESSED_POSTS: 'fb_exten_processed_posts',
  MACHINE_KNOWLEDGE: 'fb_exten_machine_knowledge',
  RECORDER_DRAFT: 'fb_exten_recorder_draft',
};

const uiState = {
  activeTab: 'teach',
  currentTabId: null,
  currentTabUrl: '',
  currentAnalysis: null,
  stopPlaywrightLoop: false,
  learningMemory: createDefaultLearningMemory(),
  machineKnowledge: createDefaultMachineKnowledge(),
  recorderDraft: { active: false, startedAt: null, steps: [] },
  lastDraftReview: null,
  aiKeys: [],
  runHistory: [],
  customRule: {
    workflowName: 'Dựng Phim AI & Job AI',
    includeKeywords: ['tuyển freelancer', 'cần dựng video ai', 'job ai', 'job phim ai', 'hỏi tool', 'workflow', 'đồ án', 'tìm team'],
    excludeKeywords: ['bán acc', 'cấp tài khoản', 'khai giảng khóa', 'tuyển học viên', 'seeding'],
    replyTemplate: 'Chỗ này chỉ cần chỉnh nhẹ bước khóa keyframe đầu vào là khác bọt hẳn đó bác. Còn 1 mẹo nhỏ nữa nói đây hơi dài, bác muốn tìm hiểu thêm thì nhắn em chỉ nhanh cho nhé!',
    aiSystemPrompt: 'Phong thái cao thủ làm nghề AI/dựng phim AI: chỉ hé lộ 20-30% ý chuyên môn mấu chốt (không hướng dẫn hết bài), chốt 1 vế gợi mở tò mò/FOMO để họ tự muốn nhắn tin hỏi thêm, tối đa 2 câu, không spam link.',
  },
};

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(message, level = 'ok') {
  if ($('status-msg')) $('status-msg').textContent = message;
  const dot = $('status-dot');
  if (dot) {
    dot.className = 'dot' + (level === 'warn' ? ' warn' : level === 'err' ? ' err' : '');
  }
}

function renderRunnerStats(stats) {
  if (!stats) return;
  if ($('stat-scanned') && typeof stats.scanned === 'number') $('stat-scanned').textContent = String(stats.scanned);
  if ($('stat-loved') && typeof stats.loved === 'number') $('stat-loved').textContent = String(stats.loved);
  if ($('stat-commented') && typeof stats.commented === 'number') $('stat-commented').textContent = String(stats.commented);
  if ($('stat-skipped') && typeof stats.skippedSeller === 'number') $('stat-skipped').textContent = String(stats.skippedSeller);
}

function appendLog(text, level = 'info') {
  const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
  const cls = `log-line ${level === 'ok' ? 'ok' : level === 'warn' ? 'warn' : level === 'err' ? 'err' : ''}`;

  const pushTo = (boxId, maxItems) => {
    const box = $(boxId);
    if (!box) return;
    const line = document.createElement('div');
    line.className = cls;
    line.textContent = `[${time}] ${text}`;
    box.prepend(line);
    while (box.children.length > maxItems) {
      box.removeChild(box.lastChild);
    }
  };

  pushTo('activity-log', 120);
  pushTo('mini-live-log', 15);
}

function switchTab(tabName) {
  uiState.activeTab = tabName;
  document.querySelectorAll('.nav-tab').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `panel-${tabName}`);
  });
  if (tabName === 'learning') refreshMetaAiStatus();
}

async function getActiveFacebookTab({ createIfMissingUrl = '' } = {}) {
  const isSocialUrl = (u) => /(facebook|messenger)\.com/i.test(u || '');
  let activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  let tab = activeTabs.find((t) => isSocialUrl(t.url));

  if (!tab) {
    const curWinTabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    tab = curWinTabs.find((t) => isSocialUrl(t.url)) || null;
  }

  if (!tab) {
    const allFbTabs = await chrome.tabs.query({ url: ['https://*.facebook.com/*', 'https://*.messenger.com/*'] }).catch(() => []);
    tab = allFbTabs.find((t) => t.active) || allFbTabs[0] || null;
  }

  if (!tab && createIfMissingUrl) {
    tab = await chrome.tabs.create({ url: createIfMissingUrl, active: true });
    await waitForTabLoad(tab.id, 15000);
  }

  if (!tab || !tab.id) {
    uiState.currentTabId = null;
    uiState.currentTabUrl = '';
    if ($('tab-status-text')) $('tab-status-text').textContent = 'Chưa thấy tab facebook.com';
    return null;
  }

  uiState.currentTabId = tab.id;
  uiState.currentTabUrl = tab.url || '';

  const classified = classifyFacebookTargetUrl(uiState.currentTabUrl, true);
  const kindLabel =
    classified.kind === 'group_feed'
      ? `Group Tổng (${classified.groupId})`
      : classified.kind === 'post'
        ? 'Bài viết Facebook'
        : tab.title
          ? tab.title.slice(0, 34)
          : 'Facebook Live';

  if ($('tab-status-text')) $('tab-status-text').textContent = kindLabel;
  return tab;
}

async function sendToTab(tabId, type, payload = {}) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type, payload });
  } catch {
    await chrome.runtime.sendMessage({ type: 'ENSURE_AGENT_READY', tabId }).catch(() => {});
    return await chrome.tabs.sendMessage(tabId, { type, payload });
  }
}

function waitForTabLoad(tabId, timeoutMs = 25000) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(false);
      }
    }, timeoutMs);

    const listener = (updatedId, info) => {
      if (updatedId === tabId && info.status === 'complete') {
        if (!done) {
          done = true;
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(true);
        }
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function renderSessionState(session) {
  const pill = $('session-pill');
  const box = $('session-status-box');
  const reloadBtn = $('btn-reload-ext');
  if (!pill || !box) return;

  if (!session || !session.loggedIn) {
    pill.textContent = 'FB: Chưa login';
    pill.className = 'badge-mono warn';
    box.innerHTML = '<span class="text-amber">🟡 Chưa phát hiện cookie đăng nhập Facebook (c_user + xs) trên Chrome.</span>';
  } else {
    const shortUid = session.uid.length > 8 ? `...${session.uid.slice(-6)}` : session.uid;
    pill.textContent = `FB: ${shortUid}`;
    pill.title = `UID Facebook trên Chrome: ${session.uid} (${session.cookiesCount || 0} cookies)`;
    pill.className = 'badge-mono ok';

    const syncTime = session.lastSyncedAt
      ? new Date(session.lastSyncedAt).toLocaleTimeString('vi-VN', { hour12: false })
      : 'Chưa đẩy Server';
    const syncBadge = session.serverSyncedOk
      ? '<span class="text-emerald">🟢 Đã đồng bộ Server/Playwright</span>'
      : '<span class="text-amber">🟡 Chỉ lưu trên Chrome (Server offline)</span>';
    box.innerHTML =
      `UID: <strong>${escapeHtml(session.uid)}</strong> (${session.cookiesCount || 0} cookies)<br/>` +
      `Trạng thái: ${syncBadge} • Lúc: <code>${escapeHtml(syncTime)}</code>` +
      (session.updateAvailable ? '<br/><span class="text-amber">⟳ Có bản build Extension mới trên Server!</span>' : '');
  }

  if (reloadBtn) {
    reloadBtn.classList.toggle('hidden', !session?.updateAvailable);
  }
}

async function saveHybridConfig() {
  const serverUrl = $('input-server-url')?.value.trim() || 'http://127.0.0.1:3300';
  const autoSyncSession = $('chk-auto-sync-session') ? $('chk-auto-sync-session').checked : true;
  const autoReloadExt = $('chk-auto-reload-ext') ? $('chk-auto-reload-ext').checked : false;
  await chrome.storage.local.set({
    [STORAGE_KEYS.HYBRID_CONFIG]: { serverUrl, autoSyncSession, autoReloadExt },
  });
}

async function saveRunnerPrefs() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.RUNNER_PREFS]: {
      mode: $('select-thread-mode').value,
      maxPosts: Number($('input-max-posts')?.value) || 8,
      minDelay: Number($('input-min-delay')?.value) || 8,
      maxDelay: Number($('input-max-delay')?.value) || 18,
      sortNewest: $('chk-sort-newest') ? $('chk-sort-newest').checked : true,
      skipProcessed: $('chk-skip-processed') ? $('chk-skip-processed').checked : true,
      allowEnterToSend: $('chk-enter-to-send') ? $('chk-enter-to-send').checked : true,
      naturalGoal: $('input-natural-goal')?.value || '',
      targetLinksText: $('input-target-links')?.value || '',
    },
  });
}

async function loadSavedState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.AI_KEYS,
    STORAGE_KEYS.AI_CONFIG,
    STORAGE_KEYS.CUSTOM_RULE,
    STORAGE_KEYS.HYBRID_CONFIG,
    STORAGE_KEYS.LEARNING_MEMORY,
    STORAGE_KEYS.RUN_HISTORY,
    STORAGE_KEYS.RUNNER_PREFS,
    STORAGE_KEYS.SESSION_STATE,
  ]);

  if (Array.isArray(stored[STORAGE_KEYS.AI_KEYS])) uiState.aiKeys = stored[STORAGE_KEYS.AI_KEYS];
  if (stored[STORAGE_KEYS.AI_CONFIG]) {
    const cfg = stored[STORAGE_KEYS.AI_CONFIG];
    if (cfg.preferredProvider && $('select-ai-provider')) $('select-ai-provider').value = cfg.preferredProvider;
    if (cfg.brainSource && $('select-ai-brain')) $('select-ai-brain').value = cfg.brainSource;
    if (typeof cfg.metaAiUrl === 'string' && $('input-meta-ai-url')) $('input-meta-ai-url').value = cfg.metaAiUrl;
  }
  if (stored[STORAGE_KEYS.CUSTOM_RULE]) {
    uiState.customRule = { ...uiState.customRule, ...stored[STORAGE_KEYS.CUSTOM_RULE] };
  }
  if (stored[STORAGE_KEYS.LEARNING_MEMORY]) uiState.learningMemory = stored[STORAGE_KEYS.LEARNING_MEMORY];
  if (Array.isArray(stored[STORAGE_KEYS.RUN_HISTORY])) uiState.runHistory = stored[STORAGE_KEYS.RUN_HISTORY];

  if (stored[STORAGE_KEYS.HYBRID_CONFIG]) {
    const h = stored[STORAGE_KEYS.HYBRID_CONFIG];
    if (h.serverUrl) $('input-server-url').value = h.serverUrl;
    if ($('chk-auto-sync-session')) $('chk-auto-sync-session').checked = h.autoSyncSession !== false;
    if ($('chk-auto-reload-ext')) $('chk-auto-reload-ext').checked = Boolean(h.autoReloadExt);
  }

  if (stored[STORAGE_KEYS.RUNNER_PREFS]) {
    const p = stored[STORAGE_KEYS.RUNNER_PREFS];
    const allowedModes = new Set(['auto', 'ai_job', 'ai_film', 'ai_edu', 'custom']);
    if (p.mode) $('select-thread-mode').value = allowedModes.has(p.mode) ? p.mode : 'auto';
    if (p.maxPosts && $('input-max-posts')) $('input-max-posts').value = p.maxPosts;
    if (p.minDelay && $('input-min-delay')) $('input-min-delay').value = p.minDelay;
    if (p.maxDelay && $('input-max-delay')) $('input-max-delay').value = p.maxDelay;
    if (typeof p.sortNewest === 'boolean' && $('chk-sort-newest')) $('chk-sort-newest').checked = p.sortNewest;
    if (typeof p.skipProcessed === 'boolean' && $('chk-skip-processed')) $('chk-skip-processed').checked = p.skipProcessed;
    if (typeof p.allowEnterToSend === 'boolean' && $('chk-enter-to-send')) $('chk-enter-to-send').checked = p.allowEnterToSend;
    if (typeof p.naturalGoal === 'string' && $('input-natural-goal')) $('input-natural-goal').value = p.naturalGoal;
    if (typeof p.targetLinksText === 'string' && p.targetLinksText && $('input-target-links')) {
      $('input-target-links').value = p.targetLinksText;
    }
  }

  renderSessionState(stored[STORAGE_KEYS.SESSION_STATE] || null);

  try {
    const hasDbg = await chrome.permissions.contains({ permissions: ['debugger'] });
    $('chk-use-cdp').checked = hasDbg;
  } catch {}

  $('input-rule-name').value = uiState.customRule.workflowName || '';
  $('input-rule-include').value = (uiState.customRule.includeKeywords || []).join(', ');
  $('input-rule-exclude').value = (uiState.customRule.excludeKeywords || []).join(', ');
  $('input-rule-template').value = uiState.customRule.replyTemplate || '';
  $('input-rule-prompt').value = uiState.customRule.aiSystemPrompt || '';

  renderAiKeys();
  renderLearningMemory();
  renderHistory();
}

function renderAiKeys() {
  const listEl = $('ai-keys-list');
  if (uiState.aiKeys.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Chưa có API Key (AI chạy bằng bộ luật Offline + Tự học).</div>';
    return;
  }

  listEl.innerHTML = uiState.aiKeys
    .map((k) => {
      const badgeColor =
        k.status === 'active' ? '#34d399' : k.status === 'rate_limited' ? '#fbbf24' : '#fb7185';
      return `
        <div class="key-item">
          <div>
            <strong>${escapeHtml(k.provider.toUpperCase())}</strong>
            <span>${escapeHtml(k.maskedKey)}</span>
            <span style="color:${badgeColor};margin-left:6px;">(${escapeHtml(k.status)})</span>
          </div>
          <div>
            <button class="mini-btn btn-reset-key" data-id="${escapeHtml(k.id)}">Reset</button>
            <button class="mini-btn btn-del-key" data-id="${escapeHtml(k.id)}">Xóa</button>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.querySelectorAll('.btn-del-key').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      uiState.aiKeys = uiState.aiKeys.filter((k) => k.id !== id);
      await chrome.storage.local.set({ [STORAGE_KEYS.AI_KEYS]: uiState.aiKeys });
      renderAiKeys();
    });
  });

  listEl.querySelectorAll('.btn-reset-key').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      uiState.aiKeys = uiState.aiKeys.map((k) =>
        k.id === id ? { ...k, status: 'active', cooldownUntil: undefined, lastError: undefined } : k
      );
      await chrome.storage.local.set({ [STORAGE_KEYS.AI_KEYS]: uiState.aiKeys });
      renderAiKeys();
    });
  });
}

function renderLearningMemory() {
  const mem = uiState.learningMemory || createDefaultLearningMemory();
  $('mem-total-analyzed').textContent = String(mem.totalAnalyzed || 0);
  $('mem-buyer-cnt').textContent = String((mem.learnedBuyerSignals || []).length);
  $('mem-seller-cnt').textContent = String((mem.learnedSellerSignals || []).length);

  const renderTags = (containerId, list, cls, keyField) => {
    const box = $(containerId);
    if (!list || list.length === 0) {
      box.innerHTML = '<span style="color:#64748b;font-size:11px;">AI sẽ tự ghi nhận khi đọc bài trong Group...</span>';
      return;
    }
    box.innerHTML = list
      .map(
        (sig) =>
          `<span class="tag-chip ${cls}">${escapeHtml(sig)} <button class="btn-rm-sig" data-field="${keyField}" data-sig="${escapeHtml(sig)}">×</button></span>`
      )
      .join('');

    box.querySelectorAll('.btn-rm-sig').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const field = btn.getAttribute('data-field');
        const sig = btn.getAttribute('data-sig');
        uiState.learningMemory[field] = (uiState.learningMemory[field] || []).filter((s) => s !== sig);
        await chrome.storage.local.set({ [STORAGE_KEYS.LEARNING_MEMORY]: uiState.learningMemory });
        renderLearningMemory();
      });
    });
  };

  renderTags('mem-seller-tags', mem.learnedSellerSignals, 'seller', 'learnedSellerSignals');
  renderTags('mem-buyer-tags', mem.learnedBuyerSignals, 'buyer', 'learnedBuyerSignals');

  const lessonsBox = $('mem-lessons-list');
  if (!mem.recentLessons || mem.recentLessons.length === 0) {
    lessonsBox.innerHTML = '<div class="empty-state">Chưa có bài học nào được ghi nhận.</div>';
  } else {
    lessonsBox.innerHTML = mem.recentLessons
      .slice(0, 12)
      .map(
        (l) => `<div class="log-line ok">[${escapeHtml(l.mode)}] ${escapeHtml(l.postType)}: ${escapeHtml(l.summary)}</div>`
      )
      .join('');
  }
}

function renderHistory() {
  const box = $('history-list');
  if (!uiState.runHistory || uiState.runHistory.length === 0) {
    box.innerHTML = '<div class="empty-state">Chưa có bài viết/group nào được xử lý.</div>';
    return;
  }

  box.innerHTML = uiState.runHistory
    .slice(0, 30)
    .map(
      (h) => `
      <div class="result-item">
        <div class="result-head">
          <span class="result-name">${escapeHtml(h.postAuthor ? `${h.postAuthor} — ${h.postType || ''}` : h.postType || 'Bài viết Facebook')}</span>
          <span class="result-badge ${h.status === 'success' ? 'buyer' : h.status === 'skipped' ? '' : 'seller'}">${escapeHtml(h.modeUsed || h.status)}</span>
        </div>
        <div class="result-meta">${escapeHtml(h.summary)}</div>
        <div class="result-meta" style="font-size:10px;opacity:0.7;">${escapeHtml(h.url)}</div>
      </div>
    `
    )
    .join('');
}

async function teachAiRole(text, role, need, goodReply = '') {
  const res = await chrome.runtime.sendMessage({
    type: 'TEACH_AI',
    payload: { text, role, need, goodReply },
  });
  if (res?.ok && res.data?.memory) {
    uiState.learningMemory = res.data.memory;
    renderLearningMemory();
    setStatus(`Đã dạy AI ghi nhớ mẫu "${role === 'seller' ? 'Người bán (bỏ qua)' : 'Khách có nhu cầu'}"!`, 'ok');
    appendLog(`Dạy AI: "${text.slice(0, 35)}..." -> ${role}`, 'ok');
  }
}

function renderAnalysisResult(analysis) {
  uiState.currentAnalysis = analysis;
  $('analysis-card').classList.remove('hidden');
  $('badge-analysis-engine').textContent =
    analysis.engine === 'ai' ? `AI (${analysis.aiProvider || 'Auto'}) • ${analysis.modeUsed}` : `Offline Rule • ${analysis.modeUsed}`;

  const roleBadge =
    analysis.postAuthorRole === 'seller'
      ? '<span class="result-badge seller">🚫 NGƯỜI BÁN (Bỏ qua)</span>'
      : analysis.postAuthorRole === 'buyer'
        ? '<span class="result-badge buyer">🟢 NGƯỜI HỎI / CÓ NHU CẦU</span>'
        : '<span class="result-badge">⚪ THẢO LUẬN</span>';

  const postBox = $('post-analysis-box');
  postBox.innerHTML = `
    <div class="result-head">
      <strong>📌 ${escapeHtml(analysis.postType)}</strong>
      ${roleBadge}
    </div>
    <div class="result-meta"><strong>Chủ topic (${escapeHtml(analysis.postAuthor)}):</strong> ${escapeHtml(analysis.postAuthorNeed)}</div>
    <div class="result-meta"><strong>Tóm tắt:</strong> ${escapeHtml(analysis.topicSummary)}</div>
    ${
      analysis.shouldCommentPost
        ? `
          <label class="field">
            <span>Câu bình luận gợi ý cho bài viết:</span>
            <textarea id="txt-post-suggested-reply" rows="2">${escapeHtml(analysis.suggestedPostComment)}</textarea>
          </label>
          <div class="result-actions">
            <button id="btn-exec-post-only" class="mini-btn emerald">❤️ + 💬 Thả Tim &amp; Bình Luận Bài Này</button>
            <button id="btn-teach-post-seller" class="mini-btn">🚫 Dạy AI: Người Bán</button>
          </div>
        `
        : `
          <div class="result-meta text-danger">⛔ ${escapeHtml(analysis.postSkipReason || 'Bỏ qua bài chính.')}</div>
          <div class="result-actions">
            <button id="btn-teach-post-buyer" class="mini-btn">👍 Dạy AI: Người Hỏi</button>
          </div>
        `
    }
    <div class="result-meta text-emerald" style="font-size:10.5px;">🧠 Tự học: ${escapeHtml(analysis.learnedLesson)}</div>
  `;

  if ($('btn-exec-post-only')) {
    $('btn-exec-post-only').addEventListener('click', async () => {
      const tab = await getActiveFacebookTab();
      if (!tab) return;
      const customText = $('txt-post-suggested-reply').value.trim();
      const res = await sendToTab(tab.id, 'EXECUTE_THREAD_ACTIONS', {
        analysis,
        allowEnterToSend: $('chk-enter-to-send')?.checked ?? true,
        doLove: $('chk-do-love').checked,
        doCommentPost: true,
        doReplyBuyers: false,
        useCdp: $('chk-use-cdp').checked,
        onlyTarget: { kind: 'post', text: customText },
      });
      setStatus(res?.ok ? 'Đã thả tim & bình luận bài viết!' : `Lỗi: ${res?.error}`, res?.ok ? 'ok' : 'err');
    });
  }

  $('btn-teach-post-seller')?.addEventListener('click', () => teachAiRole(analysis.topicSummary, 'seller', 'Chủ bài là người bán'));
  $('btn-teach-post-buyer')?.addEventListener('click', () => teachAiRole(analysis.topicSummary, 'buyer', 'Chủ bài có nhu cầu'));

  const cmts = analysis.commentEvaluations || [];
  const buyers = cmts.filter((c) => c.shouldEngage && c.role !== 'seller');
  const sellers = cmts.filter((c) => c.role === 'seller');
  $('cmt-total-cnt').textContent = String(cmts.length);
  $('cmt-buyer-cnt').textContent = String(buyers.length);
  $('cmt-seller-cnt').textContent = String(sellers.length);

  const cmtListEl = $('comments-eval-list');
  if (cmts.length === 0) {
    cmtListEl.innerHTML = '<div class="empty-state">Chưa phát hiện bình luận nào hiển thị trong bài viết này.</div>';
    return;
  }

  cmtListEl.innerHTML = cmts
    .map((c) => {
      const cls = c.role === 'seller' ? 'is-seller' : c.shouldEngage ? 'is-buyer' : '';
      const badge =
        c.role === 'seller'
          ? '<span class="result-badge seller">🚫 NGƯỜI BÁN (BỎ QUA)</span>'
          : c.shouldEngage
            ? `<span class="result-badge buyer">🟢 KHÁCH (${c.confidence}%)</span>`
            : '<span class="result-badge">⚪ CHUNG</span>';

      return `
        <div class="result-item ${cls}" data-cmt-idx="${c.index}">
          <div class="result-head">
            <span class="result-name">${escapeHtml(c.author)}</span>
            ${badge}
          </div>
          <div class="result-meta">"${escapeHtml(c.text.slice(0, 180))}"</div>
          <div class="result-meta text-emerald">Nhu cầu: ${escapeHtml(c.need || c.skipReason || '')}</div>
          ${
            c.role !== 'seller'
              ? `
                <textarea class="txt-cmt-reply" data-idx="${c.index}" rows="2">${escapeHtml(c.suggestedReply || uiState.customRule.replyTemplate)}</textarea>
                <div class="result-actions">
                  <button class="mini-btn emerald btn-send-cmt" data-idx="${c.index}">❤️ + ↩️ Thả Tim &amp; Trả Lời</button>
                  <button class="mini-btn btn-teach-cmt-seller" data-idx="${c.index}">🚫 Dạy AI: Sale</button>
                </div>
              `
              : `
                <div class="result-actions">
                  <button class="mini-btn btn-teach-cmt-buyer" data-idx="${c.index}">👍 Sửa lại: Khách hỏi</button>
                </div>
              `
          }
        </div>
      `;
    })
    .join('');

  cmtListEl.querySelectorAll('.btn-send-cmt').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cIdx = Number(btn.getAttribute('data-idx'));
      const textarea = cmtListEl.querySelector(`.txt-cmt-reply[data-idx="${cIdx}"]`);
      const text = textarea ? textarea.value.trim() : '';
      const tab = await getActiveFacebookTab();
      if (!tab || !text) return;

      const res = await sendToTab(tab.id, 'EXECUTE_THREAD_ACTIONS', {
        analysis,
        doLove: $('chk-do-love').checked,
        doCommentPost: false,
        doReplyBuyers: true,
        useCdp: $('chk-use-cdp').checked,
        onlyTarget: { kind: 'comment', index: cIdx, text },
      });
      if (res?.ok) {
        setStatus(`Đã thả tim & trả lời bình luận của khách #${cIdx + 1}!`, 'ok');
      } else {
        setStatus(`Lỗi trả lời bình luận: ${res?.error}`, 'err');
      }
    });
  });

  cmtListEl.querySelectorAll('.btn-teach-cmt-seller').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cIdx = Number(btn.getAttribute('data-idx'));
      const cmt = cmts.find((x) => x.index === cIdx);
      if (cmt) await teachAiRole(cmt.text, 'seller', 'Người bán hàng');
    });
  });

  cmtListEl.querySelectorAll('.btn-teach-cmt-buyer').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cIdx = Number(btn.getAttribute('data-idx'));
      const cmt = cmts.find((x) => x.index === cIdx);
      if (cmt) await teachAiRole(cmt.text, 'buyer', 'Khách hỏi có nhu cầu', uiState.customRule.replyTemplate);
    });
  });
}

async function getTargetLinksFromInput() {
  const raw = ($('input-target-links').value || '')
    .split(/[\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => /facebook\.com/i.test(s));

  if (raw.length > 0) return raw;

  const tab = await getActiveFacebookTab();
  if (tab && /facebook\.com/i.test(tab.url || '')) {
    $('input-target-links').value = tab.url;
    return [tab.url];
  }
  return [];
}

function bindEvents() {
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  $('btn-refresh-tab').addEventListener('click', async () => {
    const tab = await getActiveFacebookTab();
    if (tab) {
      await chrome.runtime.sendMessage({ type: 'ENSURE_AGENT_READY', tabId: tab.id }).catch(() => {});
      setStatus(`Đã kết nối lại tab: ${tab.title?.slice(0, 40) || tab.url}`, 'ok');
    } else {
      setStatus('Chưa mở tab facebook.com nào trên Chrome.', 'warn');
    }
  });

  $('btn-toggle-pill').addEventListener('click', async () => {
    const tab = await getActiveFacebookTab();
    if (tab) await sendToTab(tab.id, 'TOGGLE_PILL');
  });

  $('btn-grab-current-url').addEventListener('click', async () => {
    const tab = await getActiveFacebookTab();
    if (!tab || !/facebook\.com/i.test(tab.url || '')) {
      setStatus('Hãy mở một Group hoặc Bài viết trên tab Facebook trước!', 'warn');
      return;
    }
    $('input-target-links').value = tab.url;
    await saveRunnerPrefs();
    setStatus('Đã lấy link từ tab Facebook hiện tại.', 'ok');
  });

  ['select-thread-mode', 'input-natural-goal', 'input-max-posts', 'input-min-delay', 'input-max-delay', 'chk-sort-newest', 'chk-skip-processed', 'input-target-links'].forEach(
    (id) => {
      $(id)?.addEventListener('change', saveRunnerPrefs);
    }
  );

  $('chk-use-cdp').addEventListener('change', async () => {
    if ($('chk-use-cdp').checked) {
      const granted = await chrome.permissions.request({ permissions: ['debugger'] });
      if (!granted) {
        $('chk-use-cdp').checked = false;
        setStatus('Bạn chưa cấp quyền debugger cho CDP Real Input.', 'warn');
      } else {
        setStatus('Đã bật CDP Real Input.', 'ok');
      }
    } else if (uiState.currentTabId) {
      await chrome.runtime.sendMessage({ type: 'CDP_DETACH', tabId: uiState.currentTabId }).catch(() => {});
    }
  });

  $('btn-test-f12').addEventListener('click', async () => {
    const engine = $('select-exec-engine').value;
    const links = await getTargetLinksFromInput();

    if (engine === 'playwright') {
      if (links.length === 0) {
        setStatus('Vui lòng dán 1 link bài viết để test Playwright F12!', 'warn');
        return;
      }
      setStatus('🎭 Đang mở tab Playwright trên màn hình & soi khung F12...', 'ok');
      const serverUrl = $('input-server-url').value.trim() || 'http://127.0.0.1:3300';
      const res = await chrome.runtime.sendMessage({
        type: 'PLAYWRIGHT_RUN_LINK',
        serverUrl,
        payload: {
          url: links[0],
          mode: $('select-thread-mode').value,
          customRule: uiState.customRule,
          dryRunOnly: true,
        },
      });
      if (!res?.ok) {
        setStatus(`Lỗi Playwright F12: ${res?.error}`, 'err');
        return;
      }
      const box = $('f12-inspect-box');
      box.classList.remove('hidden');
      box.innerHTML =
        `<strong>🎭 [Playwright F12 Dry-Run]</strong> (${res.data.f12Targets.length} mục tiêu):<br/>` +
        res.data.f12Targets.map((t) => `• <strong>${escapeHtml(t.label)}:</strong> <code>${escapeHtml(t.selector)}</code>`).join('<br/>');
      if (res.data.analysis) renderAnalysisResult(res.data.analysis);
      setStatus('Đã khoanh khung F12 trên cửa sổ Playwright!', 'ok');
      return;
    }

    const tab = await getActiveFacebookTab();
    if (!tab || !/facebook\.com/i.test(tab.url || '')) {
      setStatus('Hãy mở một Group hoặc bài viết trên tab Facebook để test soi ô F12!', 'warn');
      return;
    }

    const res = await sendToTab(tab.id, 'TEST_F12_TARGETS');
    if (!res?.ok || !res.data) {
      setStatus(`Lỗi soi F12: ${res?.error || 'Không đọc được DOM'}`, 'err');
      return;
    }
    const box = $('f12-inspect-box');
    box.classList.remove('hidden');
    box.innerHTML =
      `<strong>🎯 [F12 Inspector]</strong> Nguồn: <code>${escapeHtml(res.data.rootKind)}</code> | Bình luận: ${res.data.totalCommentsVisible}<br/>` +
      res.data.targets.map((t) => `• <strong>${escapeHtml(t.label)}:</strong> <code>${escapeHtml(t.selector)}</code>`).join('<br/>');
    setStatus('Đã khoanh khung F12 trực tiếp trên màn hình Facebook!', 'ok');
    appendLog(`Soi F12 (${res.data.rootKind}): ${res.data.targets.length} mục tiêu`, 'ok');
  });

  $('btn-test-vision')?.addEventListener('click', async () => {
    const tab = await getActiveFacebookTab();
    if (!tab || !/facebook\.com/i.test(tab.url || '')) {
      setStatus('Hãy mở tab Facebook trước khi chạy Vision Soi!', 'warn');
      return;
    }

    const goalDescription =
      $('input-natural-goal')?.value.trim() ||
      'Ô nhập bình luận hoặc nút Thích của bài viết chính';
    setStatus('📸 Đang gắn nhãn Set-of-Mark & nhờ Vision AI soi...', 'ok');

    const res = await sendToTab(tab.id, 'TEST_VISION_SOM', { goalDescription });
    if (!res?.ok || !res.data) {
      setStatus(`Vision AI chưa soi được: ${res?.error || 'Kiểm tra API Key'}`, 'err');
      return;
    }

    const box = $('f12-inspect-box');
    box.classList.remove('hidden');
    if (res.data.found) {
      box.innerHTML =
        `<strong>📸 [Vision + Set-of-Mark]</strong> Đã tìm thấy:<br/><code>${escapeHtml(res.data.selector)}</code>`;
      setStatus('Vision AI đã khoanh đúng mục tiêu!', 'ok');
      appendLog(`Vision SoM OK: ${res.data.selector}`, 'ok');
    } else {
      box.innerHTML = '<strong>📸 [Vision + Set-of-Mark]</strong> Chưa xác định được ô mục tiêu (hãy nạp Key Gemini/OpenRouter ở tab AI).';
      setStatus('Vision AI không tìm thấy ô mục tiêu.', 'warn');
    }
  });

  $('btn-copy-link-meta-ai')?.addEventListener('click', async () => {
    const tab = await getActiveFacebookTab();
    if (!tab) {
      setStatus('Hãy mở 1 tab Facebook có bài viết trước!', 'warn');
      return;
    }
    const btn = $('btn-copy-link-meta-ai');
    if (btn) btn.disabled = true;
    try {
      setStatus('🔗 Đang copy link & đọc bài viết hiện tại...', 'ok');
      const classified = classifyFacebookTargetUrl(tab.url || '', true);
      let threadInput = null;
      if (classified.kind === 'group_feed') {
        const scanRes = await sendToTab(tab.id, 'SCAN_NEXT_GROUP_POST', {
          skipPostKeys: [],
          expandComments: true,
          skipAlreadyInteracted: $('chk-skip-processed')?.checked ?? true,
        });
        if (!scanRes?.ok || !scanRes.data?.found) {
          setStatus('Chưa thấy bài mới chưa tương tác trên màn hình (hãy cuộn xuống 1 chút).', 'warn');
          return;
        }
        threadInput = scanRes.data.threadInput;
      } else {
        const readRes = await sendToTab(tab.id, 'READ_POST_AND_COMMENTS', { expandComments: true });
        if (!readRes?.ok || !readRes.data) {
          setStatus(`Không đọc được bài viết: ${readRes?.error || 'Lỗi DOM'}`, 'err');
          return;
        }
        threadInput = readRes.data;
      }

      const cleanLink = threadInput.url || tab.url || '';
      if (cleanLink) {
        await navigator.clipboard.writeText(cleanLink).catch(() => {});
      }

      setStatus('🌀 Đã copy link → đang gửi sang Tab Meta AI viết bình luận chân thực...', 'ok');
      appendLog(`🔗 Copy link → Meta AI: ${cleanLink}`, 'info');

      const aiRes = await chrome.runtime.sendMessage({
        type: 'ANALYZE_THREAD_AI',
        payload: {
          threadInput,
          mode: $('select-thread-mode').value,
          useAi: true,
          forceMetaAi: true,
          naturalGoal: $('input-natural-goal')?.value.trim() || '',
          groupUrl: tab.url || cleanLink,
        },
      });

      if (!aiRes?.ok || !aiRes.data) {
        setStatus(`Lỗi gọi Meta AI: ${aiRes?.error || 'Hãy mở tab meta.ai trước!'}`, 'err');
        return;
      }

      const { analysis, memory } = aiRes.data;
      uiState.learningMemory = memory;
      renderLearningMemory();
      renderAnalysisResult(analysis);
      setStatus(
        analysis.shouldCommentPost
          ? `✅ Meta AI đã viết xong comment mộc mạc cho "${analysis.postAuthor}" — bấm gửi ngay!`
          : `⏭ Meta AI khuyên bỏ qua bài "${analysis.postAuthor}": ${analysis.postSkipReason || 'Không phù hợp'}`,
        analysis.shouldCommentPost ? 'ok' : 'warn'
      );
      appendLog(`Meta AI (${analysis.aiProvider || 'Tab'}): ${analysis.suggestedPostComment || analysis.postSkipReason || 'Xong'}`, 'ok');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $('btn-analyze-preview').addEventListener('click', async () => {
    const links = await getTargetLinksFromInput();
    if (links.length === 0) {
      setStatus('Vui lòng dán Link Group Tổng / Link Bài Viết hoặc mở tab Facebook!', 'warn');
      return;
    }

    const sortNewest = $('chk-sort-newest')?.checked ?? true;
    const classified = classifyFacebookTargetUrl(links[0], sortNewest);
    if (classified.kind === 'invalid') {
      setStatus('Link không phải URL Facebook hợp lệ.', 'err');
      return;
    }

    const tab = await getActiveFacebookTab({ createIfMissingUrl: classified.navigateUrl });
    if (!tab) return;

    const needsNav =
      classified.kind === 'group_feed'
        ? !(tab.url || '').includes(`/groups/${classified.groupId}`)
        : (tab.url || '').split('#')[0] !== classified.navigateUrl.split('#')[0];

    if (needsNav) {
      setStatus(`Đang mở ${classified.kind === 'group_feed' ? 'Group Tổng' : 'bài viết'} để đọc thử...`, 'ok');
      const wait = waitForTabLoad(tab.id, 25000);
      await chrome.tabs.update(tab.id, { url: classified.navigateUrl });
      await wait;
      await new Promise((r) => setTimeout(r, 2800));
    }

    setStatus('Đang đọc 1 bài viết & các bình luận...', 'ok');
    let threadInput = null;
    if (classified.kind === 'group_feed') {
      const scanRes = await sendToTab(tab.id, 'SCAN_NEXT_GROUP_POST', { skipPostKeys: [], expandComments: true });
      if (!scanRes?.ok || !scanRes.data?.found) {
        setStatus('Chưa thấy bài viết hiển thị trong Group (hãy cuộn xuống nhẹ rồi bấm Đọc Thử lại).', 'warn');
        return;
      }
      threadInput = scanRes.data.threadInput;
    } else {
      const readRes = await sendToTab(tab.id, 'READ_POST_AND_COMMENTS', { expandComments: true });
      if (!readRes?.ok || !readRes.data) {
        setStatus(`Không đọc được bài viết: ${readRes?.error || 'Lỗi DOM'}`, 'err');
        return;
      }
      threadInput = readRes.data;
    }

    setStatus('AI đang đọc hiểu topic & lọc người bán...', 'ok');
    const aiRes = await chrome.runtime.sendMessage({
      type: 'ANALYZE_THREAD_AI',
      payload: {
        threadInput,
        mode: $('select-thread-mode').value,
        useAi: $('chk-use-ai').checked,
        naturalGoal: $('input-natural-goal')?.value.trim() || '',
      },
    });

    if (!aiRes?.ok || !aiRes.data) {
      setStatus(`Lỗi phân tích: ${aiRes?.error}`, 'err');
      return;
    }

    const { analysis, memory } = aiRes.data;
    uiState.learningMemory = memory;
    renderLearningMemory();
    renderAnalysisResult(analysis);
    setStatus(`Đọc xong (${analysis.engine.toUpperCase()}): Tác giả "${analysis.postAuthor}" (${analysis.postAuthorRole})`, 'ok');
    appendLog(`Đọc thử "${analysis.postAuthor}" -> ${analysis.postType}`, 'ok');
  });

  $('btn-run-links').addEventListener('click', async () => {
    const links = await getTargetLinksFromInput();
    if (links.length === 0) {
      setStatus('Vui lòng dán ít nhất 1 Link Group Tổng hoặc Link Bài Viết Facebook!', 'warn');
      return;
    }

    await saveRunnerPrefs();
    const naturalGoal = $('input-natural-goal')?.value.trim() || '';
    const effectiveRule = naturalGoal
      ? {
          ...uiState.customRule,
          aiSystemPrompt: [uiState.customRule.aiSystemPrompt, `CHỈ THỊ MỤC TIÊU: ${naturalGoal}`]
            .filter(Boolean)
            .join('\n'),
        }
      : uiState.customRule;

    const engine = $('select-exec-engine').value;
    if (engine === 'playwright') {
      const serverUrl = $('input-server-url').value.trim() || 'http://127.0.0.1:3300';
      uiState.stopPlaywrightLoop = false;
      $('btn-run-links').classList.add('hidden');
      $('btn-stop-links').classList.remove('hidden');

      for (let i = 0; i < links.length; i++) {
        if (uiState.stopPlaywrightLoop) break;
        setStatus(`🎭 [${i + 1}/${links.length}] Playwright đang chạy trên màn hình...`, 'ok');
        appendLog(`Playwright chạy [${i + 1}/${links.length}]: ${links[i]}`, 'info');
        const res = await chrome.runtime.sendMessage({
          type: 'PLAYWRIGHT_RUN_LINK',
          serverUrl,
          payload: {
            url: links[i],
            mode: $('select-thread-mode').value,
            customRule: effectiveRule,
            doLove: $('chk-do-love').checked,
            doCommentPost: $('chk-do-comment-post').checked,
            doReplyBuyers: $('chk-do-reply-buyers').checked,
            dryRunOnly: false,
          },
        });
        if (res?.ok && res.data) {
          const d = res.data;
          appendLog(`✅ Playwright xong: ❤️ ${d.lovedCount} | 💬 ${d.commentedCount} | 🚫 Sale ${d.skippedSellerCount}`, 'ok');
          if (d.analysis) renderAnalysisResult(d.analysis);
        } else {
          appendLog(`❌ Playwright lỗi: ${res?.error}`, 'err');
        }
      }
      $('btn-run-links').classList.remove('hidden');
      $('btn-stop-links').classList.add('hidden');
      setStatus(uiState.stopPlaywrightLoop ? '⏹ Đã dừng Playwright.' : '🎭 Đã xong qua Playwright!', uiState.stopPlaywrightLoop ? 'warn' : 'ok');
      return;
    }

    const sortNewest = $('chk-sort-newest')?.checked ?? true;
    const firstClassified = classifyFacebookTargetUrl(links[0], sortNewest);
    try {
      const tab = await getActiveFacebookTab({
        createIfMissingUrl: firstClassified.kind !== 'invalid' ? firstClassified.navigateUrl : '',
      });

      if (!tab) {
        setStatus('Không mở được tab Facebook trên Chrome!', 'err');
        return;
      }

      // Focus tab Facebook để người dùng thấy trực tiếp Agent đang chạy
      await chrome.tabs.update(tab.id, { active: true }).catch(() => {});

      const useCdp = $('chk-use-cdp').checked;
      if (useCdp) {
        const granted = await chrome.permissions.request({ permissions: ['debugger'] });
        if (!granted) $('chk-use-cdp').checked = false;
      }

      renderRunnerStats({ scanned: 0, loved: 0, commented: 0, skippedSeller: 0 });
      $('btn-run-links').classList.add('hidden');
      $('btn-stop-links').classList.remove('hidden');
      setStatus('🚀 Đang khởi động Agent trên tab Chrome...', 'ok');
      appendLog(`Bắt đầu chạy ${links.length} link (${firstClassified.kind === 'group_feed' ? 'Group Tổng' : 'Link trực tiếp'})`, 'info');

      await chrome.runtime.sendMessage({
        type: 'RUN_LINK_QUEUE',
        payload: {
          tabId: tab.id,
          links,
          mode: $('select-thread-mode').value,
          naturalGoal,
          maxPostsPerGroup: Number($('input-max-posts')?.value) || 8,
          sortNewest,
          skipProcessed: $('chk-skip-processed')?.checked ?? true,
          useAi: $('chk-use-ai').checked,
          doLove: $('chk-do-love').checked,
          doCommentPost: $('chk-do-comment-post').checked,
          doReplyBuyers: $('chk-do-reply-buyers').checked,
          allowEnterToSend: $('chk-enter-to-send')?.checked ?? true,
          useCdp: $('chk-use-cdp').checked,
          minDelaySec: Number($('input-min-delay')?.value) || 8,
          maxDelaySec: Number($('input-max-delay')?.value) || 18,
        },
      });
    } catch (err) {
      $('btn-run-links').classList.remove('hidden');
      $('btn-stop-links').classList.add('hidden');
      const msg = err?.message || String(err);
      setStatus(`Lỗi khởi động: ${msg}`, 'err');
      appendLog(`Lỗi khởi động: ${msg}`, 'err');
    }
  });

  $('btn-stop-links').addEventListener('click', async () => {
    uiState.stopPlaywrightLoop = true;
    await chrome.runtime.sendMessage({ type: 'STOP_LINK_QUEUE' });
    $('btn-run-links').classList.remove('hidden');
    $('btn-stop-links').classList.add('hidden');
    setStatus('⏹ Đang dừng Agent...', 'warn');
  });

  $('btn-reset-memory').addEventListener('click', async () => {
    uiState.learningMemory = createDefaultLearningMemory();
    await chrome.storage.local.set({ [STORAGE_KEYS.LEARNING_MEMORY]: uiState.learningMemory });
    renderLearningMemory();
    setStatus('Đã xóa bộ nhớ Tự Học AI!', 'warn');
  });

  $('btn-add-keys').addEventListener('click', async () => {
    const raw = $('input-ai-keys').value || '';
    const fallbackProv = $('select-ai-provider').value;
    const lines = raw.split(/[\n,;]+/).map((s) => s.trim()).filter((s) => s.length > 8);
    if (lines.length === 0) {
      setStatus('Vui lòng dán ít nhất 1 API Key hợp lệ!', 'warn');
      return;
    }

    let added = 0;
    for (const apiKey of lines) {
      if (uiState.aiKeys.some((k) => k.apiKey === apiKey)) continue;
      const provider = detectProviderFromKey(apiKey, fallbackProv);
      uiState.aiKeys.push({
        id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        provider,
        apiKey,
        maskedKey: maskApiKey(apiKey),
        status: 'active',
        successCount: 0,
        failCount: 0,
      });
      added++;
    }

    const prevAiCfg = (await chrome.storage.local.get(STORAGE_KEYS.AI_CONFIG))[STORAGE_KEYS.AI_CONFIG] || {};
    await chrome.storage.local.set({
      [STORAGE_KEYS.AI_KEYS]: uiState.aiKeys,
      [STORAGE_KEYS.AI_CONFIG]: {
        ...prevAiCfg,
        preferredProvider: fallbackProv,
        cooldownSeconds: 60,
      },
    });
    $('input-ai-keys').value = '';
    renderAiKeys();
    setStatus(`Đã nạp thêm ${added} API Key AI!`, 'ok');
  });

  $('btn-test-ai').addEventListener('click', async () => {
    setStatus('Đang kiểm tra kết nối AI...', 'ok');
    const res = await chrome.runtime.sendMessage({
      type: 'CALL_AI_POOL',
      payload: {
        prompt: 'Trả lời đúng 1 câu ngắn xác nhận bạn đang hoạt động tốt.',
        preferredProvider: $('select-ai-provider').value,
      },
    });
    if (res?.ok) {
      setStatus(`AI OK (${res.data.providerUsed} - ${res.data.keyUsedMasked}): ${res.data.text}`, 'ok');
    } else {
      setStatus(`Test AI thất bại: ${res?.error}`, 'err');
    }
  });

  $('btn-save-rule').addEventListener('click', async () => {
    uiState.customRule = {
      workflowName: $('input-rule-name').value.trim() || 'Công Việc Mới',
      includeKeywords: $('input-rule-include').value.split(',').map((s) => s.trim()).filter(Boolean),
      excludeKeywords: $('input-rule-exclude').value.split(',').map((s) => s.trim()).filter(Boolean),
      replyTemplate: $('input-rule-template').value.trim(),
      aiSystemPrompt: $('input-rule-prompt').value.trim(),
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_RULE]: uiState.customRule });
    setStatus('Đã lưu cấu hình Mode Việc Mới!', 'ok');
  });

  $('btn-clear-log').addEventListener('click', () => {
    if ($('activity-log')) $('activity-log').innerHTML = '';
    if ($('mini-live-log')) $('mini-live-log').innerHTML = '';
  });

  $('btn-clear-history').addEventListener('click', async () => {
    uiState.runHistory = [];
    await chrome.storage.local.set({ [STORAGE_KEYS.RUN_HISTORY]: [] });
    renderHistory();
  });

  $('btn-reset-processed')?.addEventListener('click', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.PROCESSED_POSTS]: [] });
    setStatus('Đã xóa danh sách bài đã quét — lần chạy tới sẽ quét lại từ đầu Group!', 'ok');
    appendLog('Đã reset danh sách bài viết đã tương tác.', 'warn');
  });

  $('btn-sync-session-now')?.addEventListener('click', async () => {
    setStatus('🔄 Đang quét cookie Facebook Chrome & đồng bộ Server...', 'ok');
    await saveHybridConfig();
    const res = await chrome.runtime.sendMessage({ type: 'SYNC_SESSION_NOW' });
    if (res?.ok && res.data) {
      renderSessionState(res.data);
      if (res.data.loggedIn && res.data.serverSyncedOk) {
        setStatus(`Đã đồng bộ Session FB (${res.data.uid}) sang Server!`, 'ok');
        appendLog(`Đồng bộ Session UID ${res.data.uid} OK.`, 'ok');
      } else if (res.data.loggedIn) {
        setStatus(`Đã nhận diện Session FB (${res.data.uid}) trên Chrome (Server offline).`, 'warn');
      } else {
        setStatus('Chưa thấy nick Facebook nào đăng nhập trên Chrome!', 'warn');
      }
    } else {
      setStatus(`Lỗi đồng bộ Session: ${res?.error || 'Không rõ'}`, 'err');
    }
  });

  $('btn-reload-ext')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'RELOAD_EXTENSION' }).catch(() => {});
  });

  $('chk-auto-sync-session')?.addEventListener('change', saveHybridConfig);
  $('chk-auto-reload-ext')?.addEventListener('change', saveHybridConfig);

  $('btn-ping-server').addEventListener('click', async () => {
    const serverUrl = $('input-server-url').value.trim() || 'http://127.0.0.1:3300';
    await saveHybridConfig();
    const res = await chrome.runtime.sendMessage({ type: 'HYBRID_PING', serverUrl });
    if (res?.ok) {
      $('server-status-box').innerHTML = `<span class="text-emerald">🟢 Kết nối thành công (${escapeHtml(res.data?.service || 'FB EXTEN')})!</span>`;
    } else {
      $('server-status-box').innerHTML = `<span class="text-amber">🟡 Server offline (${escapeHtml(res?.error)}). Extension vẫn tự chạy trên Chrome.</span>`;
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'EXT_EVENT') return;
    const p = msg.payload || {};

    if (msg.event === 'LINK_QUEUE_STATUS') {
      setStatus(p.message, p.level === 'err' ? 'err' : p.level === 'warn' ? 'warn' : 'ok');
      appendLog(p.message, p.level);
      if (p.stats) renderRunnerStats(p.stats);
      if (!p.running) {
        $('btn-run-links')?.classList.remove('hidden');
        $('btn-stop-links')?.classList.add('hidden');
        $('btn-stop-workflow')?.classList.add('hidden');
      } else {
        $('btn-run-links')?.classList.add('hidden');
        $('btn-stop-links')?.classList.remove('hidden');
        $('btn-stop-workflow')?.classList.remove('hidden');
      }
    } else if (msg.event === 'THREAD_ANALYSIS_READY') {
      if (p.memory) {
        uiState.learningMemory = p.memory;
        renderLearningMemory();
      }
      if (p.analysis) {
        renderAnalysisResult(p.analysis);
      }
    } else if (msg.event === 'HISTORY_UPDATED' && Array.isArray(p.history)) {
      uiState.runHistory = p.history;
      renderHistory();
    } else if (msg.event === 'SESSION_UPDATED') {
      renderSessionState(p);
    } else if (msg.event === 'KNOWLEDGE_UPDATED' && p.knowledge) {
      uiState.machineKnowledge = p.knowledge;
      renderMachineKnowledge();
    } else if (msg.event === 'RECORDER_UPDATED') {
      uiState.recorderDraft = p;
      renderRecorderDraft();
    } else if (msg.event === 'GQL_CACHE_UPDATED') {
      if ($('badge-gql-count')) $('badge-gql-count').textContent = `📡 GQL: ${p.count || 0}`;
    } else if (msg.event === 'ACTION_LOG') {
      appendLog(p.message, p.level);
    }
  });

  bindTeachModeEvents();
}

// ============================================================================
// CHẾ ĐỘ LÀM MẪU, CHẤM MẪU F12 & THƯ VIỆN KỊCH BẢN MXH
// ============================================================================

function renderRecorderDraft() {
  const draft = uiState.recorderDraft || { active: false, steps: [] };
  const steps = Array.isArray(draft.steps) ? draft.steps : [];

  $('btn-rec-start')?.classList.toggle('hidden', Boolean(draft.active));
  $('btn-rec-stop')?.classList.toggle('hidden', !draft.active);
  const badge = $('rec-badge');
  if (badge) {
    badge.textContent = draft.active ? '🔴 ĐANG GHI...' : steps.length > 0 ? `Nháp: ${steps.length} bước` : 'Sẵn sàng';
    badge.className = draft.active ? 'badge-mono warn' : 'badge-mono ok';
  }
  if ($('rec-steps-count')) $('rec-steps-count').textContent = String(steps.length);

  const list = $('recorded-steps-list');
  if (!list) return;
  if (steps.length === 0) {
    list.innerHTML = '<div class="empty-state">Chưa ghi bước nào. Bấm "🔴 Bắt Đầu Ghi Mẫu" rồi thao tác mẫu trực tiếp trên Facebook!</div>';
    return;
  }

  list.innerHTML = steps
    .map((s, idx) => {
      const f12Meta = s.fingerprint
        ? `${s.fingerprint.semanticSelector || s.fingerprint.tag} • (${Math.round((s.fingerprint.relPos?.rx || 0) * 100)}%, ${Math.round((s.fingerprint.relPos?.ry || 0) * 100)}%)`
        : s.type === 'navigate'
          ? s.url
          : '';
      return `
        <div class="result-item">
          <div class="result-head">
            <span class="result-name">#${idx + 1} ${escapeHtml(s.label)}</span>
            <button class="mini-btn btn-del-draft-step" data-idx="${idx}" title="Xóa bước này">×</button>
          </div>
          ${f12Meta ? `<div class="result-meta" style="font-family:monospace;font-size:10px;opacity:0.8;">${escapeHtml(f12Meta.slice(0, 85))}</div>` : ''}
          ${
            s.type === 'input'
              ? `<input class="step-edit-input" data-idx="${idx}" type="text" value="${escapeHtml(s.value || '')}" placeholder="Nội dung nhập (có thể dùng {{AI}} hoặc {A|B})" />`
              : ''
          }
        </div>
      `;
    })
    .join('');

  list.querySelectorAll('.btn-del-draft-step').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.getAttribute('data-idx'));
      const nextSteps = steps.filter((_, i) => i !== idx);
      uiState.recorderDraft = { ...draft, steps: nextSteps };
      await chrome.storage.local.set({ [STORAGE_KEYS.RECORDER_DRAFT]: uiState.recorderDraft });
      renderRecorderDraft();
    });
  });

  list.querySelectorAll('.step-edit-input').forEach((inp) => {
    inp.addEventListener('change', async () => {
      const idx = Number(inp.getAttribute('data-idx'));
      if (!steps[idx]) return;
      steps[idx].value = inp.value;
      steps[idx].label = `Nhập "${inp.value.slice(0, 32)}"`;
      uiState.recorderDraft = { ...draft, steps };
      await chrome.storage.local.set({ [STORAGE_KEYS.RECORDER_DRAFT]: uiState.recorderDraft });
    });
  });
}

function renderDemoCritique(review, titleLabel = '') {
  const box = $('demo-critique-box');
  if (!box) return;
  if (!review) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  const engineTag = review.engine === 'ai' ? 'AI Coach' : 'Offline Coach';
  const listHtml = (arr) =>
    Array.isArray(arr) && arr.length > 0
      ? `<ul>${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
      : '';

  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="row-between">
      <strong>🧠 Nhận xét${titleLabel ? `: ${escapeHtml(titleLabel)}` : ''}</strong>
      <span class="result-badge buyer">⭐ ${Number(review.score) || 0}/100 • ${engineTag}</span>
    </div>
    <div>${escapeHtml(review.summary || '')}</div>
    ${review.strengths?.length ? `<div class="coach-section-title">✅ Điểm tốt</div>${listHtml(review.strengths)}` : ''}
    ${review.weaknesses?.length ? `<div class="coach-section-title warn">⚠️ Rủi ro / Chưa tối ưu</div>${listHtml(review.weaknesses)}` : ''}
    ${review.improvements?.length ? `<div class="coach-section-title info">💡 Gợi ý cải tiến thông minh</div>${listHtml(review.improvements)}` : ''}
    ${
      review.distilledStrategy
        ? `<div class="playbook-strip"><strong>🎯 Chiến lược đã rút &amp; nạp vào AI:</strong> ${escapeHtml(review.distilledStrategy)}</div>`
        : ''
    }
  `;
}

function renderStrategyCoach(strategyMemory) {
  const box = $('strategy-coach-box');
  const badge = $('coach-engine-badge');
  if (!box) return;
  if (!strategyMemory) {
    if (badge) badge.textContent = 'Chưa phân tích';
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  const engineTag = strategyMemory.engine === 'ai' ? 'AI Coach' : 'Offline Coach';
  if (badge) {
    badge.textContent = engineTag;
    badge.className = 'badge-mono ok';
  }
  const listHtml = (arr) =>
    Array.isArray(arr) && arr.length > 0
      ? `<ul>${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
      : '';

  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="coach-section-title">🧭 Đánh giá tổng thể cách làm việc</div>
    <div>${escapeHtml(strategyMemory.overallCritique || '')}</div>
    ${strategyMemory.workingPrinciples?.length ? `<div class="coach-section-title info">📌 Nguyên tắc cốt lõi (AI tự áp dụng khi chạy)</div>${listHtml(strategyMemory.workingPrinciples)}` : ''}
    ${strategyMemory.toneGuidelines ? `<div class="playbook-strip"><strong>🗣️ Giọng văn chuẩn:</strong> ${escapeHtml(strategyMemory.toneGuidelines)}</div>` : ''}
    ${strategyMemory.topRecommendations?.length ? `<div class="coach-section-title warn">🚀 Đề xuất ưu tiên ngay</div>${listHtml(strategyMemory.topRecommendations)}` : ''}
  `;
}

function renderMachineKnowledge() {
  const kb = uiState.machineKnowledge || createDefaultMachineKnowledge();
  renderStrategyCoach(kb.strategyMemory || null);
  if ($('mem-style-cnt')) $('mem-style-cnt').textContent = String((kb.learnedStyleSamples || []).length);
  if ($('mem-sent-cnt')) $('mem-sent-cnt').textContent = String((kb.recentSentComments || []).length);

  // 1. Danh sách nút F12 đã học
  const roles = Object.entries(kb.roleProfiles || {}).filter(([, arr]) => Array.isArray(arr) && arr.length > 0);
  if ($('learned-roles-count')) $('learned-roles-count').textContent = `${roles.length} nút F12`;
  const rolesBox = $('learned-roles-list');
  if (rolesBox) {
    if (roles.length === 0) {
      rolesBox.innerHTML = '<span style="color:#64748b;font-size:11px;">Chưa dạy nút F12 nào — bấm Ghi Mẫu hoặc Chấm nút để học theo máy bạn.</span>';
    } else {
      rolesBox.innerHTML = roles
        .map(([role, samples]) => {
          const title = LEARNED_ROLE_LABELS?.[role] || role;
          const latest = samples[0];
          const tip = latest?.semanticSelector || latest?.ariaLabel || latest?.text || role;
          return `<span class="tag-chip buyer" title="${escapeHtml(tip)}">${escapeHtml(title)} (${samples.length}) <button class="btn-rm-role" data-role="${escapeHtml(role)}">×</button></span>`;
        })
        .join('');

      rolesBox.querySelectorAll('.btn-rm-role').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const role = btn.getAttribute('data-role');
          const res = await chrome.runtime.sendMessage({ type: 'DELETE_LEARNED_ROLE', payload: { role } });
          if (res?.ok && res.data?.knowledge) {
            uiState.machineKnowledge = res.data.knowledge;
            renderMachineKnowledge();
          }
        });
      });
    }
  }

  // 2. Thư viện đường dẫn Groups / Trang đã học (kèm xếp hạng ROI Tier A/B/C)
  const groups = Array.isArray(kb.learnedGroups) ? kb.learnedGroups : [];
  if ($('learned-groups-count')) $('learned-groups-count').textContent = String(groups.length);
  const groupsBox = $('learned-groups-list');
  if (groupsBox) {
    if (groups.length === 0) {
      groupsBox.innerHTML = '<div class="empty-state">Bấm "📥 Dán nhiều Group", "➕ Lưu tab này" hoặc Ghi Mẫu để lưu danh sách Groups.</div>';
    } else {
      groupsBox.innerHTML = groups
        .slice(0, 60)
        .map((g) => {
          const tier = g.tier || 'B';
          const tierBadge =
            g.kind !== 'group_feed'
              ? `<span class="result-badge">${escapeHtml(g.kind.toUpperCase())}</span>`
              : tier === 'A'
                ? `<span class="result-badge buyer">🏆 Tier A (${g.roiScore ?? 70}đ)</span>`
                : tier === 'C'
                  ? `<span class="result-badge seller">⚪ Tier C (${g.roiScore ?? 20}đ)</span>`
                  : `<span class="result-badge">⚡ Tier B (${g.roiScore ?? 50}đ)</span>`;
          const statsLine =
            g.postsScanned > 0
              ? `Quét: ${g.postsScanned} | 🔥 Hot: ${g.hotLeadsFound || 0} | 💬 Cmt: ${g.commentsSent || 0} | 🚫 Sale: ${g.sellersSkipped || 0}`
              : g.url;
          const sampleCount = Array.isArray(g.sampleSnippets) ? g.sampleSnippets.length : 0;
          const pbHtml = g.playbook
            ? `<div class="playbook-strip">
                 <div><strong>🎯 Tệp:</strong> ${escapeHtml(g.playbook.audienceType)}</div>
                 <div><strong>🗣️ Văn phong:</strong> ${escapeHtml(g.playbook.recommendedTone)}</div>
                 <div><strong>💡 Mẹo:</strong> ${escapeHtml(g.playbook.conversionTip)}</div>
               </div>`
            : sampleCount > 0
              ? `<div class="result-meta" style="font-size:10px;color:#38bdf8;">📄 Đã gom ${sampleCount} mẫu bài thực tế — bấm "Phân tích tệp" để AI lập Playbook.</div>`
              : '';
          return `
          <div class="result-item">
            <div class="result-head">
              <span class="result-name">${escapeHtml(g.name || g.id)}</span>
              ${tierBadge}
            </div>
            <div class="result-meta" style="font-size:10px;opacity:0.8;">${escapeHtml(statsLine)}</div>
            ${pbHtml}
            <div class="result-actions">
              <button class="mini-btn emerald btn-analyze-group" data-id="${escapeHtml(g.id)}">🧠 ${g.playbook ? 'Cập nhật tệp' : 'Phân tích tệp'}</button>
              <button class="mini-btn btn-open-group" data-url="${escapeHtml(g.url)}">🔗 Mở</button>
              <button class="mini-btn btn-del-group" data-id="${escapeHtml(g.id)}">❌ Xóa</button>
            </div>
          </div>
        `;
        })
        .join('');

      groupsBox.querySelectorAll('.btn-analyze-group').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const groupId = btn.getAttribute('data-id');
          btn.disabled = true;
          btn.textContent = '⏳ Đang phân tích...';
          setStatus('🧠 AI đang đọc văn hóa & tệp khách hàng của Group...', 'ok');
          try {
            const tab = await getActiveFacebookTab().catch(() => null);
            const res = await chrome.runtime.sendMessage({
              type: 'AI_ANALYZE_GROUP_PLAYBOOK',
              payload: { groupId, tabId: tab?.id || null },
            });
            if (res?.ok && res.data?.knowledge) {
              uiState.machineKnowledge = res.data.knowledge;
              renderMachineKnowledge();
              const gName = res.data.group?.name || 'Group';
              setStatus(
                `✅ Đã lập Playbook tệp cho "${gName}" (${res.data.playbook?.engine === 'ai' ? 'AI' : 'Offline Coach'})!`,
                'ok'
              );
              appendLog(`Phân tích tệp Group "${gName}": ${res.data.playbook?.audienceType || ''}`, 'ok');
            } else {
              setStatus(`Lỗi phân tích Group: ${res?.error || 'Không rõ'}`, 'err');
            }
          } finally {
            btn.disabled = false;
          }
        });
      });

      groupsBox.querySelectorAll('.btn-open-group').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const url = btn.getAttribute('data-url');
          const tab = await getActiveFacebookTab({ createIfMissingUrl: url });
          if (tab && url) {
            await chrome.tabs.update(tab.id, { url, active: true });
          }
        });
      });

      groupsBox.querySelectorAll('.btn-del-group').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const res = await chrome.runtime.sendMessage({ type: 'DELETE_LEARNED_GROUP', payload: { id } });
          if (res?.ok && res.data?.knowledge) {
            uiState.machineKnowledge = res.data.knowledge;
            renderMachineKnowledge();
          }
        });
      });
    }
  }

  // 3. Kịch bản MXH đã lưu
  const workflows = Array.isArray(kb.workflows) ? kb.workflows : [];
  if ($('saved-workflows-count')) $('saved-workflows-count').textContent = String(workflows.length);
  const wfBox = $('saved-workflows-list');
  if (wfBox) {
    if (workflows.length === 0) {
      wfBox.innerHTML = '<div class="empty-state">Chưa có kịch bản nào. Hãy Ghi Mẫu thao tác của bạn rồi bấm Lưu!</div>';
    } else {
      wfBox.innerHTML = workflows
        .map((wf) => {
          const scoreBadge = wf.aiReview
            ? `<span class="result-badge buyer">⭐ AI ${wf.aiReview.score}/100</span>`
            : `<span class="result-badge">${wf.steps?.length || 0} bước • ${wf.runCount || 0}x</span>`;
          const stratLine = wf.aiReview?.distilledStrategy
            ? `<div class="playbook-strip"><strong>🧠 Chiến lược:</strong> ${escapeHtml(wf.aiReview.distilledStrategy)}</div>`
            : '';
          return `
          <div class="result-item is-buyer">
            <div class="result-head">
              <span class="result-name">⚡ ${escapeHtml(wf.name)}</span>
              ${scoreBadge}
            </div>
            <div class="result-meta">${escapeHtml(wf.description || '')}</div>
            ${stratLine}
            <div class="result-actions">
              <button class="mini-btn emerald btn-run-wf-all-groups" data-id="${escapeHtml(wf.id)}" title="AI tự tùy biến câu chữ theo Playbook từng Group">🧠 Chạy AI Theo Tệp Groups</button>
              <button class="mini-btn btn-review-wf" data-id="${escapeHtml(wf.id)}">🧠 AI Nhận Xét</button>
              <button class="mini-btn btn-run-wf-once" data-id="${escapeHtml(wf.id)}">▶ 1 lần (AI)</button>
              <button class="mini-btn btn-run-wf-exact" data-id="${escapeHtml(wf.id)}" title="Chạy đúng từng chữ bản gốc">⚙️ Y nguyên</button>
              <button class="mini-btn btn-del-wf" data-id="${escapeHtml(wf.id)}">🗑️</button>
            </div>
          </div>
        `;
        })
        .join('');

      wfBox.querySelectorAll('.btn-review-wf').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const workflowId = btn.getAttribute('data-id');
          btn.disabled = true;
          btn.textContent = '⏳ AI đọc...';
          setStatus('🧠 AI đang nhận xét mẫu làm việc & rút chiến lược tối ưu...', 'ok');
          try {
            const res = await chrome.runtime.sendMessage({
              type: 'AI_CRITIQUE_DEMO',
              payload: { workflowId },
            });
            if (res?.ok && res.data) {
              uiState.machineKnowledge = res.data.knowledge;
              renderMachineKnowledge();
              const wfObj = (res.data.knowledge.workflows || []).find((w) => w.id === workflowId);
              renderDemoCritique(res.data.review, wfObj?.name || 'Mẫu đã lưu');
              setStatus(`✅ AI đã chấm ${res.data.review.score}/100 & lưu chiến lược tối ưu!`, 'ok');
              appendLog(`AI Nhận xét "${wfObj?.name || workflowId}": ${res.data.review.score}/100`, 'ok');
            } else {
              setStatus(`Lỗi AI nhận xét: ${res?.error || 'Không rõ'}`, 'err');
            }
          } finally {
            btn.disabled = false;
          }
        });
      });

      const launchWorkflow = async (workflowId, { applyGroupUrls = [], repeatCount = 1, smartAdapt = true } = {}) => {
        const defaultUrl = applyGroupUrls[0] || 'https://www.facebook.com/';
        const tab = await getActiveFacebookTab({ createIfMissingUrl: defaultUrl });
        if (!tab) return;
        $('btn-stop-workflow')?.classList.remove('hidden');
        setStatus(
          applyGroupUrls.length > 0
            ? `🧠 Chạy AI tùy biến trên ${applyGroupUrls.length} Group theo đúng tệp từng nhóm...`
            : smartAdapt
              ? '🧠 Đang chạy mẫu với AI tự tùy biến nội dung...'
              : '⚙️ Đang chạy lại đúng y nguyên mẫu gốc...',
          'ok'
        );
        await chrome.runtime.sendMessage({
          type: 'RUN_SAVED_WORKFLOW',
          payload: {
            tabId: tab.id,
            workflowId,
            applyGroupUrls,
            repeatCount,
            smartAdapt,
            useCdp: $('chk-use-cdp')?.checked || false,
            naturalGoal: $('input-natural-goal')?.value.trim() || '',
            minDelaySec: Number($('input-min-delay')?.value) || 8,
            maxDelaySec: Number($('input-max-delay')?.value) || 18,
          },
        });
      };

      wfBox.querySelectorAll('.btn-run-wf-once').forEach((btn) => {
        btn.addEventListener('click', () => launchWorkflow(btn.getAttribute('data-id'), { repeatCount: 1, smartAdapt: true }));
      });

      wfBox.querySelectorAll('.btn-run-wf-exact').forEach((btn) => {
        btn.addEventListener('click', () => launchWorkflow(btn.getAttribute('data-id'), { repeatCount: 1, smartAdapt: false }));
      });

      wfBox.querySelectorAll('.btn-run-wf-all-groups').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const workflowId = btn.getAttribute('data-id');
          const groupUrls = (uiState.machineKnowledge?.learnedGroups || [])
            .filter((g) => g.kind === 'group_feed')
            .map((g) => g.url);
          if (groupUrls.length === 0) {
            setStatus('Chưa có đường dẫn Group nào trong Thư viện Group Đã Lưu!', 'warn');
            return;
          }
          await launchWorkflow(workflowId, { applyGroupUrls: groupUrls, smartAdapt: true });
        });
      });

      wfBox.querySelectorAll('.btn-del-wf').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const workflowId = btn.getAttribute('data-id');
          const res = await chrome.runtime.sendMessage({ type: 'DELETE_WORKFLOW', payload: { workflowId } });
          if (res?.ok && res.data?.knowledge) {
            uiState.machineKnowledge = res.data.knowledge;
            renderMachineKnowledge();
            setStatus('Đã xóa kịch bản.', 'warn');
          }
        });
      });
    }
  }

  // 4. Smart Core v4: Auto-Pilot, Ngân sách bảo vệ nick, Kho kiến thức, Blacklist & Mini-CRM
  const bc = kb.budgetConfig || {};
  const bs = kb.budgetState || {};
  const ap = kb.autoPilot || {};

  if ($('chk-autopilot-enabled')) $('chk-autopilot-enabled').checked = Boolean(ap.enabled);
  if ($('select-autopilot-interval') && ap.intervalMinutes) $('select-autopilot-interval').value = String(ap.intervalMinutes);
  if ($('input-autopilot-groups') && ap.groupsPerCycle) $('input-autopilot-groups').value = String(ap.groupsPerCycle);
  if ($('input-max-post-age') && typeof bc.maxPostAgeHours === 'number') $('input-max-post-age').value = String(bc.maxPostAgeHours);

  if ($('budget-hour-txt')) $('budget-hour-txt').textContent = `${bs.commentsThisHour || 0}/${bc.maxCommentsPerHour || 8}`;
  if ($('budget-day-txt')) $('budget-day-txt').textContent = `${bs.commentsToday || 0}/${bc.maxCommentsPerDay || 35}`;

  if ($('input-budget-hour') && bc.maxCommentsPerHour) $('input-budget-hour').value = String(bc.maxCommentsPerHour);
  if ($('input-budget-day') && bc.maxCommentsPerDay) $('input-budget-day').value = String(bc.maxCommentsPerDay);
  if ($('input-dedup-days') && typeof bc.dedupAuthorDays === 'number') $('input-dedup-days').value = String(bc.dedupAuthorDays);
  if ($('input-active-start') && typeof bc.activeStartHour === 'number') $('input-active-start').value = String(bc.activeStartHour);
  if ($('input-active-end') && typeof bc.activeEndHour === 'number') $('input-active-end').value = String(bc.activeEndHour);
  if ($('chk-notify-telegram')) $('chk-notify-telegram').checked = bc.notifyHotLeadTelegram !== false;
  if ($('chk-human-warmup')) $('chk-human-warmup').checked = bc.enableHumanWarmup !== false;

  if ($('input-product-kb') && document.activeElement !== $('input-product-kb')) {
    $('input-product-kb').value = kb.productKnowledgeBase || '';
  }

  // Blacklist Người Bán Toàn Cục
  const bl = Array.isArray(kb.sellerBlacklist) ? kb.sellerBlacklist : [];
  if ($('blacklist-cnt-mini')) $('blacklist-cnt-mini').textContent = String(bl.length);
  if ($('blacklist-cnt-full')) $('blacklist-cnt-full').textContent = String(bl.length);
  const blBox = $('seller-blacklist-tags');
  if (blBox) {
    if (bl.length === 0) {
      blBox.innerHTML = '<span style="color:#64748b;font-size:11px;">Hệ thống tự gom nick spam bán acc/khóa học &amp; đối thủ rao dịch vụ vào đây để bỏ qua trong 0ms ở mọi Group.</span>';
    } else {
      blBox.innerHTML = bl
        .slice(0, 40)
        .map(
          (s) =>
            `<span class="tag-chip seller" title="${escapeHtml(s.reason || '')}">${escapeHtml(s.name)} <button class="btn-rm-bl" data-key="${escapeHtml(s.key)}">×</button></span>`
        )
        .join('');
      blBox.querySelectorAll('.btn-rm-bl').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const key = btn.getAttribute('data-key');
          const res = await chrome.runtime.sendMessage({ type: 'REMOVE_BLACKLIST_SELLER', payload: { key } });
          if (res?.ok && res.data?.knowledge) {
            uiState.machineKnowledge = res.data.knowledge;
            renderMachineKnowledge();
          }
        });
      });
    }
  }

  // Mini-CRM Leads
  const leads = Array.isArray(kb.leadsCrm) ? kb.leadsCrm : [];
  if ($('crm-leads-count')) $('crm-leads-count').textContent = String(leads.length);
  const crmBox = $('leads-crm-list');
  if (crmBox) {
    if (leads.length === 0) {
      crmBox.innerHTML = '<div class="empty-state">Chưa có Lead Nóng/Ấm nào. Khi quét Group, khách có nhu cầu thật sẽ tự gom về đây.</div>';
    } else {
      const statusLabels = { new: 'Mới', engaged: 'Đã Cmt', replied: 'Khách Rep', inbox: 'Đã Inbox', closed: '✅ Đã Chốt' };
      const nextStatusMap = { new: 'inbox', engaged: 'inbox', replied: 'inbox', inbox: 'closed', closed: 'new' };
      crmBox.innerHTML = leads
        .slice(0, 35)
        .map((l) => {
          const tempTag = l.temperature === 'hot' ? `🔥 ${l.leadScore}đ` : `⚡ ${l.leadScore}đ`;
          return `
            <div class="result-item ${l.temperature === 'hot' ? 'is-buyer' : ''}">
              <div class="result-head">
                <span class="result-name">${escapeHtml(l.author)} • <small>${escapeHtml(l.groupName)}</small></span>
                <span class="result-badge buyer">${tempTag} • ${escapeHtml(statusLabels[l.status] || l.status)}</span>
              </div>
              <div class="result-meta">${escapeHtml(l.need || l.snippet)}</div>
              <div class="result-actions">
                <button class="mini-btn btn-open-lead" data-url="${escapeHtml(l.postUrl)}">🔗 Mở bài</button>
                <button class="mini-btn emerald btn-step-lead" data-id="${escapeHtml(l.id)}" data-next="${nextStatusMap[l.status] || 'inbox'}">👉 Chuyển: ${escapeHtml(statusLabels[nextStatusMap[l.status] || 'inbox'])}</button>
              </div>
            </div>
          `;
        })
        .join('');

      crmBox.querySelectorAll('.btn-open-lead').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const url = btn.getAttribute('data-url');
          if (url) await chrome.tabs.create({ url, active: true });
        });
      });

      crmBox.querySelectorAll('.btn-step-lead').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const leadId = btn.getAttribute('data-id');
          const status = btn.getAttribute('data-next');
          const res = await chrome.runtime.sendMessage({ type: 'UPDATE_LEAD_STATUS', payload: { leadId, status } });
          if (res?.ok && res.data?.knowledge) {
            uiState.machineKnowledge = res.data.knowledge;
            renderMachineKnowledge();
          }
        });
      });
    }
  }
}

function bindTeachModeEvents() {
  $('btn-rec-start')?.addEventListener('click', async () => {
    const tab = await getActiveFacebookTab({ createIfMissingUrl: 'https://www.facebook.com/' });
    if (!tab) {
      setStatus('Hãy mở 1 tab Facebook/Messenger trước khi Ghi Mẫu!', 'warn');
      return;
    }
    await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    await chrome.runtime.sendMessage({ type: 'ENSURE_AGENT_READY', tabId: tab.id }).catch(() => {});
    const res = await chrome.runtime.sendMessage({
      type: 'START_DEMO_RECORDING',
      payload: { startUrl: tab.url || '', startTitle: tab.title || '' },
    });
    if (res?.ok && res.data) {
      uiState.recorderDraft = res.data;
      renderRecorderDraft();
      setStatus('🔴 ĐANG GHI MẪU — Cứ thao tác Facebook/Messenger như bình thường!', 'warn');
      appendLog('Bắt đầu Ghi Mẫu MXH (tự lưu Group + F12 + các bước).', 'warn');
    }
  });

  $('btn-rec-stop')?.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'STOP_DEMO_RECORDING' });
    if (res?.ok && res.data) {
      uiState.recorderDraft = res.data.draft;
      if (res.data.knowledge) uiState.machineKnowledge = res.data.knowledge;
      renderRecorderDraft();
      renderMachineKnowledge();
      setStatus(`✅ Đã dừng ghi (${res.data.draft?.steps?.length || 0} bước). Hãy đặt tên và bấm Lưu Kịch Bản!`, 'ok');
    }
  });

  $('btn-rec-clear')?.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'CLEAR_RECORDER_DRAFT' });
    if (res?.ok && res.data) {
      uiState.recorderDraft = res.data;
      renderRecorderDraft();
      setStatus('Đã xóa bản nháp ghi mẫu.', 'warn');
    }
  });

  $('btn-ai-critique-draft')?.addEventListener('click', async () => {
    const steps = uiState.recorderDraft?.steps || [];
    if (steps.length === 0) {
      setStatus('Chưa có bước làm mẫu nào để AI nhận xét! Hãy bấm "🔴 Bắt Đầu Ghi Mẫu" trước.', 'warn');
      return;
    }
    const btn = $('btn-ai-critique-draft');
    if (btn) btn.disabled = true;
    setStatus('🧠 AI đang nhận xét cách bạn vừa làm mẫu & rút chiến lược tối ưu...', 'ok');
    try {
      const name = $('input-wf-name')?.value.trim() || 'Bản làm mẫu mới';
      const category = $('select-wf-category')?.value || 'custom';
      const res = await chrome.runtime.sendMessage({
        type: 'AI_CRITIQUE_DEMO',
        payload: { steps, name, category },
      });
      if (res?.ok && res.data) {
        if (res.data.knowledge) uiState.machineKnowledge = res.data.knowledge;
        uiState.lastDraftReview = res.data.review;
        renderMachineKnowledge();
        renderDemoCritique(res.data.review, name);
        setStatus(`✅ AI chấm ${res.data.review.score}/100 & đã lưu chiến lược vào Bộ nhớ AI!`, 'ok');
        appendLog(`AI Nhận xét bản làm mẫu (${res.data.review.score}/100): ${res.data.review.summary}`, 'ok');
      } else {
        setStatus(`Lỗi AI nhận xét: ${res?.error || 'Không rõ'}`, 'err');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $('btn-ai-coach-all')?.addEventListener('click', async () => {
    const btn = $('btn-ai-coach-all');
    if (btn) btn.disabled = true;
    setStatus('🧭 AI Cố Vấn đang phân tích toàn bộ Danh sách Groups, Mẫu làm việc & CRM...', 'ok');
    try {
      const res = await chrome.runtime.sendMessage({ type: 'AI_COACH_PORTFOLIO' });
      if (res?.ok && res.data) {
        uiState.machineKnowledge = res.data.knowledge;
        renderMachineKnowledge();
        setStatus(
          `✅ AI Cố Vấn đã hoàn tất chiến lược (${res.data.strategyMemory?.engine === 'ai' ? 'AI' : 'Offline Coach'}) & tự lập Playbook cho các Group!`,
          'ok'
        );
        appendLog('AI Cố Vấn đã cập nhật Chiến lược Toàn cục & Playbook từng Group.', 'ok');
      } else {
        setStatus(`Lỗi AI Cố Vấn: ${res?.error || 'Không rõ'}`, 'err');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $('btn-save-workflow')?.addEventListener('click', async () => {
    const steps = uiState.recorderDraft?.steps || [];
    if (steps.length === 0) {
      setStatus('Chưa có bước thao tác nào để lưu! Hãy bấm "🔴 Bắt Đầu Ghi Mẫu" trước.', 'warn');
      return;
    }
    if (uiState.recorderDraft?.active) {
      await chrome.runtime.sendMessage({ type: 'STOP_DEMO_RECORDING' }).catch(() => {});
    }
    const name = $('input-wf-name')?.value.trim() || `Kịch bản MXH (${new Date().toLocaleTimeString('vi-VN', { hour12: false })})`;
    const category = $('select-wf-category')?.value || 'custom';
    const res = await chrome.runtime.sendMessage({
      type: 'SAVE_WORKFLOW',
      payload: { name, category, steps, aiReview: uiState.lastDraftReview || undefined },
    });
    if (res?.ok && res.data) {
      uiState.machineKnowledge = res.data.knowledge;
      uiState.recorderDraft = { active: false, startedAt: null, steps: [] };
      uiState.lastDraftReview = null;
      if ($('input-wf-name')) $('input-wf-name').value = '';
      renderRecorderDraft();
      renderMachineKnowledge();
      setStatus(`💾 Đã lưu kịch bản "${name}" (${res.data.workflow.steps.length} bước)!`, 'ok');
      appendLog(`Lưu kịch bản MXH "${name}" thành công.`, 'ok');
    } else {
      setStatus(`Lỗi lưu kịch bản: ${res?.error}`, 'err');
    }
  });

  $('btn-pick-f12')?.addEventListener('click', async () => {
    const tab = await getActiveFacebookTab();
    if (!tab) {
      setStatus('Hãy mở tab Facebook/Messenger trước khi chấm nút F12!', 'warn');
      return;
    }
    const role = $('select-f12-role')?.value || 'like_btn';
    await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    await sendToTab(tab.id, 'START_F12_PICKER', { role });
    setStatus(`🎯 Rê chuột & click thẳng vào nút [${LEARNED_ROLE_LABELS?.[role] || role}] trên Facebook để dạy F12!`, 'warn');
  });

  $('btn-test-learned-role')?.addEventListener('click', async () => {
    const tab = await getActiveFacebookTab();
    if (!tab) {
      setStatus('Hãy mở tab Facebook/Messenger để test trỏ thử!', 'warn');
      return;
    }
    const role = $('select-f12-role')?.value || 'like_btn';
    await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    const res = await sendToTab(tab.id, 'TEST_LEARNED_F12_ROLE', { role });
    if (res?.ok && res.data?.found) {
      setStatus(`✅ Đã trỏ chuẩn nút [${role}] (${res.data.score} điểm): ${res.data.selector}`, 'ok');
      appendLog(`Test F12 đã học [${role}] OK (${res.data.score}đ): ${res.data.selector}`, 'ok');
    } else {
      setStatus(`Chưa khớp nút [${role}] trên trang này — hãy bấm "🎯 Chấm nút trên màn hình FB" để dạy trước!`, 'warn');
    }
  });

  $('btn-add-cur-group')?.addEventListener('click', async () => {
    const tab = await getActiveFacebookTab();
    if (!tab || !/(facebook|messenger)\.com/i.test(tab.url || '')) {
      setStatus('Tab hiện tại chưa mở Facebook/Messenger!', 'warn');
      return;
    }
    const res = await chrome.runtime.sendMessage({
      type: 'ADD_LEARNED_GROUP',
      payload: { url: tab.url, title: tab.title || '', tag: 'manual' },
    });
    if (res?.ok && res.data?.knowledge) {
      uiState.machineKnowledge = res.data.knowledge;
      renderMachineKnowledge();
      setStatus(`📂 Đã lưu đường dẫn "${(tab.title || tab.url).slice(0, 40)}" vào Thư viện!`, 'ok');
    }
  });

  $('btn-send-groups-to-runner')?.addEventListener('click', async () => {
    const groupUrls = (uiState.machineKnowledge?.learnedGroups || [])
      .filter((g) => g.kind === 'group_feed')
      .map((g) => g.url);
    if (groupUrls.length === 0) {
      setStatus('Chưa có đường dẫn Group nào trong Thư viện!', 'warn');
      return;
    }
    $('input-target-links').value = groupUrls.join('\n');
    await saveRunnerPrefs();
    switchTab('runner');
    setStatus(`📋 Đã nạp ${groupUrls.length} link Group sang Tab Quét Group!`, 'ok');
  });

  $('btn-stop-workflow')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'STOP_LINK_QUEUE' });
    $('btn-stop-workflow')?.classList.add('hidden');
    setStatus('⏹ Đang dừng kịch bản...', 'warn');
  });

  $('btn-export-kb')?.addEventListener('click', () => {
    const dataStr = JSON.stringify(uiState.machineKnowledge || createDefaultMachineKnowledge(), null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fb-exten-machine-profile-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus('⬇️ Đã xuất file Profile F12 & Kịch Bản của máy bạn!', 'ok');
  });

  $('btn-import-kb')?.addEventListener('click', () => {
    $('file-import-kb')?.click();
  });

  $('file-import-kb')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      const res = await chrome.runtime.sendMessage({
        type: 'IMPORT_MACHINE_KNOWLEDGE',
        payload: { knowledge: parsed },
      });
      if (res?.ok && res.data?.knowledge) {
        uiState.machineKnowledge = res.data.knowledge;
        renderMachineKnowledge();
        setStatus('⬆️ Đã nhập thành công Profile F12, Groups & Kịch Bản!', 'ok');
      } else {
        setStatus(`Lỗi nhập Profile: ${res?.error}`, 'err');
      }
    } catch (err) {
      setStatus(`File JSON không hợp lệ: ${err?.message || err}`, 'err');
    } finally {
      e.target.value = '';
    }
  });

  // --- Sự kiện Smart Core v4.0 (Bulk Groups, Auto-Pilot, Kho Kiến Thức, Budget, Blacklist) ---

  $('btn-toggle-bulk-groups')?.addEventListener('click', () => {
    $('bulk-groups-box')?.classList.toggle('hidden');
  });

  $('btn-import-bulk-groups')?.addEventListener('click', async () => {
    const raw = ($('bulk-groups-textarea')?.value || '')
      .split(/[\n\r,]+/)
      .map((s) => s.trim())
      .filter((s) => /facebook\.com/i.test(s));
    if (raw.length === 0) {
      setStatus('Vui lòng dán ít nhất 1 đường dẫn Group Facebook hợp lệ!', 'warn');
      return;
    }
    const res = await chrome.runtime.sendMessage({ type: 'IMPORT_BULK_GROUPS', payload: { urls: raw } });
    if (res?.ok && res.data) {
      uiState.machineKnowledge = res.data.knowledge;
      renderMachineKnowledge();
      if ($('bulk-groups-textarea')) $('bulk-groups-textarea').value = '';
      $('bulk-groups-box')?.classList.add('hidden');
      setStatus(`✅ Đã nạp ${res.data.added} link Group vào Thư viện ROI!`, 'ok');
      appendLog(`Nạp hàng loạt ${res.data.added} đường dẫn Groups.`, 'ok');
    }
  });

  const saveAutoPilotAndAge = async () => {
    const res = await chrome.runtime.sendMessage({
      type: 'UPDATE_V4_SETTINGS',
      payload: {
        autoPilot: {
          enabled: Boolean($('chk-autopilot-enabled')?.checked),
          intervalMinutes: Number($('select-autopilot-interval')?.value) || 30,
          groupsPerCycle: Number($('input-autopilot-groups')?.value) || 2,
        },
        budgetConfig: {
          maxPostAgeHours: Number($('input-max-post-age')?.value ?? 24),
        },
      },
    });
    if (res?.ok && res.data?.knowledge) {
      uiState.machineKnowledge = res.data.knowledge;
      renderMachineKnowledge();
      setStatus(
        res.data.knowledge.autoPilot?.enabled
          ? `🤖 Đã bật Auto-Pilot xoay vòng mỗi ${res.data.knowledge.autoPilot.intervalMinutes} phút!`
          : 'Đã lưu cấu hình Auto-Pilot & lọc độ mới bài.',
        'ok'
      );
    }
  };

  ['chk-autopilot-enabled', 'select-autopilot-interval', 'input-autopilot-groups', 'input-max-post-age'].forEach((id) => {
    $(id)?.addEventListener('change', saveAutoPilotAndAge);
  });

  $('btn-run-autopilot-now')?.addEventListener('click', async () => {
    const tab = await getActiveFacebookTab();
    setStatus('⚡ Đang chọn các Group hạng cao nhất (Tier A → B → C) để chạy...', 'ok');
    const res = await chrome.runtime.sendMessage({
      type: 'RUN_AUTOPILOT_NOW',
      payload: {
        tabId: tab?.id || null,
        mode: $('select-thread-mode')?.value || 'auto',
        naturalGoal: $('input-natural-goal')?.value.trim() || '',
      },
    });
    if (res?.ok && res.data?.groups) {
      const names = res.data.groups.map((g) => `[Tier ${g.tier}] ${g.name}`).join(', ');
      setStatus(`⚡ Auto-Pilot đang quét: ${names}`, 'ok');
      appendLog(`Auto-Pilot chọn: ${names}`, 'ok');
    } else {
      setStatus(`Chưa thể chạy Auto-Pilot: ${res?.error || 'Hãy nạp ít nhất 1 Group vào Thư viện trước!'}`, 'warn');
    }
  });

  $('btn-save-product-kb')?.addEventListener('click', async () => {
    const productKnowledgeBase = $('input-product-kb')?.value || '';
    const res = await chrome.runtime.sendMessage({
      type: 'UPDATE_V4_SETTINGS',
      payload: { productKnowledgeBase },
    });
    if (res?.ok && res.data?.knowledge) {
      uiState.machineKnowledge = res.data.knowledge;
      setStatus('📚 Đã lưu Kho Kiến Thức Sản Phẩm cho AI Mini-RAG!', 'ok');
      appendLog('Đã cập nhật Kho Kiến Thức Sản Phẩm cho AI.', 'ok');
    }
  });

  $('btn-clear-blacklist')?.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'CLEAR_SELLER_BLACKLIST' });
    if (res?.ok && res.data?.knowledge) {
      uiState.machineKnowledge = res.data.knowledge;
      renderMachineKnowledge();
      setStatus('Đã xóa sạch danh sách Blacklist Người Bán.', 'warn');
    }
  });

  $('btn-save-budget')?.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({
      type: 'UPDATE_V4_SETTINGS',
      payload: {
        budgetConfig: {
          maxCommentsPerHour: Number($('input-budget-hour')?.value) || 8,
          maxCommentsPerDay: Number($('input-budget-day')?.value) || 35,
          dedupAuthorDays: Number($('input-dedup-days')?.value ?? 7),
          activeStartHour: Number($('input-active-start')?.value ?? 7),
          activeEndHour: Number($('input-active-end')?.value ?? 23),
          notifyHotLeadTelegram: Boolean($('chk-notify-telegram')?.checked),
          enableHumanWarmup: Boolean($('chk-human-warmup')?.checked),
        },
      },
    });
    if (res?.ok && res.data?.knowledge) {
      uiState.machineKnowledge = res.data.knowledge;
      renderMachineKnowledge();
      setStatus('🛡️ Đã lưu Ngân Sách Bảo Vệ Nick & Cảnh Báo Telegram!', 'ok');
    }
  });

  // --- Cầu Nối Meta AI Web Bridge & Chọn Não AI Thông Minh (v4.3) ---
  const saveAiBrainConfig = async () => {
    const prev = (await chrome.storage.local.get(STORAGE_KEYS.AI_CONFIG))[STORAGE_KEYS.AI_CONFIG] || {};
    await chrome.storage.local.set({
      [STORAGE_KEYS.AI_CONFIG]: {
        ...prev,
        brainSource: $('select-ai-brain')?.value || 'auto_smart',
        metaAiUrl: ($('input-meta-ai-url')?.value || '').trim(),
      },
    });
    refreshMetaAiStatus();
  };

  $('select-ai-brain')?.addEventListener('change', async () => {
    await saveAiBrainConfig();
    const label = $('select-ai-brain')?.selectedOptions?.[0]?.textContent || '';
    setStatus(`🧠 Đã chuyển nguồn Não AI: ${label}`, 'ok');
  });

  $('input-meta-ai-url')?.addEventListener('change', async () => {
    await saveAiBrainConfig();
    setStatus('🔗 Đã lưu link đoạn chat Meta AI đã train sẵn!', 'ok');
  });

  $('btn-open-meta-ai')?.addEventListener('click', async () => {
    await saveAiBrainConfig();
    setStatus('🌐 Đang mở tab Meta AI trên Chrome...', 'ok');
    const res = await chrome.runtime.sendMessage({
      type: 'OPEN_META_AI_TAB',
      payload: { url: ($('input-meta-ai-url')?.value || '').trim(), active: true },
    });
    if (res?.ok && res.data) {
      renderMetaAiStatus(res.data);
      setStatus(
        res.data.ready
          ? '🟢 Đã kết nối sẵn sàng Tab Meta AI! Bạn có thể bấm "🎓 Nạp Quy Luật" ngay.'
          : '🟡 Đã mở tab meta.ai — hãy đảm bảo bạn đã đăng nhập giao diện chat nhé!',
        res.data.ready ? 'ok' : 'warn'
      );
    }
  });

  $('btn-train-meta-ai')?.addEventListener('click', async () => {
    await saveAiBrainConfig();
    const btn = $('btn-train-meta-ai');
    if (btn) btn.disabled = true;
    const box = $('meta-ai-preview-box');
    setStatus('🎓 Đang gửi bộ quy luật (20% kiến thức + FOMO + Hồ sơ năng lực) sang Tab Meta AI...', 'ok');
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'TRAIN_META_AI_RULES',
        payload: { url: ($('input-meta-ai-url')?.value || '').trim() },
      });
      if (res?.ok && res.data) {
        if (box) {
          box.classList.remove('hidden');
          box.textContent = `🎓 Meta AI xác nhận (${Math.round((res.data.elapsedMs || 0) / 1000)}s): ${res.data.text}`;
        }
        setStatus('✅ Đã nạp xong quy luật vào bộ nhớ Tab Meta AI!', 'ok');
        appendLog(`Meta AI đã học quy luật bình luận FOMO thành công.`, 'ok');
        refreshMetaAiStatus();
      } else {
        setStatus(`Chưa nạp được vào Meta AI: ${res?.error || 'Hãy mở tab meta.ai trước!'}`, 'err');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $('btn-test-meta-ai')?.addEventListener('click', async () => {
    await saveAiBrainConfig();
    const btn = $('btn-test-meta-ai');
    if (btn) btn.disabled = true;
    const box = $('meta-ai-preview-box');
    setStatus('🧪 Đang gửi câu test sang Tab Meta AI...', 'ok');
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'TEST_META_AI_BRIDGE',
        payload: { url: ($('input-meta-ai-url')?.value || '').trim() },
      });
      if (res?.ok && res.data) {
        if (box) {
          box.classList.remove('hidden');
          box.textContent = `🧪 Meta AI trả lời (${Math.round((res.data.elapsedMs || 0) / 1000)}s): "${res.data.text}"`;
        }
        setStatus('🟢 Kết nối Tab Meta AI hoạt động mượt mà!', 'ok');
        appendLog(`Test Tab Meta AI OK: ${res.data.text.slice(0, 70)}...`, 'ok');
        refreshMetaAiStatus();
      } else {
        setStatus(`Test Meta AI lỗi: ${res?.error || 'Hãy bấm "🌐 Mở Meta AI" trước!'}`, 'err');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

function renderMetaAiStatus(status) {
  const pill = $('meta-ai-status-pill');
  if (!pill) return;
  if (status?.ready) {
    pill.textContent = '🟢 Đã nối Tab Meta AI';
    pill.className = 'badge-mono ok';
    pill.title = status.url || 'https://www.meta.ai/';
  } else if (status?.connected) {
    pill.textContent = '🟡 Tab Meta AI chưa sẵn ô chat';
    pill.className = 'badge-mono warn';
  } else {
    pill.textContent = '⚪ Chưa mở tab meta.ai';
    pill.className = 'badge-mono';
  }
}

async function refreshMetaAiStatus() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_META_AI_STATUS' }).catch(() => null);
  if (res?.ok && res.data) {
    renderMetaAiStatus(res.data);
  }
}

async function loadMachineKnowledgeIntoUi() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_MACHINE_KNOWLEDGE' }).catch(() => null);
  if (res?.ok && res.data) {
    uiState.machineKnowledge = res.data.knowledge || createDefaultMachineKnowledge();
    uiState.recorderDraft = res.data.draft || { active: false, startedAt: null, steps: [] };
  }
  renderRecorderDraft();
  renderMachineKnowledge();
}

(async function init() {
  bindEvents();
  await loadSavedState();
  await loadMachineKnowledgeIntoUi();
  refreshMetaAiStatus();
  const tab = await getActiveFacebookTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'PING_AGENT' }).then((ping) => {
      if (ping?.ok && typeof ping.gqlCapturedCount === 'number' && $('badge-gql-count')) {
        $('badge-gql-count').textContent = `📡 GQL: ${ping.gqlCapturedCount}`;
      }
    }).catch(() => {});
  }
  chrome.runtime.sendMessage({ type: 'SYNC_SESSION_NOW' }).then((res) => {
    if (res?.ok && res.data) renderSessionState(res.data);
  }).catch(() => {});
})();
