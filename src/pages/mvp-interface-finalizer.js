const MEL_INTERFACE_FINALIZER = `<style id="mel-interface-finalizer-style">
.mel-recall-row{display:flex;justify-content:center;margin:-4px 0 10px}.mel-recall-link{border:0;background:transparent;color:#fff4cf!important;text-decoration:underline;text-underline-offset:3px;padding:4px 8px;min-height:auto;font-size:.86rem;font-weight:800;text-shadow:0 2px 10px #000;cursor:pointer}.mel-recall-link[disabled]{opacity:.55;cursor:wait}.avatar.recording{box-shadow:0 0 0 7px rgba(239,68,68,.28),0 0 70px rgba(239,68,68,.72)!important}
</style><script id="mel-interface-finalizer-runtime">
(function(){
  const avatar=document.getElementById('avatar');
  const voiceStatus=document.getElementById('voiceStatus');
  const input=document.getElementById('input');
  const send=document.getElementById('send');
  const messages=document.getElementById('messages');
  if(!avatar||!voiceStatus||!input||!send||!messages)return;

  function setVoice(text){voiceStatus.textContent=text}
  setVoice('Touchez le visage de MEL pour parler');
  new MutationObserver(()=>{
    if(/Reconnaissance vocale non disponible/i.test(voiceStatus.textContent||''))setVoice('Voix optionnelle · le chat texte est prêt');
  }).observe(voiceStatus,{childList:true,subtree:true,characterData:true});

  let recorder=null,stream=null,chunks=[],starting=false,transcriptionUnavailable=false;
  function cleanup(){try{stream?.getTracks?.().forEach(track=>track.stop())}catch{} stream=null;avatar.classList.remove('listening','recording')}
  function extensionFor(type){return /ogg/i.test(type)?'ogg':/mp4|m4a/i.test(type)?'m4a':'webm'}
  async function startVoice(){
    if(starting)return;
    if(transcriptionUnavailable){setVoice('Voix reportée · continuez avec le chat texte');input.focus();return}
    starting=true;
    try{
      if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Ce navigateur ne permet pas encore l’enregistrement audio ici.');
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      const preferred=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
      const mime=preferred.find(type=>MediaRecorder.isTypeSupported?.(type))||'';
      recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
      chunks=[];
      recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
      recorder.onerror=()=>{cleanup();setVoice('Micro indisponible · le chat texte reste prêt')};
      recorder.onstart=()=>{avatar.classList.add('listening','recording');setVoice('J’écoute… touchez à nouveau le visage pour envoyer')};
      recorder.onstop=async()=>{
        const type=recorder?.mimeType||chunks[0]?.type||'audio/webm';
        const blob=new Blob(chunks,{type});cleanup();
        if(!blob.size){setVoice('Aucun son enregistré · le chat texte reste prêt');return}
        setVoice('Transcription…');
        try{
          const fd=new FormData();fd.append('audio',blob,'mel-voice.'+extensionFor(type));
          const response=await fetch('/api/voice/transcribe',{method:'POST',body:fd});
          const data=await response.json().catch(()=>({}));
          const text=String(data.text||'').trim();
          if(!response.ok||!text)throw new Error(data.error||data.code||'Transcription indisponible');
          input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));
          setVoice('Transcrit · envoi à MEL');send.click();
        }catch(error){
          transcriptionUnavailable=true;
          console.warn('MEL transcription deferred:',error);
          setVoice('Voix reportée · continuez avec le chat texte');
          input.focus();
        }
      };
      recorder.start();
    }catch(error){cleanup();setVoice('Micro indisponible · le chat texte reste prêt');input.focus()}
    finally{starting=false}
  }
  function toggleVoice(event){
    const target=event.target instanceof Element?event.target.closest('#avatar'):null;
    if(!target)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    if(recorder&&recorder.state==='recording')recorder.stop();else startVoice();
  }
  document.addEventListener('click',toggleVoice,true);
  document.addEventListener('keydown',event=>{
    const target=event.target instanceof Element?event.target.closest('#avatar'):null;
    if(target&&(event.key==='Enter'||event.key===' '))toggleVoice(event);
  },true);

  function renderArchived(list){
    messages.innerHTML='';
    const items=Array.isArray(list)?list:[];
    if(!items.length){messages.innerHTML='<div class="empty">Aucun message archivé dans cette conversation.</div>';return}
    for(const msg of items){
      const role=String(msg.role||'').toLowerCase();
      if(!['user','assistant','mel'].includes(role))continue;
      const d=document.createElement('div');d.className='msg '+(role==='user'?'user':'mel');
      const who=document.createElement('span');who.className='who';who.textContent=role==='user'?'Adrien':'MEL';
      const text=document.createElement('div');text.textContent=String(msg.content||'');
      d.append(who,text);messages.appendChild(d);
    }
    messages.scrollTop=messages.scrollHeight;
  }
  async function loadConversation(id){
    const response=await fetch('/api/gen2/conversations/messages?conversation_id='+encodeURIComponent(id));
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||data.code||'Conversation indisponible');
    renderArchived(data.messages||[]);
  }
  async function recallLatest(){
    recall.disabled=true;recall.textContent='Rappel…';
    try{
      const response=await fetch('/api/gen2/conversations');
      const data=await response.json().catch(()=>({}));
      const latest=Array.isArray(data.conversations)?data.conversations[0]:null;
      if(!response.ok||!latest?.id)throw new Error('Aucune conversation précédente trouvée');
      try{localStorage.setItem('mel.conversation',latest.id);localStorage.setItem('mel.recall.autoload',latest.id)}catch{}
      await loadConversation(latest.id);
      recall.textContent='Dernière conversation rappelée';
    }catch(error){recall.textContent='Rappeler la dernière conversation';setVoice(String(error?.message||error))}
    finally{recall.disabled=false}
  }
  let recall=document.getElementById('melRecallConversation');
  if(!recall){
    const row=document.createElement('div');row.className='mel-recall-row';
    recall=document.createElement('button');recall.type='button';recall.id='melRecallConversation';recall.className='mel-recall-link';recall.textContent='Rappeler la dernière conversation';
    row.appendChild(recall);voiceStatus.insertAdjacentElement('afterend',row);
  }
  recall.addEventListener('click',recallLatest);
  try{
    const pending=localStorage.getItem('mel.recall.autoload');
    if(pending){localStorage.removeItem('mel.recall.autoload');loadConversation(pending).catch(()=>{})}
  }catch{}
})();
</script>`;

export async function finalizeMvpInterface(response){
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  const html=await response.text();
  if(html.includes('id="mel-interface-finalizer-runtime"'))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const next=html.includes('</body>')?html.replace('</body>',MEL_INTERFACE_FINALIZER+'</body>'):html+MEL_INTERFACE_FINALIZER;
  const headers=new Headers(response.headers);headers.delete('content-length');
  return new Response(next,{status:response.status,statusText:response.statusText,headers});
}

export { MEL_INTERFACE_FINALIZER };