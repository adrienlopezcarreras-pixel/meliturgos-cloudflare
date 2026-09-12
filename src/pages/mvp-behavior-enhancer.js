const MVP_BEHAVIOR_PATCH = `<style id="mel-mvp-behavior-style">
/* Normal mode keeps one visible attachment surface. Text/code files are read locally in the browser; media stays fail-closed until a zero-euro remote analyser is explicitly confirmed. */
.drop{display:block!important}.mel-file-tray{display:grid;gap:5px;margin-top:7px}.mel-file-item{display:flex;justify-content:space-between;gap:8px;padding:7px 9px;border:1px solid var(--border);border-radius:9px;background:rgba(255,255,255,.05);font-size:.76rem;color:var(--ink)}.mel-file-item span:last-child{color:var(--muted);text-align:right}
.mel-continue-row{min-height:20px;margin:2px 2px 4px;display:flex;align-items:center}.mel-continue-link{display:none;color:var(--accent);font-size:.82rem;font-weight:700;text-decoration:underline;text-underline-offset:3px;cursor:pointer;user-select:none}.mel-continue-link.visible{display:inline}.mel-continue-link:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}
.mel-audit{margin:10px 0 0;border:1px solid var(--border);border-radius:12px;background:rgba(0,0,0,.10);overflow:hidden}.mel-audit summary{cursor:pointer;padding:9px 11px;font-weight:800;color:var(--ink);user-select:none}.mel-audit-body{padding:0 11px 11px}.mel-audit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:8px}.mel-audit-card{padding:8px;border:1px solid var(--border);border-radius:9px;background:rgba(255,255,255,.06);font-size:.78rem;color:var(--ink)}.mel-audit-card strong{display:block;font-size:.7rem;opacity:.66;margin-bottom:3px}.mel-audit-refresh{padding:7px 10px;min-height:35px;font-size:.78rem}@media(max-width:600px){.mel-audit-grid{grid-template-columns:1fr}.mel-file-item{display:grid}}
</style><script id="mel-mvp-behavior-runtime">
(function(){
  const CHAT_TIMEOUT_MS=120000;
  const CHAT_ATTEMPTS=2;
  const RETRYABLE_STATUS=new Set([502,503,504]);
  const CONTINUE_TEXT='Continue exactement à partir de ta dernière phrase, sans répéter ce qui précède. Termine complètement ta réponse.';
  const LOCAL_FILE_MAX_BYTES=2*1024*1024;
  const LOCAL_FILE_MAX_CHARS=30000;
  const LOCAL_TOTAL_MAX_CHARS=85000;
  const TEXT_EXTENSIONS=new Set(['txt','md','markdown','csv','json','xml','html','htm','css','js','mjs','cjs','ts','tsx','jsx','yaml','yml','log','ini','toml','sql','py','java','c','h','cpp','hpp','rs','go','sh','bat','ps1']);
  function timeoutSignal(){try{return typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(CHAT_TIMEOUT_MS):undefined}catch{return undefined}}
  function patchChatTransport(){
    const nativeFetch=window.fetch&&window.fetch.bind(window);if(!nativeFetch||window.__melBoundedChatRetry)return;window.__melBoundedChatRetry=true;
    window.fetch=async function(input,init){const url=typeof input==='string'?input:String(input&&input.url||'');if(!url.includes('/api/chat'))return nativeFetch(input,init);let last=null;for(let attempt=1;attempt<=CHAT_ATTEMPTS;attempt++){const next={...(init||{})};const signal=timeoutSignal();if(signal)next.signal=signal;try{const response=await nativeFetch(input,next);if(!RETRYABLE_STATUS.has(response.status)||attempt===CHAT_ATTEMPTS)return response;last=new Error('HTTP_'+response.status)}catch(error){last=error;if(attempt===CHAT_ATTEMPTS)throw error}}throw last||new Error('CHAT_RETRY_EXHAUSTED')};
  }
  function normalizeUserLabels(root=document){root.querySelectorAll&&root.querySelectorAll('.who').forEach(function(node){const value=String(node.textContent||'');if(/^Vous(?:\\s*·.*)?$/i.test(value))node.textContent=value.replace(/^Vous/i,'Adrien')})}
  function installContinueLink(){
    const input=document.getElementById('input'),send=document.getElementById('send'),messages=document.getElementById('messages');if(!input||!send||!messages||document.getElementById('melContinueLink'))return;
    const row=document.createElement('div');row.className='mel-continue-row';const link=document.createElement('span');link.id='melContinueLink';link.className='mel-continue-link';link.tabIndex=0;link.setAttribute('role','link');link.textContent='Continuer depuis la dernière phrase';row.appendChild(link);input.insertAdjacentElement('afterend',row);
    let hasMel=false;const refresh=function(){hasMel=Boolean(messages.querySelector('.msg.mel'));link.classList.toggle('visible',hasMel);normalizeUserLabels(messages)};const run=function(){if(!hasMel)return;input.value=CONTINUE_TEXT;input.dispatchEvent(new Event('input',{bubbles:true}));link.classList.remove('visible');send.click()};link.addEventListener('click',run);link.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();run()}});new MutationObserver(refresh).observe(messages,{childList:true,subtree:true,characterData:true});refresh();
  }
  function isLocalTextFile(file){const type=String(file&&file.type||'').toLowerCase();const name=String(file&&file.name||'');const ext=(name.includes('.')?name.split('.').pop():'').toLowerCase();return type.startsWith('text/')||type==='application/json'||type==='application/javascript'||type==='application/xml'||type==='application/sql'||TEXT_EXTENSIONS.has(ext)}
  function installSafeFiles(){
    const drop=document.getElementById('drop'),fileInput=document.getElementById('fileInput'),input=document.getElementById('input'),status=document.getElementById('status');if(!drop||!fileInput||!input||!status||window.__melSafeFiles)return;window.__melSafeFiles=true;
    drop.hidden=false;drop.setAttribute('role','button');drop.setAttribute('tabindex','0');drop.setAttribute('aria-label','Joindre un fichier texte ou de code à lire localement');if(drop.firstChild&&drop.firstChild.nodeType===Node.TEXT_NODE)drop.firstChild.textContent='Glisse un fichier texte/code ici ou clique pour le choisir · lecture locale zéro-euro';
    let tray=document.getElementById('melFileTray');if(!tray){tray=document.createElement('div');tray.id='melFileTray';tray.className='mel-file-tray';drop.insertAdjacentElement('afterend',tray)}
    const showFile=function(name,label){const row=document.createElement('div');row.className='mel-file-item';const a=document.createElement('span'),b=document.createElement('span');a.textContent='📎 '+name;b.textContent=label;row.append(a,b);tray.appendChild(row)};
    const localHandler=async function(files){let added=0;for(const file of Array.from(files||[])){if(!file)continue;if(!isLocalTextFile(file)){showFile(file.name||'fichier','média non envoyé · analyse distante bloquée');status.textContent='Média non envoyé : l’analyse distante reste bloquée tant que le zéro-euro n’est pas explicitement confirmé.';continue}if(Number(file.size||0)>LOCAL_FILE_MAX_BYTES){showFile(file.name,'trop volumineux');status.textContent='Fichier trop volumineux pour la lecture locale : '+file.name;continue}try{const raw=await file.text();const remaining=Math.max(0,LOCAL_TOTAL_MAX_CHARS-added);if(!remaining){showFile(file.name,'limite locale atteinte');continue}const excerpt=String(raw||'').slice(0,Math.min(LOCAL_FILE_MAX_CHARS,remaining));added+=excerpt.length;const block='\n\n--- Fichier '+file.name+' · lecture locale zéro-euro ---\n'+excerpt+(raw.length>excerpt.length?'\n[contenu tronqué localement]':'');const room=Math.max(0,100000-input.value.length);input.value=(input.value+block.slice(0,room)).slice(0,100000);input.dispatchEvent(new Event('input',{bubbles:true}));showFile(file.name,raw.length>excerpt.length?'joint · aperçu tronqué':'joint localement');status.textContent='Fichier joint localement : '+file.name+' · ajoute ta consigne puis clique sur Envoyer.'}catch(error){showFile(file.name,'lecture impossible');status.textContent='Lecture locale impossible : '+file.name}}
      fileInput.value='';
    };
    try{handleFiles=localHandler}catch{}window.handleFiles=localHandler;
    drop.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();fileInput.click()}});
  }
  function compact(data){if(!data||typeof data!=='object')return 'indisponible';if(typeof data.status==='string')return data.status;if(typeof data.ready==='boolean')return data.ready?'PRÊT':'À VÉRIFIER';if(typeof data.ok==='boolean')return data.ok?'OK':'À VÉRIFIER';return 'chargé'}
  function installAudit(){
    const status=document.getElementById('status');if(!status||document.getElementById('melAudit'))return;const details=document.createElement('details');details.id='melAudit';details.className='mel-audit';details.innerHTML='<summary>Audit MEL</summary><div class="mel-audit-body"><div class="mel-audit-grid"><div class="mel-audit-card"><strong>Système</strong><span id="melAuditSystem">non chargé</span></div><div class="mel-audit-card"><strong>Mémoire</strong><span id="melAuditMemory">non chargée</span></div></div><button type="button" class="mel-audit-refresh" id="melAuditRefresh">Actualiser</button></div>';status.insertAdjacentElement('afterend',details);
    const refresh=async function(){const system=document.getElementById('melAuditSystem'),memory=document.getElementById('melAuditMemory');if(system)system.textContent='vérification…';if(memory)memory.textContent='vérification…';const values=await Promise.allSettled([fetch('/api/gen2/readiness?refresh=1').then(function(r){return r.json().then(function(j){if(!r.ok)throw j;return j})}),fetch('/api/memory/status').then(function(r){return r.json().then(function(j){if(!r.ok)throw j;return j})})]);if(system)system.textContent=values[0].status==='fulfilled'?compact(values[0].value):'indisponible';if(memory){if(values[1].status==='fulfilled'){const m=values[1].value||{};memory.textContent=String(m.memory_count??'—')+' souvenirs · '+String(m.conversation_count??'—')+' conversations'}else memory.textContent='indisponible'}};
    document.getElementById('melAuditRefresh').addEventListener('click',refresh);details.addEventListener('toggle',function(){if(details.open&&details.dataset.loaded!=='1'){details.dataset.loaded='1';refresh()}});
  }
  patchChatTransport();const boot=function(){installContinueLink();installSafeFiles();installAudit();normalizeUserLabels()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
</script>`;

export async function enhanceMvpBehavior(response) {
  if (!(response instanceof Response)) return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;
  const text = await response.text();
  if (!text.includes('id="input"') || text.includes('mel-mvp-behavior-runtime')) return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
  const patched = text.includes('</body>') ? text.replace('</body>', `${MVP_BEHAVIOR_PATCH}</body>`) : `${text}${MVP_BEHAVIOR_PATCH}`;
  const headers = new Headers(response.headers);headers.set('content-type', 'text/html; charset=utf-8');headers.set('cache-control', 'no-store');headers.delete('content-length');
  return new Response(patched, { status: response.status, statusText: response.statusText, headers });
}
export { MVP_BEHAVIOR_PATCH };
