const MVP_BEHAVIOR_PATCH = `<style id="mel-mvp-behavior-style">
.drop,#fileInput,.mel-file-tray{display:none!important}
.mel-continue-row{min-height:20px;margin:2px 2px 4px;display:flex;align-items:center}.mel-continue-link{display:none;color:#f2d98a;font-size:.82rem;font-weight:750;text-decoration:underline;text-underline-offset:3px;cursor:pointer;user-select:none}.mel-continue-link.visible{display:inline}.mel-continue-link:focus-visible{outline:2px solid #fff;outline-offset:3px;border-radius:3px}
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
  function removeRedundantNormalMode(){document.getElementById('melAudit')?.remove();document.getElementById('melReadingsToday')?.remove();document.getElementById('melGospelToday')?.remove();document.getElementById('melPsalmToday')?.remove()}
  patchChatTransport();const boot=function(){installContinueLink();removeRedundantNormalMode();normalizeUserLabels()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
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
