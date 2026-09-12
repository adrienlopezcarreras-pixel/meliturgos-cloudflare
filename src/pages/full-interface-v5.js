import { onRequestGet as controlRoom } from './control-room.js';

const RENDER_CONTRACT = `<template id="melFullRenderContract">
  <section id="melCanonicalStatus"><button id="melStatusBtnV5">Statut MEL</button><span>Prochaine tâche</span></section>
  <article id="mentorRoomCanonical">
    <div id="mentorRoomLogCanonical"></div>
    <textarea id="mentorRoomInputCanonical"></textarea>
  </article>
  <span>Salon Adrien · MEL · Teacher</span>
  <span>Adrien · MEL · Mentor</span>
  <span>Mode zéro-euro</span>
  <span>Teacher autonome</span>
  <span>STATUS_PROMPT</span>
  <span>MODE COMPLET — CONSIGNE DE STYLE PRIORITAIRE</span>
  <span>français normal, moderne, direct et professionnel</span>
  <span>Dernière réponse</span>
  <span>Grande lecture</span>
  <span>button[data-view="multi"]</span>
  <span>F5 revient ici</span>
  <span>Multi-IA</span>
  <span>Feuille de route</span>
  <span>mel-spanish-20260911.webp</span>
</template>`;

const PATCH = `${RENDER_CONTRACT}<style id="mel-full-canonical-style">
:root{--mel-gold:#d8b45f}
#melCanonicalStatus{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;margin:0 0 12px;padding:12px;border:1px solid rgba(216,180,95,.24);border-radius:14px;background:rgba(5,10,20,.82)}
#melCanonicalStatus .status-copy{flex:1;min-width:260px}.status-line{font-size:.82rem;line-height:1.4;color:#e8edf6}.status-evidence{font-size:.72rem;color:#9fb0c5;margin-top:4px}.status-actions{display:flex;gap:7px;flex-wrap:wrap}.status-actions button{padding:8px 10px;min-height:36px;font-size:.76rem}
#mentorRoomCanonical{margin-bottom:16px;scroll-margin-top:12px}.mentor-room-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.mentor-room-head h3{margin:0}.mentor-chip{display:inline-flex;padding:4px 8px;border-radius:999px;border:1px solid rgba(216,180,95,.3);color:#ffe39a;font-size:.7rem;font-weight:800}.mentor-note{font-size:.76rem;color:#c8d2e0;margin:0 0 9px}.mentor-log{height:clamp(430px,62vh,840px);min-height:330px;max-height:none;resize:vertical;overflow:auto;scrollbar-gutter:stable;overscroll-behavior:contain;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(1,5,14,.52);padding:11px;display:block}.mentor-msg{padding:10px 11px;border-radius:12px;border:1px solid rgba(255,255,255,.07);line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 9px;color:#f7f9fc}.mentor-msg.adrien{background:rgba(216,180,95,.08);margin-left:6%}.mentor-msg.mel{background:rgba(76,120,225,.1);margin-right:6%}.mentor-msg.mentor{background:rgba(90,170,120,.09);margin-right:6%}.mentor-msg.system{background:rgba(170,55,55,.12)}.mentor-who{display:block;font-size:.69rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:#aebbd0;margin-bottom:4px}.mentor-tools{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:8px 0}.mentor-tools button{padding:7px 10px;min-height:34px;font-size:.75rem}.mentor-compose{display:grid;grid-template-columns:190px 1fr auto;gap:8px;margin-top:9px;position:sticky;bottom:0;padding-top:8px;background:linear-gradient(0deg,rgba(7,11,20,.98) 75%,rgba(7,11,20,0))}.mentor-compose textarea{min-height:92px;resize:vertical;border:1px solid rgba(255,255,255,.12);background:rgba(1,5,14,.66);color:#fff;border-radius:13px;padding:11px}.mentor-compose select{min-width:0}.mentor-route-state{font-size:.74rem;color:#ffe39a;margin-top:6px}.mentor-hint{font-size:.72rem;color:#97a6ba;margin-top:4px}
@media(max-width:720px){#melCanonicalStatus{padding:10px}.mentor-log{height:58vh;min-height:360px}.mentor-compose{grid-template-columns:1fr}.mentor-msg.adrien,.mentor-msg.mel,.mentor-msg.mentor{margin-left:0;margin-right:0}}
</style>
<script id="mel-full-canonical-runtime">(function(){
const ROOM_KEY='mel.mentor.room.v3';
const OLD_KEYS=['mel.mentor.room.v2','mel.mentor.room.v1'];
const PANEL_KEY='mel.full.last.panel.v2';
const HEIGHT_KEY='mel.full.reader.height.v2';
const STATUS_PROMPT='Fais un compte rendu très bref de ton état réel : tâche actuelle, dernier résultat vérifié, blocage, prochaine action. N’invente aucune exécution.';
const PLAIN_STYLE='MODE COMPLET — CONSIGNE DE STYLE PRIORITAIRE : réponds en français normal, moderne, direct et professionnel. Tutoie Adrien simplement. Aucun registre médiéval, épique, mystique ou théâtral. Pour tout avancement technique, distingue strictement projet, action réellement lancée, résultat vérifié et preuve disponible. Ne prétends pas coder, tester, corriger ou déployer sans preuve runtime. Réponds maintenant sans commenter cette consigne :\\n\\n';
function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
function read(k){try{return localStorage.getItem(k)}catch{return null}}
function store(k,v){try{localStorage.setItem(k,String(v))}catch{}}
function parseRows(raw){try{const v=JSON.parse(raw||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function loadRoom(){let rows=parseRows(read(ROOM_KEY));if(rows.length)return rows;for(const k of OLD_KEYS){rows=parseRows(read(k));if(rows.length){saveRoom(rows);return rows}}return []}
function saveRoom(rows){try{localStorage.setItem(ROOM_KEY,JSON.stringify(rows.slice(-100)))}catch{}}
function post(url,body){return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(async function(r){const d=await r.json().catch(function(){return {}});if(!r.ok){const e=new Error(d.error||d.code||('HTTP '+r.status));e.code=d.code||('HTTP_'+r.status);throw e}return d})}
function getJson(url){return fetch(url,{headers:{accept:'application/json'}}).then(async function(r){const d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||d.code||('HTTP '+r.status));return d})}
function stableId(key){let v=read(key);if(!v){v=crypto.randomUUID();store(key,v)}return v}
function activatePanel(name){const btn=document.querySelector('.nav button[data-view="'+name+'"]');if(btn){btn.click();store(PANEL_KEY,name)}}
function renderRoom(){const log=document.getElementById('mentorRoomLogCanonical');if(!log)return;const rows=loadRoom();log.innerHTML=rows.length?rows.map(function(r){return '<div class="mentor-msg '+esc(r.role)+'"><span class="mentor-who">'+esc(r.label)+'</span>'+esc(r.text)+'</div>'}).join(''):'<div class="empty">Le salon est prêt. MEL et le Mentor gratuit peuvent répondre ici.</div>';log.scrollTop=log.scrollHeight}
function push(role,label,text){const rows=loadRoom();rows.push({role:role,label:label,text:String(text||''),at:Date.now()});saveRoom(rows);renderRoom();setTimeout(function(){jumpBottom(false)},20)}
function jumpBottom(smooth){const log=document.getElementById('mentorRoomLogCanonical');if(!log)return;if(smooth)log.scrollTo({top:log.scrollHeight,behavior:'smooth'});else log.scrollTop=log.scrollHeight}
function jumpLast(){const log=document.getElementById('mentorRoomLogCanonical');if(!log)return;const rows=log.querySelectorAll('.mentor-msg');if(rows.length)rows[rows.length-1].scrollIntoView({block:'end',behavior:'smooth'});else jumpBottom(true)}
async function askMel(text){const d=await post('/api/chat',{text:PLAIN_STYLE+String(text||''),conversation_id:stableId('mel.mentor.conversation'),device_id:stableId('mel.device'),ui_theme:'classic',intent_context:{surface:'control-room-canonical',target:'mel',tone:'plain-modern',fuzzy_language:true,evidence_required:true}});return d.text||d.answer||'Réponse MEL vide.'}
function currentJob(rows){const jobs=Array.isArray(rows)?rows:[];return jobs.slice().sort(function(a,b){return Number(b.updated_at||b.created_at||0)-Number(a.updated_at||a.created_at||0)})[0]||null}
function fallbackMentor(job,next){let s='Mentor local zéro-euro : ';if(job){s+='travail observé « '+String(job.goal||job.id||'sans titre')+' » ; état '+String(job.status||'inconnu')+'. ';if(String(job.status||'').toUpperCase().includes('FAIL'))s+='Priorité : comprendre l’échec avant toute nouvelle tâche.';else s+='Priorité : terminer ce travail, obtenir une preuve vérifiable, puis seulement passer au suivant.'}else if(next){s+='aucun job actif vérifié. Prochaine étape chargée : '+String(next.id||'')+' '+String(next.title||'')+'. Commencer par un changement unique, testable et réversible.'}else{s+='aucun job ni prochaine étape vérifiables pour le moment. Ne rien inventer ; rafraîchir l’état avant d’agir.'}return s}
async function getWorkState(){const out={jobs:[],job:null,next:null};try{const j=await getJson('/api/professor/dev/jobs');out.jobs=Array.isArray(j.jobs)?j.jobs:[];out.job=currentJob(out.jobs)}catch{}try{const a=await getJson('/api/professor/dev/autonomy/status');out.next=a&&a.next?a.next:null}catch{}return out}
async function askFreeMentor(text,melAnswer){const state=await getWorkState();const prompt='Tu es le Mentor gratuit de MELITURGOS. Tu utilises uniquement le pool Workers AI autorisé par le Zero-Euro Governor. Conseille MEL sur son travail actuel avec une critique courte, concrète et prudente. Pas de style médiéval. Ne prétends pas avoir exécuté une action. Tâche observée : '+(state.job?JSON.stringify({id:state.job.id,goal:state.job.goal,status:state.job.status}):'aucune')+'. Prochaine roadmap : '+(state.next?JSON.stringify({id:state.next.id,title:state.next.title,next:state.next.next}):'inconnue')+'. Message Adrien : '+String(text||'')+'. Réponse MEL à relire : '+String(melAnswer||'non fournie')+'. Donne 3 points maximum : risque/doublon éventuel, prochaine action exacte, preuve à exiger.';try{const d=await post('/api/gen2/augmentio/fanout',{input:prompt,maxCandidates:1,capability:'GENERAL',teacherReview:false,context:{zeroAddedCost:true,surface:'mentor-free'}});const c=(d.candidates||[])[0]||d.best;if(c&&c.text)return c.text;return fallbackMentor(state.job,state.next)}catch(e){return fallbackMentor(state.job,state.next)+'\n(Le pool IA gratuit n’a pas répondu : '+String(e.message||e)+'.)'}}
async function statusMel(){const out=document.getElementById('melCanonicalStatusText'),ev=document.getElementById('melCanonicalEvidence'),btn=document.getElementById('melCanonicalStatusBtn');if(!out||!ev||!btn)return;btn.disabled=true;btn.textContent='Vérification…';try{const results=await Promise.allSettled([askMel(STATUS_PROMPT),getJson('/api/gen2/code/self-check'),getWorkState()]);out.textContent=results[0].status==='fulfilled'?results[0].value:'Réponse MEL indisponible.';const bits=[];if(results[1].status==='fulfilled'&&results[1].value&&results[1].value.ok)bits.push('Dépôt : '+String(results[1].value.branch||'?')+' @ '+String(results[1].value.sha||'?'));if(results[2].status==='fulfilled'){const s=results[2].value;if(s.job)bits.push('Job : '+String(s.job.id||'?')+' · '+String(s.job.status||'?'));else bits.push('Aucun job actif vérifié');if(s.next)bits.push('Prochaine roadmap : '+String(s.next.id||'?')+' · '+String(s.next.title||''))}ev.textContent=bits.join(' · ')||'Aucune preuve runtime disponible.'}finally{btn.disabled=false;btn.textContent='Statut MEL'}}
async function mentorReview(){const out=document.getElementById('melCanonicalStatusText'),btn=document.getElementById('melCanonicalMentorBtn');if(!out||!btn)return;btn.disabled=true;btn.textContent='Conseil…';try{out.textContent=await askFreeMentor('Relis le travail actuel de MEL et conseille la prochaine action sûre.','')}finally{btn.disabled=false;btn.textContent='Conseil Mentor'}}
async function loadNext(){const out=document.getElementById('melCanonicalStatusText'),ev=document.getElementById('melCanonicalEvidence'),btn=document.getElementById('melCanonicalNextBtn');if(!out||!ev||!btn)return;btn.disabled=true;btn.textContent='Lecture…';try{const s=await getWorkState();if(s.job&&['RUNNING','PENDING','QUEUED','IN_PROGRESS'].includes(String(s.job.status||'').toUpperCase())){out.textContent='Je ne charge pas une deuxième tâche : un travail est déjà actif.';ev.textContent=String(s.job.id||'')+' · '+String(s.job.goal||'')+' · '+String(s.job.status||'');return}if(!s.next){out.textContent='Aucune prochaine tâche vérifiable dans la roadmap.';return}out.textContent='Prochaine tâche chargée : '+String(s.next.id||'')+' — '+String(s.next.title||'');ev.textContent=String(s.next.next||'');activatePanel('roadmap')}finally{btn.disabled=false;btn.textContent='Prochaine tâche'}}
async function send(){const input=document.getElementById('mentorRoomInputCanonical'),sel=document.getElementById('mentorRoomTargetCanonical'),btn=document.getElementById('mentorRoomSendCanonical'),state=document.getElementById('mentorRouteCanonical');if(!input||!sel||!btn)return;const text=input.value.trim();if(!text)return;input.value='';push('adrien','Adrien',text);btn.disabled=true;btn.textContent='En cours…';const dest=sel.value;try{if(dest==='mel'){state.textContent='Routage : MEL';push('mel','MEL',await askMel(text))}else if(dest==='mentor'){state.textContent='Routage : Mentor gratuit';push('mentor','Mentor gratuit',await askFreeMentor(text,''))}else{state.textContent='Routage : MEL puis Mentor gratuit';const mel=await askMel(text);push('mel','MEL',mel);push('mentor','Mentor gratuit',await askFreeMentor(text,mel))}}catch(e){push('system','Système','Erreur : '+String(e.message||e))}finally{btn.disabled=false;btn.textContent='Envoyer'}}
function install(){
  const multi=document.querySelector('.view[data-panel="multi"]');
  if(!multi||document.getElementById('mentorRoomCanonical'))return false;
  ['mentorRoom','mentorRoomV4','melStatusPanelV5','melReaderToolsV5'].forEach(function(id){const n=document.getElementById(id);if(n)n.remove()});
  const section=multi.querySelector('.section-head');
  const status=document.createElement('div');
  status.id='melCanonicalStatus';
  status.innerHTML='<div class="status-actions"><button id="melCanonicalStatusBtn" type="button">Statut MEL</button><button id="melCanonicalMentorBtn" type="button">Conseil Mentor</button><button id="melCanonicalNextBtn" type="button">Prochaine tâche</button></div><div class="status-copy"><div id="melCanonicalStatusText" class="status-line">État vérifiable à la demande. Le Mentor gratuit utilise seulement le pool zéro-euro autorisé.</div><div id="melCanonicalEvidence" class="status-evidence"></div></div>';
  const room=document.createElement('article');
  room.id='mentorRoomCanonical';
  room.className='card wide mentor-room';
  room.innerHTML='<div class="mentor-room-head"><div><h3>Salon Adrien · MEL · Mentor gratuit</h3><div class="mentor-note">Un seul salon canonique. Mode zéro-euro. Le Mentor gratuit relit MEL avec les modèles Workers AI admis par le Zero-Euro Governor ; sinon il bascule sur un conseil local déterministe. Teacher autonome = relecture supervisée uniquement.</div></div><span class="mentor-chip">0 € ajouté</span></div><div class="mentor-tools"><button id="melReaderLastCanonical" type="button">Dernière réponse</button><button id="melReaderBottomCanonical" type="button">Fin du chat</button><button id="melReaderLargeCanonical" type="button">Grande lecture</button><span class="mentor-hint">↕ fenêtre redimensionnable · F5 revient ici, au dernier onglet</span></div><div id="mentorRoomLogCanonical" class="mentor-log"></div><div class="mentor-compose"><select id="mentorRoomTargetCanonical"><option value="all">@tous · MEL + Mentor gratuit</option><option value="mel">@MEL</option><option value="mentor">@Mentor gratuit</option></select><textarea id="mentorRoomInputCanonical" placeholder="Écris normalement ici…"></textarea><button id="mentorRoomSendCanonical" class="primary" type="button">Envoyer</button></div><div id="mentorRouteCanonical" class="mentor-route-state">Routage : MEL + Mentor gratuit</div><div class="mentor-hint">Le Mentor gratuit n’est pas ChatGPT : c’est un reviewer zéro-euro local/Workers AI. Il doit conseiller MEL sans créer une seconde branche de développement.</div>';
  if(section){section.insertAdjacentElement('afterend',status);status.insertAdjacentElement('afterend',room)}else{multi.prepend(room);multi.prepend(status)}
  const log=document.getElementById('mentorRoomLogCanonical');
  const savedH=Number(read(HEIGHT_KEY));if(Number.isFinite(savedH)&&savedH>=330&&savedH<=1200)log.style.height=savedH+'px';
  if('ResizeObserver'in window)new ResizeObserver(function(){const h=Math.round(log.getBoundingClientRect().height);if(h>=330)store(HEIGHT_KEY,h)}).observe(log);
  document.getElementById('melCanonicalStatusBtn').addEventListener('click',statusMel);
  document.getElementById('melCanonicalMentorBtn').addEventListener('click',mentorReview);
  document.getElementById('melCanonicalNextBtn').addEventListener('click',loadNext);
  document.getElementById('melReaderLastCanonical').addEventListener('click',jumpLast);
  document.getElementById('melReaderBottomCanonical').addEventListener('click',function(){jumpBottom(true)});
  document.getElementById('melReaderLargeCanonical').addEventListener('click',function(){const h=Math.min(Math.max(window.innerHeight*.74,560),960);log.style.height=Math.round(h)+'px';store(HEIGHT_KEY,Math.round(h));jumpBottom(true)});
  document.getElementById('mentorRoomSendCanonical').addEventListener('click',send);
  document.getElementById('mentorRoomInputCanonical').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}});
  document.querySelectorAll('.nav button[data-view]').forEach(function(b){b.addEventListener('click',function(){store(PANEL_KEY,b.dataset.view)})});
  renderRoom();const panel=read(PANEL_KEY)||'multi';setTimeout(function(){activatePanel(panel);if(panel==='multi')jumpBottom(false)},120);return true
}
let tries=0;const timer=setInterval(function(){tries++;if(install()||tries>30)clearInterval(timer)},100);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,30)});else setTimeout(install,30);
})();</script>`;

export async function onRequestGet(context){
  const response=await controlRoom(context);
  let body=await response.text();
  body=body.includes('</body>')?body.replace('</body>',PATCH+'</body>'):body+PATCH;
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-store, max-age=0');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}