export const OBJECTIVE_PANEL_SOURCE = `
const objectivePanel=document.getElementById('objectivePanel');
const objectiveTitle=document.getElementById('objectiveTitle');
const objectiveSteps=document.getElementById('objectiveSteps');
// The objective is an owner-controlled floating window, never a chat layout row.
// Store only geometry/presentation here; objective content remains server-backed.
const objectiveDrag=document.getElementById('objectiveDrag');
const objectiveCollapse=document.getElementById('objectiveCollapse');
const objectiveHide=document.getElementById('objectiveHide');
const objectiveShow=document.getElementById('objectiveShow');
const objectiveLayoutKey='mel-professor-objective-float-v1';
let objectiveLayout={};
try{
  const stored=JSON.parse(localStorage.getItem(objectiveLayoutKey)||'{}');
  if(stored&&typeof stored==='object'&&!Array.isArray(stored))objectiveLayout=stored;
}catch{}
function objectiveSaveLayout(){
  if(!objectivePanel)return;
  const bounds=objectivePanel.getBoundingClientRect();
  if(bounds.width>0&&bounds.height>0&&!objectivePanel.classList.contains('is-collapsed')&&!objectivePanel.hidden){
    objectiveLayout.width=bounds.width;
    objectiveLayout.height=bounds.height;
  }
  if(bounds.width>0&&bounds.height>0&&!objectivePanel.hidden){
    objectiveLayout.left=bounds.left;
    objectiveLayout.top=bounds.top;
  }
  objectiveLayout.collapsed=objectivePanel.classList.contains('is-collapsed');
  objectiveLayout.hidden=objectivePanel.hidden;
  try{localStorage.setItem(objectiveLayoutKey,JSON.stringify(objectiveLayout))}catch{}
}
function objectiveKeepInViewport(){
  if(!objectivePanel||objectivePanel.hidden)return;
  const rect=objectivePanel.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const left=Math.min(Math.max(8,rect.left),Math.max(8,window.innerWidth-rect.width-8));
  const top=Math.min(Math.max(8,rect.top),Math.max(8,window.innerHeight-rect.height-8));
  objectivePanel.style.left=left+'px';
  objectivePanel.style.top=top+'px';
  objectivePanel.style.right='auto';
}
function objectiveUpdateControls(){
  if(!objectivePanel)return;
  const collapsed=objectivePanel.classList.contains('is-collapsed');
  if(objectiveCollapse){
    objectiveCollapse.textContent=collapsed?'Agrandir':'Réduire';
    objectiveCollapse.setAttribute('aria-expanded',String(!collapsed));
  }
  if(objectiveShow)objectiveShow.hidden=!objectivePanel.hidden;
}
if(objectivePanel){
  if(Number.isFinite(objectiveLayout.width))objectivePanel.style.width=Math.max(260,Math.min(objectiveLayout.width,window.innerWidth-16))+'px';
  if(Number.isFinite(objectiveLayout.height))objectivePanel.style.height=Math.max(82,Math.min(objectiveLayout.height,window.innerHeight-16))+'px';
  if(Number.isFinite(objectiveLayout.left)&&Number.isFinite(objectiveLayout.top)){
    objectivePanel.style.left=objectiveLayout.left+'px';
    objectivePanel.style.top=objectiveLayout.top+'px';
    objectivePanel.style.right='auto';
  }
  objectivePanel.classList.toggle('is-collapsed',objectiveLayout.collapsed===true);
  objectivePanel.hidden=objectiveLayout.hidden===true;
  objectiveUpdateControls();
  requestAnimationFrame(objectiveKeepInViewport);
  window.addEventListener('resize',objectiveKeepInViewport);
  // Native CSS resize has no reliable event on all browsers; commit size on release.
  objectivePanel.addEventListener('pointerup',objectiveSaveLayout);
}
if(objectiveCollapse)objectiveCollapse.addEventListener('click',()=>{
  const collapsed=objectivePanel.classList.toggle('is-collapsed');
  if(!collapsed){
    if(Number.isFinite(objectiveLayout.width))objectivePanel.style.width=Math.max(260,Math.min(objectiveLayout.width,window.innerWidth-16))+'px';
    if(Number.isFinite(objectiveLayout.height))objectivePanel.style.height=Math.max(82,Math.min(objectiveLayout.height,window.innerHeight-16))+'px';
  }
  objectiveUpdateControls();
  objectiveKeepInViewport();
  objectiveSaveLayout();
});
if(objectiveHide)objectiveHide.addEventListener('click',()=>{
  objectiveSaveLayout();
  objectivePanel.hidden=true;
  objectiveUpdateControls();
  objectiveSaveLayout();
});
if(objectiveShow)objectiveShow.addEventListener('click',()=>{
  objectivePanel.hidden=false;
  objectiveUpdateControls();
  objectiveKeepInViewport();
  objectiveSaveLayout();
});
if(objectiveDrag){
  let dragging=null;
  objectiveDrag.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('button, input, a'))return;
    const rect=objectivePanel.getBoundingClientRect();
    dragging={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
    objectiveDrag.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  objectiveDrag.addEventListener('pointermove',event=>{
    if(!dragging||dragging.id!==event.pointerId)return;
    const x=Math.max(8,Math.min(dragging.left+event.clientX-dragging.x,window.innerWidth-objectivePanel.offsetWidth-8));
    const y=Math.max(8,Math.min(dragging.top+event.clientY-dragging.y,window.innerHeight-objectivePanel.offsetHeight-8));
    objectivePanel.style.left=x+'px';
    objectivePanel.style.top=y+'px';
    objectivePanel.style.right='auto';
  });
  const stopDrag=event=>{
    if(!dragging||dragging.id!==event.pointerId)return;
    dragging=null;
    if(objectiveDrag.hasPointerCapture?.(event.pointerId))objectiveDrag.releasePointerCapture(event.pointerId);
    objectiveSaveLayout();
  };
  objectiveDrag.addEventListener('pointerup',stopDrag);
  objectiveDrag.addEventListener('pointercancel',stopDrag);
  objectiveDrag.addEventListener('keydown',event=>{
    if(event.target!==objectiveDrag)return;
    const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];
    if(!delta)return;
    event.preventDefault();
    const rect=objectivePanel.getBoundingClientRect();
    objectivePanel.style.left=rect.left+delta[0]+'px';
    objectivePanel.style.top=rect.top+delta[1]+'px';
    objectivePanel.style.right='auto';
    objectiveKeepInViewport();
    objectiveSaveLayout();
  });
}
function renderObjective(plan){
  if(!objectiveTitle||!objectiveSteps)return;
  objectivePanel?.classList.toggle('has-plan',Boolean(plan?.steps?.length));
  if(!plan?.steps?.length){objectiveTitle.textContent='Donne un objectif dans le chat. La liste s’ouvre ici.';objectiveSteps.replaceChildren();return}
  objectiveTitle.textContent=plan.title||'Objectif';
  objectiveSteps.replaceChildren();
  for(const step of plan.steps){
    const li=document.createElement('li');
    const button=document.createElement('button');
    button.type='button';
    button.className='objective-step objective-'+step.state;
    button.textContent=(step.state==='done'?'✓ ':step.state==='doing'?'▶ ':'· ')+step.label;
    button.addEventListener('click',()=>advanceObjective(plan,step));
    li.appendChild(button);
    objectiveSteps.appendChild(li);
  }
}
async function readObjective(){
  try{const r=await fetch('/api/chat/objective',{cache:'no-store',credentials:'same-origin'});const d=await r.json();if(r.ok)renderObjective(d.plan)}catch{}
}
async function saveObjective(text){
  const r=await fetch('/api/chat/objective',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({text,conversation_id:typeof conversationId==='string'?conversationId:''})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.code||'OBJECTIVE_FAILED');
  renderObjective(d.plan);
}
async function advanceObjective(plan,step){
  const state=step.state==='todo'?'doing':step.state==='doing'?'done':'todo';
  const r=await fetch('/api/chat/objective/step',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({step_id:step.id,state})});
  const d=await r.json().catch(()=>({}));
  if(r.ok)renderObjective(d.plan);
}
function maybeTrackObjective(text){
  const value=String(text||'').trim().replace(/^(?:ok\\s+)?mel[,:]?\\s+/i,'');
  if(value.length<8||value.length>2000)return;
  if(!/^(?:objectif|but|mission)\\s*[:\\-–]|^(?:je veux|j'aimerais|fais(?:-moi)?|fait|crée|cree|construis|développe|developpe|prépare|prepare|mets en place)\\b/i.test(value))return;
  saveObjective(value).catch(()=>{});
}
document.getElementById('objectiveAdd').addEventListener('submit',event=>{
  event.preventDefault();
  const field=document.getElementById('objectiveNewStep');
  const label=String(field?.value||'').trim();
  if(!label)return;
  fetch('/api/chat/objective/step',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({label})}).then(r=>r.json()).then(d=>{if(d.plan)renderObjective(d.plan);if(field)field.value=''}).catch(()=>{});
});
readObjective();
`;
