import app from './preview-auth-entry.js';

const NORMAL_PATHS = new Set(['/', '/mvp']);
const LEGACY_VISUAL_IDS = Object.freeze([
  'mel-owner-visual-fix',
  'mel-new-hd-scenes',
  'mel-normal-release-runtime',
  'mel-normal-page-cleanup',
  'mel-theme-decor-style',
  'mel-theme-avatar-runtime',
]);

const NORMAL_VISUALS = Object.freeze({
  classic: Object.freeze({
    label: 'Normal · Bibliothèque',
    background: 'https://verite-interdite.fr/wp-content/uploads/2026/09/13-11-02-olb-by-RalfR-03-scaled.jpg',
    avatar: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-classic-v3.webp?v=20260912-r3',
    position: 'center 22%',
  }),
  granada: Object.freeze({
    label: 'Granada · Cathédrale',
    background: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-granada-capilla-mayor-real-hd-scaled.jpg',
    avatar: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-granada-v3.webp?v=20260912-r3',
    position: 'center 22%',
  }),
  guadix: Object.freeze({
    label: 'Guadix · Virgen de Gracia',
    background: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-guadix-nuestra-senora-gracia-real-hd-scaled.jpg',
    avatar: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-religious-v3.webp?v=20260912-r3',
    position: 'center 22%',
  }),
  crusade: Object.freeze({
    label: 'Croisé · Jérusalem',
    background: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-crusade-jerusalem-citadel-real-hd-scaled.jpg',
    avatar: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-crusade-v3.webp?v=20260912-r3',
    position: 'center 22%',
  }),
  aviation: Object.freeze({
    label: 'Aviation · Années 40',
    background: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-aviation-bf109-vaernes-1940-real.jpg',
    avatar: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-aviation-v3.webp?v=20260912-r3',
    position: 'center 22%',
  }),
  diablo: Object.freeze({
    label: 'Diablo · Camp des Amazones',
    background: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-amazon-hd.jpg',
    avatar: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-amazon-v3.webp?v=20260912-r3',
    position: 'center 22%',
  }),
  paladin: Object.freeze({
    label: 'Paladin · Pandemonium',
    background: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-paladin-hd-scaled.jpg',
    avatar: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-paladin-v3.webp?v=20260912-r3',
    position: 'center 22%',
  }),
  futuristic: Object.freeze({
    label: 'Futuriste',
    background: 'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-futuristic-project-816-control-room-hd-scaled.jpg',
    avatar: '/assets/avatars/mel-full.webp',
    position: 'center 24%',
  }),
});

const NORMAL_CANONICAL_STYLE = `<style id="mel-normal-canonical-visuals">
html[data-theme="classic"]{--mel-final-bg:url('${NORMAL_VISUALS.classic.background}')}
html[data-theme="granada"]{--mel-final-bg:url('${NORMAL_VISUALS.granada.background}')}
html[data-theme="guadix"]{--mel-final-bg:url('${NORMAL_VISUALS.guadix.background}');--text:#fff0cc;--ink:#342415;--muted:#6b5434;--panel:#eee0bd;--panel2:#d9c397;--composer:rgba(255,247,221,.96);--border:#b58b2f;--accent:#294a73;--accent2:#162e50;--button:#294a73;--button-text:#fff8df;--ornament:#d9b95d}
html[data-theme="crusade"]{--mel-final-bg:url('${NORMAL_VISUALS.crusade.background}')}
html[data-theme="aviation"]{--mel-final-bg:url('${NORMAL_VISUALS.aviation.background}')}
html[data-theme="diablo"]{--mel-final-bg:url('${NORMAL_VISUALS.diablo.background}');--text:#f8e8c7;--ink:#2a1c16;--muted:#654534;--panel:#d5bd91;--panel2:#aa8a61;--composer:rgba(232,214,178,.96);--border:#9b6d2f;--accent:#8f2e2e;--accent2:#52201f;--button:#4a2a20;--button-text:#f9e6bd;--ornament:#c79a47}
html[data-theme="paladin"]{--mel-final-bg:url('${NORMAL_VISUALS.paladin.background}')}
html[data-theme="futuristic"]{--mel-final-bg:url('${NORMAL_VISUALS.futuristic.background}');--text:#e6fbff;--ink:#e6fbff;--muted:#9bcbd2;--panel:rgba(4,18,28,.92);--panel2:rgba(2,10,18,.96);--composer:rgba(3,15,24,.94);--border:#3d8793;--accent:#21c7d9;--accent2:#0d7180;--button:#123440;--button-text:#e8fdff;--ornament:#5eead4}
html body{background-image:linear-gradient(180deg,rgba(4,7,12,.08),rgba(4,7,12,.20) 52%,rgba(3,5,9,.38)),var(--mel-final-bg)!important;background-size:cover,cover!important;background-position:center,center!important;background-repeat:no-repeat,no-repeat!important;background-attachment:fixed,fixed!important}
.avatar-wrap{position:relative!important}
.avatar-wrap::before,.avatar-wrap::after,.avatar::before,.avatar::after{display:none!important;content:none!important;background:none!important}
.avatar{position:relative!important;overflow:hidden!important;border-radius:50%!important;background:transparent!important;isolation:isolate!important}
.avatar>img{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;max-width:100%!important;max-height:100%!important;display:block!important;object-fit:cover!important;object-position:var(--mel-avatar-position,center 22%)!important;transform:none!important;transform-origin:center!important;border-radius:50%!important;background:transparent!important}
.avatar>img~img{display:none!important}
@media(max-width:700px){html body{background-attachment:scroll,scroll!important}.avatar>img{transform:none!important}}
</style>`;

const NORMAL_CANONICAL_RUNTIME = `<script id="mel-normal-canonical-runtime">
(()=>{
  const themes=${JSON.stringify(NORMAL_VISUALS)};
  const legacy={religious:'guadix',amazon:'diablo'};
  const normalize=value=>{const raw=String(value||'classic');const mapped=legacy[raw]||raw;return Object.prototype.hasOwnProperty.call(themes,mapped)?mapped:'classic'};
  const root=document.documentElement;
  const panel=document.getElementById('themePanelV2');
  const trigger=document.getElementById('themeTrigger');
  const avatar=document.getElementById('melAvatar');
  const image=document.getElementById('melAvatarImage')||avatar?.querySelector('img');
  if(panel){
    panel.replaceChildren(...Object.entries(themes).map(([id,entry])=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='theme-option';
      button.dataset.melThemeChoice=id;
      button.textContent=entry.label;
      button.addEventListener('click',()=>apply(id));
      return button;
    }));
  }
  function apply(value){
    const id=normalize(value);const entry=themes[id];
    root.dataset.theme=id;
    root.style.setProperty('--mel-avatar-position',entry.position||'center 22%');
    if(image){image.src=entry.avatar;image.style.objectPosition=entry.position||'center 22%';image.style.transform='none';image.style.background='transparent'}
    if(avatar){[...avatar.querySelectorAll('img')].forEach((node,index)=>{if(index>0)node.remove()})}
    document.querySelectorAll('[data-mel-theme-choice]').forEach(node=>node.classList.toggle('active',node.dataset.melThemeChoice===id));
    try{localStorage.setItem('mel.theme.v4',id)}catch{}
    panel?.classList.remove('open');trigger?.setAttribute('aria-expanded','false');
  }
  let initial='classic';
  try{initial=localStorage.getItem('mel.theme.v4')||root.dataset.theme||'classic'}catch{initial=root.dataset.theme||'classic'}
  apply(initial);
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(resource,init)=>{
    try{
      const path=typeof resource==='string'?resource:resource?.url;
      if(path&&path.includes('/api/chat')&&init&&typeof init.body==='string'){
        const body=JSON.parse(init.body);const id=normalize(root.dataset.theme);
        if(body&&typeof body==='object'){
          body.ui_theme=id;
          body.intent_context={...(body.intent_context||{}),ui_theme:id,surface:'mel-normal'};
          init={...init,body:JSON.stringify(body)};
        }
      }
    }catch{}
    return nativeFetch(resource,init);
  };
})();
</script>`;

function stripElementById(html, id) {
  const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(html)
    .replace(new RegExp(`<style[^>]*\\bid=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/style>`, 'gi'), '')
    .replace(new RegExp(`<script[^>]*\\bid=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/script>`, 'gi'), '');
}

export function stripLegacyVisualLayers(html) {
  let output = String(html ?? '');
  for (const id of LEGACY_VISUAL_IDS) output = stripElementById(output, id);
  return output;
}

function appendBeforeBody(html, fragment) {
  return html.includes('</body>') ? html.replace('</body>', `${fragment}</body>`) : html + fragment;
}

function appendBeforeHead(html, fragment) {
  return html.includes('</head>') ? html.replace('</head>', `${fragment}</head>`) : fragment + html;
}

export async function finalizeVisualResponse(response, pathname) {
  if (!(response instanceof Response)) return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !/text\/html/i.test(type)) return response;
  let html = stripLegacyVisualLayers(await response.text());

  if (NORMAL_PATHS.has(pathname)) {
    html = html
      .replace(/<style[^>]*id=["']mel-normal-canonical-visuals["'][^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*id=["']mel-normal-canonical-runtime["'][^>]*>[\s\S]*?<\/script>/gi, '');
    html = appendBeforeHead(html, NORMAL_CANONICAL_STYLE);
    html = appendBeforeBody(html, NORMAL_CANONICAL_RUNTIME);
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    if (request.method !== 'GET') return response;
    return finalizeVisualResponse(response, new URL(request.url).pathname);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};
