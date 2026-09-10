const THEME_AVATAR_SCRIPT = `<style id="mel-theme-decor-style">
/* Final themed interface layer. Decorative elements never overlap chat/input surfaces. */
#skills,#skillsPanel{display:none!important}.controls{grid-template-columns:1fr 1fr!important}.skills{display:none!important}
html[data-theme="crusade"] .window:after,html[data-theme="religious"] .window:after,html[data-theme="granada"] .window:after{content:none!important;display:none!important}
.app{position:relative!important;z-index:2}.theme-switch{z-index:60!important}.theme-ambient{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden;display:none}.theme-ambient:before,.theme-ambient:after{content:"";position:absolute;pointer-events:none}.mel-theme-shrine{display:none;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:clamp(206px,27vw,278px);height:clamp(206px,27vw,278px);pointer-events:none;z-index:0}.mel-theme-shrine:before,.mel-theme-shrine:after{content:"";position:absolute;inset:0;pointer-events:none}.avatar{z-index:1}#themeIdleCaption{display:none;text-align:center;margin:-3px 0 12px;font-size:.82rem;letter-spacing:.035em;opacity:.84;color:var(--text);text-shadow:0 1px 5px rgba(0,0,0,.55)}
html[data-theme="crusade"] .theme-ambient,html[data-theme="religious"] .theme-ambient,html[data-theme="granada"] .theme-ambient,html[data-theme="crusade"] .mel-theme-shrine,html[data-theme="religious"] .mel-theme-shrine,html[data-theme="granada"] .mel-theme-shrine,html[data-theme="crusade"] #themeIdleCaption,html[data-theme="religious"] #themeIdleCaption,html[data-theme="granada"] #themeIdleCaption{display:block}
html[data-theme="crusade"] .mel-theme-shrine,html[data-theme="religious"] .mel-theme-shrine,html[data-theme="granada"] .mel-theme-shrine{animation:melIdlePrayer 7s ease-in-out infinite}@keyframes melIdlePrayer{0%,100%{filter:brightness(.96);opacity:.88}50%{filter:brightness(1.08);opacity:1}}

/* CROISÉS / MEDIEVAL IDLE PRAYER */
html[data-theme="crusade"] body{background-color:#180c06!important;background-image:radial-gradient(circle at 50% 14%,rgba(255,191,79,.17),transparent 18%),linear-gradient(90deg,#32170d 0,#160a05 18%,#2a140a 50%,#160a05 82%,#32170d 100%),repeating-linear-gradient(90deg,rgba(226,174,84,.025) 0 2px,transparent 2px 9px)!important}
html[data-theme="crusade"] .theme-ambient:before{inset:0;background:linear-gradient(90deg,rgba(72,25,12,.82) 0 10%,transparent 13% 87%,rgba(72,25,12,.82) 90% 100%),repeating-linear-gradient(90deg,transparent 0 31px,rgba(218,167,75,.028) 32px 33px)}
html[data-theme="crusade"] .theme-ambient:after{width:72vw;height:38vh;left:14vw;top:-19vh;border-radius:0 0 48% 48%;border:2px solid rgba(199,149,62,.28);box-shadow:0 0 80px rgba(255,171,54,.12),inset 0 -25px 70px rgba(125,32,22,.12)}
html[data-theme="crusade"] .mel-theme-shrine:before{inset:3%;border-radius:52% 52% 45% 45%;border:6px double #bd9347;box-shadow:0 0 0 5px #592216,0 0 38px rgba(255,173,61,.27),inset 0 0 28px rgba(255,203,103,.14)}
html[data-theme="crusade"] .mel-theme-shrine:after{inset:-12% -30%;background:radial-gradient(ellipse at 11% 82%,rgba(255,165,54,.3),transparent 12%),radial-gradient(ellipse at 89% 82%,rgba(255,165,54,.3),transparent 12%);filter:blur(2px)}
html[data-theme="crusade"] .window{border:6px double #775023!important;box-shadow:0 0 0 3px #c29a4b,0 0 0 8px #35170b,0 28px 90px rgba(0,0,0,.78)!important}
html[data-theme="crusade"] .window:before{height:7px!important;background:linear-gradient(90deg,#5d1712,#d0a44f 12%,#7a1717 26%,#e4c06a 50%,#7a1717 74%,#d0a44f 88%,#5d1712)!important}
html[data-theme="crusade"] #messages{background-image:radial-gradient(circle at 4% 6%,rgba(122,23,23,.075),transparent 16%),radial-gradient(circle at 96% 94%,rgba(90,52,16,.075),transparent 18%)}
html[data-theme="crusade"] .composer{box-shadow:inset 0 9px 18px rgba(87,49,16,.08)}
html[data-theme="crusade"] .app:after{content:"✠  ·  ✠  ·  ✠"!important;display:block;text-align:center;color:#d4aa52;letter-spacing:.65em;margin-top:10px;text-shadow:0 1px #30140a}

/* BAROQUE ANDALOU RELIGIEUX — cueva / sanctuaire marial */
html[data-theme="religious"]{--bg:#100d0c;--bg2:#3b251b;--glow:#c79a52;--glow2:#76523c;--panel:#f3ead1;--panel2:#e6d6ac;--composer:rgba(250,242,218,.9);--border:#bd9137;--accent:#315d93;--accent2:#183a69;--button:#274d7a;--button-text:#fff8df}
html[data-theme="religious"] body{background-color:#120f0d!important;background-image:radial-gradient(ellipse at 50% 12%,rgba(255,222,151,.22),transparent 19%),radial-gradient(ellipse at 50% 0,#5a4331 0,#2f2119 31%,#19130f 65%,#0d0b0a 100%),repeating-radial-gradient(ellipse at 50% 4%,rgba(233,211,171,.034) 0 2px,transparent 3px 10px)!important}
html[data-theme="religious"] .theme-ambient:before{width:88vw;height:78vh;left:6vw;top:-15vh;border-radius:47% 47% 15% 15%/52% 52% 12% 12%;border:5px solid rgba(213,194,157,.17);box-shadow:inset 0 -60px 130px rgba(29,20,16,.7),0 0 0 13px rgba(105,79,57,.13),0 0 70px rgba(255,211,110,.11);background:repeating-radial-gradient(ellipse at 50% 8%,rgba(235,218,184,.035) 0 3px,rgba(69,48,36,.025) 4px 12px)}
html[data-theme="religious"] .theme-ambient:after{width:42vw;height:48vh;left:29vw;top:-10vh;border-radius:45% 45% 16% 16%;background:radial-gradient(ellipse at 50% 20%,rgba(255,229,158,.25),transparent 28%),linear-gradient(90deg,transparent 0 8%,rgba(202,164,81,.11) 9% 11%,transparent 12% 88%,rgba(202,164,81,.11) 89% 91%,transparent 92%);box-shadow:0 0 60px rgba(255,202,88,.13)}
html[data-theme="religious"] .mel-theme-shrine:before{inset:-5% -7%;border-radius:50% 50% 43% 43%/38% 38% 57% 57%;border:8px double #d4b25c;box-shadow:0 0 0 8px rgba(109,82,55,.72),0 0 0 13px rgba(201,180,142,.25),0 0 55px rgba(255,210,105,.34),inset 0 0 34px rgba(255,238,188,.24)}
html[data-theme="religious"] .mel-theme-shrine:after{inset:-21% -38% -15%;background:radial-gradient(ellipse at 8% 78%,rgba(255,183,66,.3),transparent 9%),radial-gradient(ellipse at 92% 78%,rgba(255,183,66,.3),transparent 9%),linear-gradient(90deg,transparent 0 8%,rgba(215,190,145,.08) 9% 11%,transparent 12% 88%,rgba(215,190,145,.08) 89% 91%,transparent 92%)}
html[data-theme="religious"] .window{border:5px double #c5a04a!important;box-shadow:0 0 0 3px #f7ebbd,0 0 0 8px #6a4b30,0 28px 90px rgba(0,0,0,.72)!important}
html[data-theme="religious"] .window:before{height:8px!important;background:linear-gradient(90deg,#6b4a2d,#d6b75c 14%,#f6e7aa 32%,#b78b31 50%,#f6e7aa 68%,#d6b75c 86%,#6b4a2d)!important}
html[data-theme="religious"] #messages{background-image:radial-gradient(circle at 50% -15%,rgba(255,221,132,.13),transparent 33%)}
html[data-theme="religious"] .app:after{content:"❦  IHS  ❦"!important;display:block;text-align:center;color:#e2c477;letter-spacing:.45em;margin-top:10px;text-shadow:0 2px 8px #000}

/* CATHÉDRALE DE GRENADE — pierre ivoire et grand retable doré */
html[data-theme="granada"]{color-scheme:light;--bg:#15120d;--bg2:#55452e;--glow:#d1ae57;--glow2:#9d7d34;--text:#fff6d6;--ink:#3a2a16;--muted:#73603b;--soft:#6a5737;--panel:#f7efd4;--panel2:#e8d39d;--composer:rgba(255,249,226,.93);--border:#b88927;--accent:#8b6518;--accent2:#5f420e;--user:#8b6518;--mel:rgba(255,255,255,.78);--button:#6c4b14;--button-text:#fff5d4;--radius:10px;--font:Georgia,'Times New Roman',serif;--ornament:linear-gradient(90deg,transparent,#b88a27 10%,#f7dd84 28%,#8b6518 50%,#f7dd84 72%,#b88a27 90%,transparent);--paper:radial-gradient(circle at 50% 0,rgba(255,244,199,.24),transparent 35%)}
html[data-theme="granada"] body{background-color:#17130d!important;background-image:radial-gradient(ellipse at 50% 7%,rgba(255,224,126,.23),transparent 24%),linear-gradient(#51422f,#211a12 70%,#17130d)!important}
html[data-theme="granada"] .theme-ambient:before{inset:0;background:repeating-linear-gradient(90deg,rgba(33,27,19,.9) 0 8%,rgba(234,224,196,.12) 8.5% 9.2%,transparent 9.5% 19%,rgba(229,216,181,.08) 19.5% 20.2%,transparent 20.5% 79.5%,rgba(229,216,181,.08) 79.8% 80.5%,transparent 81% 90.5%,rgba(234,224,196,.12) 90.8% 91.5%,rgba(33,27,19,.9) 92% 100%)}
html[data-theme="granada"] .theme-ambient:after{width:48vw;height:64vh;left:26vw;top:-14vh;border-radius:48% 48% 12% 12%/30% 30% 10% 10%;border:7px double rgba(220,181,78,.35);background:linear-gradient(90deg,rgba(126,87,22,.14),rgba(255,233,163,.12) 18%,rgba(166,117,25,.17) 35%,rgba(255,239,184,.2) 50%,rgba(166,117,25,.17) 65%,rgba(255,233,163,.12) 82%,rgba(126,87,22,.14)),radial-gradient(ellipse at 50% 18%,rgba(255,235,166,.29),transparent 30%);box-shadow:0 0 0 8px rgba(245,231,190,.08),0 0 72px rgba(255,211,91,.16)}
html[data-theme="granada"] .mel-theme-shrine:before{inset:-9% -12%;border-radius:50% 50% 12% 12%/34% 34% 11% 11%;border:9px double #d4ad45;box-shadow:0 0 0 5px #f1e1ae,0 0 0 10px #8f6a21,0 0 54px rgba(255,211,91,.36),inset 0 0 32px rgba(255,244,194,.22)}
html[data-theme="granada"] .mel-theme-shrine:after{inset:-29% -48%;background:linear-gradient(90deg,transparent 0 11%,rgba(246,225,166,.11) 12% 14%,transparent 15% 31%,rgba(207,165,62,.12) 32% 34%,transparent 35% 65%,rgba(207,165,62,.12) 66% 68%,transparent 69% 85%,rgba(246,225,166,.11) 86% 88%,transparent 89%),radial-gradient(ellipse at 50% 3%,rgba(255,230,153,.18),transparent 24%)}
html[data-theme="granada"] .avatar{border:6px double #d7b451!important;box-shadow:0 0 0 4px #f5e8bc,0 0 0 9px #7e5c1b,0 22px 70px rgba(0,0,0,.7)!important}
html[data-theme="granada"] .window{border:7px double #b98b28!important;box-shadow:0 0 0 3px #f8edc9,0 0 0 9px #75561b,0 30px 95px rgba(0,0,0,.75)!important}
html[data-theme="granada"] .window:before{height:10px!important;background:linear-gradient(90deg,#725016,#d8b54e 13%,#fff0a7 29%,#aa7b1f 50%,#fff0a7 71%,#d8b54e 87%,#725016)!important}
html[data-theme="granada"] #messages{background-image:linear-gradient(90deg,rgba(176,133,36,.05),transparent 12% 88%,rgba(176,133,36,.05)),radial-gradient(ellipse at 50% -20%,rgba(255,221,117,.18),transparent 35%)}
html[data-theme="granada"] .msg{border-radius:7px;border-color:rgba(150,109,25,.3)}
html[data-theme="granada"] .app:after{content:"✦  RETABLO  ✦"!important;display:block;text-align:center;color:#e3c66f;letter-spacing:.42em;margin-top:10px;text-shadow:0 2px 8px #000}

@media(max-width:600px){.theme-ambient:after{transform:scale(1.15);transform-origin:50% 0}.controls{grid-template-columns:1fr 1fr!important}.mel-theme-shrine{width:238px;height:238px}#themeIdleCaption{font-size:.76rem;margin-top:-2px}.theme-panel{max-height:72vh;overflow:auto}}
@media(prefers-reduced-motion:reduce){.mel-theme-shrine{animation:none!important}}
</style>
<script id="mel-theme-avatar-runtime">
(function(){
  const THEMES=['classic','crusade','religious','granada'];
  const avatars={classic:'/assets/avatars/mel-classic.webp',crusade:'/assets/avatars/mel-crusade.webp',religious:'/assets/avatars/mel-religious-andalusian.webp',granada:'/assets/avatars/mel-granada.webp'};
  const icons={classic:'✦',crusade:'✠',religious:'✝',granada:'♛'};
  const idle={classic:'',crusade:'MEL veille et prie en silence.',religious:'MEL demeure dans une prière paisible.',granada:'MEL demeure dans la lumière du sanctuaire.'};
  function currentTheme(){const value=document.documentElement.dataset.theme;return THEMES.includes(value)?value:'classic'}
  function recentIntentContext(){try{return Array.from(document.querySelectorAll('#messages .msg')).slice(-8).map(function(node){const role=node.classList.contains('user')?'USER':'MEL';return role+': '+String(node.textContent||'').replace(/[\\n\\r\\t ]+/g,' ').trim().slice(0,1200)}).join('\\n').slice(-8000)}catch{return ''}}
  function removeSkills(){document.getElementById('skills')?.remove();document.getElementById('skillsPanel')?.remove();document.querySelectorAll('.skills').forEach(function(node){node.remove()})}
  function ensureAmbient(){if(!document.querySelector('.theme-ambient')){const node=document.createElement('div');node.className='theme-ambient';node.setAttribute('aria-hidden','true');document.body.prepend(node)}}
  function ensureDecor(){const wrap=document.querySelector('.avatar-wrap');if(wrap&&!wrap.querySelector('.mel-theme-shrine')){const shrine=document.createElement('div');shrine.className='mel-theme-shrine';shrine.setAttribute('aria-hidden','true');wrap.prepend(shrine)}const voice=document.getElementById('voiceStatus');if(voice&&!document.getElementById('themeIdleCaption')){const caption=document.createElement('div');caption.id='themeIdleCaption';voice.insertAdjacentElement('afterend',caption)}}
  function ensureGranadaChoice(){const panel=document.getElementById('themePanel');if(!panel||panel.querySelector('[data-theme-choice="granada"]'))return;const b=document.createElement('button');b.type='button';b.className='theme-choice';b.dataset.themeChoice='granada';const icon=document.createElement('span');icon.className='theme-icon';icon.textContent='♛';const copy=document.createElement('span');copy.className='theme-copy';const strong=document.createElement('strong');strong.textContent='Cathédrale de Grenade';const small=document.createElement('span');small.textContent='Grand retable · pierre ivoire · or monumental';copy.append(strong,small);b.append(icon,copy);panel.appendChild(b)}
  function syncVisuals(){const theme=currentTheme();const img=document.querySelector('.avatar img');if(img&&img.getAttribute('src')!==avatars[theme])img.setAttribute('src',avatars[theme]);const caption=document.getElementById('themeIdleCaption');if(caption)caption.textContent=idle[theme]||'';const button=document.getElementById('themeButton');if(button)button.textContent=icons[theme]||'✦';document.querySelectorAll('[data-theme-choice]').forEach(function(node){node.classList.toggle('active',node.dataset.themeChoice===theme)})}
  function applyTheme(theme){const value=THEMES.includes(theme)?theme:'classic';document.documentElement.dataset.theme=value;try{localStorage.setItem('mel.theme',value);localStorage.setItem('mel.theme.v2',value)}catch{}syncVisuals();const panel=document.getElementById('themePanel');if(panel)panel.classList.remove('open');document.getElementById('themeButton')?.setAttribute('aria-expanded','false')}
  function installThemeEvents(){const panel=document.getElementById('themePanel');if(!panel||panel.dataset.melThemeRuntime==='1')return;panel.dataset.melThemeRuntime='1';panel.addEventListener('click',function(event){const choice=event.target.closest('[data-theme-choice]');if(!choice)return;event.preventDefault();event.stopImmediatePropagation();applyTheme(choice.dataset.themeChoice)},true)}
  function boot(){removeSkills();ensureAmbient();ensureDecor();ensureGranadaChoice();installThemeEvents();let saved='classic';try{const preferred=localStorage.getItem('mel.theme.v2')||localStorage.getItem('mel.theme');if(THEMES.includes(preferred))saved=preferred}catch{}applyTheme(saved);syncVisuals()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  new MutationObserver(function(){removeSkills();syncVisuals()}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const nativeFetch=window.fetch.bind(window);window.fetch=function(resource,init){try{const path=typeof resource==='string'?resource:resource&&resource.url;if(path&&path.includes('/api/chat')&&init&&typeof init.body==='string'){const body=JSON.parse(init.body);if(body&&typeof body==='object'){let changed=false;if(!body.ui_theme){body.ui_theme=currentTheme();changed=true}if(!body.intent_context){const context=recentIntentContext();if(context){body.intent_context=context;changed=true}}if(changed)init={...init,body:JSON.stringify(body)}}}}catch{}return nativeFetch(resource,init)};
})();
</script>`;

export async function enhanceThemeAvatars(response) {
  if (!(response instanceof Response)) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  if (!html.includes('data-theme=') || html.includes('mel-theme-avatar-runtime')) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const body = html.includes('</body>') ? html.replace('</body>', `${THEME_AVATAR_SCRIPT}</body>`) : html + THEME_AVATAR_SCRIPT;
  const headers = new Headers(response.headers);
  headers.set('content-length', String(new TextEncoder().encode(body).length));
  headers.set('cache-control', 'no-store');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export { THEME_AVATAR_SCRIPT };
