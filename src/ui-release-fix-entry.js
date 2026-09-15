import app from './ui-entry.js';
import { HD_BACKGROUNDS } from './assets/generated/hd-backgrounds.js';
import { runAutonomyRuntimeTick } from './evolution/autonomy-runtime.js';
import { audit } from './audit/audit-service.js';

const AVATAR_URL = '/assets/avatars/mel-full.webp?v=20260915-r2';
const AVATAR_FALLBACK = '/meliturgos-avatar-fille.png?v=20260915-r2';

function withBody(html, fragment) {
  return html.includes('</body>') ? html.replace('</body>', `${fragment}</body>`) : html + fragment;
}

function withHead(html, fragment) {
  return html.includes('</head>') ? html.replace('</head>', `${fragment}</head>`) : fragment + html;
}

const CACHE_REFRESH = `<script id="mel-release-cache-refresh">
(()=>{
  try{
    if('serviceWorker' in navigator){
      navigator.serviceWorker.getRegistration().then(reg=>{if(reg){reg.update().catch(()=>{});reg.waiting?.postMessage('SKIP_WAITING')}}).catch(()=>{});
      navigator.serviceWorker.addEventListener('controllerchange',()=>{try{sessionStorage.setItem('mel.sw.updated','1')}catch{}},{once:true});
    }
    if('caches' in window)caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).catch(()=>{});
  }catch{}
})();
</script>`;

const NORMAL_HD_STYLE = `<style id="mel-new-hd-scenes">
html[data-theme="classic"]{--mel-hd-bg:url("${HD_BACKGROUNDS.classic}")!important}
html[data-theme="crusade"]{--mel-hd-bg:url("${HD_BACKGROUNDS.crusade}")!important}
html[data-theme="religious"]{--mel-hd-bg:url("${HD_BACKGROUNDS.religious}")!important}
html[data-theme="granada"]{--mel-hd-bg:url("${HD_BACKGROUNDS.granada}")!important}
html[data-theme="aviation"]{--mel-hd-bg:url("${HD_BACKGROUNDS.aviation}")!important}
html[data-theme="paladin"]{--mel-hd-bg:url("${HD_BACKGROUNDS.paladin}")!important}
html[data-theme="amazon"]{--mel-hd-bg:url("${HD_BACKGROUNDS.amazon}")!important}
html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
html body{background-image:linear-gradient(180deg,rgba(2,6,16,.08),rgba(2,6,16,.20) 48%,rgba(2,6,16,.38)),var(--mel-hd-bg)!important;background-size:cover,cover!important;background-position:center,var(--mel-hd-pos,center)!important;background-repeat:no-repeat!important;background-attachment:fixed!important}
.window{background:linear-gradient(180deg,color-mix(in srgb,var(--panel) 88%,transparent),color-mix(in srgb,var(--panel2) 88%,transparent))!important;backdrop-filter:blur(5px)}
.app,.window,.composer,#messages,textarea{max-width:100%!important}
@media(max-width:700px){html body{background-attachment:scroll!important}.app{width:100%!important}.window{width:100%!important}.composer{overflow:hidden!important}}
</style>`;

const FULL_STYLE = `<style id="mel-full-release-fix">
html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
html body{background-image:linear-gradient(180deg,rgba(2,7,18,.28),rgba(2,8,18,.52)),url("${HD_BACKGROUNDS.control}")!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important;background-attachment:fixed!important}
.sidebar{background:rgba(3,9,18,.76)!important}.card{background:linear-gradient(180deg,rgba(20,32,52,.90),rgba(8,18,34,.84))!important;backdrop-filter:blur(12px)}
.brand img,.hero img{display:block!important;object-fit:cover!important;object-position:center 23%!important;background-image:url("${AVATAR_URL}")!important;background-size:cover!important;background-position:center 23%!important;background-color:#07111f!important}
.mel-live-explanation{margin-top:7px;color:#dbeafe;line-height:1.45;font-size:.92rem}.mel-live-narrative{margin:0 0 12px;padding:12px 14px;border:1px solid rgba(96,165,250,.20);border-radius:14px;background:rgba(4,15,30,.62);color:#e0f2fe;line-height:1.45}.mel-live-narrative strong{color:#7dd3fc}
@media(max-width:1200px){html body{background-attachment:scroll!important}.shell{display:block!important}.sidebar{position:fixed!important;z-index:100!important;left:0!important;right:0!important;top:auto!important;bottom:0!important;width:100%!important;height:auto!important;border-right:0!important;border-top:1px solid var(--line)!important;padding:7px 7px calc(7px + env(safe-area-inset-bottom))!important}.main{margin-left:0!important;width:100%!important;padding:18px 11px calc(104px + env(safe-area-inset-bottom))!important}.brand,.home{display:none!important}.nav{display:flex!important;overflow-x:auto!important;gap:4px!important}.nav button{min-width:84px!important;flex:0 0 auto!important;flex-direction:column!important;text-align:center!important;font-size:.70rem!important;padding:7px!important}.top{width:100%!important}.card,.card.third,.card.wide{grid-column:1/-1!important}.hero{grid-template-columns:82px minmax(0,1fr)!important}.hero img{width:82px!important;height:82px!important}}
</style>`;

const FULL_SCRIPT = `<script id="mel-full-release-runtime">
(()=>{
 const AV=${JSON.stringify(AVATAR_URL)},FALLBACK=${JSON.stringify(AVATAR_FALLBACK)};
 const descriptions={
   QUEUED:'Cette tâche est en file. Si elle est ancienne et obsolète, MEL la retire automatiquement de la file active en conservant une trace archivée. Sinon elle sera prise au prochain cycle exécutable.',
   CLAIMED:'MEL a pris cette tâche en charge et exécute actuellement son étape active.',
   COUNCIL_COMPLETE:'Les consultations prévues sont terminées. MEL assemble les résultats avant le contrôle suivant.',
   WAITING_TEACHER:'La demande a été transmise au Teacher. MEL continue les travaux compatibles pendant l’attente et réconcilie la réponse à chaque passage.',
   TEACHER_APPROVED:'Le plan a été validé. MEL peut poursuivre l’implémentation sur la candidate.',
   READY_FOR_REVIEW:'Le code candidat est prêt. MEL vérifie les preuves de CI et de completion à chaque passage sans bloquer la file.',
   COMPLETED:'Cette tâche est terminée et dispose d’une preuve de completion corrélée.',
   CANCELLED:'Ancienne demande retirée de la file active car elle a été identifiée comme obsolète ou remplacée. La trace reste conservée.',
   FAILED:'Cette tâche a rencontré une erreur réelle. Elle doit être diagnostiquée ou relancée avant d’être considérée comme terminée.'
 };
 function forceAvatar(){document.querySelectorAll('.brand img,.hero img').forEach(img=>{if(img.getAttribute('src')!==AV)img.setAttribute('src',AV);img.onerror=()=>{if(img.getAttribute('src')!==FALLBACK)img.setAttribute('src',FALLBACK)}})}
 function descriptionFor(entry){const text=String(entry?.textContent||'').toUpperCase();return Object.entries(descriptions).find(([key])=>text.includes(key))?.[1]||'MEL suit cette tâche et affichera ici son prochain changement d’état vérifiable.'}
 function enrichLive(){
   const log=document.getElementById('melLiveLog');
   if(log)log.querySelectorAll('.mel-live-entry').forEach(entry=>{if(entry.querySelector('.mel-live-explanation'))return;const p=document.createElement('div');p.className='mel-live-explanation';p.textContent=descriptionFor(entry);entry.appendChild(p)});
   const sec=document.querySelector('[data-panel="live"]');
   const grid=sec?.querySelector('.mel-live-grid');
   if(grid&&!document.getElementById('melLiveNarrative')){const n=document.createElement('div');n.id='melLiveNarrative';n.className='mel-live-narrative';n.style.gridColumn='1 / -1';n.innerHTML='<strong>Lecture en clair :</strong> à chaque passage de MEL, la file est nettoyée des anciennes demandes confirmées obsolètes, les réponses Teacher et les preuves CI sont réconciliées, puis le prochain travail exécutable est repris. Rien n’est effacé sans trace.';grid.insertBefore(n,grid.firstChild)}
   const road=document.getElementById('melLiveRoadmap');
   if(road&&!road.querySelector('.mel-road-explanation')){const t=String(road.textContent||'').toUpperCase();const key=Object.keys(descriptions).find(k=>t.includes(k));if(key){const p=document.createElement('div');p.className='mel-live-explanation mel-road-explanation';p.textContent=descriptions[key];road.appendChild(p)}}
 }
 function apply(){forceAvatar();enrichLive()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
 new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
 setInterval(apply,2500);
})();
</script>`;

async function enhance(response, pathname) {
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  let html = await response.text();
  if (pathname === '/professor') {
    html = html.replaceAll('src="/meliturgos-avatar-fille.png"', `src="${AVATAR_URL}"`);
    html = html.replaceAll('src="/assets/meliturgos-avatar-femme.png"', `src="${AVATAR_URL}"`);
    html = html.replaceAll('src="/assets/mel-full-person.png"', `src="${AVATAR_URL}"`);
    html = html.replaceAll('src="/assets/avatars/mel-full.webp"', `src="${AVATAR_URL}"`);
    html = html.replace(/src="data:image\/webp;base64,[^"]+"/g, `src="${AVATAR_URL}"`);
    html = withHead(html, FULL_STYLE);
    html = withBody(html, FULL_SCRIPT + CACHE_REFRESH);
  } else if (pathname === '/' || pathname === '/mvp') {
    html = withHead(html, NORMAL_HD_STYLE);
    html = withBody(html, CACHE_REFRESH);
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-store, no-cache, must-revalidate');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function scheduledTick(controller, env) {
  try {
    const result = await runAutonomyRuntimeTick(env);
    await audit(env.DB, 'mel.autonomy.tick', null, {
      cron: controller?.cron || '* * * * *',
      status: result?.status || 'OK',
      job: result?.job || null,
      next: result?.next || null,
      queue_hygiene: result?.queue_hygiene || null,
      passive_recovery: result?.passive_recovery || null,
      internal_teacher_mirror: result?.internal_teacher_mirror || null,
      owner_chat_teacher_mirror: result?.owner_chat_teacher_mirror || null,
      owner_max_applied: result?.owner_max_applied === true,
    });
    return result;
  } catch (error) {
    await audit(env.DB, 'mel.autonomy.tick.error', null, {
      cron: controller?.cron || '* * * * *',
      code: error?.code || error?.message || 'AUTONOMY_TICK_FAILED',
    });
    throw error;
  }
}

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    if (request.method !== 'GET') return response;
    return enhance(response, new URL(request.url).pathname);
  },
  async scheduled(controller, env, ctx) {
    const work = scheduledTick(controller, env);
    if (ctx?.waitUntil) ctx.waitUntil(work);
    else return work;
  },
};
