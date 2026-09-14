const MVP_BEHAVIOR_PATCH = `<style id="mel-mvp-behavior-style">
/* Final simple-mode layout: MEL alone at the top; chat and development share one surface. */
.mel-title{margin:0 0 3px;text-align:center;font-size:clamp(1.5rem,4vw,2.05rem);line-height:1;letter-spacing:.12em;font-weight:850;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.44)}
.mel-mode-label{margin:0 0 9px;text-align:center;font-size:.74rem;line-height:1.2;letter-spacing:.12em;font-weight:800;color:rgba(255,255,255,.82);text-transform:uppercase}
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
.mel-ops{position:fixed;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));z-index:130;display:flex;align-items:center;gap:8px;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
.mel-stop,.mel-activity-toggle{border:1px solid rgba(255,255,255,.34)!important;box-shadow:0 9px 30px rgba(0,0,0,.38)!important;font-weight:900!important;letter-spacing:.035em!important;cursor:pointer!important}
.mel-stop{min-width:86px;height:48px;padding:0 14px!important;border-radius:999px!important;background:#bd1717!important;color:#fff!important}
.mel-stop:hover{background:#dc2020!important}.mel-stop.paused{background:#216a3b!important}.mel-stop.pending{opacity:.62;pointer-events:none}
.mel-activity-toggle{height:48px;padding:0 14px!important;border-radius:999px!important;background:rgba(16,19,26,.88)!important;color:#fff!important}
.mel-activity-dot{display:inline-block;width:9px;height:9px;margin-right:7px;border-radius:50%;background:#44cf72;box-shadow:0 0 0 3px rgba(68,207,114,.16)}
.mel-activity-dot.paused{background:#ffbf3f;box-shadow:0 0 0 3px rgba(255,191,63,.17)}.mel-activity-dot.error{background:#f05252}
.mel-activity-panel{position:fixed;top:72px;right:12px;z-index:129;width:min(440px,calc(100vw - 24px));max-height:min(72vh,700px);overflow:auto;padding:16px;border:1px solid rgba(255,255,255,.2);border-radius:18px;background:rgba(13,15,21,.96);color:#f6f2e9;box-shadow:0 24px 80px rgba(0,0,0,.55);font-family:Inter,ui-sans-serif,system-ui,sans-serif;display:none}
.mel-activity-panel.open{display:block}.mel-activity-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.mel-activity-head strong{font-size:1.04rem}.mel-activity-close{border:0!important;background:transparent!important;color:#fff!important;font-size:24px!important;padding:2px 8px!important;cursor:pointer}.mel-activity-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.mel-metric{padding:10px;border-radius:12px;background:rgba(255,255,255,.07);text-align:center}.mel-metric b{display:block;font-size:1.25rem}.mel-metric span{font-size:.7rem;opacity:.74}.mel-activity-status{padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.06);margin-bottom:10px;font-size:.84rem;line-height:1.45}.mel-job{padding:10px 0;border-top:1px solid rgba(255,255,255,.1);font-size:.78rem;line-height:1.42}.mel-job b{display:block;font-size:.82rem}.mel-job code{font-size:.7rem;opacity:.75}.mel-activity-refresh{width:100%;margin-top:10px!important;min-height:40px!important;background:rgba(255,255,255,.09)!important;color:#fff!important;border:1px solid rgba(255,255,255,.18)!important;border-radius:10px!important;font-weight:750!important}
@media(max-width:700px){.mel-title{font-size:1.42rem;margin-bottom:3px}.mel-mode-label{font-size:.66rem}.avatar{width:min(43vw,172px)!important;height:min(43vw,172px)!important;min-width:136px!important;min-height:136px!important}.avatar-wrap:before{width:180px!important;height:180px!important}#messages{min-height:210px!important}.mel-bottom-tools{grid-template-columns:1fr;gap:7px}.mel-bottom-tools .theme-panel{width:min(300px,calc(100vw - 18px))!important}.mel-ops{top:max(8px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));gap:5px}.mel-stop,.mel-activity-toggle{height:42px!important;padding:0 10px!important;font-size:.72rem!important}.mel-stop{min-width:68px}.mel-activity-panel{top:58px;right:8px;width:calc(100vw - 16px);max-height:75vh}.mel-activity-summary{grid-template-columns:repeat(3,1fr)}}
</style><script id="mel-mvp-behavior-runtime">
(function(){
  const CHAT_TIMEOUT_MS=120000;
  const CHAT_ATTEMPTS=2;
  const RETRYABLE_STATUS=new Set([502,503,504]);
  const CONTINUE_TEXT='Continue exactement à partir de ta dernière phrase, sans répéter ce qui précède. Termine complètement ta réponse.';
  let autonomyState=null;
  let activityTimer=null;

  function timeoutSignal(){try{return typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(CHAT_TIMEOUT_MS):undefined}catch{return undefined}}
  function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
  function shortSha(value){const v=String(value||'');return v?v.slice(0,8):'—'}
  function age(value){const n=Number(value||0);if(!n)return '—';const d=Math.max(0,Date.now()-n);if(d<60000)return 'à l’instant';if(d<3600000)return Math.floor(d/60000)+' min';if(d<86400000)return Math.floor(d/3600000)+' h';return Math.floor(d/86400000)+' j'}

  function patchChatTimeout(){
    const nativeFetch=window.fetch&&window.fetch.bind(window);if(!nativeFetch||window.__melLongChatFetchPatched)return;window.__melLongChatFetchPatched=true;
    window.fetch=async function(input,init){const url=typeof input==='string'?input:String(input&&input.url||'');if(!url.includes('/api/chat'))return nativeFetch(input,init);let lastError=null;for(let attempt=1;attempt<=CHAT_ATTEMPTS;attempt++){const next={...(init||{})};const signal=timeoutSignal();if(signal)next.signal=signal;else delete next.signal;try{const response=await nativeFetch(input,next);if(!RETRYABLE_STATUS.has(response.status)||attempt===CHAT_ATTEMPTS)return response;lastError=new Error('HTTP_'+response.status)}catch(error){lastError=error;if(attempt===CHAT_ATTEMPTS)throw error}}throw lastError||new Error('CHAT_RETRY_EXHAUSTED')};
  }

  function normalizeUserLabels(root=document){root.querySelectorAll&&root.querySelectorAll('.who').forEach(node=>{const text=String(node.textContent||'');if(/^Vous(?:\\s*·.*)?$/i.test(text))node.textContent=text.replace(/^Vous/i,'Adrien')})}

  function installContinueLink(){
    const input=document.getElementById('input'),send=document.getElementById('send'),messages=document.getElementById('messages');if(!input||!send||!messages||document.getElementById('melContinueLink'))return;
    const row=document.createElement('div');row.className='mel-continue-row';const link=document.createElement('span');link.id='melContinueLink';link.className='mel-continue-link';link.tabIndex=0;link.setAttribute('role','link');link.textContent='Continuer depuis la dernière phrase';row.appendChild(link);input.insertAdjacentElement('afterend',row);let lastMelText='';
    const refresh=()=>{const mel=[...messages.querySelectorAll('.msg.mel')].at(-1);if(mel){const copy=mel.querySelector('div:last-child');lastMelText=String(copy?.textContent||mel.textContent||'').trim()}link.classList.toggle('visible',Boolean(lastMelText));normalizeUserLabels(messages)};
    const continueFromLast=()=>{if(!lastMelText)return;input.value=CONTINUE_TEXT;input.dispatchEvent(new Event('input',{bubbles:true}));link.classList.remove('visible');send.click()};link.addEventListener('click',continueFromLast);link.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();continueFromLast()}});new MutationObserver(refresh).observe(messages,{childList:true,subtree:true,characterData:true});refresh();
  }

  function syncVoiceStatus(){const node=document.getElementById('voiceStatus');if(!node)return;const refresh=()=>{const text=String(node.textContent||'').trim();node.classList.toggle('mel-idle-voice',/^(Touchez son visage pour parler|Reconnaissance vocale non disponible dans ce navigateur\.?|)$/i.test(text))};new MutationObserver(refresh).observe(node,{childList:true,subtree:true,characterData:true});refresh()}

  function installMinimalLayout(){
    const app=document.querySelector('.app'),avatarWrap=document.querySelector('.avatar-wrap'),windowPanel=document.querySelector('.window'),full=document.getElementById('full');if(!app||!avatarWrap||!windowPanel||!full)return;
    if(!document.getElementById('melTitle')){const title=document.createElement('h1');title.id='melTitle';title.className='mel-title';title.textContent='MEL';app.insertBefore(title,avatarWrap);const mode=document.createElement('div');mode.className='mel-mode-label';mode.textContent='IA + Développement';title.insertAdjacentElement('afterend',mode)}
    let bottom=document.getElementById('melBottomTools');if(!bottom){bottom=document.createElement('div');bottom.id='melBottomTools';bottom.className='mel-bottom-tools';windowPanel.insertAdjacentElement('afterend',bottom)}
    const themeSwitch=document.querySelector('.theme-switch');if(themeSwitch&&!bottom.contains(themeSwitch))bottom.appendChild(themeSwitch);document.getElementById('melAudit')?.remove();if(!bottom.contains(full))bottom.appendChild(full);document.querySelectorAll('.mel-topline,.mel-recall-row,.mel-motto,.mel-idle-status,#skills,#skillsBtn,#skillsPanel,.skills').forEach(node=>node.remove());
  }

  function renderActivity(state,error){
    const stop=document.getElementById('melEmergencyStop'),dot=document.getElementById('melActivityDot'),panel=document.getElementById('melActivityBody');if(!stop||!dot||!panel)return;
    if(error){dot.className='mel-activity-dot error';panel.innerHTML='<div class="mel-activity-status">État d’activité indisponible : '+esc(error)+'</div>';return}
    autonomyState=state;const paused=state?.control?.paused===true;stop.classList.toggle('paused',paused);stop.textContent=paused?'REPRENDRE':'STOP';stop.setAttribute('aria-label',paused?'Reprendre le développement autonome':'Arrêter le développement autonome');dot.className='mel-activity-dot'+(paused?' paused':'');
    const c=state?.counts||{},ready=state?.readiness||{},jobs=Array.isArray(state?.active_jobs)?state.active_jobs:[],recent=Array.isArray(state?.recent_activity)?state.recent_activity:[];
    const next=state?.next;let html='<div class="mel-activity-summary"><div class="mel-metric"><b>'+esc(c.active||0)+'</b><span>actifs</span></div><div class="mel-metric"><b>'+esc(c.completed||0)+'</b><span>terminés</span></div><div class="mel-metric"><b>'+esc(c.failed||0)+'</b><span>échecs</span></div></div>';
    html+='<div class="mel-activity-status"><b>Autonomie : '+(paused?'EN PAUSE':'ACTIVE')+'</b><br>Readiness : '+esc(ready.status||'—')+' · Candidate : '+esc(state?.candidate_branch||'—')+(next?'<br>Prochain : <b>'+esc(next.id||'')+'</b> — '+esc(next.title||''):'')+'</div>';
    if(jobs.length){html+='<div class="mel-activity-status"><b>Travaux en cours</b></div>';for(const job of jobs.slice(0,8)){html+='<div class="mel-job"><b>'+esc(job.roadmap_id||job.id||'travail')+' · '+esc(job.status||'')+'</b>'+esc(job.goal||'')+(job.completion?'<br><code>SHA '+shortSha(job.completion.candidate_sha)+' · CI '+esc(job.completion.ci_run_id||'—')+'</code>':'')+'<br><small>maj '+age(job.updated_at)+'</small></div>'}}
    else html+='<div class="mel-activity-status">Aucun travail autonome actif.</div>';
    const completedRecent=recent.filter(x=>x&&['COMPLETED','COMMITTED','FAILED'].includes(String(x.status||'').toUpperCase())).slice(0,5);if(completedRecent.length){html+='<div class="mel-activity-status"><b>Activité récente</b></div>';for(const job of completedRecent)html+='<div class="mel-job"><b>'+esc(job.roadmap_id||job.id||'activité')+' · '+esc(job.status||'')+'</b><small>maj '+age(job.updated_at)+'</small></div>'}
    panel.innerHTML=html;
  }

  async function loadActivity(){
    try{const response=await fetch('/api/gen2/autonomy/state',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('HTTP_'+response.status);renderActivity(await response.json(),null)}catch(error){renderActivity(null,error?.message||'ERREUR')}
  }

  async function toggleAutonomy(){
    const stop=document.getElementById('melEmergencyStop');if(!stop||stop.classList.contains('pending'))return;stop.classList.add('pending');
    try{const paused=autonomyState?.control?.paused===true;const endpoint=paused?'/api/gen2/autonomy/resume':'/api/gen2/autonomy/pause';const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:paused?'{}':JSON.stringify({reason:'red-stop-button'})});if(!response.ok)throw new Error('HTTP_'+response.status);const payload=await response.json();renderActivity(payload.state||null,null)}catch(error){renderActivity(null,error?.message||'ERREUR')}finally{stop.classList.remove('pending')}
  }

  function installOperations(){
    if(document.getElementById('melOps'))return;const ops=document.createElement('div');ops.id='melOps';ops.className='mel-ops';ops.innerHTML='<button type="button" id="melEmergencyStop" class="mel-stop">STOP</button><button type="button" id="melActivityToggle" class="mel-activity-toggle"><span id="melActivityDot" class="mel-activity-dot"></span>Activité</button>';document.body.appendChild(ops);
    const panel=document.createElement('section');panel.id='melActivityPanel';panel.className='mel-activity-panel';panel.setAttribute('aria-label','Suivi des activités MEL');panel.innerHTML='<div class="mel-activity-head"><strong>Activité MEL</strong><button type="button" id="melActivityClose" class="mel-activity-close" aria-label="Fermer">×</button></div><div id="melActivityBody"><div class="mel-activity-status">Chargement…</div></div><button type="button" id="melActivityRefresh" class="mel-activity-refresh">Actualiser</button>';document.body.appendChild(panel);
    document.getElementById('melEmergencyStop').addEventListener('click',toggleAutonomy);document.getElementById('melActivityToggle').addEventListener('click',()=>{panel.classList.toggle('open');if(panel.classList.contains('open')){loadActivity();clearInterval(activityTimer);activityTimer=setInterval(loadActivity,15000)}else{clearInterval(activityTimer);activityTimer=null}});document.getElementById('melActivityClose').addEventListener('click',()=>{panel.classList.remove('open');clearInterval(activityTimer);activityTimer=null});document.getElementById('melActivityRefresh').addEventListener('click',loadActivity);loadActivity();setInterval(()=>{if(!panel.classList.contains('open'))loadActivity()},60000);
  }

  patchChatTimeout();
  const boot=()=>{installMinimalLayout();installContinueLink();syncVoiceStatus();normalizeUserLabels();installOperations()};
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
