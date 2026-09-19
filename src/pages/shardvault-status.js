// deployment trigger: ShardVault dashboard
import { getShardVaultStatus, searchAutonomousShardVaultRepositories, runShardVaultCycle } from '../continuity/shardvault-runtime.js';

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
.tag{display:inline-block;max-width:100%;padding:4px 8px;border-radius:999px;background:#24304f;margin:2px;font-size:12px;overflow-wrap:anywhere}
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
 pre{font-size:12px;line-height:1.45;max-height:300px;padding:10px}
 .tag{font-size:11px;margin:2px 4px 2px 0}
}
@media(max-width:380px){
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
<button id="snapshot">Sauvegarder maintenant</button>
<button id="search">Explorer Internet pour de nouvelles cibles</button>
<a href="/" style="align-self:center">← Retour à MEL</a>
</div>
<div id="summary" class="grid"></div>
<div class="section card"><h2>Dernier snapshot</h2><div id="snapshot">Chargement…</div></div>
<div class="section card"><h2>Dépôts sélectionnés</h2><div id="endpoints">Chargement…</div></div>
<div class="section card"><h2>Copies du code de MEL</h2><div id="codeBackup">Chargement…</div></div>
<div class="section card"><h2>Exploration Internet</h2><div id="searchStatus" class="muted">Source de départ : catalogue public + recherche GitHub de catalogues ShardVault. Aucun hébergeur n’est écrit tant que sa politique ne l’autorise pas explicitement.</div><div id="results"></div></div>
<div class="section card"><h2>Détails techniques</h2><pre id="raw">Chargement…</pre></div>
</main>
<script>
const $=id=>document.getElementById(id);
const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('fr-FR'):'—';
function safe(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function card(label,value,state=''){return '<div class="card"><small>'+safe(label)+'</small><div class="big '+state+'">'+safe(value)+'</div></div>'}
function endpointRow(e){const where=e.backend==='r2'?(safe(e.bucket||'R2')+' · '+safe(e.key_prefix||'')):(safe(e.operatorDomain||'—')+' · '+safe(e.providerId||'—')+' · '+safe(e.jurisdiction||'—'));return '<div class="row"><div><b>'+safe(e.id)+'</b><div class="muted">'+where+'</div></div><div><span class="tag">'+safe(e.backend||'http')+'</span><span class="tag">'+(e.autonomous?'autonome':'configuré')+'</span><span class="tag">score '+fmt(e.score)+'</span></div></div>'}
function renderDiscovery(d,prefix='Exploration'){
 if(!d)return;
 $('searchStatus').className=d.ok?'ok':'bad';
 $('searchStatus').textContent=d.ok?prefix+' : '+fmt((d.internet_sources||[]).length)+' sources Internet, '+fmt((d.leads||[]).length)+' pistes, '+fmt(d.discovered)+' cibles ShardVault, '+fmt(d.probed)+' testées, '+fmt((d.selected||[]).length)+' retenues'+(d.searched_at?' · '+safe(d.searched_at):''):(prefix+' échouée : '+safe(d.error||d.status||'erreur'));
 const sources=(d.internet_sources||[]).map(x=>'<div class="row"><span>'+safe(x.id||x.kind||'source')+'</span><span class="muted">'+safe(x.status||'—')+(x.leads!=null?' · '+fmt(x.leads)+' pistes':'')+'</span></div>').join('');
 const leads=(d.leads||[]).slice(0,40).map(x=>'<div class="row"><span>'+safe(x.name||'piste')+'</span><span class="muted">'+safe(x.summary||x.url||'à vérifier')+'</span></div>').join('');
 const sel=(d.selected||[]).map(endpointRow).join('')||'<div class="muted">Aucune nouvelle cible n’a encore satisfait toutes les vérifications d’autorisation et de durabilité.</div>';
 const rej=(d.rejected||[]).slice(0,25).map(x=>'<div class="row"><span>'+safe(x.id||x.source||'candidat')+'</span><span class="muted">'+safe(x.reason||'rejeté')+'</span></div>').join('');
 $('results').innerHTML='<h3>Sources Internet parcourues</h3>'+(sources||'<div class="muted">Aucune source chargée.</div>')+'<h3>Pistes trouvées</h3>'+(leads||'<div class="muted">Aucune piste générique.</div>')+'<h3>Cibles compatibles retenues</h3>'+sel+'<h3>Rejets techniques</h3>'+(rej||'<div class="muted">Aucun rejet.</div>');
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
   card('Dépôts actifs',(d.selected_endpoints||[]).length,''),
   card('Mode autonome',d.autonomous_enabled?'ACTIF':'INACTIF',d.autonomous_enabled?'ok':'warn')
  ].join('');
  const l=d.latest;
  $('snapshot').innerHTML=l?'<div class="row"><span>ID</span><b>'+safe(l.snapshot_id)+'</b></div><div class="row"><span>Révision</span><b>'+fmt(l.revision)+'</b></div><div class="row"><span>Créé</span><b>'+safe(l.created_at||'—')+'</b></div><div class="row"><span>Taille fragment</span><b>'+fmt(l.shard_size)+' octets</b></div>':'Aucun snapshot valide trouvé.';
  $('endpoints').innerHTML=(d.selected_endpoints||[]).length?(d.selected_endpoints||[]).map(endpointRow).join(''):'Aucun dépôt actuellement sélectionné.';
  const code=d.code_survival||{};
  $('codeBackup').innerHTML='<div class="row"><span>GitHub</span><b>'+safe(code.repository||'non identifié')+(code.sha?' · '+safe(String(code.sha).slice(0,12)):'')+'</b></div><div class="row"><span>Cloudflare R2</span><b class="'+(code.ok?'ok':'warn')+'">'+safe(code.status||'—')+'</b></div>'+(code.key?'<div class="row"><span>Objet R2</span><span class="muted">'+safe(code.bucket||'')+' / '+safe(code.key)+'</span></div>':'');
  if(d.last_discovery)renderDiscovery(d.last_discovery,'Dernière exploration automatique');
  $('raw').textContent=JSON.stringify(d,null,2);
 }catch(e){$('summary').innerHTML=card('Erreur',e.message,'bad');$('raw').textContent=String(e)}
 finally{$('refresh').disabled=false}
}
async function snapshot(){
 const b=$('snapshot');b.disabled=true;b.textContent='Sauvegarde en cours…';
 try{
  const r=await fetch('/api/gen2/shardvault/snapshot',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const d=await r.json();
  if(!r.ok||d.ok===false)throw new Error(d.error||d.reason||('HTTP '+r.status));
  $('searchStatus').className='ok';$('searchStatus').textContent='Sauvegarde créée : '+(d.snapshot_id||'snapshot')+' · '+fmt(d.shards)+' fragments.';
  await load();
 }catch(e){$('searchStatus').className='bad';$('searchStatus').textContent='Sauvegarde échouée : '+e.message}
 finally{b.disabled=false;b.textContent='Sauvegarder maintenant'}
}
async function search(){
 const b=$('search');b.disabled=true;b.textContent='Recherche en cours…';$('searchStatus').className='muted pulse';$('searchStatus').textContent='MEL vérifie les politiques puis effectue des tests d’écriture/lecture sur les candidats autorisés.';
 $('results').innerHTML='';
 try{
  const r=await fetch('/api/gen2/shardvault/search',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const d=await r.json();
  renderDiscovery(d,'Exploration manuelle');
  await load();
 }catch(e){$('searchStatus').className='bad';$('searchStatus').textContent='Erreur : '+e.message}
 finally{b.disabled=false;b.textContent='Explorer Internet pour de nouvelles cibles'}
}
$('refresh').onclick=load;$('snapshot').onclick=snapshot;$('search').onclick=search;load();setInterval(load,30000);
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
  return null;
}
