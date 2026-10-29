import { maybeHandleArchitectureAuditInternal } from './diagnostics/architecture-audit-store.js';
import app from './ui-entry.js';
import { selectLatestCheckpointRelease, runLoraTrainingHeartbeat } from './learning/lora-training-heartbeat.js';
import { requireAuth } from './core/security.js';
import { authorizeDevBridge, isOidcBridgeCall } from './core/dev-bridge-auth.js';
import { createLearningEngine } from './learning/learning-engine.js';
import { getLiveLearningProgress } from './learning/live-progress.js';
import { ensureZeroCostBenchmarkBaseline, prepareOperatorLora, runOperatorBenchmark, runOperatorLoraBenchmark } from './learning/operator-actions.js';
import { runScheduledSystemBackup } from './backup/system-backup-runtime.js';
import {
  getLoraDailyStatus,
  getLoraDailyTrace,
  listLoraDailyTraces,
  markMissingLoraTrainingDay,
  reconcileOrphanedLoraTrainingTraces,
  maybeHandleLoraTraceInternal,
} from './learning/lora-daily-trace.js';

const FREE_LORA_HF_REPO = 'Meliturgos/mel-lora-uncensored';
const FREE_LORA_GITHUB_REPO = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
const FREE_LORA_WORKFLOW = 'lora-promote-from-huggingface.yml';
const FREE_LORA_TRAINING_WORKFLOW = 'lora-kaggle-free-gpu.yml';
const FREE_LORA_REQUIRED_FILES = Object.freeze([
  'adapter_model.safetensors',
  'adapter_config.json',
  'training-evidence.json',
  'artifact-evidence.json',
  'lora-plan.json',
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


const EXPERIMENTAL_TRAINING_WORKFLOW='professor-experimental-training.yml';
function experimentalTrack(value){return ['qwen3','abliteration'].includes(value)?value:null;}
async function experimentalGitHub(request,env,method,url,body){
  const auth=requireAuth(request,env);
  if(!auth.ok)return {denied:auth.response};
  const token=String(env?.MEL_GITHUB_TOKEN||'').trim();
  if(!token)return {denied:json({ok:false,error:'GITHUB_DISPATCH_TOKEN_NOT_CONFIGURED'},503)};
  try{
    const response=await fetch(url,{
      method,headers:{'accept':'application/vnd.github+json','authorization':'Bearer '+token,'user-agent':'mel-professor-training/1.0','content-type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data=response.status===204?{}:await response.json().catch(()=>({}));
    if(!response.ok)return {denied:json({ok:false,error:'GITHUB_TRAINING_API_FAILED',http_status:response.status},response.status===401||response.status===403?503:502)};
    return {data};
  }catch{return {denied:json({ok:false,error:'GITHUB_TRAINING_API_UNREACHABLE'},503)};}
}
async function experimentalTrainingResponse(request,env){
  const body=await safeJsonBody(request);
  const track=experimentalTrack(body.track);
  if(!track||!['preflight','gpu'].includes(body.mode))return json({ok:false,error:'UNSUPPORTED_EXPERIMENTAL_TRACK_OR_MODE'},400);
  if(body.mode==='gpu'){
    // GPU dispatch is deliberately gated until a separate, reviewed and
    // verifiable executor is wired. Never silently fall back to a preflight.
    return json({ok:false,error:track==='qwen3'
      ?'QWEN_GPU_DATASET_MANIFEST_AND_KAGGLE_EXECUTOR_REQUIRED'
      :'ABLITERATION_GPU_EXECUTOR_NOT_IMPLEMENTED',gpu_training_performed:false},409);
  }
  const api='https://api.github.com/repos/'+FREE_LORA_GITHUB_REPO+'/actions/workflows/'+EXPERIMENTAL_TRAINING_WORKFLOW;
  // Check active workflows before dispatch; prevent accidental duplicate runs.
  const active=await experimentalGitHub(request,env,'GET',api+'/runs?per_page=30');
  if(active.denied)return active.denied;
  // Distinguish the two isolated tracks using the workflow job name.
  // A different track must not block a legitimate launch, while an
  // uninspectable in-flight run fails closed to avoid duplicate dispatch.
  let existing=null;
  for(const run of (active.data?.workflow_runs||[])){
    if(!['queued','in_progress','waiting','requested','pending'].includes(run.status))continue;
    const jobs=await experimentalGitHub(request,env,'GET',
      'https://api.github.com/repos/'+FREE_LORA_GITHUB_REPO+'/actions/runs/'+encodeURIComponent(run.id)+'/jobs?per_page=30');
    if(jobs.denied){existing=run;break;}
    const names=(jobs.data?.jobs||[]).map(job=>String(job.name||''));
    if(names.includes('preflight-'+track)||names.length===0){existing=run;break;}
  }
  if(existing)return json({ok:true,dispatched:false,status:'TRAINING_PREFLIGHT_ALREADY_RUNNING_OR_UNVERIFIED',run_id:existing.id,run_url:existing.html_url});
  const dispatched=await experimentalGitHub(request,env,'POST',api+'/dispatches',{ref:'main',inputs:{track,mode:'preflight'}});
  if(dispatched.denied)return dispatched.denied;
  return json({ok:true,dispatched:true,status:'PREFLIGHT_DISPATCH_ACCEPTED',track,mode:'preflight',gpu_training_performed:false,workflow_url:'https://github.com/'+FREE_LORA_GITHUB_REPO+'/actions/workflows/'+EXPERIMENTAL_TRAINING_WORKFLOW});
}
async function experimentalTrainingStatus(request,env){
  const auth=requireAuth(request,env);if(!auth.ok)return auth.response;
  const url=new URL(request.url),track=experimentalTrack(url.searchParams.get('track'));
  if(!track)return json({ok:false,error:'INVALID_EXPERIMENTAL_TRACK'},400);
  const api='https://api.github.com/repos/'+FREE_LORA_GITHUB_REPO+'/actions/workflows/'+EXPERIMENTAL_TRAINING_WORKFLOW+'/runs?per_page=30';
  const result=await experimentalGitHub(request,env,'GET',api);if(result.denied)return result.denied;
  const runs=(result.data?.workflow_runs||[]).filter(row=>row?.event==='workflow_dispatch');
  // GitHub's run list omits workflow_dispatch inputs. Starting with this
  // workflow revision, the job name carries the server-created track label.
  // Older runs without that verifiable label remain unattributed.
  const inspected=await Promise.all(runs.slice(0,10).map(async row=>{
    const jobs=await experimentalGitHub(request,env,'GET',
      'https://api.github.com/repos/'+FREE_LORA_GITHUB_REPO+'/actions/runs/'+encodeURIComponent(row.id)+'/jobs?per_page=30');
    const names=jobs.denied?[]:(jobs.data?.jobs||[]).map(job=>String(job.name||''));
    const matched=names.filter(name=>name==='preflight-qwen3'||name==='preflight-abliteration');
    return {row,attributed:matched.length===1?matched[0].slice('preflight-'.length):null};
  }));
  const projected=item=>({
    id:item.row.id,status:item.row.status,conclusion:item.row.conclusion,
    created_at:item.row.created_at,updated_at:item.row.updated_at,html_url:item.row.html_url
  });
  return json({ok:true,track,mode:'preflight',
    runs:inspected.filter(item=>item.attributed===track).map(projected),
    unattributed_runs:inspected.filter(item=>!item.attributed).map(projected),
    run_track_not_proven:inspected.some(item=>!item.attributed),
    gpu_training_performed:false,
    note:'Une prévalidation GitHub ne constitue pas une preuve GPU ni un checkpoint.'
  });
}

async function freeLoraStatusResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const hfBase = `https://huggingface.co/${FREE_LORA_HF_REPO}/resolve/main/`;
  const fileChecks = await Promise.all(FREE_LORA_REQUIRED_FILES.map(async (name) => {
    try {
      const response = await fetch(hfBase + encodeURIComponent(name) + '?download=true', {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'user-agent': 'meliturgos-free-lora-status/1.0' },
      });
      return { name, available: response.ok, status: response.status };
    } catch {
      return { name, available: false, status: 0 };
    }
  }));
  const bundleReady = fileChecks.every((row) => row.available === true);

  async function fetchOptionalJson(name) {
    try {
      const response = await fetch(hfBase + encodeURIComponent(name) + '?download=true', {
        redirect: 'follow',
        headers: { 'user-agent': 'meliturgos-free-lora-status/1.0' },
      });
      if (!response.ok) return null;
      const value = await response.json();
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  const [trainingEvidence, datasetMetadata, adapterRegistry] = await Promise.all([
    fetchOptionalJson('training-evidence.json'),
    fetchOptionalJson('dataset-metadata.json'),
    fetchOptionalJson('hf-compatible-registry.json'),
  ]);

  const githubHeaders = {
    accept: 'application/vnd.github+json',
    'user-agent': 'meliturgos-free-lora-status/1.0',
    ...(env?.MEL_GITHUB_TOKEN ? { authorization: `Bearer ${String(env.MEL_GITHUB_TOKEN)}` } : {}),
  };

  async function latestWorkflowRun(workflowName) {
    try {
      const url = `https://api.github.com/repos/${FREE_LORA_GITHUB_REPO}/actions/workflows/${workflowName}/runs?per_page=10`;
      let response = await fetch(url, { headers: githubHeaders });
      // Public workflows remain readable without a token. An expired token
      // must not turn an existing run into a misleading NEVER_RUN status.
      if ((response.status === 401 || response.status === 403) && githubHeaders.authorization) {
        const { authorization, ...publicHeaders } = githubHeaders;
        response = await fetch(url, { headers: publicHeaders });
      }
      if (!response.ok) return {
        status: 'GITHUB_UNAVAILABLE',
        conclusion: null,
        http_status: response.status,
      };
      const data = await response.json();
      const row = Array.isArray(data?.workflow_runs) ? data.workflow_runs[0] : null;
      if (!row) return { status: 'NEVER_RUN', conclusion: null, observed_empty: true };
      return {
        id: row.id,
        status: row.status || null,
        conclusion: row.conclusion || null,
        head_sha: row.head_sha || null,
        run_number: row.run_number ?? null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        html_url: row.html_url || null,
      };
    } catch {
      return { status: 'UNKNOWN', conclusion: null, observation_error: 'GITHUB_FETCH_ERROR' };
    }
  }

  const [workflow, trainingWorkflow, deploymentWorkflow] = await Promise.all([
    latestWorkflowRun(FREE_LORA_WORKFLOW),
    latestWorkflowRun(FREE_LORA_TRAINING_WORKFLOW),
    latestWorkflowRun('deploy-cloudflare-release.yml'),
  ]);

  let checkpoint = null;
  let checkpointDiscovery = { status: 'UNAVAILABLE', http_status: null, auth_fallback_used: false };
  try {
    const url = `https://api.github.com/repos/${FREE_LORA_GITHUB_REPO}/releases?per_page=100`;
    let response = await fetch(url, { headers: githubHeaders });
    // Public GitHub releases do not require a token. An expired or
    // rate-limited MEL token must not conceal a published checkpoint.
    // Retry unauthenticated only for auth/rate-limit failures, never
    // bypass provenance checks on returned releases.
    if ((response.status === 401 || response.status === 403) && githubHeaders.authorization) {
      checkpointDiscovery.auth_fallback_used = true;
      const { authorization, ...publicHeaders } = githubHeaders;
      response = await fetch(url, { headers: publicHeaders });
    }
    checkpointDiscovery.http_status = response.status;
    if (response.ok) {
      const releases = await response.json();
      // A real checkpoint requires a published, source-matched release with
      // both nonempty immutable assets, not merely a plausible tag.
      const latest = selectLatestCheckpointRelease(releases);
      checkpointDiscovery.status = latest ? 'FOUND' : 'NO_VERIFIED_RELEASE';
      if (latest) {
        checkpoint = {
          tag: latest.tag,
          cycle: latest.cycle,
          source_sha: latest.target_commitish,
          local_gate_ready: latest.local_gate_ready,
          published_at: latest.published_at,
          html_url: `https://github.com/${FREE_LORA_GITHUB_REPO}/releases/tag/${encodeURIComponent(latest.tag)}`,
          artifact_available: true,
          publication_verified: true,
          evidence_source: 'GITHUB_RELEASE',
          validation_status: latest.local_gate_ready ? 'LOCAL_GATE_READY_FOR_CANONICAL_BENCHMARK' : 'TRAINED_UNBENCHMARKED',
        };
      }
    } else {
      checkpointDiscovery.status = 'GITHUB_HTTP_ERROR';
    }
  } catch {
    checkpointDiscovery.status = 'GITHUB_FETCH_ERROR';
  }

  let learning = null;
  try {
    const engine = createLearningEngine(env);
    const progress = await getLiveLearningProgress({ engine, db: env.DB });
    const runs = typeof engine.benchmarks === 'function' ? await engine.benchmarks({ limit: 200 }) : [];
    const newest = (kind) => (Array.isArray(runs) ? runs.slice().reverse().find((row) => row?.kind === kind) : null);
    const impactBase = newest('lora-impact-baseline');
    const impactCandidate = newest('lora-impact-candidate');
    learning = {
      lora_status: progress?.lora_status || null,
      benchmark_status: progress?.benchmark_status || null,
      corrections_available_for_training: progress?.evidence?.corrections_available_for_training ?? null,
      neural_weights_changed: progress?.evidence?.neural_weights_changed === true,
      impact: {
        baseline: impactBase?.metadata?.impact_metrics || null,
        candidate: impactCandidate?.metadata?.impact_metrics || null,
        delta: impactCandidate?.metadata?.impact_delta || null,
        uncensored_gate: impactCandidate?.metadata?.uncensored_gate === true,
        canonical_gate_passed: impactCandidate?.metadata?.canonical_gate_passed === true,
        impact_gate_passed: impactCandidate?.metadata?.uncensored_gate === true,
        next_stage: impactCandidate?.metadata?.next_stage || 'UNCENSORED_WAITING',
        adapter_id: impactCandidate?.adapter_id || null,
        source_sha: impactCandidate?.source_sha || null,
        artifact_digest: impactCandidate?.metadata?.artifact_digest || null,
        measured_at: impactCandidate?.created_at || null,
      },
    };
  } catch {}

  let dailyTrace=null;
  let verifiedTrainingTrace=null;
  let dailyStatus=null;
  try{
    const traces=await listLoraDailyTraces(env,{limit:30});
    dailyTrace=traces[0]||null;
    // A RUNNING trace must not hide a previous cycle with verified output.
    verifiedTrainingTrace=traces.find(row=>{
      if(row?.status!=='SUCCEEDED'||Number(row?.trace_verified)!==1
        || !/^[0-9a-f]{40}$/i.test(String(row?.source_sha||''))
        || !Number.isSafeInteger(Number(row?.cycle))) return false;
      const artifacts=Array.isArray(row.artifacts)?row.artifacts:[];
      const kinds=new Set(artifacts.filter(a=>/^[0-9a-f]{64}$/i.test(String(a?.sha256||''))).map(a=>a.kind));
      return Number(row.training?.steps??row.training?.global_step??0)>0
        && kinds.has('adapter')&&kinds.has('bundle')&&kinds.has('checkpoint');
    })||null;
    dailyStatus=await getLoraDailyStatus(env,new Date().toISOString().slice(0,10));
  }catch{}

  // D1 evidence is useful during a GitHub outage, but is not independent
  // confirmation that the corresponding public release remains accessible.
  if (!checkpoint && verifiedTrainingTrace) {
    const source=String(verifiedTrainingTrace.source_sha).toLowerCase();
    const cycle=Number(verifiedTrainingTrace.cycle);
    const expectedTag=`mel-lora-kaggle-${source.slice(0,12)}-c${String(cycle).padStart(3,'0')}`;
    const artifact=(verifiedTrainingTrace.artifacts||[]).find(row=>
      row?.kind==='checkpoint' && row?.name===expectedTag
      && /^[0-9a-f]{64}$/i.test(String(row?.sha256||'')));
    if (artifact) {
      checkpoint={
        tag:expectedTag,cycle,source_sha:source,published_at:null,
        html_url:`https://github.com/${FREE_LORA_GITHUB_REPO}/releases/tag/${encodeURIComponent(expectedTag)}`,
        artifact_available:null,publication_verified:false,
        evidence_source:'DURABLE_VERIFIED_TRACE',
        validation_status:'TRAINED_UNBENCHMARKED',
      };
      checkpointDiscovery.trace_fallback_used=true;
    }
  }

  return json({
    ok: true,
    mode: 'FREE_KAGGLE_CHECKPOINT_BENCHMARK',
    cost_policy: 'NO_PAID_GPU_TRIGGER',
    colab_url: 'https://colab.research.google.com/github/adrienlopezcarreras-pixel/meliturgos-cloudflare/blob/candidate/mel-clean-autonomy/notebooks/MEL-QLORA-UNCENSORED-MAX-COLAB.ipynb',
    agentic_colab_url: 'https://colab.research.google.com/github/adrienlopezcarreras-pixel/meliturgos-cloudflare/blob/candidate/mel-clean-autonomy/notebooks/MEL-QLORA-AGENTIC-MAX-COLAB.ipynb',
    hf_repo: FREE_LORA_HF_REPO,
    agentic_hf_repo: 'Meliturgos/mel-lora-agentic',
    hf_url: `https://huggingface.co/${FREE_LORA_HF_REPO}`,
    bundle: {
      ready: bundleReady,
      files: fileChecks,
      training: trainingEvidence ? {
        stage: trainingEvidence.stage || null,
        examples: trainingEvidence?.dataset?.examples ?? null,
        source_examples: trainingEvidence?.dataset?.source_examples ?? null,
        train_loss: trainingEvidence?.training_metrics?.train_loss ?? null,
        global_step: trainingEvidence?.training_metrics?.global_step ?? null,
        artifact_digest: trainingEvidence?.artifacts?.adapter_model?.digest || null,
      } : null,
      dataset: datasetMetadata ? {
        examples: datasetMetadata.examples ?? null,
        quarantined_examples: datasetMetadata.quarantined_examples ?? null,
        output_sha256: datasetMetadata.output_sha256 || null,
        source_sha256: datasetMetadata.source_sha256 || null,
      } : null,
      adapter_registry: adapterRegistry ? {
        compatible_count: adapterRegistry.compatible_count ?? 0,
        rejected_count: adapterRegistry.rejected_count ?? 0,
        base_model: adapterRegistry.base_model || null,
      } : null,
    },
    workflow: workflow || { status: 'UNKNOWN', conclusion: null },
    workflow_url: `https://github.com/${FREE_LORA_GITHUB_REPO}/actions/workflows/${FREE_LORA_WORKFLOW}`,
    training_workflow: trainingWorkflow || { status: 'UNKNOWN', conclusion: null },
    training_workflow_url: `https://github.com/${FREE_LORA_GITHUB_REPO}/actions/workflows/${FREE_LORA_TRAINING_WORKFLOW}`,
    deployment_workflow: deploymentWorkflow || { status: 'UNKNOWN', conclusion: null },
    kaggle_url: 'https://www.kaggle.com/code/adrienlopezcarreras/mel-lora-uncensored-notebook-t4',
    checkpoint,
    checkpoint_discovery: checkpointDiscovery,
    learning,
    daily_trace: dailyTrace,
    verified_training_trace: verifiedTrainingTrace ? {
      run_id:verifiedTrainingTrace.run_id,
      workflow_run_id:verifiedTrainingTrace.workflow_run_id,
      cycle:verifiedTrainingTrace.cycle,
      source_sha:verifiedTrainingTrace.source_sha,
      status:'SUCCEEDED',trace_verified:true,
      dataset:{examples:verifiedTrainingTrace.dataset?.examples??null},
      training:{steps:verifiedTrainingTrace.training?.steps??verifiedTrainingTrace.training?.global_step??null},
      adapter_digest:(verifiedTrainingTrace.artifacts||[]).find(row=>row?.kind==='adapter')?.sha256||null,
      results:{
        train_loss:verifiedTrainingTrace.results?.train_loss??null,
        progression:verifiedTrainingTrace.results?.progression||null,
        metrics:verifiedTrainingTrace.results?.metrics||null,
      },
    } : null,
    daily_status: dailyStatus,
  });
}

async function loraTraceListResponse(request, env) {
  const auth=requireAuth(request,env);
  if(!auth.ok)return auth.response;
  const url=new URL(request.url);
  const limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit'))||30));
  const day=String(url.searchParams.get('day')||'').trim()||null;
  try{
    const traces=await listLoraDailyTraces(env,{limit,day});
    return json({ok:true,traces,count:traces.length,day});
  }catch(error){
    return json({ok:false,error:'LORA_TRACE_READ_FAILED',detail:String(error?.message||'unknown').slice(0,180)},503);
  }
}

async function loraTraceDetailResponse(request, env, runId) {
  const auth=requireAuth(request,env);
  if(!auth.ok)return auth.response;
  try{
    const trace=await getLoraDailyTrace(env,decodeURIComponent(runId));
    if(!trace)return json({ok:false,error:'LORA_TRACE_NOT_FOUND'},404);
    return json({ok:true,trace});
  }catch(error){
    return json({ok:false,error:'LORA_TRACE_READ_FAILED',detail:String(error?.message||'unknown').slice(0,180)},503);
  }
}

async function loraDailyStatusResponse(request, env) {
  const auth=requireAuth(request,env);
  if(!auth.ok)return auth.response;
  const url=new URL(request.url);
  const day=String(url.searchParams.get('day')||new Date().toISOString().slice(0,10)).trim();
  try{
    const status=await getLoraDailyStatus(env,day);
    return json({ok:true,day,status:status||{day,run_count:0,report_fr:'Aucune trace enregistrée pour ce jour.'}});
  }catch(error){
    return json({ok:false,error:'LORA_DAILY_STATUS_READ_FAILED',detail:String(error?.message||'unknown').slice(0,180)},503);
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

async function operatorLoraBenchmarkResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    const body = await safeJsonBody(request);
    const result = await runOperatorLoraBenchmark(env, {
      plan: body.plan,
      artifact: body.artifact,
      approval: body.approval,
      activate: body.activate === true,
      benchmark_concurrency: body.benchmark_concurrency,
      benchmark_serial: body.benchmark_serial === true,
    });
    return json({ ok: true, ...result });
  } catch (error) {
    const code = String(error?.code || '');
    return json({
      ok: false,
      error: code || 'LORA_BENCHMARK_FAILED',
      detail: String(error?.message || 'unknown').slice(0, 220),
    }, code === 'AI_BINDING_UNAVAILABLE' ? 503 : 409);
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
 * Compatibility helper for retired normal-mode presentation layers.
 * The canonical normal page owns its visuals; this helper removes only known
 * historical style/runtime ids when explicitly invoked by legacy tests or
 * callers and does not own current page rendering.
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const architectureInternal=await maybeHandleArchitectureAuditInternal(request,env);
    if(architectureInternal)return architectureInternal;
    const loraTraceInternal=await maybeHandleLoraTraceInternal(request,env);
    if(loraTraceInternal)return loraTraceInternal;
    if (url.pathname.startsWith('/api/dev-bridge/') && !isOidcBridgeCall(request)) {
      const denied = authorizeDevBridge(request, env);
      if (denied) return denied;
    }
    if (request.method === 'GET' && url.pathname === '/api/learning/progress') {
      return liveLearningProgressResponse(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/api/learning/lora/free-status') {
      return freeLoraStatusResponse(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/api/learning/lora/traces') {
      return loraTraceListResponse(request, env);
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/learning/lora/traces/')) {
      return loraTraceDetailResponse(request, env, url.pathname.slice('/api/learning/lora/traces/'.length));
    }
    if (request.method === 'GET' && url.pathname === '/api/learning/lora/daily-status') {
      return loraDailyStatusResponse(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/learning/benchmark/run') {
      return operatorBenchmarkResponse(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/learning/lora/experimental/train') {
      return experimentalTrainingResponse(request,env);
    }
    if (request.method === 'GET' && url.pathname === '/api/learning/lora/experimental/status') {
      return experimentalTrainingStatus(request,env);
    }
    if (request.method === 'POST' && url.pathname === '/api/learning/lora/train') {
      const auth = requireAuth(request, env);
      if (!auth.ok) return auth.response;
      try {
        const result = await runLoraTrainingHeartbeat(env, { force: true, manualSingleCycle: true });
        const ok = ['TRAINING_CHAIN_DISPATCHED','TRAINING_CHAIN_ACTIVE','TRAINING_LAUNCH_PENDING'].includes(result.status);
        // Preserve the precise refusal reason for the Professor UI instead of an opaque HTTP 503.
        // A refusal still fails closed; a no-op cannot masquerade as a new GPU dispatch.
        return json({ ok, ...result, ...(ok ? {} : { code: String(result.error || result.status || 'LORA_TRAINING_LAUNCH_UNAVAILABLE') }) }, ok ? 200 : 503);
      } catch { return json({ ok: false, error: 'LORA_TRAINING_LAUNCH_UNAVAILABLE' }, 503); }
    }
    if (request.method === 'POST' && url.pathname === '/api/learning/lora/prepare') {
      return operatorLoraPrepareResponse(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/learning/lora/benchmark') {
      return operatorLoraBenchmarkResponse(request, env);
    }
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    const cron = String(controller?.cron || '');
    const scheduledAt = Number(controller?.scheduledTime);
    const timestamp = Number.isFinite(scheduledAt) ? scheduledAt : Date.now();
    const now = () => new Date(timestamp).toISOString();

    // Keep the full system backup on its own >=1h Cron Trigger so it does not
    // compete for CPU with autonomy/watch/benchmark maintenance. The backup
    // runtime remains idempotent and creates at most one fresh snapshot per
    // configured interval.
    if (cron === '43 2 * * *') {
      const backup = runScheduledSystemBackup(env, { now }).catch((error) => {
        console.error('[MEL backup] dedicated daily snapshot failed:', error?.code || error?.message || error);
        return null;
      });
      if (ctx?.waitUntil) ctx.waitUntil(backup);
      else await backup;
      // No early return: the same trigger carries the daily/weekly/monthly
      // self-audit and the nightly WORK and model jobs below. Returning here
      // meant DAILY, WEEKLY and MONTHLY never ran once (last_runs = 0, 2026-10-24).
    }

    await app.scheduled(controller, env, ctx);
    if (cron !== '17 * * * *') return;

    const maintenance = Promise.allSettled([
      ensureZeroCostBenchmarkBaseline(env).catch((error) => {
        console.error('[MEL benchmark] hourly baseline bootstrap skipped:', error?.code || error?.message || error);
        return null;
      }),
      markMissingLoraTrainingDay(env,{now:timestamp}).catch((error)=>{
        console.error('[MEL LoRA trace] daily absence check failed:',error?.code||error?.message||error);
        return null;
      }),
      reconcileOrphanedLoraTrainingTraces(env,{now:timestamp}).then((result)=>{
        if(result?.reconciled>0) console.error('[MEL LoRA trace] orphaned runs reconciled:',result.reconciled);
        if(result?.ok===false&&result?.status!=='GITHUB_TOKEN_MISSING') console.error('[MEL LoRA trace] reconciliation degraded:',result.status);
        return result;
      }).catch((error)=>{
        console.error('[MEL LoRA trace] orphan reconciliation failed:',error?.code||error?.message||error);
        return null;
      }),
    ]);
    if (ctx?.waitUntil) ctx.waitUntil(maintenance);
    else await maintenance;
  },
};