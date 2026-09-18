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
async function refresh(){try{render(await api.runtime.sendMessage({type:'mel.collector.status'}))}catch(e){$('status').textContent='Erreur : '+e.message}}
$('start').onclick=async()=>{try{await api.runtime.sendMessage({type:'mel.collector.start'})}catch(e){alert(e.message)}refresh()};
$('pause').onclick=async()=>{await api.runtime.sendMessage({type:'mel.collector.pause'});refresh()};
$('capture').onclick=async()=>{try{await api.runtime.sendMessage({type:'mel.collector.capture-current'})}catch(e){alert(e.message)}refresh()};
$('options').onclick=async e=>{e.preventDefault();await api.runtime.openOptionsPage()};
refresh();setInterval(refresh,1500);
