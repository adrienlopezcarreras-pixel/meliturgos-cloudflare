import { onRequestGet as controlRoom } from './control-room.js';

export async function onRequestGet(context) {
  const response = await controlRoom(context);
  const html = await response.text();
  const patch = `<script id="mel-control-room-supervised-queue">
(function(){
  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
  async function json(url,opt){var r=await fetch(url,opt);var d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||d.code||('HTTP '+r.status));return d}
  async function supervisedContinue(button){
    var old=button.textContent;button.disabled=true;button.textContent='Préparation du travail…';
    try{
      var state=await json('/api/professor/dev/autonomy/status');
      var next=state&&state.next;
      if(!next){button.textContent='Roadmap sans étape disponible';return}
      var goal='['+next.id+'] '+next.title+(next.next?' — '+next.next:'');
      var result=await json('/api/gen2/capabilities/execute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'evolution.enqueue',input:{goal:goal,conversationId:'control-room',requestKey:'roadmap-'+next.id}})});
      button.textContent=result&&result.result&&result.result.created?'Travail lancé':'Travail déjà en cours';
      setTimeout(function(){location.reload()},900);
    }catch(e){button.textContent='Erreur : '+e.message;setTimeout(function(){button.textContent=old;button.disabled=false},2600)}
  }
  function ensureActivityPanel(){
    var work=document.querySelector('.view[data-panel="work"] .grid');
    if(!work||document.getElementById('liveCouncilActivity'))return;
    var card=document.createElement('article');card.className='card wide';card.id='liveCouncilActivity';
    card.innerHTML='<div class="section-head"><div><h2>Échanges Multi-IA du travail actif</h2><p>Réponses du Council, provenance des modèles et état Teacher. Les sorties utiles sont visibles; les raisonnements internes privés ne le sont pas.</p></div><button class="ghost" id="refreshCouncilActivity">Actualiser</button></div><div id="councilActivityBody"><div class="empty">Chargement…</div></div>';
    work.appendChild(card);document.getElementById('refreshCouncilActivity').addEventListener('click',loadActivity);
  }
  function answerText(a){if(a==null)return '';if(typeof a==='string')return a;if(typeof a.content==='string')return a.content;if(typeof a.text==='string')return a.text;try{return JSON.stringify(a,null,2)}catch{return String(a)}}
  async function loadActivity(){
    ensureActivityPanel();var body=document.getElementById('councilActivityBody');if(!body)return;
    try{
      var data=await json('/api/professor/dev/jobs');var jobs=(data.jobs||[]).slice().sort(function(a,b){return Number(b.updated_at||b.created_at||0)-Number(a.updated_at||a.created_at||0)});
      var job=jobs.find(function(j){return j&&j.plan_json&&j.plan_json.preflight&&j.plan_json.preflight.council})||jobs[0];
      if(!job){body.innerHTML='<div class="empty">Aucun job encore enregistré.</div>';return}
      var council=job.plan_json&&job.plan_json.preflight&&job.plan_json.preflight.council;var responses=council&&council.responses||[];var teacher=job.result_json&&job.result_json.teacher_bridge;var top='<div class="trace"><div class="trace-row"><div class="trace-key">Job</div><div class="trace-value"><b>'+esc(job.goal||job.id)+'</b></div></div><div class="trace-row"><div class="trace-key">État</div><div class="trace-value">'+esc(job.status||'—')+'</div></div><div class="trace-row"><div class="trace-key">Council</div><div class="trace-value">'+esc(council?council.status:'pas encore disponible')+' · '+responses.length+' réponse(s)</div></div><div class="trace-row"><div class="trace-key">Teacher</div><div class="trace-value">'+esc(teacher&&teacher.status||'pas encore demandé')+'</div></div></div>';
      var cards=responses.map(function(r,i){var a=r.answer||{};var provenance=a.provenance||{};var name=r.member||a.provider_id||provenance.provider||('IA '+(i+1));var meta=(provenance.provider||a.provider_id||'provider')+' · '+(provenance.model||'modèle');return '<div class="candidate '+(i===0?'best':'')+'"><div class="cand-head"><div><div class="cand-name">'+esc(name)+'</div><div class="chips"><span class="chip">'+esc(meta)+'</span><span class="chip">avis consultatif</span></div></div></div><div class="response">'+esc(answerText(a))+'</div></div>'}).join('');
      var teacherBlock='';if(teacher&&teacher.request){var req=teacher.request;teacherBlock='<div class="candidate" style="margin-top:12px"><div class="cand-name">Teacher · paquet de revue</div><div class="chips"><span class="chip">'+esc(teacher.status||'WAITING')+'</span><span class="chip">autorité finale</span></div><div class="response">Objectif : '+esc(req.goal||job.goal||'')+'\nCandidat : '+esc(req.candidate&&req.candidate.branch||job.candidate_branch||'—')+'\nContrat : '+esc(req.provenance&&req.provenance.contract||'—')+'</div></div>'}
      body.innerHTML=top+(cards?'<div class="candidate-grid" style="margin-top:14px">'+cards+'</div>':'<div class="empty">Le Council n’a pas encore produit de réponse.</div>')+teacherBlock;
    }catch(e){body.innerHTML='<div class="empty">Erreur : '+esc(e.message)+'</div>'}
  }
  document.addEventListener('click',function(event){
    var button=event.target&&event.target.closest&&event.target.closest('#continueRoadmap,#continueRoadmapTop,#continueRoadmapWork');
    if(!button)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    supervisedContinue(button);
  },true);
  ensureActivityPanel();loadActivity();setInterval(loadActivity,20000);
})();
</script>`;
  const body = html.includes('</body>') ? html.replace('</body>', patch + '</body>') : html + patch;
  const headers = new Headers(response.headers); headers.delete('content-length');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
