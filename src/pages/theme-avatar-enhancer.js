const THEME_AVATAR_SCRIPT = `<style id="mel-theme-decor-style">
/* Keep decorative symbols outside message/input surfaces. */
#skills,#skillsPanel{display:none!important}.controls{grid-template-columns:1fr 1fr!important}
html[data-theme="crusade"] .window:after,html[data-theme="religious"] .window:after,html[data-theme="granada"] .window:after{content:none!important;display:none!important}
.mel-theme-shrine{display:none;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:clamp(205px,27vw,276px);height:clamp(205px,27vw,276px);pointer-events:none;z-index:0}
.mel-theme-shrine:before,.mel-theme-shrine:after{content:"";position:absolute;inset:0;pointer-events:none}
#themeIdleCaption{display:none;text-align:center;margin:-4px 0 12px;font-size:.82rem;letter-spacing:.035em;opacity:.82;color:var(--text);text-shadow:0 1px 5px rgba(0,0,0,.5)}
html[data-theme="crusade"] .mel-theme-shrine,html[data-theme="religious"] .mel-theme-shrine,html[data-theme="granada"] .mel-theme-shrine{display:block;animation:melIdlePrayer 7s ease-in-out infinite}
html[data-theme="crusade"] #themeIdleCaption,html[data-theme="religious"] #themeIdleCaption,html[data-theme="granada"] #themeIdleCaption{display:block}
@keyframes melIdlePrayer{0%,100%{filter:brightness(.96);opacity:.86}50%{filter:brightness(1.1);opacity:1}}

/* Medieval / Crusade — parchment, dark wood, manuscript and candlelight. */
html[data-theme="crusade"] body{background-color:#1b0d07!important;background-image:radial-gradient(circle at 50% 16%,rgba(255,194,86,.18),transparent 17%),linear-gradient(90deg,rgba(53,20,9,.9),rgba(18,8,4,.88) 17%,rgba(42,19,9,.83) 50%,rgba(18,8,4,.88) 83%,rgba(53,20,9,.9)),repeating-linear-gradient(90deg,rgba(226,174,84,.028) 0 2px,transparent 2px 9px)!important}
html[data-theme="crusade"] .mel-theme-shrine:before{inset:4%;border-radius:52% 52% 45% 45%;border:6px double #b98c3d;box-shadow:0 0 0 5px #5a2414,0 0 38px rgba(255,173,61,.26),inset 0 0 28px rgba(255,203,103,.15)}
html[data-theme="crusade"] .mel-theme-shrine:after{inset:-10% -24%;background:radial-gradient(ellipse at 12% 82%,rgba(255,165,54,.26),transparent 13%),radial-gradient(ellipse at 88% 82%,rgba(255,165,54,.26),transparent 13%);filter:blur(2px)}
html[data-theme="crusade"] .window{border:6px double #775023!important;box-shadow:0 0 0 3px #c29a4b,0 0 0 8px #35170b,0 28px 90px rgba(0,0,0,.78)!important}
html[data-theme="crusade"] .window:before{height:7px!important;background:linear-gradient(90deg,#5d1712,#d0a44f 12%,#7a1717 26%,#e4c06a 50%,#7a1717 74%,#d0a44f 88%,#5d1712)!important}
html[data-theme="crusade"] #messages{background-image:radial-gradient(circle at 4% 6%,rgba(122,23,23,.08),transparent 16%),radial-gradient(circle at 96% 94%,rgba(90,52,16,.08),transparent 18%)}
html[data-theme="crusade"] .composer{box-shadow:inset 0 9px 18px rgba(87,49,16,.08)}

/* Andalusian religious cave — intimate Marian sanctuary inspired by a cueva. */
html[data-theme="religious"]{--bg:#100d0c;--bg2:#3b251b;--glow:#c79a52;--glow2:#76523c;--panel:#f3ead1;--panel2:#e6d6ac;--composer:rgba(250,242,218,.88);--border:#bd9137;--accent:#315d93;--accent2:#183a69;--button:#274d7a;--button-text:#fff8df}
html[data-theme="religious"] body{background-color:#130f0d!important;background-image:radial-gradient(ellipse at 50% 13%,rgba(255,222,151,.23),transparent 18%),radial-gradient(ellipse at 50% 0,#58402d 0,#2c1e17 31%,#17110e 64%,#0d0b0a 100%),repeating-radial-gradient(ellipse at 50% 5%,rgba(233,211,171,.035) 0 2px,transparent 3px 10px)!important}
html[data-theme="religious"] .mel-theme-shrine:before{inset:-5% -7%;border-radius:50% 50% 43% 43%/38% 38% 57% 57%;border:8px double #d4b25c;box-shadow:0 0 0 8px rgba(109,82,55,.75),0 0 0 13px rgba(201,180,142,.28),0 0 55px rgba(255,210,105,.36),inset 0 0 34px rgba(255,238,188,.25)}
html[data-theme="religious"] .mel-theme-shrine:after{inset:-21% -38% -15%;background:radial-gradient(ellipse at 8% 78%,rgba(255,183,66,.3),transparent 9%),radial-gradient(ellipse at 92% 78%,rgba(255,183,66,.3),transparent 9%),linear-gradient(90deg,transparent 0 8%,rgba(215,190,145,.08) 9% 11%,transparent 12% 88%,rgba(215,190,145,.08) 89% 91%,transparent 92%)}
html[data-theme="religious"] .window{border:5px double #c5a04a!important;box-shadow:0 0 0 3px #f7ebbd,0 0 0 8px #6a4b30,0 28px 90px rgba(0,0,0,.72)!important}
html[data-theme="religious"] .window:before{height:8px!important;background:linear-gradient(90deg,#6b4a2d,#d6b75c 14%,#f6e7aa 32%,#b78b31 50%,#f6e7aa 68%,#d6b75c 86%,#6b4a2d)!important}
html[data-theme="religious"] #messages{background-image:radial-gradient(circle at 50% -15%,rgba(255,221,132,.13),transparent 33%)}

/* Granada Cathedral — monumental ivory stone and great gilded retable. */
html[data-theme="granada"]{color-scheme:light;--bg:#15120d;--bg2:#55452e;--glow:#d1ae57;--glow2:#9d7d34;--text:#fff6d6;--ink:#3a2a16;--muted:#73603b;--soft:#6a5737;--panel:#f7efd4;--panel2:#e8d39d;--composer:rgba(255,249,226,.91);--border:#b88927;--accent:#8b6518;--accent2:#5f420e;--user:#8b6518;--mel:rgba(255,255,255,.76);--button:#6c4b14;--button-text:#fff5d4;--radius:10px;--font:Georgia,'Times New Roman',serif;--ornament:linear-gradient(90deg,transparent,#b88a27 10%,#f7dd84 28%,#8b6518 50%,#f7dd84 72%,#b88a27 90%,transparent);--paper:radial-gradient(circle at 50% 0,rgba(255,244,199,.24),transparent 35%)}
html[data-theme="granada"] body{background-color:#17130d;background-image:linear-gradient(90deg,rgba(35,28,18,.96) 0 9%,rgba(220,207,174,.12) 9.5% 10.5%,transparent 11% 24%,rgba(220,207,174,.12) 24.5% 25.5%,transparent 26% 74%,rgba(220,207,174,.12) 74.5% 75.5%,transparent 76% 89%,rgba(220,207,174,.12) 89.5% 90.5%,rgba(35,28,18,.96) 91%),radial-gradient(ellipse at 50% 8%,rgba(255,224,126,.25),transparent 24%),linear-gradient(#493a27,#1c1710 72%)!important}
html[data-theme="granada"] .mel-theme-shrine:before{inset:-9% -12%;border-radius:50% 50% 12% 12%/34% 34% 11% 11%;border:9px double #d4ad45;box-shadow:0 0 0 5px #f1e1ae,0 0 0 10px #8f6a21,0 0 54px rgba(255,211,91,.36),inset 0 0 32px rgba(255,244,194,.22)}
html[data-theme="granada"] .mel-theme-shrine:after{inset:-29% -48%;background:linear-gradient(90deg,transparent 0 11%,rgba(246,225,166,.11) 12% 14%,transparent 15% 31%,rgba(207,165,62,.12) 32% 34%,transparent 35% 65%,rgba(207,165,62,.12) 66% 68%,transparent 69% 85%,rgba(246,225,166,.11) 86% 88%,transparent 89%),radial-gradient(ellipse at 50% 3%,rgba(255,230,153,.18),transparent 24%)}
html[data-theme="granada"] .avatar{border:6px double #d7b451!important;box-shadow:0 0 0 4px #f5e8bc,0 0 0 9px #7e5c1b,0 22px 70px rgba(0,0,0,.7)!important}
html[data-theme="granada"] .window{border:7px double #b98b28!important;box-shadow:0 0 0 3px #f8edc9,0 0 0 9px #75561b,0 30px 95px rgba(0,0,0,.75)!important}
html[data-theme="granada"] .window:before{height:10px!important;background:linear-gradient(90deg,#725016,#d8b54e 13%,#fff0a7 29%,#aa7b1f 50%,#fff0a7 71%,#d8b54e 87%,#725016)!important}
html[data-theme="granada"] #messages{background-image:linear-gradient(90deg,rgba(176,133,36,.05),transparent 12% 88%,rgba(176,133,36,.05)),radial-gradient(ellipse at 50% -20%,rgba(255,221,117,.18),transparent 35%)}
html[data-theme="granada"] .msg{border-radius:7px;border-color:rgba(150,109,25,.3)}
</style>
<script id="mel-theme-avatar-runtime">
(function(){
  const avatars={
    classic:'/assets/avatars/mel-classic.webp',
    crusade:'/assets/avatars/mel-crusade.webp',
    religious:'/assets/avatars/mel-religious-andalusian.webp',
    granada:'/assets/avatars/mel-religious-andalusian.webp'
  };
  const idle={
    crusade:'MEL veille et prie en silence.',
    religious:'MEL demeure dans une prière paisible.',
    granada:'MEL demeure dans la lumière du sanctuaire.'
  };
  function theme(){const value=document.documentElement.dataset.theme;return avatars[value]?value:'classic'}
  function syncAvatar(){const img=document.querySelector('.avatar img');if(!img)return;const src=avatars[theme()];if(img.getAttribute('src')!==src)img.setAttribute('src',src)}
  function recentIntentContext(){
    try{
      return Array.from(document.querySelectorAll('#messages .msg')).slice(-8).map(function(node){
        const role=node.classList.contains('user')?'USER':'MEL';
        return role+': '+String(node.textContent||'').replace(/\s+/g,' ').trim().slice(0,1200);
      }).join('\n').slice(-8000);
    }catch{return ''}
  }
  function syncCaption(){const node=document.getElementById('themeIdleCaption');if(node)node.textContent=idle[theme()]||'';const button=document.getElementById('themeButton');if(button&&theme()==='granada')button.textContent='♛'}
  function removeSkills(){document.getElementById('skills')?.remove();document.getElementById('skillsPanel')?.remove()}
  function ensureDecor(){
    const wrap=document.querySelector('.avatar-wrap');
    if(wrap&&!wrap.querySelector('.mel-theme-shrine')){const shrine=document.createElement('div');shrine.className='mel-theme-shrine';shrine.setAttribute('aria-hidden','true');wrap.prepend(shrine)}
    const status=document.getElementById('voiceStatus');
    if(status&&!document.getElementById('themeIdleCaption')){const caption=document.createElement('div');caption.id='themeIdleCaption';status.insertAdjacentElement('afterend',caption)}
  }
  function ensureGranadaChoice(){
    const panel=document.getElementById('themePanel');
    if(!panel||panel.querySelector('[data-theme-choice="granada"]'))return;
    const b=document.createElement('button');b.type='button';b.className='theme-choice';b.dataset.themeChoice='granada';
    const icon=document.createElement('span');icon.className='theme-icon';icon.textContent='♛';
    const copy=document.createElement('span');copy.className='theme-copy';
    const strong=document.createElement('strong');strong.textContent='Cathédrale de Grenade';
    const small=document.createElement('span');small.textContent='Grand retable · pierre ivoire · or monumental';
    copy.append(strong,small);b.append(icon,copy);
    b.addEventListener('click',function(){document.documentElement.dataset.theme='granada';try{localStorage.setItem('mel.theme','granada')}catch{}panel.classList.remove('open');document.getElementById('themeButton')?.setAttribute('aria-expanded','false');document.querySelectorAll('[data-theme-choice]').forEach(function(x){x.classList.toggle('active',x===b)});syncAvatar();syncCaption()});
    panel.appendChild(b);
  }
  function restoreGranada(){try{if(localStorage.getItem('mel.theme')==='granada')document.documentElement.dataset.theme='granada'}catch{}}
  function boot(){removeSkills();ensureDecor();ensureGranadaChoice();restoreGranada();syncAvatar();syncCaption()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  new MutationObserver(function(){removeSkills();syncAvatar();syncCaption()}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(resource,init){
    try{
      const path=typeof resource==='string'?resource:resource&&resource.url;
      if(path&&path.includes('/api/chat')&&init&&typeof init.body==='string'){
        const body=JSON.parse(init.body);
        if(body&&typeof body==='object'){
          let changed=false;
          if(!body.ui_theme){body.ui_theme=theme()==='granada'?'religious':theme();changed=true}
          if(!body.intent_context){const context=recentIntentContext();if(context){body.intent_context=context;changed=true}}
          if(changed)init={...init,body:JSON.stringify(body)};
        }
      }
    }catch{}
    return nativeFetch(resource,init);
  };
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
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export { THEME_AVATAR_SCRIPT };
