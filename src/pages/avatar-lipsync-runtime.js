export const MEL_LIPSYNC_SCHEMA = 'mel.avatar-lipsync.v1';
export const MEL_LIPSYNC_LEVELS = Object.freeze([0,1,2,3]);

export function normalizeLipSyncLevel(value) {
  const level = Number(value);
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(3, Math.round(level)));
}

export const AVATAR_LIPSYNC_SOURCE = `
const MEL_LIPSYNC_LEVELS=[0,1,2,3];
let melLipSyncLevel=0,melLipSyncTimer=null,melLipSyncProvider=null,melLipSyncGeneration=0;
function melSetLipSyncLevel(value,source='fallback'){
  const level=Math.max(0,Math.min(3,Math.round(Number(value)||0)));
  melLipSyncLevel=level;
  const node=document.getElementById('melAvatar');
  if(node){
    node.dataset.lipsyncLevel=String(level);
    node.setAttribute('data-lipsync-source',String(source||'fallback').slice(0,80));
  }
  try{window.dispatchEvent(new CustomEvent('mel-avatar-lipsync',{detail:{level,source:String(source||'fallback')}}))}catch{}
  return level;
}
function melStopLipSync(){
  melLipSyncGeneration+=1;
  if(melLipSyncTimer){clearTimeout(melLipSyncTimer);melLipSyncTimer=null}
  try{melLipSyncProvider?.stop?.()}catch{}
  melSetLipSyncLevel(0,'stopped');
}
function melFallbackLipSync(){
  const generation=++melLipSyncGeneration;
  const pattern=[1,3,2,3,1,2];
  let index=0;
  const tick=()=>{
    if(generation!==melLipSyncGeneration||melAvatarMotionState!=='speaking')return melSetLipSyncLevel(0,'fallback-idle');
    melSetLipSyncLevel(pattern[index%pattern.length],'zero-cost-fallback');
    index+=1;
    melLipSyncTimer=setTimeout(tick,95);
  };
  tick();
}
async function melStartLipSync(context={}){
  melStopLipSync();
  if(melLipSyncProvider?.start){
    try{
      await melLipSyncProvider.start({
        ...context,
        onLevel:value=>melSetLipSyncLevel(value,melLipSyncProvider.id||'provider'),
      });
      return {provider:melLipSyncProvider.id||'provider',fallback:false};
    }catch{}
  }
  melFallbackLipSync();
  return {provider:'zero-cost-fallback',fallback:true};
}
function melAttachLipSyncProvider(provider){
  if(provider!=null&&(typeof provider!=='object'||typeof provider.start!=='function'))throw new Error('LIPSYNC_PROVIDER_INVALID');
  melStopLipSync();
  melLipSyncProvider=provider||null;
  return melLipSyncProvider?.id||null;
}
window.addEventListener('mel-avatar-statechange',event=>{
  const state=String(event.detail?.state||'');
  if(state==='speaking')melStartLipSync({state,source:event.detail?.source||''}).catch(()=>melFallbackLipSync());
  else melStopLipSync();
});
window.melAvatarLipSync=Object.freeze({
  schema:'mel.avatar-lipsync.v1',
  levels:Object.freeze([...MEL_LIPSYNC_LEVELS]),
  setLevel:melSetLipSyncLevel,
  start:melStartLipSync,
  stop:melStopLipSync,
  attachProvider:melAttachLipSyncProvider,
  getLevel:()=>melLipSyncLevel,
  getProvider:()=>melLipSyncProvider?.id||null,
});
`;
