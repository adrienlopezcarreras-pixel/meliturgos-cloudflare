const THEME_AVATAR_SCRIPT = `<style id="mel-theme-decor-style">
/* Canonical MEL home visual layer: themes + balanced responsive layout. */
.avatar img{width:100%!important;height:100%!important;object-fit:cover!important;object-position:center 24%!important}
.avatar,.window,button,textarea,.theme-panel,#themePanel{transition:background .28s ease,border-color .28s ease,box-shadow .28s ease,color .28s ease}

/* Theme selector stays reachable on desktop and mobile. */
.theme-switch,html body .mel-bottom-tools .theme-switch.theme-switch{display:block!important;position:fixed!important;top:max(12px,env(safe-area-inset-top))!important;left:max(12px,env(safe-area-inset-left))!important;bottom:auto!important;z-index:120!important;width:max-content!important}
.theme-switch .theme-orb,html body .mel-bottom-tools .theme-switch .theme-orb{width:auto!important;min-width:54px!important;height:48px!important;padding:0 14px!important;border-radius:999px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;font-size:20px!important;white-space:nowrap!important}
.theme-switch .theme-orb::after,html body .mel-bottom-tools .theme-switch .theme-orb::after{content:'Thèmes';font-size:.82rem;font-weight:800;letter-spacing:.02em}
.theme-switch .theme-panel,html body .mel-bottom-tools .theme-switch .theme-panel{top:56px!important;bottom:auto!important;left:0!important;width:min(300px,calc(100vw - 24px))!important;max-height:min(72vh,620px)!important}

html[data-theme="classic"]{--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-classic-hd-scaled.jpg');--mel-hd-pos:center center}
html[data-theme="crusade"]{--bg:#24120a;--bg2:#4b2514;--text:#f6e7bd;--ink:#2d1b0f;--muted:#654323;--soft:#493019;--panel:#d9bb79;--panel2:#c7a566;--composer:rgba(244,220,160,.82);--border:#7b4d22;--accent:#8b1e1e;--accent2:#5d1111;--button:#4b2e17;--button-text:#f8e9be;--radius:8px;--font:Georgia,'Times New Roman',serif;--ornament:linear-gradient(90deg,transparent,#d6aa4e 18%,#7a1717 50%,#d6aa4e 82%,transparent);--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-crusade-hd.jpg');--mel-hd-pos:center center}
html[data-theme="religious"]{--bg:#19120e;--bg2:#332116;--text:#fff0cc;--ink:#342415;--muted:#6b5434;--soft:#49351f;--panel:#eee0bd;--panel2:#d9c397;--composer:rgba(255,247,221,.90);--border:#b58b2f;--accent:#294a73;--accent2:#162e50;--button:#294a73;--button-text:#fff8df;--radius:14px;--font:Georgia,'Times New Roman',serif;--ornament:linear-gradient(90deg,transparent,#d8b85f 16%,#fff1af 31%,#b88c2f 50%,#fff1af 69%,#d8b85f 84%,transparent);--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-religious-hd-scaled.jpg');--mel-hd-pos:center center}
html[data-theme="granada"]{--bg:#171411;--bg2:#423626;--text:#fff6d7;--ink:#302718;--muted:#655534;--soft:#453a25;--panel:#f1e7c9;--panel2:#d9c69c;--composer:rgba(255,250,231,.92);--border:#b88929;--accent:#8a651c;--accent2:#543a10;--button:#6f4c13;--button-text:#fff5d0;--radius:9px;--font:Georgia,'Times New Roman',serif;--ornament:linear-gradient(90deg,transparent,#a8761b 10%,#ffeaa0 28%,#c79a32 50%,#ffeaa0 72%,#a8761b 90%,transparent);--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-granada-hd-scaled.jpg');--mel-hd-pos:center center}
html[data-theme="aviation"]{--bg:#141017;--bg2:#33213b;--text:#f2e9dd;--ink:#181419;--muted:#554a49;--soft:#30292b;--panel:#c7b9a8;--panel2:#998a7c;--composer:rgba(226,216,204,.90);--border:#a37839;--accent:#6d315f;--accent2:#391a35;--button:#3e2d30;--button-text:#f5eadb;--radius:10px;--font:Inter,ui-sans-serif,system-ui,sans-serif;--ornament:linear-gradient(90deg,transparent,#b5904c 18%,#6d315f 50%,#b5904c 82%,transparent);--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-aviation-hd-1-scaled.jpg');--mel-hd-pos:center center}
html[data-theme="paladin"]{--bg:#151c27;--bg2:#36485f;--text:#fff9df;--ink:#263144;--muted:#566077;--soft:#354158;--panel:#f5f0dd;--panel2:#ddd4ba;--composer:rgba(255,252,239,.94);--border:#d0ac4b;--accent:#9b741c;--accent2:#6d5118;--button:#465d7c;--button-text:#fff9e8;--radius:13px;--font:Georgia,'Times New Roman',serif;--ornament:linear-gradient(90deg,transparent,#fff1a9 13%,#c5962e 36%,#fff8d0 50%,#c5962e 64%,#fff1a9 87%,transparent);--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-paladin-hd-scaled.jpg');--mel-hd-pos:center center}
html[data-theme="amazon"]{--bg:#17100f;--bg2:#3a1818;--text:#f8e8c7;--ink:#2a1c16;--muted:#654534;--soft:#3f2b22;--panel:#d5bd91;--panel2:#aa8a61;--composer:rgba(232,214,178,.90);--border:#9b6d2f;--accent:#8f2e2e;--accent2:#52201f;--button:#4a2a20;--button-text:#f9e6bd;--radius:9px;--font:Georgia,'Times New Roman',serif;--ornament:linear-gradient(90deg,transparent,#b88735 12%,#6f2422 35%,#d7b45c 50%,#6f2422 65%,#b88735 88%,transparent);--mel-hd-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-amazon-hd.jpg');--mel-hd-pos:center center}

/* Real full-screen backgrounds. */
html body{background-color:var(--bg)!important;background-image:linear-gradient(180deg,rgba(8,6,5,.14),rgba(8,5,3,.26) 48%,rgba(6,3,2,.48)),var(--mel-hd-bg)!important;background-size:cover,cover!important;background-position:center center,var(--mel-hd-pos,center center)!important;background-repeat:no-repeat,no-repeat!important;background-attachment:fixed,fixed!important;isolation:auto!important}
html body:before,html body:after{display:none!important;content:none!important}

/* Balanced home layout: occupy the viewport without recreating the old giant empty parchment. */
html body .app{width:min(1280px,calc(100vw - 64px))!important;max-width:1280px!important;padding-top:8px!important}
html body .avatar-wrap{margin:6px 0 12px!important}
html body .avatar-wrap:before{width:clamp(205px,18vw,260px)!important;height:clamp(205px,18vw,260px)!important}
html body .avatar{width:clamp(185px,16vw,230px)!important;height:clamp(185px,16vw,230px)!important;min-width:0!important;min-height:0!important}
html body #voiceStatus{min-height:22px!important;margin:0 0 10px!important;font-size:.94rem!important}
html body .window{width:100%!important;height:auto!important;min-height:0!important;max-height:none!important}
html body #messages{height:auto!important;min-height:clamp(240px,29vh,360px)!important;max-height:48vh!important;padding:20px 22px!important}
html body .composer{height:auto!important;min-height:0!important;padding:14px 17px 16px!important}
html body textarea{min-height:104px!important;max-height:28vh!important;color:var(--ink)!important;font-size:1rem!important;line-height:1.45!important}
html body textarea::placeholder{color:var(--muted)!important;opacity:.92!important}
html body .empty,.composer-meta,.drop,#status{color:var(--muted)!important}
html body .drop{margin-top:8px!important;padding:10px 13px!important}
html body .controls{margin-top:10px!important}
html body .msg{line-height:1.46!important}

html[data-theme="crusade"] .avatar{border:5px double #d5ad55!important;box-shadow:0 0 0 5px #5a1b16,0 18px 48px #000!important}
html[data-theme="religious"] .avatar{border:5px double #d9b95d!important;box-shadow:0 0 0 5px #352112,0 0 0 8px #b18a42,0 18px 52px #000!important}
html[data-theme="granada"] .avatar{border:6px double #e4c266!important;box-shadow:0 0 0 4px #f7ecc8,0 0 0 8px #795618,0 18px 56px #000!important}
html[data-theme="aviation"] .avatar{border:5px solid #a37a3b!important;box-shadow:0 0 0 3px #34262a,0 0 0 7px #6b315d,0 18px 50px #000!important}html[data-theme="aviation"] .avatar img{object-position:center 23%!important}
html[data-theme="paladin"] .avatar{border:5px double #efd986!important;box-shadow:0 0 0 4px #f7f2db,0 0 0 8px #6c819d,0 0 32px rgba(255,232,141,.30)!important}
html[data-theme="amazon"] .avatar{border:5px double #c79a47!important;box-shadow:0 0 0 4px #552422,0 0 0 8px #241412,0 18px 54px #000!important}html[data-theme="amazon"] .avatar img{object-position:center 22%!important}
html[data-theme="crusade"] .window{border:5px double #775023!important;box-shadow:0 0 0 3px #b78a42,0 0 0 8px #3a1b0d,0 20px 62px #000!important}
html[data-theme="religious"] .window{border:5px double #b88b35!important;box-shadow:0 0 0 3px #ead9a4,0 0 0 8px #362316,0 20px 66px #000!important}
html[data-theme="granada"] .window{border:6px double #bd8f2f!important;box-shadow:0 0 0 3px #fff0b2,0 0 0 9px #624715,0 20px 68px #000!important}
html[data-theme="aviation"] .window{border:4px double #92703c!important;box-shadow:0 0 0 3px #3c3031,0 0 0 7px #271a25,0 20px 62px #000!important}
html[data-theme="paladin"] .window{border:5px double #d1ab48!important;box-shadow:0 0 0 3px #fff9df,0 0 0 8px #536a87,0 0 38px rgba(255,236,163,.20)!important}
html[data-theme="amazon"] .window{border:5px double #966b31!important;box-shadow:0 0 0 3px #c39a53,0 0 0 8px #351917,0 20px 66px #000!important}

@media(max-width:700px){
 .theme-panel,#themePanel{max-height:70vh;overflow:auto}.avatar img{object-position:center 22%!important}html body{background-attachment:scroll,scroll!important}
 .theme-switch,html body .mel-bottom-tools .theme-switch.theme-switch{top:max(8px,env(safe-area-inset-top))!important;left:max(8px,env(safe-area-inset-left))!important}
 .theme-switch .theme-orb,html body .mel-bottom-tools .theme-switch .theme-orb{height:44px!important;padding:0 11px!important}
 .theme-switch .theme-orb::after,html body .mel-bottom-tools .theme-switch .theme-orb::after{font-size:.76rem}
 html body .app{width:100%!important;max-width:100%!important;padding-top:0!important}.avatar-wrap:before{width:178px!important;height:178px!important}
 html body .avatar{width:min(43vw,162px)!important;height:min(43vw,162px)!important;min-width:132px!important;min-height:132px!important}
 html body #messages{min-height:190px!important;max-height:38vh!important;padding:14px!important}
 html body .composer{padding:10px 11px!important}html body textarea{min-height:96px!important;max-height:30vh!important}
}
@media(max-height:760px) and (min-width:701px){
 html body .app{width:min(1080px,calc(100vw - 48px))!important}
 html body .avatar{width:158px!important;height:158px!important}.avatar-wrap:before{width:180px!important;height:180px!important}
 html body #messages{min-height:180px!important;max-height:35vh!important}html body textarea{min-height:78px!important}
}
@media(prefers-reduced-motion:reduce){.avatar,.window,button,textarea{transition:none!important;animation:none!important}}
</style><script id="mel-theme-avatar-runtime">
(function(){
  const THEMES=['classic','crusade','religious','granada','aviation','paladin','amazon'];
  const avatars={
    classic:'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-classic-v3.webp?v=20260912-r3',
    crusade:'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-crusade-v3.webp?v=20260912-r3',
    religious:'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-religious-v3.webp?v=20260912-r3',
    granada:'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-granada-v3.webp?v=20260912-r3',
    aviation:'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-aviation-v3.webp?v=20260912-r3',
    paladin:'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-paladin-v3.webp?v=20260912-r3',
    amazon:'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-amazon-v3.webp?v=20260912-r3'
  };
  function normalize(value){return THEMES.includes(String(value||''))?String(value):'classic'}
  function theme(){return normalize(document.documentElement.dataset.theme)}
  function sync(){
    const value=theme();
    const img=document.querySelector('.avatar img');
    if(img&&img.getAttribute('src')!==avatars[value])img.setAttribute('src',avatars[value]);
    document.querySelectorAll('[data-theme-choice]').forEach(btn=>btn.classList.toggle('active',btn.dataset.themeChoice===value));
  }
  function normalizeComposer(){const area=document.querySelector('textarea');if(area){area.maxLength=100000;area.setAttribute('maxlength','100000')}}
  function init(){normalizeComposer();sync();new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});}
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(resource,init){
    try{
      const path=typeof resource==='string'?resource:resource&&resource.url;
      if(path&&path.includes('/api/chat')&&init&&typeof init.body==='string'){
        const body=JSON.parse(init.body);
        if(body&&typeof body==='object'){
          body.ui_theme=theme();
          if(!body.intent_context)body.intent_context={ui_theme:theme(),surface:'mel-mvp'};
          init={...init,body:JSON.stringify(body)};
        }
      }
    }catch{}
    return nativeFetch(resource,init);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
</script>`;

export async function enhanceThemeAvatars(response) {
  if (!(response instanceof Response)) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  if (!html.includes('data-theme-choice') || !html.includes('id="avatar"')) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  if (html.includes('mel-theme-avatar-runtime')) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const body = html.includes('</body>') ? html.replace('</body>', `${THEME_AVATAR_SCRIPT}</body>`) : html + THEME_AVATAR_SCRIPT;
  const headers = new Headers(response.headers);
  headers.set('content-length', String(new TextEncoder().encode(body).length));
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}