/** Clean MEL daily interface. Visual ownership stays here: no themes or legacy decorators. */
export async function onRequestGet() {
  const body = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>MEL</title>
<link rel="icon" type="image/png" href="/meliturgos-avatar-fille.png">
<link rel="apple-touch-icon" href="/meliturgos-avatar-fille.png">
<style id="mel-clean-shell-style">
*{box-sizing:border-box}
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f8fafc;background:#070b12}
html,body{margin:0;min-height:100%;background:#070b12;color:#f8fafc}
body{min-height:100vh;min-height:100dvh;padding:clamp(14px,2vw,24px);background:linear-gradient(180deg,#0b111c 0%,#070b12 60%,#05080d 100%);overflow-x:hidden}
button,textarea{font:inherit}
button{cursor:pointer}
.shell{width:min(980px,100%);margin:0 auto;display:flex;flex-direction:column;gap:14px}
.topbar{display:flex;justify-content:flex-end;min-height:42px}
.professor-link{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 15px;border:1px solid #2a3545;border-radius:12px;background:#101824;color:#e5edf8;text-decoration:none;font-weight:700}
.identity{display:flex;flex-direction:column;align-items:center;gap:8px;padding:0 0 4px}
.avatar-wrap{position:relative;width:clamp(132px,18vw,184px);height:clamp(132px,18vw,184px)}
.avatar{width:100%;height:100%;display:block;border-radius:50%;object-fit:cover;object-position:center 24%;border:2px solid #334155;background:#111827;box-shadow:0 14px 36px rgba(0,0,0,.35)}
.mic{position:absolute;right:2px;bottom:5px;width:48px;height:48px;border-radius:50%;border:2px solid #0b111c;background:#2563eb;color:white;display:grid;place-items:center;font-size:21px;box-shadow:0 8px 22px rgba(0,0,0,.35)}
.mic.listening{background:#dc2626;box-shadow:0 0 0 6px rgba(220,38,38,.15),0 8px 22px rgba(0,0,0,.35)}
.voice-status{min-height:22px;color:#9fb0c5;font-size:.9rem;text-align:center}
.chat{display:flex;flex-direction:column;min-height:min(650px,68dvh);border:1px solid #263244;border-radius:20px;background:#0d141f;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.28)}
.messages{flex:1;min-height:300px;max-height:52dvh;overflow-y:auto;padding:20px;scrollbar-gutter:stable}
.empty{color:#718198}
.msg{max-width:86%;margin:0 0 12px;padding:11px 13px;border-radius:14px;line-height:1.48;white-space:pre-wrap;overflow-wrap:anywhere}
.msg.user{margin-left:auto;background:#17356a;border:1px solid #2856a0;color:#f8fbff}
.msg.mel{margin-right:auto;background:#151f2d;border:1px solid #26364c;color:#edf4fd}
.msg.pending{opacity:.62;border-style:dashed}.msg.failed{border-color:#b91c1c}
.who{display:block;margin-bottom:4px;font-size:.75rem;font-weight:700;opacity:.62}
.composer{border-top:1px solid #263244;background:#0a1019;padding:14px}
.input{display:block;width:100%;min-height:104px;max-height:30dvh;resize:vertical;border:1px solid #2a374a;border-radius:14px;padding:13px 14px;background:#101925;color:#f8fafc;outline:none;line-height:1.5}
.input:focus{border-color:#4f83d9;box-shadow:0 0 0 3px rgba(79,131,217,.12)}
.input::placeholder{color:#73839a}
.meta{display:flex;justify-content:flex-end;margin:7px 2px 0;color:#718198;font-size:.75rem}
.drop{margin-top:10px;border:1px dashed #41516a;border-radius:12px;padding:11px 13px;color:#a4b1c3;background:#0d1622;cursor:pointer;text-align:center}
.drop.drag{border-color:#60a5fa;background:#10213a}
#fileInput{display:none}
.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:11px}
.action{min-height:44px;border:1px solid #334155;border-radius:11px;padding:0 16px;background:#172131;color:#eef5ff;font-weight:700}
.action.primary{background:#2563eb;border-color:#3474dd;color:white}
.action.primary:hover{background:#2f6ee5}.action:hover{background:#202d40}.action:disabled{opacity:.55;cursor:wait}
.status{min-height:20px;margin-top:9px;color:#9fb0c5;font-size:.88rem}
.footer-actions{display:flex;justify-content:center;padding:2px 0 8px}
.mode-full{min-height:44px;border:1px solid #334155;border-radius:12px;padding:0 18px;background:#101824;color:#e5edf8;font-weight:750}
@media(max-width:640px){body{padding:10px 10px calc(12px + env(safe-area-inset-bottom))}.topbar{min-height:38px}.professor-link{min-height:38px;padding:0 12px;font-size:.88rem}.avatar-wrap{width:136px;height:136px}.mic{width:44px;height:44px}.chat{min-height:calc(100dvh - 246px);border-radius:16px}.messages{min-height:220px;max-height:46dvh;padding:14px}.composer{padding:11px}.input{min-height:96px}.drop{font-size:.88rem}.actions{display:grid;grid-template-columns:1fr}.action{width:100%}.msg{max-width:92%}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style>
</head>
<body>
<main class="shell" id="melCleanShell">
  <div class="topbar"><a class="professor-link" id="professor" href="/professor">Professor</a></div>
  <section class="identity" aria-label="MEL">
    <div class="avatar-wrap">
      <img class="avatar" id="avatar" src="/assets/avatars/mel-classic.webp" alt="MEL">
      <button class="mic" id="mic" type="button" aria-label="Parler à MEL" aria-pressed="false">🎙</button>
    </div>
    <div class="voice-status" id="voiceStatus" role="status" aria-live="polite">Micro prêt</div>
  </section>
  <section class="chat" aria-label="Conversation avec MEL">
    <div class="messages" id="messages" aria-live="polite"><div class="empty" id="empty">Écris à MEL pour commencer.</div></div>
    <div class="composer">
      <textarea class="input" id="input" maxlength="100000" autofocus placeholder="Écris ou colle ton message… Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne."></textarea>
      <div class="meta"><span id="charCount">0 / 100 000</span></div>
      <div class="drop" id="drop" role="button" tabindex="0">Dépose un fichier ici ou touche pour le choisir<input id="fileInput" type="file" multiple></div>
      <div class="actions"><button class="action primary" id="send" type="button">Envoyer</button></div>
      <div class="status" id="status" role="status" aria-live="polite"></div>
    </div>
  </section>
  <div class="footer-actions"><button class="mode-full" id="full" type="button">Mode complet</button></div>
</main>
<script id="mel-clean-shell-runtime">
const MAX_INPUT=100000,LEGACY_INPUT=12000;
const input=document.getElementById('input'),send=document.getElementById('send'),status=document.getElementById('status'),messages=document.getElementById('messages'),empty=document.getElementById('empty'),full=document.getElementById('full'),mic=document.getElementById('mic'),voiceStatus=document.getElementById('voiceStatus'),drop=document.getElementById('drop'),fileInput=document.getElementById('fileInput'),charCount=document.getElementById('charCount');
let sending=false,recognition=null,listening=false,messageQueue=[];
function stableId(key){try{let v=localStorage.getItem(key);if(!v){v=crypto.randomUUID();localStorage.setItem(key,v)}return v}catch{return crypto.randomUUID()}}
const conversationId=stableId('mel.conversation'),deviceId=stableId('mel.device');
function updateCount(){const n=input.value.length;charCount.textContent=n.toLocaleString('fr-FR')+' / '+MAX_INPUT.toLocaleString('fr-FR')}
input.addEventListener('input',updateCount);updateCount();
function add(role,text){empty?.remove();const d=document.createElement('div');d.className='msg '+(role==='user'?'user':'mel');const w=document.createElement('span');w.className='who';w.textContent=role==='user'?'Vous':'MEL';const c=document.createElement('div');c.textContent=String(text??'');d.append(w,c);messages.appendChild(d);messages.scrollTop=messages.scrollHeight;return d}
function setPending(node,pending){if(!node)return;node.classList.toggle('pending',pending);const who=node.querySelector('.who');if(who)who.textContent=pending?'Vous · en attente':'Vous'}
function queueMessage(text=input.value){text=String(text||'').trim();if(!text)return;if(text.length>MAX_INPUT){status.textContent='Message trop long : '+MAX_INPUT.toLocaleString('fr-FR')+' caractères maximum.';return}input.value='';updateCount();const node=add('user',text);setPending(node,sending||messageQueue.length>0);messageQueue.push({text,node});if(sending)status.textContent='Message ajouté à la file.';pumpQueue();input.focus()}
async function pumpQueue(){if(sending)return;sending=true;send.textContent='Ajouter';send.disabled=false;try{while(messageQueue.length){const item=messageQueue.shift();setPending(item.node,false);status.textContent=item.text.length>LEGACY_INPUT?'Lecture du message long…':'MEL réfléchit…';try{const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:item.text,conversation_id:conversationId,device_id:deviceId,intent_context:{surface:'mel-clean'}}),signal:AbortSignal.timeout(90000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||d.code||(r.status===429?'Limite atteinte, réessaie plus tard.':'MEL est indisponible.'));if(!d.text)throw new Error('Réponse vide.');add('mel',d.text);status.textContent=d.development_job?'Développement autonome lancé.':d.archive_saved===false?'Réponse reçue, historique non sauvegardé.':''}catch(e){item.node?.classList.add('failed');const who=item.node?.querySelector('.who');if(who)who.textContent='Vous · à réessayer';if(!input.value.trim())input.value=item.text;updateCount();status.textContent=(e.name==='TimeoutError'?'Délai dépassé, tu peux réessayer.':e.message)+(messageQueue.length?' · messages en attente.':'');break}}}finally{sending=false;send.textContent='Envoyer';input.focus()}}
send.addEventListener('click',()=>queueMessage());
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();queueMessage()}});
full.addEventListener('click',()=>location.href='/professor');
function initVoice(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){voiceStatus.textContent='Reconnaissance vocale non disponible dans ce navigateur.';mic.disabled=true;return}recognition=new SR();recognition.lang='fr-FR';recognition.interimResults=true;recognition.continuous=false;recognition.onstart=()=>{listening=true;mic.classList.add('listening');mic.setAttribute('aria-pressed','true');voiceStatus.textContent='J’écoute…'};recognition.onend=()=>{listening=false;mic.classList.remove('listening');mic.setAttribute('aria-pressed','false');voiceStatus.textContent='Micro prêt'};recognition.onerror=e=>{listening=false;mic.classList.remove('listening');mic.setAttribute('aria-pressed','false');voiceStatus.textContent='Micro : '+e.error};recognition.onresult=e=>{let final='',interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)final+=t;else interim+=t}input.value=final||interim;updateCount();if(final)queueMessage(final)}}
function toggleVoice(){if(!recognition)initVoice();if(!recognition)return;listening?recognition.stop():recognition.start()}
mic.addEventListener('click',toggleVoice);
drop.addEventListener('click',()=>fileInput.click());drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fileInput.click()}});drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag')});drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag');handleFiles([...e.dataTransfer.files])});fileInput.addEventListener('change',e=>handleFiles([...e.target.files]));
async function handleFiles(files){for(const file of files){status.textContent='Envoi de '+file.name+'…';const fd=new FormData();fd.append('file',file);try{const r=await fetch('/api/files/upload',{method:'POST',body:fd});if(!r.ok)throw new Error('upload');const d=await r.json();add('user','📎 '+file.name);if(input.value.trim())queueMessage(input.value+' · Fichier: '+(d.url||file.name));else status.textContent='Fichier chargé : '+file.name}catch{status.textContent='Échec du fichier : '+file.name}}}
initVoice();
</script>
</body>
</html>`;
  return new Response(body,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate'}});
}
