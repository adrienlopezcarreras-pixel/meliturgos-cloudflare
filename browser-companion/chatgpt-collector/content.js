(() => {
  const api = globalThis.browser;
  if (!api?.runtime) return;

  const CAPTURE_CHUNK_SIZE = 6;
  const CAPTURE_CHUNK_PAUSE_MS = 60;
  const PASSIVE_INTERVAL_MS = 120000;
  const PASSIVE_MIN_GAP_MS = 5 * 60 * 1000;
  const PASSIVE_TAIL_MESSAGES = 24;
  const DEEP_DISCOVERY_MAX_ROUNDS = 60;
  const RUNNER_HEARTBEAT_MS = 4000;
  const RUNNER_STATE_REPORT_MS = 12000;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  let passiveBusy = false;
  let lastPassiveSignature = '';
  let lastPassiveAt = 0;
  let runnerWatchEnabled = false;
  let runnerLastAssistantSignature = '';
  let runnerLastGenerating = null;
  let runnerStableSince = Date.now();
  let runnerLastReportKey = '';
  let runnerLastReportAt = 0;

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

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function lastAssistantSignature() {
    const nodes = eligibleNodes().filter(node =>
      String(node.getAttribute('data-message-author-role') || '').toLowerCase() === 'assistant'
    );
    const node = nodes.at(-1);
    if (!node) return '';
    const holder = node.closest('[data-message-id]') || node.querySelector('[data-message-id]');
    const text = textOf(node);
    const id = String(holder?.getAttribute('data-message-id') || node.getAttribute('data-message-id') || 'assistant');
    return `${id.slice(0,120)}:${text.length}:${hashText(text.slice(-2000))}`;
  }

  function composerElement() {
    return document.querySelector(
      '#prompt-textarea,[data-testid="composer-text-input"],textarea[placeholder*="Message" i],textarea'
    );
  }

  function composerText() {
    const el = composerElement();
    if (!el) return '';
    if ('value' in el) return String(el.value || '');
    return String(el.innerText || el.textContent || '');
  }

  function currentBlockReason() {
    const text = [...document.querySelectorAll('[role="alert"],[data-testid*="error" i]')]
      .slice(0, 20)
      .map(node => String(node.innerText || node.textContent || '').trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, 5000);
    if (!text) return '';
    const patterns = [
      [/you(?:'|’)ve reached|you have reached|usage limit|message limit/i, 'USAGE_LIMIT'],
      [/too many requests|rate limit/i, 'RATE_LIMIT'],
      [/something went wrong|network error|connection error/i, 'CHATGPT_ERROR'],
      [/try again|retry/i, 'RETRY_REQUIRED'],
      [/vous avez atteint|limite d(?:'|’)utilisation|limite de messages/i, 'USAGE_LIMIT'],
      [/trop de requêtes|limite de débit/i, 'RATE_LIMIT'],
      [/une erreur s(?:'|’)est produite|erreur réseau|erreur de connexion/i, 'CHATGPT_ERROR'],
      [/réessayer/i, 'RETRY_REQUIRED']
    ];
    for (const [pattern, code] of patterns) if (pattern.test(text)) return code;
    return '';
  }

  function runnerPageState() {
    const now = Date.now();
    const assistantSignature = lastAssistantSignature();
    const generating = isGenerating();
    if (
      assistantSignature !== runnerLastAssistantSignature ||
      runnerLastGenerating === null ||
      generating !== runnerLastGenerating
    ) {
      runnerLastAssistantSignature = assistantSignature;
      runnerLastGenerating = generating;
      runnerStableSince = now;
    }
    const composer = composerElement();
    const draft = composerText().trim();
    return {
      ok: true,
      conversationId: convId(),
      url: convUrl(),
      generating,
      messageCount: messageCount(),
      assistantSignature,
      stableForMs: Math.max(0, now - runnerStableSince),
      composerReady: !!composer,
      composerEmpty: draft.length === 0,
      blocked: currentBlockReason()
    };
  }

  function findSendButton() {
    return document.querySelector(
      '[data-testid="send-button"],button[aria-label*="Send" i],button[aria-label*="Envoyer" i]'
    );
  }

  async function writeComposerText(text) {
    const el = composerElement();
    if (!el) return {ok:false,code:'COMPOSER_NOT_FOUND'};
    if (composerText().trim()) return {ok:false,code:'COMPOSER_NOT_EMPTY'};
    el.focus();

    if ('value' in el) {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set ||
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(el, text);
      else el.value = text;
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    } else {
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, text);
      } catch {}
      if (!inserted) {
        el.textContent = text;
        try {
          el.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertText',data:text}));
        } catch {
          el.dispatchEvent(new Event('input', {bubbles:true}));
        }
      }
    }

    await wait(180);
    const button = findSendButton();
    if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
      button.click();
      await wait(300);
      return {ok:true,method:'button'};
    }

    try {
      el.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
      el.dispatchEvent(new KeyboardEvent('keyup', {key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
      await wait(300);
      return {ok:true,method:'enter'};
    } catch {
      return {ok:false,code:'SEND_BUTTON_UNAVAILABLE'};
    }
  }

  async function runnerSend(command) {
    const text = String(command || '').trim();
    if (!text || text.length > 200) return {ok:false,code:'INVALID_RUNNER_COMMAND'};
    const before = runnerPageState();
    if (!before.conversationId) return {ok:false,code:'NOT_A_CONVERSATION'};
    if (before.generating) return {ok:false,code:'CONVERSATION_STILL_GENERATING'};
    if (!before.composerReady) return {ok:false,code:'COMPOSER_NOT_FOUND'};
    if (!before.composerEmpty) return {ok:false,code:'COMPOSER_NOT_EMPTY'};
    if (before.blocked) return {ok:false,code:before.blocked};
    const sent = await writeComposerText(text);
    return {...sent,before};
  }

  async function emitRunnerState(force = false) {
    if (!runnerWatchEnabled) return;
    const state = runnerPageState();
    const now = Date.now();
    const key = [
      state.conversationId,
      state.generating ? '1' : '0',
      state.assistantSignature,
      state.composerReady ? '1' : '0',
      state.composerEmpty ? '1' : '0',
      state.blocked || ''
    ].join('|');
    if (!force && key === runnerLastReportKey && now - runnerLastReportAt < RUNNER_STATE_REPORT_MS) return;
    runnerLastReportKey = key;
    runnerLastReportAt = now;
    await api.runtime.sendMessage({type:'mel.runner.page-state',state}).catch(() => {});
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
    if (msg?.type === 'mel.runner.watch') {
      runnerWatchEnabled = msg.enabled === true;
      if (runnerWatchEnabled) emitRunnerState(true).catch(() => {});
      return Promise.resolve({ok:true,enabled:runnerWatchEnabled});
    }
    if (msg?.type === 'mel.runner.probe') {
      return Promise.resolve(runnerPageState());
    }
    if (msg?.type === 'mel.runner.send') {
      return runnerSend(msg.command);
    }
  });

  api.runtime.sendMessage({type:'mel.runner.bootstrap'}).then(result => {
    runnerWatchEnabled = result?.enabled === true;
    if (runnerWatchEnabled) emitRunnerState(true).catch(() => {});
  }).catch(() => {});

  setInterval(() => {
    passiveCapture().catch(() => {});
  }, PASSIVE_INTERVAL_MS);

  setInterval(() => {
    emitRunnerState(false).catch(() => {});
  }, RUNNER_HEARTBEAT_MS);
})();