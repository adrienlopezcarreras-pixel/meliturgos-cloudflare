import app from './ui-release-fix-entry.js';
import { requireAuth } from './core/security.js';
import { authorizeDevBridge } from './core/dev-bridge-auth.js';
import { createLearningEngine } from './learning/learning-engine.js';
import { getLiveLearningProgress } from './learning/live-progress.js';
import { ensureZeroCostBenchmarkBaseline, prepareOperatorLora, runOperatorBenchmark } from './learning/operator-actions.js';
import { enhanceThemeAvatars } from './pages/theme-avatar-enhancer.js';
import { runScheduledSystemBackup } from './backup/system-backup-runtime.js';

const PROFESSOR_SAFE_DEV_BRIDGE_PATHS = new Set([
  '/api/dev-bridge/health',
  '/api/dev-bridge/jobs',
]);

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
    },
  });
}

async function safeJsonBody(request) {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

async function liveLearningProgressResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    const engine = createLearningEngine(env);
    const progress = await getLiveLearningProgress({ engine, db: env.DB });
    return json({ ok: true, ...progress });
  } catch (error) {
    return json({
      ok: false,
      error: 'LIVE_LEARNING_PROGRESS_UNAVAILABLE',
      detail: String(error?.message || 'unknown').slice(0, 180),
    }, 503);
  }
}

async function operatorBenchmarkResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    const result = await runOperatorBenchmark(env);
    return json({ ok: true, ...result });
  } catch (error) {
    const code = String(error?.code || '');
    const unavailable = code === 'AI_BINDING_UNAVAILABLE';
    const invalidModel = code === 'BENCHMARK_MODEL_NOT_VERIFIED_ZERO_COST';
    return json({
      ok: false,
      error: unavailable
        ? 'BENCHMARK_AI_UNAVAILABLE'
        : invalidModel
          ? 'BENCHMARK_MODEL_NOT_VERIFIED_ZERO_COST'
          : 'BENCHMARK_RUN_FAILED',
      detail: String(error?.message || 'unknown').slice(0, 220),
    }, unavailable ? 503 : invalidModel ? 409 : 500);
  }
}

async function operatorLoraPrepareResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    const body = await safeJsonBody(request);
    const result = await prepareOperatorLora(env, {
      base_model: body.base_model,
      min_quality: body.min_quality,
    });
    return json({ ok: true, ...result });
  } catch (error) {
    return json({
      ok: false,
      error: 'LORA_PREPARE_FAILED',
      detail: String(error?.message || 'unknown').slice(0, 220),
    }, 500);
  }
}

/**
 * Normal mode historically accumulated visual patches in ui-entry and
 * ui-release-fix-entry before the canonical theme enhancer ran. Strip only
 * those presentation-only layers at the final edge; functional cleanup and
 * cache scripts remain intact. This makes theme-avatar-enhancer the sole
 * visual owner of normal mode without rewriting lower runtime behavior.
 */
export async function stripLegacyNormalVisualLayers(response) {
  if (!(response instanceof Response)) return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  const html = await response.text();
  const body = html
    .replace(/<style id="mel-owner-visual-fix">[\s\S]*?<\/style>/g, '')
    .replace(/<style id="mel-new-hd-scenes">[\s\S]*?<\/style>/g, '')
    .replace(/<script id="mel-normal-release-runtime">[\s\S]*?<\/script>/g, '');
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

const PROFESSOR_LIVE_LEARNING_PATCH = `<script id="mel-professor-live-learning-runtime">
(()=>{
  let timer=null;
  const q=s=>document.querySelector(s);
  const txt=(selector,value)=>{const node=q(selector);if(node)node.textContent=String(value??'—')};
  const pct=value=>value==null?'—':(Math.round(Number(value)*1000)/10)+'%';
  const gain=value=>{
    if(value==null||!Number.isFinite(Number(value)))return '—';
    const points=Math.round(Number(value)*1000)/10;
    return (points>0?'+':'')+points+' pt';
  };
  const xp=value=>Number(value||0).toLocaleString('fr-FR')+' XP';
  const shortSha=value=>value?String(value).slice(0,8):null;
  const humanBenchmarkStatus=value=>({RAN:'mesuré',MEASURED:'mesuré',NOT_DUE:'à jour',DUE:'dû',SKIPPED_EVALUATOR_UNAVAILABLE:'dû · évaluateur indisponible',FAILED:'échec',NO_MEASUREMENT:'aucune mesure'})[String(value||'')]||String(value||'inconnu').toLowerCase();

  function ensureDetailRows(){
    const details=q('#learningDetails');
    const grid=details?.firstElementChild;
    if(!grid||q('#learnProjectExperience'))return;
    // #learnBenchmark already exists in the base learning meter. Do not create
    // a second element with the same id; the live renderer updates that row.
    const rows=[
      ['Leçons projet','learnProjectExperience'],
      ['Source XP','learnXpSource'],
      ['XP observée','learnObservedXp'],
      ['Gain benchmark','learnBenchmarkGain'],
      ['LoRA','learnLora'],
      ['Adaptateurs actifs','learnLoraAdapters'],
      ['Dernière mesure','learnMeasuredAt'],
    ];
    for(const [label,id] of rows){
      const span=document.createElement('span');
      span.style.color='#b6c2d2';
      span.textContent=label;
      const strong=document.createElement('strong');
      strong.id=id;
      strong.textContent='—';
      grid.append(span,strong);
    }
  }

  function ensureOperatorControls(){
    const details=q('#learningDetails');
    if(!details||q('#melLearningOperatorControls'))return;
    const wrap=document.createElement('div');
    wrap.id='melLearningOperatorControls';
    wrap.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid rgba(148,163,184,.22)';
    const benchmark=document.createElement('button');
    benchmark.id='melRunBenchmark';
    benchmark.type='button';
    benchmark.textContent='Lancer benchmark';
    benchmark.style.cssText='border:1px solid #64748b;border-radius:8px;padding:7px 10px;background:#172033;color:#f8fafc;cursor:pointer';
    const lora=document.createElement('button');
    lora.id='melPrepareLora';
    lora.type='button';
    lora.textContent='Préparer LoRA';
    lora.style.cssText=benchmark.style.cssText;
    const state=document.createElement('span');
    state.id='melLearningActionState';
    state.style.cssText='font-size:12px;color:#b6c2d2';
    state.textContent='Actions opérateur prêtes';
    wrap.append(benchmark,lora,state);
    details.append(wrap);

    benchmark.addEventListener('click',()=>runAction(
      benchmark,
      '/api/learning/benchmark/run',
      'Benchmark en cours…',
      data=>{
        const score=data?.benchmark?.score;
        const count=data?.benchmark?.case_count;
        return 'Benchmark terminé · '+pct(score)+(count!=null?' · '+count+' cas':'');
      }
    ));
    lora.addEventListener('click',()=>runAction(
      lora,
      '/api/learning/lora/prepare',
      'Préparation LoRA…',
      data=>{
        const status=data?.plan?.status||data?.plan?.readiness?.status||'plan enregistré';
        const trainer=data?.trainer?.available===true?'trainer disponible':'entraînement externe non lancé';
        return 'LoRA '+String(status).toLowerCase()+' · '+trainer;
      }
    ));
  }

  async function runAction(button,url,busyLabel,formatResult){
    const state=q('#melLearningActionState');
    if(button)button.disabled=true;
    if(state)state.textContent=busyLabel;
    try{
      const response=await fetch(url,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:'{}',
        cache:'no-store',
        credentials:'same-origin'
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok===false)throw new Error(data.detail||data.error||('HTTP_'+response.status));
      if(state)state.textContent=formatResult(data);
      await refresh();
    }catch(error){
      if(state)state.textContent='Échec · '+String(error?.message||error).slice(0,140);
    }finally{
      if(button)button.disabled=false;
    }
  }

  function render(d){
    if(!d||d.ok===false)return;
    ensureDetailRows();
    ensureOperatorControls();
    const e=d.evidence||{};
    const b=d.benchmark_status||{};
    const l=d.lora_status||{};
    const p=Math.max(0,Math.min(100,Number(d.level_progress_percent||0)));
    const benchRuns=Math.max(0,Number(b.runs??e.benchmark_runs??0));
    const benchBase=b.baseline_score??e.benchmark_baseline_score;
    const benchLatest=b.latest_score??e.benchmark_latest_score;
    const bench=benchLatest==null?'bench —':'bench '+pct(benchLatest);
    const benchStatus=humanBenchmarkStatus(b.status);
    const benchSha=shortSha(b.source_sha);
    const cadence=b.cadence&&Number(b.cadence.every_verified_jobs||0)>0
      ? ' · cadence '+Number(b.cadence.verified_jobs_since_benchmark||0)+'/'+Number(b.cadence.every_verified_jobs||0)
      : '';
    const benchDetail=benchRuns<1
      ? benchStatus+(b.failure?' · '+String(b.failure):'')
      : benchStatus+' · '+benchRuns+' run'+(benchRuns>1?'s':'')+' · '+(benchBase==null?pct(benchLatest):pct(benchBase)+' → '+pct(benchLatest))+(benchSha?' · '+benchSha:'')+cadence;
    const adapterCount=Math.max(0,Number(l.active_adapter_count??e.active_adapter_count??0));
    const loraState=String(l.state||(e.neural_weights_changed===true&&adapterCount>0?'ACTIVE':'BLOCKED')).toUpperCase();
    const lora=loraState==='ACTIVE'?'LoRA actif':'LoRA '+loraState.toLowerCase();
    const loraDetail=loraState+(l.reason?' · '+String(l.reason):'')+(l.plan_id?' · plan '+String(l.plan_id).slice(0,26):'');
    const lessons=d.project_experience?.available?(Number(d.project_experience.count||0)+' leçons'):'leçons —';

    txt('#learnLevel',d.level??'—');
    txt('#learnRank',(d.rank||'')+' · '+p.toFixed(0)+'%');
    const bar=q('#learnBar');
    if(bar)bar.style.width=p+'%';
    txt('#learnXp',xp(d.canonical_xp??d.xp));
    txt('#learnMeta',Number(e.corrections_validated||0)+' corr. · '+lessons+' · '+bench+' · '+lora);
    txt('#learnNext',xp(d.xp_to_next_level));
    txt('#learnProjectExperience',d.project_experience?.available?(Number(d.project_experience.count||0)+' en mémoire active'):'indisponible');
    txt('#learnXpSource',d.xp_source==='verified-journal'?'journal XP vérifié':'rapport d’apprentissage courant');
    txt('#learnObservedXp',xp(d.observed_xp));
    txt('#learnBenchmark',benchDetail);
    txt('#learnBenchmarkGain',gain(b.gain??e.benchmark_gain));
    txt('#learnLora',loraDetail);
    txt('#learnLoraAdapters',adapterCount.toLocaleString('fr-FR'));
    const measured=d.measured_at?new Date(d.measured_at):null;
    txt('#learnMeasuredAt',measured&&!Number.isNaN(measured.getTime())?measured.toLocaleString('fr-FR'):'—');
    const chip=q('#learningChip');
    if(chip)chip.title='Données live persistées · '+xp(d.canonical_xp??d.xp)+' · '+benchStatus+' · '+loraState+' · roadmap exclue';
  }

  async function refresh(){
    try{
      const response=await fetch('/api/learning/progress',{cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw new Error('HTTP_'+response.status);
      render(await response.json());
    }catch(error){
      const meta=q('#learnMeta');
      if(meta&&!meta.textContent.includes('indisponible'))meta.textContent+=' · live indisponible';
    }
  }

  function start(){
    ensureDetailRows();
    ensureOperatorControls();
    refresh();
    if(timer)clearInterval(timer);
    timer=setInterval(refresh,30000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)},{once:true});
})();
</script>`;

async function enhanceProfessorLearning(response, pathname) {
  const type = response.headers.get('content-type') || '';
  if (pathname !== '/professor' || !response.ok || !type.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('mel-professor-live-learning-runtime')) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const body = html.includes('</body>')
    ? html.replace('</body>', PROFESSOR_LIVE_LEARNING_PATCH + '</body>')
    : html + PROFESSOR_LIVE_LEARNING_PATCH;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/dev-bridge/') && !PROFESSOR_SAFE_DEV_BRIDGE_PATHS.has(url.pathname)) {
      const denied = authorizeDevBridge(request, env);
      if (denied) return denied;
    }
    if (request.method === 'GET' && url.pathname === '/api/learning/progress') {
      return liveLearningProgressResponse(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/learning/benchmark/run') {
      return operatorBenchmarkResponse(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/learning/lora/prepare') {
      return operatorLoraPrepareResponse(request, env);
    }
    let response = await app.fetch(request, env, ctx);
    if (request.method !== 'GET') return response;
    if (url.pathname === '/' || url.pathname === '/mvp') {
      response = await stripLegacyNormalVisualLayers(response);
      response = await enhanceThemeAvatars(response);
    }
    return enhanceProfessorLearning(response, url.pathname);
  },
  async scheduled(controller, env, ctx) {
    await ensureZeroCostBenchmarkBaseline(env).catch((error) => console.error('[MEL benchmark] baseline bootstrap skipped:', error?.code || error?.message || error));
    await app.scheduled(controller, env, ctx);
    const scheduledAt = Number(controller?.scheduledTime);
    const now = () => new Date(Number.isFinite(scheduledAt) ? scheduledAt : Date.now()).toISOString();
    const backupWork = runScheduledSystemBackup(env, { now }).catch((error) => {
      console.error('[MEL backup] scheduled snapshot failed:', error?.code || error?.message || error);
      return null;
    });
    if (ctx?.waitUntil) ctx.waitUntil(backupWork);
    else await backupWork;
  },
};