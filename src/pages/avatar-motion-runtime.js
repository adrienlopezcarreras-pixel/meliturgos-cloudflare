import { AVATAR_LIPSYNC_SOURCE } from './avatar-lipsync-runtime.js';
export const MEL_AVATAR_MOTION_STATES = Object.freeze([
  'idle',
  'listening',
  'thinking',
  'speaking',
  'error',
]);

export const AVATAR_MOTION_SOURCE = `
const MEL_AVATAR_MOTION_STATES=['idle','listening','thinking','speaking','error'];
let melAvatarMotionState='idle';
let melAvatarMotionTimer=null;
function melSetAvatarState(next,detail=''){
  const state=MEL_AVATAR_MOTION_STATES.includes(String(next||''))?String(next):'idle';
  const node=document.getElementById('melAvatar');
  melAvatarMotionState=state;
  if(!node)return state;
  node.dataset.motionState=state;
  node.classList.toggle('listening',state==='listening');
  node.classList.toggle('thinking',state==='thinking');
  node.setAttribute('aria-busy',String(state==='thinking'));
  node.setAttribute('data-motion-detail',String(detail||'').slice(0,80));
  try{window.dispatchEvent(new CustomEvent('mel-avatar-statechange',{detail:{state,source:String(detail||'')}}))}catch{}
  return state;
}
function melAvatarTransient(state,duration=900,detail='transient'){
  if(melAvatarMotionTimer){clearTimeout(melAvatarMotionTimer);melAvatarMotionTimer=null}
  melSetAvatarState(state,detail);
  const ms=Math.max(120,Math.min(5000,Number(duration)||900));
  melAvatarMotionTimer=setTimeout(()=>{melAvatarMotionTimer=null;melSetAvatarState('idle','transient-complete')},ms);
}
window.melAvatarMotion=Object.freeze({
  states:Object.freeze([...MEL_AVATAR_MOTION_STATES]),
  setState:melSetAvatarState,
  transient:melAvatarTransient,
  getState:()=>melAvatarMotionState,
});
` + "\n" + AVATAR_LIPSYNC_SOURCE;
