const MEL_AVATAR_URL = '/assets/avatars/mel-spanish-20260911.webp';

const MEL_INTERFACE_FINALIZER = `<style id="mel-interface-finalizer-style">
:root{--mel-gold:#d8b15d;--mel-wine:#54213a;--mel-cream:#fff6e8;--mel-night:#0b0810}.theme-switch{display:block!important;z-index:80!important}.composer-meta{display:none!important}.app{width:min(900px,100%)!important}.app:before{height:2px!important;width:min(430px,58vw)!important;background:linear-gradient(90deg,transparent,rgba(232,196,115,.78),transparent)!important}.app:after{content:"";position:fixed;inset:0;z-index:-4;background-size:cover;background-position:center;filter:saturate(.92) brightness(.58);transform:scale(1.02);opacity:.95;pointer-events:none;transition:background-image .35s ease}.avatar-wrap{margin-top:2px!important}.avatar-wrap:before{background:radial-gradient(circle,rgba(216,177,93,.28),rgba(84,33,58,.12) 48%,transparent 72%)!important}.avatar{border:2px solid rgba(232,196,115,.48)!important;box-shadow:0 22px 80px rgba(0,0,0,.58),0 0 0 7px rgba(216,177,93,.05),0 0 52px rgba(216,177,93,.18)!important}.avatar img{object-position:center 30%!important}.window{backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);background:linear-gradient(180deg,rgba(24,14,23,.80),rgba(8,7,13,.93))!important;border-color:rgba(232,196,115,.18)!important;box-shadow:0 26px 86px rgba(0,0,0,.48)!important}.window:before{background:linear-gradient(90deg,transparent,rgba(232,196,115,.72),rgba(110,43,68,.78),rgba(232,196,115,.72),transparent)!important}.composer{background:linear-gradient(180deg,rgba(20,10,18,.25),rgba(8,6,10,.54))!important}.drop{background:rgba(88,43,57,.16)!important;border-color:rgba(232,196,115,.23)!important}.controls{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;max-width:none!important}.controls button{padding:10px 8px!important;font-weight:760!important}.controls .daily{background:rgba(255,246,232,.075)!important;border-color:rgba(232,196,115,.28)!important;color:#fff!important}.controls .primary{background:linear-gradient(135deg,#7a2e4b,#c0844b)!important;border-color:rgba(232,196,115,.28)!important}.msg.mel{background:rgba(255,247,234,.052)!important;border-color:rgba(232,196,115,.11)!important;box-shadow:inset 3px 0 0 rgba(216,177,93,.58)}.msg.user{background:rgba(122,46,75,.19)!important;border-color:rgba(216,177,93,.12)!important;box-shadow:inset -3px 0 0 rgba(192,132,75,.64)}#voiceStatus{display:none!important}.mel-topline,.mel-recall-row,.mel-motto,.mel-idle-status{display:none!important}.theme-panel,.theme-panel *{color:#fff!important}.theme-choice{background:rgba(8,10,16,.86)!important}.theme-copy span{color:#ddd!important}
html[data-theme="classic"] .app:after{background-image:radial-gradient(circle at 50% 8%,rgba(216,177,93,.18),transparent 32%),linear-gradient(135deg,#120b12,#080b12 58%,#14090d)}
html[data-theme="crusade"] .app:after{background-image:linear-gradient(rgba(5,4,4,.20),rgba(5,4,4,.60)),radial-gradient(circle at 30% 20%,#6d4b25,transparent 38%),linear-gradient(135deg,#24170c,#080605 70%)}
html[data-theme="religious"] .app:after{background-image:linear-gradient(rgba(8,5,3,.14),rgba(8,5,3,.55)),radial-gradient(circle at 58% 18%,#8b622b,transparent 38%),linear-gradient(135deg,#2e170d,#090503 72%)}
html[data-theme="granada"] .app:after{background-image:linear-gradient(rgba(10,7,4,.12),rgba(10,7,4,.50)),radial-gradient(circle at 50% 10%,#d8b15d,transparent 34%),linear-gradient(145deg,#4b3517,#0b0804 72%)}
html[data-theme="aviation"] .app:after{background-image:linear-gradient(rgba(2,5,8,.18),rgba(2,5,8,.62)),radial-gradient(circle at 20% 20%,#2c4d69,transparent 36%),linear-gradient(145deg,#0d1720,#04070a 72%)}
html[data-theme="paladin"] .app:after{background-image:linear-gradient(rgba(5,6,8,.10),rgba(5,6,8,.48)),radial-gradient(circle at 50% 14%,#ddd1ae,transparent 32%),linear-gradient(145deg,#56514a,#111215 72%)}
html[data-theme="amazon"] .app:after{background-image:linear-gradient(rgba(8,3,5,.15),rgba(8,3,5,.58)),radial-gradient(circle at 72% 18%,#7b2746,transparent 35%),linear-gradient(145deg,#2d0d18,#080407 72%)}
@media(max-width:650px){.controls{grid-template-columns:1fr 1fr!important}.controls .daily{grid-column:1/-1}.avatar{width:min(54vw,212px)!important;height:min(54vw,212px)!important}.window{border-radius:18px!important}}
</style><script id="mel-interface-finalizer-runtime">
(function(){
  const avatar=document.getElementById('avatar');
  const controls=document.querySelector('.controls');
  const full=document.getElementById('full');
  if(!avatar||!controls||!full)return;
  const avatarImage=avatar.querySelector('img');
  if(avatarImage){avatarImage.src='${MEL_AVATAR_URL}';avatarImage.alt='MEL';avatarImage.removeAttribute('srcset')}
  document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]').forEach(function(link){link.href='${MEL_AVATAR_URL}'});
  document.querySelectorAll('.mel-topline,.mel-recall-row,.mel-motto,.mel-idle-status').forEach(function(node){node.remove()});
  const voiceStatus=document.getElementById('voiceStatus'); if(voiceStatus) voiceStatus.remove();
  function aelfUrl(){const d=new Date();const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');return 'https://www.aelf.org/'+date+'/france/messe'}
  document.getElementById('melGospelToday')?.remove();document.getElementById('melPsalmToday')?.remove();
  if(!document.getElementById('melReadingsToday')){const b=document.createElement('button');b.type='button';b.id='melReadingsToday';b.className='daily';b.textContent='Lectures du jour';b.addEventListener('click',function(){window.open(aelfUrl(),'_blank','noopener,noreferrer')});controls.insertBefore(b,full)}
  full.textContent='Mode complet';
})();
</script>`;

export async function finalizeMvpInterface(response){
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  html=html
    .replaceAll('Présente, attentive, prête à avancer avec toi.','')
    .replaceAll('Touchez le visage de MEL pour parler · le texte reste toujours disponible','')
    .replaceAll('MEL veille et prie en silence.','')
    .replaceAll('Touchez son visage pour parler','');
  if(html.includes('id="mel-interface-finalizer-runtime"'))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const next=html.includes('</body>')?html.replace('</body>',MEL_INTERFACE_FINALIZER+'</body>'):html+MEL_INTERFACE_FINALIZER;
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store, max-age=0');
  return new Response(next,{status:response.status,statusText:response.statusText,headers});
}

export { MEL_INTERFACE_FINALIZER, MEL_AVATAR_URL };