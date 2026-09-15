import app from './ui-entry.js';
import { HD_BACKGROUNDS, HD_BACKGROUND_TONES } from './assets/generated/hd-backgrounds.js';

const FULL_AVATAR_DATA_URL = '/assets/avatars/mel-full.webp';
const FULL_CYBER_AVATAR_URL = 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-cyber-avatar-160-q55.jpg';

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
html[data-mel-bg-tone="dark"]{--mel-overlay:linear-gradient(180deg,rgba(2,6,16,.02),rgba(2,6,16,.05) 48%,rgba(2,6,16,.10));--text:#fff;--ink:#fff;--muted:#dbe4f0;--soft:#eef4fb;--panel:rgba(10,18,32,.92);--panel2:rgba(5,11,22,.96);--composer:rgba(2,6,23,.72);--border:rgba(255,255,255,.24);--button:#26364d;--button-text:#fff;--user:rgba(37,99,235,.34);--mel:rgba(8,16,30,.82)}
html[data-mel-bg-tone="light"]{color-scheme:light;--mel-overlay:linear-gradient(180deg,rgba(255,255,255,.015),rgba(255,255,255,.035) 48%,rgba(255,255,255,.07));--text:#0b1324;--ink:#0b1324;--muted:#243247;--soft:#182235;--panel:rgba(255,255,255,.94);--panel2:rgba(248,250,252,.97);--composer:rgba(255,255,255,.88);--border:rgba(15,23,42,.27);--button:#e2e8f0;--button-text:#0f172a;--user:rgba(37,99,235,.20);--mel:rgba(255,255,255,.90)}
html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
html body{background-image:var(--mel-overlay),var(--mel-hd-bg)!important;background-size:cover,cover!important;background-position:center,var(--mel-hd-pos,center)!important;background-repeat:no-repeat!important;background-attachment:fixed!important;color:var(--text)!important}
.window{background:linear-gradient(180deg,var(--panel),var(--panel2))!important;color:var(--ink)!important;backdrop-filter:blur(7px);box-shadow:0 18px 48px rgba(0,0,0,.22)!important;border-color:var(--border)!important}
.app,.window,.composer,#messages,textarea{max-width:100%!important}
.theme-panel,.theme-choice,textarea,#voiceStatus,#status,.empty,.composer-meta,.drop{color:inherit!important}
.avatar{position:relative!important;overflow:hidden!important;border-radius:50%!important;background:transparent!important;isolation:isolate!important}
.avatar img{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;max-width:100%!important;max-height:100%!important;display:block!important;object-fit:contain!important;object-position:center center!important;transform:none!important;transform-origin:center!important;background:transparent!important}
.avatar img~img{display:none!important}
@media(max-width:700px){html body{background-attachment:scroll!important}.app,.window{width:100%!important}.composer{overflow:hidden!important}.avatar img{object-position:center center!important;transform:none!important}}
</style>`;

const NORMAL_SCRIPT = `<script id="mel-normal-release-runtime">
(()=>{
 const tones=${JSON.stringify(HD_BACKGROUND_TONES)};
 const applyTone=()=>{const html=document.documentElement;const theme=String(html.dataset.theme||'classic');html.dataset.melBgTone=tones[theme]||'dark'};
 const normalizeAvatar=()=>{const avatar=document.querySelector('.avatar');if(!avatar)return;const imgs=[...avatar.querySelectorAll('img')];imgs.forEach((img,index)=>{if(index>0){img.remove();return}img.style.objectFit='contain';img.style.objectPosition='center center';img.style.transform='none';img.style.background='transparent'})};
 const apply=()=>{applyTone();normalizeAvatar()};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
 new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-theme']});
})();
</script>`;

const FULL_STYLE = `<style id="mel-full-release-fix">
html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
html body{background-image:linear-gradient(180deg,rgba(2,7,18,.24),rgba(2,8,18,.48)),url("${HD_BACKGROUNDS.control}")!important;background-size:cover,cover!important;background-position:center,center!important;background-repeat:no-repeat!important;background-attachment:fixed!important}
.sidebar{background:rgba(3,9,18,.76)!important}.card{background:linear-gradient(180deg,rgba(20,32,52,.90),rgba(8,18,34,.84))!important;backdrop-filter:blur(12px)}
.brand img,.hero img{display:block!important;object-fit:cover!important;object-position:center 28%!important;background:#07111f!important;transform:none!important;transform-origin:center!important;border-radius:50%!important;overflow:hidden!important}
.brand img{width:58px!important;height:58px!important;min-width:58px!important;min-height:58px!important;max-width:58px!important;max-height:58px!important}
.hero img{width:126px!important;height:126px!important;min-width:126px!important;min-height:126px!important;max-width:126px!important;max-height:126px!important}
.brand img~img,.hero img~img{display:none!important}
.mel-live-explanation{margin-top:7px;color:#dbeafe;line-height:1.45;font-size:.92rem}.mel-live-narrative{margin:0 0 12px;padding:12px 14px;border:1px solid rgba(96,165,250,.20);border-radius:14px;background:rgba(4,15,30,.62);color:#e0f2fe;line-height:1.45}.mel-live-narrative strong{color:#7dd3fc}
@media(max-width:1200px){html body{background-attachment:scroll!important}.shell{display:block!important}.sidebar{position:fixed!important;z-index:100!important;left:0!important;right:0!important;top:auto!important;bottom:0!important;width:100%!important;height:auto!important;border-right:0!important;border-top:1px solid var(--line)!important;padding:7px 7px calc(7px + env(safe-area-inset-bottom))!important}.main{margin-left:0!important;width:100%!important;padding:18px 11px calc(104px + env(safe-area-inset-bottom))!important}.brand,.home{display:none!important}.nav{display:flex!important;overflow-x:auto!important;gap:4px!important}.nav button{min-width:84px!important;flex:0 0 auto!important;flex-direction:column!important;text-align:center!important;font-size:.70rem!important;padding:7px!important}.top{width:100%!important}.card,.card.third,.card.wide{grid-column:1/-1!important}.hero{grid-template-columns:94px minmax(0,1fr)!important}.hero img{width:90px!important;height:90px!important;min-width:90px!important;min-height:90px!important;max-width:90px!important;max-height:90px!important}}
</style>`;

const FULL_SCRIPT = `<script id="mel-full-release-runtime">
(()=>{
 const AV=${JSON.stringify(FULL_CYBER_AVATAR_URL)};
 const descriptions={
   QUEUED:'Cette tâche est en file. MEL doit la réclamer puis exécuter son prochain état au lieu de la laisser geler la feuille de route.',
   CLAIMED:'MEL a pris cette tâche en charge et exécute son étape active.',
   COUNCIL_COMPLETE:'Les consultations prévues sont terminées. MEL assemble les résultats avant le contrôle suivant.',
   WAITING_TEACHER:'La demande est chez Teacher. MEL continue les travaux compatibles et réconcilie la réponse à chaque passage.',
   TEACHER_APPROVED:'Le plan est validé. MEL peut poursuivre l’implémentation sur la candidate.',
   READY_FOR_REVIEW:'Le code candidat est prêt. MEL vérifie CI et preuve de completion à chaque passage sans bloquer la file.',
   COMPLETED:'Cette tâche est terminée avec preuve corrélée.',
   CANCELLED:'Ancienne demande retirée de la file active car obsolète ou remplacée ; sa trace reste archivée.',
   FAILED:'Cette tâche a rencontré une erreur réelle et reste visible pour diagnostic.'
 };
 function forceAvatar(){document.querySelectorAll('.brand,.hero').forEach(container=>{let imgs=[...container.querySelectorAll('img')];if(!imgs.length){const img=document.createElement('img');img.alt='MEL';container.prepend(img);imgs=[img]}imgs.forEach((img,index)=>{if(index>0){img.remove();return}if(img.src!==AV)img.src=AV;img.alt='MEL, avatar cybernétique';img.style.objectFit='cover';img.style.objectPosition='center 28%';img.style.transform='none';img.style.background='#07111f';img.style.borderRadius='50%'})})}
 function descriptionFor(entry){const text=String(entry?.textContent||'').toUpperCase();return Object.entries(descriptions).find(([key])=>text.includes(key))?.[1]||'MEL suit cette tâche et affichera son prochain changement d’état vérifiable.'}
 function enrichLive(){
   const log=document.getElementById('melLiveLog');
   if(log)log.querySelectorAll('.mel-live-entry').forEach(entry=>{if(entry.querySelector('.mel-live-explanation'))return;const p=document.createElement('div');p.className='mel-live-explanation';p.textContent=descriptionFor(entry);entry.appendChild(p)});
   const sec=document.querySelector('[data-panel="live"]'),grid=sec?.querySelector('.mel-live-grid');
   if(grid&&!document.getElementById('melLiveNarrative')){const n=document.createElement('div');n.id='melLiveNarrative';n.className='mel-live-narrative';n.style.gridColumn='1 / -1';n.innerHTML='<strong>Lecture en clair :</strong> à chaque passage MEL, les demandes en file sont réclamées, les réponses Teacher et preuves CI sont réconciliées, puis le prochain travail exécutable reprend. Rien n’est déclaré terminé sans trace.';grid.insertBefore(n,grid.firstChild)}
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
    html = html.replaceAll('src="/meliturgos-avatar-fille.png"', `src="${FULL_CYBER_AVATAR_URL}"`);
    html = html.replaceAll('src="/assets/avatars/mel-full.webp"', `src="${FULL_CYBER_AVATAR_URL}"`);
    html = withHead(html, FULL_STYLE);
    html = withBody(html, FULL_SCRIPT + CACHE_REFRESH);
  } else if (pathname === '/' || pathname === '/mvp') {
    html = withHead(html, NORMAL_HD_STYLE);
    html = withBody(html, NORMAL_SCRIPT + CACHE_REFRESH);
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
