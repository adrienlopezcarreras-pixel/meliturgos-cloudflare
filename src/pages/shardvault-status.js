// deployment trigger: ShardVault dashboard
import { getShardVaultStatus, searchAutonomousShardVaultRepositories, runShardVaultCycle, setPreferredShardVaultEndpoint, activateValidatedShardVaultEndpoint, syncShardVaultCodeExternally, verifyShardVaultCodeReconstruction, storeCriticalCodeBundle } from '../continuity/shardvault-runtime.js';

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function page(){
return new Response(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MEL · ShardVault</title>
<style>
:root{font-family:Inter,system-ui,Segoe UI,sans-serif;color-scheme:dark}
*{box-sizing:border-box}
html,body{max-width:100%;overflow-x:hidden}
body{margin:0;background:#0b1020;color:#eef2ff}
main{width:min(100%,1080px);margin:auto;padding:28px 18px 50px;min-width:0}
h1{margin:0 0 8px;font-size:clamp(28px,5vw,44px);overflow-wrap:anywhere}.sub{color:#aab6d3;margin-bottom:24px;line-height:1.45}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:14px;min-width:0}
.card{min-width:0;background:#141b31;border:1px solid #273250;border-radius:16px;padding:16px;box-shadow:0 12px 30px #0004;overflow:hidden}
.big{font-size:30px;font-weight:800;margin-top:6px;overflow-wrap:anywhere}.ok{color:#72e0a0}.bad{color:#ff8f8f}.warn{color:#ffd479}
button{appearance:none;border:0;border-radius:12px;padding:13px 18px;font-weight:800;background:#eef2ff;color:#11182b;cursor:pointer;min-height:46px;white-space:normal}
button:disabled{opacity:.55;cursor:wait}.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0;align-items:center}
small,.muted{color:#9eabc8}.row{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:9px 0;border-bottom:1px solid #26304a;min-width:0}.row:last-child{border-bottom:0}.row>*{min-width:0;overflow-wrap:anywhere;word-break:break-word}.row>div:last-child{text-align:right}
pre{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;background:#0d1427;padding:12px;border-radius:12px;border:1px solid #25304a;max-height:360px;max-width:100%;overflow:auto}
.tag{display:inline-block;max-width:100%;padding:4px 8px;border-radius:999px;background:#24304f;margin:2px;font-size:12px;overflow-wrap:anywhere}.preferBtn{margin-left:8px;padding:8px 10px;min-height:34px;font-size:12px}
.section{margin-top:18px}a{color:#cbd7ff;overflow-wrap:anywhere}.pulse{animation:p 1.1s infinite alternate}@keyframes p{to{opacity:.5}}
@media(max-width:640px){
 body{font-size:15px}
 main{padding:18px 12px calc(28px + env(safe-area-inset-bottom))}
 h1{font-size:30px;line-height:1.05}
 h2{font-size:20px;margin-top:0}
 .sub{font-size:14px;margin-bottom:16px}
 .toolbar{display:grid;grid-template-columns:1fr;gap:8px;margin:14px 0 16px}
 .toolbar button,.toolbar a{width:100%;min-width:0}
 .toolbar a{display:flex;min-height:44px;align-items:center;justify-content:center;border:1px solid #34405f;border-radius:12px;text-decoration:none;background:#11182b;padding:10px 12px}
 .grid{grid-template-columns:1fr;gap:10px}
 .card{padding:14px;border-radius:14px}
 .big{font-size:26px}
 .row{display:grid;grid-template-columns:1fr;gap:5px;padding:10px 0}
 .row>div:last-child{text-align:left}
 .row>b,.row>strong,.row>.muted{width:100%}
 .section{margin-top:12px}
 pre{font-size:13px;line-height:1.45;max-height:300px;padding:10px}
 .tag{font-size:12px;margin:2px 4px 2px 0}.preferBtn{width:100%;margin:7px 0 0}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}@media(max-width:380px){
 main{padding-left:10px;padding-right:10px}
 h1{font-size:27px}
 .card{padding:12px}
}
</style></head>
<body><main>
<h1>ShardVault · statut</h1>
<div class="sub">Continuité mémoire de MEL · chiffrement, fragmentation 4/7, réparation et recherche autonome.</div>
<div class="toolbar">
<button id="refresh">Actualiser</button>
<button id="snapshotNow">Sauvegarder maintenant</button>
<button id="search">Nouvelle recherche Internet</button>\n<button id="reconstructCode">Tester reconstruction du code</button>
<a href="/" style="align-self:center">← Retour à MEL</a>
</div>
<div id="summary" class="grid"></div>
<div class="section card"><h2>Dernier snapshot</h2><div id="snapshotInfo">Chargement…</div></div>
<div class="section card"><h2>Dépôts sélectionnés</h2><div id="endpoints">Chargement…</div></div>
<div class="section card"><h2>Copies du code de MEL</h2><div id="codeBackup">Chargement…</div></div>
<div class="section card"><h2>Exploration Internet</h2><div class="muted" style="margin-bottom:8px"><b>Mode lecture :</b> ouvrir cette page ne déclenche aucune recherche, écriture ni synchronisation. Les automatismes de continuité restent gérés hors de cette interface ; ici, toute mutation exige une action explicite.</div><div id="searchStatus" class="muted" role="status" aria-live="polite">Les candidats sont validés par documentation API officielle puis par un test réel écriture/lecture.</div><div id="results"></div></div>
<div class="section card"><h2>Détails techniques</h2><pre id="raw">Chargement…</pre></div>
</main>
<script>
const $=id=>document.getElementById(id),qsa=s=>[...document.querySelectorAll(s)];
const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('fr-FR'):'—';
function safe(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function card(label,value,state=''){return '<div class="card"><small>'+safe(label)+'</small><div class="big '+state+'">'+safe(value)+'</div></div>'}
function endpointRow(e,selectable=false,preferredId=null){const where=e.backend==='r2'?(safe(e.bucket||'R2')+' · '+safe(e.key_prefix||'')):e.backend==='d1'?('D1 · '+safe(e.key_prefix||'shardvault_objects')):(safe(e.operatorDomain||'—')+' · '+safe(e.providerId||'—')+' · '+safe(e.jurisdiction||'—')+(e.expectedRetentionDays?' · rétention '+fmt(e.expectedRetentionDays)+' j':''));const active=e.active===true;const used=Number(e.used_fragments||0);const qualified=e.evidenceVerification==='reviewed_documentation_plus_live_roundtrip'||!!e.verifiedAt;const badges=(active?'<span class="tag ok">ACTIF</span>':'')+(used?'<span class="tag ok">UTILISÉ '+fmt(used)+' fragment'+(used>1?'s':'')+'</span>':'')+(qualified?'<span class="tag ok">QUALIFIÉE · test E/L réel</span>':'');const action=selectable?('<button class="preferBtn" data-endpoint="'+safe(e.id)+'" '+(active?'disabled':'')+'>'+(active?'ACTIVÉ':'Utiliser ce dépôt')+'</button>'):'';return '<div class="row"><div><b>'+safe(e.id)+'</b><div class="muted">'+where+(e.verifiedAt?' · vérifiée '+safe(e.verifiedAt):'')+'</div></div><div>'+badges+'<span class="tag">'+safe(e.backend||'http')+'</span><span class="tag">'+(e.autonomous?'autonome':'configuré')+'</span><span class="tag">score '+fmt(e.score)+'</span>'+action+'</div></div>'}
function bindPreferenceButtons(){
 qsa('.preferBtn').forEach(btn=>btn.onclick=()=>activateEndpoint(btn.dataset.endpoint,btn));
}
async function activateEndpoint(endpointId,btn){
 if(!endpointId)return;
 const old=btn.textContent;btn.disabled=true;btn.textContent='Activation…';
 try{
  const r=await fetch('/api/gen2/shardvault/activate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint_id:endpointId})});
  const d=await r.json();
  if(!r.ok||d.ok===false)throw new Error(d.status||d.error||('HTTP '+r.status));
  $('searchStatus').className='ok';$('searchStatus').textContent='Dépôt ACTIVÉ : '+endpointId+' · '+fmt(d.used_fragments)+' fragment(s) écrit(s) dans '+safe(d.snapshot_id||'le nouveau snapshot')+'.';
  await load();
 }catch(e){$('searchStatus').className='bad';$('searchStatus').textContent='Activation impossible : '+e.message;btn.disabled=false;btn.textContent=old}
}
function renderDiscovery(d,prefix='Exploration',preferredId=null,activeIds=[]){
 if(!d)return;
 $('searchStatus').className=d.ok?'ok':'bad';
 $('searchStatus').textContent=d.ok?prefix+' · génération '+fmt(d.generation||1)+' : '+fmt(d.new_leads??(d.leads||[]).length)+' nouvelles pistes ('+fmt(d.known_leads||0)+' connues), '+fmt(d.discovered)+' cibles vérifiables, '+fmt(d.probed)+' testées, '+fmt((d.selected||[]).length)+' retenues · '+(d.target_reached?'OBJECTIF 7/7 ATTEINT':((d.selected||[]).length?('progression '+fmt((d.selected||[]).length)+' / '+fmt(d.target_count||7)+' · recherche continue active'):'recherche continue active'))+(d.searched_at?' · '+safe(d.searched_at):''):(prefix+' échouée : '+safe(d.error||d.status||'erreur'));
 const sources=(d.internet_sources||[]).map(x=>'<div class="row"><span>'+safe(x.id||x.kind||'source')+'</span><span class="muted">'+safe(x.status||'—')+(x.leads!=null?' · '+fmt(x.leads)+' pistes':'')+(x.error?' · '+safe(x.error):'')+'</span></div>').join('');
 const leads=(d.leads||[]).slice(0,40).map(x=>'<div class="row"><span>'+safe(x.name||'piste')+'</span><span class="muted">'+safe(x.summary||x.url||'à vérifier')+'</span></div>').join('');
 const activeSet=new Set((activeIds||[]).map(String));
 const sel=(d.selected||[]).map(e=>endpointRow({...e,active:activeSet.has(String(e.id||''))||String(e.id||'')===String(preferredId||'')},true,preferredId)).join('')||'<div class="muted">Aucune nouvelle cible durable n’a encore satisfait tous les contrôles.</div>';
 const rej=(d.rejected||[]).slice(0,25).map(x=>'<div class="row"><span>'+safe(x.id||x.source||'candidat')+'</span><span class="muted">'+safe(x.reason||'rejeté')+'</span></div>').join('');
 $('results').innerHTML='<h3>Sources Internet parcourues</h3>'+(sources||'<div class="muted">Aucune source chargée.</div>')+'<h3>Nouvelles pistes trouvées</h3>'+(leads||'<div class="muted">Aucune piste générique.</div>')+'<h3>Cibles compatibles retenues</h3>'+sel+'<h3>Rejets techniques</h3>'+(rej||'<div class="muted">Aucun rejet.</div>');
 bindPreferenceButtons();
}
async function load(){
 $('refresh').disabled=true;
 try{
  const r=await fetch('/api/gen2/shardvault/status',{cache:'no-store'}),d=await r.json();
  const h=d.health||{},s=d.scheme||{};
  $('summary').innerHTML=[
   card('État',d.status||'—',d.ok?'ok':'bad'),
   card('Fragments sains',h.healthy_shards!=null?fmt(h.healthy_shards)+' / '+fmt(h.total_shards):'—',h.recoverable===false?'bad':'ok'),
   card('Seuil de récupération',s.data_shards!=null?fmt(s.data_shards)+' / '+fmt(s.total_shards):'—',''),
   card('Pertes tolérées',s.tolerated_losses!=null?fmt(s.tolerated_losses):'—','warn'),
   card('Dépôts externes actifs',(d.selected_endpoints||[]).filter(e=>e.backend==='http'&&e.active===true).length+' / 7',(d.selected_endpoints||[]).filter(e=>e.backend==='http'&&e.active===true).length>=7?'ok':'warn'),
   card('Mode autonome',d.autonomous_enabled?'ACTIF':'INACTIF',d.autonomous_enabled?'ok':'warn')
  ].join('');
  const l=d.latest;
  $('snapshotInfo').innerHTML=l?'<div class="row"><span>ID</span><b>'+safe(l.snapshot_id)+'</b></div><div class="row"><span>Révision</span><b>'+fmt(l.revision)+'</b></div><div class="row"><span>Créé</span><b>'+safe(l.created_at||'—')+'</b></div><div class="row"><span>Taille fragment</span><b>'+fmt(l.shard_size)+' octets</b></div>':'Aucun snapshot valide trouvé.';
  const allSelected=d.selected_endpoints||[];
  const externalSelected=allSelected.filter(e=>e.backend==='http');
  const internalSelected=allSelected.filter(e=>e.backend!=='http');
  $('endpoints').innerHTML=
   '<h3>Dépôts externes actifs · '+fmt(externalSelected.filter(e=>e.active===true).length)+' / 7</h3>'+
   (externalSelected.length?externalSelected.map(e=>endpointRow(e,false,d.preferred_endpoint?.endpoint_id||null)).join(''):'<div class="muted">Aucun dépôt externe actif.</div>')+
   '<h3>Fallbacks internes · hors quota 7/7</h3>'+
   (internalSelected.length?internalSelected.map(e=>endpointRow(e,false,d.preferred_endpoint?.endpoint_id||null)).join(''):'<div class="muted">Aucun fallback interne utilisé par le dernier snapshot.</div>');
  const code=d.code_survival||{},ext=code.external||{};
  const extEndpoints=Array.isArray(ext.endpoints)?ext.endpoints:[];
  $('codeBackup').innerHTML=
   '<div class="row"><span>Source GitHub</span><b>'+safe(code.repository||'non identifié')+(code.sha?' · '+safe(String(code.sha).slice(0,12)):'')+'</b></div>'+
   '<div class="row"><span>Cache interne Cloudflare R2</span><b class="'+(code.ok?'ok':'warn')+'">'+safe(code.status||'—')+'</b></div>'+
   '<div class="row"><span>Copie ShardVault externe</span><b class="'+(ext.status==='COPIED'&&extEndpoints.length>=7?'ok':'warn')+'">'+safe(ext.status||'EN ATTENTE')+(extEndpoints.length?' · '+fmt(extEndpoints.length)+' dépôt(s) externe(s)':'')+'</b></div>'+
   (extEndpoints.length?'<div class="row"><span>Dépôts externes du code</span><span class="muted">'+extEndpoints.map(safe).join(' · ')+'</span></div>':'')+
   (ext.snapshot_id?'<div class="row"><span>Snapshot code</span><span class="muted">'+safe(ext.snapshot_id)+'</span></div>':'')+
   (code.key?'<div class="row"><span>Objet cache R2</span><span class="muted">'+safe(code.bucket||'')+' / '+safe(code.key)+'</span></div>':'');
  const actualActiveIds=(d.selected_endpoints||[]).filter(e=>e.backend==='http'&&e.active===true).map(e=>e.id);
  if(d.last_discovery)renderDiscovery(d.last_discovery,'Dernière exploration automatique',d.preferred_endpoint?.endpoint_id||null,actualActiveIds);
  $('raw').textContent=JSON.stringify(d,null,2);
 }catch(e){$('summary').innerHTML=card('Erreur',e.message,'bad');$('raw').textContent=String(e)}
 finally{$('refresh').disabled=false}
}
async function snapshot(){
 const b=$('snapshotNow');b.disabled=true;b.textContent='Sauvegarde en cours…';
 try{
  const r=await fetch('/api/gen2/shardvault/snapshot',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const d=await r.json();
  if(!r.ok||d.ok===false)throw new Error(d.error||d.reason||('HTTP '+r.status));
  $('searchStatus').className='ok';$('searchStatus').textContent='Sauvegarde créée : '+(d.snapshot_id||'snapshot')+' · '+fmt(d.shards)+' fragments.';
  await load();
 }catch(e){$('searchStatus').className='bad';$('searchStatus').textContent='Sauvegarde échouée : '+e.message}
 finally{b.disabled=false;b.textContent='Sauvegarder maintenant'}
}
async function syncCodeExternal({quiet=false}={}){
 const b=$('search');
 if(!quiet){b.disabled=true;b.textContent='Synchronisation du code…';}
 try{
  let last=null;
  for(let attempt=1;attempt<=16;attempt++){
   const cr=await fetch('/api/gen2/shardvault/code-sync',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
   const cd=await cr.json();last=cd;
   if(!cr.ok||cd.ok===false)throw new Error(cd.status||cd.error||('HTTP '+cr.status));
   const done=fmt((cd.external?.endpoints||[]).length),target=fmt(cd.external?.target_count||7);
   if(cd.status==='COPIED'){
    $('searchStatus').className='ok';$('searchStatus').textContent='Code critique copié et relu sur '+done+' dépôts externes.';
    return cd;
   }
   if(!['COPYING','RETRY_TARGETS'].includes(cd.status))throw new Error(cd.status||'CODE_SYNC_UNKNOWN');
   $('searchStatus').className='muted pulse';$('searchStatus').textContent='Synchronisation progressive du code : '+done+'/'+target+' copies vérifiées.';
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('CODE_SYNC_PROGRESS_TIMEOUT:'+String(last?.status||'UNKNOWN'));
 }catch(e){
  $('searchStatus').className='warn';$('searchStatus').textContent='Synchronisation du code externe à reprendre : '+e.message;
  return null;
 }finally{
  if(!quiet){b.disabled=false;b.textContent='Nouvelle recherche Internet';}
 }
}
async function reconstructCode(){
 const b=$('reconstructCode');b.disabled=true;b.textContent='Reconstruction en cours…';
 try{
  const r=await fetch('/api/gen2/shardvault/code-reconstruct',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({simulate_missing:[0,2,5]})});
  const d=await r.json();
  if(!r.ok||d.ok===false)throw new Error(d.status||d.error||('HTTP '+r.status));
  $('searchStatus').className='ok';
  $('searchStatus').textContent='Reconstruction code vérifiée · SHA '+safe(String(d.sha||d.git_sha||'').slice(0,12))+' · '+fmt(d.healthy_shards)+' fragments sains / '+fmt(d.required_shards)+' requis · 3 pertes simulées tolérées.';
 }catch(e){$('searchStatus').className='bad';$('searchStatus').textContent='Reconstruction du code échouée : '+e.message}
 finally{b.disabled=false;b.textContent='Tester reconstruction du code'}
}
async function search(){
 const b=$('search');b.disabled=true;b.textContent='Recherche en cours…';$('searchStatus').className='muted pulse';$('searchStatus').textContent='MEL vérifie les politiques puis effectue des tests d’écriture/lecture sur les candidats autorisés.';
 $('results').innerHTML='';
 try{
  const r=await fetch('/api/gen2/shardvault/search',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const d=await r.json();
  const sd=await fetch('/api/gen2/shardvault/status',{cache:'no-store'}).then(x=>x.json()).catch(()=>null);
  const activeIds=(sd?.selected_endpoints||[]).filter(e=>e.backend==='http'&&e.active===true).map(e=>e.id);
  renderDiscovery(d,'Nouvelle exploration',sd?.preferred_endpoint?.endpoint_id||null,activeIds);
  if(d.target_reached){
    $('searchStatus').className='muted pulse';$('searchStatus').textContent='7/7 externes validés. MEL crée le snapshot externe puis synchronise aussi le code critique.';
    const cd=await syncCodeExternal({quiet:true});
    if(cd)$('searchStatus').textContent='7/7 externes actifs · code critique copié sur '+fmt((cd.external?.endpoints||[]).length)+' dépôts externes.';
  }
  await load();
 }catch(e){$('searchStatus').className='bad';$('searchStatus').textContent='Erreur : '+e.message}
 finally{b.disabled=false;b.textContent='Nouvelle recherche Internet'}
}
$('refresh').onclick=load;$('snapshotNow').onclick=snapshot;$('search').onclick=search;$('reconstructCode').onclick=reconstructCode;load();const shardStatusTimer=setInterval(()=>{if(!document.hidden)load()},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});window.addEventListener('beforeunload',()=>clearInterval(shardStatusTimer),{once:true});
</script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}

export async function handleShardVaultStatus(request,env){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/shardvault')return page();
  if(request.method==='GET'&&url.pathname==='/api/gen2/shardvault/status')return Response.json(await getShardVaultStatus(env),{headers:{'cache-control':'no-store'}});
  if(request.method==='POST'&&url.pathname==='/api/gen2/shardvault/snapshot'){
    const result=await runShardVaultCycle(env,{force:true});
    return Response.json(result,{status:result.ok?200:503,headers:{'cache-control':'no-store'}});
  }
  if(request.method==='POST'&&url.pathname==='/api/gen2/shardvault/search'){
    const result=await searchAutonomousShardVaultRepositories(env);
    return Response.json(result,{status:result.ok?200:503,headers:{'cache-control':'no-store'}});
  }
  if(request.method==='POST'&&url.pathname==='/api/gen2/shardvault/code-source'){
    const type=String(request.headers.get('content-type')||'').toLowerCase();
    if(!type.includes('application/octet-stream')&&!type.includes('application/gzip'))return Response.json({ok:false,status:'CRITICAL_BUNDLE_CONTENT_TYPE_INVALID'},{status:415,headers:{'cache-control':'no-store'}});
    const payload=new Uint8Array(await request.arrayBuffer());
    const result=await storeCriticalCodeBundle(env,payload);
    return Response.json(result,{status:result.ok?200:409,headers:{'cache-control':'no-store'}});
  }
  if(request.method==='POST'&&url.pathname==='/api/gen2/shardvault/code-sync'){
    const result=await syncShardVaultCodeExternally(env);
    return Response.json(result,{status:result.ok?200:409,headers:{'cache-control':'no-store'}});
  }
  if(request.method==='POST'&&url.pathname==='/api/gen2/shardvault/code-reconstruct'){
    const body=await request.json().catch(()=>({}));
    const result=await verifyShardVaultCodeReconstruction(env,{dropIndexes:Array.isArray(body?.simulate_missing)?body.simulate_missing:[]});
    return Response.json(result,{status:result.ok?200:409,headers:{'cache-control':'no-store'}});
  }
  if(request.method==='POST'&&url.pathname==='/api/gen2/shardvault/preference'){
    const body=await request.json().catch(()=>({}));
    const result=await setPreferredShardVaultEndpoint(env,body?.endpoint_id);
    return Response.json(result,{status:result.ok?200:400,headers:{'cache-control':'no-store'}});
  }
  if(request.method==='POST'&&url.pathname==='/api/gen2/shardvault/activate'){
    const body=await request.json().catch(()=>({}));
    const result=await activateValidatedShardVaultEndpoint(env,body?.endpoint_id);
    return Response.json(result,{status:result.ok?200:409,headers:{'cache-control':'no-store'}});
  }
  return null;
}
