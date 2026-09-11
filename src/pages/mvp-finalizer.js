import religiousBackground from './background-data-religious.js';

const BACKGROUND_ROUTE = '/assets/backgrounds/mel-chapel-grandiose.webp';

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function serveMelBackground(pathname) {
  if (String(pathname || '') !== BACKGROUND_ROUTE) return null;
  return new Response(decodeBase64(religiousBackground), {
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'public,max-age=86400',
      'x-mel-background': 'approved-chapel-grandiose',
    },
  });
}

const FINAL_PATCH = `<style id="mel-interface-final-style">
/* Real owner-approved artwork: not a CSS-only scene. */
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) body{
  background:#100906!important;
}
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) body::before{
  content:""!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;
  border-radius:0!important;filter:none!important;opacity:1!important;z-index:-3!important;
  background-image:url('${BACKGROUND_ROUTE}?v=20260911')!important;
  background-size:cover!important;background-position:center center!important;background-repeat:no-repeat!important;
}
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) body::after{
  content:""!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;
  border-radius:0!important;filter:none!important;opacity:1!important;z-index:-2!important;
  background:linear-gradient(90deg,rgba(9,5,3,.34),rgba(9,5,3,.10) 24%,rgba(9,5,3,.08) 72%,rgba(9,5,3,.38)),linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.18))!important;
}
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) .app{z-index:1}
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) .window{
  background:rgba(255,250,236,.965)!important;color:#21150c!important;border:2px solid rgba(128,82,24,.82)!important;
  box-shadow:0 24px 90px rgba(0,0,0,.58),0 0 0 4px rgba(229,194,111,.20)!important;
  backdrop-filter:blur(2px);
}
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) #messages,
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) .composer,
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) textarea,
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) .composer-meta,
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) #status,
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) .drop{
  color:#21150c!important;
}
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) textarea::placeholder{color:#665746!important;opacity:1}
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) .composer{background:rgba(255,248,229,.92)!important;border-top-color:rgba(128,82,24,.42)!important}
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) .msg.mel{background:#fffaf0!important;color:#21150c!important;border-color:#d8c49b!important}
html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) .empty{color:#554637!important}
#melRecallRow{display:flex;justify-content:center;margin:-5px 0 11px;min-height:34px;position:relative;z-index:3}
#melRecallLast{border:1px solid rgba(226,195,119,.58);border-radius:999px;padding:7px 13px;min-height:34px;background:rgba(13,8,5,.76);color:#fff1c9;font-size:.84rem;font-weight:800;box-shadow:0 8px 25px rgba(0,0,0,.28);cursor:pointer}
#melRecallLast:hover{background:rgba(29,18,9,.88)}#melRecallLast:disabled{opacity:.56;cursor:default}
#voiceStatus{font-weight:750;text-shadow:0 2px 6px rgba(0,0,0,.72)}
.avatar.recording{box-shadow:0 0 0 7px rgba(239,68,68,.30),0 0 70px rgba(239,68,68,.68)!important}
@media(max-width:600px){
  html:is([data-theme="crusade"],[data-theme="religious"],[data-theme="granada"],[data-theme="paladin"]) body::before{background-position:center top!important}
  #melRecallLast{font-size:.78rem;padding:7px 11px}
}
</style><script id="mel-interface-final-runtime">
(function(){
  const STORAGE_CONVERSATION='mel.conversation';
  const voiceStatus=document.getElementById('voiceStatus');
  const input=document.getElementById('input');
  const send=document.getElementById('send');
  const messages=document.getElementById('messages');
  const status=document.getElementById('status');

  function currentConversationId(){
    try{return localStorage.getItem(STORAGE_CONVERSATION)||''}catch{return ''}
  }

  /* Keep the recalled conversation id authoritative even though the base UI captured an older const. */
  function installConversationTransport(){
    if(window.__melRecallTransportPatched||typeof window.fetch!=='function')return;
    window.__melRecallTransportPatched=true;
    const inherited=window.fetch.bind(window);
    window.fetch=async function(resource,init){
      const url=typeof resource==='string'?resource:String(resource&&resource.url||'');
      if(url.includes('/api/chat')&&init&&typeof init.body==='string'){
        try{
          const body=JSON.parse(init.body);const id=currentConversationId();
          if(id)body.conversation_id=id;
          init={...init,body:JSON.stringify(body)};
        }catch{}
      }
      return inherited(resource,init);
    };
  }

  function renderArchivedMessage(message){
    const role=String(message?.role||'').toLowerCase();
    if(!['user','assistant','mel'].includes(role))return;
    const text=typeof message?.content==='string'?message.content:JSON.stringify(message?.content??'');
    if(!text)return;
    const node=document.createElement('div');node.className='msg '+(role==='user'?'user':'mel');
    const who=document.createElement('span');who.className='who';who.textContent=role==='user'?'Adrien':'MEL';
    const content=document.createElement('div');content.textContent=text;node.append(who,content);messages.appendChild(node);
  }

  function installRecall(){
    if(!voiceStatus||!messages||document.getElementById('melRecallLast'))return;
    const row=document.createElement('div');row.id='melRecallRow';
    const button=document.createElement('button');button.type='button';button.id='melRecallLast';button.textContent='↶ Rappeler la dernière conversation';
    row.appendChild(button);voiceStatus.insertAdjacentElement('afterend',row);
    button.addEventListener('click',async()=>{
      button.disabled=true;if(status)status.textContent='Recherche de la dernière conversation…';
      try{
        const listResponse=await fetch('/api/gen2/conversations',{headers:{accept:'application/json'}});
        const list=await listResponse.json().catch(()=>({}));
        if(!listResponse.ok)throw new Error(list.error||list.code||'Historique indisponible');
        const conversation=(Array.isArray(list.conversations)?list.conversations:[]).find(item=>item&&item.id);
        if(!conversation)throw new Error('Aucune conversation précédente enregistrée');
        const messageResponse=await fetch('/api/gen2/conversations/messages?conversation_id='+encodeURIComponent(conversation.id),{headers:{accept:'application/json'}});
        const payload=await messageResponse.json().catch(()=>({}));
        if(!messageResponse.ok)throw new Error(payload.error||payload.code||'Messages indisponibles');
        const archived=Array.isArray(payload.messages)?payload.messages:[];
        if(!archived.length)throw new Error('Cette conversation ne contient aucun message archivé');
        try{localStorage.setItem(STORAGE_CONVERSATION,String(conversation.id))}catch{}
        messages.innerHTML='';archived.forEach(renderArchivedMessage);messages.scrollTop=messages.scrollHeight;
        if(status)status.textContent='Dernière conversation rappelée · '+archived.length+' message(s).';
      }catch(error){if(status)status.textContent=String(error?.message||error)}finally{button.disabled=false}
    });
  }

  function installCanonicalVoice(){
    if(!voiceStatus||!input||!send)return;
    const oldAvatar=document.getElementById('avatar');if(!oldAvatar)return;
    /* Replacing the node deliberately removes SpeechRecognition and enhancer listeners. */
    const avatar=oldAvatar.cloneNode(true);oldAvatar.replaceWith(avatar);
    voiceStatus.textContent='Clique sur MEL pour parler';
    const canRecord=Boolean(navigator.mediaDevices?.getUserMedia)&&typeof MediaRecorder!=='undefined';
    if(!canRecord){voiceStatus.textContent='Micro non disponible dans ce navigateur.';return}
    let recorder=null,stream=null,chunks=[],starting=false;
    function cleanup(){try{stream?.getTracks?.().forEach(track=>track.stop())}catch{}stream=null;avatar.classList.remove('listening','recording')}
    function supportedMime(){const options=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg'];for(const type of options){try{if(MediaRecorder.isTypeSupported?.(type))return type}catch{}}return ''}
    async function start(){
      if(starting)return;starting=true;voiceStatus.textContent='Ouverture du micro…';
      try{
        stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
        chunks=[];const mime=supportedMime();recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
        recorder.ondataavailable=event=>{if(event.data&&event.data.size)chunks.push(event.data)};
        recorder.onstart=()=>{avatar.classList.add('listening','recording');voiceStatus.textContent='J’écoute… reclique sur MEL pour arrêter'};
        recorder.onerror=()=>{cleanup();voiceStatus.textContent='Erreur pendant l’enregistrement du micro.'};
        recorder.onstop=async()=>{
          avatar.classList.remove('listening','recording');voiceStatus.textContent='Transcription…';
          const type=recorder?.mimeType||mime||'audio/webm';const blob=new Blob(chunks,{type});cleanup();
          if(!blob.size){voiceStatus.textContent='Aucun son enregistré. Clique sur MEL pour réessayer.';return}
          const ext=type.includes('ogg')?'ogg':'webm';const fd=new FormData();fd.append('audio',blob,'mel-voice.'+ext);
          try{
            const response=await fetch('/api/voice/transcribe',{method:'POST',body:fd});
            const data=await response.json().catch(()=>({}));const text=String(data.text||data.transcription||'').trim();
            if(!response.ok||!text)throw new Error(data.error||data.code||'Transcription vide');
            input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));voiceStatus.textContent='Transcrit · envoi à MEL';send.click();
          }catch(error){voiceStatus.textContent='Transcription impossible : '+String(error?.message||error)}
        };
        recorder.start();
      }catch(error){cleanup();voiceStatus.textContent=error?.name==='NotAllowedError'?'Micro refusé : autorise le microphone dans Firefox puis reclique sur MEL.':'Micro indisponible : '+String(error?.message||error)}finally{starting=false}
    }
    function toggle(event){event?.preventDefault?.();if(recorder&&recorder.state==='recording')recorder.stop();else start()}
    avatar.addEventListener('click',toggle);avatar.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle(event)}});
  }

  installConversationTransport();installRecall();installCanonicalVoice();
})();
</script>`;

export async function finalizeMvpInterface(response) {
  if (!response || !(response.headers.get('content-type') || '').includes('text/html')) return response;
  const html = await response.text();
  if (!html.includes('id="avatar"') || html.includes('id="mel-interface-final-runtime"')) {
    return new Response(html, { status: response.status, headers: response.headers });
  }
  const patched = html.includes('</body>') ? html.replace('</body>', FINAL_PATCH + '</body>') : html + FINAL_PATCH;
  return new Response(patched, { status: response.status, headers: response.headers });
}
