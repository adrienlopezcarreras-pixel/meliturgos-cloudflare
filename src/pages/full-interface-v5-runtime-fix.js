import { onRequestGet as handleFullModeV5 } from './full-interface-v5.js';

function replaceOrFail(source, invalid, valid, label) {
  if (!source.includes(invalid)) throw new Error(`FULL_MODE_RUNTIME_FIX_MISSING:${label}`);
  return source.replace(invalid, valid);
}

const FULL_MODE_POLISH = `<style id="mel-full-polish-style">
:root{--muted:#d6deea!important;--text:#fff!important;--good:#62e6b4!important;--warn:#ffd06b!important;--bad:#ff7890!important;--gold:#f2d58a;--wine:#7d3457;--glass:rgba(8,12,21,.78);--glass2:rgba(5,8,15,.92);--mel-full-bg:radial-gradient(circle at 50% 8%,rgba(77,122,207,.40),transparent 26%),linear-gradient(180deg,#152d52 0,#0b1932 49%,#050811 100%)}
html[data-theme="crusade"]{--mel-full-bg:url('/assets/themes/mel-crusade.webp')}html[data-theme="religious"]{--mel-full-bg:url('/assets/themes/mel-religious.webp')}html[data-theme="granada"]{--mel-full-bg:url('/assets/themes/mel-granada.webp')}html[data-theme="aviation"]{--mel-full-bg:url('/assets/themes/mel-aviation.webp')}html[data-theme="paladin"]{--mel-full-bg:url('/assets/themes/mel-paladin.webp')}html[data-theme="amazon"]{--mel-full-bg:url('/assets/themes/mel-amazon.webp')}
html,body{background:#05070c!important}body{color:#fff!important;position:relative!important;isolation:isolate!important}body:before{content:"";position:fixed;inset:0;z-index:-3;background-image:linear-gradient(180deg,rgba(2,4,9,.14),rgba(2,4,9,.50) 58%,rgba(2,4,9,.82)),var(--mel-full-bg);background-size:cover;background-position:center 28%;background-repeat:no-repeat;pointer-events:none}body:after{content:"";position:fixed;inset:0;z-index:-2;background:radial-gradient(ellipse at 50% 10%,transparent 0 25%,rgba(0,0,0,.10) 48%,rgba(0,0,0,.60) 100%);pointer-events:none}.shell{position:relative!important;z-index:1!important}.side{background:linear-gradient(180deg,rgba(4,7,13,.91),rgba(4,7,13,.84))!important;border-right:1px solid rgba(242,213,138,.16)!important;backdrop-filter:blur(20px) saturate(1.05)!important;box-shadow:14px 0 40px rgba(0,0,0,.18)!important}.brand{padding-bottom:20px!important}.brand img,.hero img,.room-head img{border:2px solid rgba(242,213,138,.74)!important;box-shadow:0 0 0 3px rgba(242,213,138,.07),0 14px 34px rgba(0,0,0,.42)!important}.brand b{color:#fff!important}.brand small{color:#d5deea!important}.nav{gap:7px!important}.nav button{color:#e2e8f1!important;border:1px solid transparent!important;border-radius:13px!important;padding:11px 12px!important;transition:background .16s ease,border-color .16s ease,transform .16s ease!important}.nav button:hover{background:rgba(255,255,255,.06)!important;border-color:rgba(255,255,255,.08)!important}.nav button.active{color:#fff!important;background:linear-gradient(135deg,rgba(125,52,87,.42),rgba(171,103,64,.26))!important;border-color:rgba(242,213,138,.24)!important;box-shadow:inset 3px 0 0 rgba(242,213,138,.78)!important}.home{color:#fff!important;background:rgba(255,255,255,.05)!important;border-color:rgba(242,213,138,.18)!important}.main{width:100%!important;max-width:1560px!important;margin:0 auto!important}.top{margin-bottom:22px!important}.top h1{color:#fff!important;letter-spacing:-.025em!important;text-shadow:0 2px 18px rgba(0,0,0,.30)!important}.top p,.muted,.label,.road-next,.job-meta,.route,.section-head p,.room-head p,.empty{color:#d6deea!important}.eyebrow{color:#f2d58a!important}.live{background:rgba(5,8,14,.62)!important;color:#fff!important;border:1px solid rgba(242,213,138,.18)!important;backdrop-filter:blur(12px)!important;box-shadow:0 8px 24px rgba(0,0,0,.20)!important}.grid{gap:14px!important}.card,.phase{background:linear-gradient(180deg,var(--glass),var(--glass2))!important;backdrop-filter:blur(17px) saturate(1.04)!important;border:1px solid rgba(255,255,255,.12)!important;box-shadow:0 22px 54px rgba(0,0,0,.30),inset 0 1px 0 rgba(255,255,255,.045)!important}.card{border-radius:20px!important;padding:17px!important}.card.hero{background:linear-gradient(135deg,rgba(14,21,35,.82),rgba(20,18,29,.82))!important;border-color:rgba(242,213,138,.20)!important}.hero-grid{gap:20px!important}.hero img{width:96px!important;height:96px!important}.hero h2{font-size:1.35rem!important}.label{font-size:.69rem!important;letter-spacing:.13em!important}.metric,.status-row strong,.roadstat strong{color:#fff!important}.metric{font-size:1.55rem!important}.status-row{border-bottom-color:rgba(255,255,255,.08)!important}.section-head{margin-bottom:14px!important}.section-head h2{color:#fff!important}.room-log,.detail,.pre{background:rgba(2,5,10,.74)!important;color:#f7f9fc!important;border-color:rgba(255,255,255,.12)!important}.room-log{border-radius:16px!important;padding:12px!important;box-shadow:inset 0 1px 18px rgba(0,0,0,.24)!important}.msg{color:#fff!important;border-color:rgba(255,255,255,.09)!important;border-radius:13px!important;padding:10px 11px!important;line-height:1.5!important}.msg.adrien{background:linear-gradient(135deg,rgba(157,95,54,.26),rgba(125,52,87,.18))!important;box-shadow:inset -3px 0 0 rgba(201,145,72,.78)!important}.msg.mel{background:linear-gradient(135deg,rgba(56,104,196,.27),rgba(255,255,255,.035))!important;box-shadow:inset 3px 0 0 rgba(242,213,138,.60)!important}.msg.mentor{background:linear-gradient(135deg,rgba(45,148,102,.24),rgba(255,255,255,.03))!important;box-shadow:inset 3px 0 0 rgba(98,230,180,.58)!important}.msg.council{background:linear-gradient(135deg,rgba(132,75,181,.26),rgba(255,255,255,.03))!important;box-shadow:inset 3px 0 0 rgba(190,137,238,.54)!important}.who{color:#f2f5fa!important;opacity:.86!important}.notice{color:#f2f5fa!important;background:rgba(37,57,99,.26)!important;border-color:rgba(131,159,225,.22)!important;border-radius:14px!important}.compose{gap:9px!important}.compose textarea{min-height:88px!important}.route{display:inline-flex!important;margin-top:9px!important;padding:5px 9px!important;border-radius:999px!important;background:rgba(255,255,255,.05)!important;border:1px solid rgba(255,255,255,.08)!important}.job{background:rgba(255,255,255,.035)!important;border-color:rgba(255,255,255,.10)!important;border-radius:14px!important}.road-head{gap:10px!important}.roadstat{background:rgba(5,8,14,.67)!important;border-color:rgba(255,255,255,.11)!important;border-radius:15px!important;padding:12px!important}.phase{border-radius:16px!important;overflow:hidden!important}.phase h3{background:rgba(255,255,255,.045)!important;color:#fff!important;padding:12px 14px!important}.road-item{border-top-color:rgba(255,255,255,.07)!important;padding:11px 13px!important;transition:background .15s ease!important}.road-item:hover{background:rgba(255,255,255,.025)!important}.road-id{color:#b9caff!important}.road-status,.badge{display:inline-flex!important;align-items:center!important;justify-content:center!important;justify-self:end!important;font-weight:850!important;border-radius:999px!important;padding:5px 9px!important;border:1px solid rgba(255,255,255,.13)!important;line-height:1.15!important}.state-done{color:#90f5c9!important;background:rgba(38,151,103,.20)!important;border-color:rgba(98,230,180,.44)!important}.state-progress{color:#ffdc8e!important;background:rgba(196,132,27,.20)!important;border-color:rgba(255,208,107,.46)!important}.state-blocked{color:#ff9caf!important;background:rgba(191,45,71,.22)!important;border-color:rgba(255,120,144,.48)!important}.state-planned{color:#dbe4ef!important;background:rgba(109,128,158,.18)!important;border-color:rgba(188,201,221,.26)!important}.road-item.state-done{box-shadow:inset 4px 0 0 #62e6b4!important;background:linear-gradient(90deg,rgba(42,137,96,.09),transparent 26%)!important}.road-item.state-progress{box-shadow:inset 4px 0 0 #ffd06b!important;background:linear-gradient(90deg,rgba(192,126,24,.09),transparent 26%)!important}.road-item.state-blocked{box-shadow:inset 4px 0 0 #ff7890!important;background:linear-gradient(90deg,rgba(187,43,67,.10),transparent 26%)!important}.road-item.state-planned{box-shadow:inset 4px 0 0 #8798b1!important}textarea,input,select{color:#fff!important;background:rgba(2,6,12,.80)!important;border-color:rgba(255,255,255,.13)!important}textarea:focus,input:focus,select:focus{border-color:rgba(242,213,138,.48)!important;box-shadow:0 0 0 3px rgba(242,213,138,.08)!important}button,.btn{color:#fff!important;border-color:rgba(255,255,255,.13)!important;background:rgba(255,255,255,.07)!important;border-radius:12px!important;transition:transform .15s ease,background .15s ease!important}button:hover,.btn:hover{transform:translateY(-1px)!important;background:rgba(255,255,255,.10)!important}button.primary{background:linear-gradient(135deg,#7d3457,#b36a45 62%,#c99148)!important;border-color:rgba(242,213,138,.30)!important;box-shadow:0 10px 26px rgba(0,0,0,.25)!important}
@media(max-width:960px){.side{background:rgba(4,7,13,.94)!important;border-top:1px solid rgba(242,213,138,.16)!important;box-shadow:0 -8px 34px rgba(0,0,0,.30)!important}.nav{gap:3px!important}.nav button{padding:6px 7px!important;min-width:76px!important}.nav button.active{box-shadow:inset 0 2px 0 rgba(242,213,138,.78)!important}.main{padding:15px 10px calc(86px + env(safe-area-inset-bottom))!important}.top{margin-bottom:14px!important}.top h1{font-size:30px!important}.card{border-radius:17px!important;padding:14px!important}.hero-grid{grid-template-columns:74px 1fr!important;gap:13px!important}.hero img{width:74px!important;height:74px!important}.road-status,.badge{justify-self:start!important}}
@media(max-width:620px){body:before{background-position:center top!important}.top{gap:8px!important}.top h1{font-size:27px!important}.live{font-size:.65rem!important;padding:6px 8px!important}.room-log{height:45vh!important;min-height:285px!important}.road-head{grid-template-columns:1fr 1fr!important}.road-item{grid-template-columns:76px 1fr!important;gap:7px!important}.road-status{grid-column:2!important;text-align:left!important}.msg.adrien,.msg.mel,.msg.mentor,.msg.council{margin-left:0!important;margin-right:0!important}.section-head{align-items:center!important}.section-head p{font-size:.78rem!important}.compose{grid-template-columns:1fr!important}.compose textarea{min-height:82px!important}}
@media(prefers-reduced-motion:reduce){button,.nav button{transition:none!important}}
</style><script id="mel-full-polish-runtime">
(function(){
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
  async function callCouncil(prompt){const response=await nativeFetch('/api/gen2/augmentio/fanout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:String(prompt||''),strategy:'council'})});const data=await response.json().catch(function(){return {}});if(!response.ok)throw new Error(data.error||data.code||('HTTP '+response.status));const text=councilText(data);if(!text)throw new Error('COUNCIL_EMPTY');councilCache={text:text,at:Date.now(),prompt:String(prompt||'')};return text}
  async function boundedChat(input,init,body){const controller=new AbortController();const timer=setTimeout(function(){controller.abort()},22000);if(init&&init.signal){try{init.signal.addEventListener('abort',function(){controller.abort()},{once:true})}catch{}}try{const response=await nativeFetch(input,{...(init||{}),signal:controller.signal});if(response.ok||![502,503,504].includes(response.status))return response;throw new Error('CHAT_HTTP_'+response.status)}finally{clearTimeout(timer)}}
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input&&input.url||'');
    if(url.includes('/api/chat')){
      let body={};try{body=JSON.parse(init&&init.body||'{}')}catch{}
      try{return await boundedChat(input,init,body)}catch(error){
        try{setRoute('MEL : secours Conseil Multi-IA zéro-euro…');const text=await callCouncil(body.text||body.message||body.prompt||'');showCouncil(text);setRoute('MEL · réponse obtenue via Conseil Multi-IA zéro-euro');return new Response(JSON.stringify({ok:true,text:text,provider:'zero-euro-council-fallback',augmentio_used:true}),{status:200,headers:{'content-type':'application/json','cache-control':'no-store'}})}catch(fallbackError){return new Response(JSON.stringify({ok:false,error:'CHAT_AND_COUNCIL_UNAVAILABLE',detail:String(fallbackError&&fallbackError.message||fallbackError)}),{status:504,headers:{'content-type':'application/json','cache-control':'no-store'}})}
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
  headers.set('x-mel-full-mode-js', 'repaired-polished-v3');
  return new Response(repaired, { status: response.status, statusText: response.statusText, headers });
}

export { FULL_MODE_POLISH };
