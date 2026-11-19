(() => {
  // Dọn sạch bản agent cũ trước khi nạp lại (hỗ trợ reload Extension không cần F5 vẫn chạy mượt)
  if (typeof window.__FB_EXTEN_CLEANUP__ === 'function') {
    try {
      window.__FB_EXTEN_CLEANUP__();
    } catch {}
  }

  let corePromise = null;
  function getCore() {
    if (!corePromise) {
      corePromise = import(chrome.runtime.getURL('core-build/shared/fb-exten-core.js'));
    }
    return corePromise;
  }

  let destroyed = false;
  let abortActions = false;
  let activeOpenedModal = null;

  // Bộ đệm thụ động hứng gói tin GraphQL từ content/graphql-tap.js (world: MAIN)
  const gqlPostCache = new Map();
  const onGqlTapMessage = (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== 'FB_EXTEN_GQL_TAP') return;
    const items = Array.isArray(ev.data.items) ? ev.data.items : [];
    let added = 0;
    for (const item of items) {
      if (!item || !item.text) continue;
      const key = item.postId || `${item.authorName}:${item.text.slice(0, 50)}`;
      if (!gqlPostCache.has(key)) added++;
      gqlPostCache.set(key, item);
      if (gqlPostCache.size > 200) {
        const firstKey = gqlPostCache.keys().next().value;
        if (firstKey) gqlPostCache.delete(firstKey);
      }
    }
    if (added > 0) {
      emitProgress('GQL_CACHE_UPDATED', { count: gqlPostCache.size });
    }
  };
  window.addEventListener('message', onGqlTapMessage);

  function findGqlMatchForPost(postUrl, postAuthor, domText) {
    if (gqlPostCache.size === 0) return null;
    const idMatch =
      String(postUrl || '').match(/\/posts\/(\d+)/i) ||
      String(postUrl || '').match(/\/permalink\/(\d+)/i) ||
      String(postUrl || '').match(/[?&](?:multi_permalinks|story_fbid|fbid)=(\d+)/i);
    if (idMatch?.[1] && gqlPostCache.has(idMatch[1])) {
      return gqlPostCache.get(idMatch[1]);
    }
    const normAuthor = (postAuthor || '').trim().toLowerCase();
    const prefix = (domText || '').replace(/\s+/g, ' ').trim().slice(0, 40).toLowerCase();
    for (const rec of gqlPostCache.values()) {
      const recAuthor = (rec.authorName || '').trim().toLowerCase();
      const recText = (rec.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (idMatch?.[1] && rec.url && rec.url.includes(idMatch[1])) return rec;
      if (normAuthor && recAuthor && normAuthor === recAuthor && prefix.length >= 12 && recText.includes(prefix.slice(0, 24))) {
        return rec;
      }
    }
    return null;
  }

  function extractUidFromAnchor(anchorEl) {
    if (!anchorEl) return '';
    const href = anchorEl.getAttribute('href') || anchorEl.href || '';
    const m =
      href.match(/\/user\/(\d+)/i) ||
      href.match(/[?&]id=(\d{6,})/i) ||
      href.match(/\/people\/[^/]+\/(\d{6,})/i);
    return m?.[1] || '';
  }

  const hudStats = {
    scanned: 0,
    loved: 0,
    commented: 0,
    skippedSeller: 0,
  };

  function isContextAlive() {
    try {
      return !destroyed && Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  function emitProgress(event, payload) {
    if (!isContextAlive()) return;
    try {
      chrome.runtime.sendMessage({ type: 'EXT_EVENT', event, payload }).catch(() => {});
    } catch {}
  }

  // ============================================================================
  // 1. TRỰC QUAN F12 HIGHLIGHTS + CON TRỎ LASER + HUD TRỰC TIẾP TRÊN FACEBOOK
  // ============================================================================

  function clearF12Highlights() {
    document.querySelectorAll('.fb-exten-f12-overlay').forEach((n) => n.remove());
  }

  function clearSetOfMarkOverlay() {
    document.querySelectorAll('.fb-exten-som-tag').forEach((n) => n.remove());
    document.querySelectorAll('[data-fb-exten-som-id]').forEach((n) => n.removeAttribute('data-fb-exten-som-id'));
  }

  function describeElementF12(el) {
    if (!el || !(el instanceof HTMLElement)) return '';
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') ? ` role="${el.getAttribute('role')}"` : '';
    const aria = el.getAttribute('aria-label') ? ` aria-label="${el.getAttribute('aria-label').slice(0, 42)}"` : '';
    const r = el.getBoundingClientRect();
    return `<${tag}${role}${aria}> @ (${Math.round(r.left + r.width / 2)}, ${Math.round(r.top + r.height / 2)})`;
  }

  function showF12Highlight(el, label, color = '#10b981', durationMs = 4200) {
    if (!el || !(el instanceof HTMLElement)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;

    const box = document.createElement('div');
    box.className = 'fb-exten-f12-overlay';
    box.style.cssText = `
      position: fixed;
      left: ${Math.max(0, rect.left - 3)}px;
      top: ${Math.max(0, rect.top - 3)}px;
      width: ${Math.min(window.innerWidth - 4, rect.width + 6)}px;
      height: ${Math.min(window.innerHeight - 4, rect.height + 6)}px;
      border: 2.5px solid ${color};
      border-radius: 8px;
      box-shadow: 0 0 18px ${color}88, inset 0 0 8px ${color}2a;
      pointer-events: none;
      z-index: 2147483644;
      transition: opacity 0.25s ease;
    `;

    const badge = document.createElement('div');
    badge.textContent = label;
    badge.style.cssText = `
      position: absolute;
      left: 0;
      top: ${rect.top > 28 ? '-22px' : '4px'};
      background: ${color};
      color: #07090e;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10.5px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 5px;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0,0,0,0.45);
    `;
    box.appendChild(badge);
    document.body?.appendChild(box);

    if (durationMs > 0) {
      setTimeout(() => {
        box.style.opacity = '0';
        setTimeout(() => box.remove(), 260);
      }, durationMs);
    }
  }

  function moveVisualCursor(x, y) {
    let cursor = document.getElementById('fb-exten-visual-cursor');
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = 'fb-exten-visual-cursor';
      cursor.style.cssText = `
        position: fixed;
        width: 18px;
        height: 18px;
        margin-left: -9px;
        margin-top: -9px;
        border-radius: 50%;
        border: 2.5px solid #10b981;
        background: rgba(16, 185, 129, 0.35);
        box-shadow: 0 0 16px rgba(16, 185, 129, 0.95);
        pointer-events: none;
        z-index: 2147483645;
        left: 50vw;
        top: 50vh;
        transition: left 0.32s cubic-bezier(0.22, 1, 0.36, 1), top 0.32s cubic-bezier(0.22, 1, 0.36, 1);
      `;
      document.body?.appendChild(cursor);
    }
    cursor.style.display = 'block';
    cursor.style.left = `${Math.max(4, Math.min(window.innerWidth - 4, x))}px`;
    cursor.style.top = `${Math.max(4, Math.min(window.innerHeight - 4, y))}px`;
  }

  function ensureHud() {
    let hud = document.getElementById('fb-exten-hud');
    if (hud) return hud;

    hud = document.createElement('div');
    hud.id = 'fb-exten-hud';
    hud.style.cssText = `
      position: fixed;
      bottom: 18px;
      right: 18px;
      width: 276px;
      z-index: 2147483646;
      background: rgba(9, 13, 24, 0.94);
      color: #f1f5f9;
      border: 1px solid rgba(56, 189, 248, 0.45);
      border-radius: 12px;
      padding: 10px 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(12px);
    `;

    hud.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:6px;font-weight:800;font-size:12px;">
          <span id="fb-exten-hud-dot" style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;"></span>
          <span>FB EXTEN v4.3</span>
        </div>
        <div style="display:flex;gap:4px;">
          <button id="fb-exten-hud-rec" type="button" title="Bật/Tắt Ghi Mẫu Thao Tác MXH" style="background:rgba(225,29,72,0.22);color:#fda4af;border:1px solid rgba(225,29,72,0.5);border-radius:6px;padding:2px 6px;font-size:10.5px;font-weight:700;cursor:pointer;">🔴 Ghi</button>
          <button id="fb-exten-hud-panel" type="button" style="background:rgba(0,113,227,0.28);color:#93c5fd;border:1px solid rgba(0,113,227,0.5);border-radius:6px;padding:2px 7px;font-size:10.5px;font-weight:700;cursor:pointer;">Panel</button>
          <button id="fb-exten-hud-stop" type="button" style="display:none;background:rgba(225,29,72,0.3);color:#fda4af;border:1px solid rgba(225,29,72,0.55);border-radius:6px;padding:2px 7px;font-size:10.5px;font-weight:700;cursor:pointer;">Dừng</button>
          <button id="fb-exten-hud-min" type="button" title="Thu gọn" style="background:rgba(255,255,255,0.08);color:#cbd5e1;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:2px 6px;font-size:10.5px;cursor:pointer;">–</button>
        </div>
      </div>
      <div id="fb-exten-hud-body">
        <div id="fb-exten-hud-msg" style="color:#cbd5e1;font-size:11.5px;line-height:1.35;margin-bottom:6px;word-break:break-word;">Sẵn sàng — Bấm "🔴 Ghi" để làm mẫu hoặc mở Panel chạy tự động.</div>
        <div id="fb-exten-hud-counts" style="font-family:monospace;font-size:10.5px;color:#34d399;background:rgba(255,255,255,0.05);padding:4px 7px;border-radius:6px;">Bài: 0 | ❤️ 0 | 💬 0 | 🚫 Sale: 0</div>
      </div>
    `;

    document.body?.appendChild(hud);

    hud.querySelector('#fb-exten-hud-rec')?.addEventListener('click', async () => {
      if (!isContextAlive()) return;
      if (recorderActive) {
        await chrome.runtime.sendMessage({ type: 'STOP_DEMO_RECORDING' }).catch(() => {});
        stopDemoRecorder();
      } else {
        await chrome.runtime.sendMessage({
          type: 'START_DEMO_RECORDING',
          payload: { startUrl: window.location.href, startTitle: document.title },
        }).catch(() => {});
        startDemoRecorder();
      }
    });
    hud.querySelector('#fb-exten-hud-panel')?.addEventListener('click', () => {
      if (isContextAlive()) chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' }).catch(() => {});
    });
    hud.querySelector('#fb-exten-hud-stop')?.addEventListener('click', () => {
      abortActions = true;
      if (isContextAlive()) chrome.runtime.sendMessage({ type: 'STOP_LINK_QUEUE' }).catch(() => {});
      updateHud({ running: false, level: 'warn', message: '⏹ Đang dừng agent...' });
    });
    hud.querySelector('#fb-exten-hud-min')?.addEventListener('click', () => {
      const body = document.getElementById('fb-exten-hud-body');
      const btn = document.getElementById('fb-exten-hud-min');
      if (body && btn) {
        const hidden = body.style.display === 'none';
        body.style.display = hidden ? 'block' : 'none';
        btn.textContent = hidden ? '–' : '+';
      }
    });

    return hud;
  }

  function updateHud({ running, level = 'info', message, stats } = {}) {
    const hud = ensureHud();
    if (!hud) return;
    if (stats) {
      if (typeof stats.scanned === 'number') hudStats.scanned = stats.scanned;
      if (typeof stats.loved === 'number') hudStats.loved = stats.loved;
      if (typeof stats.commented === 'number') hudStats.commented = stats.commented;
      if (typeof stats.skippedSeller === 'number') hudStats.skippedSeller = stats.skippedSeller;
    }

    const dot = document.getElementById('fb-exten-hud-dot');
    const msgEl = document.getElementById('fb-exten-hud-msg');
    const countsEl = document.getElementById('fb-exten-hud-counts');
    const stopBtn = document.getElementById('fb-exten-hud-stop');

    if (dot) {
      dot.style.background =
        level === 'err' ? '#fb7185' : level === 'warn' ? '#fbbf24' : running ? '#38bdf8' : '#10b981';
    }
    if (msgEl && message) {
      msgEl.textContent = message;
    }
    if (countsEl) {
      countsEl.textContent = `Bài: ${hudStats.scanned} | ❤️ ${hudStats.loved} | 💬 ${hudStats.commented} | 🚫 Sale: ${hudStats.skippedSeller}`;
    }
    if (stopBtn && typeof running === 'boolean') {
      stopBtn.style.display = running ? 'inline-block' : 'none';
    }
  }

  // ============================================================================
  // 2. TIỆN ÍCH DOM FACEBOOK 2025/2026 & SCROLL CONTAINER
  // ============================================================================

  function isHudOrOverlay(el) {
    return Boolean(el.closest('#fb-exten-hud, .fb-exten-f12-overlay, .fb-exten-som-tag, #fb-exten-picker-box'));
  }

  function getEffectiveRect(el) {
    if (!el || !(el instanceof HTMLElement)) return new DOMRect(0, 0, 0, 0);
    const rect = el.getBoundingClientRect();
    if (rect.width >= 6 && rect.height >= 6) return rect;
    const style = window.getComputedStyle(el);
    if (style.display === 'contents') {
      for (const child of Array.from(el.children)) {
        if (child instanceof HTMLElement) {
          const cr = child.getBoundingClientRect();
          if (cr.width >= 6 && cr.height >= 6) return cr;
        }
      }
    }
    return rect;
  }

  function isElementVisible(el) {
    if (!el || !(el instanceof HTMLElement) || isHudOrOverlay(el)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = getEffectiveRect(el);
    if (rect.width < 6 || rect.height < 6) return false;
    return true;
  }

  function isCommentArticleElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const aria = (el.getAttribute('aria-label') || '').trim();
    return (
      /^(bình luận|comment|phản hồi|reply)/i.test(aria) ||
      /bình luận dưới tên|comment by|phản hồi của|reply by/i.test(aria)
    );
  }

  function isPostDialog(dlg) {
    if (!dlg || !(dlg instanceof HTMLElement) || !isElementVisible(dlg)) return false;
    const rect = dlg.getBoundingClientRect();
    if (rect.width < 360 || rect.height < 250) return false;
    const aria = (dlg.getAttribute('aria-label') || '').toLowerCase();
    // Loại trừ khung chat Messenger, thông báo, danh sách người thả cảm xúc, form đăng nhập
    if (/messenger|đoạn chat|chats|thông báo|notifications|cài đặt|settings|cảm xúc|reactions|bày tỏ/i.test(aria)) {
      return false;
    }
    if (dlg.querySelector('input[name="email"], input[type="password"]')) return false;
    const hdTxt = (dlg.querySelector('h1, h2, [role="heading"]')?.innerText || '').toLowerCase();
    if (/người đã bày tỏ|cảm xúc về|people who reacted|all reactions/i.test(hdTxt)) return false;
    return Boolean(
      dlg.querySelector(
        '[role="article"], [data-ad-rendering-role="like_button"], [data-ad-rendering-role="comment_button"], [contenteditable="true"]'
      )
    );
  }

  function getButtonSignals(el) {
    const aria = (el.getAttribute('aria-label') || '').trim();
    const childAria = Array.from(el.querySelectorAll('[aria-label]'))
      .map((c) => (c.getAttribute('aria-label') || '').trim())
      .filter(Boolean)
      .join(' ');
    const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    const adRole = (el.getAttribute('data-ad-rendering-role') || '').trim().toLowerCase();
    return {
      aria,
      childAria,
      combinedAria: `${aria} ${childAria}`.trim(),
      txt,
      adRole,
    };
  }

  function findDialogScrollContainer(dlg) {
    if (!dlg) return null;
    const candidates = Array.from(dlg.querySelectorAll('div')).filter((d) => {
      if (d.scrollHeight <= d.clientHeight + 40) return false;
      const st = window.getComputedStyle(d);
      return /auto|scroll/i.test(st.overflowY);
    });
    candidates.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
    return candidates[0] || null;
  }

  async function scrollTargetIntoComfortView(el) {
    if (!el || !(el instanceof HTMLElement)) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise((r) => setTimeout(r, 380));
  }

  async function dismissObstructions(core) {
    // 1. Tự động bấm màn hình trung gian "Tiếp tục với tư cách..." nếu Facebook chặn
    try {
      const btns = Array.from(document.querySelectorAll('[role="button"], button')).filter(isElementVisible);
      const continueBtn = btns.find((b) => {
        const lbl = `${b.getAttribute('aria-label') || ''} ${b.innerText || ''}`.trim();
        return /^(tiếp tục|continue)$/i.test(lbl) || /^tiếp tục (với tư cách|dưới tên)/i.test(lbl);
      });
      if (continueBtn) {
        continueBtn.click();
        await core.sleep(1600);
      }
    } catch {}

    // 2. Đóng popup nhắc nhở nhỏ ("Để sau", "Không phải bây giờ")
    try {
      const popBtns = Array.from(document.querySelectorAll('[role="dialog"] [role="button"], [role="dialog"] button')).filter(
        (b) => isElementVisible(b) && !isPostDialog(b.closest('[role="dialog"]'))
      );
      const dismissBtn = popBtns.find((b) =>
        /^(để sau|không phải bây giờ|not now|close|đóng)$/i.test((b.innerText || b.getAttribute('aria-label') || '').trim())
      );
      if (dismissBtn) {
        dismissBtn.click();
        await core.sleep(450);
      }
    } catch {}
  }

  function checkCheckpointDialogs(core) {
    const urlCheck = core.classifyCheckpointText('', window.location.href);
    if (urlCheck.isCheckpoint) return urlCheck;

    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter((d) => !isHudOrOverlay(d));
    for (const dlg of dialogs) {
      if (isPostDialog(dlg)) continue;
      const text = dlg.innerText || '';
      const check = core.classifyCheckpointText(text, window.location.href);
      if (check.isCheckpoint && check.type !== 'OK') {
        return check;
      }
    }
    return { isCheckpoint: false, type: 'OK' };
  }

  // ============================================================================
  // 3. ĐỌC BÀI VIẾT & BÌNH LUẬN (CHO CẢ FEED GROUP TỔNG LẪN LINK BÀI VIẾT LẺ)
  // ============================================================================

  function findPostPermalinkInCard(cardEl) {
    const links = Array.from(cardEl.querySelectorAll('a[href]')).filter(
      (a) => !a.closest('[data-fb-exten-cmt-idx], div[role="article"][aria-label*="Bình luận" i]')
    );
    for (const a of links) {
      try {
        const href = a.href || '';
        if (
          /\/posts\/\d+|\/permalink\/\d+|multi_permalinks=|story_fbid=|pfbid[a-zA-Z0-9]+|\/videos\/\d+|\/reel\/\d+/i.test(
            href
          )
        ) {
          return href.split('&__cft__')[0].split('?__cft__')[0];
        }
      } catch {}
    }
    return window.location.href;
  }

  function findMainPostRoot() {
    const activeMarked = document.querySelector('[data-fb-exten-active-post="1"]');
    if (activeMarked && activeMarked instanceof HTMLElement && isElementVisible(activeMarked)) {
      return {
        root: activeMarked,
        kind: activeMarked.matches('div[role="dialog"]') ? 'dialog_modal' : 'active_post',
      };
    }

    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isPostDialog);
    if (dialogs.length > 0) {
      return { root: dialogs[dialogs.length - 1], kind: 'dialog_modal' };
    }

    const mainEl = document.querySelector('div[role="main"]');
    if (mainEl) {
      const mainArticles = Array.from(mainEl.querySelectorAll('div[role="article"]')).filter(
        (a) => isElementVisible(a) && !isCommentArticleElement(a)
      );
      if (mainArticles.length > 0) {
        return { root: mainArticles[0], kind: 'main_article' };
      }
      return { root: mainEl, kind: 'main_container' };
    }

    const anyArticle = Array.from(document.querySelectorAll('div[role="article"]')).find(
      (a) => isElementVisible(a) && !isCommentArticleElement(a)
    );
    if (anyArticle) return { root: anyArticle, kind: 'fallback_article' };

    return { root: document.body, kind: 'body' };
  }

  function resolveLiveActionScope() {
    const { root } = findMainPostRoot();
    // Nếu trong lúc thao tác bài feed vừa bật lên Popup Dialog bài viết, tự bám theo Dialog mới nhất
    if (root && !root.matches('div[role="dialog"]')) {
      const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isPostDialog);
      if (dialogs.length > 0) {
        const latestDlg = dialogs[dialogs.length - 1];
        activeOpenedModal = latestDlg;
        return latestDlg;
      }
    }
    return root;
  }

  function isGroupComposerBox(cardEl) {
    const txt = (cardEl.innerText || '').trim().toLowerCase();
    const hasPostBtn = Boolean(
      cardEl.querySelector('[aria-label*="Tạo bài viết" i], [aria-label*="Write something" i], [aria-label*="Bạn viết gì đi" i]')
    );
    const hasPermalink = Boolean(
      cardEl.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="multi_permalinks="], a[href*="pfbid"]')
    );
    if (hasPostBtn && !hasPermalink && txt.length < 180) return true;
    if (!hasPermalink && txt.length < 40 && /bạn viết gì đi|tạo bài viết|ảnh\/video|cảm xúc\/hoạt động/i.test(txt)) {
      return true;
    }
    return false;
  }

  function collectGroupFeedCards() {
    const seenEl = new Set();
    const cards = [];

    const addIfValid = (el) => {
      if (!el || !(el instanceof HTMLElement) || seenEl.has(el) || !isElementVisible(el)) return;
      if (el.closest('div[role="dialog"]')) return;
      if (isCommentArticleElement(el)) return;
      const r = getEffectiveRect(el);
      if (r.height < 90 || r.width < 220) return;
      if (isGroupComposerBox(el)) return;

      const txt = (el.innerText || '').trim();
      if (txt.length < 20) return;
      if (el.querySelector('[data-visualcompletion="loading-state"]') && txt.length < 40) return;

      const hasAttrSignals = Boolean(
        el.querySelector(
          'a[href*="/posts/"], a[href*="/permalink/"], a[href*="multi_permalinks="], a[href*="pfbid"], [data-ad-rendering-role="like_button"], [data-ad-rendering-role="comment_button"], [role="button"][aria-label*="Thích" i], [role="button"][aria-label*="Like" i], [role="button"][aria-label*="Bình luận" i], [role="button"][aria-label*="Comment" i]'
        )
      );
      const hasActionText =
        hasAttrSignals ||
        Array.from(el.querySelectorAll('[role="button"], button')).some((b) =>
          /^(thích|bình luận|chia sẻ|like|comment|share)$/i.test((b.innerText || '').trim())
        );
      if (!hasActionText) return;

      seenEl.add(el);
      cards.push(el);
    };

    // 1. Chuẩn Facebook Group Feed: mỗi phần tử con trực tiếp trong div[role="feed"] là 1 card bài viết trọn vẹn
    const feeds = Array.from(document.querySelectorAll('div[role="feed"]'));
    for (const feed of feeds) {
      for (const child of Array.from(feed.children)) {
        if (!(child instanceof HTMLElement)) continue;
        const nonCommentArticles = Array.from(child.querySelectorAll('div[role="article"]')).filter(
          (a) => !isCommentArticleElement(a)
        );
        if (nonCommentArticles.length > 1) {
          nonCommentArticles.forEach(addIfValid);
        } else {
          addIfValid(child);
        }
      }
    }

    // 2. Fallback: data-pagelet FeedUnit hoặc div[role="article"] trong main
    if (cards.length === 0) {
      document.querySelectorAll('[data-pagelet^="FeedUnit"]').forEach(addIfValid);
    }
    if (cards.length === 0) {
      document.querySelectorAll('div[role="main"] div[role="article"]').forEach(addIfValid);
    }

    return cards;
  }

  async function expandPostAndComments(core, postRoot, expandComments) {
    // 1. Bấm "Xem thêm" / "See more" trong thân bài (không bấm nhầm link ở comment)
    const seeMoreBtns = Array.from(postRoot.querySelectorAll('[role="button"], span[role="button"]')).filter((el) => {
      if (!isElementVisible(el)) return false;
      if (el.closest('div[role="article"][aria-label*="Bình luận" i], div[role="article"][aria-label*="Comment" i]')) return false;
      const txt = (el.innerText || '').trim();
      return /^(xem thêm|see more)$/i.test(txt);
    });
    for (const btn of seeMoreBtns.slice(0, 2)) {
      try {
        btn.click();
        await core.sleep(320);
      } catch {}
    }

    if (!expandComments) return;

    // 2. Chỉ bấm "Xem thêm bình luận" nội tuyến (tránh bấm nút mở modal ngoài ý muốn khi quét feed)
    for (let step = 0; step < 2; step++) {
      const moreCmtBtn = Array.from(postRoot.querySelectorAll('[role="button"], button')).find((el) => {
        if (!isElementVisible(el)) return false;
        const txt = (el.innerText || '').trim();
        return /^(xem thêm bình luận|view more comments|xem các bình luận trước|view previous comments)/i.test(txt);
      });
      if (!moreCmtBtn) break;
      try {
        moreCmtBtn.click();
        await core.sleep(900);
      } catch {
        break;
      }
    }
  }

  function extractThreadFromRoot(postRoot, rootKind, core) {
    const rawCommentNodes = Array.from(postRoot.querySelectorAll('div[role="article"]')).filter(
      (n) => n !== postRoot && isElementVisible(n) && isCommentArticleElement(n)
    );
    const commentNodeSet = new Set(rawCommentNodes);

    const authorLink = Array.from(postRoot.querySelectorAll('h2 a, h3 a, h4 a, strong a, a[role="link"]')).find(
      (a) => !rawCommentNodes.some((cn) => cn.contains(a)) && (a.innerText || '').trim().length >= 2
    );
    const postAuthor = (authorLink?.innerText || 'Thành viên nhóm').replace(/\s+/g, ' ').trim().slice(0, 80);
    let postAuthorUid = extractUidFromAnchor(authorLink);

    const textParts = [];
    const candidateBlocks = Array.from(postRoot.querySelectorAll('div[dir="auto"], span[dir="auto"]'));
    for (const el of candidateBlocks) {
      if (rawCommentNodes.some((cn) => cn.contains(el))) continue;
      if (el.closest('h2, h3, h4, form, [contenteditable="true"]')) continue;
      const t = (el.innerText || '').trim();
      if (
        t.length >= 6 &&
        !/^(thích|bình luận|chia sẻ|like|comment|share|phản hồi|xem thêm|phù hợp nhất|tất cả bình luận|\d+\s*(bình luận|lượt chia sẻ|comments|shares))$/i.test(
          t
        )
      ) {
        if (!textParts.some((prev) => prev.includes(t) || t.includes(prev))) {
          textParts.push(t);
        }
      }
    }

    let postText = (textParts.join('\n') || postRoot.innerText || '').slice(0, 1400).trim();
    const postUrl = findPostPermalinkInCard(postRoot);

    // Ước lượng tuổi bài viết từ DOM timestamp hoặc dữ liệu GraphQL chính xác từng giây
    let createdAtSec;
    let postAgeMinutes;
    let source = 'dom';
    const timeAnchor = Array.from(postRoot.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="multi_permalinks="], abbr')).find(
      (el) => !rawCommentNodes.some((cn) => cn.contains(el)) && (el.innerText || el.getAttribute('aria-label') || '').trim().length > 0
    );
    if (timeAnchor && typeof core.parseVietnameseRelativeAgeMinutes === 'function') {
      const domAge = core.parseVietnameseRelativeAgeMinutes(timeAnchor.innerText || timeAnchor.getAttribute('aria-label') || '');
      if (typeof domAge === 'number') postAgeMinutes = domAge;
    }

    const gqlRec = findGqlMatchForPost(postUrl, postAuthor, postText);
    if (gqlRec) {
      source = 'graphql_enriched';
      if (gqlRec.text && gqlRec.text.length > postText.length) {
        postText = gqlRec.text.slice(0, 1800);
      }
      if (gqlRec.authorUid && !postAuthorUid) postAuthorUid = gqlRec.authorUid;
      if (gqlRec.createdAtSec) {
        createdAtSec = gqlRec.createdAtSec;
        postAgeMinutes = Math.max(0, Math.round((Date.now() / 1000 - gqlRec.createdAtSec) / 60));
      }
    }

    const postKey = core.buildPostDedupKey(postUrl, postAuthor, postText);

    const lowerBody = (postRoot.innerText || '').toLowerCase();
    const commentsDisabled =
      /tính năng bình luận đã bị tắt|comments have been turned off/i.test(lowerBody);

    document.querySelectorAll('[data-fb-exten-cmt-idx]').forEach((el) => el.removeAttribute('data-fb-exten-cmt-idx'));

    const comments = [];
    rawCommentNodes.forEach((node) => {
      const cAuthorLink = node.querySelector('a[role="link"]');
      const cAuthorEl = node.querySelector('a[role="link"] span, strong, a[role="link"]');
      const cAuthor = (cAuthorEl?.innerText || 'Người bình luận').replace(/\s+/g, ' ').trim().slice(0, 80);
      let cAuthorUid = extractUidFromAnchor(cAuthorLink);

      const cBlocks = Array.from(node.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
        .filter((el) => {
          for (const other of commentNodeSet) {
            if (other !== node && node.contains(other) && other.contains(el)) return false;
          }
          return true;
        })
        .map((el) => (el.innerText || '').trim())
        .filter((t) => t.length >= 2 && t !== cAuthor);

      const uniqueBlocks = [];
      for (const b of cBlocks) {
        if (!uniqueBlocks.some((u) => u.includes(b))) uniqueBlocks.push(b);
      }

      let cText = uniqueBlocks.join(' ').trim();
      if (!cText) return;

      // Bổ sung UID & text đầy đủ từ GraphQL nếu khớp bình luận
      if (gqlRec?.comments?.length) {
        const gCmt = gqlRec.comments.find(
          (gc) =>
            gc.authorName?.toLowerCase() === cAuthor.toLowerCase() &&
            gc.text?.toLowerCase().includes(cText.slice(0, 18).toLowerCase())
        );
        if (gCmt) {
          if (gCmt.authorUid && !cAuthorUid) cAuthorUid = gCmt.authorUid;
          if (gCmt.text && gCmt.text.length > cText.length) cText = gCmt.text;
        }
      }

      const cIdx = comments.length;
      node.setAttribute('data-fb-exten-cmt-idx', String(cIdx));
      comments.push({
        index: cIdx,
        author: cAuthor,
        ...(cAuthorUid ? { authorUid: cAuthorUid } : {}),
        text: cText.slice(0, 500),
        isReply: /phản hồi|reply/i.test(node.getAttribute('aria-label') || ''),
      });
    });

    return {
      postKey,
      commentsDisabled,
      rootKind,
      threadInput: {
        url: postUrl,
        postAuthor,
        ...(postAuthorUid ? { postAuthorUid } : {}),
        postText,
        ...(createdAtSec ? { createdAtSec } : {}),
        ...(typeof postAgeMinutes === 'number' ? { postAgeMinutes } : {}),
        source,
        comments,
      },
    };
  }

  function clearActivePostMarker() {
    document.querySelectorAll('[data-fb-exten-active-post]').forEach((el) => el.removeAttribute('data-fb-exten-active-post'));
  }

  async function finishActivePost(core) {
    clearActivePostMarker();
    clearF12Highlights();
    clearSetOfMarkOverlay();

    if (activeOpenedModal && document.body.contains(activeOpenedModal)) {
      try {
        const closeBtn = Array.from(activeOpenedModal.querySelectorAll('[role="button"], button')).find((b) => {
          const aria = (b.getAttribute('aria-label') || '').trim();
          return /^(đóng|close)$/i.test(aria);
        });
        if (closeBtn && closeBtn instanceof HTMLElement) {
          closeBtn.click();
        } else {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
        }
        await core.sleep(600);
      } catch {}
    }
    activeOpenedModal = null;
  }

  function detectCurrentFacebookUserName() {
    // 1. Lấy trực tiếp tên nick đang đăng nhập từ ô "Bình luận dưới tên <Tên>" / "Comment as <Name>"
    const editors = Array.from(document.querySelectorAll('[role="textbox"][aria-label], [contenteditable="true"][aria-label]'));
    for (const ed of editors) {
      const aria = (ed.getAttribute('aria-label') || '').trim();
      const m = aria.match(/(?:bình luận dưới tên|trả lời dưới tên|comment as|reply as)\s+(.+)$/i);
      if (m?.[1] && m[1].trim().length >= 2) {
        return m[1].trim().toLowerCase();
      }
    }
    // 2. Lấy từ nút Profile / Trang cá nhân ở thanh điều hướng trên cùng
    const navProfile = document.querySelector('div[role="banner"] a[href*="/me"], div[role="banner"] [aria-label*="Trang cá nhân" i], div[role="banner"] [aria-label*="Your profile" i]');
    if (navProfile instanceof HTMLElement) {
      const txt = (navProfile.innerText || '').trim();
      if (txt.length >= 2 && txt.length <= 50 && !/trang cá nhân|profile|tài khoản|account/i.test(txt)) {
        return txt.toLowerCase();
      }
    }
    return '';
  }

  function checkPostAlreadyInteracted(cardEl, myUid = '') {
    // 1. Kiểm tra đã từng bấm Thích / Thả tim / Cảm xúc trên bài này chưa (kể cả bấm bằng tay trước đó!)
    try {
      const reactInfo = findReactionButtonInScope(cardEl, false);
      if (reactInfo?.alreadyLoved) {
        return { interacted: true, reason: 'Đã thả cảm xúc (Like/Tim) trước đó' };
      }
    } catch {}

    // 2. Kiểm tra xem trong các bình luận đang hiển thị của bài có bình luận của CHÍNH MÌNH chưa
    const myName = detectCurrentFacebookUserName();
    const cleanUid = String(myUid || '').trim();
    if (myName || cleanUid) {
      const commentNodes = Array.from(cardEl.querySelectorAll('div[role="article"]')).filter(isCommentArticleElement);
      for (const cNode of commentNodes) {
        const authorLink = cNode.querySelector('a[role="link"], h3 a, strong a');
        const cName = (authorLink?.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const cUid = extractUidFromAnchor(authorLink);
        if ((cleanUid && cUid && cUid === cleanUid) || (myName && cName && cName === myName)) {
          return { interacted: true, reason: 'Nick bạn đã bình luận bài này trước đó' };
        }
      }
    }
    return { interacted: false, reason: '' };
  }

  async function scanNextGroupPost({ skipPostKeys = [], expandComments = true, skipAlreadyInteracted = true, myUid = '' } = {}) {
    const core = await getCore();
    await finishActivePost(core);
    await dismissObstructions(core);

    const cp = checkCheckpointDialogs(core);
    if (cp.isCheckpoint) {
      return { found: false, checkpointHit: true, checkpointReason: cp.reason };
    }

    const skipSet = new Set(Array.isArray(skipPostKeys) ? skipPostKeys : []);
    const skippedInteractedKeys = [];
    let cards = collectGroupFeedCards();
    for (let waitAttempt = 0; waitAttempt < 3 && cards.length === 0; waitAttempt++) {
      await core.sleep(750);
      cards = collectGroupFeedCards();
    }

    for (const card of cards) {
      const prelimUrl = findPostPermalinkInCard(card);
      const authorEl = card.querySelector('h2 a, h3 a, h4 a, strong a, a[role="link"]');
      const prelimAuthor = (authorEl?.innerText || '').trim();
      const prelimText = (card.innerText || '').slice(0, 140);
      const key = core.buildPostDedupKey(prelimUrl, prelimAuthor, prelimText);

      if (skipSet.has(key)) continue;

      // BỎ QUA 0ms bài đã tương tác (Like/Tim hoặc đã Comment trước đó) — tăng năng suất & không hỏi lại Meta AI!
      if (skipAlreadyInteracted) {
        const preInteract = checkPostAlreadyInteracted(card, myUid);
        if (preInteract.interacted) {
          skipSet.add(key);
          skippedInteractedKeys.push(key);
          emitProgress('ACTION_LOG', {
            level: 'info',
            message: `⏭ Bỏ qua 0ms bài đã tương tác [${prelimAuthor || 'Group'}]: ${preInteract.reason}`,
          });
          continue;
        }
      }

      await scrollTargetIntoComfortView(card);
      await core.sleep(320);

      await expandPostAndComments(core, card, expandComments);
      clearActivePostMarker();
      card.setAttribute('data-fb-exten-active-post', '1');

      const extracted = extractThreadFromRoot(card, 'group_feed_card', core);
      if (skipSet.has(extracted.postKey)) {
        clearActivePostMarker();
        continue;
      }

      if (skipAlreadyInteracted) {
        const postInteract = checkPostAlreadyInteracted(card, myUid);
        if (postInteract.interacted) {
          skipSet.add(extracted.postKey);
          skippedInteractedKeys.push(extracted.postKey);
          clearActivePostMarker();
          emitProgress('ACTION_LOG', {
            level: 'info',
            message: `⏭ Bỏ qua bài đã tương tác [${extracted.threadInput.postAuthor}]: ${postInteract.reason}`,
          });
          continue;
        }
      }

      if ((extracted.threadInput.postText || '').length < 10 && extracted.threadInput.comments.length === 0) {
        skipSet.add(extracted.postKey);
        clearActivePostMarker();
        continue;
      }

      showF12Highlight(card, `📦 Bài viết (${extracted.threadInput.postAuthor.slice(0, 22)})`, '#38bdf8', 4500);
      emitProgress('ACTION_LOG', {
        level: 'info',
        message: `📖 Quét thấy bài [${extracted.threadInput.postAuthor}] (${extracted.threadInput.comments.length} bình luận)`,
      });

      return {
        found: true,
        postKey: extracted.postKey,
        commentsDisabled: extracted.commentsDisabled,
        threadInput: extracted.threadInput,
        skippedInteractedKeys,
      };
    }

    // Chưa có bài mới -> cuộn xuống nạp thêm bài từ Group Feed
    const beforeScrollY = window.scrollY;
    const beforeHeight = document.body.scrollHeight;
    for (let s = 0; s < 2; s++) {
      window.scrollBy({ top: 560, behavior: 'smooth' });
      await core.sleep(480);
    }
    await core.sleep(950);

    const endReached =
      window.scrollY === beforeScrollY &&
      document.body.scrollHeight === beforeHeight &&
      window.scrollY + window.innerHeight >= document.body.scrollHeight - 40;

    return { found: false, scrolled: true, endReached, skippedInteractedKeys };
  }

  async function readPostAndComments({ expandComments = true, myUid = '' } = {}) {
    const core = await getCore();
    clearActivePostMarker();
    activeOpenedModal = null;
    await dismissObstructions(core);

    const { root: postRoot, kind: rootKind } = findMainPostRoot();
    if (!postRoot) throw new Error('Không tìm thấy bài viết trên trang này.');

    postRoot.setAttribute('data-fb-exten-active-post', '1');
    if (rootKind !== 'dialog_modal') {
      await scrollTargetIntoComfortView(postRoot);
    }

    await expandPostAndComments(core, postRoot, expandComments);
    const extracted = extractThreadFromRoot(postRoot, rootKind, core);
    const interacted = checkPostAlreadyInteracted(postRoot, myUid);

    emitProgress('ACTION_LOG', {
      level: 'info',
      message: `📖 Đọc bài (${rootKind}): Tác giả "${extracted.threadInput.postAuthor}", ${extracted.threadInput.comments.length} bình luận`,
    });

    return {
      ...extracted.threadInput,
      postKey: extracted.postKey,
      commentsDisabled: extracted.commentsDisabled,
      alreadyInteracted: interacted.interacted,
      alreadyInteractedReason: interacted.reason,
    };
  }

  // ============================================================================
  // 4. HỆ THỐNG TÌM ĐÚNG Ô F12 (THẢ TIM + BÌNH LUẬN + VISION SET-OF-MARK)
  // ============================================================================

  async function hoverAndClickElement(core, el, useCdp, targetLabel = 'Click F12') {
    await scrollTargetIntoComfortView(el);
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);

    showF12Highlight(el, `🎯 ${targetLabel}`, '#10b981', 2600);
    moveVisualCursor(x, y);
    emitProgress('ACTION_LOG', { level: 'info', message: `🎯 [F12] ${targetLabel}: ${describeElementF12(el)}` });
    await core.sleep(core.randomInt(200, 350));

    if (useCdp) {
      const res = await chrome.runtime.sendMessage({ type: 'CDP_CLICK', x, y }).catch(() => null);
      if (res?.ok) return;
    }

    const init = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
    el.dispatchEvent(new PointerEvent('pointerover', init));
    el.dispatchEvent(new MouseEvent('mouseover', init));
    await core.sleep(core.randomInt(80, 160));
    el.dispatchEvent(new PointerEvent('pointerdown', { ...init, button: 0, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...init, button: 0, buttons: 1 }));
    await core.sleep(core.randomInt(50, 100));
    el.dispatchEvent(new PointerEvent('pointerup', { ...init, button: 0, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...init, button: 0, buttons: 0 }));
    el.click();
  }

  async function hoverElement(core, el, useCdp, targetLabel = 'Hover F12') {
    await scrollTargetIntoComfortView(el);
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);

    showF12Highlight(el, `🎯 ${targetLabel}`, '#f59e0b', 2400);
    moveVisualCursor(x, y);
    await core.sleep(core.randomInt(180, 300));

    if (useCdp) {
      const res = await chrome.runtime.sendMessage({ type: 'CDP_HOVER', x, y }).catch(() => null);
      if (res?.ok) return;
    }

    const init = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
    el.dispatchEvent(new PointerEvent('pointerover', init));
    el.dispatchEvent(new MouseEvent('mouseover', init));
    el.dispatchEvent(new PointerEvent('pointerenter', { ...init, bubbles: false }));
    el.dispatchEvent(new MouseEvent('mouseenter', { ...init, bubbles: false }));
  }

  function findReactionButtonInScope(scopeEl, isCommentScope) {
    const insideComment = (el) =>
      !isCommentScope &&
      Boolean(
        el.closest('[data-fb-exten-cmt-idx], div[role="article"][aria-label*="Bình luận" i], div[role="article"][aria-label*="Comment" i]')
      );

    const allBtns = Array.from(scopeEl.querySelectorAll('[role="button"], button')).filter(
      (b) => isElementVisible(b) && !insideComment(b)
    );

    // 1. Đã thả tim/like trước đó rồi -> không bấm nhầm làm gỡ cảm xúc
    const isStatsBadge = (combinedAria, txt) => {
      const joined = `${combinedAria || ''} ${txt || ''}`.trim();
      return /:\s*\d|\d+\s*(người|people|bình luận|comment|chia sẻ|share)|xem ai|see who|tất cả cảm xúc|all reactions|lượt thích|bỏ thích|ẩn/i.test(
        joined
      );
    };

    const alreadyReacted = allBtns.find((b) => {
      const { combinedAria, txt, adRole } = getButtonSignals(b);
      if (isStatsBadge(combinedAria, txt)) return false;
      if (adRole && adRole !== 'like_button') return false;
      const pressed = b.getAttribute('aria-pressed') === 'true';
      if (pressed && /^(thích|like|yêu thích|love|gỡ|remove|haha|wow|thương thương|buồn|phẫn nộ)/i.test(combinedAria || txt)) {
        return true;
      }
      return /gỡ yêu thích|remove love|gỡ thích|bạn đã bày tỏ cảm xúc/i.test(`${combinedAria} ${txt}`);
    });
    if (alreadyReacted) return { alreadyLoved: true, button: alreadyReacted };

    // 2. Semantic attribute mới của Facebook React 2025/2026
    const adRoleLike = allBtns.find((b) => getButtonSignals(b).adRole === 'like_button');
    if (adRoleLike) return { alreadyLoved: false, button: adRoleLike };

    // 3. Khớp exact text ("Thích", "Like") hoặc aria-label chuẩn (KHÔNG khớp "Thích: 364 người")
    let likeBtn = allBtns.find((b) => {
      const { aria, combinedAria, txt } = getButtonSignals(b);
      if (isStatsBadge(combinedAria, txt)) return false;
      return (
        /^(thích|like)$/i.test(txt) ||
        /^(thích|like|bày tỏ cảm xúc|thả cảm xúc|react)$/i.test(aria) ||
        /^(thích|like|bày tỏ cảm xúc|thả cảm xúc)$/i.test(combinedAria)
      );
    });

    // 4. Fallback thanh nút cùng hàng với nút Bình luận / Chia sẻ (dùng tọa độ Y thay vì phụ thuộc DOM depth)
    if (!likeBtn && !isCommentScope) {
      const commentActionBtn = allBtns.find((b) => {
        const { combinedAria, txt, adRole } = getButtonSignals(b);
        if (adRole === 'comment_button') return true;
        if (isStatsBadge(combinedAria, txt) || /xem thêm|tất cả|phù hợp|view more|all comments/i.test(`${combinedAria} ${txt}`)) {
          return false;
        }
        return /^(bình luận|viết bình luận|comment)$/i.test(txt) || /^(bình luận|comment)$/i.test(combinedAria);
      });
      if (commentActionBtn) {
        const cRect = commentActionBtn.getBoundingClientRect();
        const rowLeftBtns = allBtns
          .filter((b) => {
            if (b === commentActionBtn) return false;
            const sig = getButtonSignals(b);
            if (isStatsBadge(sig.combinedAria, sig.txt)) return false;
            const r = b.getBoundingClientRect();
            return Math.abs(r.top - cRect.top) < 24 && r.right <= cRect.left + 8;
          })
          .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
        if (rowLeftBtns.length > 0) {
          likeBtn = rowLeftBtns[0];
        }
      }
    }

    return { alreadyLoved: false, button: likeBtn || null };
  }

  function findPostEditorOnly(postRoot) {
    const searchRoot = (root) =>
      Array.from(
        root.querySelectorAll(
          '[role="textbox"][contenteditable="true"], [contenteditable="true"][data-lexical-editor="true"], [contenteditable="true"][aria-label]'
        )
      ).filter((el) => {
        if (!isElementVisible(el)) return false;
        if (
          el.closest('[data-fb-exten-cmt-idx], div[role="article"][aria-label*="Bình luận" i], div[role="article"][aria-label*="Comment" i]')
        ) {
          return false;
        }
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        if (/trả lời|reply|tìm kiếm|search|nhắn tin|message/.test(aria)) return false;
        return /bình luận|comment|viết|write/.test(aria) || el.getAttribute('role') === 'textbox';
      });

    const inRoot = searchRoot(postRoot);
    if (inRoot.length > 0) return inRoot[0];

    const dialogParent = postRoot.closest('div[role="dialog"]') || activeOpenedModal;
    if (dialogParent) {
      const inDlg = searchRoot(dialogParent);
      if (inDlg.length > 0) return inDlg[inDlg.length - 1];
    }

    return null;
  }

  function findPostCommentTrigger(postRoot) {
    const searchTriggerIn = (root) => {
      const allBtns = Array.from(root.querySelectorAll('[role="button"], button')).filter(
        (b) =>
          isElementVisible(b) &&
          !b.closest('[data-fb-exten-cmt-idx], div[role="article"][aria-label*="Bình luận" i], div[role="article"][aria-label*="Comment" i]')
      );

      const adRoleCmt = allBtns.find((b) => getButtonSignals(b).adRole === 'comment_button');
      if (adRoleCmt) return adRoleCmt;

      const byLabel = allBtns.find((b) => {
        const { combinedAria, txt } = getButtonSignals(b);
        if (
          /:\s*\d|\d+\s*(bình luận|comment|người|people)|xem thêm bình luận|tất cả bình luận|phù hợp nhất|view more comments|all comments|đã tắt|ẩn/i.test(
            `${combinedAria} ${txt}`
          )
        ) {
          return false;
        }
        return (
          /^(viết bình luận|bình luận|để lại bình luận|comment|write a comment)$/i.test(txt) ||
          /^(bình luận|viết bình luận|bình luận dưới tên|comment)/i.test(combinedAria) ||
          /\b(viết bình luận|bình luận công khai|bình luận dưới tên|leave a comment)\b/i.test(`${combinedAria} ${txt}`)
        );
      });
      if (byLabel) return byLabel;

      // Placeholder textbox giả ở cuối card
      const fakeInput = Array.from(root.querySelectorAll('div, span')).find((el) => {
        if (!isElementVisible(el) || el.children.length > 3) return false;
        if (el.closest('[data-fb-exten-cmt-idx]')) return false;
        const t = (el.innerText || '').trim();
        return /^(viết bình luận công khai|viết bình luận|bình luận dưới tên|bình luận với tư cách|write a comment|comment as)/i.test(t);
      });
      if (fakeInput) return fakeInput;

      // Fallback nút nằm ngay bên trái nút Chia sẻ cùng hàng
      const shareBtn = allBtns.find((b) => /^(chia sẻ|share)$/i.test(getButtonSignals(b).txt) || /chia sẻ|share/i.test(getButtonSignals(b).combinedAria));
      if (shareBtn) {
        const sRect = shareBtn.getBoundingClientRect();
        const leftSibs = allBtns
          .filter((b) => {
            if (b === shareBtn) return false;
            const r = b.getBoundingClientRect();
            return Math.abs(r.top - sRect.top) < 24 && r.right <= sRect.left + 8;
          })
          .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
        if (leftSibs.length > 0) return leftSibs[0];
      }

      return null;
    };

    const inRoot = searchTriggerIn(postRoot);
    if (inRoot) return inRoot;

    const dialogParent = postRoot.closest('div[role="dialog"]') || activeOpenedModal;
    if (dialogParent) return searchTriggerIn(dialogParent);
    return null;
  }

  function buildSetOfMarkOverlay(scopeEl) {
    clearSetOfMarkOverlay();
    const somMap = new Map();
    const root = scopeEl || document;

    const candidates = Array.from(
      root.querySelectorAll('[role="button"], button, [role="textbox"], [contenteditable="true"]')
    ).filter((el) => {
      if (!isElementVisible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.bottom >= 0 && r.top <= window.innerHeight + 120 && r.width >= 14 && r.height >= 14;
    });

    const catalog = [];
    candidates.slice(0, 50).forEach((el, i) => {
      const markId = i + 1;
      somMap.set(markId, el);
      el.setAttribute('data-fb-exten-som-id', String(markId));
      const r = el.getBoundingClientRect();

      const badge = document.createElement('div');
      badge.className = 'fb-exten-som-tag';
      badge.textContent = `[${markId}]`;
      badge.style.cssText = `
        position: fixed;
        left: ${Math.max(0, r.left)}px;
        top: ${Math.max(0, r.top - 14)}px;
        background: #f59e0b;
        color: #07090e;
        font-family: monospace;
        font-size: 10px;
        font-weight: 900;
        padding: 1px 4px;
        border-radius: 4px;
        border: 1px solid #000;
        pointer-events: none;
        z-index: 2147483645;
      `;
      document.body?.appendChild(badge);

      catalog.push({
        markId,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '',
        ariaLabel: (el.getAttribute('aria-label') || '').slice(0, 50),
        text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 45),
        isEditable: Boolean(el.isContentEditable),
        rect: {
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          w: Math.round(r.width),
          h: Math.round(r.height),
        },
      });
    });

    return { catalog, somMap };
  }

  async function visionFindTarget(core, scopeEl, goalDescription) {
    try {
      const { catalog, somMap } = buildSetOfMarkOverlay(scopeEl);
      if (catalog.length === 0) return null;
      await core.sleep(150);

      emitProgress('ACTION_LOG', {
        level: 'info',
        message: `📸 [Vision SoM] Quét ${catalog.length} phần tử tìm: "${goalDescription}"...`,
      });

      const res = await chrome.runtime.sendMessage({
        type: 'VISION_LOCATE_ELEMENT',
        payload: { goalDescription, somCatalog: catalog },
      });

      // Giữ tham chiếu trong somMap rồi mới xóa badge overlay
      clearSetOfMarkOverlay();

      if (res?.ok && res.data?.targetMarkId) {
        const el = somMap.get(res.data.targetMarkId);
        if (el && el instanceof HTMLElement && document.body.contains(el)) {
          showF12Highlight(el, `🧠 [Vision #${res.data.targetMarkId}]`, '#ec4899', 4000);
          emitProgress('ACTION_LOG', {
            level: 'ok',
            message: `🧠 [Vision OK] Chọn #${res.data.targetMarkId} (${res.data.reason || 'khớp mục tiêu'})`,
          });
          return el;
        }
      } else if (res?.error) {
        emitProgress('ACTION_LOG', { level: 'warn', message: `⚠️ Vision fallback: ${res.error}` });
      }
    } catch {
      clearSetOfMarkOverlay();
    }
    return null;
  }

  async function reactLoveOnScope(core, scopeEl, useCdp, isCommentScope = false) {
    let found = findReactionButtonInScope(scopeEl, isCommentScope);
    if (!found.alreadyLoved && !found.button && !isCommentScope) {
      const learnedLike = await findElementByLearnedProfile(core, scopeEl, 'like_btn', null, { excludeComment: true });
      if (learnedLike?.el) {
        found = { alreadyLoved: false, button: learnedLike.el };
      }
    }
    if (!found.alreadyLoved && !found.button && scopeEl.matches('div[role="dialog"]')) {
      const scroller = findDialogScrollContainer(scopeEl);
      if (scroller) {
        scroller.scrollTop = Math.max(0, scroller.scrollTop - 350);
        await core.sleep(450);
        found = findReactionButtonInScope(scopeEl, isCommentScope);
      }
    }

    if (found.alreadyLoved) return { ok: true, status: 'already_loved' };
    let likeBtn = found.button;

    if (!likeBtn && !isCommentScope) {
      likeBtn = await visionFindTarget(core, scopeEl, 'Nút Thích (Like) dưới bài viết để thả tim');
      if (likeBtn) {
        // Tự sửa F12 (Self-Healing): lưu cấu trúc F12 mới vừa cứu được vào Profile máy
        try {
          chrome.runtime.sendMessage({
            type: 'SAVE_LEARNED_F12_TARGET',
            payload: { role: 'like_btn', fingerprint: buildF12Fingerprint(likeBtn), pageTitle: document.title, selfHealed: true },
          }).catch(() => {});
        } catch {}
      }
    }
    if (!likeBtn) return { ok: false, status: 'not_found' };

    await hoverElement(core, likeBtn, useCdp, isCommentScope ? 'Thích Bình Luận' : 'Nút Thích Bài Viết');
    await core.sleep(core.randomInt(750, 1100));

    const findLoveInTray = async () => {
      const learnedLove = await findElementByLearnedProfile(core, document.body, 'love_btn', null, { minScore: 46 });
      if (learnedLove?.el) return learnedLove.el;
      return Array.from(document.querySelectorAll('[role="button"], button')).find((b) => {
        if (!isElementVisible(b)) return false;
        const { combinedAria, txt } = getButtonSignals(b);
        return /^(yêu thích|love)$/i.test(combinedAria) || /^(yêu thích|love)$/i.test(txt);
      });
    };

    let loveBtn = await findLoveInTray();
    if (!loveBtn) {
      await hoverElement(core, likeBtn, useCdp, isCommentScope ? 'Hover lại Thích' : 'Hover lại Thích Bài');
      await core.sleep(900);
      loveBtn = await findLoveInTray();
    }

    if (loveBtn) {
      await hoverAndClickElement(core, loveBtn, useCdp, '❤️ Yêu Thích');
      await core.sleep(core.randomInt(600, 950));
      return { ok: true, status: 'loved' };
    }

    // Fallback an toàn: bấm thẳng Thích nếu Facebook không bật khay 7 cảm xúc
    await hoverAndClickElement(core, likeBtn, useCdp, '👍 Bấm Thích (Fallback)');
    await core.sleep(core.randomInt(500, 850));
    return { ok: true, status: 'liked_fallback' };
  }

  async function findOrOpenPostCommentEditor(core, initialRoot, useCdp) {
    let scope = resolveLiveActionScope() || initialRoot;
    const learnedEditor = await findElementByLearnedProfile(core, scope, 'comment_editor', null, {
      excludeComment: true,
      editableOnly: true,
    });
    if (learnedEditor?.el) return learnedEditor.el;

    let editor = findPostEditorOnly(scope);
    if (editor) return editor;

    // Nếu trong Modal Dialog bị cuộn lên trên, cuộn xuống đáy dialog thử tìm lại
    if (scope.matches('div[role="dialog"]')) {
      const scroller = findDialogScrollContainer(scope);
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
        await core.sleep(450);
        editor = findPostEditorOnly(scope);
        if (editor) return editor;
      }
    }

    const learnedTrigger = await findElementByLearnedProfile(core, scope, 'comment_trigger', null, {
      excludeComment: true,
    });
    const trigger = learnedTrigger?.el || findPostCommentTrigger(scope);
    if (trigger) {
      await hoverAndClickElement(core, trigger, useCdp, learnedTrigger?.el ? 'Mở Ô Bình Luận (F12 Đã Học)' : 'Mở Ô Bình Luận');
      for (let w = 0; w < 8; w++) {
        await core.sleep(300);
        scope = resolveLiveActionScope() || scope;
        const learnedEdAfter = await findElementByLearnedProfile(core, scope, 'comment_editor', null, {
          excludeComment: true,
          editableOnly: true,
        });
        editor = learnedEdAfter?.el || findPostEditorOnly(scope);
        if (editor) return editor;
      }
    }

    // Fallback Muse Vision AI + Self-Healing F12
    const visionEl = await visionFindTarget(
      core,
      scope,
      'Ô nhập "Viết bình luận" hoặc nút Bình luận của bài viết'
    );
    if (visionEl) {
      const healedRole =
        visionEl.isContentEditable || visionEl.getAttribute('role') === 'textbox' ? 'comment_editor' : 'comment_trigger';
      try {
        chrome.runtime.sendMessage({
          type: 'SAVE_LEARNED_F12_TARGET',
          payload: { role: healedRole, fingerprint: buildF12Fingerprint(visionEl), pageTitle: document.title, selfHealed: true },
        }).catch(() => {});
      } catch {}

      if (visionEl.isContentEditable || visionEl.getAttribute('role') === 'textbox') {
        return visionEl;
      }
      await hoverAndClickElement(core, visionEl, useCdp, 'Vision Mở Ô Bình Luận');
      for (let w = 0; w < 6; w++) {
        await core.sleep(300);
        scope = resolveLiveActionScope() || scope;
        editor = findPostEditorOnly(scope);
        if (editor) return editor;
      }
    }

    return null;
  }

  async function findOrOpenReplyEditor(core, commentNode, useCdp) {
    const replyBtn = Array.from(commentNode.querySelectorAll('[role="button"], button')).find((b) => {
      if (!isElementVisible(b)) return false;
      const { combinedAria, txt } = getButtonSignals(b);
      return /^(trả lời|reply)$/i.test(txt) || /^(trả lời|reply)\b/i.test(combinedAria);
    });

    if (!replyBtn) return null;

    // Ghi nhớ các ô bình luận đang mở sẵn trước khi bấm Trả lời (tránh bắt nhầm ô Bình luận bài chính!)
    const beforeEditors = new Set(
      Array.from(
        document.querySelectorAll('[role="textbox"][contenteditable="true"], [contenteditable="true"][data-lexical-editor="true"]')
      ).filter(isElementVisible)
    );

    await hoverAndClickElement(core, replyBtn, useCdp, 'Nút Trả Lời');

    const container = commentNode.parentElement || document;
    for (let w = 0; w < 7; w++) {
      await core.sleep(320);
      const localEditors = Array.from(
        container.querySelectorAll('[role="textbox"][contenteditable="true"], [contenteditable="true"][data-lexical-editor="true"]')
      ).filter(isElementVisible);

      // Ưu tiên 1: ô mới vừa xuất hiện sau khi bấm Trả lời
      const newlyOpened = localEditors.find((e) => !beforeEditors.has(e));
      if (newlyOpened) return newlyOpened;

      // Ưu tiên 2: ô có aria-label rõ ràng là Trả lời / Reply
      const explicitReply = localEditors.find((e) => /trả lời|reply/i.test(e.getAttribute('aria-label') || ''));
      if (explicitReply) return explicitReply;

      // Ưu tiên 3: ô mới xuất hiện toàn trang (trường hợp FB gắn form reply ra node anh em)
      const docNew = Array.from(
        document.querySelectorAll('[role="textbox"][contenteditable="true"], [contenteditable="true"][data-lexical-editor="true"]')
      ).find((e) => isElementVisible(e) && !beforeEditors.has(e));
      if (docNew) return docNew;
    }
    return null;
  }

  function getCleanEditorText(editor) {
    if (!editor) return '';
    if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
      return String(editor.value || '').trim();
    }
    return String(editor.innerText || editor.textContent || '')
      .replace(/\u200B/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function clearEditorSafely(core, editor, preserveShortMention = false) {
    if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
      const proto = editor instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(editor, '');
      else editor.value = '';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    const cur = getCleanEditorText(editor);
    if (!cur) return;

    // Nếu là ô Reply và Facebook tự gắn sẵn @TênNgườiDùng ngắn (chưa có câu dài) -> giữ lại tag @ và đưa con trỏ ra cuối
    if (preserveShortMention && cur.length <= 36 && !/[.!?,]/.test(cur)) {
      try {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {}
      return;
    }

    // Xóa sạch chữ cũ/kẹt trong Lexical trước khi gõ câu mới (chống cộng dồn 2x-4x!)
    try {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
      await core.sleep(90);
      if (getCleanEditorText(editor).length > 0) {
        editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' }));
        await core.sleep(70);
      }
    } catch {}
  }

  function placeCaretAtEnd(editor) {
    try {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {}
  }

  async function insertTextIntoEditor(core, editor, rawText, useCdp, opts = {}) {
    const finalText = core.sanitizeSingleCommentText(rawText || '');
    if (!finalText) return false;

    await hoverAndClickElement(core, editor, useCdp, 'Ô Nhập Nội Dung');
    editor.focus();
    await core.sleep(core.randomInt(200, 360));

    // Hỗ trợ chuẩn <input> và <textarea> thông thường (ô tìm kiếm, form...)
    if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
      const proto = editor instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(editor, finalText);
      else editor.value = finalText;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return editor.value.trim().length > 0;
    }

    // Dọn sạch chữ cũ bị kẹt (nếu có) trước khi chèn
    await clearEditorSafely(core, editor, Boolean(opts.isReply));
    placeCaretAtEnd(editor);

    const sig = finalText.slice(0, Math.min(18, finalText.length)).toLowerCase();
    const beforeText = getCleanEditorText(editor);

    // Chống chèn trùng tuyệt đối nếu câu đã nằm sẵn trong ô
    if (sig.length >= 8 && beforeText.toLowerCase().includes(sig)) {
      return true;
    }

    const textToType = beforeText.length > 0 && !beforeText.endsWith(' ') ? ` ${finalText}` : finalText;
    const isInsertedCleanly = () => {
      const nowText = getCleanEditorText(editor);
      return nowText.length > beforeText.length && nowText.toLowerCase().includes(sig);
    };

    // Bước 1: Nếu bật CDP Real Input -> gõ 1 lần duy nhất qua Chrome Debugger
    if (useCdp) {
      const typeRes = await chrome.runtime.sendMessage({ type: 'CDP_INSERT_TEXT', text: textToType }).catch(() => null);
      await core.sleep(120);
      if (typeRes?.ok && isInsertedCleanly()) {
        return true;
      }
    }

    // Bước 2 (CHÍNH cho Facebook Lexical Editor): Paste 1 transaction nguyên tử — KHÔNG gọi kèm execCommand để tránh lặp 2x!
    if (!isInsertedCleanly()) {
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', textToType);
        editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
        await core.sleep(110);
      } catch {}
    }

    // Bước 3 (Chỉ chạy nếu Paste chưa điền được vào DOM, VD contenteditable chuẩn): execCommand đơn lẻ (KHÔNG tự phát beforeinput trước đó!)
    if (!isInsertedCleanly()) {
      try {
        editor.focus();
        placeCaretAtEnd(editor);
        document.execCommand('insertText', false, textToType);
        await core.sleep(110);
      } catch {}
    }

    // Bước 4 (Dự phòng cuối nếu cả Paste & execCommand đều bị chặn): beforeinput đơn lẻ
    if (!isInsertedCleanly()) {
      try {
        editor.focus();
        placeCaretAtEnd(editor);
        editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: textToType }));
        await core.sleep(110);
      } catch {}
    }

    // Tự kiểm tra chống dính lặp 2x (nếu trình duyệt/Lexical nào vẫn vô tình nhân đôi -> xóa sạch và ghi đúng 1 lần)
    const afterText = getCleanEditorText(editor);
    if (sig.length >= 10) {
      const occurrences = afterText.toLowerCase().split(sig).length - 1;
      if (occurrences >= 2) {
        emitProgress('ACTION_LOG', { level: 'warn', message: '🛡️ Phát hiện ô nhập bị nhân đôi chữ -> Tự dọn sạch & ghi lại đúng 1 lần!' });
        await clearEditorSafely(core, editor, false);
        placeCaretAtEnd(editor);
        document.execCommand('insertText', false, finalText);
        await core.sleep(100);
      }
    }

    return getCleanEditorText(editor).toLowerCase().includes(sig);
  }

  function resolveComposerScope(editor) {
    const form = editor.closest('form');
    if (form && form instanceof HTMLElement) return form;
    let cur = editor.parentElement;
    for (let d = 0; d < 6 && cur && cur !== document.body; d++) {
      const r = cur.getBoundingClientRect();
      if (r.height > 40 && r.height < 420 && cur.querySelector('#focused-state-composer-submit, [role="button"], button')) {
        if (cur.querySelector('#focused-state-composer-submit') || d >= 3) return cur;
      }
      cur = cur.parentElement;
    }
    return editor.parentElement?.parentElement?.parentElement || document;
  }

  async function findEnabledSendButton(core, editor) {
    const scope = resolveComposerScope(editor);

    // 1. Selector chính chủ của Facebook Composer 2025/2026 (#focused-state-composer-submit)
    const fbSubmitWrap = scope.querySelector('#focused-state-composer-submit');
    if (fbSubmitWrap instanceof HTMLElement) {
      const innerBtn =
        fbSubmitWrap.getAttribute('role') === 'button'
          ? fbSubmitWrap
          : fbSubmitWrap.querySelector('[role="button"], button');
      if (innerBtn instanceof HTMLElement && isElementVisible(innerBtn) && innerBtn.getAttribute('aria-disabled') !== 'true') {
        return innerBtn;
      }
    }

    // 2. Ưu tiên nút F12 comment_submit người dùng đã dạy trên máy
    const learnedSubmit = await findElementByLearnedProfile(core, scope, 'comment_submit', null, { minScore: 48 });
    if (learnedSubmit?.el && learnedSubmit.el.getAttribute('aria-disabled') !== 'true') {
      return learnedSubmit.el;
    }

    const forbiddenSend =
      /chèn|biểu tượng|emoji|ảnh|video|photo|camera|gif|nhãn dán|sticker|avatar|đính kèm|attach|mention|bình luận dưới tên|comment as|chuyển đổi/i;

    const btns = Array.from(scope.querySelectorAll('[role="button"], button')).filter(
      (b) => isElementVisible(b) && b.getAttribute('aria-disabled') !== 'true' && !b.contains(editor)
    );

    // 3. Khớp aria-label chuẩn Việt / Anh (bao gồm cả Bình luận, Gửi, Trả lời, Nhấn Enter để đăng)
    const byAria = btns.find((b) => {
      const aria = (b.getAttribute('aria-label') || b.querySelector('[aria-label]')?.getAttribute('aria-label') || '').trim();
      if (!aria || forbiddenSend.test(aria)) return false;
      return /^(bình luận|đăng bình luận|gửi bình luận|gửi|trả lời|đăng|comment|post comment|send|reply|submit|nhấn enter|press enter)/i.test(
        aria
      );
    });
    if (byAria) return byAria;

    // 4. Fallback hình học: nút icon máy bay giấy góc dưới-phải trong cùng hộp soạn bình luận
    const edRect = editor.getBoundingClientRect();
    const rightIconBtns = btns.filter((b) => {
      const aria = (b.getAttribute('aria-label') || '').trim();
      if (forbiddenSend.test(aria)) return false;
      const hasIcon = Boolean(b.querySelector('svg, i'));
      if (!hasIcon) return false;
      const r = b.getBoundingClientRect();
      return r.width <= 48 && r.height <= 48 && r.left >= edRect.left + edRect.width * 0.65 && r.top >= edRect.top - 10;
    });
    if (rightIconBtns.length > 0) {
      rightIconBtns.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
      return rightIconBtns[0];
    }

    return null;
  }

  async function submitTextToEditor(core, editor, rawText, useCdp, opts = {}) {
    // BƯỚC 1: SOÁT LỖI & ĐỘ PHÙ HỢP TRƯỚC KHI DÁN (không đạt -> tuyệt đối không dán!)
    const preCheck = core.validateCommentBeforePaste(rawText || '', {
      postText: opts.postText,
      targetText: opts.targetText,
      postAuthorRole: opts.postAuthorRole,
      recentSentComments: opts.recentSentComments || [],
      allowManualOverride: Boolean(opts.allowManualOverride),
    });
    if (!preCheck.ok) {
      emitProgress('ACTION_LOG', {
        level: 'warn',
        message: `🛡️ [Soát trước khi dán] Bỏ qua comment: ${preCheck.reason}`,
      });
      return false;
    }

    const finalText = preCheck.cleanedText;
    const inserted = await insertTextIntoEditor(core, editor, finalText, useCdp, opts);
    if (!inserted) {
      emitProgress('ACTION_LOG', { level: 'warn', message: '⚠️ Không điền được chữ vào khung bình luận.' });
      return false;
    }

    // BƯỚC 2: SOÁT LẠI CHỮ ĐÃ NẰM TRONG Ô (đúng 1 bản sạch, không lặp, không lỗi) RỒI MỚI CHO PHÉP ENTER
    const inBoxNow = getCleanEditorText(editor);
    const sig = finalText.slice(0, Math.min(18, finalText.length)).toLowerCase();
    const dupCount = sig.length >= 10 ? inBoxNow.toLowerCase().split(sig).length - 1 : 1;
    if (!inBoxNow.toLowerCase().includes(sig) || dupCount >= 2) {
      emitProgress('ACTION_LOG', {
        level: 'warn',
        message: '🛡️ [Soát sau khi dán] Phát hiện nội dung trong ô bị thiếu/lặp -> Hủy nhấn Enter & tự dọn sạch ô!',
      });
      await clearEditorSafely(core, editor, false);
      return false;
    }

    await core.sleep(core.randomInt(650, 1150));

    const allowEnter = opts.allowEnterToSend !== false;

    const triggerEnterSend = async () => {
      editor.focus();
      placeCaretAtEnd(editor);
      if (useCdp) {
        const enterRes = await chrome.runtime.sendMessage({ type: 'CDP_PRESS_ENTER' }).catch(() => null);
        if (enterRes?.ok) {
          emitProgress('ACTION_LOG', { level: 'info', message: '↵ Đã nhấn Enter (CDP) gửi bình luận...' });
          return true;
        }
      }
      const evInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: false, bubbles: true, cancelable: true };
      editor.dispatchEvent(new KeyboardEvent('keydown', evInit));
      editor.dispatchEvent(new KeyboardEvent('keypress', evInit));
      editor.dispatchEvent(new KeyboardEvent('keyup', evInit));
      emitProgress('ACTION_LOG', { level: 'info', message: '↵ Đã nhấn Enter gửi bình luận...' });
      return true;
    };

    const triggerButtonSend = async () => {
      const sendBtn = await findEnabledSendButton(core, editor);
      if (sendBtn) {
        await hoverAndClickElement(core, sendBtn, useCdp, 'Nút Gửi Bình Luận');
        return true;
      }
      return false;
    };

    const verifySubmitted = async (maxChecks = 5) => {
      const snippet = finalText.slice(0, Math.min(20, finalText.length)).toLowerCase();
      for (let i = 0; i < maxChecks; i++) {
        await core.sleep(320);
        if (!document.body.contains(editor)) return true;
        const remaining = getCleanEditorText(editor);
        if (remaining.length === 0) return true;
        if (!remaining.toLowerCase().includes(snippet)) return true;
      }
      return false;
    };

    // BƯỚC 3: CHO PHÉP NHẤN ENTER TRƯỚC (khi đã dán xong text chuẩn), FALLBACK BẤM NÚT GỬI NẾU FACEBOOK CHẶN ENTER GIẢ LẬP
    if (allowEnter) {
      await triggerEnterSend();
      if (await verifySubmitted(4)) return true;

      if (getCleanEditorText(editor).length > 0) {
        emitProgress('ACTION_LOG', { level: 'info', message: '📨 Enter chưa đẩy bài -> Chuyển sang bấm nút Gửi xanh...' });
        const clicked = await triggerButtonSend();
        if (clicked && (await verifySubmitted(5))) return true;
      }
    } else {
      const clicked = await triggerButtonSend();
      if (clicked && (await verifySubmitted(5))) return true;
      if (getCleanEditorText(editor).length > 0) {
        await triggerEnterSend();
        if (await verifySubmitted(4)) return true;
      }
    }

    // Nếu vẫn không gửi được -> dọn sạch chữ kẹt trong ô và báo false để không bao giờ tích tụ 2x-4x!
    emitProgress('ACTION_LOG', {
      level: 'warn',
      message: '⚠️ Chưa gửi được bình luận trên ô này — đã tự dọn sạch ô (nên bật CDP hoặc chấm dạy nút Gửi Bình Luận).',
    });
    await clearEditorSafely(core, editor, false);
    return false;
  }

  // ============================================================================
  // 5. THỰC THI HÀNH ĐỘNG TRÊN BÀI VIẾT ĐANG MỞ & DRY-RUN TEST F12
  // ============================================================================

  async function executeThreadActions({
    analysis,
    postText = '',
    recentSentComments = [],
    allowEnterToSend = true,
    doLove = true,
    doCommentPost = true,
    doReplyBuyers = true,
    useCdp = false,
    minDelaySec = 8,
    maxDelaySec = 18,
    onlyTarget = null,
  }) {
    const core = await getCore();
    abortActions = false;
    const postRoot = resolveLiveActionScope();
    if (!postRoot) throw new Error('Không tìm thấy bài viết đang chọn trên màn hình Facebook.');

    let lovedCount = 0;
    let commentedCount = 0;
    const sentTexts = [];
    const liveRecent = Array.isArray(recentSentComments) ? [...recentSentComments] : [];
    const skippedSellerCount = (analysis.commentEvaluations || []).filter((c) => c.role === 'seller').length;

    const preCp = checkCheckpointDialogs(core);
    if (preCp.isCheckpoint) {
      return { lovedCount, commentedCount, sentTexts, skippedSellerCount, checkpointHit: true, checkpointReason: preCp.reason };
    }

    // 1. Thả tim & Bình luận trên Bài viết chính
    if (!onlyTarget || onlyTarget.kind === 'post') {
      if (doLove && analysis.postAuthorRole !== 'seller' && !abortActions) {
        updateHud({ running: true, message: `❤️ Thả tim bài của ${analysis.postAuthor}...` });
        const reactRes = await reactLoveOnScope(core, resolveLiveActionScope() || postRoot, useCdp, false);
        if (reactRes.ok && reactRes.status !== 'already_loved') lovedCount++;
        emitProgress('ACTION_LOG', {
          level: reactRes.ok ? 'ok' : 'warn',
          message: `❤️ Bài chính (${analysis.postAuthor}): ${reactRes.status}`,
        });
      }

      if (doCommentPost && analysis.shouldCommentPost && (onlyTarget?.text || analysis.suggestedPostComment) && !abortActions) {
        const postCmtText = onlyTarget?.text || analysis.suggestedPostComment;
        const postCheck = core.validateCommentBeforePaste(postCmtText, {
          postText: postText || analysis.topicSummary || '',
          postAuthorRole: analysis.postAuthorRole,
          recentSentComments: liveRecent,
          allowManualOverride: Boolean(onlyTarget?.text),
        });
        if (!postCheck.ok) {
          emitProgress('ACTION_LOG', {
            level: 'warn',
            message: `🛡️ [Soát trước khi dán] Bỏ qua bài "${analysis.postAuthor}": ${postCheck.reason}`,
          });
        } else {
          updateHud({ running: true, message: `💬 Tìm ô bình luận bài của ${analysis.postAuthor}...` });
          const editor = await findOrOpenPostCommentEditor(core, postRoot, useCdp);
          if (editor) {
            const ok = await submitTextToEditor(core, editor, postCheck.cleanedText, useCdp, {
              isReply: false,
              allowEnterToSend,
              postText: postText || analysis.topicSummary || '',
              postAuthorRole: analysis.postAuthorRole,
              recentSentComments: liveRecent,
              allowManualOverride: Boolean(onlyTarget?.text),
            });
            if (ok) {
              commentedCount++;
              sentTexts.push(postCheck.cleanedText);
              liveRecent.unshift(postCheck.cleanedText);
              emitProgress('ACTION_LOG', {
                level: 'ok',
                message: `💬 Đã bình luận bài "${analysis.postAuthor}"`,
              });
            }
          } else {
            emitProgress('ACTION_LOG', { level: 'warn', message: '⚠️ Không tìm thấy ô bình luận bài chính.' });
          }
        }
      } else if (analysis.postAuthorRole === 'seller') {
        emitProgress('ACTION_LOG', {
          level: 'warn',
          message: `🚫 Bỏ qua bài chính "${analysis.postAuthor}" (Spam / Rao bán).`,
        });
      }
    }

    // 2. Thả tim & Trả lời từng người bình luận có nhu cầu (Bỏ qua Spam/Rao bán!)
    if ((doReplyBuyers || onlyTarget?.kind === 'comment') && !abortActions) {
      const targetComments =
        onlyTarget?.kind === 'comment'
          ? (analysis.commentEvaluations || []).filter((c) => c.index === onlyTarget.index)
          : (analysis.commentEvaluations || []).filter((c) => c.shouldEngage && c.role !== 'seller' && c.suggestedReply);

      for (let i = 0; i < targetComments.length; i++) {
        if (abortActions) break;
        const cp = checkCheckpointDialogs(core);
        if (cp.isCheckpoint) {
          return { lovedCount, commentedCount, sentTexts, skippedSellerCount, checkpointHit: true, checkpointReason: cp.reason };
        }

        const cmt = targetComments[i];
        const cNode = document.querySelector(`[data-fb-exten-cmt-idx="${cmt.index}"]`);
        if (!cNode || !(cNode instanceof HTMLElement)) {
          emitProgress('ACTION_LOG', { level: 'warn', message: `⚠️ Không thấy DOM bình luận của ${cmt.author}` });
          continue;
        }

        await scrollTargetIntoComfortView(cNode);
        updateHud({ running: true, message: `↩️ Đang trả lời "${cmt.author}"...` });

        if (doLove) {
          const cReact = await reactLoveOnScope(core, cNode, useCdp, true);
          if (cReact.ok && cReact.status !== 'already_loved') lovedCount++;
        }

        const replyText = onlyTarget?.text || cmt.suggestedReply;
        if (replyText) {
          const replyCheck = core.validateCommentBeforePaste(replyText, {
            postText: postText || analysis.topicSummary || '',
            targetText: cmt.text || '',
            postAuthorRole: cmt.role,
            recentSentComments: liveRecent,
            allowManualOverride: Boolean(onlyTarget?.text),
          });
          if (!replyCheck.ok) {
            emitProgress('ACTION_LOG', {
              level: 'warn',
              message: `🛡️ [Soát trước khi dán] Bỏ qua trả lời "${cmt.author}": ${replyCheck.reason}`,
            });
            continue;
          }

          const replyEditor = await findOrOpenReplyEditor(core, cNode, useCdp);
          if (replyEditor) {
            const ok = await submitTextToEditor(core, replyEditor, replyCheck.cleanedText, useCdp, {
              isReply: true,
              allowEnterToSend,
              postText: postText || analysis.topicSummary || '',
              targetText: cmt.text || '',
              postAuthorRole: cmt.role,
              recentSentComments: liveRecent,
              allowManualOverride: Boolean(onlyTarget?.text),
            });
            if (ok) {
              commentedCount++;
              sentTexts.push(replyCheck.cleanedText);
              liveRecent.unshift(replyCheck.cleanedText);
              emitProgress('ACTION_LOG', {
                level: 'ok',
                message: `↩️ Đã trả lời "${cmt.author}": "${replyCheck.cleanedText.slice(0, 48)}..."`,
              });
            }
          } else {
            emitProgress('ACTION_LOG', { level: 'warn', message: `⚠️ Không mở được ô Trả lời cho ${cmt.author}` });
          }
        }

        if (i < targetComments.length - 1 && !abortActions) {
          await core.sleep(core.randomInt(Math.max(3, minDelaySec) * 1000, Math.max(4, maxDelaySec) * 1000));
        }
      }
    }

    const postCp = checkCheckpointDialogs(core);
    return {
      lovedCount,
      commentedCount,
      sentTexts,
      skippedSellerCount,
      checkpointHit: postCp.isCheckpoint,
      checkpointReason: postCp.reason,
    };
  }

  async function testF12Targets() {
    clearF12Highlights();
    const { root: postRoot, kind: rootKind } = findMainPostRoot();
    if (!postRoot) throw new Error('Không tìm thấy bài viết/feed nào trên tab này.');

    const foundTargets = [];
    showF12Highlight(postRoot, `📦 Khung Bài (${rootKind})`, '#38bdf8', 7000);
    foundTargets.push({ key: 'post_root', label: `Khung Bài (${rootKind})`, selector: describeElementF12(postRoot) });

    const reactRes = findReactionButtonInScope(postRoot, false);
    if (reactRes.button) {
      showF12Highlight(reactRes.button, reactRes.alreadyLoved ? '1. ❤️ Đã thả cảm xúc' : '1. ❤️ Nút Thích/Thả Tim', '#f59e0b', 7000);
      const r = reactRes.button.getBoundingClientRect();
      moveVisualCursor(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      foundTargets.push({ key: 'like_btn', label: 'Nút Thích/Thả Tim', selector: describeElementF12(reactRes.button) });
    } else {
      foundTargets.push({ key: 'like_btn', label: 'Nút Thích/Thả Tim', selector: '❌ KHÔNG TÌM THẤY' });
    }

    const editor = findPostEditorOnly(postRoot);
    if (editor) {
      showF12Highlight(editor, '2. 💬 Ô Bình Luận Bài Chính', '#10b981', 7000);
      foundTargets.push({ key: 'post_editor', label: 'Ô Bình Luận Bài Chính', selector: describeElementF12(editor) });
    } else {
      const trigger = findPostCommentTrigger(postRoot);
      if (trigger) {
        showF12Highlight(trigger, '2. 💬 Nút Mở Ô Bình Luận', '#10b981', 7000);
        foundTargets.push({ key: 'post_editor_trigger', label: 'Nút Mở Ô Bình Luận', selector: describeElementF12(trigger) });
      } else {
        foundTargets.push({ key: 'post_editor', label: 'Ô Bình Luận Bài Chính', selector: '❌ KHÔNG TÌM THẤY' });
      }
    }

    const commentNodes = Array.from(postRoot.querySelectorAll('div[role="article"]')).filter(
      (n) => n !== postRoot && isElementVisible(n) && isCommentArticleElement(n)
    );
    commentNodes.slice(0, 3).forEach((cNode, idx) => {
      const cAuthor = (cNode.querySelector('a[role="link"] span, strong, a[role="link"]')?.innerText || `#${idx + 1}`).trim();
      const replyBtn = Array.from(cNode.querySelectorAll('[role="button"], button')).find((b) => {
        if (!isElementVisible(b)) return false;
        const { combinedAria, txt } = getButtonSignals(b);
        return /^(trả lời|reply)$/i.test(txt) || /^(trả lời|reply)\b/i.test(combinedAria);
      });
      if (replyBtn) {
        showF12Highlight(replyBtn, `3.${idx + 1} ↩️ @${cAuthor.slice(0, 16)}`, '#a855f7', 7000);
        foundTargets.push({ key: `reply_${idx}`, label: `Nút Trả lời @${cAuthor}`, selector: describeElementF12(replyBtn) });
      }
    });

    return { rootKind, totalCommentsVisible: commentNodes.length, targets: foundTargets };
  }

  // ============================================================================
  // 6. CHẾ ĐỘ LÀM MẪU MXH, TỰ HỌC CẤU TRÚC F12 RIÊNG THEO MÁY & CHẠY LẠI MỌI TÁC VỤ
  // ============================================================================

  const KNOWLEDGE_STORAGE_KEY = 'fb_exten_machine_knowledge';
  let cachedMachineKnowledge = null;
  let recorderActive = false;
  let recorderLastStepTime = 0;
  let recorderLastUrl = window.location.href;
  let recorderUrlTimer = null;
  let recorderScrollTimer = null;
  let recorderScrollAccumY = 0;
  let recorderLastScrollY = window.scrollY;
  let recorderInputTimer = null;
  let pendingInputTarget = null;
  let pendingInputValue = '';

  let pickerActive = false;
  let pickerTargetRole = 'custom';
  let pickerHoverEl = null;

  async function loadMachineKnowledge() {
    if (cachedMachineKnowledge) return cachedMachineKnowledge;
    try {
      const stored = await chrome.storage.local.get(KNOWLEDGE_STORAGE_KEY);
      cachedMachineKnowledge = stored[KNOWLEDGE_STORAGE_KEY] || null;
    } catch {}
    return cachedMachineKnowledge;
  }

  const storageChangeListener = (changes, area) => {
    if (area === 'local' && changes[KNOWLEDGE_STORAGE_KEY]) {
      cachedMachineKnowledge = changes[KNOWLEDGE_STORAGE_KEY].newValue || null;
    }
  };
  try {
    chrome.storage?.onChanged?.addListener(storageChangeListener);
  } catch {}

  function detectContainerContext(el) {
    if (el.closest('div[role="dialog"]')) {
      const dlg = el.closest('div[role="dialog"]');
      return { kind: 'dialog', containerEl: dlg };
    }
    const cmtArt = el.closest('[data-fb-exten-cmt-idx], div[role="article"][aria-label*="Bình luận" i], div[role="article"][aria-label*="Comment" i]');
    if (cmtArt) return { kind: 'comment', containerEl: cmtArt };

    const activeCard = el.closest('[data-fb-exten-active-post="1"]');
    if (activeCard) return { kind: 'feed_card', containerEl: activeCard };

    const feedArt = el.closest('div[role="article"]');
    if (feedArt && !isCommentArticleElement(feedArt)) return { kind: 'feed_card', containerEl: feedArt };

    const nav = el.closest('[role="navigation"], [role="banner"]');
    if (nav) return { kind: 'nav', containerEl: nav };

    const main = el.closest('div[role="main"]');
    if (main) return { kind: 'main', containerEl: main };

    return { kind: 'body', containerEl: document.body };
  }

  function buildShortDomPath(el, stopAt) {
    const parts = [];
    let cur = el;
    for (let depth = 0; depth < 4 && cur && cur instanceof HTMLElement && cur !== stopAt && cur !== document.body; depth++) {
      const tag = cur.tagName.toLowerCase();
      const role = cur.getAttribute('role');
      let seg = tag;
      if (role) {
        seg += `[role="${role}"]`;
      } else if (cur.parentElement) {
        const sameTagSibs = Array.from(cur.parentElement.children).filter((c) => c.tagName === cur.tagName);
        if (sameTagSibs.length > 1) {
          const idx = sameTagSibs.indexOf(cur) + 1;
          seg += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(seg);
      cur = cur.parentElement;
    }
    return parts.join('>');
  }

  function extractHrefPattern(el) {
    const anchor = el.matches('a[href]') ? el : el.closest('a[href]');
    if (!anchor) return '';
    try {
      const u = new URL(anchor.href);
      const p = u.pathname.toLowerCase();
      if (p.includes('/groups/')) return '/groups/';
      if (p.includes('/messages/')) return '/messages/';
      if (p.includes('/friends')) return '/friends';
      if (p.includes('/marketplace')) return '/marketplace';
      if (p.includes('/watch') || p.includes('/reel')) return '/reel';
      if (p.includes('/posts/') || p.includes('/permalink/')) return '/posts/';
      if (p.includes('profile.php')) return '/profile.php';
      return p.split('/').slice(0, 2).join('/') || '/';
    } catch {
      return '';
    }
  }

  function buildF12Fingerprint(el) {
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').trim();
    const sig = getButtonSignals(el);
    const placeholder = (el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '').trim().slice(0, 70);
    const testId = (el.getAttribute('data-testid') || '').trim();
    const nameAttr = (el.getAttribute('name') || '').trim();
    const inputType = (el.getAttribute('type') || '').trim();
    const contentEditable = Boolean(el.isContentEditable || el.getAttribute('contenteditable') === 'true');

    const { kind: containerKind, containerEl } = detectContainerContext(el);
    const ancestorRoles = [];
    let p = el.parentElement;
    for (let d = 0; d < 10 && p && ancestorRoles.length < 4; d++, p = p.parentElement) {
      const r = p.getAttribute('role') || (p.tagName === 'FORM' ? 'form' : '');
      if (r && !ancestorRoles.includes(r)) ancestorRoles.push(r);
    }

    const domPath = buildShortDomPath(el, containerEl);
    const hrefPattern = extractHrefPattern(el);
    const r = getEffectiveRect(el);
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const relPos = {
      rx: Number((cx / vw).toFixed(4)),
      ry: Number((cy / vh).toFixed(4)),
    };

    let cardRelPos;
    if (containerEl && containerEl !== document.body) {
      const cr = getEffectiveRect(containerEl);
      if (cr.width > 40 && cr.height > 40) {
        cardRelPos = {
          rx: Number(((cx - cr.left) / cr.width).toFixed(4)),
          ry: Number(((cy - cr.top) / cr.height).toFixed(4)),
        };
      }
    }

    let semanticSelector = tag;
    if (sig.adRole) semanticSelector += `[data-ad-rendering-role="${sig.adRole}"]`;
    else if (testId) semanticSelector += `[data-testid="${testId}"]`;
    else {
      if (role) semanticSelector += `[role="${role}"]`;
      if (contentEditable) semanticSelector += `[contenteditable="true"]`;
      if (sig.aria) semanticSelector += `[aria-label="${sig.aria.slice(0, 48).replace(/"/g, '\\"')}"]`;
    }

    return {
      tag,
      role,
      ariaLabel: sig.aria.slice(0, 80),
      childAria: sig.childAria.slice(0, 80),
      placeholder,
      text: sig.txt.slice(0, 80),
      adRenderingRole: sig.adRole,
      testId,
      name: nameAttr,
      inputType,
      contentEditable,
      containerKind,
      ancestorRoles,
      semanticSelector,
      domPath,
      hrefPattern,
      rect: { x: Math.round(cx), y: Math.round(cy), w: Math.round(r.width), h: Math.round(r.height) },
      viewport: { w: vw, h: vh },
      relPos,
      ...(cardRelPos ? { cardRelPos } : {}),
      learnedAt: new Date().toISOString(),
      sampleUrl: window.location.href,
    };
  }

  function resolveInteractiveTarget(rawTarget) {
    if (!rawTarget || !(rawTarget instanceof Element) || isHudOrOverlay(rawTarget)) return null;
    const matched = rawTarget.closest(
      '[role="button"], button, a[href], [role="textbox"], [contenteditable="true"], input, textarea, [role="menuitem"], [role="tab"], [role="option"], [role="checkbox"], [role="switch"], [data-ad-rendering-role]'
    );
    const chosen = matched || rawTarget;
    if (!(chosen instanceof HTMLElement) || isHudOrOverlay(chosen)) return null;
    return chosen;
  }

  async function findElementByLearnedProfile(core, scopeEl, roleKey, extraFingerprint = null, opts = {}) {
    const kb = await loadMachineKnowledge();
    const roleSamples = roleKey && kb?.roleProfiles?.[roleKey] ? kb.roleProfiles[roleKey] : [];
    const templates = [
      ...(extraFingerprint ? [extraFingerprint] : []),
      ...roleSamples,
    ];
    if (templates.length === 0) return null;

    const root = scopeEl || document.body;
    const selector = opts.editableOnly
      ? '[role="textbox"], [contenteditable="true"], input:not([type="hidden"]), textarea'
      : '[role="button"], button, a[href], [role="textbox"], [contenteditable="true"], input:not([type="hidden"]), textarea, [role="menuitem"], [role="tab"], [role="option"], [data-ad-rendering-role]';

    const candidates = Array.from(root.querySelectorAll(selector)).filter((el) => {
      if (!isElementVisible(el)) return false;
      if (opts.excludeComment) {
        if (el.closest('[data-fb-exten-cmt-idx], div[role="article"][aria-label*="Bình luận" i], div[role="article"][aria-label*="Comment" i]')) {
          return false;
        }
      }
      return true;
    });

    const minScore = opts.minScore ?? 42;
    let bestEl = null;
    let bestScore = minScore - 1;

    for (const el of candidates) {
      const candFp = buildF12Fingerprint(el);
      for (const tpl of templates) {
        const s = core.scoreCandidateAgainstFingerprint(candFp, tpl);
        if (s > bestScore) {
          bestScore = s;
          bestEl = el;
        }
      }
    }

    return bestEl ? { el: bestEl, score: bestScore } : null;
  }

  // --- Ghi mẫu thao tác người dùng (Passive Capture Mode) ---

  function updateHudRecButton() {
    const btn = document.getElementById('fb-exten-hud-rec');
    if (!btn) return;
    if (recorderActive) {
      btn.textContent = '⏹ Lưu';
      btn.style.background = '#e11d48';
      btn.style.color = '#ffffff';
    } else {
      btn.textContent = '🔴 Ghi';
      btn.style.background = 'rgba(225,29,72,0.22)';
      btn.style.color = '#fda4af';
    }
  }

  function captureVisibleGroupSnippets(maxCount = 3) {
    const snippets = [];
    const seen = new Set();
    const pushClean = (raw) => {
      const cleaned = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 220);
      if (cleaned.length < 22) return;
      const key = cleaned.slice(0, 50).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      snippets.push(cleaned);
    };

    try {
      for (const rec of gqlPostCache.values()) {
        if (rec?.text) pushClean(rec.text);
        if (snippets.length >= maxCount) return snippets;
      }
    } catch {}

    try {
      const cards = collectGroupFeedCards();
      for (const card of cards.slice(0, maxCount + 2)) {
        const txt = (card.innerText || '')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 15 && !/^(thích|bình luận|chia sẻ|like|comment|share|\d+ (giờ|phút|ngày))/i.test(l))
          .slice(0, 3)
          .join(' — ');
        pushClean(txt);
        if (snippets.length >= maxCount) break;
      }
    } catch {}
    return snippets;
  }

  let lastSampledGroupUrl = '';

  async function sendRecordedStep(type, el, extra = {}) {
    if (!recorderActive || !isContextAlive()) return;
    const core = await getCore();
    const now = Date.now();
    const delayMs = recorderLastStepTime ? Math.min(8000, Math.max(400, now - recorderLastStepTime)) : 800;
    recorderLastStepTime = now;

    const fingerprint = el ? buildF12Fingerprint(el) : undefined;
    const intent = core.classifyRecordedActionIntent(type, fingerprint, window.location.href);
    const roleLabel = core.LEARNED_ROLE_LABELS?.[intent] || intent;

    let label = extra.label || '';
    if (!label) {
      if (type === 'navigate') label = `Mở trang: ${document.title.replace(/\s*\|\s*Facebook$/i, '').slice(0, 45) || window.location.href}`;
      else if (type === 'scroll') label = `Cuộn trang ${extra.scrollDeltaY > 0 ? '+' : ''}${Math.round(extra.scrollDeltaY || 0)}px`;
      else if (type === 'input') label = `Nhập "${String(extra.value || '').slice(0, 32)}" (${roleLabel})`;
      else if (type === 'keypress') label = `Nhấn phím ${extra.key || 'Enter'}`;
      else label = `Bấm ${fingerprint?.text ? `"${fingerprint.text.slice(0, 26)}"` : fingerprint?.ariaLabel ? `"${fingerprint.ariaLabel.slice(0, 26)}"` : roleLabel}`;
    }

    const step = {
      id: `st_${now}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      intent,
      label,
      url: window.location.href,
      pageTitle: document.title,
      fingerprint,
      ...(extra.value !== undefined ? { value: extra.value } : {}),
      ...(extra.key ? { key: extra.key } : {}),
      ...(typeof extra.scrollDeltaY === 'number' ? { scrollDeltaY: Math.round(extra.scrollDeltaY) } : {}),
      delayMs,
      timestamp: now,
    };

    let pageContextSnippets = undefined;
    const curPageBase = window.location.href.split('?')[0];
    if (type === 'navigate' || curPageBase !== lastSampledGroupUrl) {
      lastSampledGroupUrl = curPageBase;
      const captured = captureVisibleGroupSnippets(2);
      if (captured.length > 0) pageContextSnippets = captured;
    }

    if (el) {
      showF12Highlight(el, `🔴 Đã ghi F12: ${label.slice(0, 28)}`, '#f43f5e', 1600);
    }
    updateHud({ running: true, level: 'warn', message: `🔴 Đang ghi mẫu: ${label}` });
    chrome.runtime.sendMessage({ type: 'RECORD_STEP_EVENT', payload: { step, pageContextSnippets } }).catch(() => {});
  }

  function flushPendingInput() {
    if (recorderInputTimer) {
      clearTimeout(recorderInputTimer);
      recorderInputTimer = null;
    }
    if (pendingInputTarget && pendingInputValue.trim()) {
      const targetEl = pendingInputTarget;
      const val = pendingInputValue.trim();
      pendingInputTarget = null;
      pendingInputValue = '';
      sendRecordedStep('input', targetEl, { value: val });
    }
  }

  const onRecordClick = (e) => {
    if (!recorderActive || pickerActive || !e.isTrusted) return;
    const target = resolveInteractiveTarget(e.target);
    if (!target) return;
    flushPendingInput();
    sendRecordedStep('click', target);
  };

  const onRecordInput = (e) => {
    if (!recorderActive || pickerActive) return;
    const raw = e.target;
    if (!(raw instanceof HTMLElement) || isHudOrOverlay(raw)) return;
    const editable = raw.closest('[contenteditable="true"], [role="textbox"], input, textarea') || raw;
    if (!(editable instanceof HTMLElement)) return;
    const val =
      editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement
        ? editable.value
        : editable.innerText || editable.textContent || '';

    pendingInputTarget = editable;
    pendingInputValue = val;
    if (recorderInputTimer) clearTimeout(recorderInputTimer);
    recorderInputTimer = setTimeout(flushPendingInput, 950);
  };

  const onRecordKeydown = (e) => {
    if (!recorderActive || pickerActive || !e.isTrusted) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      flushPendingInput();
      const target = resolveInteractiveTarget(e.target);
      sendRecordedStep('keypress', target, { key: 'Enter' });
    }
  };

  const onRecordScroll = () => {
    if (!recorderActive || pickerActive) return;
    const curY = window.scrollY;
    const delta = curY - recorderLastScrollY;
    recorderLastScrollY = curY;
    if (Math.abs(delta) < 10) return;
    recorderScrollAccumY += delta;
    if (recorderScrollTimer) clearTimeout(recorderScrollTimer);
    recorderScrollTimer = setTimeout(() => {
      if (Math.abs(recorderScrollAccumY) >= 180) {
        sendRecordedStep('scroll', null, { scrollDeltaY: recorderScrollAccumY });
      }
      recorderScrollAccumY = 0;
    }, 750);
  };

  function startDemoRecorder() {
    if (recorderActive) return;
    recorderActive = true;
    recorderLastStepTime = Date.now();
    recorderLastUrl = window.location.href;
    recorderLastScrollY = window.scrollY;
    recorderScrollAccumY = 0;

    document.addEventListener('click', onRecordClick, true);
    document.addEventListener('input', onRecordInput, true);
    document.addEventListener('keydown', onRecordKeydown, true);
    window.addEventListener('scroll', onRecordScroll, { passive: true });

    recorderUrlTimer = setInterval(() => {
      if (!recorderActive) return;
      if (window.location.href !== recorderLastUrl) {
        flushPendingInput();
        recorderLastUrl = window.location.href;
        sendRecordedStep('navigate', null);
      }
    }, 800);

    updateHudRecButton();
    updateHud({ running: true, level: 'warn', message: '🔴 ĐANG GHI MẪU — Cứ thao tác Facebook bình thường, mọi Group & F12 đều được tự học!' });
  }

  function stopDemoRecorder() {
    if (!recorderActive) return;
    flushPendingInput();
    recorderActive = false;
    document.removeEventListener('click', onRecordClick, true);
    document.removeEventListener('input', onRecordInput, true);
    document.removeEventListener('keydown', onRecordKeydown, true);
    window.removeEventListener('scroll', onRecordScroll);
    if (recorderUrlTimer) clearInterval(recorderUrlTimer);
    if (recorderScrollTimer) clearTimeout(recorderScrollTimer);
    recorderUrlTimer = null;
    recorderScrollTimer = null;
    updateHudRecButton();
    updateHud({ running: false, level: 'ok', message: '✅ Đã dừng ghi mẫu — Mở Panel để đặt tên & lưu kịch bản.' });
  }

  // --- Chế độ Chấm Mẫu F12 trực tiếp (Point-and-Teach Calibration) ---

  function ensurePickerOverlayBox() {
    let box = document.getElementById('fb-exten-picker-box');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'fb-exten-picker-box';
    box.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483645;
      border: 2.5px dashed #f59e0b;
      background: rgba(245, 158, 11, 0.14);
      border-radius: 8px;
      display: none;
    `;
    const tag = document.createElement('div');
    tag.id = 'fb-exten-picker-tag';
    tag.style.cssText = `
      position: absolute;
      left: 0;
      top: -24px;
      background: #f59e0b;
      color: #07090e;
      font-family: monospace;
      font-size: 11px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 5px;
      white-space: nowrap;
    `;
    box.appendChild(tag);
    document.body?.appendChild(box);
    return box;
  }

  const onPickerMove = (e) => {
    if (!pickerActive) return;
    const target = resolveInteractiveTarget(e.target);
    const box = ensurePickerOverlayBox();
    if (!target) {
      box.style.display = 'none';
      pickerHoverEl = null;
      return;
    }
    pickerHoverEl = target;
    const r = getEffectiveRect(target);
    box.style.display = 'block';
    box.style.left = `${Math.max(0, r.left - 3)}px`;
    box.style.top = `${Math.max(0, r.top - 3)}px`;
    box.style.width = `${r.width + 6}px`;
    box.style.height = `${r.height + 6}px`;
    const tag = document.getElementById('fb-exten-picker-tag');
    if (tag) {
      const aria = target.getAttribute('aria-label') || (target.innerText || '').trim().slice(0, 24);
      tag.textContent = `🎯 Click dạy [${pickerTargetRole}]: <${target.tagName.toLowerCase()}> ${aria}`;
    }
  };

  const onPickerClick = (e) => {
    if (!pickerActive) return;
    const target = resolveInteractiveTarget(e.target) || pickerHoverEl;
    if (!target || isHudOrOverlay(target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const fp = buildF12Fingerprint(target);
    const chosenRole = pickerTargetRole;
    stopF12Picker();

    showF12Highlight(target, `✅ Đã học F12 [${chosenRole}]`, '#10b981', 3500);
    updateHud({ running: false, level: 'ok', message: `✅ Đã học chuẩn cấu trúc F12 cho [${chosenRole}]!` });
    chrome.runtime.sendMessage({
      type: 'SAVE_LEARNED_F12_TARGET',
      payload: { role: chosenRole, fingerprint: fp, pageTitle: document.title },
    }).catch(() => {});
  };

  const onPickerKeydown = (e) => {
    if (pickerActive && e.key === 'Escape') {
      stopF12Picker();
      updateHud({ running: false, level: 'warn', message: 'Đã hủy chấm mẫu F12.' });
    }
  };

  function startF12Picker(role) {
    stopF12Picker();
    pickerActive = true;
    pickerTargetRole = role || 'custom';
    document.addEventListener('mousemove', onPickerMove, true);
    document.addEventListener('click', onPickerClick, true);
    document.addEventListener('keydown', onPickerKeydown, true);
    updateHud({ running: true, level: 'warn', message: `🎯 Rê chuột & click vào nút [${pickerTargetRole}] trên Facebook để dạy F12 (ESC để hủy)` });
  }

  function stopF12Picker() {
    pickerActive = false;
    pickerHoverEl = null;
    document.removeEventListener('mousemove', onPickerMove, true);
    document.removeEventListener('click', onPickerClick, true);
    document.removeEventListener('keydown', onPickerKeydown, true);
    document.getElementById('fb-exten-picker-box')?.remove();
  }

  // --- Chạy lại 1 bước bất kỳ trong Kịch Bản MXH Đã Làm Mẫu ---

  async function executeRecordedStep({ step, resolvedText, useCdp = false }) {
    const core = await getCore();
    if (!step) return { ok: false, error: 'Thiếu dữ liệu bước thực thi.' };

    const cp = checkCheckpointDialogs(core);
    if (cp.isCheckpoint) {
      return { ok: false, checkpointHit: true, checkpointReason: cp.reason };
    }

    if (step.type === 'wait') {
      await core.sleep(Math.max(300, Math.min(15000, step.delayMs || 1000)));
      return { ok: true };
    }

    if (step.type === 'scroll') {
      const dy = Number(step.scrollDeltaY) || 550;
      window.scrollBy({ top: dy, behavior: 'smooth' });
      await core.sleep(900);
      return { ok: true };
    }

    const searchScope =
      step.fingerprint?.containerKind === 'dialog'
        ? Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isPostDialog).pop() || document.body
        : document.body;

    if (step.type === 'keypress') {
      const key = step.key || 'Enter';
      const target =
        (document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : null) ||
        (await findElementByLearnedProfile(core, searchScope, step.intent, step.fingerprint, { editableOnly: true }))?.el;

      if (useCdp && key === 'Enter') {
        await chrome.runtime.sendMessage({ type: 'CDP_PRESS_ENTER' }).catch(() => null);
      } else if (target) {
        target.focus();
        placeCaretAtEnd(target);
        const evInit = { key, code: key, keyCode: key === 'Enter' ? 13 : 27, which: key === 'Enter' ? 13 : 27, shiftKey: false, bubbles: true, cancelable: true };
        target.dispatchEvent(new KeyboardEvent('keydown', evInit));
        target.dispatchEvent(new KeyboardEvent('keypress', evInit));
        target.dispatchEvent(new KeyboardEvent('keyup', evInit));
      }
      await core.sleep(900);
      // Nếu là nhấn Enter trên ô bình luận mà chữ vẫn chưa gửi -> tự bấm nút Gửi xanh dự phòng
      if (key === 'Enter' && target && document.body.contains(target) && getCleanEditorText(target).length > 0) {
        const sendBtn = await findEnabledSendButton(core, target);
        if (sendBtn) {
          await hoverAndClickElement(core, sendBtn, useCdp, 'Nút Gửi Dự Phòng Sau Enter');
          await core.sleep(700);
        }
      }
      return { ok: true };
    }

    // Tìm mục tiêu theo F12 đã học -> Vision AI -> Tọa độ tương đối
    const isInputStep = step.type === 'input';
    let match = await findElementByLearnedProfile(core, searchScope, step.intent, step.fingerprint, {
      editableOnly: isInputStep,
      minScore: 34,
    });
    let el = match?.el || null;

    if (!el && searchScope !== document.body) {
      match = await findElementByLearnedProfile(core, document.body, step.intent, step.fingerprint, {
        editableOnly: isInputStep,
        minScore: 34,
      });
      el = match?.el || null;
    }

    if (!el && step.fingerprint?.semanticSelector) {
      try {
        const direct = document.querySelector(step.fingerprint.semanticSelector);
        if (direct instanceof HTMLElement && isElementVisible(direct)) el = direct;
      } catch {}
    }

    if (!el) {
      el = await visionFindTarget(core, searchScope, step.label || step.fingerprint?.ariaLabel || step.intent);
    }

    if (!el && !isInputStep && step.fingerprint?.relPos) {
      const px = Math.round(step.fingerprint.relPos.rx * window.innerWidth);
      const py = Math.round(step.fingerprint.relPos.ry * window.innerHeight);
      const atPt = resolveInteractiveTarget(document.elementFromPoint(px, py));
      if (atPt) el = atPt;
    }

    if (!el) {
      return { ok: false, error: `Không tìm thấy phần tử F12 cho bước: ${step.label}` };
    }

    if (step.type === 'hover') {
      await hoverElement(core, el, useCdp, step.label);
      return { ok: true, matchedScore: match?.score || 0 };
    }

    if (step.type === 'click') {
      await hoverAndClickElement(core, el, useCdp, step.label);
      return { ok: true, matchedScore: match?.score || 0 };
    }

    if (step.type === 'input') {
      const txt = core.sanitizeSingleCommentText(core.spinText(resolvedText ?? step.value ?? ''));
      if (!txt) return { ok: true };
      const isCommentField = step.intent === 'comment_editor' || step.intent === 'reply_editor';
      if (isCommentField) {
        const kb = await getMachineKnowledgeCached();
        const check = core.validateCommentBeforePaste(txt, {
          recentSentComments: kb?.recentSentComments || [],
          allowManualOverride: false,
        });
        if (!check.ok) {
          emitProgress('ACTION_LOG', {
            level: 'warn',
            message: `🛡️ [Soát trước khi dán] Bỏ qua bước nhập comment: ${check.reason}`,
          });
          return { ok: false, error: check.reason };
        }
        // Nếu kịch bản không có bước nhấn Enter / bấm Gửi ngay phía sau -> tự dán & nhấn Enter gọn gàng
        if (arguments[0]?.autoEnterAfterInput) {
          const sent = await submitTextToEditor(core, el, check.cleanedText, useCdp, {
            isReply: step.intent === 'reply_editor',
            allowEnterToSend: true,
            recentSentComments: kb?.recentSentComments || [],
          });
          return { ok: sent, matchedScore: match?.score || 0 };
        }
        const ok = await insertTextIntoEditor(core, el, check.cleanedText, useCdp, {
          isReply: step.intent === 'reply_editor',
        });
        return { ok, matchedScore: match?.score || 0 };
      }
      const ok = await insertTextIntoEditor(core, el, txt, useCdp);
      return { ok, matchedScore: match?.score || 0 };
    }

    return { ok: true };
  }

  // ============================================================================
  // 7. MESSAGE ROUTER & CLEANUP HOOK
  // ============================================================================

  const messageListener = (msg, _sender, sendResponse) => {
    if (!msg || !msg.type || !isContextAlive()) return false;

    (async () => {
      try {
        switch (msg.type) {
          case 'PING_AGENT': {
            ensureHud();
            sendResponse({
              ok: true,
              url: window.location.href,
              title: document.title,
              version: '4.3.0',
              recording: recorderActive,
              gqlCapturedCount: gqlPostCache.size,
            });
            break;
          }

          case 'CAPTURE_PAGE_SNIPPETS': {
            const snippets = captureVisibleGroupSnippets(msg.payload?.maxCount || 4);
            sendResponse({
              ok: true,
              data: {
                url: window.location.href,
                title: document.title,
                snippets,
              },
            });
            break;
          }

          case 'START_DEMO_RECORDER': {
            startDemoRecorder();
            sendResponse({ ok: true });
            break;
          }

          case 'STOP_DEMO_RECORDER': {
            stopDemoRecorder();
            sendResponse({ ok: true });
            break;
          }

          case 'START_F12_PICKER': {
            startF12Picker(msg.payload?.role || 'custom');
            sendResponse({ ok: true });
            break;
          }

          case 'STOP_F12_PICKER': {
            stopF12Picker();
            sendResponse({ ok: true });
            break;
          }

          case 'TEST_LEARNED_F12_ROLE': {
            const core = await getCore();
            const role = msg.payload?.role || 'like_btn';
            cachedMachineKnowledge = null;
            const res = await findElementByLearnedProfile(core, document.body, role, null, { minScore: 30 });
            if (res?.el) {
              await scrollTargetIntoComfortView(res.el);
              showF12Highlight(res.el, `✅ F12 Đã Học [${role}] (${res.score}đ)`, '#10b981', 5500);
              const r = getEffectiveRect(res.el);
              moveVisualCursor(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
              sendResponse({ ok: true, data: { found: true, score: res.score, selector: describeElementF12(res.el) } });
            } else {
              sendResponse({ ok: true, data: { found: false, score: 0, selector: 'Chưa khớp trên trang này' } });
            }
            break;
          }

          case 'EXECUTE_RECORDED_STEP': {
            const data = await executeRecordedStep(msg.payload || {});
            sendResponse({ ok: Boolean(data.ok), data, error: data.error });
            break;
          }

          case 'HUD_UPDATE': {
            updateHud(msg.payload || {});
            sendResponse({ ok: true });
            break;
          }

          case 'TOGGLE_PILL': {
            const hud = ensureHud();
            hud.style.display = hud.style.display === 'none' ? 'block' : 'none';
            sendResponse({ ok: true });
            break;
          }

          case 'SCAN_NEXT_GROUP_POST': {
            const data = await scanNextGroupPost(msg.payload || {});
            sendResponse({ ok: true, data });
            break;
          }

          case 'FINISH_ACTIVE_POST': {
            const core = await getCore();
            await finishActivePost(core);
            sendResponse({ ok: true });
            break;
          }

          case 'READ_POST_AND_COMMENTS': {
            const data = await readPostAndComments(msg.payload || {});
            sendResponse({ ok: true, data });
            break;
          }

          case 'EXECUTE_THREAD_ACTIONS': {
            const data = await executeThreadActions(msg.payload || {});
            sendResponse({ ok: true, data });
            break;
          }

          case 'TEST_F12_TARGETS': {
            const data = await testF12Targets();
            sendResponse({ ok: true, data });
            break;
          }

          case 'TEST_VISION_SOM': {
            const core = await getCore();
            const { root: postRoot } = findMainPostRoot();
            const el = await visionFindTarget(
              core,
              postRoot,
              msg.payload?.goalDescription || 'Ô nhập bình luận hoặc nút Thích của bài viết chính'
            );
            sendResponse({
              ok: true,
              data: {
                found: Boolean(el),
                selector: el ? describeElementF12(el) : 'Không tìm thấy',
              },
            });
            break;
          }

          case 'STOP_THREAD_ACTIONS': {
            abortActions = true;
            stopF12Picker();
            updateHud({ running: false, level: 'warn', message: '⏹ Đã dừng.' });
            sendResponse({ ok: true });
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
  };

  chrome.runtime.onMessage.addListener(messageListener);
  ensureHud();

  // Tự nối lại chế độ Ghi Mẫu nếu người dùng đang quay và vừa chuyển sang Group/Trang khác
  chrome.runtime.sendMessage({ type: 'GET_RECORDER_STATE' }).then((res) => {
    if (res?.ok && res.data?.active) {
      startDemoRecorder();
      sendRecordedStep('navigate', null);
    }
  }).catch(() => {});

  window.__FB_EXTEN_CLEANUP__ = () => {
    destroyed = true;
    abortActions = true;
    stopDemoRecorder();
    stopF12Picker();
    try {
      window.removeEventListener('message', onGqlTapMessage);
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.storage?.onChanged?.removeListener(storageChangeListener);
    } catch {}
    clearF12Highlights();
    clearSetOfMarkOverlay();
    clearActivePostMarker();
    document.getElementById('fb-exten-hud')?.remove();
    document.getElementById('fb-exten-visual-cursor')?.remove();
  };
})();
