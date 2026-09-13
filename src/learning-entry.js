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

const CHIP = '<span id="learningChip" title="Apprentissage réel de MEL" style="display:inline-flex;min-width:210px;max-width:300px;padding:7px 10px;border:1px solid rgba(125,211,252,.22);border-radius:999px;background:linear-gradient(120deg,rgba(34,211,238,.13),rgba(59,130,246,.10),rgba(167,139,250,.13));box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 8px 24px rgba(37,99,235,.12);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)"><span style="display:flex;flex-direction:column;min-width:0;flex:1"><span style="display:flex;align-items:baseline;gap:6px;white-space:nowrap"><strong style="font-size:.84rem">Niv. <span id="learnLevel">—</span></strong><span id="learnRank" style="font-size:.66rem;color:#bae6fd">mesure…</span><span id="learnXp" style="margin-left:auto;font-size:.70rem;color:#e0f2fe">— XP</span></span><span style="display:block;height:4px;margin-top:4px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden"><span id="learnBar" style="display:block;height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#22d3ee,#60a5fa 55%,#a78bfa);box-shadow:0 0 12px rgba(34,211,238,.45);transition:width .35s ease"></span></span><span id="learnMeta" style="margin-top:3px;font-size:.60rem;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">apprentissage réel · roadmap exclue</span></span></span>';

const SCRIPT = `
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
    if(chip)chip.title='Apprentissage MEL · '+Number(d.xp||0).toLocaleString('fr-FR')+' XP · '+Number(d.xp_to_next_level||0).toLocaleString('fr-FR')+' XP avant niveau '+(Number(d.level||1)+1)+' · roadmap exclue';
    return true;
  }catch(err){level.textContent='—';rank.textContent='indisponible';bar.style.width='0%';xp.textContent='— XP';meta.textContent='mesure indisponible';return false;}
}
`;

export async function injectLearningProgressWidget(response) {
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  const raw = await response.text();
  if (raw.includes('id="learningChip"')) return new Response(raw, { status: response.status, headers: response.headers });
  const title = '<h2>Système personnel</h2>';
  const boot = 'boot();\n</script>';
  if (!raw.includes(title) || !raw.includes(boot)) return new Response(raw, { status: response.status, headers: response.headers });
  const row = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><h2 style="margin:0">Système personnel</h2>'+CHIP+'</div>';
  const body = raw.replace(title, row).replace(boot, SCRIPT+'\nloadLearningProgress();\nboot();\n</script>');
  const headers = new Headers(response.headers); headers.delete('content-length'); headers.set('cache-control','no-store');
  return new Response(body, { status: response.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/learning/progress') return learningProgressResponse(request, env);
    const response = await app.fetch(request, learnedEnvironment(env), ctx);
    return request.method === 'GET' && url.pathname === '/professor' ? injectLearningProgressWidget(response) : response;
  },
  async scheduled(controller, env, ctx) { return app.scheduled(controller, learnedEnvironment(env), ctx); },
};
