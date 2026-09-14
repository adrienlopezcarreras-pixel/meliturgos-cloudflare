import app from './ui-entry.js';
import fullAvatar from './assets/generated/full-avatar.js';
import { HD_BACKGROUNDS } from './assets/generated/hd-backgrounds.js';

const AVATAR = `data:image/webp;base64,${fullAvatar}`;

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
    if('caches' in window)caches.keys().then(keys=>Promise.all(keys.filter(k=>k!=='meliturgos-gen2-v4').map(k=>caches.delete(k)))).catch(()=>{});
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
html body{background-image:linear-gradient(180deg,rgba(2,6,16,.16),rgba(2,6,16,.38) 48%,rgba(2,6,16,.64)),var(--mel-hd-bg)!important;background-size:cover,cover!important;background-position:center,var(--mel-hd-pos,center)!important;background-repeat:no-repeat!important;background-attachment:fixed!important}
@media(max-width:700px){html body{background-attachment:scroll!important}}
</style>`;

const FULL_STYLE = `<style id="mel-full-release-fix">
html body{background-image:linear-gradient(180deg,rgba(2,7,18,.38),rgba(2,8,18,.64)),url("${HD_BACKGROUNDS.control}")!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important;background-attachment:fixed!important}
.sidebar{background:rgba(3,9,18,.76)!important}.card{background:linear-gradient(180deg,rgba(20,32,52,.90),rgba(8,18,34,.84))!important;backdrop-filter:blur(12px)}
.brand img,.hero img{display:block!important;object-fit:cover!important;object-position:center 23%!important;background-image:url("${AVATAR}")!important;background-size:cover!important;background-position:center 23%!important;background-color:#07111f!important}
.mel-live-explanation{margin-top:7px;color:#dbeafe;line-height:1.45;font-size:.92rem}.mel-live-narrative{margin:0 0 12px;padding:12px 14px;border:1px solid rgba(96,165,250,.20);border-radius:14px;background:rgba(4,15,30,.62);color:#e0f2fe;line-height:1.45}.mel-live-narrative strong{color:#7dd3fc}
@media(max-width:960px){html body{background-attachment:scroll!important}.sidebar{position:fixed!important;left:0!important;right:0!important;top:auto!important;bottom:0!important;width:auto!important;height:auto!important}.main{margin-left:0!important;padding-bottom:104px!important}.brand,.home{display:none!important}.nav{display:flex!important;overflow-x:auto!important}.nav button{min-width:84px!important;flex-direction:column!important;text-align:center!important;font-size:.70rem!important}}
</style>`;

const FULL_SCRIPT = `<script id="mel-full-release-runtime">
(()=>{
 const AV=${JSON.stringify(AVATAR)};
 const descriptions={
   QUEUED:'Cette tâche est enregistrée. MEL la conserve dans la file et la prendra automatiquement dès qu’un cycle d’exécution est disponible.',
   CLAIMED:'MEL a pris cette tâche en charge et exécute actuellement son étape active.',
   COUNCIL_COMPLETE:'Les consultations prévues sont terminées. MEL assemble les résultats avant le contrôle suivant.',
   WAITING_TEACHER:'La demande a été transmise au Teacher. MEL continue les travaux compatibles pendant l’attente.',
   TEACHER_APPROVED:'Le plan a été validé. MEL peut poursuivre l’implémentation sur la candidate.',
   READY_FOR_REVIEW:'Le code candidat est prêt. MEL attend ou vérifie les preuves de CI et de completion avant validation.',
   COMPLETED:'Cette tâche est terminée et dispose d’une preuve de completion corrélée.',
   FAILED:'Cette tâche a rencontré une erreur réelle. Elle doit être diagnostiquée ou relancée avant d’être considérée comme terminée.'
 };
 function forceAvatar(){document.querySelectorAll('.brand img,.hero img').forEach(img=>{if(img.src!==AV)img.src=AV;img.onerror=()=>{img.removeAttribute('src');img.style.backgroundImage='url("'+AV+'")'}})}
 function descriptionFor(entry){const text=String(entry?.textContent||'').toUpperCase();return Object.entries(descriptions).find(([key])=>text.includes(key))?.[1]||'MEL suit cette tâche et affichera ici son prochain changement d’état vérifiable.'}
 function enrichLive(){
   const log=document.getElementById('melLiveLog');
   if(log)log.querySelectorAll('.mel-live-entry').forEach(entry=>{if(entry.querySelector('.mel-live-explanation'))return;const p=document.createElement('div');p.className='mel-live-explanation';p.textContent=descriptionFor(entry);entry.appendChild(p)});
   const sec=document.querySelector('[data-panel="live"]');
   const grid=sec?.querySelector('.mel-live-grid');
   if(grid&&!document.getElementById('melLiveNarrative')){const n=document.createElement('div');n.id='melLiveNarrative';n.className='mel-live-narrative';n.style.gridColumn='1 / -1';n.innerHTML='<strong>Lecture en clair :</strong> cette fenêtre décrit ce que MEL exécute, ce qui attend et pourquoi. Les cartes ci-dessous sont mises à jour à partir de l’état réel du runtime.';grid.insertBefore(n,grid.firstChild)}
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
    html = html.replaceAll('src="/meliturgos-avatar-fille.png"', `src="${AVATAR}"`);
    html = html.replaceAll('src="/assets/meliturgos-avatar-femme.png"', `src="${AVATAR}"`);
    html = html.replaceAll('src="/assets/mel-full-person.png"', `src="${AVATAR}"`);
    html = html.replaceAll('src="/assets/avatars/mel-full.webp"', `src="${AVATAR}"`);
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

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    if (request.method !== 'GET') return response;
    return enhance(response, new URL(request.url).pathname);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};
