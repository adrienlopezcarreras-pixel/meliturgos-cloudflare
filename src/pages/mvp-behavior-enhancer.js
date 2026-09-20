import { FULL_MODE_CONTROL_PATCH } from './full-mode-control-enhancer.js';
import { ROADMAP_LIVE_REFRESH_PATCH } from './roadmap-live-refresh-enhancer.js';
import { WORK_TRUTH_PATCH } from './work-truth-enhancer.js';

export const MVP_BEHAVIOR_PATCH = `<style id="mel-mvp-behavior-style">
.app:before,.app:after{display:none!important;content:none!important}.theme-switch{display:none!important}.mel-bottom-tools .theme-switch{display:block!important;position:relative!important;top:auto!important;left:auto!important;z-index:50!important;width:max-content!important}.mel-bottom-tools .theme-orb{width:44px!important;height:44px!important;font-size:20px!important}.mel-bottom-tools .theme-panel{top:auto!important;bottom:52px!important;left:0!important;max-height:min(68vh,560px)!important}
#voiceStatus.mel-idle-voice{display:none!important}.controls{display:grid!important;grid-template-columns:1fr!important;max-width:none!important}.controls #send{width:100%!important}.drop{display:block!important}#fileInput{display:none!important}.mel-bottom-tools{display:grid;grid-template-columns:1fr;gap:9px;align-items:start;margin:12px 0 0}.mel-bottom-tools #full{grid-column:1/-1;width:100%!important;min-height:46px;font-weight:800}
@media(max-width:700px){.mel-bottom-tools{gap:7px}}
</style><script id="mel-mvp-behavior-runtime">
(function(){
  const CHAT_TIMEOUT_MS=120000,CHAT_ATTEMPTS=2,RETRYABLE=new Set([502,503,504]);
  function timeoutSignal(){try{return AbortSignal?.timeout?AbortSignal.timeout(CHAT_TIMEOUT_MS):undefined}catch{return undefined}}
  function patchChatTimeout(){if(window.__melLongChatFetchPatched||!window.fetch)return;const nativeFetch=window.fetch.bind(window);window.__melLongChatFetchPatched=true;window.fetch=async function(input,init){const url=typeof input==='string'?input:String(input?.url||'');if(!url.includes('/api/chat'))return nativeFetch(input,init);let last;for(let attempt=1;attempt<=CHAT_ATTEMPTS;attempt++){const next={...(init||{})};const signal=timeoutSignal();if(signal)next.signal=signal;try{const response=await nativeFetch(input,next);if(!RETRYABLE.has(response.status)||attempt===CHAT_ATTEMPTS)return response;last=new Error('HTTP_'+response.status)}catch(error){last=error;if(attempt===CHAT_ATTEMPTS)throw error}}throw last||new Error('CHAT_RETRY_EXHAUSTED')}}
  function normalizeUserLabels(root=document){root.querySelectorAll?.('.who').forEach(node=>{const text=String(node.textContent||'');if(/^Vous(?:\\s*·.*)?$/i.test(text))node.textContent=text.replace(/^Vous/i,'Adrien')})}
  function installMinimalLayout(){const avatar=document.querySelector('.avatar-wrap'),windowPanel=document.querySelector('.window'),full=document.getElementById('full');if(!avatar)return;if(windowPanel&&full){let bottom=document.getElementById('melBottomTools');if(!bottom){bottom=document.createElement('div');bottom.id='melBottomTools';bottom.className='mel-bottom-tools';windowPanel.insertAdjacentElement('afterend',bottom)}const themeSwitch=document.querySelector('.theme-switch');if(themeSwitch&&!bottom.contains(themeSwitch))bottom.appendChild(themeSwitch);if(!bottom.contains(full))bottom.appendChild(full)}}
  function syncVoiceStatus(){const node=document.getElementById('voiceStatus');if(!node)return;const refresh=()=>{const text=String(node.textContent||'').trim();node.classList.toggle('mel-idle-voice',/^(Touchez son visage pour parler|Reconnaissance vocale non disponible dans ce navigateur\.?|)$/i.test(text))};new MutationObserver(refresh).observe(node,{childList:true,subtree:true,characterData:true});refresh()}
  function init(){patchChatTimeout();installMinimalLayout();syncVoiceStatus();normalizeUserLabels()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
</script>`;

function injectBeforeBody(html, patches) {
  if (!patches.length) return html;
  const payload = patches.join('');
  return html.includes('</body>') ? html.replace('</body>', payload + '</body>') : html + payload;
}

export function composeProfessorEnhancements(html) {
  const patches = [];
  if (!html.includes('mel-full-control-runtime')) patches.push(FULL_MODE_CONTROL_PATCH);
  if (
    html.includes('data-panel="roadmap"')
    && html.includes('id="roadmapList"')
    && !html.includes('mel-roadmap-live-refresh-runtime')
  ) patches.push(ROADMAP_LIVE_REFRESH_PATCH);
  if (
    html.includes('data-panel="work"')
    && html.includes('id="workOut"')
    && !html.includes('mel-work-truth-runtime')
  ) patches.push(WORK_TRUTH_PATCH);
  return injectBeforeBody(html, patches);
}

export async function enhanceMvpBehavior(response) {
  if (!(response instanceof Response)) return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  const html=await response.text();
  if(html.includes('data-panel="chat"')&&html.includes('id="chatInput"')){
    const body=composeProfessorEnhancements(html);
    const headers=new Headers(response.headers);
    headers.set('content-length',String(new TextEncoder().encode(body).length));
    headers.set('cache-control','no-store');
    return new Response(body,{status:response.status,statusText:response.statusText,headers});
  }
  if(!html.includes('id="input"'))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  if(html.includes('mel-mvp-behavior-runtime'))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const body=injectBeforeBody(html,[MVP_BEHAVIOR_PATCH]);const headers=new Headers(response.headers);headers.set('content-length',String(new TextEncoder().encode(body).length));return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
