const api=globalThis.browser,$=id=>document.getElementById(id);

function render(s){$('status').textContent=[
`État : ${s.running?'EN COURS':s.paused?'PAUSE':'TERMINÉ / INACTIF'}`,
`Découvertes : ${s.discovered||0}`,
`File restante : ${s.queue?.length||0}`,
`Conversations archivées : ${s.importedConversations||0}`,
`Messages nouveaux : ${s.importedMessages||0}`,
`Doublons ignorés : ${s.duplicates||0}`,
`Échecs : ${Object.keys(s.failed||{}).length}`,
s.currentUrl?`En cours : ${s.currentUrl}`:'',
s.lastError?`Dernière erreur : ${s.lastError}`:''
].filter(Boolean).join('\n')}

async function refresh(){
  try{render(await api.runtime.sendMessage({type:'mel.collector.status'}))}
  catch(e){$('status').textContent='Erreur : '+e.message}
}

async function loadConfig(){
  const x=await api.storage.local.get('melCollectorConfig'),c=x.melCollectorConfig||{};
  $('endpoint').value=c.endpoint||'https://meliturgos.adrien-lopezcarreras.workers.dev';
  $('username').value=c.username||'';
  $('password').value=c.password||'';
  $('continuous').checked=c.continuous!==false;
}

async function saveConfig(){
  const endpoint=$('endpoint').value.trim().replace(/\/$/,'');
  if(!/^https:\/\//i.test(endpoint)) throw new Error('Adresse MEL HTTPS obligatoire');
  await api.storage.local.set({melCollectorConfig:{
    endpoint,
    username:$('username').value.trim(),
    password:$('password').value,
    continuous:$('continuous').checked
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
$('capture').onclick=async()=>{try{await saveConfig();await api.runtime.sendMessage({type:'mel.collector.capture-current'})}catch(e){$('configStatus').className='bad';$('configStatus').textContent='Échec : '+e.message}refresh()};

loadConfig();
refresh();
setInterval(refresh,1500);
