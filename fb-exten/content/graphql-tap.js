(() => {
  if (window.__FB_EXTEN_GQL_TAP_INSTALLED__) return;
  window.__FB_EXTEN_GQL_TAP_INSTALLED__ = true;

  function extractFromGraphQlPayload(rawText) {
    if (!rawText || rawText.length > 4_500_000) return [];
    const cleaned = rawText.replace(/^for\s*\(\s*;\s*;\s*\)\s*;\s*/, '');
    const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().startsWith('{'));
    const postsMap = new Map();

    const visit = (node, depth) => {
      if (!node || typeof node !== 'object' || depth > 16) return;

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length && i < 80; i++) visit(node[i], depth + 1);
        return;
      }

      // Nhận diện cấu trúc Story/Post của Facebook GraphQL (Comet Feed / Group Feed)
      const story = node.comet_sections?.content?.story || node;
      const msgText =
        story?.message?.text ||
        story?.comet_sections?.message?.story?.message?.text ||
        node?.message?.text ||
        '';
      const actors = story?.actors || node?.actors;
      const primaryActor = Array.isArray(actors) && actors[0] ? actors[0] : null;
      const rawUrl = story?.wwwURL || story?.url || story?.permalink_url || node?.wwwURL || node?.permalink_url || '';
      const postId = String(story?.post_id || node?.post_id || story?.id || '');
      const createdAtSec = Number(
        story?.creation_time ||
          node?.creation_time ||
          node?.comet_sections?.context_layout?.story?.comet_sections?.metadata?.[0]?.story?.creation_time ||
          0
      );

      if (msgText && msgText.length >= 10 && primaryActor?.name) {
        const key = postId || `${primaryActor.id || primaryActor.name}:${msgText.slice(0, 60)}`;
        const comments = [];
        const rawEdges =
          node?.feedback?.display_comments?.edges ||
          story?.feedback?.display_comments?.edges ||
          node?.comet_sections?.feedback?.story?.feedback_context?.interesting_top_level_comments ||
          [];
        if (Array.isArray(rawEdges)) {
          for (const edge of rawEdges.slice(0, 25)) {
            const c = edge?.node || edge?.comment || edge;
            const cTxt = c?.body?.text || c?.message?.text || '';
            const cAuthor = c?.author;
            if (cTxt && cAuthor?.name) {
              comments.push({
                authorUid: String(cAuthor.id || ''),
                authorName: String(cAuthor.name || ''),
                text: String(cTxt).slice(0, 500),
                createdAtSec: Number(c?.created_time || 0) || undefined,
              });
            }
          }
        }

        const prev = postsMap.get(key);
        if (!prev || msgText.length > prev.text.length || comments.length > prev.comments.length) {
          postsMap.set(key, {
            postId: postId.replace(/[^0-9a-zA-Z_]/g, '').slice(0, 64),
            url: typeof rawUrl === 'string' ? rawUrl : '',
            authorUid: String(primaryActor.id || ''),
            authorName: String(primaryActor.name || '').slice(0, 90),
            text: String(msgText).slice(0, 2200),
            createdAtSec: createdAtSec > 1_500_000_000 ? createdAtSec : undefined,
            comments,
          });
        }
      }

      const keys = Object.keys(node);
      for (let i = 0; i < keys.length && i < 40; i++) {
        const k = keys[i];
        if (k === '__module_component' || k === 'extensions' || k === '__dr') continue;
        visit(node[k], depth + 1);
      }
    };

    for (const line of lines.slice(0, 30)) {
      try {
        visit(JSON.parse(line), 0);
      } catch {}
    }

    return Array.from(postsMap.values());
  }

  function publish(rawText) {
    try {
      const items = extractFromGraphQlPayload(rawText);
      if (items.length > 0) {
        window.postMessage({ source: 'FB_EXTEN_GQL_TAP', items }, '*');
      }
    } catch {}
  }

  // 1. Tap thụ động window.fetch (không chặn, không sửa luồng Facebook)
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      try {
        const reqUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (reqUrl.includes('/api/graphql')) {
          p.then((res) => {
            if (res && res.ok) {
              res.clone().text().then(publish).catch(() => {});
            }
          }).catch(() => {});
        }
      } catch {}
      return p;
    };
  }

  // 2. Tap thụ động XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      this.__fbExtenUrl = typeof url === 'string' ? url : String(url || '');
    } catch {}
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    try {
      if (this.__fbExtenUrl && this.__fbExtenUrl.includes('/api/graphql')) {
        this.addEventListener('load', () => {
          try {
            if (this.status === 200 && typeof this.responseText === 'string') {
              publish(this.responseText);
            }
          } catch {}
        });
      }
    } catch {}
    return origSend.apply(this, args);
  };
})();
