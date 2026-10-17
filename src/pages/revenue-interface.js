// MEL WORK — real Taskmarket drafts, owner review and separate submission.
// Read and write through the existing authenticated revenue API; only the
// owner's explicit click may approve or reject a human-step draft.

function page() {
return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MEL WORK</title><link rel="icon" href="/assets/avatars/mel-full.webp"><style>
:root{color-scheme:dark;--bg:#07111f;--panel:#101d31;--line:#24344d;--text:#f8fafc;--muted:#a7b5c9;--blue:#60a5fa;--good:#6ee7b7;--warn:#fbbf24;--bad:#fda4af}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at top left,#172f50 0,transparent 42%),var(--bg);color:var(--text);font:15px/1.5 system-ui,"Segoe UI",sans-serif}
a{color:#93c5fd}.wrap{max-width:980px;margin:auto;padding:24px 16px 48px}
.top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.brand{display:flex;align-items:center;gap:12px}.brand img{width:52px;height:52px;border-radius:50%;object-fit:cover}
h1{margin:0;font-size:28px}h2{margin:0 0 10px;font-size:17px}.sub,.muted{color:var(--muted)}
.button,button{appearance:none;border:1px solid var(--line);background:#14233a;color:var(--text);border-radius:12px;padding:10px 16px;font:inherit;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px}
button.primary{background:#2563eb;border-color:#2563eb;font-weight:600}button:disabled{opacity:.6;cursor:wait}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px}
.metric{font-size:28px;font-weight:700}.small{font-size:13px;color:var(--muted)}
section.card{margin-top:14px}.row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--line)}.row:first-child{border-top:0}
.tag{font-size:12px;border-radius:999px;padding:2px 9px;border:1px solid var(--line);white-space:nowrap}.good{color:var(--good)}.warn{color:var(--warn)}.bad{color:var(--bad)}
#live{white-space:pre-wrap;font:13px/1.5 ui-monospace,Consolas,monospace;color:#cbd5e1;max-height:320px;overflow:auto;margin-top:10px}
#live:empty{display:none}pre.doc{white-space:pre-wrap;background:#0b1626;border:1px solid var(--line);border-radius:12px;padding:12px;max-height:420px;overflow:auto}
.review-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.review-actions button{padding:6px 10px;min-height:36px}
@media(max-width:720px){.grid{grid-template-columns:1fr}.metric{font-size:24px}}
</style></head><body><main class="wrap">
<header class="top"><div class="brand"><img src="/assets/avatars/mel-full.webp" alt=""><div><h1>MEL WORK</h1><div class="sub">MEL travaille et remet ses missions toute seule.</div></div></div>
<div><a class="button" href="/professor">← MEL</a> <button id="workNow" class="primary" type="button">Travailler maintenant</button></div></header>
<div class="grid">
<article class="card"><h2>Ton PC</h2><div id="pcState" class="metric">…</div><div id="pcDetail" class="small">MEL remet les missions depuis ton PC.</div></article>
<article class="card"><h2>Missions remises</h2><div id="submitted" class="metric">…</div><div id="submittedDetail" class="small">Au plus 3 par jour.</div></article>
<article class="card"><h2>Prochain travail</h2><div id="next" class="metric">…</div><div class="small">Toutes les 6 heures, sans rien faire de ta part.</div></article>
</div>
<section class="card" id="liveSection"><h2>En ce moment</h2><div id="lastCycle" class="muted">Lecture…</div><div id="live" aria-live="polite"></div></section>
<section class="card"><h2>Brouillons à valider</h2><p class="small">✓ approuve le brouillon ; ✗ le refuse. Aucune action ne réclame, ne publie ou ne soumet une mission externe.</p><div id="draftsList" class="muted">Lecture…</div></section>
<section class="card"><h2>Dernières missions</h2><div id="submissionsList" class="muted">Lecture…</div></section>
<section class="card"><h2>Nouvelles sources de revenus (veille de la nuit)</h2><div id="watchList" class="muted">Lecture…</div></section>
<section class="card" id="docSection" hidden><h2 id="docTitle">Livrable</h2><pre class="doc" id="doc"></pre><div class="small" id="docHumanSteps"></div></section>
</main><script>
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=v=>{const t=typeof v==='number'?v:Date.parse(v);return Number.isFinite(t)?new Date(t).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'};
const SUB={QUEUED:['Remise en cours','warn'],SUBMITTED:['Remise ✓','good'],WINDOW_CLOSED:['Fermée avant remise','bad'],REJECTED:['Refusée','bad'],FAILED:['Échec, réessai','bad']};
const NEXT_SUB={QUEUED:'Remise en cours depuis ton PC.',COMPANION_OFFLINE:'Terminé — sera remis quand ton PC sera allumé.',DAILY_LIMIT_REACHED:'Terminé — remis demain (limite du jour).',NOT_A_BOUNTY:'Terminé.',NEEDS_OWNER:'Terminé.'};
async function getJson(url,opts){const r=await fetch(url,{cache:'no-store',...opts});const d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.code||('HTTP '+r.status));return d}
function nextRun(){const n=new Date();for(let i=0;i<30;i++){const t=new Date(n.getTime()+i*3600e3);t.setUTCMinutes(17,0,0);if(t>n&&t.getUTCHours()%6===0)return t}return null}
async function loadPc(){try{const d=await getJson('/api/computer/v1/status');const pcs=(d.devices||[]).filter(x=>/win/i.test(String(x.platform||''))).sort((a,b)=>Number(b.last_seen_at||0)-Number(a.last_seen_at||0));const pc=pcs[0];
 if(pc&&pc.online===true){$('pcState').innerHTML='<span class="good">Allumé</span>';$('pcDetail').textContent=(pc.name||'PC')+' · Companion connecté'}
 else{$('pcState').innerHTML='<span class="warn">Éteint</span>';$('pcDetail').textContent=pc?'Vu le '+when(Number(pc.last_seen_at))+'. Les missions terminées attendent son retour.':'Companion pas encore installé.'}}
 catch{$('pcState').textContent='—';$('pcDetail').textContent='État du PC indisponible.'}}
async function loadSubmissions(){try{const d=await getJson('/api/revenue/submissions');const rows=d.submissions||[];const ok=rows.filter(r=>r.status==='SUBMITTED').length;
 $('submitted').textContent=String(ok);$('submittedDetail').textContent=rows.length?rows.length+' tentée(s) au total · au plus 3 par jour.':'Aucune pour le moment · au plus 3 par jour.';
 $('submissionsList').innerHTML=rows.length?rows.map(r=>{const s=SUB[r.status]||[r.status,''];return '<div class="row"><span>'+when(r.created_at)+' · <a href="#" data-artifact="'+esc(r.artifact_id)+'">mission '+esc(String(r.task_id).slice(0,10))+'…</a></span><span class="tag '+s[1]+'">'+esc(s[0])+'</span></div>'}).join(''):'MEL n’a encore rien remis. Elle choisit seulement des missions qu’elle peut terminer seule.'}
 catch(e){$('submitted').textContent='—';$('submissionsList').textContent='Liste indisponible ('+e.message+').'}}
async function loadDrafts(){try{const d=await getJson('/api/revenue/direct-work');const rows=d.artifacts||[];
 const pending=rows.filter(r=>r.status==='DRAFT_UNVERIFIED'||r.status==='VERIFIED_LOCALLY');
 $('draftsList').innerHTML=pending.length?pending.map(r=>'<div class="row"><span><a href="#" data-artifact="'+esc(r.id)+'">Mission '+esc(String(r.mission_id||'').slice(0,30))+'</a><br><span class="small">'+when(r.created_at)+' · '+esc(r.status)+'</span></span><span class="review-actions"><button type="button" data-decision="approve" data-review-id="'+esc(r.id)+'" aria-label="Approuver ce brouillon">✓ Approuver</button><button type="button" data-decision="reject" data-review-id="'+esc(r.id)+'" aria-label="Refuser ce brouillon">✗ Refuser</button></span></div>').join(''):'Aucun brouillon en attente de validation.';
 }catch(e){$('draftsList').textContent='Brouillons indisponibles ('+e.message+').'}}
async function loadWatch(){try{const d=await getJson('/api/revenue/watch');const rows=(d.opportunities||[]).slice(0,8);
 $('watchList').innerHTML=rows.length?rows.map(o=>'<div class="row"><span><a href="'+esc(o.url)+'" target="_blank" rel="noopener">'+esc(o.title||o.name||o.url)+'</a>'+(o.summary?'<br><span class="small">'+esc(String(o.summary).slice(0,220))+'</span>':'')+'</span>'+(o.status==='NEW'?'<span class="tag good">Nouveau</span>':'')+'</div>').join(''):'La veille tourne chaque nuit ; rien de nouveau pour l’instant.'}
 catch{$('watchList').textContent='Veille indisponible.'}}
async function loadCycle(){try{const d=await getJson('/api/revenue/direct-work?latest_cycle=1');const c=d.cycle;if(!c){$('lastCycle').textContent='MEL n’a pas encore travaillé.';return}
 const r=c.result||{};let text='Dernier travail : '+when(c.updatedAt)+' — ';
 if(c.status==='RUNNING')text+='en cours…';else if(c.status==='FAILED')text+='interrompu ('+(r.code||'erreur')+'), elle réessaiera.';else if(c.status==='NO_ELIGIBLE_MISSION')text+='aucune mission faisable seule, elle réessaiera.';
 else text+=(r.title?'« '+r.title+' »'+(r.reward?' · '+r.reward:'')+'. ':'')+(NEXT_SUB[r.submission]||'Terminé.');
 $('lastCycle').textContent=text}catch{$('lastCycle').textContent='État du dernier travail indisponible.'}}
async function showArtifact(id){try{const d=await getJson('/api/revenue/direct-work?artifact_id='+encodeURIComponent(id));$('docSection').hidden=false;$('docTitle').textContent='Livrable du '+when(d.artifact.created_at);$('doc').textContent=d.artifact.content;$('docHumanSteps').textContent=(d.humanSteps||[]).length?'Étapes réservées au propriétaire : '+d.humanSteps.join(' ; '):'Aucune étape humaine indiquée pour ce brouillon.';$('docSection').scrollIntoView({behavior:'smooth'})}catch(e){alert('Livrable indisponible ('+e.message+').')}}
document.addEventListener('click',async e=>{
 const decision=e.target.closest('[data-decision]');
 if(decision){e.preventDefault();decision.disabled=true;
  try{await getJson('/api/revenue/direct-work/decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({artifactId:decision.dataset.reviewId,decision:decision.dataset.decision})});await loadDrafts();}
  catch(error){alert('Décision non enregistrée ('+error.message+').');decision.disabled=false}
  return;
 }
 const a=e.target.closest('[data-artifact]');if(a){e.preventDefault();showArtifact(a.dataset.artifact)}
});
$('workNow').onclick=async()=>{const b=$('workNow');b.disabled=true;b.textContent='MEL travaille…';$('live').textContent='';
 try{const r=await fetch('/api/revenue/direct-work',{method:'POST'});if(!r.ok||!r.body)throw new Error('HTTP '+r.status);const reader=r.body.getReader();const dec=new TextDecoder();let buf='';let drafting=false;
  for(;;){const {value,done}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;while((i=buf.indexOf('\\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);if(!line.trim())continue;let ev;try{ev=JSON.parse(line)}catch{continue}
   if(ev.type==='step'){$('live').textContent+=(drafting?'\\n':'')+'• '+ev.text+'\\n';drafting=false}else if(ev.type==='delta'){drafting=true;$('live').textContent+=ev.text}else if(ev.type==='error'){$('live').textContent+='\\n⚠ Interrompu : '+ev.code+'\\n'}
   $('live').scrollTop=$('live').scrollHeight}}}
 catch(e){$('live').textContent+='⚠ '+e.message+'\\n'}
 finally{b.disabled=false;b.textContent='Travailler maintenant';refresh()}};
function refresh(){const n=nextRun();$('next').textContent=n?n.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'—';loadPc();loadSubmissions();loadDrafts();loadWatch();loadCycle()}
refresh();setInterval(refresh,60000);
</script></body></html>`;
}

export async function onRequestGet() { return new Response(page(), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }); }
export { page as revenueInterfaceHtml };
