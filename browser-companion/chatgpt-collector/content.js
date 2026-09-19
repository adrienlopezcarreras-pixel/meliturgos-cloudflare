(() => {
  const api = globalThis.browser;
  if (!api?.runtime) return;

  const CAPTURE_CHUNK_SIZE = 6;
  const CAPTURE_CHUNK_PAUSE_MS = 60;
  const PASSIVE_INTERVAL_MS = 120000;
  const PASSIVE_MIN_GAP_MS = 5 * 60 * 1000;
  const PASSIVE_TAIL_MESSAGES = 24;
  const DEEP_DISCOVERY_MAX_ROUNDS = 60;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  let passiveBusy = false;
  let lastPassiveSignature = '';
  let lastPassiveAt = 0;

  function convId() {
    return decodeURIComponent(location.pathname.match(/(?:^|\/)c\/([^/?#]+)/i)?.[1] || '');
  }

  function convUrl(value = location.href) {
    try {
      const u = new URL(value, location.href);
      if (!['chatgpt.com','chat.openai.com'].includes(u.hostname)) return '';
      if (!/(?:^|\/)c\/[^/?#]+/i.test(u.pathname)) return '';
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch {
      return '';
    }
  }

  function title() {
    const active = document.querySelector('a[aria-current="page"][href*="/c/"]');
    return String(active?.textContent || document.title || 'Conversation ChatGPT')
      .replace(/\s*[|–-]\s*ChatGPT\s*$/i, '')
      .trim()
      .slice(0, 500) || 'Conversation ChatGPT';
  }

  function isGenerating() {
    return !!document.querySelector('[data-testid="stop-button"],button[aria-label*="Stop" i],.result-streaming');
  }

  function eligibleNodes() {
    return [...document.querySelectorAll('[data-message-author-role]')]
      .filter(node => ['user','assistant','system','tool'].includes(
        String(node.getAttribute('data-message-author-role') || '').toLowerCase()
      ));
  }

  function messageCount() {
    return eligibleNodes().length;
  }

  function textOf(node) {
    const source = node.querySelector('.markdown,.whitespace-pre-wrap,[class*="markdown"]') || node;
    return String(source.innerText || source.textContent || '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function yieldForPc() {
    await wait(CAPTURE_CHUNK_PAUSE_MS);
  }

  function pulse(requestId, processed, total) {
    if (!requestId) return;
    api.runtime.sendMessage({
      type: 'mel.collector.capture-progress',
      requestId,
      processed,
      total
    }).catch(() => {});
  }

  async function capture({tailLimit = 0, requestId = null} = {}) {
    const id = convId();
    if (!id) return {ok:false,code:'NOT_A_CONVERSATION'};
    if (isGenerating()) return {ok:false,code:'CONVERSATION_STILL_GENERATING'};

    const allNodes = eligibleNodes();
    const totalMessages = allNodes.length;
    if (!totalMessages) return {ok:false,code:'NO_MESSAGES_FOUND'};

    const indexed = allNodes.map((node, index) => ({node, index}));
    const selected = tailLimit > 0 ? indexed.slice(-tailLimit) : indexed;
    const base = Date.now() - Math.max(0, totalMessages - 1) * 1000;
    const messages = [];

    pulse(requestId, 0, totalMessages);

    for (let offset = 0; offset < selected.length; offset += CAPTURE_CHUNK_SIZE) {
      const chunk = selected.slice(offset, offset + CAPTURE_CHUNK_SIZE);
      for (const {node, index} of chunk) {
        const role = String(node.getAttribute('data-message-author-role') || 'unknown').toLowerCase();
        const holder = node.closest('[data-message-id]') || node.querySelector('[data-message-id]');
        const text = textOf(node);
        if (!text) continue;
        messages.push({
          id: String(
            holder?.getAttribute('data-message-id') ||
            node.getAttribute('data-message-id') ||
            `dom-${index + 1}-${role}`
          ).slice(0, 500),
          role,
          content: text,
          timestamp: base + index * 1000
        });
      }

      const processed = Math.min(totalMessages, selected[0].index + offset + chunk.length);
      pulse(requestId, processed, totalMessages);
      if (offset + CAPTURE_CHUNK_SIZE < selected.length) await yieldForPc();
    }

    if (!messages.length) return {ok:false,code:'NO_MESSAGES_FOUND'};

    pulse(requestId, totalMessages, totalMessages);

    return {
      ok:true,
      conversation:{
        id,
        conversation_id:id,
        title:title(),
        create_time:messages[0].timestamp,
        update_time:messages.at(-1).timestamp,
        messages,
        collector:{
          source:'firefox_dom',
          version:'0.2.0',
          url:convUrl(),
          totalMessages,
          partial:tailLimit > 0
        }
      }
    };
  }

  function links() {
    const out = new Set();
    document.querySelectorAll('a[href*="/c/"]').forEach(a => {
      const u = convUrl(a.href);
      if (u) out.add(u);
    });
    return [...out];
  }

  function sidebarCandidates() {
    const out = new Set(document.querySelectorAll('nav,aside,[role="navigation"]'));
    const firstLink = document.querySelector('a[href*="/c/"]');
    let node = firstLink?.parentElement || null;
    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      try {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY || '') && node.scrollHeight > node.clientHeight + 20) {
          out.add(node);
        }
      } catch {}
    }
    return [...out];
  }

  async function discover(deep = false) {
    const out = new Set(links());
    if (!deep) return [...out];

    for (const scroller of sidebarCandidates()) {
      let lastHeight = -1;
      let stableRounds = 0;
      for (let i = 0; i < DEEP_DISCOVERY_MAX_ROUNDS; i++) {
        scroller.scrollTop = scroller.scrollHeight;
        await wait(650);
        links().forEach(u => out.add(u));
        stableRounds = scroller.scrollHeight === lastHeight ? stableRounds + 1 : 0;
        lastHeight = scroller.scrollHeight;
        if (stableRounds >= 3) break;
      }
    }
    return [...out];
  }

  async function idlePause(timeout = 2500) {
    if (typeof requestIdleCallback === 'function') {
      await new Promise(resolve => requestIdleCallback(() => resolve(), {timeout}));
      return;
    }
    await wait(Math.min(timeout, 1500));
  }

  async function passiveCapture() {
    if (passiveBusy || document.visibilityState !== 'visible' || !convId() || isGenerating()) return;

    passiveBusy = true;
    try {
      const status = await api.runtime.sendMessage({type:'mel.collector.passive-status'}).catch(() => null);
      if (status?.busy) return;

      const total = messageCount();
      if (!total) return;

      const signature = `${convId()}:${total}`;
      const now = Date.now();
      if (signature === lastPassiveSignature) return;
      if (now - lastPassiveAt < PASSIVE_MIN_GAP_MS) return;

      await idlePause();
      if (document.visibilityState !== 'visible' || isGenerating()) return;

      const result = await capture({tailLimit:PASSIVE_TAIL_MESSAGES});
      if (!result.ok) return;

      const sent = await api.runtime.sendMessage({
        type:'mel.collector.auto-capture',
        conversation:result.conversation
      }).catch(() => null);

      if (sent?.ok) {
        lastPassiveSignature = signature;
        lastPassiveAt = Date.now();
      }
    } finally {
      passiveBusy = false;
    }
  }

  api.runtime.onMessage.addListener(msg => {
    if (msg?.type === 'mel.collector.capture') {
      return capture({requestId:String(msg.requestId || '')});
    }
    if (msg?.type === 'mel.collector.probe') {
      return Promise.resolve({
        ok:true,
        conversationId:convId(),
        messageCount:messageCount(),
        generating:isGenerating()
      });
    }
    if (msg?.type === 'mel.collector.discover') {
      return discover(msg.deep === true).then(urls => ({ok:true,urls,current:convUrl()}));
    }
  });

  setInterval(() => {
    passiveCapture().catch(() => {});
  }, PASSIVE_INTERVAL_MS);
})();