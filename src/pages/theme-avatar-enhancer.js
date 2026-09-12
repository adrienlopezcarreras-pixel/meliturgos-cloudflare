const THEME_AVATAR_SCRIPT = `<style id="mel-theme-decor-style">
/* Theme enhancer only changes materials and the portrait; layout/menu ownership stays in mvp-interface. */
.avatar img{width:100%!important;height:100%!important;object-fit:cover!important;object-position:center 24%!important}
.avatar,.window,button,textarea,.theme-panel,#themePanel{transition:background .28s ease,border-color .28s ease,box-shadow .28s ease,color .28s ease}
/* Regression guard: the simple-layout enhancer may move the switch in the DOM, but themes must stay visibly reachable. */
html body .mel-bottom-tools .theme-switch.theme-switch{display:block!important;position:fixed!important;top:max(12px,env(safe-area-inset-top))!important;left:max(12px,env(safe-area-inset-left))!important;bottom:auto!important;z-index:120!important;width:max-content!important}
html body .mel-bottom-tools .theme-switch .theme-orb{width:auto!important;min-width:54px!important;height:48px!important;padding:0 14px!important;border-radius:999px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;font-size:20px!important;white-space:nowrap!important}
html body .mel-bottom-tools .theme-switch .theme-orb::after{content:'Thèmes';font-size:.82rem;font-weight:800;letter-spacing:.02em}
html body .mel-bottom-tools .theme-switch .theme-panel{top:56px!important;bottom:auto!important;left:0!important;width:min(300px,calc(100vw - 24px))!important;max-height:min(72vh,620px)!important}
html[data-theme="crusade"]{--bg:#24120a;--bg2:#4b2514;--text:#f6e7bd;--ink:#2d1b0f;--panel:#d9bb79;--panel2:#c7a566;--composer:rgba(244,220,160,.74);--border:#7b4d22;--accent:#8b1e1e;--accent2:#5d1111;--button:#4b2e17;--button-text:#f8e9be;--radius:8px;--font:Georgia,'Times New Roman',serif;--ornament:linear-gradient(90deg,transparent,#d6aa4e 18%,#7a1717 50%,#d6aa4e 82%,transparent)}
html[data-theme="religious"]{--bg:#19120e;--bg2:#332116;--text:#fff0cc;--ink:#342415;--panel:#eee0bd;--panel2:#d9c397;--composer:rgba(255,247,221,.84);--border:#b58b2f;--accent:#294a73;--accent2:#162e50;--button:#294a73;--button-text:#fff8df;--radius:14px;--font:Georgia,'Times New Roman',serif;--ornament:linear-gradient(90deg,transparent,#d8b85f 16%,#fff1af 31%,#b88c2f 50%,#fff1af 69%,#d8b85f 84%,transparent)}
html[data-theme="granada"]{--bg:#171411;--bg2:#423626;--text:#fff6d7;--ink:#302718;--panel:#f1e7c9;--panel2:#d9c69c;--composer:rgba(255,250,231,.86);--border:#b88929;--accent:#8a651c;--accent2:#543a10;--button:#6f4c13;--button-text:#fff5d0;--radius:9px;--font:Georgia,'Times New Roman',serif;--ornament:linear-gradient(90deg,transparent,#a8761b 10%,#ffeaa0 28%,#c79a32 50%,#ffeaa0 72%,#a8761b 90%,transparent)}
html[data-theme="aviation"]{--bg:#141017;--bg2:#33213b;--text:#f2e9dd;--ink:#181419;--panel:#c7b9a8;--panel2:#998a7c;--composer:rgba(226,216,204,.82);--border:#a37839;--accent:#6d315f;--accent2:#391a35;--button:#3e2d30;--button-text:#f5eadb;--radius:10px;--font:Inter,ui-sans-serif,system-ui,sans-serif;--ornament:linear-gradient(90deg,transparent,#b5904c 18%,#6d315f 50%,#b5904c 82%,transparent)}
html[data-theme="paladin"]{--bg:#151c27;--bg2:#36485f;--text:#fff9df;--ink:#263144;--panel:#f5f0dd;--panel2:#ddd4ba;--composer:rgba(255,252,239,.88);--border:#d0ac4b;--accent:#c39a37;--accent2:#85631c;--button:#465d7c;--button-text:#fff9e8;--radius:13px;--font:Georgia,'Times New Roman',serif;--ornament:linear-gradient(90deg,transparent,#fff1a9 13%,#c5962e 36%,#fff8d0 50%,#c5962e 64%,#fff1a9 87%,transparent)}
html[data-theme="amazon"]{--bg:#17100f;--bg2:#3a1818;--text:#f8e8c7;--ink:#2a1c16;--panel:#d5bd91;--panel2:#aa8a61;--composer:rgba(232,214,178,.84);--border:#9b6d2f;--accent:#8f2e2e;--accent2:#52201f;--button:#4a2a20;--button-text:#f9e6bd;--radius:9px;--font:Georgia,'Times New Roman',serif;--ornament:linear-gradient(90deg,transparent,#b88735 12%,#6f2422 35%,#d7b45c 50%,#6f2422 65%,#b88735 88%,transparent)}
html[data-theme="crusade"] body{background-color:#201007!important;background-image:linear-gradient(rgba(16,7,2,.34),rgba(16,7,2,.34)),repeating-linear-gradient(93deg,rgba(255,219,146,.025) 0 2px,transparent 2px 8px),radial-gradient(circle at 50% -20%,#6a351c 0,#29150c 48%,#160b06 100%)!important}
html[data-theme="religious"] body{background-color:#17100d!important;background-image:radial-gradient(ellipse at 50% 10%,rgba(255,194,93,.20),transparent 26%),radial-gradient(circle at 12% 42%,rgba(242,154,54,.10),transparent 18%),radial-gradient(circle at 88% 47%,rgba(242,154,54,.10),transparent 18%),linear-gradient(120deg,#0f0b09,#392419 46%,#17100d)!important}
html[data-theme="granada"] body{background-color:#15120f!important;background-image:linear-gradient(90deg,rgba(205,164,76,.08) 0 1px,transparent 1px 19%),radial-gradient(ellipse at 50% -7%,rgba(255,239,178,.31),transparent 30%),linear-gradient(115deg,#15120f,#453724 50%,#15120f)!important}
html[data-theme="aviation"] body{background-color:#141017!important;background-image:radial-gradient(circle at 78% 12%,rgba(240,167,91,.18),transparent 23%),repeating-linear-gradient(90deg,rgba(181,144,76,.035) 0 1px,transparent 1px 42px),linear-gradient(135deg,#11151a,#3a203f 52%,#1c1418)!important}
html[data-theme="paladin"] body{background-color:#151c27!important;background-image:radial-gradient(ellipse at 50% 0,rgba(255,243,185,.30),transparent 32%),linear-gradient(115deg,rgba(255,255,255,.04),transparent 35%),linear-gradient(135deg,#121925,#425671 52%,#171d27)!important}
html[data-theme="amazon"] body{background-color:#17100f!important;background-image:radial-gradient(circle at 78% 8%,rgba(255,234,157,.18),transparent 18%),linear-gradient(116deg,transparent 0 58%,rgba(229,213,171,.08) 59%,transparent 60%),radial-gradient(ellipse at 50% -8%,#5b2b29 0,#291619 43%,#100c0d 92%)!important}
html[data-theme="crusade"] .avatar{border:5px double #d5ad55!important;box-shadow:0 0 0 5px #5a1b16,0 20px 55px #000!important}
html[data-theme="religious"] .avatar{border:5px double #d9b95d!important;box-shadow:0 0 0 5px #352112,0 0 0 8px #b18a42,0 20px 65px #000!important}
html[data-theme="granada"] .avatar{border:6px double #e4c266!important;box-shadow:0 0 0 4px #f7ecc8,0 0 0 8px #795618,0 22px 70px #000!important}
html[data-theme="aviation"] .avatar{border:5px solid #a37a3b!important;box-shadow:0 0 0 3px #34262a,0 0 0 7px #6b315d,0 22px 60px #000!important}html[data-theme="aviation"] .avatar img{object-position:center 23%!important}
html[data-theme="paladin"] .avatar{border:5px double #efd986!important;box-shadow:0 0 0 4px #f7f2db,0 0 0 8px #6c819d,0 0 36px rgba(255,232,141,.34)!important}
html[data-theme="amazon"] .avatar{border:5px double #c79a47!important;box-shadow:0 0 0 4px #552422,0 0 0 8px #241412,0 22px 66px #000!important}html[data-theme="amazon"] .avatar img{object-position:center 22%!important}
html[data-theme="crusade"] .window{border:5px double #775023!important;box-shadow:0 0 0 3px #b78a42,0 0 0 8px #3a1b0d,0 25px 80px #000!important}
html[data-theme="religious"] .window{border:5px double #b88b35!important;box-shadow:0 0 0 3px #ead9a4,0 0 0 8px #362316,0 25px 85px #000!important}
html[data-theme="granada"] .window{border:6px double #bd8f2f!important;box-shadow:0 0 0 3px #fff0b2,0 0 0 9px #624715,0 25px 90px #000!important}
html[data-theme="aviation"] .window{border:4px double #92703c!important;box-shadow:0 0 0 3px #3c3031,0 0 0 7px #271a25,0 24px 78px #000!important}
html[data-theme="paladin"] .window{border:5px double #d1ab48!important;box-shadow:0 0 0 3px #fff9df,0 0 0 8px #536a87,0 0 46px rgba(255,236,163,.22)!important}
html[data-theme="amazon"] .window{border:5px double #966b31!important;box-shadow:0 0 0 3px #c39a53,0 0 0 8px #351917,0 25px 85px #000!important}
@media(max-width:700px){.theme-panel,#themePanel{max-height:70vh;overflow:auto}.avatar img{object-position:center 22%!important}html body .mel-bottom-tools .theme-switch.theme-switch{top:max(8px,env(safe-area-inset-top))!important;left:max(8px,env(safe-area-inset-left))!important}html body .mel-bottom-tools .theme-switch .theme-orb{height:44px!important;padding:0 11px!important}html body .mel-bottom-tools .theme-switch .theme-orb::after{font-size:.76rem}}
@media(prefers-reduced-motion:reduce){.avatar,.window,button,textarea{transition:none!important;animation:none!important}}
</style><script id="mel-theme-avatar-runtime">
(function(){
  const THEMES=['classic','crusade','religious','granada','aviation','paladin','amazon'];
  const AVATAR_REV='20260912-r2';
  const versioned=path=>path+'?v='+AVATAR_REV;
  const avatars={classic:versioned('/assets/avatars/mel-classic.webp'),crusade:versioned('/assets/avatars/mel-crusade.webp'),religious:versioned('/assets/avatars/mel-religious-andalusian.webp'),granada:versioned('/assets/avatars/mel-granada.webp'),aviation:versioned('/assets/avatars/mel-aviation-1940s.webp'),paladin:versioned('/assets/avatars/mel-paladin-light-full-plate.webp'),amazon:versioned('/assets/avatars/mel-amazon-griffon.webp')};
  function normalize(value){return THEMES.includes(String(value||''))?String(value):'classic'}
  function theme(){return normalize(document.documentElement.dataset.theme)}
  function sync(){
    const value=theme();
    const img=document.querySelector('.avatar img');
    if(img&&img.getAttribute('src')!==avatars[value])img.setAttribute('src',avatars[value]);
    document.querySelectorAll('[data-theme-choice]').forEach(btn=>btn.classList.toggle('active',btn.dataset.themeChoice===value));
  }
  function normalizeComposer(){const area=document.querySelector('textarea');if(area){area.maxLength=100000;area.setAttribute('maxlength','100000')}}
  function init(){
    normalizeComposer();
    sync();
    new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  }
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
