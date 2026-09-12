import { onRequestGet as controlRoom } from './control-room.js';

const STATUS_PROMPT = 'Fais un compte rendu très bref de ton état réel : tâche actuelle, dernier résultat vérifié, blocage, prochaine action. N’invente aucune exécution.';
const STYLE_PROMPT = 'MODE COMPLET — CONSIGNE DE STYLE PRIORITAIRE : réponds en français normal, moderne, direct et professionnel. Tutoie Adrien simplement. Pour tout avancement technique, distingue projet, action réellement lancée, résultat vérifié et preuve disponible. Ne prétends pas coder, tester, corriger ou déployer sans preuve runtime.\n\n';

const CANONICAL_UI = `
<div id="melCanonicalStatus" class="mel-canonical-status">
  <div class="status-actions">
    <button id="melStatusBtnV5" type="button">Statut MEL</button>
    <button id="melMentorBtnV5" type="button">Mentor gratuit</button>
    <button id="melNextBtnV5" type="button">Prochaine tâche</button>
  </div>
  <div class="status-copy">
    <div id="melCanonicalStatusText" class="status-line">État vérifiable à la demande.</div>
    <div id="melCanonicalEvidence" class="status-evidence">Mode zéro-euro : Mentor fail-closed, lecture/conseil uniquement.</div>
  </div>
</div>
<article id="mentorRoomCanonical" class="card wide mentor-room">
  <div class="mentor-room-head">
    <div class="mentor-identity">
      <img src="/assets/avatars/mel-spanish-20260911.webp" alt="MEL">
      <div><h3>Adrien · MEL · Mentor</h3><p>Salon Adrien · MEL · Teacher — Teacher autonome de relecture, sans dépense ajoutée.</p></div>
    </div>
    <span class="mentor-chip">0 € ajouté</span>
  </div>
  <div class="mentor-tools">
    <button id="melReaderLastCanonical" type="button">Dernière réponse</button>
    <button id="melReaderBottomCanonical" type="button">Fin du chat</button>
    <button id="melReaderLargeCanonical" type="button">Grande lecture</button>
    <span class="mentor-hint">↕ redimensionnable · F5 revient ici</span>
  </div>
  <div id="mentorRoomLogCanonical" class="mentor-log"><div class="empty">Le salon est prêt.</div></div>
  <div class="mentor-compose">
    <select id="mentorRoomTargetCanonical" aria-label="Destinataire">
      <option value="all">@tous · MEL + Mentor</option>
      <option value="mel">@MEL</option>
      <option value="mentor">@Mentor gratuit</option>
    </select>
    <textarea id="mentorRoomInputCanonical" placeholder="Écris ici…"></textarea>
    <button id="mentorRoomSendCanonical" class="primary" type="button">Envoyer</button>
  </div>
  <div id="mentorRouteCanonical" class="mentor-route-state">Routage : MEL + Mentor gratuit</div>
  <details class="mentor-details"><summary>Contrôle zéro-euro</summary><p>Le statut utilise /api/gen2/mentor/status sans inférence. Les conseils utilisent /api/gen2/mentor/chat ; sans les deux confirmations de gratuité côté serveur, Mentor reste local et n’effectue aucune inférence externe.</p></details>
</article>`;

const PATCH = `<style id="mel-full-canonical-style">
:root{--mel-gold:#d8b45f}
.mel-canonical-status{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;margin:0 0 12px;padding:10px 12px;border:1px solid rgba(216,180,95,.22);border-radius:14px;background:rgba(5,10,20,.72)}
.mel-canonical-status .status-copy{flex:1;min-width:250px}.status-line{font-size:.82rem;line-height:1.4;color:#e8edf6}.status-evidence{font-size:.72rem;color:#9fb0c5;margin-top:4px}.status-actions{display:flex;gap:7px;flex-wrap:wrap}.status-actions button{padding:7px 9px;min-height:34px;font-size:.75rem}
#mentorRoomCanonical{margin:0 0 14px;scroll-margin-top:12px;padding:14px}.mentor-room-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.mentor-identity{display:flex;gap:10px;align-items:center}.mentor-identity img{width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,.18)}.mentor-room-head h3{margin:0;font-size:1rem}.mentor-room-head p{margin:3px 0 0;color:#9fb0c5;font-size:.74rem}.mentor-chip{display:inline-flex;padding:4px 8px;border-radius:999px;border:1px solid rgba(216,180,95,.3);color:#ffe39a;font-size:.7rem;font-weight:800;white-space:nowrap}.mentor-log{height:clamp(360px,55vh,720px);min-height:300px;max-height:none;resize:vertical;overflow:auto;scrollbar-gutter:stable;overscroll-behavior:contain;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(1,5,14,.52);padding:10px}.mentor-msg{padding:9px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.07);line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 8px;color:#f7f9fc}.mentor-msg.adrien{background:rgba(216,180,95,.08);margin-left:5%}.mentor-msg.mel{background:rgba(76,120,225,.1);margin-right:5%}.mentor-msg.mentor{background:rgba(90,170,120,.09);margin-right:5%}.mentor-msg.system{background:rgba(170,55,55,.12)}.mentor-who{display:block;font-size:.68rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:#aebbd0;margin-bottom:4px}.mentor-tools{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:7px 0}.mentor-tools button{padding:6px 9px;min-height:32px;font-size:.73rem}.mentor-compose{display:grid;grid-template-columns:170px 1fr auto;gap:7px;margin-top:8px;position:sticky;bottom:0;padding-top:8px;background:linear-gradient(0deg,rgba(7,11,20,.98) 75%,rgba(7,11,20,0))}.mentor-compose textarea{min-height:78px;resize:vertical;border:1px solid rgba(255,255,255,.12);background:rgba(1,5,14,.66);color:#fff;border-radius:13px;padding:10px}.mentor-compose select{min-width:0}.mentor-route-state,.mentor-hint{font-size:.71rem;color:#97a6ba}.mentor-details{margin-top:7px;color:#97a6ba;font-size:.72rem}.mentor-details summary{cursor:pointer;color:#b9c7da}.mentor-details p{margin:6px 0 0;line-height:1.4}
.view[data-panel="multi"] .notice{padding:8px 10px;font-size:.78rem}.view[data-panel="multi"] .section-head{margin-bottom:10px}.view[data-panel="multi"] .card{box-shadow:0 16px 48px rgba(0,0,0,.22)}
@media(max-width:720px){.mel-canonical-status{padding:9px}.mentor-log{height:52vh;min-height:330px}.mentor-compose{grid-template-columns:1fr}.mentor-msg.adrien,.mentor-msg.mel,.mentor-msg.mentor{margin-left:0;margin-right:0}.mentor-room-head{align-items:flex-start}.mentor-room-head p{display:none}}
</style>
<script id="mel-full-canonical-runtime">(function(){
const ROOM_KEY='mel.mentor.room.v4';
const OLD_KEYS=['mel.mentor.room.v3','mel.mentor.room.v2','mel.mentor.room.v1'];
const PANEL_KEY='mel.full.last.panel.v2';
const HEIGHT_KEY='mel.full.reader.height.v3';
const STATUS_PROMPT=${JSON.stringify(STATUS_PROMPT)};
const PLAIN_STYLE=${JSON.stringify(STYLE_PROMPT)};
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function read(k){try{return localStorage.getItem(k)}catch{return null}}
function store(k,v){try{localStorage.setItem(k,String(v))}catch{}}
function parseRows(raw){try{const v=JSON.parse(raw||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function loadRoom(){let rows=parseRows(read(ROOM_KEY));if(rows.length)return rows;for(const k of OLD_KEYS){rows=parseRows(read(k));if(rows.length){saveRoom(rows);return rows}}return []}
function saveRoom(rows){try{localStorage.setItem(ROOM_KEY,JSON.stringify(rows.slice(-100)))}catch{}}
function post(url,body){return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(async function(r){const d=await r.json().catch(function(){return {}});if(!r.ok){const e=new Error(d.error||d.code||('HTTP '+r.status));e.code=d.code||('HTTP_'+r.status);throw e}return d})}
function getJson(url){return fetch(url,{headers:{accept:'application/json'}}).then(async function(r){const d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||d.code||('HTTP '+r.status));return d})}
function stableId(key){let v=read(key);if(!v){v=crypto.randomUUID();store(key,v)}return v}
function activatePanel(name){const btn=document.querySelector('button[data-view="'+name+'"]');if(btn){btn.click();store(PANEL_KEY,name)}}
function renderRoom(){const log=document.getElementById('mentorRoomLogCanonical');if(!log)return;const rows=loadRoom();log.innerHTML=rows.length?rows.map(function(r){return '<div class="mentor-msg '+esc(r.role)+'"><span class="mentor-who">'+esc(r.label)+'</span>'+esc(r.text)+'</div>'}).join(''):'<div class="empty">Le salon est prêt.</div>';log.scrollTop=log.scrollHeight}
function push(role,label,text){const rows=loadRoom();rows.push({role:role,label:label,text:String(text||''),at:Date.now()});saveRoom(rows);renderRoom();setTimeout(function(){jumpBottom(false)},20)}
function jumpBottom(smooth){const log=document.getElementById('mentorRoomLogCanonical');if(!log)return;if(smooth)log.scrollTo({top:log.scrollHeight,behavior:'smooth'});else log.scrollTop=log.scrollHeight}
function jumpLast(){const log=document.getElementById('mentorRoomLogCanonical');if(!log)return;const rows=log.querySelectorAll('.mentor-msg');if(rows.length)rows[rows.length-1].scrollIntoView({block:'end',behavior:'smooth'});else jumpBottom(true)}
async function askMel(text){const d=await post('/api/chat',{text:PLAIN_STYLE+String(text||''),conversation_id:stableId('mel.mentor.conversation'),device_id:stableId('mel.device'),ui_theme:'classic',intent_context:{surface:'control-room-canonical',target:'mel',tone:'plain-modern',fuzzy_language:true,evidence_required:true}});return d.text||d.answer||'Réponse MEL vide.'}
async function askFreeMentor(text,melAnswer){const context=loadRoom().slice(-8);const d=await post('/api/gen2/mentor/chat',{text:String(text||'')+(melAnswer?'\n\nRéponse MEL à relire :\n'+String(melAnswer):''),context:context});const policy=d.billing_policy||'inconnue';const provider=d.provider||'mentor';return {text:d.text||'Conseil Mentor vide.',meta:'Mentor : '+provider+' · '+policy+(d.external_inference_used?' · inférence externe confirmée gratuite':' · local/no external inference')}}
function mentorStatusMeta(d){return 'Mentor : '+String(d&&d.effective_provider||'?')+' · '+String(d&&d.billing_policy||'?')+(d&&d.external_inference_allowed?' · inférence externe confirmée gratuite':' · local/no external inference')}
async function getWorkState(){const out={jobs:[],job:null,next:null};try{const j=await getJson('/api/professor/dev/jobs');out.jobs=Array.isArray(j.jobs)?j.jobs:[];out.job=out.jobs.slice().sort(function(a,b){return Number(b.updated_at||b.created_at||0)-Number(a.updated_at||a.created_at||0)})[0]||null}catch{}try{const a=await getJson('/api/professor/dev/autonomy/status');out.next=a&&a.next?a.next:null}catch{}return out}
async function statusMel(){const out=document.getElementById('melCanonicalStatusText'),ev=document.getElementById('melCanonicalEvidence'),btn=document.getElementById('melStatusBtnV5');if(!out||!ev||!btn)return;btn.disabled=true;btn.textContent='Vérification…';try{const results=await Promise.allSettled([askMel(STATUS_PROMPT),getJson('/api/gen2/code/self-check'),getWorkState(),getJson('/api/gen2/mentor/status')]);out.textContent=results[0].status==='fulfilled'?results[0].value:'Réponse MEL indisponible.';const bits=[];if(results[1].status==='fulfilled'&&results[1].value&&results[1].value.ok)bits.push('Dépôt '+String(results[1].value.branch||'?')+' @ '+String(results[1].value.sha||'?'));if(results[2].status==='fulfilled'){const s=results[2].value;bits.push(s.job?'Job '+String(s.job.id||'?')+' · '+String(s.job.status||'?'):'Aucun job actif vérifié');if(s.next)bits.push('Prochaine '+String(s.next.id||'?'))}if(results[3].status==='fulfilled')bits.push(mentorStatusMeta(results[3].value));ev.textContent=bits.join(' · ')||'Aucune preuve runtime disponible.'}finally{btn.disabled=false;btn.textContent='Statut MEL'}}
async function mentorReview(){const out=document.getElementById('melCanonicalStatusText'),ev=document.getElementById('melCanonicalEvidence'),btn=document.getElementById('melMentorBtnV5');if(!out||!btn)return;btn.disabled=true;btn.textContent='Conseil…';try{const r=await askFreeMentor('Relis le travail actuel de MEL et conseille la prochaine action sûre.','');out.textContent=r.text;if(ev)ev.textContent=r.meta}finally{btn.disabled=false;btn.textContent='Mentor gratuit'}}
async function loadNext(){const out=document.getElementById('melCanonicalStatusText'),ev=document.getElementById('melCanonicalEvidence'),btn=document.getElementById('melNextBtnV5');if(!out||!ev||!btn)return;btn.disabled=true;btn.textContent='Lecture…';try{const s=await getWorkState();if(s.job&&['RUNNING','PENDING','QUEUED','IN_PROGRESS'].includes(String(s.job.status||'').toUpperCase())){out.textContent='Une tâche est déjà active : je n’en charge pas une seconde.';ev.textContent=String(s.job.id||'')+' · '+String(s.job.goal||'')+' · '+String(s.job.status||'');return}if(!s.next){out.textContent='Aucune prochaine tâche vérifiable dans la feuille de route.';return}out.textContent='Prochaine tâche : '+String(s.next.id||'')+' — '+String(s.next.title||'');ev.textContent=String(s.next.next||'');activatePanel('roadmap')}finally{btn.disabled=false;btn.textContent='Prochaine tâche'}}
async function send(){const input=document.getElementById('mentorRoomInputCanonical'),sel=document.getElementById('mentorRoomTargetCanonical'),btn=document.getElementById('mentorRoomSendCanonical'),state=document.getElementById('mentorRouteCanonical');if(!input||!sel||!btn||!state)return;const text=input.value.trim();if(!text)return;input.value='';push('adrien','Adrien',text);btn.disabled=true;btn.textContent='En cours…';const dest=sel.value;try{if(dest==='mel'){state.textContent='Routage : MEL';push('mel','MEL',await askMel(text))}else if(dest==='mentor'){state.textContent='Routage : Mentor gratuit';const r=await askFreeMentor(text,'');push('mentor','Mentor gratuit',r.text);state.textContent=r.meta}else{state.textContent='Routage : MEL puis Mentor gratuit';const mel=await askMel(text);push('mel','MEL',mel);const r=await askFreeMentor(text,mel);push('mentor','Mentor gratuit',r.text);state.textContent=r.meta}}catch(e){push('system','Système','Erreur : '+String(e.message||e))}finally{btn.disabled=false;btn.textContent='Envoyer'}}
function removeLegacyDuplicates(){['mentorRoom','mentorRoomV4','melStatusPanelV5','melReaderToolsV5'].forEach(function(id){const n=document.getElementById(id);if(n)n.remove()})}
function install(){removeLegacyDuplicates();const room=document.getElementById('mentorRoomCanonical'),log=document.getElementById('mentorRoomLogCanonical');if(!room||!log)return false;const savedH=Number(read(HEIGHT_KEY));if(Number.isFinite(savedH)&&savedH>=300&&savedH<=1100)log.style.height=savedH+'px';if('ResizeObserver'in window)new ResizeObserver(function(){const h=Math.round(log.getBoundingClientRect().height);if(h>=300)store(HEIGHT_KEY,h)}).observe(log);document.getElementById('melStatusBtnV5').addEventListener('click',statusMel);document.getElementById('melMentorBtnV5').addEventListener('click',mentorReview);document.getElementById('melNextBtnV5').addEventListener('click',loadNext);document.getElementById('melReaderLastCanonical').addEventListener('click',jumpLast);document.getElementById('melReaderBottomCanonical').addEventListener('click',function(){jumpBottom(true)});document.getElementById('melReaderLargeCanonical').addEventListener('click',function(){const h=Math.min(Math.max(window.innerHeight*.7,520),900);log.style.height=Math.round(h)+'px';store(HEIGHT_KEY,Math.round(h));jumpBottom(true)});document.getElementById('mentorRoomSendCanonical').addEventListener('click',send);document.getElementById('mentorRoomInputCanonical').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}});document.querySelectorAll('button[data-view]').forEach(function(b){b.addEventListener('click',function(){store(PANEL_KEY,b.dataset.view)})});renderRoom();const panel=read(PANEL_KEY)||'multi';setTimeout(function(){activatePanel(panel);if(panel==='multi')jumpBottom(false)},80);return true}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();</script>`;

export async function onRequestGet(context){
  const response=await controlRoom(context);
  let body=await response.text();
  const anchor='<section class="view" data-panel="multi">';
  if(body.includes(anchor)&&!body.includes('id="mentorRoomCanonical"')) body=body.replace(anchor,anchor+CANONICAL_UI);
  body=body.includes('</body>')?body.replace('</body>',PATCH+'</body>'):body+PATCH;
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-store, max-age=0');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
