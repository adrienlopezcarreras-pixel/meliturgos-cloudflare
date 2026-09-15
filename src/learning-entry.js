import app from './index.js';
import { requireAuth } from './core/security.js';
import { createLearningEngine } from './learning/learning-engine.js';
import { buildLearningProgress } from './learning/progress.js';
import { applyLearnedRuntimeProfile, loadLearnedRuntimeProfile } from './learning/runtime-profile.js';

function learnedEnvironment(env) {
  if (!env?.AI || typeof env.AI.run !== 'function') return env;
  const base = env.AI;
  const fallbackMaxTokens = Math.max(512, Math.min(8192, Number(env.MEL_MAX_OUTPUT_TOKENS) || 4096));
  return {
    ...env,
    AI: {
      ...base,
      async run(model, input = {}, ...rest) {
        let profile = null;
        try { profile = await loadLearnedRuntimeProfile(env); } catch {}
        const prepared = applyLearnedRuntimeProfile({ model, input, profile, fallbackMaxTokens });
        return base.run.call(base, prepared.model, prepared.payload, ...rest);
      },
    },
  };
}

export function withLearnedRuntime(env) { return learnedEnvironment(env); }

async function learningProgressResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    const report = await createLearningEngine(env).report();
    return new Response(JSON.stringify({ ok: true, generated_at: Date.now(), ...buildLearningProgress(report) }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: 'LEARNING_PROGRESS_UNAVAILABLE', detail: String(error?.message || 'unknown').slice(0, 160) }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
}

const METER = '<div id="learningMeter" style="min-width:320px;max-width:440px"><span id="learningChip" role="button" tabindex="0" aria-expanded="false" title="Cliquer pour afficher les détails" style="display:flex;cursor:pointer;user-select:none;padding:13px 16px;border:1px solid rgba(125,211,252,.30);border-radius:999px;background:linear-gradient(120deg,rgba(34,211,238,.18),rgba(59,130,246,.14),rgba(167,139,250,.18));box-shadow:inset 0 1px 0 rgba(255,255,255,.15),0 10px 30px rgba(37,99,235,.17);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);transition:transform .18s ease,box-shadow .18s ease"><span style="display:flex;flex-direction:column;min-width:0;flex:1"><span style="display:flex;align-items:baseline;gap:10px;white-space:nowrap"><strong style="font-size:1.28rem;line-height:1.1">Niv. <span id="learnLevel">—</span></strong><span id="learnRank" style="font-size:.94rem;color:#bae6fd;font-weight:600">mesure…</span><span id="learnXp" style="margin-left:auto;font-size:1.02rem;font-weight:800;color:#e0f2fe">— XP</span><span id="learnArrow" style="font-size:1rem;color:#c4b5fd">⌄</span></span><span style="display:block;height:8px;margin-top:8px;border-radius:999px;background:rgba(255,255,255,.09);overflow:hidden"><span id="learnBar" style="display:block;height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#22d3ee,#60a5fa 55%,#a78bfa);box-shadow:0 0 14px rgba(34,211,238,.55);transition:width .35s ease"></span></span><span id="learnMeta" style="margin-top:6px;font-size:.84rem;line-height:1.2;color:#dbeafe;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">apprentissage réel · roadmap exclue</span></span></span><div id="learningDetails" style="display:none;margin-top:10px;padding:15px 17px;border:1px solid rgba(125,211,252,.18);border-radius:18px;background:linear-gradient(145deg,rgba(7,18,34,.88),rgba(27,30,54,.78));box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 16px 38px rgba(0,0,0,.20);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);font-size:.98rem;line-height:1.35"><div style="display:grid;grid-template-columns:1fr auto;gap:10px 16px"><span style="color:#b6c2d2">XP avant niveau suivant</span><strong id="learnNext">—</strong><span style="color:#b6c2d2">Corrections</span><strong id="learnCorrections">—</strong><span style="color:#b6c2d2">Prêtes entraînement</span><strong id="learnTraining">—</strong><span style="color:#b6c2d2">Benchmark</span><strong id="learnBenchmark">—</strong><span style="color:#b6c2d2">Essais réglages</span><strong id="learnTrials">—</strong><span style="color:#b6c2d2">Erreurs répétées</span><strong id="learnErrors">—</strong><span style="color:#b6c2d2">LoRA / poids</span><strong id="learnWeights">—</strong></div><div style="margin-top:12px;color:#7dd3fc;font-size:.84rem;line-height:1.3">Mesure d’apprentissage uniquement — la feuille de route ne donne aucun XP.</div></div></div>';

const SCRIPT = `
function toggleLearningDetails(){
  const chip=qs('#learningChip'),details=qs('#learningDetails'),arrow=qs('#learnArrow');
  if(!chip||!details)return;
  const open=chip.getAttribute('aria-expanded')==='true';
  chip.setAttribute('aria-expanded',String(!open));
  details.style.display=open?'none':'block';
  if(arrow)arrow.textContent=open?'⌄':'⌃';
}
async function loadLearningProgress(){
  const level=qs('#learnLevel'),rank=qs('#learnRank'),bar=qs('#learnBar'),xp=qs('#learnXp'),meta=qs('#learnMeta'),chip=qs('#learningChip');
  if(!level||!rank||!bar||!xp||!meta)return false;
  try{
    const d=await jfetch('/api/learning/progress'),e=d.evidence||{};
    const p=Math.max(0,Math.min(100,Number(d.level_progress_percent||0)));
    level.textContent=d.level??'—'; rank.textContent=(d.rank||'')+' · '+p.toFixed(0)+'%'; bar.style.width=p+'%';
    xp.textContent=Number(d.xp||0).toLocaleString('fr-FR')+' XP';
    const bench=e.benchmark_latest_score==null?'bench —':('bench '+(Math.round(Number(e.benchmark_latest_score)*1000)/10)+'%');
    const lora=e.neural_weights_changed?'LoRA actif':'LoRA inactif';
    meta.textContent=Number(e.corrections_validated||0)+' corr. · '+bench+' · '+lora;
    const put=(id,v)=>{const n=qs(id);if(n)n.textContent=v;};
    put('#learnNext',Number(d.xp_to_next_level||0).toLocaleString('fr-FR')+' XP');
    put('#learnCorrections',Number(e.corrections_validated||0)+' validées / '+Number(e.corrections_recorded||0));
    put('#learnTraining',Number(e.corrections_available_for_training||0));
    const base=e.benchmark_baseline_score==null?'—':(Math.round(Number(e.benchmark_baseline_score)*1000)/10)+'%';
    const latest=e.benchmark_latest_score==null?'—':(Math.round(Number(e.benchmark_latest_score)*1000)/10)+'%';
    const gain=e.benchmark_gain==null?'':(' · Δ '+(Number(e.benchmark_gain)>=0?'+':'')+(Math.round(Number(e.benchmark_gain)*1000)/10)+' pts');
    put('#learnBenchmark',base+' → '+latest+gain);
    put('#learnTrials',Number(e.inference_trials||0));
    put('#learnErrors',Number(e.repeated_taught_errors||0));
    put('#learnWeights',e.neural_weights_changed?('modifiés · '+Number(e.active_adapter_count||0)+' LoRA actif'):'inchangés · LoRA inactif');
    if(chip)chip.title='Cliquer pour les détails · '+Number(d.xp||0).toLocaleString('fr-FR')+' XP · roadmap exclue';
    return true;
  }catch(err){level.textContent='—';rank.textContent='indisponible';bar.style.width='0%';xp.textContent='— XP';meta.textContent='mesure indisponible';return false;}
}
const learningChip=qs('#learningChip');
if(learningChip){
  learningChip.addEventListener('click',toggleLearningDetails);
  learningChip.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleLearningDetails();}});
}
`;

const CONTROL_STYLE = `<style id="mel-control-center-style">
.mel-unified-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}.mel-unified-tabs button.active{background:linear-gradient(135deg,#2563eb,#1d4ed8)}
.mel-recall-last{margin-top:9px!important;background:rgba(255,255,255,.055)!important}.mel-live-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mel-live-log{max-height:55vh;overflow:auto}.mel-live-entry{padding:11px 12px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.025);margin-bottom:8px}.mel-live-entry strong{display:block}.mel-live-entry small{display:block;color:#94a3b8;margin-top:4px}.mel-live-pulse{display:inline-block;width:9px;height:9px;border-radius:50%;background:#34d399;box-shadow:0 0 0 0 rgba(52,211,153,.45);animation:melLivePulse 1.5s infinite}.mel-live-run-status{display:none;margin-top:10px;padding:10px 12px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(2,6,23,.48);font-size:.82rem;line-height:1.45}.mel-live-run-status.show{display:block}.mel-live-run-status.running{border-color:rgba(96,165,250,.42);background:rgba(30,64,175,.13)}.mel-live-run-status.ok{border-color:rgba(52,211,153,.38);background:rgba(6,78,59,.15)}.mel-live-run-status.error{border-color:rgba(251,113,133,.40);background:rgba(127,29,29,.16)}.mel-live-run-result{margin:8px 0 0;max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:rgba(2,6,23,.62);border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:8px;color:#dbeafe;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}@keyframes melLivePulse{70%{box-shadow:0 0 0 10px rgba(52,211,153,0)}}@media(max-width:720px){.mel-live-grid{grid-template-columns:1fr}}
</style>`;

const CONTROL_SCRIPT = `<script id="mel-control-center-runtime">
(()=>{
 const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function jf(url,opts){const r=await fetch(url,opts),t=await r.text();let d;try{d=JSON.parse(t)}catch{throw Error('Réponse serveur invalide')}if(!r.ok)throw Error(d.error||d.code||('HTTP '+r.status));return d}
 async function lastConversation(){const d=await jf('/api/gen2/conversations');const rows=(d.conversations||[]).slice().sort((a,b)=>Number(b.updated_at||0)-Number(a.updated_at||0));if(!rows.length)throw Error('Aucune conversation enregistrée');const c=rows[0],m=await jf('/api/gen2/conversations/messages?conversation_id='+encodeURIComponent(c.id));return {conversation:c,messages:m.messages||[]}}
 function textOf(m){return String(m?.content??m?.text??m?.message??'').trim()}
 async function recall(add,button){button.disabled=true;const original=button.textContent;try{const d=await lastConversation(),msgs=d.messages.slice(-40);if(!msgs.length)throw Error('Dernière conversation vide');for(const m of msgs){const role=String(m.role||m.author||'mel').toLowerCase().includes('user')?'user':'mel',text=textOf(m);if(text)add(role,text)}button.textContent='Conversation rappelée'}catch(e){button.textContent='Rappel impossible · '+e.message}finally{setTimeout(()=>{button.disabled=false;button.textContent=original},2200)}}
 function addRecall(){
   const full=q('[data-panel="chat"] .card');if(full&&!q('#melRecallFull')){const b=document.createElement('button');b.id='melRecallFull';b.className='mel-recall-last';b.textContent='Rappeler la dernière conversation';b.onclick=()=>recall((role,text)=>{const d=document.createElement('div');d.className='msg '+(role==='user'?'user':'mel');d.textContent=text;q('#chatlog').appendChild(d);q('#chatlog').scrollTop=q('#chatlog').scrollHeight},b);full.appendChild(b)}
   const composer=q('.composer');if(composer&&q('#messages')&&!q('#melRecallMvp')){const b=document.createElement('button');b.id='melRecallMvp';b.className='mel-recall-last';b.type='button';b.textContent='Rappeler la dernière conversation';b.onclick=()=>recall((role,text)=>{q('#empty')?.remove();const d=document.createElement('div');d.className='msg '+(role==='user'?'user':'mel');const who=document.createElement('span');who.className='who';who.textContent=role==='user'?'Vous':'MEL';const c=document.createElement('div');c.textContent=text;d.append(who,c);q('#messages').appendChild(d);q('#messages').scrollTop=q('#messages').scrollHeight},b);composer.appendChild(b)}
 }
 function unify(){const multi=q('[data-panel="multi"]'),work=q('[data-panel="work"]');if(!multi||!work||q('#melUnifiedTabs'))return;const navMulti=q('#nav [data-view="multi"]'),navWork=q('#nav [data-view="work"]');if(navMulti)navMulti.innerHTML='<span class="ico">✦</span>IA & Développement';if(navWork)navWork.style.display='none';const tabs=document.createElement('div');tabs.id='melUnifiedTabs';tabs.className='mel-unified-tabs';tabs.innerHTML='<button class="active" data-mode="meeting">Réunion IA</button><button data-mode="development">Développement</button>';const meeting=document.createElement('div'),dev=document.createElement('div');meeting.dataset.modePanel='meeting';dev.dataset.modePanel='development';dev.style.display='none';while(multi.firstChild)meeting.appendChild(multi.firstChild);while(work.firstChild)dev.appendChild(work.firstChild);multi.append(tabs,meeting,dev);work.remove();tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));meeting.style.display=b.dataset.mode==='meeting'?'block':'none';dev.style.display=b.dataset.mode==='development'?'block':'none'})}
 function live(){const nav=q('#nav'),main=q('main.main');if(!nav||!main||q('#melLiveNav'))return;const btn=document.createElement('button');btn.id='melLiveNav';btn.innerHTML='<span class="ico">●</span>Contrôle live';nav.appendChild(btn);const sec=document.createElement('section');sec.className='view';sec.dataset.panel='live';sec.innerHTML='<div class="section-title"><h2>Contrôle live</h2><p>Journal explicable de MEL : étapes, IA consultées, décisions résumées, tests, erreurs et reprises. Le raisonnement interne privé brut n’est pas affiché.</p></div><div class="mel-live-grid"><article class="card"><h2><span class="mel-live-pulse"></span> Exécution</h2><div id="melLiveState" class="muted" style="margin-top:12px">Chargement…</div><div class="actions"><button id="melLiveTick">Exécuter un cycle maintenant</button><button id="melLiveRefresh">Actualiser</button></div><div id="melLiveRunStatus" class="mel-live-run-status" aria-live="polite"></div></article><article class="card"><h2>Roadmap active</h2><div id="melLiveRoadmap" class="muted" style="margin-top:12px">Chargement…</div></article><article class="card wide"><h2>Réflexions résumées / activité</h2><div id="melLiveLog" class="mel-live-log" style="margin-top:12px">Chargement…</div></article></div>';main.appendChild(sec);
   async function refresh(){try{const d=await jf('/api/gen2/autonomy/state'),jobs=d.active_jobs||[],j=jobs[0];q('#melLiveState').innerHTML='<div><strong>Mode :</strong> '+esc(d.mode||'—')+'</div><div><strong>Branche :</strong> '+esc(d.candidate_branch||'—')+'</div><div><strong>Actifs :</strong> '+esc(d.counts?.active??0)+' · Teacher '+esc(d.counts?.waiting_teacher??0)+' attente / '+esc(d.counts?.teacher_approved??0)+' approuvé</div><div><strong>Readiness :</strong> '+esc(d.readiness?.status||'—')+'</div>';q('#melLiveRoadmap').innerHTML=j?'<div><strong>'+esc(j.roadmap_id||j.id)+'</strong></div><div>Statut : '+esc(j.status)+'</div><div>Teacher : '+esc(j.teacher?.status||'—')+(j.teacher?.verdict?' · '+esc(j.teacher.verdict):'')+'</div><div>Completion : '+esc(j.completion?.status||'—')+'</div>':'Aucun job actif.';q('#melLiveLog').innerHTML=jobs.slice(0,14).map(x=>'<div class="mel-live-entry"><strong>'+esc(x.roadmap_id||x.id)+' · '+esc(x.status)+'</strong><small>'+esc(x.requested_by)+' · '+esc(x.teacher?.status||'sans Teacher')+(x.teacher?.verdict?' · '+esc(x.teacher.verdict):'')+(x.completion?.status?' · completion '+esc(x.completion.status):'')+'</small></div>').join('')||'<div class="muted">Aucune activité active.</div>'}catch(e){q('#melLiveState').textContent='Indisponible : '+e.message}}
   let tickRunning=false,tickStarted=0,tickClock=null,tickPoll=null;
   function setRunBox(kind,html){const box=q('#melLiveRunStatus');if(!box)return;box.className='mel-live-run-status show '+kind;box.innerHTML=html}
   function resultHtml(data,elapsed){const t=data?.tick||{},j=t?.job||data?.state?.active_jobs?.[0]||null,n=t?.next||data?.state?.next||null;let html='<strong>Cycle terminé en '+esc((elapsed/1000).toFixed(1))+' s</strong>';html+='<div>Statut : '+esc(t?.status||t?.job?.status||'réponse reçue')+'</div>';if(j)html+='<div>Travail : '+esc(j.roadmap_id||j.id||'—')+' · '+esc(j.status||'—')+'</div>';if(t?.teacher)html+='<div>Teacher : '+esc(t.teacher.status||'—')+'</div>';if(t?.implementation)html+='<div>Implémentation : '+esc(t.implementation.status||'—')+(t.implementation.code?' · '+esc(t.implementation.code):'')+'</div>';if(t?.bridge_preparation)html+='<div>Bridge : '+esc(t.bridge_preparation.status||'—')+(t.bridge_preparation.code?' · '+esc(t.bridge_preparation.code):'')+'</div>';if(n)html+='<div>Prochaine cible : '+esc(n.id||n.roadmap_id||'—')+' · '+esc(n.title||n.status||'—')+'</div>';const raw=JSON.stringify(t,null,2);if(raw&&raw!=='{}')html+='<details style="margin-top:7px"><summary style="cursor:pointer">Détails techniques du cycle</summary><pre class="mel-live-run-result">'+esc(raw.slice(0,6000))+'</pre></details>';return html}
   async function runTick(){if(tickRunning)return;tickRunning=true;const b=q('#melLiveTick');tickStarted=Date.now();if(b)b.disabled=true;const updateClock=()=>{const s=Math.floor((Date.now()-tickStarted)/1000);if(b)b.textContent='Cycle en cours… '+s+' s';setRunBox('running','<strong>Cycle MEL réellement lancé…</strong><div>Durée : '+s+' s · l’état est actualisé pendant l’attente de la réponse serveur.</div>')};updateClock();tickClock=setInterval(updateClock,1000);tickPoll=setInterval(refresh,2500);const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),120000);try{const data=await jf('/api/gen2/autonomy/tick',{method:'POST',signal:controller.signal});clearTimeout(timeout);setRunBox('ok',resultHtml(data,Date.now()-tickStarted));await refresh()}catch(e){clearTimeout(timeout);const timedOut=e?.name==='AbortError';setRunBox('error','<strong>'+(timedOut?'Réponse serveur trop longue (> 120 s)':'Cycle en erreur')+'</strong><div>'+esc(timedOut?'Le navigateur a cessé d’attendre. Le serveur peut encore terminer le cycle ; utilise Actualiser pour voir l’état réel.':(e?.message||'ERREUR'))+'</div>');await refresh()}finally{if(tickClock)clearInterval(tickClock);if(tickPoll)clearInterval(tickPoll);tickClock=null;tickPoll=null;tickRunning=false;if(b){b.disabled=false;b.textContent='Exécuter un cycle maintenant'}}}
   btn.onclick=()=>{qa('.view').forEach(v=>v.classList.toggle('active',v===sec));qa('#nav button').forEach(x=>x.classList.toggle('active',x===btn));q('#viewTitle').textContent='Contrôle live';q('#viewSubtitle').textContent='Ce que MEL fait réellement, en direct.';refresh()};q('#melLiveRefresh').onclick=refresh;q('#melLiveTick').onclick=runTick;setInterval(()=>{if(sec.classList.contains('active')&&!tickRunning)refresh()},4000)
 }
 addRecall();unify();live();
})();
</script>`;

export async function injectLearningProgressWidget(response) {
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  const raw = await response.text();
  if (raw.includes('id="learningMeter"')) return new Response(raw, { status: response.status, headers: response.headers });
  const title = '<h2>Système personnel</h2>';
  const boot = 'boot();\n</script>';
  if (!raw.includes(title) || !raw.includes(boot)) return new Response(raw, { status: response.status, headers: response.headers });
  const row = '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap"><h2 style="margin:6px 0 0">Système personnel</h2>'+METER+'</div>';
  const body = raw.replace(title, row).replace(boot, SCRIPT+'\nloadLearningProgress();\nboot();\n</script>');
  const headers = new Headers(response.headers); headers.delete('content-length'); headers.set('cache-control','no-store');
  return new Response(body, { status: response.status, headers });
}

async function injectControlCenter(response) {
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  let raw = await response.text();
  if (raw.includes('mel-control-center-runtime') || !raw.includes('</body>')) return new Response(raw, { status: response.status, headers: response.headers });
  raw = raw.replace('</head>', CONTROL_STYLE + '</head>').replace('</body>', CONTROL_SCRIPT + '</body>');
  const headers = new Headers(response.headers); headers.delete('content-length'); headers.set('cache-control','no-store');
  return new Response(raw, { status: response.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/learning/progress') return learningProgressResponse(request, env);
    let response = await app.fetch(request, learnedEnvironment(env), ctx);
    if (request.method === 'GET' && url.pathname === '/professor') response = await injectLearningProgressWidget(response);
    if (request.method === 'GET' && ['/', '/mvp', '/professor'].includes(url.pathname)) response = await injectControlCenter(response);
    return response;
  },
  async scheduled(controller, env, ctx) { return app.scheduled(controller, learnedEnvironment(env), ctx); },
};
