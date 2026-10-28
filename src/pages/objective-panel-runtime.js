export const OBJECTIVE_PANEL_SOURCE = `
const objectivePanel=document.getElementById('objectivePanel');
const objectiveTitle=document.getElementById('objectiveTitle');
const objectiveSteps=document.getElementById('objectiveSteps');
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

function setupFloatingObjective(){
  if(!objectivePanel)return;
  const key='mel-professor-objective-window-v1';
  const style=document.createElement('style');
  style.textContent='.professor-objective-panel.objective-floating{position:fixed;z-index:1100;left:auto;top:auto;right:22px;bottom:90px;width:min(410px,calc(100vw - 24px));max-height:75vh;overflow:auto;resize:both;min-width:260px;min-height:56px;box-shadow:0 16px 45px rgba(0,0,0,.5)}.objective-floating .objective-window-head{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:move;touch-action:none;user-select:none;margin-bottom:8px}.objective-floating .objective-window-head h2{margin:0}.objective-window-controls{display:flex;gap:5px}.objective-window-controls button{cursor:pointer;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--text);padding:4px 8px}.objective-floating.objective-collapsed .objective-title,.objective-floating.objective-collapsed .objective-steps,.objective-floating.objective-collapsed .objective-add{display:none}.objective-floating[hidden]{display:none!important}@media(max-width:520px){.professor-objective-panel.objective-floating{max-width:calc(100vw - 16px);max-height:65vh}}';
  document.head.appendChild(style);
  const head=document.createElement('div');head.className='objective-window-head';
  const heading=objectivePanel.querySelector('h2');head.appendChild(heading);
  const controls=document.createElement('span');controls.className='objective-window-controls';
  const collapse=document.createElement('button');collapse.type='button';collapse.textContent='Réduire';collapse.setAttribute('aria-label',"Réduire l'objectif");
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',"Masquer l'objectif");
  controls.append(collapse,close);head.appendChild(controls);objectivePanel.prepend(head);
  objectivePanel.classList.add('objective-floating');
  document.body.appendChild(objectivePanel);
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{}
  const apply=()=>{
    if(Number.isFinite(saved.width))objectivePanel.style.width=Math.max(260,Math.min(saved.width,innerWidth-16))+'px';
    if(Number.isFinite(saved.height))objectivePanel.style.height=Math.max(56,Math.min(saved.height,innerHeight-16))+'px';
    if(Number.isFinite(saved.x))objectivePanel.style.left=Math.max(0,Math.min(saved.x,innerWidth-80))+'px';
    if(Number.isFinite(saved.y))objectivePanel.style.top=Math.max(0,Math.min(saved.y,innerHeight-48))+'px';
    if(saved.x!==undefined)objectivePanel.style.right='auto';
    if(saved.y!==undefined)objectivePanel.style.bottom='auto';
    objectivePanel.classList.toggle('objective-collapsed',!!saved.collapsed);
    objectivePanel.hidden=!!saved.hidden;
    collapse.textContent=saved.collapsed?'Agrandir':'Réduire';
  };
  const persist=()=>{try{localStorage.setItem(key,JSON.stringify(saved))}catch{}};
  apply();
  collapse.addEventListener('click',()=>{saved.collapsed=!saved.collapsed;apply();persist()});
  close.addEventListener('click',()=>{saved.hidden=true;apply();persist()});
  let dragging=null;
  head.addEventListener('pointerdown',event=>{
    if(event.target.closest('button')||event.button!==0)return;
    const rect=objectivePanel.getBoundingClientRect();
    dragging={dx:event.clientX-rect.left,dy:event.clientY-rect.top};
    head.setPointerCapture(event.pointerId);
  });
  head.addEventListener('pointermove',event=>{
    if(!dragging)return;
    saved.x=Math.max(0,Math.min(event.clientX-dragging.dx,innerWidth-80));
    saved.y=Math.max(0,Math.min(event.clientY-dragging.dy,innerHeight-48));
    apply();
  });
  const finish=()=>{if(dragging){dragging=null;persist()}};
  head.addEventListener('pointerup',finish);head.addEventListener('pointercancel',finish);
  if(typeof ResizeObserver!=='undefined'){
    const observer=new ResizeObserver(()=>{
      if(objectivePanel.hidden||saved.collapsed)return;
      const rect=objectivePanel.getBoundingClientRect();
      if(rect.width>0&&rect.height>0){saved.width=Math.round(rect.width);saved.height=Math.round(rect.height);persist()}
    });
    observer.observe(objectivePanel);
  }
  window.addEventListener('resize',apply);
  window.addEventListener('mel-objective-show',()=>{saved.hidden=false;apply();persist()});
}
setupFloatingObjective();
`;
