const MVP_BEHAVIOR_PATCH = `<style id="mel-mvp-behavior-style">
#fileInput{display:none!important}
.mel-continue-row{min-height:20px;margin:2px 2px 4px;display:flex;align-items:center}.mel-continue-link{display:none;color:#f2d98a;font-size:.82rem;font-weight:750;text-decoration:underline;text-underline-offset:3px;cursor:pointer;user-select:none}.mel-continue-link.visible{display:inline}.mel-continue-link:focus-visible{outline:2px solid #fff;outline-offset:3px;border-radius:3px}
.mel-audit{margin:0;border:1px solid var(--border);border-radius:12px;background:rgba(0,0,0,.10);overflow:hidden}.mel-audit summary{cursor:pointer;padding:10px 12px;font-weight:800;color:var(--ink);user-select:none}.mel-audit-body{padding:0 12px 12px}.mel-audit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:8px}.mel-audit-card{padding:9px;border:1px solid var(--border);border-radius:9px;background:rgba(255,255,255,.06);font-size:.8rem;color:var(--ink)}.mel-audit-card strong{display:block;font-size:.72rem;opacity:.72;margin-bottom:3px}.mel-audit-refresh{padding:7px 10px;min-height:36px;font-size:.8rem}
@media(max-width:600px){.mel-audit-grid{grid-template-columns:1fr}}
</style><script id="mel-mvp-behavior-runtime">
(function(){
  const CHAT_TIMEOUT_MS=25000;
  const CONTINUE_TEXT='Continue exactement à partir de ta dernière phrase, sans répéter ce qui précède. Termine complètement ta réponse.';
  function normalizeUserLabels(root=document){root.querySelectorAll&&root.querySelectorAll('.who').forEach(function(node){const value=String(node.textContent||'');if(/^Vous(?:\\s*·.*)?$/i.test(value))node.textContent=value.replace(/^Vous/i,'Adrien')})}
  function councilText(data){const out=[];if(data&&data.synthesis)out.push(String(data.synthesis));if(data&&Array.isArray(data.results))data.results.forEach(function(row){if(row&&row.text)out.push(String(row.provider||row.model||'IA')+' : '+String(row.text))});return out.join('\\n\\n')||String(data&&data.text||data&&data.answer||'')}
  async function zeroEuroFallback(nativeFetch,body){
    const prompt=String(body&&body.text||body&&body.message||body&&body.prompt||'').trim();if(!prompt)throw new Error('MESSAGE_REQUIRED');
    const response=await nativeFetch('/api/gen2/augmentio/fanout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:prompt,strategy:'council'})});
    const data=await response.json().catch(function(){return {}});if(!response.ok)throw new Error(data.error||data.code||('HTTP '+response.status));const text=councilText(data);if(!text)throw new Error('COUNCIL_EMPTY');
    return new Response(JSON.stringify({ok:true,text:text,provider:'zero-euro-council-fallback',augmentio_used:true,candidate_count:Array.isArray(data.results)?data.results.length:1}),{status:200,headers:{'content-type':'application/json','cache-control':'no-store'}});
  }
  function patchChatTransport(){
    const nativeFetch=window.fetch&&window.fetch.bind(window);if(!nativeFetch||window.__melBoundedChatRetry)return;window.__melBoundedChatRetry=true;
    window.fetch=async function(input,init){
      const url=typeof input==='string'?input:String(input&&input.url||'');if(!url.includes('/api/chat'))return nativeFetch(input,init);
      let body={};try{body=JSON.parse(init&&init.body||'{}')}catch{}
      const controller=new AbortController();const timer=setTimeout(function(){controller.abort()},CHAT_TIMEOUT_MS);
      if(init&&init.signal){try{init.signal.addEventListener('abort',function(){controller.abort()},{once:true})}catch{}}
      try{
        const response=await nativeFetch(input,{...(init||{}),signal:controller.signal});
        if(response.ok||![502,503,504].includes(response.status))return response;
        return await zeroEuroFallback(nativeFetch,body);
      }catch(error){
        if(error&&error.name!=='AbortError'&&error&&error.name!=='TimeoutError')throw error;
        return await zeroEuroFallback(nativeFetch,body);
      }finally{clearTimeout(timer)}
    };
  }
  function installContinueLink(){
    const input=document.getElementById('input'),send=document.getElementById('send'),messages=document.getElementById('messages');if(!input||!send||!messages||document.getElementById('melContinueLink'))return;
    const row=document.createElement('div');row.className='mel-continue-row';const link=document.createElement('span');link.id='melContinueLink';link.className='mel-continue-link';link.tabIndex=0;link.setAttribute('role','link');link.textContent='Continuer depuis la dernière phrase';row.appendChild(link);input.insertAdjacentElement('afterend',row);
    let hasMel=false;const refresh=function(){hasMel=Boolean(messages.querySelector('.msg.mel'));link.classList.toggle('visible',hasMel);normalizeUserLabels(messages)};const run=function(){if(!hasMel)return;input.value=CONTINUE_TEXT;input.dispatchEvent(new Event('input',{bubbles:true}));link.classList.remove('visible');send.click()};link.addEventListener('click',run);link.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();run()}});new MutationObserver(refresh).observe(messages,{childList:true,subtree:true,characterData:true});refresh();
  }
  function compactReadiness(data){if(!data||typeof data!=='object')return 'indisponible';if(typeof data.status==='string')return data.status;if(typeof data.ready==='boolean')return data.ready?'PRÊT':'À VÉRIFIER';if(typeof data.ok==='boolean')return data.ok?'OK':'À VÉRIFIER';return 'chargé'}
  function installAudit(){
    if(document.getElementById('melAudit'))return;
    const status=document.getElementById('status'),bottom=document.getElementById('melBottom'),full=document.getElementById('full');if(!status&&!bottom)return;
    const details=document.createElement('details');details.id='melAudit';details.className='mel-audit';details.innerHTML='<summary>Audit MEL</summary><div class="mel-audit-body"><div class="mel-audit-grid"><div class="mel-audit-card"><strong>Système</strong><span id="melAuditSystem">non chargé</span></div><div class="mel-audit-card"><strong>Mémoire</strong><span id="melAuditMemory">non chargée</span></div></div><button type="button" class="mel-audit-refresh" id="melAuditRefresh">Actualiser</button></div>';
    if(bottom&&full&&bottom.contains(full))bottom.insertBefore(details,full);else if(bottom)bottom.appendChild(details);else status.insertAdjacentElement('afterend',details);
    const refresh=async function(){const system=document.getElementById('melAuditSystem'),memory=document.getElementById('melAuditMemory');if(system)system.textContent='vérification…';if(memory)memory.textContent='vérification…';const results=await Promise.allSettled([fetch('/api/gen2/readiness?refresh=1').then(function(r){return r.json().then(function(j){if(!r.ok)throw j;return j})}),fetch('/api/memory/status').then(function(r){return r.json().then(function(j){if(!r.ok)throw j;return j})})]);const ready=results[0],mem=results[1];if(system)system.textContent=ready.status==='fulfilled'?compactReadiness(ready.value):'indisponible';if(memory){if(mem.status==='fulfilled'){const m=mem.value||{};memory.textContent=(m.memory_count??'—')+' souvenirs · '+(m.conversation_count??'—')+' conversations'}else memory.textContent='indisponible'}};
    document.getElementById('melAuditRefresh')?.addEventListener('click',refresh);details.addEventListener('toggle',function(){if(details.open&&details.dataset.loaded!=='1'){details.dataset.loaded='1';refresh()}});
  }
  function removeRedundantNormalMode(){document.getElementById('melReadingsToday')?.remove();document.getElementById('melGospelToday')?.remove();document.getElementById('melPsalmToday')?.remove()}
  patchChatTransport();const boot=function(){installContinueLink();installAudit();removeRedundantNormalMode();normalizeUserLabels()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
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
