const api=globalThis.browser,$=id=>document.getElementById(id);
async function load(){const x=await api.storage.local.get('melCollectorConfig'),c=x.melCollectorConfig||{};$('endpoint').value=c.endpoint||'https://meliturgos.adrien-lopezcarreras.workers.dev';$('username').value=c.username||'';$('password').value=c.password||'';$('continuous').checked=c.continuous!==false}
$('save').onclick=async()=>{const endpoint=$('endpoint').value.trim().replace(/\/$/,'');if(!/^https:\/\//i.test(endpoint)){$('status').textContent=' Adresse HTTPS obligatoire.';return}await api.storage.local.set({melCollectorConfig:{endpoint,username:$('username').value,password:$('password').value,continuous:$('continuous').checked}});$('status').textContent=' Enregistré.'};
load();
