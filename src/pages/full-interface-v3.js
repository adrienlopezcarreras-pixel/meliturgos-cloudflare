import { onRequestGet as renderV2 } from './full-interface-v2.js';

const PATCH = `<style id="mel-full-v3-style">
html,body,.main,.view,.card,.panel,.trace,.candidate,.candidate *,.card *,.view *{color:#fff!important}
.muted,.small,.trace-key,.chip,.response,.mentor-hint,.personal-strip .rule{color:rgba(255,255,255,.82)!important}
input,textarea,select{color:#fff!important;background:rgba(3,8,20,.86)!important;border-color:rgba(255,255,255,.24)!important}
input::placeholder,textarea::placeholder{color:rgba(255,255,255,.62)!important}
option{background:#09101f;color:#fff}
.theme-dock{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 14px;padding:9px;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(5,8,15,.48);backdrop-filter:blur(12px)}
.theme-dock button{border:1px solid rgba(255,255,255,.16);background:rgba(8,12,23,.72);color:#fff;border-radius:999px;padding:7px 11px;font-size:.76rem;cursor:pointer}.theme-dock button.active{border-color:#e4c777;box-shadow:0 0 0 1px rgba(228,199,119,.35) inset;color:#ffe9a9}
body:before{content:"";position:fixed;inset:0;z-index:-5;background-image:linear-gradient(180deg,rgba(2,5,12,.28),rgba(2,4,10,.84)),var(--mel-scene);background-size:cover;background-position:center;filter:saturate(.9) brightness(.72);transition:background-image .35s ease;pointer-events:none}
.main,.side{background:rgba(4,8,17,.74)!important;backdrop-filter:blur(10px)}
.roadmap-request{display:flex;gap:8px;align-items:center;margin-top:10px;padding:9px 11px;border-radius:12px;border:1px solid rgba(228,199,119,.16);background:rgba(228,199,119,.06);font-size:.78rem}.roadmap-request b{color:#ffe6a1!important}
.bridge-truth{margin-top:8px;padding:9px 11px;border-left:3px solid #d8b45f;background:rgba(216,180,95,.06);font-size:.78rem;color:rgba(255,255,255,.9)!important}
</style>
<script id="mel-full-v3-runtime">(function(){
function svg(kind){
 const base={andalusia:['#2a120b','#9b612e','#f2cc83'],cathedral:['#091020','#233960','#f0d693'],crusade:['#160e12','#593a2a','#d9b46a'],aviation:['#1d1a16','#6b5137','#e7b96a'],paladin:['#0b1220','#273c53','#d8d5a4'],fantasy:['#100d21','#38286a','#c4a8ff']}[kind]||['#111827','#374151','#d1d5db'];
 const [a,b,c]=base;return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="'+b+'"/><stop offset="1" stop-color="'+a+'"/></linearGradient><radialGradient id="r"><stop stop-color="'+c+'" stop-opacity=".72"/><stop offset="1" stop-color="'+a+'" stop-opacity="0"/></radialGradient><filter id="blur"><feGaussianBlur stdDeviation="18"/></filter></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="1200" cy="190" r="360" fill="url(#r)" filter="url(#blur)"/><path d="M0 760L190 540 270 690 430 430 530 720 690 360 770 710 940 470 1020 690 1210 300 1300 690 1450 430 1600 700V900H0Z" fill="'+a+'" opacity=".82"/><path d="M85 820V280h100v540M1415 820V250h100v570M180 300Q800 -170 1420 300" fill="none" stroke="'+c+'" stroke-opacity=".32" stroke-width="18"/><g fill="'+c+'" opacity=".2"><circle cx="290" cy="170" r="5"/><circle cx="510" cy="120" r="3"/><circle cx="980" cy="130" r="4"/><circle cx="1330" cy="110" r="5"/></g></svg>'}
function data(kind){return 'url("data:image/svg+xml,'+encodeURIComponent(svg(kind))+'")'}
const themes=[['andalusia','Andalousie'],['cathedral','Sanctuaire'],['crusade','Croisée'],['aviation','Aviation 1940'],['paladin','Paladin'],['fantasy','Fantaisie']];
function setTheme(kind){document.documentElement.style.setProperty('--mel-scene',data(kind));try{localStorage.setItem('mel.full.theme',kind)}catch{}document.querySelectorAll('.theme-dock button').forEach(b=>b.classList.toggle('active',b.dataset.theme===kind))}
function install(){const main=document.querySelector('main.main');if(!main)return;const strip=document.getElementById('melPersonalStrip');if(!document.getElementById('melThemeDock')){const d=document.createElement('div');d.id='melThemeDock';d.className='theme-dock';d.innerHTML=themes.map(t=>'<button type="button" data-theme="'+t[0]+'">'+t[1]+'</button>').join('');(strip||main.firstElementChild)?.insertAdjacentElement('afterend',d);d.addEventListener('click',e=>{const b=e.target.closest('button[data-theme]');if(b)setTheme(b.dataset.theme)})}
let t='andalusia';try{t=localStorage.getItem('mel.full.theme')||t}catch{}setTheme(t);
const multi=document.querySelector('.view[data-panel="multi"]');if(multi&&!document.getElementById('typoRoadmap')){const n=document.createElement('div');n.id='typoRoadmap';n.className='roadmap-request';n.innerHTML='<b>Roadmap</b><span>Compréhension robuste des fautes de frappe, phonétiques et orthographiques dans les demandes.</span>';const room=document.getElementById('mentorRoom');(room||multi.querySelector('.section-head'))?.insertAdjacentElement('afterend',n)}
const select=document.getElementById('mentorRoomTarget');if(select){const mentor=Array.from(select.options).find(o=>o.value==='mentor');if(mentor)mentor.textContent='@Mentor · priorité';if(select.value==='all')select.value='mentor'}
const hint=document.querySelector('.mentor-hint');if(hint){hint.innerHTML='Routage souhaité : Mentor prioritaire par défaut · @MEL pour MEL · Conseil seulement sur demande explicite.<div class="bridge-truth">Le canal Mentor affiché ici ne doit être considéré comme ChatGPT que lorsqu’un transport ChatGPT authentifié est réellement connecté. Le Conseil Workers-AI n’est pas ChatGPT.</div>'}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,30));else setTimeout(install,30);})();</script>`;

export async function onRequestGet(context){
 const response=await renderV2(context);let body=await response.text();body=body.includes('</body>')?body.replace('</body>',PATCH+'</body>'):body+PATCH;const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store, max-age=0');return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
