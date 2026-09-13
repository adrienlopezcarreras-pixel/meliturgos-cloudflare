import app from './index.js';
import { requireAuth } from './core/security.js';
import { createLearningEngine } from './learning/learning-engine.js';
import { buildLearningProgress } from './learning/progress.js';
import { applyLearnedRuntimeProfile, loadLearnedRuntimeProfile } from './learning/runtime-profile.js';

function learnedEnvironment(env) {
  if (!env?.AI || typeof env.AI.run !== 'function') return env;
  const base = env.AI;
  const configured = Number(env.MEL_MAX_OUTPUT_TOKENS);
  const fallbackMaxTokens = Math.max(512, Math.min(8192, Number.isFinite(configured) && configured > 0 ? configured : 4096));

  return {
    ...env,
    AI: {
      ...base,
      async run(model, input = {}, ...rest) {
        let profile = null;
        try {
          profile = await loadLearnedRuntimeProfile(env);
        } catch {
          profile = null;
        }
        const prepared = applyLearnedRuntimeProfile({ model, input, profile, fallbackMaxTokens });
        return base.run.call(base, prepared.model, prepared.payload, ...rest);
      },
    },
  };
}

export function withLearnedRuntime(env) {
  return learnedEnvironment(env);
}

async function learningProgressResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  try {
    const engine = createLearningEngine(env);
    const report = await engine.report();
    const progress = buildLearningProgress(report);
    return new Response(JSON.stringify({ ok: true, generated_at: Date.now(), ...progress }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'LEARNING_PROGRESS_UNAVAILABLE',
      detail: String(error?.code || error?.message || 'unknown').slice(0, 200),
    }), {
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }
}

const LEARNING_CARD = '<article class="card third" id="learningCard" style="padding:12px 14px"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div><span class="muted" style="display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.07em">Apprentissage MEL</span><strong style="font-size:1.25rem">Niv. <span id="learnLevel">—</span></strong></div><span class="tag good" id="learnRank">mesure…</span></div><div class="progress" style="height:6px;margin-top:8px"><span id="learnBar" style="width:0%"></span></div><div id="learnXp" style="margin-top:6px;font-size:.82rem;font-weight:600">Calcul des XP…</div><div class="muted" id="learnMeta" style="margin-top:3px;font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">preuves réelles · roadmap exclue</div></article>';

const LEARNING_BROWSER_SCRIPT = `
async function loadLearningProgress(){
  const level=qs('#learnLevel'),rank=qs('#learnRank'),bar=qs('#learnBar'),xp=qs('#learnXp'),meta=qs('#learnMeta');
  if(!level||!rank||!bar||!xp||!meta)return false;
  try{
    const d=await jfetch('/api/learning/progress'),e=d.evidence||{};
    const percent=Math.max(0,Math.min(100,Number(d.level_progress_percent||0)));
    level.textContent=d.level??'—';
    rank.textContent=(d.rank||'')+' · '+percent.toFixed(0)+'%';
    bar.style.width=percent+'%';
    xp.textContent=Number(d.xp||0).toLocaleString('fr-FR')+' XP · '+Number(d.xp_to_next_level||0).toLocaleString('fr-FR')+' avant niv. '+(Number(d.level||1)+1);
    const benchmark=e.benchmark_latest_score==null?'benchmark —':('benchmark '+(Math.round(Number(e.benchmark_latest_score||0)*1000)/10)+'%');
    const weights=e.neural_weights_changed?('LoRA '+Number(e.active_adapter_count||0)+' actif'):'LoRA inactif';
    meta.textContent=Number(e.corrections_validated||0)+' corrections validées · '+benchmark+' · '+weights+' · roadmap exclue';
    return true;
  }catch(err){
    level.textContent='—';rank.textContent='indisponible';bar.style.width='0%';xp.textContent='Mesure indisponible';meta.textContent=err.message;
    return false;
  }
}
`;

export async function injectLearningProgressWidget(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('text/html')) return response;

  const raw = await response.text();
  if (raw.includes('id="learningCard"')) {
    return new Response(raw, { status: response.status, headers: response.headers });
  }

  const cardMarker = '<article class="card third"><h2>Accès au code</h2>';
  const bootMarker = 'boot();\n</script>';
  if (!raw.includes(cardMarker) || !raw.includes(bootMarker)) {
    return new Response(raw, { status: response.status, headers: response.headers });
  }

  const body = raw
    .replace(cardMarker, LEARNING_CARD + cardMarker)
    .replace(bootMarker, LEARNING_BROWSER_SCRIPT + '\nloadLearningProgress();\nboot();\n</script>');
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  return new Response(body, { status: response.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/learning/progress') {
      return learningProgressResponse(request, env);
    }

    const response = await app.fetch(request, learnedEnvironment(env), ctx);
    if (request.method === 'GET' && url.pathname === '/professor') {
      return injectLearningProgressWidget(response);
    }
    return response;
  },

  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, learnedEnvironment(env), ctx);
  },
};
