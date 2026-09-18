(() => {
  const api = globalThis.browser;
  if (!api?.runtime) return;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function convId() {
    return decodeURIComponent(location.pathname.match(/(?:^|\/)c\/([^/?#]+)/i)?.[1] || '');
  }

  function convUrl(value = location.href) {
    try {
      const u = new URL(value, location.href);
      if (!['chatgpt.com','chat.openai.com'].includes(u.hostname)) return '';
      if (!/(?:^|\/)c\/[^/?#]+/i.test(u.pathname)) return '';
      u.search = ''; u.hash = '';
      return u.toString();
    } catch { return ''; }
  }

  function title() {
    const active = document.querySelector('a[aria-current="page"][href*="/c/"]');
    return String(active?.textContent || document.title || 'Conversation ChatGPT')
      .replace(/\s*[|–-]\s*ChatGPT\s*$/i,'').trim().slice(0,500) || 'Conversation ChatGPT';
  }

  function isGenerating() {
    return !!document.querySelector('[data-testid="stop-button"],button[aria-label*="Stop" i],.result-streaming');
  }

  function textOf(node) {
    const source = node.querySelector('.markdown,.whitespace-pre-wrap,[class*="markdown"]') || node;
    const clone = source.cloneNode(true);
    clone.querySelectorAll('button,svg,style,script,textarea,input').forEach(el => el.remove());
    return String(clone.innerText || clone.textContent || '').replace(/\n{3,}/g,'\n\n').trim();
  }

  function capture() {
    const id = convId();
    if (!id) return {ok:false,code:'NOT_A_CONVERSATION'};
    if (isGenerating()) return {ok:false,code:'CONVERSATION_STILL_GENERATING'};
    const nodes = [...document.querySelectorAll('[data-message-author-role]')]
      .filter(n => ['user','assistant','system','tool'].includes(String(n.getAttribute('data-message-author-role') || '').toLowerCase()));
    const base = Date.now() - Math.max(0,nodes.length-1)*1000;
    const messages = nodes.map((node,i) => {
      const role = String(node.getAttribute('data-message-author-role') || 'unknown').toLowerCase();
      const holder = node.closest('[data-message-id]') || node.querySelector('[data-message-id]');
      return {
        id: String(holder?.getAttribute('data-message-id') || node.getAttribute('data-message-id') || `dom-${i+1}-${role}`).slice(0,500),
        role,
        content: textOf(node),
        timestamp: base + i*1000
      };
    }).filter(x => x.content);
    if (!messages.length) return {ok:false,code:'NO_MESSAGES_FOUND'};
    return {
      ok:true,
      conversation:{
        id,
        conversation_id:id,
        title:title(),
        create_time:messages[0].timestamp,
        update_time:messages.at(-1).timestamp,
        messages,
        collector:{source:'firefox_dom',version:'0.1.0',url:convUrl()}
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

  async function discover() {
    const out = new Set(links());
    const candidates = new Set(document.querySelectorAll('nav,aside,[role="navigation"]'));
    document.querySelectorAll('div').forEach(el => {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY || '') && el.scrollHeight > el.clientHeight + 20 && el.querySelector('a[href*="/c/"]')) candidates.add(el);
    });
    for (const scroller of candidates) {
      let last=-1,still=0;
      for (let i=0;i<24;i++) {
        scroller.scrollTop=scroller.scrollHeight;
        await wait(220);
        links().forEach(u => out.add(u));
        still = scroller.scrollHeight===last ? still+1 : 0;
        last=scroller.scrollHeight;
        if (still>=3) break;
      }
    }
    return [...out];
  }

  api.runtime.onMessage.addListener(msg => {
    if (msg?.type==='mel.collector.capture') return Promise.resolve(capture());
    if (msg?.type==='mel.collector.discover') return discover().then(urls => ({ok:true,urls,current:convUrl()}));
  });

  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer=setTimeout(() => {
      if (!convId() || isGenerating()) return;
      const result=capture();
      if (result.ok) api.runtime.sendMessage({type:'mel.collector.auto-capture',conversation:result.conversation}).catch(()=>{});
    },7000);
  }).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();
