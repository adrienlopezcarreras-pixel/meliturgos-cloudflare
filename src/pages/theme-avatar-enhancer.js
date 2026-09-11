const THEME_AVATAR_SCRIPT = `<style id="mel-theme-decor-style">
/* MEL visual contract v5 — monumental scenes, strict readability, standard cursors only. */
#skills,#skillsBtn,#skillsPanel,.skills{display:none!important}
.window:after{content:none!important;display:none!important}
.avatar img{width:100%!important;height:100%!important;object-fit:cover!important;object-position:center 24%!important}
.avatar,.window,button,textarea,.theme-panel,#themePanel{transition:background .28s ease,border-color .28s ease,box-shadow .28s ease,color .28s ease}
html,body,body *{cursor:default!important}
:is(button,a,.avatar,[role="button"],[data-theme-choice],.drop,.theme-orb){cursor:pointer!important}
:is(textarea,input,[contenteditable="true"]){cursor:text!important}

/* Monumental background system */
body{position:relative!important;isolation:isolate;background:#08111f!important}
body:before{content:""!important;position:fixed!important;inset:0!important;width:auto!important;height:auto!important;left:0!important;top:0!important;border-radius:0!important;z-index:-3!important;opacity:1!important;filter:none!important;background:var(--mel-scene)!important;background-size:cover!important;background-position:center top!important;pointer-events:none!important}
body:after{content:""!important;position:fixed!important;inset:0!important;width:auto!important;height:auto!important;right:0!important;bottom:0!important;border-radius:0!important;z-index:-2!important;opacity:1!important;filter:none!important;background:radial-gradient(ellipse at 50% 22%,transparent 0 25%,rgba(0,0,0,.16) 52%,rgba(0,0,0,.74) 100%),linear-gradient(180deg,rgba(4,7,14,.06),rgba(4,7,14,.34) 58%,rgba(4,7,14,.72))!important;pointer-events:none!important}
.app{z-index:1}

/* Always-readable foreground */
#voiceStatus,.mel-idle-status{color:#fff7e6!important;text-shadow:0 2px 14px #000,0 1px 3px #000!important;font-weight:650!important;opacity:1!important}
.mel-idle-status{text-align:center;min-height:22px;margin:-6px 0 9px;font-size:.84rem;letter-spacing:.02em}
.window{background:rgba(250,247,237,.975)!important;color:#231b11!important;border-color:rgba(226,190,95,.92)!important;box-shadow:0 0 0 2px rgba(255,248,209,.85),0 0 0 7px rgba(74,50,18,.72),0 28px 95px rgba(0,0,0,.72)!important;backdrop-filter:blur(8px)}
#messages{color:#231b11!important}.empty{color:#635845!important;font-weight:600!important}.composer{background:rgba(255,252,242,.985)!important;border-top-color:#c9ad69!important}
textarea{color:#21190f!important;background:transparent!important;font-weight:520!important}textarea::placeholder{color:#6a604f!important;opacity:1!important}
.composer-meta,.drop,#status{color:#594f3f!important}.drop{background:#f4ecd8!important;border-color:#9d8044!important}.drop.drag{background:#ead7aa!important;border-color:#6d4d13!important}
.msg{border-color:rgba(88,63,25,.18)!important}.msg.user{background:#ead8ae!important;color:#24180b!important}.msg.mel{background:#fffaf0!important;color:#21190f!important}.who{opacity:.78!important;font-weight:700!important}
button{font-weight:700!important}.controls button:not(.primary){background:#3b465a!important;color:#fff!important;border-color:#d3ba7a!important}.controls button.primary{background:linear-gradient(135deg,#8b651c,#5b3e0e)!important;color:#fff8df!important;border-color:#e2c56f!important}
.theme-panel{background:rgba(19,17,18,.97)!important;color:#fff8e8!important;border-color:#c6a457!important}.theme-copy span{color:#d8cdb9!important}.theme-choice-v3,.theme-choice{background:rgba(255,255,255,.08)!important;color:#fff!important}

/* Scene: classic — celestial observatory */
html[data-theme="classic"]{--mel-scene:radial-gradient(ellipse at 50% 2%,rgba(121,185,255,.62) 0,rgba(53,96,171,.25) 22%,transparent 42%),linear-gradient(90deg,rgba(8,18,38,.98) 0 7%,rgba(44,76,123,.88) 7% 11%,rgba(9,19,39,.98) 11% 17%,transparent 17% 83%,rgba(9,19,39,.98) 83% 89%,rgba(44,76,123,.88) 89% 93%,rgba(8,18,38,.98) 93% 100%),repeating-linear-gradient(90deg,transparent 0 9%,rgba(138,186,235,.08) 9% 10%,transparent 10% 18%),linear-gradient(180deg,#10274b 0,#0b1730 47%,#050a14 100%)}
/* Scene: crusade — candlelit cathedral nave */
html[data-theme="crusade"]{--bg:#24120a;--bg2:#4b2514;--text:#fff0c9;--ink:#2d1b0f;--accent:#8b1e1e;--accent2:#5d1111;--button:#4b2e17;--button-text:#fff4d3;--ornament:linear-gradient(90deg,transparent,#d6aa4e 18%,#7a1717 50%,#d6aa4e 82%,transparent);--mel-scene:radial-gradient(ellipse at 50% 10%,rgba(255,210,116,.55) 0,rgba(132,72,29,.22) 24%,transparent 44%),linear-gradient(90deg,#160b07 0 6%,#6a4222 6% 9%,#241209 9% 15%,transparent 15% 85%,#241209 85% 91%,#6a4222 91% 94%,#160b07 94%),repeating-linear-gradient(90deg,transparent 0 12%,rgba(223,178,91,.12) 12% 13%,transparent 13% 24%),linear-gradient(180deg,#4c2916 0,#25120a 48%,#100806 100%)}
/* Scene: religious — baroque Andalusian sanctuary */
html[data-theme="religious"]{--bg:#19120e;--bg2:#332116;--text:#fff0cc;--ink:#342415;--accent:#294a73;--accent2:#162e50;--button:#294a73;--button-text:#fff8df;--ornament:linear-gradient(90deg,transparent,#d8b85f 16%,#fff1af 31%,#b88c2f 50%,#fff1af 69%,#d8b85f 84%,transparent);--mel-scene:radial-gradient(ellipse at 50% 17%,rgba(255,226,145,.82) 0,rgba(198,137,54,.34) 18%,transparent 36%),radial-gradient(ellipse at 18% 34%,rgba(206,98,38,.18),transparent 21%),radial-gradient(ellipse at 82% 34%,rgba(206,98,38,.18),transparent 21%),linear-gradient(90deg,#120c09 0 8%,#704928 8% 11%,#241711 11% 18%,transparent 18% 82%,#241711 82% 89%,#704928 89% 92%,#120c09 92%),repeating-linear-gradient(90deg,transparent 0 10%,rgba(255,222,151,.10) 10% 11%,transparent 11% 20%),linear-gradient(180deg,#513321 0,#251711 52%,#0e0907 100%)}
/* Scene: Granada — monumental gold cathedral */
html[data-theme="granada"]{--bg:#171411;--bg2:#423626;--text:#fff6d7;--ink:#302718;--accent:#8a651c;--accent2:#543a10;--button:#6f4c13;--button-text:#fff5d0;--ornament:linear-gradient(90deg,transparent,#a8761b 10%,#ffeaa0 28%,#c79a32 50%,#ffeaa0 72%,#a8761b 90%,transparent);--mel-scene:radial-gradient(ellipse at 50% 5%,rgba(255,247,200,.92) 0,rgba(219,174,73,.42) 18%,transparent 37%),linear-gradient(90deg,#15120e 0 5%,#b08a38 5% 8%,#2f271a 8% 14%,transparent 14% 86%,#2f271a 86% 92%,#b08a38 92% 95%,#15120e 95%),repeating-linear-gradient(90deg,transparent 0 8%,rgba(255,235,173,.13) 8% 9%,transparent 9% 16%),linear-gradient(180deg,#6f5a34 0,#342a1c 44%,#11100d 100%)}
/* Scene: aviation — monumental 1940s hangar at dusk */
html[data-theme="aviation"]{--bg:#141017;--bg2:#33213b;--text:#f7efe5;--ink:#181419;--accent:#6d315f;--accent2:#391a35;--button:#3e2d30;--button-text:#fff3e3;--ornament:linear-gradient(90deg,transparent,#b5904c 18%,#6d315f 50%,#b5904c 82%,transparent);--mel-scene:radial-gradient(ellipse at 50% 37%,rgba(255,180,100,.55) 0,rgba(101,56,102,.24) 24%,transparent 48%),linear-gradient(90deg,#0c1018 0 7%,#654b3f 7% 9%,#17151c 9% 15%,transparent 15% 85%,#17151c 85% 91%,#654b3f 91% 93%,#0c1018 93%),linear-gradient(165deg,transparent 0 48%,rgba(220,185,122,.16) 49% 50%,transparent 51%),linear-gradient(195deg,transparent 0 48%,rgba(220,185,122,.16) 49% 50%,transparent 51%),linear-gradient(180deg,#35263c 0,#241a2d 42%,#0a0c12 100%)}
/* Scene: paladin — luminous gothic throne hall */
html[data-theme="paladin"]{--bg:#151c27;--bg2:#36485f;--text:#fff9df;--ink:#263144;--accent:#c39a37;--accent2:#85631c;--button:#465d7c;--button-text:#fff9e8;--ornament:linear-gradient(90deg,transparent,#fff1a9 13%,#c5962e 36%,#fff8d0 50%,#c5962e 64%,#fff1a9 87%,transparent);--mel-scene:radial-gradient(ellipse at 50% 4%,rgba(255,249,211,.95) 0,rgba(176,207,241,.42) 20%,transparent 41%),linear-gradient(90deg,#101824 0 6%,#9caec3 6% 9%,#26374c 9% 15%,transparent 15% 85%,#26374c 85% 91%,#9caec3 91% 94%,#101824 94%),repeating-linear-gradient(90deg,transparent 0 11%,rgba(238,218,148,.13) 11% 12%,transparent 12% 22%),linear-gradient(180deg,#617895 0,#31445d 45%,#101722 100%)}
/* Scene: amazon — storm temple and ruins */
html[data-theme="amazon"]{--bg:#17100f;--bg2:#3a1818;--text:#fff0d1;--ink:#2a1c16;--accent:#8f2e2e;--accent2:#52201f;--button:#4a2a20;--button-text:#fff0cf;--ornament:linear-gradient(90deg,transparent,#b88735 12%,#6f2422 35%,#d7b45c 50%,#6f2422 65%,#b88735 88%,transparent);--mel-scene:linear-gradient(72deg,transparent 0 47%,rgba(255,244,192,.72) 48% 48.35%,transparent 49%),radial-gradient(ellipse at 68% 9%,rgba(255,225,139,.35),transparent 20%),linear-gradient(90deg,#120b0b 0 6%,#6d4e2a 6% 9%,#251315 9% 16%,transparent 16% 84%,#251315 84% 91%,#6d4e2a 91% 94%,#120b0b 94%),repeating-linear-gradient(90deg,transparent 0 13%,rgba(160,104,51,.11) 13% 14%,transparent 14% 26%),linear-gradient(180deg,#492326 0,#261519 47%,#0d090b 100%)}

html[data-theme="crusade"] .avatar{border:5px double #d5ad55!important;box-shadow:0 0 0 5px #5a1b16,0 20px 55px #000!important}
html[data-theme="religious"] .avatar{border:5px double #d9b95d!important;box-shadow:0 0 0 5px #352112,0 0 0 8px #b18a42,0 20px 65px #000!important}
html[data-theme="granada"] .avatar{border:6px double #e4c266!important;box-shadow:0 0 0 4px #f7ecc8,0 0 0 8px #795618,0 22px 70px #000!important}
html[data-theme="aviation"] .avatar{border:5px solid #a37a3b!important;box-shadow:0 0 0 3px #34262a,0 0 0 7px #6b315d,0 22px 60px #000!important}html[data-theme="aviation"] .avatar img{object-position:center 23%!important}
html[data-theme="paladin"] .avatar{border:5px double #efd986!important;box-shadow:0 0 0 4px #f7f2db,0 0 0 8px #6c819d,0 0 44px rgba(255,232,141,.42)!important}
html[data-theme="amazon"] .avatar{border:5px double #c79a47!important;box-shadow:0 0 0 4px #552422,0 0 0 8px #241412,0 22px 66px #000!important}html[data-theme="amazon"] .avatar img{object-position:center 22%!important}
.app:after{display:block;text-align:center;margin:10px auto 0;color:#fff2cf;opacity:.86;letter-spacing:.7em;font-family:Georgia,serif;pointer-events:none;text-shadow:0 2px 8px #000}
html[data-theme="crusade"] .app:after{content:'✠  ✠  ✠'}html[data-theme="religious"] .app:after{content:'❦  ✝  ❦'}html[data-theme="granada"] .app:after{content:'✦  ✠  ✦'}html[data-theme="aviation"] .app:after{content:'✦  ✈  ✦'}html[data-theme="paladin"] .app:after{content:'✦  ⚜  ✦'}html[data-theme="amazon"] .app:after{content:'⚡  ◈  ⚡'}
@media(max-width:700px){.theme-panel,#themePanel{max-height:70vh;overflow:auto}.theme-choice-v3{padding:8px 9px}.avatar img{object-position:center 22%!important}.window{box-shadow:0 0 0 2px rgba(255,248,209,.8),0 0 0 5px rgba(74,50,18,.62),0 20px 60px rgba(0,0,0,.66)!important}}
@media(prefers-reduced-motion:reduce){.avatar,.window,button,textarea{transition:none!important;animation:none!important}}
</style><script id="mel-theme-avatar-runtime">
(function(){
  const THEMES=['classic','crusade','religious','granada','aviation','paladin','amazon'];
  const avatars={classic:'/assets/avatars/mel-classic.webp',crusade:'/assets/avatars/mel-crusade.webp',religious:'/assets/avatars/mel-religious-andalusian.webp',granada:'/assets/avatars/mel-granada.webp',aviation:'/assets/avatars/mel-aviation-1940s.webp',paladin:'/assets/avatars/mel-paladin-light-full-plate.webp',amazon:'/assets/avatars/mel-amazon-griffon.webp'};
  const idle={classic:'',crusade:'MEL veille et prie en silence.',religious:'MEL demeure dans une prière paisible.',granada:'MEL demeure dans la lumière du sanctuaire.',aviation:'MEL garde le cap.',paladin:'MEL veille dans la lumière.',amazon:'MEL guette l’orage.'};
  const storage='mel.theme.v3';
  function normalize(value){return THEMES.includes(String(value||''))?String(value):'classic'}
  function theme(){return normalize(document.documentElement.dataset.theme)}
  function ensureIdle(){let node=document.querySelector('.mel-idle-status');if(node)return node;const voice=document.getElementById('voiceStatus');if(!voice)return null;node=document.createElement('div');node.className='mel-idle-status';node.setAttribute('aria-live','polite');voice.insertAdjacentElement('afterend',node);return node}
  function sync(){const value=theme();const img=document.querySelector('.avatar img');if(img&&img.getAttribute('src')!==avatars[value])img.setAttribute('src',avatars[value]);const idleNode=ensureIdle();if(idleNode)idleNode.textContent=idle[value]||'';document.querySelectorAll('[data-theme-choice]').forEach(btn=>btn.classList.toggle('active',btn.dataset.themeChoice===value))}
  function choose(value){const next=normalize(value);document.documentElement.dataset.theme=next;try{localStorage.setItem(storage,next);localStorage.setItem('mel.theme.v2',next)}catch{}sync()}
  function removeSkills(){document.getElementById('skills')?.remove();document.getElementById('skillsBtn')?.remove();document.getElementById('skillsPanel')?.remove();document.querySelectorAll('.skills').forEach(el=>el.remove())}
  function normalizeComposer(){const area=document.querySelector('textarea');if(area){area.maxLength=100000;area.setAttribute('maxlength','100000')}}
  function init(){removeSkills();normalizeComposer();let saved='';try{saved=localStorage.getItem(storage)||localStorage.getItem('mel.theme.v2')||''}catch{}choose(saved||document.documentElement.dataset.theme||'classic');new MutationObserver(()=>sync()).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']})}
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(resource,init){try{const path=typeof resource==='string'?resource:resource&&resource.url;if(path&&path.includes('/api/chat')&&init&&typeof init.body==='string'){const body=JSON.parse(init.body);if(body&&typeof body==='object'){body.ui_theme=theme();if(!body.intent_context)body.intent_context={ui_theme:theme(),surface:'mel-mvp'};init={...init,body:JSON.stringify(body)}}}}catch{}return nativeFetch(resource,init)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
</script>`;

export async function enhanceThemeAvatars(response) {
  if (!(response instanceof Response)) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('mel-theme-avatar-runtime')) return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  const body = html.includes('</body>') ? html.replace('</body>', `${THEME_AVATAR_SCRIPT}</body>`) : html + THEME_AVATAR_SCRIPT;
  const headers = new Headers(response.headers);
  headers.set('content-length', String(new TextEncoder().encode(body).length));
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}