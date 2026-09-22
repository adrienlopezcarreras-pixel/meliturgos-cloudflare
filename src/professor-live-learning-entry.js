import app from './ui-entry.js';
import { requireAuth } from './core/security.js';
import { authorizeDevBridge } from './core/dev-bridge-auth.js';
import { createLearningEngine } from './learning/learning-engine.js';
import { getLiveLearningProgress } from './learning/live-progress.js';
import { ensureZeroCostBenchmarkBaseline, prepareOperatorLora, runOperatorBenchmark, runOperatorLoraBenchmark } from './learning/operator-actions.js';
import { runScheduledSystemBackup } from './backup/system-backup-runtime.js';

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
      const response = await fetch(
        `https://api.github.com/repos/${FREE_LORA_GITHUB_REPO}/actions/workflows/${workflowName}/runs?branch=candidate%2Fmel-clean-autonomy&per_page=1`,
        { headers: githubHeaders },
      );
      if (!response.ok) return null;
      const data = await response.json();
      const row = Array.isArray(data?.workflow_runs) ? data.workflow_runs[0] : null;
      if (!row) return null;
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
      return null;
    }
  }

  const [workflow, trainingWorkflow] = await Promise.all([
    latestWorkflowRun(FREE_LORA_WORKFLOW),
    latestWorkflowRun(FREE_LORA_TRAINING_WORKFLOW),
  ]);

  let checkpoint = null;
  try {
    const response = await fetch(
      `https://api.github.com/repos/${FREE_LORA_GITHUB_REPO}/releases?per_page=30`,
      { headers: githubHeaders },
    );
    if (response.ok) {
      const releases = await response.json();
      const row = Array.isArray(releases)
        ? releases.find((release) => /^mel-lora-kaggle-[0-9a-f]{12}-c\\d+$/i.test(String(release?.tag_name || '')))
        : null;
      if (row) {
        const match = /-c(\\d+)$/i.exec(String(row.tag_name || ''));
        const body = String(row.body || '');
        checkpoint = {
          tag: row.tag_name,
          cycle: match ? Number(match[1]) : null,
          source_sha: /^[0-9a-f]{40}$/i.test(String(row.target_commitish || '')) ? row.target_commitish : null,
          local_gate_ready: body.includes('LOCAL_GATE_READY_FOR_CANONICAL_BENCHMARK'),
          published_at: row.published_at || row.created_at || null,
          html_url: row.html_url || null,
        };
      }
    }
  } catch {}

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
        next_stage: impactCandidate?.metadata?.next_stage || 'UNCENSORED_WAITING',
        adapter_id: impactCandidate?.adapter_id || null,
        measured_at: impactCandidate?.created_at || null,
      },
    };
  } catch {}

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
    workflow: workflow || { status: 'NEVER_RUN', conclusion: null },
    workflow_url: `https://github.com/${FREE_LORA_GITHUB_REPO}/actions/workflows/${FREE_LORA_WORKFLOW}`,
    training_workflow: trainingWorkflow || { status: 'NEVER_RUN', conclusion: null },
    training_workflow_url: `https://github.com/${FREE_LORA_GITHUB_REPO}/actions/workflows/${FREE_LORA_TRAINING_WORKFLOW}`,
    kaggle_url: 'https://www.kaggle.com/code/adrienlopezcarreras/mel-lora-uncensored-notebook-t4',
    checkpoint,
    learning,
  });
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
    if (url.pathname.startsWith('/api/dev-bridge/')) {
      const denied = authorizeDevBridge(request, env);
      if (denied) return denied;
    }
    if (request.method === 'GET' && url.pathname === '/api/learning/progress') {
      return liveLearningProgressResponse(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/api/learning/lora/free-status') {
      return freeLoraStatusResponse(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/learning/benchmark/run') {
      return operatorBenchmarkResponse(request, env);
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
    await app.scheduled(controller, env, ctx);
    if (String(controller?.cron || '') !== '17 * * * *') return;

    const scheduledAt = Number(controller?.scheduledTime);
    const timestamp = Number.isFinite(scheduledAt) ? scheduledAt : Date.now();
    const now = () => new Date(timestamp).toISOString();
    const maintenance = Promise.allSettled([
      ensureZeroCostBenchmarkBaseline(env).catch((error) => {
        console.error('[MEL benchmark] hourly baseline bootstrap skipped:', error?.code || error?.message || error);
        return null;
      }),
      runScheduledSystemBackup(env, { now }).catch((error) => {
        console.error('[MEL backup] hourly maintenance snapshot skipped:', error?.code || error?.message || error);
        return null;
      }),
    ]);
    if (ctx?.waitUntil) ctx.waitUntil(maintenance);
    else await maintenance;
  },
};