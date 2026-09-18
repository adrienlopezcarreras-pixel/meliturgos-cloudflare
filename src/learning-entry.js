import app from './index.js';
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
</style>`;

const CONTROL_SCRIPT = `<script id="mel-control-center-runtime">
(()=>{
 const q=s=>document.querySelector(s);
 function unify(){
   const multi=q('[data-panel="multi"]'),work=q('[data-panel="work"]');
   if(!multi||!work||q('#melUnifiedTabs'))return;
   const navMulti=q('#nav [data-view="multi"]'),navWork=q('#nav [data-view="work"]');
   if(navMulti)navMulti.innerHTML='<span class="ico">✦</span>IA & Développement';
   if(navWork)navWork.style.display='none';
   const tabs=document.createElement('div'),meeting=document.createElement('div'),dev=document.createElement('div');
   tabs.id='melUnifiedTabs';tabs.className='mel-unified-tabs';
   tabs.innerHTML='<button class="active" data-mode="meeting">Réunion IA</button><button data-mode="development">Développement</button>';
   meeting.dataset.modePanel='meeting';dev.dataset.modePanel='development';dev.style.display='none';
   while(multi.firstChild)meeting.appendChild(multi.firstChild);
   work.style.display='block';work.classList.add('active');dev.appendChild(work);multi.append(tabs,meeting,dev);
   tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{
     const development=b.dataset.mode==='development';
     tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
     meeting.style.display=development?'none':'block';dev.style.display=development?'block':'none';
     work.classList.toggle('active',development);
   });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',unify,{once:true});else unify();
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
    let response = await app.fetch(request, learnedEnvironment(env), ctx);
    if (request.method === 'GET' && url.pathname === '/professor') response = await injectLearningProgressWidget(response);
    if (request.method === 'GET' && url.pathname === '/professor') response = await injectControlCenter(response);
    return response;
  },
  async scheduled(controller, env, ctx) { return app.scheduled(controller, learnedEnvironment(env), ctx); },
};
