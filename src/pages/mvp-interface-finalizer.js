const MEL_INTERFACE_FINALIZER = `<style id="mel-interface-finalizer-style">
.mel-topline{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin:0 auto 10px;padding:7px 10px;color:var(--soft);font-size:.78rem}.mel-brand{font-weight:900;letter-spacing:.18em;color:var(--text)}.mel-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);background:color-mix(in srgb,var(--panel) 82%,transparent);border-radius:999px;padding:5px 9px;box-shadow:0 8px 22px rgba(0,0,0,.16)}.mel-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 12px rgba(34,197,94,.8)}.mel-recall-row{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin:-3px 0 10px}.mel-recall-link{border:0!important;background:transparent!important;color:var(--text)!important;text-decoration:underline;text-underline-offset:3px;padding:4px 8px!important;min-height:auto!important;font-size:.82rem;font-weight:750;opacity:.9;cursor:pointer}.mel-recall-link[disabled]{opacity:.5;cursor:wait}.avatar.recording{box-shadow:0 0 0 7px rgba(239,68,68,.25),0 0 68px rgba(239,68,68,.65)!important}.window{backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}#status{font-size:.86rem}.mel-work-ready{margin-left:auto;color:var(--soft);font-size:.76rem}.composer .controls{align-items:stretch}.composer .controls button{font-weight:750}#voiceStatus{font-weight:650;opacity:.94}.msg .who{font-weight:800}.msg.mel{box-shadow:inset 3px 0 0 color-mix(in srgb,var(--accent) 55%,transparent)}.msg.user{box-shadow:inset -3px 0 0 color-mix(in srgb,var(--accent) 55%,transparent)}
@media(max-width:600px){.mel-topline{margin-top:2px;font-size:.72rem}.mel-work-ready{width:100%;text-align:center;margin:0}.mel-chip{padding:4px 8px}}
</style><script id="mel-interface-finalizer-runtime">
(function(){
  const avatar=document.getElementById('avatar');
  const voiceStatus=document.getElementById('voiceStatus');
  const input=document.getElementById('input');
  const send=document.getElementById('send');
  const messages=document.getElementById('messages');
  const app=document.querySelector('.app');
  if(!avatar||!voiceStatus||!input||!send||!messages||!app)return;

  function setVoice(text){voiceStatus.textContent=text}
  function relabel(){document.querySelectorAll('.msg .who').forEach(function(node){if(/^Vous(?:\s|$)/.test(node.textContent||''))node.textContent=(node.textContent||'').replace(/^Vous/,'Adrien')})}
  const labelObserver=new MutationObserver(relabel);labelObserver.observe(messages,{childList:true,subtree:true,characterData:true});relabel();

  if(!document.getElementById('melTopline')){
    const bar=document.createElement('div');bar.id='melTopline';bar.className='mel-topline';
    bar.innerHTML='<span class="mel-brand">MEL</span><span class="mel-chip"><span class="mel-dot"></span>Mémoire active</span><span class="mel-chip">Mises à jour unifiées</span><span class="mel-work-ready">Travail collaboratif supervisé prêt</span>';
    app.insertBefore(bar,app.firstChild);
  }

  setVoice('Touchez le visage de MEL pour parler · le texte reste toujours disponible');
  new MutationObserver(function(){
    const value=voiceStatus.textContent||'';
    if(/Reconnaissance vocale non disponible|Transcription indisponible/i.test(value))setVoice('Voix optionnelle · continuez avec le texte');
  }).observe(voiceStatus,{childList:true,subtree:true,characterData:true});

  let recorder=null,stream=null,chunks=[],starting=false,transcriptionUnavailable=false;
  function cleanup(){try{stream?.getTracks?.().forEach(function(track){track.stop()})}catch{}stream=null;avatar.classList.remove('listening','recording')}
  function extensionFor(type){return /ogg/i.test(type)?'ogg':/mp4|m4a/i.test(type)?'m4a':'webm'}
  async function startVoice(){
    if(starting)return;
    if(transcriptionUnavailable){setVoice('Voix optionnelle · le chat texte est prêt');input.focus();return}
    starting=true;
    try{
      if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('MIC_UNAVAILABLE');
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      const preferred=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
      const mime=preferred.find(function(type){return MediaRecorder.isTypeSupported?.(type)})||'';
      recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);chunks=[];
      recorder.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data)};
      recorder.onerror=function(){cleanup();setVoice('Micro indisponible · le texte reste prêt')};
      recorder.onstart=function(){avatar.classList.add('listening','recording');setVoice('J’écoute… touchez à nouveau le visage pour envoyer')};
      recorder.onstop=async function(){
        const type=recorder?.mimeType||chunks[0]?.type||'audio/webm';const blob=new Blob(chunks,{type:type});cleanup();
        if(!blob.size){setVoice('Aucun son enregistré · le texte reste prêt');return}
        setVoice('Traitement de la voix…');
        try{
          const fd=new FormData();fd.append('audio',blob,'mel-voice.'+extensionFor(type));
          const response=await fetch('/api/voice/transcribe',{method:'POST',body:fd});const data=await response.json().catch(function(){return {}});const text=String(data.text||'').trim();
          if(!response.ok||!text)throw new Error(data.error||data.code||'VOICE_DEFERRED');
          input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));setVoice('Voix reçue · envoi à MEL');send.click();
        }catch(error){transcriptionUnavailable=true;console.warn('MEL voice deferred:',error);setVoice('Voix optionnelle · continuez avec le texte');input.focus()}
      };
      recorder.start();
    }catch(error){cleanup();setVoice('Micro indisponible · le texte reste prêt');input.focus()}
    finally{starting=false}
  }
  function toggleVoice(event){const target=event.target instanceof Element?event.target.closest('#avatar'):null;if(!target)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();if(recorder&&recorder.state==='recording')recorder.stop();else startVoice()}
  document.addEventListener('click',toggleVoice,true);document.addEventListener('keydown',function(event){const target=event.target instanceof Element?event.target.closest('#avatar'):null;if(target&&(event.key==='Enter'||event.key===' '))toggleVoice(event)},true);

  function renderArchived(list){messages.innerHTML='';const items=Array.isArray(list)?list:[];if(!items.length){messages.innerHTML='<div class="empty">Aucun message archivé dans cette conversation.</div>';return}for(const msg of items){const role=String(msg.role||'').toLowerCase();if(!['user','assistant','mel'].includes(role))continue;const d=document.createElement('div');d.className='msg '+(role==='user'?'user':'mel');const who=document.createElement('span');who.className='who';who.textContent=role==='user'?'Adrien':'MEL';const text=document.createElement('div');text.textContent=String(msg.content||'');d.append(who,text);messages.appendChild(d)}messages.scrollTop=messages.scrollHeight}
  async function loadConversation(id){const response=await fetch('/api/gen2/conversations/messages?conversation_id='+encodeURIComponent(id));const data=await response.json().catch(function(){return {}});if(!response.ok)throw new Error(data.error||data.code||'Conversation indisponible');renderArchived(data.messages||[])}
  async function recallLatest(){recall.disabled=true;recall.textContent='Rappel…';try{const response=await fetch('/api/gen2/conversations');const data=await response.json().catch(function(){return {}});const latest=Array.isArray(data.conversations)?data.conversations[0]:null;if(!response.ok||!latest?.id)throw new Error('Aucune conversation précédente trouvée');try{localStorage.setItem('mel.conversation',latest.id);localStorage.setItem('mel.recall.autoload',latest.id)}catch{}await loadConversation(latest.id);recall.textContent='Dernière conversation rappelée'}catch(error){recall.textContent='Rappeler la dernière conversation';setVoice(String(error?.message||error))}finally{recall.disabled=false}}
  let recall=document.getElementById('melRecallConversation');if(!recall){const row=document.createElement('div');row.className='mel-recall-row';recall=document.createElement('button');recall.type='button';recall.id='melRecallConversation';recall.className='mel-recall-link';recall.textContent='Rappeler la dernière conversation';const fullLink=document.createElement('button');fullLink.type='button';fullLink.className='mel-recall-link';fullLink.textContent='Ouvrir la feuille de route';fullLink.addEventListener('click',function(){location.href='/professor'});row.append(recall,fullLink);voiceStatus.insertAdjacentElement('afterend',row)}
  recall.addEventListener('click',recallLatest);try{const pending=localStorage.getItem('mel.recall.autoload');if(pending){localStorage.removeItem('mel.recall.autoload');loadConversation(pending).catch(function(){})}}catch{}
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
