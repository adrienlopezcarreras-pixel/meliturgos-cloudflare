const MVP_BEHAVIOR_PATCH = `<style id="mel-mvp-behavior-style">
.mel-continue-row{min-height:22px;margin:2px 2px 4px;display:flex;align-items:center}
.mel-continue-link{display:none;color:var(--accent);font-size:.84rem;font-weight:700;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;cursor:pointer;user-select:none}
.mel-continue-link.visible{display:inline}
.mel-continue-link:hover{filter:brightness(1.16)}
.mel-continue-link:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}
</style><script id="mel-mvp-behavior-runtime">
(function(){
  const CHAT_TIMEOUT_MS=120000;
  const CHAT_ATTEMPTS=2;
  const RETRYABLE_STATUS=new Set([502,503,504]);
  const CONTINUE_TEXT='Continue exactement à partir de ta dernière phrase, sans répéter ce qui précède. Termine complètement ta réponse.';

  function timeoutSignal(){
    try{return typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(CHAT_TIMEOUT_MS):undefined}catch{return undefined}
  }

  function patchChatTimeout(){
    const nativeFetch=window.fetch&&window.fetch.bind(window);
    if(!nativeFetch||window.__melLongChatFetchPatched)return;
    window.__melLongChatFetchPatched=true;
    window.fetch=async function(input,init){
      const url=typeof input==='string'?input:String(input&&input.url||'');
      if(!url.includes('/api/chat'))return nativeFetch(input,init);
      let lastError=null;
      for(let attempt=1;attempt<=CHAT_ATTEMPTS;attempt++){
        const next={...(init||{})};
        const signal=timeoutSignal();
        if(signal)next.signal=signal;else delete next.signal;
        try{
          const response=await nativeFetch(input,next);
          if(!RETRYABLE_STATUS.has(response.status)||attempt===CHAT_ATTEMPTS)return response;
          lastError=new Error('HTTP_'+response.status);
        }catch(error){
          lastError=error;
          if(attempt===CHAT_ATTEMPTS)throw error;
        }
      }
      throw lastError||new Error('CHAT_RETRY_EXHAUSTED');
    };
  }

  function normalizeUserLabels(root=document){
    root.querySelectorAll&&root.querySelectorAll('.who').forEach(node=>{
      const text=String(node.textContent||'');
      if(/^Vous(?:\s*·.*)?$/i.test(text))node.textContent=text.replace(/^Vous/i,'Adrien');
    });
  }

  function installContinueLink(){
    const input=document.getElementById('input');
    const send=document.getElementById('send');
    const messages=document.getElementById('messages');
    if(!input||!send||!messages)return;
    if(document.getElementById('melContinueLink'))return;

    const row=document.createElement('div');
    row.className='mel-continue-row';
    const link=document.createElement('span');
    link.id='melContinueLink';
    link.className='mel-continue-link';
    link.tabIndex=0;
    link.setAttribute('role','link');
    link.textContent='Continuer depuis la dernière phrase';
    row.appendChild(link);
    input.insertAdjacentElement('afterend',row);

    let lastMelText='';
    const refresh=()=>{
      const mel=[...messages.querySelectorAll('.msg.mel')].at(-1);
      if(mel){
        const copy=mel.querySelector('div:last-child');
        lastMelText=String(copy?.textContent||mel.textContent||'').trim();
      }
      link.classList.toggle('visible',Boolean(lastMelText));
      normalizeUserLabels(messages);
    };

    const continueFromLast=()=>{
      if(!lastMelText)return;
      input.value=CONTINUE_TEXT;
      input.dispatchEvent(new Event('input',{bubbles:true}));
      link.classList.remove('visible');
      send.click();
    };
    link.addEventListener('click',continueFromLast);
    link.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();continueFromLast()}
    });

    new MutationObserver(refresh).observe(messages,{childList:true,subtree:true,characterData:true});
    refresh();
  }

  patchChatTimeout();
  const boot=()=>{installContinueLink();normalizeUserLabels();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
</script>`;

export async function enhanceMvpBehavior(response) {
  if (!(response instanceof Response)) return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;
  const text = await response.text();
  if (!text.includes('id="input"') || text.includes('mel-mvp-behavior-runtime')) {
    return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const patched = text.includes('</body>') ? text.replace('</body>', `${MVP_BEHAVIOR_PATCH}</body>`) : `${text}${MVP_BEHAVIOR_PATCH}`;
  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.delete('content-length');
  return new Response(patched, { status: response.status, statusText: response.statusText, headers });
}

export { MVP_BEHAVIOR_PATCH };
