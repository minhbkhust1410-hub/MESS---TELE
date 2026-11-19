import {
  callAiPoolWithFailover,
  detectProviderFromKey,
  maskApiKey,
  segmentGraphemes,
  randomInt,
  sleep,
  createDefaultLearningMemory,
  analyzeThreadOffline,
  buildThreadAiPrompt,
  parseThreadAiResponse,
  mergeLearningFromAnalysis,
  teachAiCorrection,
  buildVisionLocatePrompt,
  parseVisionLocateResponse,
  classifyFacebookTargetUrl,
  createDefaultMachineKnowledge,
  normalizeMachineKnowledge,
  upsertLearnedRoleProfile,
  upsertLearnedGroup,
  compactRecordedSteps,
  buildReplayWorkflowPlan,
  scoreLeadHotness,
  isBlacklistedSeller,
  addSellerToBlacklist,
  hasRecentlyEngagedAuthor,
  recordAuthorEngagement,
  checkActionBudget,
  recordBudgetUsage,
  updateGroupRoiStats,
  pickNextScheduledGroups,
  upsertLeadCrmItem,
  findLearnedGroupByUrl,
  appendGroupSampleSnippet,
  analyzeDemoOffline,
  buildDemoCritiquePrompt,
  parseDemoCritiqueResponse,
  analyzeGroupPlaybookOffline,
  buildGroupPlaybookPrompt,
  parseGroupPlaybookResponse,
  analyzePortfolioStrategyOffline,
  buildPortfolioStrategyPrompt,
  parsePortfolioStrategyResponse,
  mergeDistilledStrategyIntoMemory,
  buildSmartAdaptInputPrompt,
  applyOfflineSmartAdaptation,
  sanitizeSingleCommentText,
  validateCommentBeforePaste,
  recordUserStyleSample,
  recordSentComment,
  buildMetaAiTrainingPrompt,
  buildMetaAiThreadPrompt,
  parseMetaAiThreadResponse,
} from '../core-build/shared/fb-exten-core.js';

const STORAGE_KEYS = {
  AI_KEYS: 'fb_exten_ai_keys',
  AI_CONFIG: 'fb_exten_ai_config',
  CUSTOM_RULE: 'fb_exten_custom_rule',
  HYBRID_CONFIG: 'fb_exten_hybrid_config',
  LEARNING_MEMORY: 'fb_exten_learning_memory',
  RUN_HISTORY: 'fb_exten_run_history',
  SESSION_STATE: 'fb_exten_session_state',
  PROCESSED_POSTS: 'fb_exten_processed_posts',
  MACHINE_KNOWLEDGE: 'fb_exten_machine_knowledge',
  RECORDER_DRAFT: 'fb_exten_recorder_draft',
};

const attachedDebuggerTabs = new Set();
const queueState = {
  running: false,
  stopRequested: false,
  runId: 0,
  activeTabId: null,
};

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedDebuggerTabs.delete(tabId);
});

chrome.debugger?.onDetach?.addListener((source) => {
  if (source?.tabId) attachedDebuggerTabs.delete(source.tabId);
});

function broadcastEvent(event, payload) {
  chrome.runtime.sendMessage({ type: 'EXT_EVENT', event, payload }).catch(() => {});
}

// ============================================================================
// 1. CDP REAL INPUT (OPTIONAL) & TAB AGENT CONNECTION
// ============================================================================

async function hasDebuggerPermission() {
  try {
    return await chrome.permissions.contains({ permissions: ['debugger'] });
  } catch {
    return false;
  }
}

async function ensureDebuggerAttached(tabId) {
  const permitted = await hasDebuggerPermission();
  if (!permitted) throw new Error('Chưa bật quyền Debugger (CDP Real Input).');
  if (!attachedDebuggerTabs.has(tabId)) {
    await chrome.debugger.attach({ tabId }, '1.3');
    attachedDebuggerTabs.add(tabId);
  }
}

async function cdpClickAt(tabId, x, y) {
  await ensureDebuggerAttached(tabId);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await sleep(randomInt(80, 150));
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(randomInt(50, 100));
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
}

async function cdpHoverAt(tabId, x, y) {
  await ensureDebuggerAttached(tabId);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
}

async function cdpTypeHumanText(tabId, text) {
  await ensureDebuggerAttached(tabId);
  const graphemes = segmentGraphemes(text);
  for (const ch of graphemes) {
    if (ch === '\n') {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        modifiers: 8,
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
      });
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        modifiers: 8,
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
      });
      await sleep(randomInt(100, 180));
      continue;
    }
    await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: ch });
    await sleep(randomInt(20, 42));
  }
}

async function cdpPressEnter(tabId) {
  await ensureDebuggerAttached(tabId);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    text: '\r',
    unmodifiedText: '\r',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await sleep(45);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}

function waitForTabComplete(tabId, timeoutMs = 25000) {
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

async function ensureAgentReady(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: 'PING_AGENT' });
    if (ping?.ok) return true;
  } catch {}

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/facebook-agent.js'],
  });
  await sleep(450);

  const ping2 = await chrome.tabs.sendMessage(tabId, { type: 'PING_AGENT' }).catch(() => null);
  if (!ping2?.ok) {
    throw new Error('Không thể kết nối Content Script vào tab Facebook (hãy F5 tab rồi thử lại).');
  }
  return true;
}

async function sendMessageToTabSafe(tabId, type, payload = {}) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type, payload });
  } catch {
    await ensureAgentReady(tabId);
    return await chrome.tabs.sendMessage(tabId, { type, payload });
  }
}

async function updateTabHud(tabId, payload) {
  if (!tabId) return;
  await chrome.tabs.sendMessage(tabId, { type: 'HUD_UPDATE', payload }).catch(() => {});
}

async function injectAgentIntoOpenFacebookTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ['https://*.facebook.com/*', 'https://*.messenger.com/*'] });
    for (const t of tabs) {
      if (t.id) {
        await chrome.scripting.executeScript({
          target: { tabId: t.id },
          files: ['content/facebook-agent.js'],
        }).catch(() => {});
      }
    }
  } catch {}
}

// ============================================================================
// 2. AI MULTI-KEY POOL & SELF-LEARNING ENGINE
// ============================================================================

async function callAiPoolRaw({ prompt, systemPrompt, preferredProvider, imageBase64 }) {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.AI_KEYS, STORAGE_KEYS.AI_CONFIG]);
  const rawPool = Array.isArray(stored[STORAGE_KEYS.AI_KEYS]) ? stored[STORAGE_KEYS.AI_KEYS] : [];
  const aiConfig = stored[STORAGE_KEYS.AI_CONFIG] || {};

  if (rawPool.length === 0) {
    throw new Error('Chưa cấu hình API Key AI (Gemini/Groq/OpenRouter).');
  }

  const normalizedPool = rawPool.map((item) => ({
    id: item.id,
    provider: item.provider || detectProviderFromKey(item.apiKey),
    apiKey: item.apiKey,
    maskedKey: item.maskedKey || maskApiKey(item.apiKey),
    status: item.status || 'active',
    cooldownUntil: item.cooldownUntil,
    successCount: item.successCount || 0,
    failCount: item.failCount || 0,
    lastError: item.lastError,
  }));

  const result = await callAiPoolWithFailover(normalizedPool, prompt, {
    preferredProvider: preferredProvider || aiConfig.preferredProvider || 'gemini',
    systemPrompt,
    cooldownSeconds: aiConfig.cooldownSeconds || 60,
    imageBase64,
  });

  await chrome.storage.local.set({ [STORAGE_KEYS.AI_KEYS]: result.updatedPool });
  return {
    text: result.text,
    providerUsed: result.providerUsed,
    keyUsedMasked: result.keyUsedMasked,
  };
}

// ============================================================================
// 2.5. META AI WEB BRIDGE & HYBRID SMART AI ROUTER (Meta AI Tab ↔ API ↔ Offline)
// ============================================================================

let metaAiQueuePromise = Promise.resolve();

async function ensureMetaAiBridgeReady(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: 'PING_META_AI' });
    if (ping?.ok) return ping;
  } catch {}
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/meta-ai-bridge.js'],
  });
  await sleep(300);
  const ping2 = await chrome.tabs.sendMessage(tabId, { type: 'PING_META_AI' }).catch(() => null);
  return ping2 || { ok: false, ready: false };
}

async function findMetaAiTab(preferredUrl = '') {
  const tabs = await chrome.tabs.query({ url: ['https://*.meta.ai/*'] }).catch(() => []);
  if (tabs.length === 0) return null;
  const cleanPref = String(preferredUrl || '').trim().replace(/\/+$/, '');
  if (cleanPref) {
    const exact = tabs.find((t) => (t.url || '').replace(/\/+$/, '').startsWith(cleanPref));
    if (exact) return exact;
  }
  return tabs.find((t) => /\/prompt\/|\/c\//i.test(t.url || '')) || tabs.find((t) => t.active) || tabs[0];
}

async function getMetaAiBridgeStatus() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.AI_CONFIG);
  const aiConfig = stored[STORAGE_KEYS.AI_CONFIG] || {};
  const tab = await findMetaAiTab(aiConfig.metaAiUrl || '');
  if (!tab?.id) {
    return { connected: false, ready: false, tabId: null, url: '', title: '' };
  }
  const ping = await ensureMetaAiBridgeReady(tab.id).catch(() => null);
  return {
    connected: Boolean(ping?.ok),
    ready: Boolean(ping?.ready),
    busy: Boolean(ping?.busy),
    tabId: tab.id,
    url: tab.url || '',
    title: tab.title || 'Meta AI',
  };
}

async function openOrFocusMetaAiTab({ url = '', active = true } = {}) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.AI_CONFIG);
  const aiConfig = stored[STORAGE_KEYS.AI_CONFIG] || {};
  const targetUrl = String(url || aiConfig.metaAiUrl || 'https://www.meta.ai/').trim();
  const safeUrl = /^https:\/\/(?:www\.)?meta\.ai/i.test(targetUrl) ? targetUrl : 'https://www.meta.ai/';

  const existing = await findMetaAiTab(safeUrl);
  if (existing?.id) {
    if (active) {
      await chrome.tabs.update(existing.id, { active: true }).catch(() => {});
      if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true }).catch(() => {});
    }
    await ensureMetaAiBridgeReady(existing.id).catch(() => {});
    return existing;
  }

  const created = await chrome.tabs.create({ url: safeUrl, active });
  await waitForTabComplete(created.id, 18000);
  await sleep(1600);
  await ensureMetaAiBridgeReady(created.id).catch(() => {});
  return created;
}

function callMetaAiTabRaw({ prompt, preferredUrl = '', autoOpenIfMissing = false, timeoutMs = 48000 }) {
  const run = async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.AI_CONFIG);
    const aiConfig = stored[STORAGE_KEYS.AI_CONFIG] || {};
    let tab = await findMetaAiTab(preferredUrl || aiConfig.metaAiUrl || '');

    if (!tab && autoOpenIfMissing) {
      tab = await openOrFocusMetaAiTab({ url: preferredUrl || aiConfig.metaAiUrl || '', active: false });
    }
    if (!tab?.id) {
      throw new Error('Chưa mở tab https://www.meta.ai/ trên Chrome.');
    }

    const ping = await ensureMetaAiBridgeReady(tab.id);
    if (!ping?.ready) {
      throw new Error('Tab Meta AI chưa sẵn sàng ô nhập chat (hãy kiểm tra đăng nhập trên tab meta.ai).');
    }

    const res = await chrome.tabs.sendMessage(tab.id, {
      type: 'ASK_META_AI',
      payload: { prompt, timeoutMs },
    });
    if (!res?.ok || !res.text) {
      throw new Error(res?.error || 'Tab Meta AI không trả về nội dung.');
    }
    return {
      text: res.text,
      providerUsed: 'meta_ai_tab',
      keyUsedMasked: 'Tab Meta AI',
      elapsedMs: res.elapsedMs || 0,
      url: res.url || tab.url || '',
    };
  };

  const next = metaAiQueuePromise.then(run, run);
  metaAiQueuePromise = next.catch(() => {});
  return next;
}

/**
 * Bộ định tuyến Não AI Thông Minh:
 * - auto_smart (mặc định): Ưu tiên Tab Meta AI nếu đang mở sẵn -> tự failover sang API Key (Groq Llama / Gemini) nếu có -> Offline Pro-FOMO.
 * - meta_ai_tab: Chuyên dùng Tab Meta AI (bộ nhớ đã train sẵn).
 * - api_pool: Chuyên dùng Bể API Key (Groq Llama / Gemini / OpenRouter).
 */
async function callSmartAiBrain({ prompt, metaPrompt, preferredProvider, allowAutoOpenMeta = false } = {}) {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.AI_KEYS, STORAGE_KEYS.AI_CONFIG]);
  const rawPool = Array.isArray(stored[STORAGE_KEYS.AI_KEYS]) ? stored[STORAGE_KEYS.AI_KEYS] : [];
  const aiConfig = stored[STORAGE_KEYS.AI_CONFIG] || {};
  const brainSource = aiConfig.brainSource || 'auto_smart';

  if (brainSource === 'offline') {
    throw new Error('Đang chọn chế độ Offline.');
  }

  const tryMeta = async (autoOpen) => {
    const res = await callMetaAiTabRaw({
      prompt: metaPrompt || prompt,
      preferredUrl: aiConfig.metaAiUrl || '',
      autoOpenIfMissing: autoOpen,
    });
    return { ...res, viaMetaTab: true };
  };

  const tryApi = async () => {
    if (rawPool.length === 0) throw new Error('Chưa có API Key AI.');
    const res = await callAiPoolRaw({
      prompt,
      preferredProvider: preferredProvider || aiConfig.preferredProvider || 'groq',
    });
    return { ...res, viaMetaTab: false };
  };

  if (brainSource === 'meta_ai_tab') {
    return await tryMeta(allowAutoOpenMeta);
  }

  if (brainSource === 'api_pool') {
    return await tryApi();
  }

  // auto_smart: Nếu tab meta.ai đang mở sẵn & ready -> ưu tiên dùng luôn bộ nhớ Meta AI!
  const metaStatus = await getMetaAiBridgeStatus().catch(() => ({ ready: false }));
  if (metaStatus.ready) {
    try {
      return await tryMeta(false);
    } catch (metaErr) {
      if (rawPool.length > 0) return await tryApi();
      throw metaErr;
    }
  }

  if (rawPool.length > 0) {
    return await tryApi();
  }

  throw new Error('Chưa mở tab Meta AI và chưa nạp API Key (đang chạy bộ sinh câu Offline FOMO).');
}

async function analyzeThreadWithSelfLearning({ threadInput, mode = 'auto', useAi = true, naturalGoal = '', groupUrl = '', forceMetaAi = false }) {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.LEARNING_MEMORY,
    STORAGE_KEYS.CUSTOM_RULE,
    STORAGE_KEYS.AI_KEYS,
    STORAGE_KEYS.AI_CONFIG,
  ]);

  const kb = await loadMachineKnowledge();
  const memory = stored[STORAGE_KEYS.LEARNING_MEMORY] || createDefaultLearningMemory();
  const customRule = stored[STORAGE_KEYS.CUSTOM_RULE];
  const aiConfig = stored[STORAGE_KEYS.AI_CONFIG] || {};
  const matchedGroup = findLearnedGroupByUrl(kb, groupUrl || threadInput?.url || '');

  let analysis;
  let aiError = '';

  if (useAi && (forceMetaAi || aiConfig.brainSource !== 'offline')) {
    try {
      const apiPrompt = buildThreadAiPrompt(
        threadInput,
        mode,
        memory,
        customRule,
        naturalGoal,
        kb.productKnowledgeBase || '',
        matchedGroup?.playbook,
        kb.strategyMemory,
        kb.learnedStyleSamples || [],
        kb.recentSentComments || []
      );
      const metaPrompt = buildMetaAiThreadPrompt(
        threadInput,
        mode,
        kb,
        customRule,
        naturalGoal,
        matchedGroup?.playbook
      );
      const aiRes = forceMetaAi
        ? {
            ...(await callMetaAiTabRaw({
              prompt: metaPrompt,
              preferredUrl: aiConfig.metaAiUrl || '',
              autoOpenIfMissing: true,
            })),
            viaMetaTab: true,
          }
        : await callSmartAiBrain({
            prompt: apiPrompt,
            metaPrompt,
            preferredProvider: aiConfig.preferredProvider || 'groq',
            allowAutoOpenMeta: aiConfig.brainSource === 'meta_ai_tab',
          });
      if (aiRes.viaMetaTab) {
        analysis = parseMetaAiThreadResponse(
          aiRes.text,
          threadInput,
          mode,
          memory,
          customRule,
          kb.recentSentComments || [],
          matchedGroup?.playbook
        );
      } else {
        analysis = parseThreadAiResponse(
          aiRes.text,
          threadInput,
          mode,
          `${aiRes.providerUsed} (${aiRes.keyUsedMasked})`,
          memory,
          customRule,
          kb.recentSentComments || [],
          matchedGroup?.playbook
        );
      }
    } catch (err) {
      aiError = err?.message || String(err);
      analysis = analyzeThreadOffline(
        threadInput,
        mode,
        memory,
        customRule,
        kb.recentSentComments || [],
        matchedGroup?.playbook
      );
      analysis.learnedLesson = `AI Fallback (${aiError}) -> ${analysis.learnedLesson}`;
    }
  } else {
    analysis = analyzeThreadOffline(
      threadInput,
      mode,
      memory,
      customRule,
      kb.recentSentComments || [],
      matchedGroup?.playbook
    );
  }

  const updatedMemory = mergeLearningFromAnalysis(memory, threadInput, analysis);
  await chrome.storage.local.set({ [STORAGE_KEYS.LEARNING_MEMORY]: updatedMemory });

  return { analysis, memory: updatedMemory, aiError };
}

// ============================================================================
// 3. LỊCH SỬ BÀI ĐÃ XỬ LÝ & TRÁNH TRÙNG LẶP TRONG GROUP
// ============================================================================

async function appendRunHistory(entry) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.RUN_HISTORY);
  const hist = Array.isArray(stored[STORAGE_KEYS.RUN_HISTORY]) ? stored[STORAGE_KEYS.RUN_HISTORY] : [];
  hist.unshift(entry);
  if (hist.length > 80) hist.length = 80;
  await chrome.storage.local.set({ [STORAGE_KEYS.RUN_HISTORY]: hist });
  return hist;
}

async function loadProcessedPostKeys() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.PROCESSED_POSTS);
  const arr = Array.isArray(stored[STORAGE_KEYS.PROCESSED_POSTS]) ? stored[STORAGE_KEYS.PROCESSED_POSTS] : [];
  return arr.map((x) => (typeof x === 'string' ? x : x?.key)).filter(Boolean);
}

async function markPostKeysProcessed(postKeys = []) {
  const cleanKeys = (Array.isArray(postKeys) ? postKeys : [postKeys]).filter(Boolean);
  if (cleanKeys.length === 0) return;
  const stored = await chrome.storage.local.get(STORAGE_KEYS.PROCESSED_POSTS);
  const arr = Array.isArray(stored[STORAGE_KEYS.PROCESSED_POSTS]) ? stored[STORAGE_KEYS.PROCESSED_POSTS] : [];
  let changed = false;
  for (const k of cleanKeys) {
    if (!arr.includes(k)) {
      arr.push(k);
      changed = true;
    }
  }
  if (changed) {
    while (arr.length > 2000) arr.shift();
    await chrome.storage.local.set({ [STORAGE_KEYS.PROCESSED_POSTS]: arr });
  }
}

async function markPostKeyProcessed(postKey) {
  await markPostKeysProcessed(postKey ? [postKey] : []);
}

// ============================================================================
// 4. BỘ ĐIỀU PHỐI AGENT TỰ ĐỘNG QUÉT GROUP TỔNG & BÀI VIẾT
// ============================================================================

function pushLogAndHud(tabId, message, level = 'info', running = true, stats = null) {
  broadcastEvent('LINK_QUEUE_STATUS', { running, level, message, stats });
  updateTabHud(tabId, { running, level, message, stats });
}

async function pushHotLeadToServer(lead, notifyTelegram = true) {
  try {
    const st = await chrome.storage.local.get(STORAGE_KEYS.HYBRID_CONFIG);
    const serverUrl = String(st[STORAGE_KEYS.HYBRID_CONFIG]?.serverUrl || 'http://127.0.0.1:3300').replace(/\/+$/, '');
    const res = await fetch(`${serverUrl}/api/extension/hot-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead, notifyTelegram }),
    });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

async function processSingleExtractedThread({
  tabId,
  threadInput,
  postKey,
  commentsDisabled,
  targetUrl,
  mode,
  naturalGoal,
  useAi,
  doLove,
  doCommentPost,
  doReplyBuyers,
  allowEnterToSend = true,
  useCdp,
  minDelaySec,
  maxDelaySec,
  stats,
}) {
  let kb = await loadMachineKnowledge();
  const budgetCfg = kb.budgetConfig || {};
  const classifiedGroup = classifyFacebookTargetUrl(targetUrl, false);
  const groupName =
    (kb.learnedGroups || []).find((g) => classifiedGroup.groupId && g.url.includes(`/groups/${classifiedGroup.groupId}`))?.name ||
    (classifiedGroup.groupId ? `Group ${classifiedGroup.groupId}` : 'Facebook');

  // 0. Bỏ qua 0ms nếu bài viết này đã tương tác rồi (bấm tay hoặc chạy tool trước đó)
  if (threadInput?.alreadyInteracted) {
    pushLogAndHud(
      tabId,
      `⏭ Bỏ qua 0ms bài đã tương tác [${threadInput.postAuthor}]: ${threadInput.alreadyInteractedReason || 'Đã tương tác trước đó'}`,
      'info',
      true,
      stats
    );
    await markPostKeyProcessed(postKey);
    return { checkpointHit: false, acted: false };
  }

  // 1. Lọc độ mới của bài viết (chỉ săn bài mới nếu người dùng bật maxPostAgeHours > 0)
  if (
    budgetCfg.maxPostAgeHours > 0 &&
    typeof threadInput.postAgeMinutes === 'number' &&
    threadInput.postAgeMinutes > budgetCfg.maxPostAgeHours * 60
  ) {
    const hrs = Math.round(threadInput.postAgeMinutes / 60);
    pushLogAndHud(tabId, `⏭ Bỏ qua bài cũ (${hrs} giờ > giới hạn ${budgetCfg.maxPostAgeHours}h) của [${threadInput.postAuthor}]`, 'warn', true, stats);
    await markPostKeyProcessed(postKey);
    return { checkpointHit: false, acted: false };
  }

  // 2. Lọc 0ms Blacklist Spam / Bán Acc-Khóa Học / Rao Dịch Vụ Toàn Cục
  const postAuthorBlacklisted = isBlacklistedSeller(kb, threadInput.postAuthorUid, threadInput.postAuthor);
  const freshComments = (threadInput.comments || []).filter(
    (c) => !isBlacklistedSeller(kb, c.authorUid, c.author)
  );
  const blacklistedCommentSkipCount = (threadInput.comments || []).length - freshComments.length;

  if (postAuthorBlacklisted && freshComments.length === 0) {
    stats.skippedSeller++;
    kb = recordBudgetUsage(kb, { postsScanned: 1 });
    kb = updateGroupRoiStats(kb, targetUrl, { postsScanned: 1, sellersSkipped: 1 });
    await saveMachineKnowledge(kb, false);
    await markPostKeyProcessed(postKey);
    pushLogAndHud(tabId, `⚡ [Blacklist 0ms] Bỏ qua bài Spam/Rao bán [${threadInput.postAuthor}]`, 'warn', true, stats);
    return { checkpointHit: false, acted: false };
  }

  // Thu thập mẫu bài viết thực tế của Group để AI phân tích tệp nhóm chính xác
  if (threadInput?.postText) {
    kb = appendGroupSampleSnippet(kb, targetUrl, threadInput.postText, groupName);
  }

  const gqlTag = threadInput.source === 'graphql_enriched' ? ' [📡GQL]' : '';
  pushLogAndHud(tabId, `🔗 Copy link bài [${threadInput.postAuthor}]${gqlTag} → gửi AI/Meta AI phân tích...`, 'info', true, stats);

  const { analysis, memory } = await analyzeThreadWithSelfLearning({
    threadInput: { ...threadInput, comments: freshComments },
    mode,
    useAi,
    naturalGoal,
    groupUrl: targetUrl,
  });

  if (postAuthorBlacklisted) {
    analysis.postAuthorRole = 'seller';
    analysis.shouldCommentPost = false;
    analysis.postSkipReason = 'Người bán trong Blacklist toàn cục';
  }

  // 3. Chống trùng chéo tác giả giữa nhiều Group trong X ngày
  const dedupDays = Number(budgetCfg.dedupAuthorDays ?? 7);
  const authorAlreadyEngaged =
    analysis.postAuthorRole !== 'seller' &&
    hasRecentlyEngagedAuthor(kb, threadInput.postAuthorUid, threadInput.postAuthor, dedupDays);
  if (authorAlreadyEngaged) {
    analysis.shouldCommentPost = false;
    analysis.postSkipReason = `Đã tương tác với "${threadInput.postAuthor}" ở Group khác trong ${dedupDays} ngày qua`;
  }

  // 4. Chấm điểm độ nóng Lead (0-100đ) & tự nạp Blacklist người bán mới phát hiện
  const hotness = scoreLeadHotness(analysis, threadInput, budgetCfg.hotLeadMinScore || 75);
  if (analysis.postAuthorRole === 'seller') {
    kb = addSellerToBlacklist(kb, {
      uid: threadInput.postAuthorUid,
      name: threadInput.postAuthor,
      reason: analysis.postAuthorNeed || 'Chủ bài rao bán',
    });
  }
  for (const c of analysis.commentEvaluations || []) {
    if (c.role === 'seller') {
      const origC = (threadInput.comments || []).find((oc) => oc.index === c.index);
      kb = addSellerToBlacklist(kb, {
        uid: origC?.authorUid,
        name: c.author,
        reason: c.need || 'Bình luận rao bán',
      });
    }
  }

  broadcastEvent('THREAD_ANALYSIS_READY', { analysis, memory, hotness });

  const buyerReplies = (analysis.commentEvaluations || []).filter(
    (c) =>
      c.shouldEngage &&
      c.role !== 'seller' &&
      c.suggestedReply &&
      !hasRecentlyEngagedAuthor(kb, undefined, c.author, dedupDays)
  );
  const sellersCount =
    blacklistedCommentSkipCount +
    (analysis.commentEvaluations || []).filter((c) => c.role === 'seller').length +
    (analysis.postAuthorRole === 'seller' ? 1 : 0);
  stats.skippedSeller += sellersCount;

  // 5. Lưu Lead Nóng / Ấm vào Mini-CRM & Bắn cảnh báo tức thì về Telegram Bot nếu >= hotMinScore
  if (hotness.temperature === 'hot' || hotness.temperature === 'warm') {
    const leadItem = {
      id: `lead_${postKey || Date.now()}`,
      author: threadInput.postAuthor,
      authorUid: threadInput.postAuthorUid,
      groupId: classifiedGroup.groupId,
      groupName,
      postUrl: threadInput.url || targetUrl,
      snippet: (threadInput.postText || '').slice(0, 220),
      need: analysis.postAuthorNeed || analysis.topicSummary || '',
      leadScore: hotness.score,
      temperature: hotness.temperature,
      suggestedReply: analysis.suggestedPostComment || buyerReplies[0]?.suggestedReply || '',
      status: 'new',
      createdAt: new Date().toISOString(),
    };

    if (hotness.temperature === 'hot' && budgetCfg.notifyHotLeadTelegram !== false) {
      const pushRes = await pushHotLeadToServer(leadItem, true);
      if (pushRes?.telegramSent) {
        leadItem.telegramNotified = true;
        pushLogAndHud(tabId, `🔥 [LEAD NÓNG ${hotness.score}đ] Đã bắn cảnh báo về Telegram Bot!`, 'ok', true, stats);
      }
    }
    kb = upsertLeadCrmItem(kb, leadItem);
  }

  // 6. Kiểm tra Ngân sách hành động bảo vệ nick (Action Budget)
  const budgetCheck = checkActionBudget(kb);
  const allowCommentingNow = budgetCheck.allowed;
  if (!allowCommentingNow && (doCommentPost || doReplyBuyers)) {
    pushLogAndHud(tabId, `🛡️ [Bảo vệ nick] ${budgetCheck.reason} — Chỉ quét & lưu Lead, tạm ngưng comment.`, 'warn', true, stats);
  }

  // 6.5. Soát lỗi & độ phù hợp của nội dung comment TRƯỚC KHI DÁN vào Facebook
  const recentSent = kb.recentSentComments || [];
  let postPreCheckOk = Boolean(analysis.shouldCommentPost && analysis.suggestedPostComment);
  let postPreCheckReason = '';
  if (postPreCheckOk) {
    const checkPost = validateCommentBeforePaste(analysis.suggestedPostComment, {
      postText: threadInput.postText || '',
      postAuthorRole: analysis.postAuthorRole,
      recentSentComments: recentSent,
    });
    if (!checkPost.ok) {
      postPreCheckOk = false;
      postPreCheckReason = checkPost.reason;
      analysis.shouldCommentPost = false;
      analysis.suggestedPostComment = '';
      pushLogAndHud(tabId, `🛡️ [Soát trước khi dán] Bỏ qua comment bài [${threadInput.postAuthor}]: ${checkPost.reason}`, 'warn', true, stats);
    } else {
      analysis.suggestedPostComment = checkPost.cleanedText;
    }
  }

  for (const c of analysis.commentEvaluations || []) {
    if (c.shouldEngage && c.role !== 'seller' && c.suggestedReply) {
      const checkReply = validateCommentBeforePaste(c.suggestedReply, {
        postText: threadInput.postText || '',
        targetText: c.text || '',
        postAuthorRole: c.role,
        recentSentComments: recentSent,
      });
      if (!checkReply.ok) {
        c.shouldEngage = false;
        c.suggestedReply = '';
        c.skipReason = `Soát trước khi dán: ${checkReply.reason}`;
      } else {
        c.suggestedReply = checkReply.cleanedText;
      }
    }
  }

  const validatedBuyerReplies = (analysis.commentEvaluations || []).filter(
    (c) =>
      c.shouldEngage &&
      c.role !== 'seller' &&
      c.suggestedReply &&
      !hasRecentlyEngagedAuthor(kb, undefined, c.author, dedupDays)
  );

  const effectiveDoComment = Boolean(allowCommentingNow && !commentsDisabled && doCommentPost && postPreCheckOk);
  const effectiveDoReply = Boolean(allowCommentingNow && !commentsDisabled && doReplyBuyers && validatedBuyerReplies.length > 0);
  const canDoLove = Boolean(doLove && analysis.postAuthorRole !== 'seller');

  if (!canDoLove && !effectiveDoComment && !effectiveDoReply) {
    const reason = commentsDisabled
      ? 'Bài đã tắt bình luận'
      : authorAlreadyEngaged
        ? analysis.postSkipReason
        : !allowCommentingNow
          ? budgetCheck.reason
          : postPreCheckReason
            ? `Soát nội dung: ${postPreCheckReason}`
            : analysis.postAuthorRole === 'seller'
              ? 'Chủ bài là Spam / Bán acc-khóa học & không có người hỏi mới'
              : 'Không có nhu cầu phù hợp mục tiêu';
    pushLogAndHud(tabId, `⏭ Bỏ qua bài [${threadInput.postAuthor}]: ${reason}`, 'warn', true, stats);

    kb = recordBudgetUsage(kb, { postsScanned: 1 });
    kb = updateGroupRoiStats(kb, targetUrl, {
      postsScanned: 1,
      hotLeads: hotness.temperature === 'hot' ? 1 : 0,
      warmLeads: hotness.temperature === 'warm' ? 1 : 0,
      sellersSkipped: sellersCount,
    });
    await saveMachineKnowledge(kb, false);
    await markPostKeyProcessed(postKey);

    const hist = await appendRunHistory({
      timestamp: new Date().toISOString(),
      url: threadInput.url || targetUrl,
      postAuthor: threadInput.postAuthor,
      postType: `${hotness.temperature === 'hot' ? '🔥 ' : ''}${analysis.postType}`,
      modeUsed: analysis.modeUsed,
      status: 'skipped',
      summary: reason,
    });
    broadcastEvent('HISTORY_UPDATED', { history: hist });
    return { checkpointHit: false, acted: false };
  }

  // Đọc bài tự nhiên trước khi tương tác nếu bật Human Warmup
  if (budgetCfg.enableHumanWarmup && minDelaySec >= 4) {
    await sleep(randomInt(900, 1900));
  }

  const execRes = await sendMessageToTabSafe(tabId, 'EXECUTE_THREAD_ACTIONS', {
    analysis,
    postText: threadInput.postText || '',
    recentSentComments: recentSent,
    allowEnterToSend,
    doLove,
    doCommentPost: effectiveDoComment,
    doReplyBuyers: effectiveDoReply,
    useCdp,
    minDelaySec,
    maxDelaySec,
  });

  const loved = execRes?.data?.lovedCount || 0;
  const commented = execRes?.data?.commentedCount || 0;
  const sentTexts = Array.isArray(execRes?.data?.sentTexts) ? execRes.data.sentTexts : [];
  stats.loved += loved;
  stats.commented += commented;

  if (commented > 0) {
    for (const txt of sentTexts) {
      kb = recordSentComment(kb, txt);
    }
    if (sentTexts.length === 0 && analysis.suggestedPostComment) {
      kb = recordSentComment(kb, analysis.suggestedPostComment);
    }
    kb = recordAuthorEngagement(kb, {
      uid: threadInput.postAuthorUid,
      name: threadInput.postAuthor,
      groupId: classifiedGroup.groupId,
      postUrl: threadInput.url || targetUrl,
    });
    if (hotness.temperature === 'hot' || hotness.temperature === 'warm') {
      kb = upsertLeadCrmItem(kb, {
        id: `lead_${postKey || Date.now()}`,
        author: threadInput.postAuthor,
        authorUid: threadInput.postAuthorUid,
        groupId: classifiedGroup.groupId,
        groupName,
        postUrl: threadInput.url || targetUrl,
        snippet: (threadInput.postText || '').slice(0, 220),
        need: analysis.postAuthorNeed || analysis.topicSummary || '',
        leadScore: hotness.score,
        temperature: hotness.temperature,
        suggestedReply: analysis.suggestedPostComment || '',
        status: 'engaged',
        createdAt: new Date().toISOString(),
      });
    }
  }

  kb = recordBudgetUsage(kb, { postsScanned: 1, loves: loved, comments: commented });
  kb = updateGroupRoiStats(kb, targetUrl, {
    postsScanned: 1,
    hotLeads: hotness.temperature === 'hot' ? 1 : 0,
    warmLeads: hotness.temperature === 'warm' ? 1 : 0,
    sellersSkipped: sellersCount,
    commentsSent: commented,
  });
  await saveMachineKnowledge(kb, false);

  const tempBadge = hotness.temperature === 'hot' ? `🔥${hotness.score}đ ` : hotness.temperature === 'warm' ? `⚡${hotness.score}đ ` : '';
  const summary = execRes?.ok
    ? `${tempBadge}❤️ Tim: ${loved} | 💬 Bình luận: ${commented} | 🚫 Bỏ Seller: ${sellersCount}`
    : `Lỗi: ${execRes?.error || 'Không thực thi được'}`;

  pushLogAndHud(tabId, `${execRes?.ok ? '✅' : '❌'} [${threadInput.postAuthor}] ${summary}`, execRes?.ok ? 'ok' : 'err', true, stats);

  await sendMessageToTabSafe(tabId, 'FINISH_ACTIVE_POST').catch(() => {});
  await markPostKeyProcessed(postKey);

  const hist = await appendRunHistory({
    timestamp: new Date().toISOString(),
    url: threadInput.url || targetUrl,
    postAuthor: threadInput.postAuthor,
    postType: `${tempBadge}${analysis.postType}`,
    modeUsed: analysis.modeUsed,
    status: execRes?.ok ? 'success' : 'error',
    summary,
  });
  broadcastEvent('HISTORY_UPDATED', { history: hist });

  return {
    checkpointHit: Boolean(execRes?.data?.checkpointHit),
    checkpointReason: execRes?.data?.checkpointReason || '',
    acted: Boolean(loved > 0 || commented > 0),
  };
}

async function runLinkQueueOrchestrator({
  tabId,
  links = [],
  mode = 'auto',
  naturalGoal = '',
  maxPostsPerGroup = 8,
  sortNewest = true,
  skipProcessed = true,
  useAi = true,
  doLove = true,
  doCommentPost = true,
  doReplyBuyers = true,
  allowEnterToSend = true,
  useCdp = false,
  minDelaySec = 8,
  maxDelaySec = 18,
}) {
  const myRunId = ++queueState.runId;
  queueState.running = true;
  queueState.stopRequested = false;
  queueState.activeTabId = tabId;

  const stats = { scanned: 0, loved: 0, commented: 0, skippedSeller: 0 };
  const isStopped = () => queueState.stopRequested || queueState.runId !== myRunId;

  try {
    pushLogAndHud(tabId, '🚀 Khởi động Agent trên tab Chrome...', 'ok', true, stats);

    for (let idx = 0; idx < links.length; idx++) {
      if (isStopped()) break;

      const rawUrl = String(links[idx] || '').trim();
      const classified = classifyFacebookTargetUrl(rawUrl, sortNewest);

      if (classified.kind === 'invalid') {
        pushLogAndHud(tabId, `⚠️ Bỏ qua link không hợp lệ: ${rawUrl}`, 'warn', true, stats);
        continue;
      }

      const currentTab = await chrome.tabs.get(tabId).catch(() => null);
      if (!currentTab) {
        throw new Error('Tab Facebook đã bị đóng.');
      }

      // Đưa tab Facebook đang chạy lên màn hình trước mắt người dùng ngay lập tức
      await chrome.tabs.update(tabId, { active: true }).catch(() => {});
      if (currentTab.windowId) {
        await chrome.windows.update(currentTab.windowId, { focused: true }).catch(() => {});
      }

      const currentUrl = currentTab.url || '';
      const alreadyOnSameGroup =
        classified.kind === 'group_feed' &&
        classified.groupId &&
        currentUrl.includes(`/groups/${classified.groupId}`) &&
        !/\/posts\/|\/permalink\//i.test(currentUrl);
      const alreadyOnExactPost =
        classified.kind !== 'group_feed' &&
        currentUrl.split('#')[0] === classified.navigateUrl.split('#')[0];

      if (!alreadyOnSameGroup && !alreadyOnExactPost) {
        pushLogAndHud(tabId, `🔗 [${idx + 1}/${links.length}] Đang mở: ${classified.navigateUrl}`, 'info', true, stats);
        const waitLoad = waitForTabComplete(tabId, 12000);
        await chrome.tabs.update(tabId, { url: classified.navigateUrl });
        await waitLoad;
        await sleep(1600);
      } else {
        await sleep(450);
      }

      if (isStopped()) break;
      await ensureAgentReady(tabId);
      pushLogAndHud(tabId, '✅ Đã kết nối tab Facebook — Bắt đầu quét!', 'ok', true, stats);

      // A. LUỒNG QUÉT TỰ ĐỘNG LINK GROUP TỔNG / FEED
      if (classified.kind === 'group_feed' || classified.kind === 'page_or_profile') {
        const [storedProcessed, sessStore] = await Promise.all([
          skipProcessed ? loadProcessedPostKeys() : Promise.resolve([]),
          chrome.storage.local.get(STORAGE_KEYS.SESSION_STATE),
        ]);
        const myUid = sessStore[STORAGE_KEYS.SESSION_STATE]?.uid || '';
        const sessionSkipKeys = [...storedProcessed];
        const targetPostCap = Math.max(1, Math.min(30, Number(maxPostsPerGroup) || 8));
        const maxScrollRounds = targetPostCap * 4 + 4;

        let evaluatedInGroup = 0;
        let scrollRounds = 0;

        while (!isStopped() && evaluatedInGroup < targetPostCap && scrollRounds < maxScrollRounds) {
          pushLogAndHud(
            tabId,
            `🔍 Đang tìm bài chưa tương tác ${evaluatedInGroup + 1}/${targetPostCap} trong Group...`,
            'info',
            true,
            stats
          );

          const scanRes = await sendMessageToTabSafe(tabId, 'SCAN_NEXT_GROUP_POST', {
            skipPostKeys: sessionSkipKeys,
            expandComments: true,
            skipAlreadyInteracted: skipProcessed,
            myUid,
          });

          if (Array.isArray(scanRes?.data?.skippedInteractedKeys) && scanRes.data.skippedInteractedKeys.length > 0) {
            for (const sk of scanRes.data.skippedInteractedKeys) {
              if (!sessionSkipKeys.includes(sk)) sessionSkipKeys.push(sk);
            }
            await markPostKeysProcessed(scanRes.data.skippedInteractedKeys);
          }

          if (!scanRes?.ok || !scanRes.data) {
            pushLogAndHud(tabId, `⚠️ Lỗi quét Group: ${scanRes?.error || 'DOM chưa sẵn sàng'}`, 'warn', true, stats);
            scrollRounds++;
            await sleep(1200);
            continue;
          }

          if (scanRes.data.checkpointHit) {
            pushLogAndHud(tabId, `🛡️ Dừng khẩn cấp: ${scanRes.data.checkpointReason}`, 'err', false, stats);
            queueState.stopRequested = true;
            break;
          }

          if (!scanRes.data.found) {
            scrollRounds++;
            if (scanRes.data.endReached && scrollRounds >= 3) {
              pushLogAndHud(tabId, '🏁 Đã quét hết bài mới hiển thị trong Group.', 'ok', true, stats);
              break;
            }
            pushLogAndHud(tabId, `⬇️ Đang cuộn xuống nạp thêm bài mới (${scrollRounds})...`, 'info', true, stats);
            await sleep(900);
            continue;
          }

          evaluatedInGroup++;
          stats.scanned++;
          if (scanRes.data.postKey) sessionSkipKeys.push(scanRes.data.postKey);

          const res = await processSingleExtractedThread({
            tabId,
            threadInput: scanRes.data.threadInput,
            postKey: scanRes.data.postKey,
            commentsDisabled: scanRes.data.commentsDisabled,
            targetUrl: classified.navigateUrl,
            mode,
            naturalGoal,
            useAi,
            doLove,
            doCommentPost,
            doReplyBuyers,
            allowEnterToSend,
            useCdp,
            minDelaySec,
            maxDelaySec,
            stats,
          });

          if (res.checkpointHit) {
            pushLogAndHud(tabId, `🛡️ Dừng khẩn cấp bảo vệ nick: ${res.checkpointReason}`, 'err', false, stats);
            queueState.stopRequested = true;
            break;
          }

          // Tăng năng suất: Bài nào BỎ QUA (spam/cũ/không hợp) chỉ lướt tiếp sau 1.5-2.5s; bài đã tương tác mới nghỉ sinh học đủ nhịp!
          if (!isStopped() && evaluatedInGroup < targetPostCap) {
            if (!res.acted) {
              pushLogAndHud(tabId, '⚡ Bỏ qua nhanh → chuyển ngay sang bài mới...', 'info', true, stats);
              await sleep(randomInt(1500, 2400));
            } else {
              const waitSec = randomInt(minDelaySec, maxDelaySec);
              for (let s = waitSec; s > 0; s--) {
                if (isStopped()) break;
                pushLogAndHud(tabId, `⏳ Nghỉ sinh học ${s}s trước bài tiếp theo...`, 'info', true, stats);
                await sleep(1000);
              }
            }
          }
        }
      } else {
        // B. LUỒNG CHẠY TRỰC TIẾP 1 LINK BÀI VIẾT CỤ THỂ
        const sessStore = await chrome.storage.local.get(STORAGE_KEYS.SESSION_STATE);
        const myUid = sessStore[STORAGE_KEYS.SESSION_STATE]?.uid || '';
        pushLogAndHud(tabId, `📖 Đang đọc bài viết & bình luận...`, 'info', true, stats);
        const readRes = await sendMessageToTabSafe(tabId, 'READ_POST_AND_COMMENTS', { expandComments: true, myUid });
        if (!readRes?.ok || !readRes.data) {
          const errMsg = readRes?.error || 'Không đọc được nội dung bài viết.';
          pushLogAndHud(tabId, `❌ ${errMsg}`, 'err', true, stats);
          continue;
        }

        stats.scanned++;
        const res = await processSingleExtractedThread({
          tabId,
          threadInput: readRes.data,
          postKey: readRes.data.postKey,
          commentsDisabled: readRes.data.commentsDisabled,
          targetUrl: classified.navigateUrl,
          mode,
          naturalGoal,
          useAi,
          doLove,
          doCommentPost,
          doReplyBuyers,
          allowEnterToSend,
          useCdp,
          minDelaySec,
          maxDelaySec,
          stats,
        });

        if (res.checkpointHit) {
          pushLogAndHud(tabId, `🛡️ Dừng khẩn cấp bảo vệ nick: ${res.checkpointReason}`, 'err', false, stats);
          break;
        }

        if (idx < links.length - 1 && !isStopped()) {
          const waitSec = randomInt(minDelaySec, maxDelaySec);
          for (let s = waitSec; s > 0; s--) {
            if (isStopped()) break;
            pushLogAndHud(tabId, `⏳ Nghỉ sinh học ${s}s trước link tiếp theo...`, 'info', true, stats);
            await sleep(1000);
          }
        }
      }
    }
  } catch (err) {
    pushLogAndHud(tabId, `🚨 Lỗi Agent: ${err?.message || String(err)}`, 'err', false, stats);
  } finally {
    if (queueState.runId === myRunId) {
      queueState.running = false;
      await sendMessageToTabSafe(tabId, 'FINISH_ACTIVE_POST').catch(() => {});
      const finalMsg = queueState.stopRequested
        ? `⏹ Đã dừng (${stats.scanned} bài | ❤️ ${stats.loved} | 💬 ${stats.commented})`
        : `🎉 Hoàn tất! Đã quét ${stats.scanned} bài | ❤️ ${stats.loved} | 💬 ${stats.commented} | 🚫 Bỏ Seller ${stats.skippedSeller}`;
      pushLogAndHud(tabId, finalMsg, queueState.stopRequested ? 'warn' : 'ok', false, stats);
    }
  }
}

// ============================================================================
// 5. HYBRID SERVER & AUTO-SYNC COOKIE SESSION + UPDATE WATCHER
// ============================================================================

async function handleHybridPing(serverUrl) {
  const cleanBase = String(serverUrl || 'http://127.0.0.1:3300').replace(/\/+$/, '');
  const res = await fetch(`${cleanBase}/healthz`, { method: 'GET' });
  if (!res.ok) throw new Error(`Server trả về HTTP ${res.status}`);
  return await res.json();
}

async function handlePlaywrightRunLink(serverUrl, payload) {
  const cleanBase = String(serverUrl || 'http://127.0.0.1:3300').replace(/\/+$/, '');
  const res = await fetch(`${cleanBase}/api/agent/run-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `Playwright Server HTTP ${res.status}`);
  }
  return json;
}

async function syncFacebookSessionNow({ pushToServer = true, force = false } = {}) {
  const cookies = await chrome.cookies.getAll({ domain: 'facebook.com' }).catch(() => []);
  const cUser = cookies.find((c) => c.name === 'c_user' && c.value);
  const xs = cookies.find((c) => c.name === 'xs' && c.value);
  const uid = cUser?.value || '';
  const loggedIn = Boolean(uid && xs?.value);

  const stored = await chrome.storage.local.get([STORAGE_KEYS.HYBRID_CONFIG, STORAGE_KEYS.SESSION_STATE]);
  const hybrid = stored[STORAGE_KEYS.HYBRID_CONFIG] || {};
  const prevSession = stored[STORAGE_KEYS.SESSION_STATE] || {};
  const serverUrl = String(hybrid.serverUrl || 'http://127.0.0.1:3300').replace(/\/+$/, '');

  const sessionState = {
    uid,
    loggedIn,
    cookiesCount: cookies.length,
    lastCheckedAt: new Date().toISOString(),
    lastSyncedAt: prevSession.lastSyncedAt || null,
    serverSyncedOk: false,
    updateAvailable: prevSession.updateAvailable || false,
    latestBuildHash: prevSession.latestBuildHash || null,
  };

  const recentlySyncedSameUid =
    !force &&
    prevSession.uid === uid &&
    prevSession.serverSyncedOk &&
    prevSession.lastSyncedAt &&
    Date.now() - Date.parse(prevSession.lastSyncedAt) < 300000;

  if (loggedIn && pushToServer && (force || (hybrid.autoSyncSession !== false && !recentlySyncedSameUid))) {
    try {
      const res = await fetch(`${serverUrl}/api/extension/sync-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, cookies }),
      });
      if (res.ok) {
        const data = await res.json();
        sessionState.lastSyncedAt = data.syncedAt || new Date().toISOString();
        sessionState.serverSyncedOk = true;
      }
    } catch {}
  } else if (recentlySyncedSameUid) {
    sessionState.serverSyncedOk = true;
  }

  try {
    const extRes = await fetch(`${serverUrl}/api/extension/status`);
    if (extRes.ok) {
      const extInfo = await extRes.json();
      if (extInfo?.buildHash) {
        if (prevSession.knownBuildHash && prevSession.knownBuildHash !== extInfo.buildHash) {
          sessionState.updateAvailable = true;
          if (hybrid.autoReloadExt && !queueState.running) {
            await chrome.storage.local.set({
              [STORAGE_KEYS.SESSION_STATE]: { ...sessionState, knownBuildHash: extInfo.buildHash, updateAvailable: false },
            });
            chrome.runtime.reload();
            return sessionState;
          }
        }
        sessionState.knownBuildHash = prevSession.knownBuildHash || extInfo.buildHash;
        sessionState.latestBuildHash = extInfo.buildHash;
      }
    }
  } catch {}

  await chrome.storage.local.set({ [STORAGE_KEYS.SESSION_STATE]: sessionState });
  broadcastEvent('SESSION_UPDATED', sessionState);
  return sessionState;
}

let cookieDebounceTimer = null;
chrome.cookies?.onChanged?.addListener((changeInfo) => {
  const domain = changeInfo?.cookie?.domain || '';
  const name = changeInfo?.cookie?.name || '';
  if (!domain.includes('facebook.com')) return;
  if (name === 'c_user' || name === 'xs') {
    if (cookieDebounceTimer) clearTimeout(cookieDebounceTimer);
    cookieDebounceTimer = setTimeout(() => {
      syncFacebookSessionNow({ pushToServer: true }).catch(() => {});
    }, 3000);
  }
});

chrome.alarms?.create?.('fb_exten_session_keepalive', { periodInMinutes: 15 });
chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm?.name === 'fb_exten_session_keepalive') {
    syncFacebookSessionNow({ pushToServer: true }).catch(() => {});
  } else if (alarm?.name === 'fb_exten_autopilot_tick') {
    runAutoPilotCycle({ manual: false }).catch(() => {});
  }
});

chrome.runtime.onInstalled?.addListener(() => {
  injectAgentIntoOpenFacebookTabs().catch(() => {});
  syncFacebookSessionNow({ pushToServer: true }).catch(() => {});
  loadMachineKnowledge().then((kb) => syncAutoPilotAlarm(kb.autoPilot)).catch(() => {});
});
chrome.runtime.onStartup?.addListener(() => {
  syncFacebookSessionNow({ pushToServer: true }).catch(() => {});
  loadMachineKnowledge().then((kb) => syncAutoPilotAlarm(kb.autoPilot)).catch(() => {});
});

// ============================================================================
// 5.5. BỘ NHỚ TỰ HỌC F12 THEO MÁY, GHI MẪU, AUTO-PILOT & CHẠY LẠI MỌI TÁC VỤ MXH
// ============================================================================

async function loadMachineKnowledge() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.MACHINE_KNOWLEDGE);
  return normalizeMachineKnowledge(stored[STORAGE_KEYS.MACHINE_KNOWLEDGE]);
}

async function syncAutoPilotAlarm(autoPilot) {
  try {
    await chrome.alarms?.clear?.('fb_exten_autopilot_tick');
    if (autoPilot?.enabled) {
      const periodInMinutes = Math.max(10, Math.min(240, Number(autoPilot.intervalMinutes) || 30));
      chrome.alarms?.create?.('fb_exten_autopilot_tick', { periodInMinutes });
    }
  } catch {}
}

async function runAutoPilotCycle({ manual = false, preferredTabId = null, mode, naturalGoal } = {}) {
  if (queueState.running) return { started: false, reason: 'Agent đang bận chạy lượt khác.' };

  let kb = await loadMachineKnowledge();
  if (!manual && !kb.autoPilot?.enabled) return { started: false, reason: 'Auto-Pilot đang tắt.' };

  const budget = checkActionBudget(kb);
  if (!manual && !budget.allowed) {
    return { started: false, reason: budget.reason };
  }

  const chosenGroups = pickNextScheduledGroups(kb, kb.autoPilot?.groupsPerCycle || 2);
  if (chosenGroups.length === 0) {
    return { started: false, reason: 'Chưa có đường dẫn Group nào trong Thư viện Groups đã lưu.' };
  }

  let tabId = preferredTabId;
  if (!tabId) {
    const fbTabs = await chrome.tabs.query({ url: 'https://*.facebook.com/*' }).catch(() => []);
    const chosenTab = fbTabs.find((t) => t.active) || fbTabs[0];
    if (chosenTab?.id) {
      tabId = chosenTab.id;
    } else if (manual) {
      const created = await chrome.tabs.create({ url: chosenGroups[0].url, active: true });
      tabId = created.id;
    } else {
      return { started: false, reason: 'Chưa có tab facebook.com nào đang mở cho Auto-Pilot.' };
    }
  }

  const prefsStore = await chrome.storage.local.get('fb_exten_runner_prefs');
  const prefs = prefsStore.fb_exten_runner_prefs || {};

  kb.autoPilot = { ...(kb.autoPilot || { enabled: false, intervalMinutes: 30, groupsPerCycle: 2 }), lastCycleAt: new Date().toISOString() };
  await saveMachineKnowledge(kb, false);

  runLinkQueueOrchestrator({
    tabId,
    links: chosenGroups.map((g) => g.url),
    mode: mode || prefs.mode || 'auto',
    naturalGoal: naturalGoal ?? prefs.naturalGoal ?? '',
    maxPostsPerGroup: kb.budgetConfig?.maxPostsPerGroupRun || 6,
    sortNewest: prefs.sortNewest !== false,
    skipProcessed: prefs.skipProcessed !== false,
    useAi: true,
    doLove: true,
    doCommentPost: true,
    doReplyBuyers: true,
    useCdp: false,
    minDelaySec: Number(prefs.minDelay) || 8,
    maxDelaySec: Number(prefs.maxDelay) || 18,
  });

  return { started: true, groups: chosenGroups.map((g) => ({ name: g.name, tier: g.tier || 'B', url: g.url })) };
}

async function saveMachineKnowledge(kb, syncToServer = true) {
  await chrome.storage.local.set({ [STORAGE_KEYS.MACHINE_KNOWLEDGE]: kb });
  broadcastEvent('KNOWLEDGE_UPDATED', { knowledge: kb });
  if (syncToServer) {
    try {
      const st = await chrome.storage.local.get(STORAGE_KEYS.HYBRID_CONFIG);
      const serverUrl = String(st[STORAGE_KEYS.HYBRID_CONFIG]?.serverUrl || 'http://127.0.0.1:3300').replace(/\/+$/, '');
      fetch(`${serverUrl}/api/extension/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledge: kb }),
      }).catch(() => {});
    } catch {}
  }
  return kb;
}

async function loadRecorderDraft() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.RECORDER_DRAFT);
  return stored[STORAGE_KEYS.RECORDER_DRAFT] || { active: false, startedAt: null, steps: [] };
}

async function saveRecorderDraft(draft) {
  await chrome.storage.local.set({ [STORAGE_KEYS.RECORDER_DRAFT]: draft });
  broadcastEvent('RECORDER_UPDATED', draft);
  return draft;
}

async function notifyAllSocialTabs(type, payload = {}) {
  const tabs = await chrome.tabs.query({ url: ['https://*.facebook.com/*', 'https://*.messenger.com/*'] }).catch(() => []);
  for (const t of tabs) {
    if (t.id) {
      await sendMessageToTabSafe(t.id, type, payload).catch(() => {});
    }
  }
}

async function resolveDynamicWorkflowText(rawValue, { pageUrl, pageTitle, naturalGoal, smartAdapt = true }) {
  const val = String(rawValue || '').trim();
  if (!val) return '';

  const [stored, kb] = await Promise.all([
    chrome.storage.local.get([STORAGE_KEYS.CUSTOM_RULE, STORAGE_KEYS.AI_KEYS, STORAGE_KEYS.AI_CONFIG]),
    loadMachineKnowledge(),
  ]);
  const customRule = stored[STORAGE_KEYS.CUSTOM_RULE] || {};
  const rawPool = Array.isArray(stored[STORAGE_KEYS.AI_KEYS]) ? stored[STORAGE_KEYS.AI_KEYS] : [];
  const aiConfig = stored[STORAGE_KEYS.AI_CONFIG] || {};
  const targetGroup = findLearnedGroupByUrl(kb, pageUrl || '');

  const shouldUseAi = smartAdapt || val.includes('{{AI}}');
  if (!shouldUseAi) return val;

  try {
    const prompt = buildSmartAdaptInputPrompt(
      val,
      targetGroup,
      kb,
      pageTitle || pageUrl,
      naturalGoal,
      customRule.aiSystemPrompt || ''
    );
    const aiRes = await callSmartAiBrain({
      prompt,
      preferredProvider: aiConfig.preferredProvider || 'groq',
    });
    const adapted = sanitizeSingleCommentText((aiRes.text || '').trim().replace(/^["'“”]|["'“”]$/g, ''));
    if (adapted) return adapted;
  } catch {}

  return applyOfflineSmartAdaptation(val, targetGroup, kb);
}

async function runAiCritiqueDemo({ workflowId, steps, name, category } = {}) {
  let kb = await loadMachineKnowledge();
  const wf = workflowId ? (kb.workflows || []).find((w) => w.id === workflowId) : null;
  const draft = !wf && !Array.isArray(steps) ? await loadRecorderDraft() : null;
  const targetSteps = wf ? wf.steps : Array.isArray(steps) ? steps : draft?.steps || [];
  if (!targetSteps || targetSteps.length === 0) {
    throw new Error('Chưa có bước làm mẫu nào để AI nhận xét. Hãy Ghi Mẫu hoặc chọn 1 kịch bản đã lưu.');
  }

  const input = {
    name: wf?.name || name || 'Bản làm mẫu mới',
    category: wf?.category || category || 'custom',
    steps: targetSteps,
  };

  const stored = await chrome.storage.local.get(STORAGE_KEYS.AI_CONFIG);
  const aiConfig = stored[STORAGE_KEYS.AI_CONFIG] || {};

  let review;
  let aiError = '';

  try {
    const prompt = buildDemoCritiquePrompt(input, kb);
    const aiRes = await callSmartAiBrain({
      prompt,
      preferredProvider: aiConfig.preferredProvider || 'groq',
    });
    review = parseDemoCritiqueResponse(aiRes.text, input, kb);
  } catch (err) {
    aiError = err?.message || String(err);
    review = analyzeDemoOffline(input, kb);
  }

  if (wf) {
    kb.workflows = (kb.workflows || []).map((w) =>
      w.id === wf.id ? { ...w, aiReview: review, updatedAt: new Date().toISOString() } : w
    );
  }
  kb = mergeDistilledStrategyIntoMemory(kb, review);
  await saveMachineKnowledge(kb, true);
  return { review, knowledge: kb, aiError };
}

async function runAiAnalyzeGroupPlaybook({ groupId, url, tabId } = {}) {
  let kb = await loadMachineKnowledge();
  let group = findLearnedGroupByUrl(kb, groupId || url || '');
  if (!group) {
    throw new Error('Không tìm thấy Group này trong Thư viện Groups đã lưu.');
  }

  // Nếu tab hiện tại đang mở đúng Group đó, lấy thêm vài bài viết thực tế trên màn hình để AI hiểu đúng văn hóa nhóm
  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      const tabClassified = tab?.url ? classifyFacebookTargetUrl(tab.url, false) : null;
      const grpClassified = classifyFacebookTargetUrl(group.url, false);
      if (tabClassified?.groupId && grpClassified?.groupId && tabClassified.groupId === grpClassified.groupId) {
        const capRes = await sendMessageToTabSafe(tabId, 'CAPTURE_PAGE_SNIPPETS', { maxCount: 4 }).catch(() => null);
        if (capRes?.ok && Array.isArray(capRes.data?.snippets)) {
          for (const s of capRes.data.snippets) {
            kb = appendGroupSampleSnippet(kb, group.url, s, group.name);
          }
          group = findLearnedGroupByUrl(kb, group.id) || group;
        }
      }
    } catch {}
  }

  const stored = await chrome.storage.local.get(STORAGE_KEYS.AI_CONFIG);
  const aiConfig = stored[STORAGE_KEYS.AI_CONFIG] || {};

  let playbook;
  let aiError = '';

  try {
    const prompt = buildGroupPlaybookPrompt(group, kb);
    const aiRes = await callSmartAiBrain({
      prompt,
      preferredProvider: aiConfig.preferredProvider || 'groq',
    });
    playbook = parseGroupPlaybookResponse(aiRes.text, group, kb);
  } catch (err) {
    aiError = err?.message || String(err);
    playbook = analyzeGroupPlaybookOffline(group, kb);
  }

  kb.learnedGroups = (kb.learnedGroups || []).map((g) => (g.id === group.id ? { ...g, playbook } : g));
  await saveMachineKnowledge(kb, true);
  return { group: { ...group, playbook }, playbook, knowledge: kb, aiError };
}

async function runAiCoachPortfolio() {
  let kb = await loadMachineKnowledge();
  const stored = await chrome.storage.local.get(STORAGE_KEYS.AI_CONFIG);
  const aiConfig = stored[STORAGE_KEYS.AI_CONFIG] || {};

  let strategyMemory;
  let aiError = '';

  try {
    const prompt = buildPortfolioStrategyPrompt(kb);
    const aiRes = await callSmartAiBrain({
      prompt,
      preferredProvider: aiConfig.preferredProvider || 'groq',
    });
    strategyMemory = parsePortfolioStrategyResponse(aiRes.text, kb);
  } catch (err) {
    aiError = err?.message || String(err);
    strategyMemory = analyzePortfolioStrategyOffline(kb);
  }

  kb.strategyMemory = strategyMemory;

  // Bổ sung nhanh Playbook cơ sở cho các Group chưa có Playbook để AI có ngay định hướng tệp nhóm khi quét
  kb.learnedGroups = (kb.learnedGroups || []).map((g) =>
    g.kind === 'group_feed' && !g.playbook ? { ...g, playbook: analyzeGroupPlaybookOffline(g, kb) } : g
  );

  await saveMachineKnowledge(kb, true);
  return { strategyMemory, knowledge: kb, aiError };
}

async function runSavedWorkflowOrchestrator({
  tabId,
  workflowId,
  applyGroupUrls = [],
  repeatCount = 1,
  useCdp = false,
  naturalGoal = '',
  smartAdapt = true,
  minDelaySec = 6,
  maxDelaySec = 14,
}) {
  const kb = await loadMachineKnowledge();
  const workflow = (kb.workflows || []).find((w) => w.id === workflowId);
  if (!workflow) throw new Error('Không tìm thấy Kịch bản MXH đã lưu.');

  const myRunId = ++queueState.runId;
  queueState.running = true;
  queueState.stopRequested = false;
  queueState.activeTabId = tabId;

  const isStopped = () => queueState.stopRequested || queueState.runId !== myRunId;
  const targets =
    Array.isArray(applyGroupUrls) && applyGroupUrls.length > 0
      ? applyGroupUrls
      : Array.from({ length: Math.max(1, Math.min(20, Number(repeatCount) || 1)) }, () => '');

  const stats = { scanned: 0, loved: 0, commented: 0, skippedSeller: 0 };

  try {
    const currentTab = await chrome.tabs.get(tabId).catch(() => null);
    if (!currentTab) throw new Error('Tab đích đã bị đóng.');
    await chrome.tabs.update(tabId, { active: true }).catch(() => {});
    if (currentTab.windowId) {
      await chrome.windows.update(currentTab.windowId, { focused: true }).catch(() => {});
    }

    for (let rIdx = 0; rIdx < targets.length; rIdx++) {
      if (isStopped()) break;
      const overrideUrl = targets[rIdx];
      const steps = buildReplayWorkflowPlan(workflow, overrideUrl || undefined);

      pushLogAndHud(
        tabId,
        `🎬 [${rIdx + 1}/${targets.length}] ${smartAdapt ? '🧠 AI tùy biến' : '⚙️ Chạy mẫu'} "${workflow.name}" (${steps.length} bước)...`,
        'ok',
        true,
        stats
      );

      for (let sIdx = 0; sIdx < steps.length; sIdx++) {
        if (isStopped()) break;
        const step = steps[sIdx];
        pushLogAndHud(tabId, `▶ Bước ${sIdx + 1}/${steps.length}: ${step.label}`, 'info', true, stats);

        if (step.type === 'navigate' && step.url) {
          const cur = await chrome.tabs.get(tabId).catch(() => null);
          const curUrl = (cur?.url || '').split('#')[0];
          const destUrl = step.url.split('#')[0];
          if (curUrl !== destUrl) {
            const waitLoad = waitForTabComplete(tabId, 12000);
            await chrome.tabs.update(tabId, { url: step.url });
            await waitLoad;
            await sleep(1600);
          }
          await ensureAgentReady(tabId);
        } else {
          await ensureAgentReady(tabId);
          const tabNow = await chrome.tabs.get(tabId).catch(() => null);
          const resolvedText =
            step.type === 'input'
              ? await resolveDynamicWorkflowText(step.value || '', {
                  pageUrl: tabNow?.url || step.url,
                  pageTitle: tabNow?.title || step.pageTitle,
                  naturalGoal,
                  smartAdapt,
                })
              : undefined;
          if (step.type === 'input' && smartAdapt && resolvedText && resolvedText !== step.value) {
            pushLogAndHud(tabId, `🧠 AI đã tùy biến nội dung đúng tệp nhóm hiện tại`, 'ok', true, stats);
          }

          const nextStep = steps[sIdx + 1];
          const autoEnterAfterInput =
            step.type === 'input' &&
            (step.intent === 'comment_editor' || step.intent === 'reply_editor') &&
            (!nextStep || (nextStep.type !== 'keypress' && nextStep.intent !== 'comment_submit'));

          const res = await sendMessageToTabSafe(tabId, 'EXECUTE_RECORDED_STEP', {
            step,
            resolvedText,
            useCdp,
            autoEnterAfterInput,
          });

          if (res?.data?.checkpointHit) {
            pushLogAndHud(tabId, `🛡️ Dừng khẩn cấp bảo vệ nick: ${res.data.checkpointReason}`, 'err', false, stats);
            queueState.stopRequested = true;
            break;
          }

          if (!res?.ok) {
            pushLogAndHud(tabId, `⚠️ Bước ${sIdx + 1} chưa khớp: ${res?.error || 'Bỏ qua sang bước kế'}`, 'warn', true, stats);
          } else {
            if (step.type === 'input' && resolvedText) {
              let kbSent = await loadMachineKnowledge();
              kbSent = recordSentComment(kbSent, resolvedText);
              await saveMachineKnowledge(kbSent, false);
            }
            if (step.intent === 'like_btn' || step.intent === 'love_btn') stats.loved++;
            if (step.intent === 'comment_submit' || step.intent === 'create_post_submit' || step.intent === 'messenger_send') {
              stats.commented++;
            }
          }
        }

        if (!isStopped() && sIdx < steps.length - 1) {
          await sleep(Math.max(450, Math.min(5000, step.delayMs || 1100)));
        }
      }

      stats.scanned++;

      if (!isStopped() && rIdx < targets.length - 1) {
        const waitSec = randomInt(minDelaySec, maxDelaySec);
        for (let s = waitSec; s > 0; s--) {
          if (isStopped()) break;
          pushLogAndHud(tabId, `⏳ Nghỉ sinh học ${s}s trước lượt/Group tiếp theo...`, 'info', true, stats);
          await sleep(1000);
        }
      }
    }

    // Tăng bộ đếm số lần chạy của kịch bản
    const latestKb = await loadMachineKnowledge();
    latestKb.workflows = (latestKb.workflows || []).map((w) =>
      w.id === workflow.id ? { ...w, runCount: (w.runCount || 0) + 1, updatedAt: new Date().toISOString() } : w
    );
    await saveMachineKnowledge(latestKb);

    const hist = await appendRunHistory({
      timestamp: new Date().toISOString(),
      url: targets[0] || workflow.steps[0]?.url || 'facebook.com',
      postAuthor: workflow.name,
      postType: `Kịch bản MXH (${workflow.category})`,
      modeUsed: 'workflow',
      status: 'success',
      summary: `Hoàn tất ${stats.scanned}/${targets.length} lượt (${workflow.steps.length} bước)`,
    });
    broadcastEvent('HISTORY_UPDATED', { history: hist });
  } catch (err) {
    pushLogAndHud(tabId, `🚨 Lỗi chạy kịch bản: ${err?.message || String(err)}`, 'err', false, stats);
  } finally {
    if (queueState.runId === myRunId) {
      queueState.running = false;
      const doneMsg = queueState.stopRequested
        ? `⏹ Đã dừng kịch bản "${workflow.name}".`
        : `🎉 Đã chạy xong kịch bản "${workflow.name}" (${stats.scanned} lượt)!`;
      pushLogAndHud(tabId, doneMsg, queueState.stopRequested ? 'warn' : 'ok', false, stats);
    }
  }
}

// ============================================================================
// 6. MESSAGE ROUTER
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  (async () => {
    try {
      switch (message.type) {
        case 'OPEN_SIDEPANEL': {
          const tabId = message.tabId || sender?.tab?.id;
          if (tabId && chrome.sidePanel?.open) {
            await chrome.sidePanel.open({ tabId });
          }
          sendResponse({ ok: true });
          break;
        }

        case 'ENSURE_AGENT_READY': {
          const tabId = message.tabId || sender?.tab?.id;
          if (!tabId) throw new Error('Không xác định được Tab ID.');
          await ensureAgentReady(tabId);
          sendResponse({ ok: true });
          break;
        }

        case 'CALL_AI_POOL': {
          const res = await callAiPoolRaw(message.payload || {});
          sendResponse({ ok: true, data: res });
          break;
        }

        case 'ANALYZE_THREAD_AI': {
          const res = await analyzeThreadWithSelfLearning(message.payload || {});
          sendResponse({ ok: true, data: res });
          break;
        }

        case 'TEACH_AI': {
          const { text, role, need, goodReply } = message.payload || {};
          const stored = await chrome.storage.local.get(STORAGE_KEYS.LEARNING_MEMORY);
          const memory = stored[STORAGE_KEYS.LEARNING_MEMORY] || createDefaultLearningMemory();
          const updated = teachAiCorrection(memory, text, role, need, goodReply);
          await chrome.storage.local.set({ [STORAGE_KEYS.LEARNING_MEMORY]: updated });
          sendResponse({ ok: true, data: { memory: updated } });
          break;
        }

        case 'RUN_LINK_QUEUE': {
          runLinkQueueOrchestrator(message.payload || {});
          sendResponse({ ok: true });
          break;
        }

        case 'STOP_LINK_QUEUE': {
          queueState.stopRequested = true;
          queueState.running = false;
          if (queueState.activeTabId) {
            await sendMessageToTabSafe(queueState.activeTabId, 'STOP_THREAD_ACTIONS').catch(() => {});
          }
          sendResponse({ ok: true });
          break;
        }

        case 'CDP_HOVER': {
          const tabId = message.tabId || sender?.tab?.id;
          if (!tabId) throw new Error('Không xác định được Tab ID.');
          await cdpHoverAt(tabId, message.x, message.y);
          sendResponse({ ok: true });
          break;
        }

        case 'CDP_CLICK': {
          const tabId = message.tabId || sender?.tab?.id;
          if (!tabId) throw new Error('Không xác định được Tab ID.');
          await cdpClickAt(tabId, message.x, message.y);
          sendResponse({ ok: true });
          break;
        }

        case 'CDP_INSERT_TEXT': {
          const tabId = message.tabId || sender?.tab?.id;
          if (!tabId) throw new Error('Không xác định được Tab ID.');
          await cdpTypeHumanText(tabId, message.text || '');
          sendResponse({ ok: true });
          break;
        }

        case 'CDP_PRESS_ENTER': {
          const tabId = message.tabId || sender?.tab?.id;
          if (!tabId) throw new Error('Không xác định được Tab ID.');
          await cdpPressEnter(tabId);
          sendResponse({ ok: true });
          break;
        }

        case 'CDP_DETACH': {
          const tabId = message.tabId || sender?.tab?.id;
          if (tabId && attachedDebuggerTabs.has(tabId)) {
            await chrome.debugger.detach({ tabId }).catch(() => {});
            attachedDebuggerTabs.delete(tabId);
          }
          sendResponse({ ok: true });
          break;
        }

        case 'HYBRID_PING': {
          const data = await handleHybridPing(message.serverUrl);
          sendResponse({ ok: true, data });
          break;
        }

        case 'PLAYWRIGHT_RUN_LINK': {
          const data = await handlePlaywrightRunLink(message.serverUrl, message.payload);
          sendResponse({ ok: true, data });
          break;
        }

        case 'SYNC_SESSION_NOW': {
          const data = await syncFacebookSessionNow({ pushToServer: true, force: true });
          sendResponse({ ok: true, data });
          break;
        }

        case 'RELOAD_EXTENSION': {
          const st = await chrome.storage.local.get(STORAGE_KEYS.SESSION_STATE);
          const prev = st[STORAGE_KEYS.SESSION_STATE] || {};
          await chrome.storage.local.set({
            [STORAGE_KEYS.SESSION_STATE]: {
              ...prev,
              knownBuildHash: prev.latestBuildHash || prev.knownBuildHash || null,
              updateAvailable: false,
            },
          });
          chrome.runtime.reload();
          sendResponse({ ok: true });
          break;
        }

        case 'GET_MACHINE_KNOWLEDGE': {
          const kb = await loadMachineKnowledge();
          const draft = await loadRecorderDraft();
          sendResponse({ ok: true, data: { knowledge: kb, draft } });
          break;
        }

        case 'GET_RECORDER_STATE': {
          const draft = await loadRecorderDraft();
          sendResponse({ ok: true, data: draft });
          break;
        }

        case 'START_DEMO_RECORDING': {
          const { startUrl, startTitle } = message.payload || {};
          const initialSteps = [];
          if (startUrl && /facebook\.com|messenger\.com/i.test(startUrl)) {
            let kb = await loadMachineKnowledge();
            kb = upsertLearnedGroup(kb, startUrl, startTitle || '', 'demo');
            await saveMachineKnowledge(kb, false);
            initialSteps.push({
              id: `st_${Date.now()}_init`,
              type: 'navigate',
              intent: 'custom',
              label: `Mở trang: ${(startTitle || startUrl).replace(/\s*\|\s*Facebook$/i, '').slice(0, 48)}`,
              url: startUrl,
              pageTitle: startTitle || '',
              delayMs: 1000,
              timestamp: Date.now(),
            });
          }
          const draft = await saveRecorderDraft({
            active: true,
            startedAt: new Date().toISOString(),
            steps: initialSteps,
          });
          await notifyAllSocialTabs('START_DEMO_RECORDER');
          sendResponse({ ok: true, data: draft });
          break;
        }

        case 'STOP_DEMO_RECORDING': {
          const prev = await loadRecorderDraft();
          const compacted = compactRecordedSteps(prev.steps || []);
          const draft = await saveRecorderDraft({
            active: false,
            startedAt: prev.startedAt,
            steps: compacted,
          });
          await notifyAllSocialTabs('STOP_DEMO_RECORDER');
          const kb = await loadMachineKnowledge();
          kb.totalDemosRecorded = (kb.totalDemosRecorded || 0) + (compacted.length > 0 ? 1 : 0);
          await saveMachineKnowledge(kb, true);
          sendResponse({ ok: true, data: { draft, knowledge: kb } });
          break;
        }

        case 'CLEAR_RECORDER_DRAFT': {
          const draft = await saveRecorderDraft({ active: false, startedAt: null, steps: [] });
          await notifyAllSocialTabs('STOP_DEMO_RECORDER');
          sendResponse({ ok: true, data: draft });
          break;
        }

        case 'RECORD_STEP_EVENT': {
          const step = message.payload?.step;
          if (!step) {
            sendResponse({ ok: false, error: 'Thiếu step.' });
            break;
          }
          const prev = await loadRecorderDraft();
          if (!prev.active) {
            sendResponse({ ok: true, data: prev });
            break;
          }
          const steps = compactRecordedSteps([...(prev.steps || []), step]);
          const draft = await saveRecorderDraft({ ...prev, steps });

          let kb = await loadMachineKnowledge();
          if (step.url) {
            kb = upsertLearnedGroup(kb, step.url, step.pageTitle || '', 'demo');
            const ctxSnippets = Array.isArray(message.payload?.pageContextSnippets)
              ? message.payload.pageContextSnippets
              : [];
            for (const snip of ctxSnippets) {
              kb = appendGroupSampleSnippet(kb, step.url, snip, step.pageTitle || '');
            }
          }
          if (step.fingerprint && step.intent && step.intent !== 'custom') {
            kb = upsertLearnedRoleProfile(kb, step.intent, step.fingerprint);
          }
          // Tự học giọng văn thật từ câu người dùng gõ trong lúc Làm Mẫu
          if (
            step.type === 'input' &&
            step.value &&
            (step.intent === 'comment_editor' || step.intent === 'reply_editor' || step.intent === 'create_post_editor')
          ) {
            const matchedG = step.url ? findLearnedGroupByUrl(kb, step.url) : undefined;
            kb = recordUserStyleSample(kb, {
              text: step.value,
              groupId: matchedG?.id,
              groupName: matchedG?.name || step.pageTitle || '',
              intent: step.intent,
            });
          }
          await saveMachineKnowledge(kb, false);
          sendResponse({ ok: true, data: { draft, knowledge: kb } });
          break;
        }

        case 'SAVE_LEARNED_F12_TARGET': {
          const { role, fingerprint, pageTitle } = message.payload || {};
          if (!role || !fingerprint) throw new Error('Thiếu role hoặc fingerprint F12.');
          let kb = await loadMachineKnowledge();
          kb = upsertLearnedRoleProfile(kb, role, fingerprint);
          if (fingerprint.sampleUrl) {
            kb = upsertLearnedGroup(kb, fingerprint.sampleUrl, pageTitle || '', 'f12_calibrated');
          }
          await saveMachineKnowledge(kb, true);
          sendResponse({ ok: true, data: { knowledge: kb } });
          break;
        }

        case 'DELETE_LEARNED_ROLE': {
          const { role } = message.payload || {};
          const kb = await loadMachineKnowledge();
          if (role && kb.roleProfiles) delete kb.roleProfiles[role];
          await saveMachineKnowledge(kb, true);
          sendResponse({ ok: true, data: { knowledge: kb } });
          break;
        }

        case 'ADD_LEARNED_GROUP': {
          const { url, title, tag } = message.payload || {};
          let kb = await loadMachineKnowledge();
          kb = upsertLearnedGroup(kb, url, title || '', tag);
          await saveMachineKnowledge(kb, true);
          sendResponse({ ok: true, data: { knowledge: kb } });
          break;
        }

        case 'DELETE_LEARNED_GROUP': {
          const { id } = message.payload || {};
          const kb = await loadMachineKnowledge();
          kb.learnedGroups = (kb.learnedGroups || []).filter((g) => g.id !== id);
          await saveMachineKnowledge(kb, true);
          sendResponse({ ok: true, data: { knowledge: kb } });
          break;
        }

        case 'SAVE_WORKFLOW': {
          const { name, category, description, steps, aiReview } = message.payload || {};
          const cleanSteps = compactRecordedSteps(Array.isArray(steps) ? steps : []);
          if (cleanSteps.length === 0) throw new Error('Kịch bản chưa có bước thao tác nào để lưu.');
          const kb = await loadMachineKnowledge();
          const now = new Date().toISOString();
          const wf = {
            id: `wf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: String(name || 'Kịch bản MXH mới').trim().slice(0, 80),
            description: String(description || `${cleanSteps.length} bước tự học trên máy này`).trim(),
            category: category || 'custom',
            createdAt: now,
            updatedAt: now,
            runCount: 0,
            steps: cleanSteps,
            ...(aiReview && typeof aiReview === 'object' ? { aiReview } : {}),
          };
          kb.workflows = [wf, ...(kb.workflows || [])].slice(0, 60);
          await saveMachineKnowledge(kb, true);
          await saveRecorderDraft({ active: false, startedAt: null, steps: [] });
          sendResponse({ ok: true, data: { workflow: wf, knowledge: kb } });
          break;
        }

        case 'DELETE_WORKFLOW': {
          const { workflowId } = message.payload || {};
          const kb = await loadMachineKnowledge();
          kb.workflows = (kb.workflows || []).filter((w) => w.id !== workflowId);
          await saveMachineKnowledge(kb, true);
          sendResponse({ ok: true, data: { knowledge: kb } });
          break;
        }

        case 'IMPORT_MACHINE_KNOWLEDGE': {
          const incoming = message.payload?.knowledge;
          if (!incoming || typeof incoming !== 'object') throw new Error('File JSON không hợp lệ.');
          const merged = normalizeMachineKnowledge(incoming);
          await saveMachineKnowledge(merged, true);
          await syncAutoPilotAlarm(merged.autoPilot);
          sendResponse({ ok: true, data: { knowledge: merged } });
          break;
        }

        case 'UPDATE_V4_SETTINGS': {
          const { productKnowledgeBase, budgetConfig, autoPilot } = message.payload || {};
          const kb = await loadMachineKnowledge();
          if (typeof productKnowledgeBase === 'string') {
            kb.productKnowledgeBase = productKnowledgeBase.slice(0, 3000);
          }
          if (budgetConfig && typeof budgetConfig === 'object') {
            kb.budgetConfig = { ...(kb.budgetConfig || {}), ...budgetConfig };
          }
          if (autoPilot && typeof autoPilot === 'object') {
            kb.autoPilot = { ...(kb.autoPilot || {}), ...autoPilot };
            await syncAutoPilotAlarm(kb.autoPilot);
          }
          await saveMachineKnowledge(kb, true);
          sendResponse({ ok: true, data: { knowledge: kb } });
          break;
        }

        case 'IMPORT_BULK_GROUPS': {
          const rawUrls = Array.isArray(message.payload?.urls) ? message.payload.urls : [];
          let kb = await loadMachineKnowledge();
          let added = 0;
          for (const u of rawUrls) {
            const clean = String(u || '').trim();
            if (!/facebook\.com/i.test(clean)) continue;
            kb = upsertLearnedGroup(kb, clean, '', 'bulk');
            added++;
          }
          await saveMachineKnowledge(kb, true);
          sendResponse({ ok: true, data: { added, knowledge: kb } });
          break;
        }

        case 'UPDATE_LEAD_STATUS': {
          const { leadId, status } = message.payload || {};
          const kb = await loadMachineKnowledge();
          kb.leadsCrm = (kb.leadsCrm || []).map((l) => (l.id === leadId ? { ...l, status } : l));
          await saveMachineKnowledge(kb, true);
          sendResponse({ ok: true, data: { knowledge: kb } });
          break;
        }

        case 'REMOVE_BLACKLIST_SELLER': {
          const { key } = message.payload || {};
          const kb = await loadMachineKnowledge();
          kb.sellerBlacklist = (kb.sellerBlacklist || []).filter((s) => s.key !== key);
          await saveMachineKnowledge(kb, true);
          sendResponse({ ok: true, data: { knowledge: kb } });
          break;
        }

        case 'CLEAR_SELLER_BLACKLIST': {
          const kb = await loadMachineKnowledge();
          kb.sellerBlacklist = [];
          await saveMachineKnowledge(kb, true);
          sendResponse({ ok: true, data: { knowledge: kb } });
          break;
        }

        case 'RUN_AUTOPILOT_NOW': {
          const res = await runAutoPilotCycle({
            manual: true,
            preferredTabId: message.payload?.tabId || null,
            mode: message.payload?.mode,
            naturalGoal: message.payload?.naturalGoal,
          });
          sendResponse({ ok: Boolean(res.started), data: res, error: res.started ? undefined : res.reason });
          break;
        }

        case 'RUN_SAVED_WORKFLOW': {
          runSavedWorkflowOrchestrator(message.payload || {});
          sendResponse({ ok: true });
          break;
        }

        case 'AI_CRITIQUE_DEMO': {
          const data = await runAiCritiqueDemo(message.payload || {});
          sendResponse({ ok: true, data });
          break;
        }

        case 'AI_ANALYZE_GROUP_PLAYBOOK': {
          const data = await runAiAnalyzeGroupPlaybook(message.payload || {});
          sendResponse({ ok: true, data });
          break;
        }

        case 'AI_COACH_PORTFOLIO': {
          const data = await runAiCoachPortfolio();
          sendResponse({ ok: true, data });
          break;
        }

        case 'GET_META_AI_STATUS': {
          const status = await getMetaAiBridgeStatus();
          sendResponse({ ok: true, data: status });
          break;
        }

        case 'OPEN_META_AI_TAB': {
          const tab = await openOrFocusMetaAiTab({
            url: message.payload?.url || '',
            active: message.payload?.active !== false,
          });
          const status = await getMetaAiBridgeStatus();
          sendResponse({ ok: true, data: { tabId: tab?.id || null, ...status } });
          break;
        }

        case 'TRAIN_META_AI_RULES': {
          const [stored, kb] = await Promise.all([
            chrome.storage.local.get([STORAGE_KEYS.CUSTOM_RULE, STORAGE_KEYS.AI_CONFIG]),
            loadMachineKnowledge(),
          ]);
          const customRule = stored[STORAGE_KEYS.CUSTOM_RULE];
          const aiConfig = stored[STORAGE_KEYS.AI_CONFIG] || {};
          const prompt = buildMetaAiTrainingPrompt(kb, customRule);
          const res = await callMetaAiTabRaw({
            prompt,
            preferredUrl: message.payload?.url || aiConfig.metaAiUrl || '',
            autoOpenIfMissing: true,
          });
          sendResponse({ ok: true, data: res });
          break;
        }

        case 'TEST_META_AI_BRIDGE': {
          const stored = await chrome.storage.local.get(STORAGE_KEYS.AI_CONFIG);
          const aiConfig = stored[STORAGE_KEYS.AI_CONFIG] || {};
          const res = await callMetaAiTabRaw({
            prompt:
              'Test kết nối FB EXTEN: Hãy viết thử 1 câu bình luận ngắn gọn tiếng Việt (1-2 câu) theo kiểu cao thủ dựng phim AI hé lộ 1 mẹo giữ mặt trên Kling + gợi mở tò mò kéo nhắn tin.',
            preferredUrl: message.payload?.url || aiConfig.metaAiUrl || '',
            autoOpenIfMissing: false,
          });
          sendResponse({ ok: true, data: res });
          break;
        }

        case 'VISION_LOCATE_ELEMENT': {
          const tabId = message.tabId || sender?.tab?.id;
          const windowId = sender?.tab?.windowId;
          const { goalDescription, somCatalog } = message.payload || {};
          const imageDataUrl = await chrome.tabs
            .captureVisibleTab(windowId, { format: 'jpeg', quality: 75 })
            .catch(() => '');
          const prompt = buildVisionLocatePrompt(goalDescription || '', somCatalog || []);
          const aiRes = await callAiPoolRaw({
            prompt,
            imageBase64: imageDataUrl || undefined,
          });
          const located = parseVisionLocateResponse(aiRes.text);
          sendResponse({
            ok: true,
            data: {
              ...located,
              providerUsed: aiRes.providerUsed,
              usedScreenshot: Boolean(imageDataUrl),
              tabId,
            },
          });
          break;
        }

        default:
          return;
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();

  return true;
});
