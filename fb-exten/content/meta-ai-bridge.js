(() => {
  if (typeof window.__FB_EXTEN_META_AI_CLEANUP__ === 'function') {
    try {
      window.__FB_EXTEN_META_AI_CLEANUP__();
    } catch {}
  }

  let destroyed = false;
  let busy = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isVisible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 6 && r.height > 6;
  }

  function findChatInput() {
    // 1. Textarea chuẩn của meta.ai
    const textareas = Array.from(document.querySelectorAll('textarea:not([disabled])')).filter(isVisible);
    if (textareas.length > 0) {
      textareas.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
      return textareas[0];
    }

    // 2. ContentEditable / Lexical textbox của meta.ai
    const editables = Array.from(
      document.querySelectorAll(
        '[role="textbox"][contenteditable="true"], [contenteditable="true"][data-lexical-editor="true"], [contenteditable="true"]'
      )
    ).filter((el) => isVisible(el) && el.getBoundingClientRect().height < 350);

    if (editables.length > 0) {
      editables.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
      return editables[0];
    }
    return null;
  }

  function getInputValue(inputEl) {
    if (!inputEl) return '';
    if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) {
      return String(inputEl.value || '').trim();
    }
    return String(inputEl.innerText || inputEl.textContent || '')
      .replace(/\u200B/g, '')
      .trim();
  }

  function isStopButtonVisible() {
    const btns = Array.from(document.querySelectorAll('button, [role="button"]')).filter(isVisible);
    return btns.some((b) => {
      const aria = (b.getAttribute('aria-label') || '').trim();
      const txt = (b.innerText || '').trim();
      return /\b(stop|stop generating|stop response|dừng|ngừng tạo)\b/i.test(`${aria} ${txt}`);
    });
  }

  function findSendButton(inputEl) {
    const formScope = inputEl?.closest('form') || inputEl?.parentElement?.parentElement?.parentElement || document;
    const forbidden = /attach|upload|image|photo|voice|mic|microphone|stop|dừng|new chat|cuộc trò chuyện mới|close|đóng/i;

    const searchIn = (root) => {
      const btns = Array.from(root.querySelectorAll('button, [role="button"]')).filter(
        (b) => isVisible(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !b.contains(inputEl)
      );
      const byAria = btns.find((b) => {
        const aria = (b.getAttribute('aria-label') || b.getAttribute('title') || '').trim();
        const txt = (b.innerText || '').trim();
        if (forbidden.test(`${aria} ${txt}`)) return false;
        return /^(send|send message|submit|ask|gửi|gửi tin nhắn|enter)$/i.test(aria) || /\b(send|gửi)\b/i.test(aria);
      });
      if (byAria) return byAria;

      const byType = btns.find((b) => b.tagName === 'BUTTON' && b.getAttribute('type') === 'submit');
      if (byType) return byType;

      if (inputEl) {
        const ir = inputEl.getBoundingClientRect();
        const rightSide = btns.filter((b) => {
          const aria = (b.getAttribute('aria-label') || '').trim();
          if (forbidden.test(aria)) return false;
          const r = b.getBoundingClientRect();
          return (
            Boolean(b.querySelector('svg, i')) &&
            r.width <= 54 &&
            r.height <= 54 &&
            r.left >= ir.left + ir.width * 0.6 &&
            Math.abs(r.top - ir.top) < 120
          );
        });
        if (rightSide.length > 0) {
          rightSide.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
          return rightSide[0];
        }
      }
      return null;
    };

    return searchIn(formScope) || searchIn(document);
  }

  async function setPromptText(inputEl, promptText) {
    inputEl.focus();
    await sleep(120);

    if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) {
      const proto = inputEl instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(inputEl, promptText);
      else inputEl.value = promptText;
      inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: promptText }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(100);
      return getInputValue(inputEl).length > 0;
    }

    // ContentEditable / Lexical
    try {
      const range = document.createRange();
      range.selectNodeContents(inputEl);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
      await sleep(70);
    } catch {}

    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', promptText);
      inputEl.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      await sleep(110);
    } catch {}

    if (getInputValue(inputEl).length < Math.min(12, promptText.length)) {
      inputEl.focus();
      document.execCommand('insertText', false, promptText);
      await sleep(110);
    }

    if (getInputValue(inputEl).length < Math.min(12, promptText.length)) {
      inputEl.focus();
      inputEl.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: promptText }));
      await sleep(110);
    }

    return getInputValue(inputEl).length > 0;
  }

  function cleanMetaAiOutput(raw) {
    return String(raw || '')
      .replace(/\r\n/g, '\n')
      .replace(/\n*(?:Copy|Regenerate|Good response|Bad response|Share|Sources|Edit|Like|Dislike|Sao chép|Tạo lại|Chia sẻ|Nguồn)\s*$/gim, '')
      .replace(/^\s*Meta AI\s*\n?/i, '')
      .trim();
  }

  function collectConversationBlocks() {
    const root = document.querySelector('main, [role="main"]') || document.body;
    const inputEl = findChatInput();
    const formEl = inputEl?.closest('form');

    // Ưu tiên các phần tử message/turn rõ ràng nếu Meta AI gắn data-testid hoặc role
    const semanticSelectors = [
      '[data-testid*="assistant" i]',
      '[data-testid*="message" i]',
      '[data-message-author-role="assistant"]',
      'article',
      '[role="article"]',
      '.markdown',
    ];

    for (const sel of semanticSelectors) {
      const found = Array.from(root.querySelectorAll(sel)).filter((el) => {
        if (!isVisible(el)) return false;
        if (formEl && formEl.contains(el)) return false;
        if (el.closest('nav, aside, header')) return false;
        const txt = cleanMetaAiOutput(el.innerText || '');
        return txt.length >= 2;
      });
      // Lọc bỏ node cha chứa node con đã có trong danh sách
      const leafNodes = found.filter((el) => !found.some((other) => other !== el && el.contains(other)));
      if (leafNodes.length > 0) {
        return leafNodes.map((el) => ({ el, text: cleanMetaAiOutput(el.innerText || '') }));
      }
    }

    // Fallback tổng quát: lấy các khối văn bản lớn theo thứ tự hiển thị trong vùng chat (loại sidebar/input)
    const rawDivs = Array.from(root.querySelectorAll('div[dir="auto"], p, pre')).filter((el) => {
      if (!isVisible(el)) return false;
      if (formEl && formEl.contains(el)) return false;
      if (el.closest('nav, aside, header, button, [role="button"], form')) return false;
      const txt = cleanMetaAiOutput(el.innerText || '');
      return txt.length >= 4;
    });
    const topBlocks = rawDivs.filter((el) => !rawDivs.some((other) => other !== el && other.contains(el)));
    return topBlocks.map((el) => ({ el, text: cleanMetaAiOutput(el.innerText || '') }));
  }

  function extractLatestAssistantReply(beforeCount, beforeTextsSet, promptText) {
    const blocks = collectConversationBlocks();
    if (blocks.length === 0) return '';

    const promptNorm = cleanMetaAiOutput(promptText).slice(0, 60).toLowerCase();
    const promptHead = cleanMetaAiOutput(promptText).slice(0, 28).toLowerCase();

    // Tìm vị trí block tin nhắn của người dùng vừa gửi (từ cuối lên)
    let userIdx = -1;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const low = blocks[i].text.toLowerCase();
      if (
        (promptNorm.length >= 16 && low.includes(promptNorm)) ||
        (promptHead.length >= 14 && low.startsWith(promptHead))
      ) {
        userIdx = i;
        break;
      }
    }

    let replyBlocks = [];
    if (userIdx >= 0 && userIdx < blocks.length - 1) {
      replyBlocks = blocks.slice(userIdx + 1);
    } else if (blocks.length > beforeCount) {
      replyBlocks = blocks.slice(beforeCount).filter((b) => {
        const low = b.text.toLowerCase();
        return !(promptHead.length >= 14 && low.includes(promptHead));
      });
    } else {
      replyBlocks = blocks.filter((b) => {
        const low = b.text.toLowerCase();
        return !beforeTextsSet.has(b.text) && !(promptHead.length >= 14 && low.includes(promptHead));
      });
    }

    // Lọc bỏ các câu trạng thái đang suy nghĩ
    const filtered = replyBlocks
      .map((b) => b.text)
      .filter(
        (t) =>
          t.length >= 2 &&
          !/^(thinking|searching|generating|đang suy nghĩ|đang tìm kiếm|đang tạo)\.{0,3}$/i.test(t)
      );

    return cleanMetaAiOutput(filtered.join('\n')).trim();
  }

  async function askMetaAi({ prompt, timeoutMs = 45000 }) {
    if (busy) {
      return { ok: false, error: 'Tab Meta AI đang xử lý câu hỏi khác, vui lòng đợi xong lượt trước.' };
    }
    const cleanPrompt = String(prompt || '').trim();
    if (!cleanPrompt) return { ok: false, error: 'Prompt gửi sang Meta AI bị rỗng.' };

    const inputEl = findChatInput();
    if (!inputEl) {
      return {
        ok: false,
        error: 'Không tìm thấy ô nhập chat trên tab meta.ai (hãy đảm bảo bạn đã đăng nhập và mở giao diện chat Meta AI).',
      };
    }

    busy = true;
    const startedAt = Date.now();

    try {
      const beforeBlocks = collectConversationBlocks();
      const beforeCount = beforeBlocks.length;
      const beforeTextsSet = new Set(beforeBlocks.map((b) => b.text));

      const typedOk = await setPromptText(inputEl, cleanPrompt);
      if (!typedOk) {
        return { ok: false, error: 'Không dán được prompt vào ô chat Meta AI.' };
      }

      await sleep(220);

      // Gửi prompt: ưu tiên bấm nút Send nếu sáng, fallback phím Enter
      const sendBtn = findSendButton(inputEl);
      if (sendBtn) {
        sendBtn.click();
      } else {
        const evInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: false, bubbles: true, cancelable: true };
        inputEl.dispatchEvent(new KeyboardEvent('keydown', evInit));
        inputEl.dispatchEvent(new KeyboardEvent('keypress', evInit));
        inputEl.dispatchEvent(new KeyboardEvent('keyup', evInit));
      }

      // Kiểm tra sau 420ms xem đã gửi đi chưa, nếu chữ vẫn trong ô -> thử Enter / nút Send dự phòng
      await sleep(420);
      if (getInputValue(inputEl).length > 10) {
        const btnRetry = findSendButton(inputEl);
        if (btnRetry) btnRetry.click();
        else {
          const evInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: false, bubbles: true, cancelable: true };
          inputEl.dispatchEvent(new KeyboardEvent('keydown', evInit));
          inputEl.dispatchEvent(new KeyboardEvent('keyup', evInit));
        }
      }

      // Chờ Meta AI trả lời và ổn định nhanh (tối ưu năng suất: poll 300ms, chốt sau 2 nhịp ổn định khi hết Stop)
      let lastCandidate = '';
      let stableTicks = 0;
      const deadline = Date.now() + Math.max(10000, Math.min(90000, timeoutMs));

      while (Date.now() < deadline && !destroyed) {
        await sleep(300);
        const cur = extractLatestAssistantReply(beforeCount, beforeTextsSet, cleanPrompt);
        const streaming = isStopButtonVisible();

        if (cur.length >= 2) {
          if (cur === lastCandidate && !streaming) {
            stableTicks++;
            const looksComplete = /[}"'.!?]$/.test(cur) || cur.length >= 40;
            if (stableTicks >= (looksComplete ? 2 : 3)) {
              return {
                ok: true,
                text: cur,
                elapsedMs: Date.now() - startedAt,
                url: window.location.href,
              };
            }
          } else {
            lastCandidate = cur;
            stableTicks = 0;
          }
        }
      }

      if (lastCandidate.length >= 4) {
        return {
          ok: true,
          text: lastCandidate,
          elapsedMs: Date.now() - startedAt,
          url: window.location.href,
          partial: true,
        };
      }

      return { ok: false, error: 'Hết thời gian chờ Meta AI phản hồi (kiểm tra xem tab meta.ai có yêu cầu đăng nhập hoặc bị lag không).' };
    } finally {
      busy = false;
    }
  }

  const listener = (msg, _sender, sendResponse) => {
    if (!msg || !msg.type || destroyed) return false;
    (async () => {
      try {
        switch (msg.type) {
          case 'PING_META_AI': {
            const hasInput = Boolean(findChatInput());
            sendResponse({
              ok: true,
              ready: hasInput,
              busy,
              url: window.location.href,
              title: document.title,
            });
            break;
          }
          case 'ASK_META_AI': {
            const res = await askMetaAi(msg.payload || {});
            sendResponse(res);
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

  chrome.runtime.onMessage.addListener(listener);
  window.__FB_EXTEN_META_AI_CLEANUP__ = () => {
    destroyed = true;
    try {
      chrome.runtime.onMessage.removeListener(listener);
    } catch {}
  };
})();
