const api=globalThis.browser,$=id=>document.getElementById(id);

function render(s){$('status').textContent=[
`État : ${s.running?'EN COURS':s.paused?'PAUSE':'TERMINÉ / INACTIF'}`,
`Découvertes : ${s.discovered||0}`,
`File restante : ${s.queue?.length||0}`,
`Conversations archivées : ${s.importedConversations||0}`,
`Captures partielles : ${Object.keys(s.partial||{}).length}`,
`Messages nouveaux : ${s.importedMessages||0}`,
`Doublons ignorés : ${s.duplicates||0}`,
`Doublons enrichis : ${s.enrichedDuplicates||0}`,
s.attachmentBackfillVersion?`Backfill pièces jointes : TERMINÉ (${s.attachmentBackfillVersion})`:s.attachmentBackfillTarget?`Backfill pièces jointes : ${Object.keys(s.attachmentBackfillPending||{}).length} restante(s), ${s.attachmentBackfillMissingUrl||0} URL manquante(s)`:'Backfill pièces jointes : à initialiser',
`Échecs : ${Object.keys(s.failed||{}).length}`,
`Inaccessibles : ${Object.keys(s.unavailable||{}).length}`,
`À retenter plus tard : ${Object.keys(s.deferred||{}).length}`,
`Mode : PC très lent / protection mémoire`,
s.deepDiscoveryDone?'Exploration profonde ChatGPT : faite':'Exploration profonde ChatGPT : à faire',
`Watchdog : anti-blocage (sonde 7 s / stabilisation 25 s / capture 30 s)`,
`Blocages évités : ${s.stalledCount||0}`,
`Relances automatiques : ${s.autoRecoveries||0}`,
s.lastRecoveryAt?`Dernière relance auto : ${new Date(s.lastRecoveryAt).toLocaleTimeString('fr-FR')} (${s.lastRecoveryReason||'raison inconnue'})`:'',
s.currentStage?`Étape : ${s.currentStage}`:'',
s.currentMessageCount?`Messages détectés ici : ${s.currentMessageCount}`:'',
s.currentMessageCount?`Capture : ${s.captureProcessed||0} / ${s.currentMessageCount}`:'',
s.lastProgressAt?`Dernière progression : ${new Date(s.lastProgressAt).toLocaleTimeString('fr-FR')}`:'',
s.currentUrl?`En cours : ${s.currentUrl}`:'',
s.lastError?`Dernière erreur : ${s.lastError}`:''
].filter(Boolean).join('\n')}


function renderRunner(s){
  const targets=Object.values(s.targets||{});
  const active=targets.filter(t=>t?.enabled!==false);
  const lines=[
    `Runner : ${s.paused?'PAUSE':s.enabled?'ACTIF':'INACTIF'}`,
    `Pages ouvertes surveillées : ${active.length}`,
    `Mode : asynchrone / une seule relance à la fois`,
    `Écart global minimum : 60 s`,
    `Cooldown par page : 90 s`,
    s.lastSendAt?`Dernière relance : ${new Date(s.lastSendAt).toLocaleTimeString('fr-FR')}`:'',
    s.blockedReason?`Blocage : ${s.blockedReason.code||'inconnu'} — runner mis en pause`:'',
    s.lastError?`Dernière erreur runner : ${s.lastError}`:''
  ];
  for(const t of active.slice(0,12)){
    lines.push(`• ${t.command||'?'} · ${t.status||'inconnu'} · cycles ${t.cycles||0} · ${t.title||t.conversationId||'conversation'}`);
  }
  $('runnerStatus').textContent=lines.filter(Boolean).join('\n');
}

async function refresh(){
  try{
    const [collector,runner]=await Promise.all([
      api.runtime.sendMessage({type:'mel.collector.status'}),
      api.runtime.sendMessage({type:'mel.runner.status'})
    ]);
    render(collector);
    renderRunner(runner);
  }catch(e){
    $('status').textContent='Erreur : '+e.message;
    if($('runnerStatus'))$('runnerStatus').textContent='Erreur runner : '+e.message;
  }
}

async function loadConfig(){
  const x=await api.storage.local.get('melCollectorConfig'),c=x.melCollectorConfig||{};
  $('endpoint').value=c.endpoint||'https://meliturgos.adrien-lopezcarreras.workers.dev';
  $('username').value=c.username||'';
  $('password').value=c.password||'';
  $('continuous').checked=c.continuous!==false;
  $('ecoMode').checked=c.ecoMode!==false;
  $('delayMs').value=String(c.delayMs||30000);
}

async function saveConfig(){
  const endpoint=$('endpoint').value.trim().replace(/\/$/,'');
  if(!/^https:\/\//i.test(endpoint)) throw new Error('Adresse MEL HTTPS obligatoire');
  await api.storage.local.set({melCollectorConfig:{
    endpoint,
    username:$('username').value.trim(),
    password:$('password').value,
    continuous:$('continuous').checked,
    ecoMode:$('ecoMode').checked,
    delayMs:Number($('delayMs').value)||30000
  }});
  $('configStatus').className='ok';
  $('configStatus').textContent='Réglages enregistrés.';
  return endpoint;
}

function auth(u,p){return 'Basic '+btoa(unescape(encodeURIComponent(`${u}:${p}`)))}

async function testMel(){
  const endpoint=await saveConfig();
  const user=$('username').value.trim(),pass=$('password').value;
  if(!user||!pass) throw new Error('Utilisateur et mot de passe MEL requis');
  const r=await fetch(endpoint+'/api/memory/status',{
    headers:{authorization:auth(user,pass)}
  });
  const t=await r.text();
  let body={};try{body=t?JSON.parse(t):{}}catch{}
  if(!r.ok) throw new Error(body.code||body.error||('HTTP '+r.status));
  $('configStatus').className='ok';
  $('configStatus').textContent='Connexion MEL OK.';
}

$('save').onclick=async()=>{try{await saveConfig()}catch(e){$('configStatus').className='bad';$('configStatus').textContent=e.message}};
$('test').onclick=async()=>{try{$('configStatus').className='muted';$('configStatus').textContent='Test…';await testMel()}catch(e){$('configStatus').className='bad';$('configStatus').textContent='Échec : '+e.message}};
$('start').onclick=async()=>{try{await saveConfig();await api.runtime.sendMessage({type:'mel.collector.start'})}catch(e){$('configStatus').className='bad';$('configStatus').textContent='Échec : '+e.message}refresh()};
$('pause').onclick=async()=>{await api.runtime.sendMessage({type:'mel.collector.pause'});refresh()};
$('retry').onclick=async()=>{try{const s=await api.runtime.sendMessage({type:'mel.collector.retry-deferred'});$('configStatus').className='ok';$('configStatus').textContent=(s.retryDeferredAdded||0)+' conversation(s) en échec/différée(s) remise(s) en file.'}catch(e){$('configStatus').className='bad';$('configStatus').textContent='Échec : '+e.message}refresh()};
$('capture').onclick=async()=>{try{await saveConfig();await api.runtime.sendMessage({type:'mel.collector.capture-current'})}catch(e){$('configStatus').className='bad';$('configStatus').textContent='Échec : '+e.message}refresh()};
async function armRunner(command){
  const label=command==='cycle'?'cycle':'go';
  $('configStatus').className='muted';
  $('configStatus').textContent='Armement de cette page en mode '+label+'…';
  $('runnerCycle').disabled=true;
  $('runnerGo').disabled=true;
  try{
    const s=await api.runtime.sendMessage({type:'mel.runner.mark-current',command});
    const target=Object.values(s.targets||{}).find(t=>t?.command===command&&t?.enabled!==false);
    $('configStatus').className='ok';
    $('configStatus').textContent='Page armée en mode '+label+' et ajoutée à la file asynchrone'+(target?.status?' ('+target.status+')':'')+'.';
  }catch(e){
    $('configStatus').className='bad';
    $('configStatus').textContent='Échec runner : '+(e?.message||String(e));
  }finally{
    $('runnerCycle').disabled=false;
    $('runnerGo').disabled=false;
    refresh();
  }
}
$('runnerCycle').onclick=()=>armRunner('cycle');
$('runnerGo').onclick=()=>armRunner('go');
$('runnerStop').onclick=async()=>{try{await api.runtime.sendMessage({type:'mel.runner.unmark-current'});$('configStatus').className='ok';$('configStatus').textContent='Page retirée du runner.'}catch(e){$('configStatus').className='bad';$('configStatus').textContent='Échec runner : '+e.message}refresh()};
$('runnerPause').onclick=async()=>{try{await api.runtime.sendMessage({type:'mel.runner.pause'})}catch(e){$('configStatus').className='bad';$('configStatus').textContent='Échec runner : '+e.message}refresh()};
$('runnerResume').onclick=async()=>{try{await api.runtime.sendMessage({type:'mel.runner.resume'})}catch(e){$('configStatus').className='bad';$('configStatus').textContent='Échec runner : '+e.message}refresh()};

loadConfig();
refresh();
setInterval(refresh,1500);
