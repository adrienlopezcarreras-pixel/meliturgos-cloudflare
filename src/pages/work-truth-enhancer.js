export const WORK_TRUTH_PATCH = `<script id="mel-work-truth-runtime">
(function(){
  const REFRESH_MS=15000;
  let timer=null,busy=false;
  const terminal=new Set(['COMPLETED','DONE','SUCCEEDED','FAILED','CANCELLED','REJECTED','ROLLED_BACK']);

  async function getJson(url,options){
    const response=await fetch(url,{cache:'no-store',credentials:'same-origin',...(options||{})});
    const raw=await response.text();
    let data;try{data=JSON.parse(raw)}catch{throw new Error('REPONSE_INVALIDE')}
    if(!response.ok)throw new Error(data?.error||data?.code||('HTTP_'+response.status));
    return data;
  }

  function timeOf(job){
    const raw=job?.updated_at??job?.updatedAt??job?.created_at??job?.createdAt??0;
    const numeric=Number(raw);if(Number.isFinite(numeric)&&numeric>0)return numeric;
    const parsed=Date.parse(String(raw||''));return Number.isFinite(parsed)?parsed:0;
  }

  function latestJob(payload){
    const jobs=Array.isArray(payload?.jobs)?payload.jobs:[];
    return [...jobs].sort((a,b)=>timeOf(b)-timeOf(a))[0]||payload?.last_job||null;
  }

  function workRows(){
    const panel=document.querySelector('[data-panel="work"]');
    if(!panel)return [];
    return [...panel.querySelectorAll('.card.wide .status-row')];
  }

  function setPhase(index,text,tone='warn'){
    const row=workRows()[index];if(!row)return;
    const tag=row.querySelector('.tag');if(!tag)return;
    tag.textContent=text;
    tag.className='tag '+tone;
  }

  function truthyObject(value){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0}
  function passedTests(job){
    const tests=Array.isArray(job?.tests_json)?job.tests_json:Array.isArray(job?.result_json?.dev_bridge?.tests)?job.result_json.dev_bridge.tests:[];
    if(!tests.length)return null;
    return tests.every(test=>test?.passed!==false&&Number(test?.exit_code||test?.result?.exit_code||0)===0);
  }

  function renderPhases(job){
    if(!job){
      setPhase(0,'RÈGLE','good');setPhase(1,'AU REPOS','warn');setPhase(2,'NON LANCÉ','warn');setPhase(3,'NON LANCÉ','warn');setPhase(4,'NON LANCÉ','warn');return;
    }
    const status=String(job.status||'').toUpperCase();
    const plan=job.plan_json&&typeof job.plan_json==='object'?job.plan_json:{};
    const result=job.result_json&&typeof job.result_json==='object'?job.result_json:{};
    const councilDone=plan?.preflight?.stage==='AI_STATE_OF_PLAY_COMPLETE'||['COUNCIL_COMPLETE','WAITING_TEACHER','TEACHER_APPROVED','READY_FOR_REVIEW','REPAIR_REQUIRED','APPROVED','COMPLETED','DONE','SUCCEEDED'].includes(status);
    setPhase(0,councilDone?'FAIT':'OBLIGATOIRE',councilDone?'good':'warn');

    const inspection=plan?.inspection||plan?.dev_bridge?.inspection||result?.inspection||result?.dev_bridge?.inspection;
    const inspectionDone=String(inspection?.status||'').toUpperCase()==='COMPLETE'||Array.isArray(inspection?.evidence)&&inspection.evidence.length>0;
    const active=!terminal.has(status);
    setPhase(1,inspectionDone?'FAIT':active?'JOB ACTIF':'NON VALIDÉ',inspectionDone?'good':'warn');

    const testsOk=passedTests(job);
    const buildEvidence=testsOk!==null||truthyObject(result?.dev_bridge)||Boolean(job?.candidate_branch);
    setPhase(2,testsOk===true?'TESTS OK':testsOk===false?'À CORRIGER':buildEvidence?'PARTIEL':'NON LANCÉ',testsOk===true?'good':testsOk===false?'bad':'warn');

    const benchmark=result?.benchmark||result?.critique||result?.evaluation||plan?.benchmark;
    setPhase(3,truthyObject(benchmark)?'PREUVE PRÉSENTE':'NON LANCÉ',truthyObject(benchmark)?'good':'warn');

    const completed=['COMPLETED','DONE','SUCCEEDED'].includes(status);
    const supervised=['READY_FOR_REVIEW','TEACHER_APPROVED','APPROVED'].includes(status);
    setPhase(4,completed?'TERMINÉ':supervised?'SUPERVISÉ':'NON LANCÉ',completed?'good':'warn');
  }

  function renderJob(job,statusPayload){
    const bridge=document.getElementById('bridgeState');
    const out=document.getElementById('workOut');
    if(bridge){
      const state=String(statusPayload?.status||statusPayload?.bridge_status||statusPayload?.state||'ONLINE');
      bridge.textContent=state;
      bridge.className='pill';
    }
    if(out)out.textContent=job?JSON.stringify(job,null,2):'Aucun job persistant actif ou récent.';
    renderPhases(job);
    const panel=document.querySelector('[data-panel="work"]');
    const title=[...panel?.querySelectorAll('h2')||[]].find(node=>String(node.textContent||'').startsWith('Cycle d’évolution'));
    if(title)title.textContent='Cycle d’évolution · état réel';
  }

  async function refresh(){
    if(busy)return;busy=true;
    try{
      const [statusPayload,jobsPayload]=await Promise.all([
        getJson('/api/professor/dev/status'),
        getJson('/api/professor/dev/jobs'),
      ]);
      renderJob(latestJob(jobsPayload),statusPayload);
    }catch(error){
      const bridge=document.getElementById('bridgeState');const out=document.getElementById('workOut');
      if(bridge)bridge.textContent='INDISPONIBLE';
      if(out)out.textContent='État Work indisponible : '+String(error?.message||'ERREUR');
      renderPhases(null);
    }finally{busy=false}
  }

  async function createJob(){
    const input=document.getElementById('workGoal'),button=document.getElementById('workCreate');
    const goal=String(input?.value||'').trim();if(!goal||!button||button.disabled)return;
    button.disabled=true;
    try{
      await getJson('/api/professor/dev/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({goal})});
      await refresh();
    }catch(error){
      const out=document.getElementById('workOut');if(out)out.textContent='Erreur : '+String(error?.message||'ERREUR');
    }finally{button.disabled=false}
  }

  function install(){
    if(window.__melWorkTruth)return;
    const panel=document.querySelector('[data-panel="work"]');if(!panel)return;
    window.__melWorkTruth=true;
    const refreshButton=document.getElementById('workRefresh');if(refreshButton)refreshButton.onclick=refresh;
    const createButton=document.getElementById('workCreate');if(createButton)createButton.onclick=createJob;
    const nav=document.querySelector('#nav button[data-view="work"]');if(nav)nav.addEventListener('click',()=>setTimeout(refresh,0));
    refresh();
    timer=setInterval(()=>{if(panel.classList.contains('active'))refresh()},REFRESH_MS);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)},{once:true});
})();
</script>`;

export async function enhanceWorkTruth(response) {
  if (!(response instanceof Response)) return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  const html=await response.text();
  if(!html.includes('data-panel="work"')||!html.includes('id="workOut"'))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  if(html.includes('mel-work-truth-runtime'))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const body=html.includes('</body>')?html.replace('</body>',WORK_TRUTH_PATCH+'</body>'):html+WORK_TRUTH_PATCH;
  const headers=new Headers(response.headers);
  headers.set('content-length',String(new TextEncoder().encode(body).length));
  headers.set('cache-control','no-store');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
