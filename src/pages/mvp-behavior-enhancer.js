const MVP_BEHAVIOR_PATCH = `<style id="mel-mvp-behavior-style">
/* Final simple-mode layout: MEL alone at the top; only requested controls remain. */
.mel-title{margin:0 0 8px;text-align:center;font-size:clamp(1.5rem,4vw,2.05rem);line-height:1;letter-spacing:.12em;font-weight:850;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.44)}
.app:before,.app:after{display:none!important;content:none!important}
.theme-switch{display:none!important}
.mel-bottom-tools .theme-switch{display:block!important;position:relative!important;top:auto!important;left:auto!important;z-index:50!important;width:max-content!important}
.mel-bottom-tools .theme-orb{width:44px!important;height:44px!important;font-size:20px!important}
.mel-bottom-tools .theme-panel{top:auto!important;bottom:52px!important;left:0!important;max-height:min(68vh,560px)!important}
#voiceStatus.mel-idle-voice{display:none!important}
.controls{display:grid!important;grid-template-columns:1fr!important;max-width:none!important}
.controls #send{width:100%!important}
.drop{display:block!important}
#fileInput{display:none!important}
.mel-continue-row{min-height:22px;margin:2px 2px 4px;display:flex;align-items:center}
.mel-continue-link{display:none;color:var(--accent);font-size:.84rem;font-weight:700;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;cursor:pointer;user-select:none}
.mel-continue-link.visible{display:inline}
.mel-continue-link:hover{filter:brightness(1.16)}
.mel-continue-link:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}
.mel-bottom-tools{display:grid;grid-template-columns:1fr;gap:9px;align-items:start;margin:12px 0 0}
.mel-bottom-tools #full{grid-column:1/-1;width:100%;min-height:46px;font-weight:800}
@media(max-width:600px){.mel-title{font-size:1.42rem;margin-bottom:7px}.avatar{width:min(43vw,172px)!important;height:min(43vw,172px)!important;min-width:136px!important;min-height:136px!important}.avatar-wrap:before{width:180px!important;height:180px!important}#messages{min-height:210px!important}.mel-bottom-tools{grid-template-columns:1fr;gap:7px}.mel-bottom-tools .theme-panel{width:min(300px,calc(100vw - 18px))!important}}
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
      if(/^Vous(?:\\s*·.*)?$/i.test(text))node.textContent=text.replace(/^Vous/i,'Adrien');
    });
  }

  function installContinueLink(){
    const input=document.getElementById('input');
    const send=document.getElementById('send');
    const messages=document.getElementById('messages');
    if(!input||!send||!messages||document.getElementById('melContinueLink'))return;
    const row=document.createElement('div');row.className='mel-continue-row';
    const link=document.createElement('span');link.id='melContinueLink';link.className='mel-continue-link';link.tabIndex=0;link.setAttribute('role','link');link.textContent='Continuer depuis la dernière phrase';row.appendChild(link);input.insertAdjacentElement('afterend',row);
    let lastMelText='';
    const refresh=()=>{const mel=[...messages.querySelectorAll('.msg.mel')].at(-1);if(mel){const copy=mel.querySelector('div:last-child');lastMelText=String(copy?.textContent||mel.textContent||'').trim()}link.classList.toggle('visible',Boolean(lastMelText));normalizeUserLabels(messages)};
    const continueFromLast=()=>{if(!lastMelText)return;input.value=CONTINUE_TEXT;input.dispatchEvent(new Event('input',{bubbles:true}));link.classList.remove('visible');send.click()};
    link.addEventListener('click',continueFromLast);link.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();continueFromLast()}});new MutationObserver(refresh).observe(messages,{childList:true,subtree:true,characterData:true});refresh();
  }

  function syncVoiceStatus(){
    const node=document.getElementById('voiceStatus');if(!node)return;
    const refresh=()=>{
      const text=String(node.textContent||'').trim();
      node.classList.toggle('mel-idle-voice',/^(Touchez son visage pour parler|Reconnaissance vocale non disponible dans ce navigateur\.?|)$/i.test(text));
    };
    new MutationObserver(refresh).observe(node,{childList:true,subtree:true,characterData:true});refresh();
  }

  function installMinimalLayout(){
    const app=document.querySelector('.app'),avatarWrap=document.querySelector('.avatar-wrap'),windowPanel=document.querySelector('.window'),full=document.getElementById('full');
    if(!app||!avatarWrap||!windowPanel||!full)return;
    if(!document.getElementById('melTitle')){const title=document.createElement('h1');title.id='melTitle';title.className='mel-title';title.textContent='MEL';app.insertBefore(title,avatarWrap)}
    let bottom=document.getElementById('melBottomTools');if(!bottom){bottom=document.createElement('div');bottom.id='melBottomTools';bottom.className='mel-bottom-tools';windowPanel.insertAdjacentElement('afterend',bottom)}
    const themeSwitch=document.querySelector('.theme-switch');if(themeSwitch&&!bottom.contains(themeSwitch))bottom.appendChild(themeSwitch);
    document.getElementById('melAudit')?.remove();
    if(!bottom.contains(full))bottom.appendChild(full);
    document.querySelectorAll('.mel-topline,.mel-recall-row,.mel-motto,.mel-idle-status,#skills,#skillsBtn,#skillsPanel,.skills').forEach(node=>node.remove());
  }

  patchChatTimeout();
  const boot=()=>{installMinimalLayout();installContinueLink();syncVoiceStatus();normalizeUserLabels();};
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
