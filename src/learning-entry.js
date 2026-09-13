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

const LEARNING_CARD = '<article class="card third" id="learningCard"><h2>Apprentissage MEL <span class="tag good" style="vertical-align:middle">RÉEL</span></h2><div class="metric">Niv. <span id="learnLevel">—</span> <small id="learnRank">mesure en cours</small></div><div class="progress"><span id="learnBar" style="width:0%"></span></div><p class="muted" id="learnXp">Calcul depuis les preuves d’apprentissage…</p><div class="status-row"><span>Corrections validées</span><strong id="learnCorrections">—</strong></div><div class="status-row"><span>Benchmark</span><strong id="learnBenchmark">—</strong></div><div class="status-row"><span>Poids neuronaux</span><strong id="learnWeights">—</strong></div><p class="footer-note">XP = preuves d’apprentissage persistées. La feuille de route ne compte jamais dans ce niveau.</p></article>';

const LEARNING_BROWSER_SCRIPT = `
async function loadLearningProgress(){
  const level=qs('#learnLevel'),rank=qs('#learnRank'),bar=qs('#learnBar'),xp=qs('#learnXp');
  if(!level||!rank||!bar||!xp)return false;
  try{
    const d=await jfetch('/api/learning/progress'),e=d.evidence||{};
    level.textContent=d.level??'—';
    rank.textContent=(d.rank||'')+' · '+Number(d.level_progress_percent||0).toFixed(1)+'% du niveau';
    bar.style.width=Math.max(0,Math.min(100,Number(d.level_progress_percent||0)))+'%';
    xp.textContent=Number(d.xp||0).toLocaleString('fr-FR')+' XP · '+Number(d.xp_to_next_level||0).toLocaleString('fr-FR')+' XP avant le niveau suivant';
    const c=qs('#learnCorrections');if(c)c.textContent=Number(e.corrections_validated||0)+' / '+Number(e.corrections_recorded||0);
    const b=qs('#learnBenchmark');
    if(b){
      if(e.benchmark_latest_score==null)b.textContent='pas encore établi';
      else{
        const score=Math.round(Number(e.benchmark_latest_score||0)*1000)/10;
        const gain=e.benchmark_gain==null?'':(' · Δ '+(Number(e.benchmark_gain)>=0?'+':'')+(Math.round(Number(e.benchmark_gain)*1000)/10)+' pts');
        b.textContent=score+'%'+gain;
      }
    }
    const w=qs('#learnWeights');if(w)w.textContent=e.neural_weights_changed?('LoRA actif · '+Number(e.active_adapter_count||0)):'inchangés · LoRA inactif';
    return true;
  }catch(err){
    level.textContent='—';rank.textContent='indisponible';bar.style.width='0%';xp.textContent='Mesure indisponible : '+err.message;
    const w=qs('#learnWeights');if(w)w.textContent='non vérifié';
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
