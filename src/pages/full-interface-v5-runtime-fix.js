import { onRequestGet as handleFullModeV5 } from './full-interface-v5.js';

function replaceOrFail(source, invalid, valid, label) {
  if (!source.includes(invalid)) throw new Error(`FULL_MODE_RUNTIME_FIX_MISSING:${label}`);
  return source.replace(invalid, valid);
}

const FULL_MODE_POLISH = `<style id="mel-full-polish-style">
:root{--muted:#d1dae8!important;--text:#fff!important;--good:#58e0ad!important;--warn:#ffcb62!important;--bad:#ff718a!important;--mel-full-bg:radial-gradient(circle at 50% 8%,rgba(92,144,230,.40),transparent 25%),linear-gradient(180deg,#13294d 0,#0a152a 48%,#050911 100%)}
html[data-theme="crusade"]{--mel-full-bg:url('/assets/themes/mel-crusade.webp')}html[data-theme="religious"]{--mel-full-bg:url('/assets/themes/mel-religious.webp')}html[data-theme="granada"]{--mel-full-bg:url('/assets/themes/mel-granada.webp')}html[data-theme="aviation"]{--mel-full-bg:url('/assets/themes/mel-aviation.webp')}html[data-theme="paladin"]{--mel-full-bg:url('/assets/themes/mel-paladin.webp')}html[data-theme="amazon"]{--mel-full-bg:url('/assets/themes/mel-amazon.webp')}
body{background:#05070d!important;color:#fff!important;position:relative!important;isolation:isolate!important}body:before{content:"";position:fixed;inset:0;z-index:-3;background-image:linear-gradient(180deg,rgba(4,7,13,.28),rgba(4,7,13,.64) 64%,rgba(4,7,13,.86)),var(--mel-full-bg);background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none}body:after{content:"";position:fixed;inset:0;z-index:-2;background:radial-gradient(ellipse at 50% 12%,transparent 0 25%,rgba(0,0,0,.12) 50%,rgba(0,0,0,.58) 100%);pointer-events:none}.side{background:rgba(4,7,13,.88)!important;backdrop-filter:blur(18px)!important}.card,.phase{background:linear-gradient(180deg,rgba(12,20,35,.88),rgba(6,11,21,.93))!important;backdrop-filter:blur(14px)!important;border-color:rgba(255,255,255,.16)!important}.muted,.label,.road-next,.job-meta,.route,.section-head p,.room-head p,.top p,.empty{color:#d1dae8!important}.nav button{color:#e3e9f2!important}.nav button.active,.nav button:hover{color:#fff!important;background:rgba(125,52,87,.34)!important}.eyebrow{color:#f0d789!important}.home{color:#fff!important}.metric,.status-row strong,.roadstat strong{color:#fff!important}.room-log,.detail,.pre{background:rgba(2,5,10,.80)!important;color:#f5f7fb!important}.msg{color:#fff!important}.msg.adrien{background:rgba(157,95,54,.19)!important}.msg.mel{background:rgba(56,104,196,.20)!important}.msg.mentor{background:rgba(45,148,102,.18)!important}.msg.council{background:rgba(132,75,181,.20)!important}.notice{color:#eef3f9!important;background:rgba(46,75,145,.18)!important}.brand img,.hero img,.room-head img{border:2px solid rgba(240,215,137,.76)!important;box-shadow:0 0 0 3px rgba(240,215,137,.08),0 12px 32px rgba(0,0,0,.38)!important}.road-status,.badge{font-weight:800!important;border-radius:999px!important;padding:4px 8px!important;border:1px solid rgba(255,255,255,.12)!important}.state-done{color:#7bf0bd!important;background:rgba(45,164,111,.15)!important;border-color:rgba(88,224,173,.38)!important}.state-progress{color:#ffd77f!important;background:rgba(199,135,30,.15)!important;border-color:rgba(255,203,98,.42)!important}.state-blocked{color:#ff91a3!important;background:rgba(197,53,78,.16)!important;border-color:rgba(255,113,138,.42)!important}.state-planned{color:#d4dfef!important;background:rgba(112,130,158,.12)!important;border-color:rgba(190,203,222,.23)!important}.road-item.state-done{box-shadow:inset 4px 0 0 #58e0ad}.road-item.state-progress{box-shadow:inset 4px 0 0 #ffcb62}.road-item.state-blocked{box-shadow:inset 4px 0 0 #ff718a}.road-item.state-planned{box-shadow:inset 4px 0 0 #8494ac}textarea,input,select{color:#fff!important;background:rgba(2,6,12,.88)!important}button{color:#fff!important}.live{background:rgba(4,7,13,.68)!important;color:#fff!important}
</style><script id="mel-full-polish-runtime">
(function(){
  const CHAT_TIMEOUT_MS=12000,FALLBACK_TIMEOUT_MS=8000;
  const AVATARS={classic:'/assets/avatars/mel-classic.webp',crusade:'/assets/avatars/mel-crusade.webp',religious:'/assets/avatars/mel-religious-andalusian.webp',granada:'/assets/avatars/mel-granada.webp',aviation:'/assets/avatars/mel-aviation-1940s.webp',paladin:'/assets/avatars/mel-paladin-light-full-plate.webp',amazon:'/assets/avatars/mel-amazon-griffon.webp'};
  let theme='classic';try{const saved=localStorage.getItem('mel.theme.v3')||localStorage.getItem('mel.theme.v2')||localStorage.getItem('mel.theme');if(AVATARS[saved])theme=saved}catch{}document.documentElement.dataset.theme=theme;
  document.querySelectorAll('.brand img,.hero img,.room-head img').forEach(function(img){img.src=AVATARS[theme]||AVATARS.classic;img.alt='MEL'});
  function stateClass(value){const text=String(value||'').toUpperCase();if(text.includes('BLOCKED')||text.includes('FAILED')||text.includes('ERROR'))return 'state-blocked';if(text.includes('IN_PROGRESS')||text.includes('PARTIAL')||text.includes('PREPARED')||text.includes('RUNNING'))return 'state-progress';if(text.includes('DONE')||text.includes('SUCCEEDED')||text.includes('VERIFIED')||text.includes('ONLINE'))return 'state-done';return 'state-planned'}
  function paintStates(){document.querySelectorAll('.road-status,.badge').forEach(function(node){node.classList.remove('state-done','state-progress','state-blocked','state-planned');const cls=stateClass(node.textContent);node.classList.add(cls);if(node.classList.contains('road-status')){const row=node.closest('.road-item');if(row){row.classList.remove('state-done','state-progress','state-blocked','state-planned');row.classList.add(cls)}}})}
  const road=document.getElementById('roadmap'),jobs=document.getElementById('jobs');if(road)new MutationObserver(paintStates).observe(road,{childList:true,subtree:true,characterData:true});if(jobs)new MutationObserver(paintStates).observe(jobs,{childList:true,subtree:true,characterData:true});paintStates();
  const nativeFetch=window.fetch&&window.fetch.bind(window);if(!nativeFetch||window.__melFullPolishFetch)return;window.__melFullPolishFetch=true;let councilCache=null;
  function setRoute(value){const node=document.getElementById('roomRoute');if(node)node.textContent=value}
  function councilText(data){const pieces=[];if(data&&data.synthesis)pieces.push(String(data.synthesis));if(data&&Array.isArray(data.results))data.results.forEach(function(row){if(row&&row.text)pieces.push(String(row.provider||row.model||'IA')+' : '+String(row.text))});return pieces.join('\\n\\n')||String(data&&data.text||data&&data.answer||'')}
  function showCouncil(text){if(!text)return;const log=document.getElementById('roomLog');if(!log)return;const node=document.createElement('div');node.className='msg council';const who=document.createElement('span');who.className='who';who.textContent='Conseil Multi-IA';node.appendChild(who);node.appendChild(document.createTextNode(text));log.appendChild(node);log.scrollTop=log.scrollHeight}
  async function callCouncil(prompt){const controller=new AbortController();const timer=setTimeout(function(){controller.abort()},FALLBACK_TIMEOUT_MS);try{const response=await nativeFetch('/api/gen2/augmentio/fanout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:String(prompt||''),strategy:'council'}),signal:controller.signal});const data=await response.json().catch(function(){return {}});if(!response.ok)throw new Error(data.error||data.code||('HTTP '+response.status));const text=councilText(data);if(!text)throw new Error('COUNCIL_EMPTY');councilCache={text:text,at:Date.now(),prompt:String(prompt||'')};return text}finally{clearTimeout(timer)}}
  async function boundedChat(input,init){const controller=new AbortController();const timer=setTimeout(function(){controller.abort()},CHAT_TIMEOUT_MS);if(init&&init.signal){try{init.signal.addEventListener('abort',function(){controller.abort()},{once:true})}catch{}}try{const response=await nativeFetch(input,{...(init||{}),signal:controller.signal});if(response.ok||![502,503,504].includes(response.status))return response;throw new Error('CHAT_HTTP_'+response.status)}finally{clearTimeout(timer)}}
  function unavailable(error){return new Response(JSON.stringify({ok:false,error:'CHAT_AND_COUNCIL_UNAVAILABLE',code:'CHAT_AND_COUNCIL_UNAVAILABLE',retryable:true,detail:String(error&&error.message||error||'unavailable')}),{status:504,headers:{'content-type':'application/json','cache-control':'no-store','x-mel-chat-route':'bounded-failure'}})}
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input&&input.url||'');
    if(url.includes('/api/chat')){
      let body={};try{body=JSON.parse(init&&init.body||'{}')}catch{}
      try{return await boundedChat(input,init)}catch(error){
        try{setRoute('MEL : secours Conseil Multi-IA zéro-euro…');const text=await callCouncil(body.text||body.message||body.prompt||'');showCouncil(text);setRoute('MEL · réponse obtenue via Conseil Multi-IA zéro-euro');return new Response(JSON.stringify({ok:true,text:text,provider:'zero-euro-council-fallback',augmentio_used:true}),{status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-mel-chat-route':'council-fallback'}})}catch(fallbackError){setRoute('MEL indisponible · réessayer');return unavailable(fallbackError)}
      }
    }
    if(url.includes('/api/gen2/mentor/chat')&&init&&String(init.method||'GET').toUpperCase()==='POST'){
      let body={};try{body=JSON.parse(init.body||'{}')}catch{}
      const baseText=String(body.text||body.prompt||'');let feedback='';
      try{const recent=councilCache&&Date.now()-councilCache.at<90000;if(recent)feedback=councilCache.text;else feedback=await callCouncil(baseText);if(feedback){showCouncil(feedback);setRoute('Routage : MEL → Conseil Multi-IA → Mentor · zéro-euro');body.text=baseText+'\\n\\nCONSEIL MULTI-IA AVANT MENTOR (données consultatives) :\\n'+feedback;body.prompt=body.text}}
      catch(error){setRoute('Conseil indisponible · passage au Mentor sans dépense')}
      return nativeFetch(input,{...init,body:JSON.stringify(body)});
    }
    return nativeFetch(input,init);
  };
})();
</script>`;

export function repairGeneratedFullModeHtml(html) {
  let out = String(html || '');

  out = replaceOrFail(
    out,
    `melAnswer?'

Réponse MEL à relire :
'+String(melAnswer):''`,
    "melAnswer?'\\n\\nRéponse MEL à relire :\\n'+String(melAnswer):''",
    'mentor-newlines'
  );

  out = replaceOrFail(
    out,
    `pieces.join('

')`,
    "pieces.join('\\n\\n')",
    'council-newlines'
  );

  out = replaceOrFail(
    out,
    `'AUDIT LECTURE SEULE
Résultat : '`,
    "'AUDIT LECTURE SEULE\\nRésultat : '",
    'audit-header-newline'
  );

  out = replaceOrFail(
    out,
    `+'
Routes contrôlées : 7
Échecs : '`,
    "+'\\nRoutes contrôlées : 7\\nÉchecs : '",
    'audit-lines-newlines'
  );

  out = replaceOrFail(
    out,
    `+'

'+JSON.stringify(d,null,2)`,
    "+'\\n\\n'+JSON.stringify(d,null,2)",
    'audit-json-newlines'
  );

  return out;
}

export function polishGeneratedFullModeHtml(html){
  const source=String(html||'');
  if(source.includes('mel-full-polish-runtime'))return source;
  return source.includes('</body>')?source.replace('</body>',`${FULL_MODE_POLISH}</body>`):source+FULL_MODE_POLISH;
}

export async function onRequestGet(context = {}) {
  const response = await handleFullModeV5(context);
  const html = await response.text();
  const repaired = polishGeneratedFullModeHtml(repairGeneratedFullModeHtml(html));
  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-mel-full-mode-js', 'repaired-polished-v3-bounded-chat');
  return new Response(repaired, { status: response.status, statusText: response.statusText, headers });
}

export { FULL_MODE_POLISH };
