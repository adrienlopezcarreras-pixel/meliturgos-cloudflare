export const MEL_WAKE_PHRASES = Object.freeze(['bonjour mel','allo mel']);

export function normalizeWakeText(value = '') {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectWakePhrase(value = '') {
  const normalized = normalizeWakeText(value);
  for (const phrase of MEL_WAKE_PHRASES) {
    if (normalized === phrase) return Object.freeze({ matched:true, phrase, command:'' });
    if (normalized.startsWith(phrase + ' ')) {
      return Object.freeze({
        matched:true,
        phrase,
        command: normalized.slice(phrase.length).trim(),
      });
    }
  }
  return Object.freeze({ matched:false, phrase:null, command:'' });
}

export const WAKE_WORD_RUNTIME_SOURCE = `
const MEL_WAKE_WORDS=['bonjour mel','allo mel'];
function melWakeNormalize(value){
  return String(value||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\\s'-]+/g,' ').replace(/\\s+/g,' ').trim();
}
function melWakeDetect(value){
  const normalized=melWakeNormalize(value);
  for(const phrase of MEL_WAKE_WORDS){
    if(normalized===phrase)return {matched:true,phrase,command:''};
    if(normalized.startsWith(phrase+' '))return {matched:true,phrase,command:normalized.slice(phrase.length).trim()};
  }
  return {matched:false,phrase:null,command:''};
}
let melWakeRecognition=null,melWakeEnabled=false,melWakeArmedUntil=0,melWakeRestartTimer=null;
function melWakeStop(){
  melWakeEnabled=false;
  clearTimeout(melWakeRestartTimer);
  try{melWakeRecognition?.stop()}catch{}
}
function melWakeScheduleRestart(){
  clearTimeout(melWakeRestartTimer);
  if(!melWakeEnabled||document.visibilityState==='hidden')return;
  melWakeRestartTimer=setTimeout(()=>{try{melWakeRecognition?.start()}catch{}},700);
}
async function melWakeStart(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR||melWakeEnabled)return false;
  let permission=null;
  try{
    if(!navigator.permissions?.query)return false;
    permission=await navigator.permissions.query({name:'microphone'});
  }catch{return false}
  if(permission?.state!=='granted')return false;
  melWakeEnabled=true;
  melWakeRecognition=new SR();
  melWakeRecognition.lang='fr-FR';
  melWakeRecognition.continuous=true;
  melWakeRecognition.interimResults=false;
  melWakeRecognition.onresult=e=>{
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(!e.results[i].isFinal)continue;
      const transcript=String(e.results[i][0]?.transcript||'').trim();
      if(!transcript)continue;
      const detected=melWakeDetect(transcript);
      if(detected.matched){
        melWakeArmedUntil=Date.now()+8000;
        voiceUi(true,'Oui ?');
        melSetAvatarState('listening','wake-word');
        if(detected.command){
          melWakeArmedUntil=0;
          queueMessage(detected.command,'voice-wake-word');
          voiceUi(false,'Touchez son visage pour parler');
        }
        continue;
      }
      if(melWakeArmedUntil>Date.now()){
        melWakeArmedUntil=0;
        queueMessage(transcript,'voice-wake-word');
        voiceUi(false,'Touchez son visage pour parler');
      }
    }
  };
  melWakeRecognition.onerror=e=>{
    if(['not-allowed','service-not-allowed'].includes(String(e.error||'')))melWakeStop();
  };
  melWakeRecognition.onend=()=>melWakeScheduleRestart();
  try{melWakeRecognition.start();return true}catch{melWakeStop();return false}
}
window.melPauseWakeWord=()=>{if(!melWakeEnabled)return false;melWakeStop();return true};
window.melResumeWakeWord=()=>melWakeStart();
window.melWakeWord=Object.freeze({start:melWakeStart,stop:melWakeStop,detect:melWakeDetect});
window.addEventListener('load',()=>{melWakeStart().catch(()=>{})},{once:true});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){try{melWakeRecognition?.stop()}catch{}}
  else if(melWakeEnabled)melWakeScheduleRestart();
});
`;
