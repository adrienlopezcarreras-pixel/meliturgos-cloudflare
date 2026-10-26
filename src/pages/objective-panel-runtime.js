export const OBJECTIVE_PANEL_SOURCE = `
const objectivePanel=document.getElementById('objectivePanel');
const objectiveTitle=document.getElementById('objectiveTitle');
const objectiveSteps=document.getElementById('objectiveSteps');
const objectiveAdd=document.getElementById('objectiveAdd');
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
const melQueueMessage=queueMessage;
queueMessage=function(text,source){maybeTrackObjective(text);return melQueueMessage(text,source)};
objectiveAdd?.addEventListener('submit',event=>{
  event.preventDefault();
  const field=document.getElementById('objectiveNewStep');
  const label=String(field?.value||'').trim();
  if(!label)return;
  fetch('/api/chat/objective/step',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({label})}).then(r=>r.json()).then(d=>{if(d.plan)renderObjective(d.plan);if(field)field.value=''}).catch(()=>{});
});
readObjective();
`;
