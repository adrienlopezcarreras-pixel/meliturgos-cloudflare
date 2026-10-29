import { acquireD1WorkRunLease, releaseD1WorkRunLease } from '../work/d1-work-run-lease.js';
import { enqueueSupervisedDevelopmentRequest } from '../evolution/owner-development-queue.js';
import { discoverLoraDatasets } from './lora-dataset-discovery.js';
import { observeLoraObjectives } from './lora-objective-observer.js';
import { createLearningEngine } from './learning-engine.js';

const DEFAULT_REPOSITORY = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
// LoRA must train from the canonical reviewed code, not the mutable autonomy candidate.
const DEFAULT_BRANCH = 'main';
const DEFAULT_WORKFLOW = 'lora-kaggle-free-gpu.yml';
const ACTIVE_RUN_STATES = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);

// Independent opt-in dataset experiment. Resolve a SHA from Hugging Face for
// each new chain; the workflow carries that immutable revision to later cycles.
export async function resolveDolphinExperiment(env = {}, fetchImpl = fetch) {
  if (String(env.MEL_LORA_DOLPHIN_EXPERIMENT ?? 'true').toLowerCase() === 'false') {
    return { sources: [], status: 'DISABLED' };
  }
  try {
    const response = await fetchImpl('https://huggingface.co/api/datasets/QuixiAI/dolphin', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return { sources: [], status: 'HF_UNAVAILABLE' };
    const info = await response.json();
    const revision = String(info?.sha || '').toLowerCase();
    const tags = Array.isArray(info?.tags) ? info.tags : [];
    if (info?.id !== 'QuixiAI/dolphin' || !/^[a-f0-9]{40}$/.test(revision)
      || info?.private === true || Boolean(info?.gated) || !tags.includes('license:apache-2.0')) {
      return { sources: [], status: 'SOURCE_NOT_ELIGIBLE' };
    }
    return { sources: [{ id: 'QuixiAI/dolphin', revision }], status: 'PINNED' };
  } catch {
    return { sources: [], status: 'HF_UNAVAILABLE' };
  }
}


function ghHeaders(token) {
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'meliturgos-lora-heartbeat',
    authorization: `Bearer ${token}`,
  };
}

function safeInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function isoNow(now) {
  const value = typeof now === 'function' ? now() : Date.now();
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function epochNow(now) {
  const value = typeof now === 'function' ? now() : Date.now();
  return value instanceof Date ? value.getTime() : Number(value);
}

async function recentJobs(env) {
  if (!env?.DB) return [];
  const since = Date.now() - 7 * 86_400_000;
  const rows = (await env.DB.prepare(`SELECT status, json_extract(result_json,'$.bridge_preparation_diagnostic') AS diag
    FROM dev_jobs WHERE created_at > ? AND requested_by='mel-autonomy' LIMIT 300`).bind(since).all()).results || [];
  return rows.map(row => { let diag = null; try { diag = JSON.parse(row.diag || 'null'); } catch {} return { status: row.status, result_json: { bridge_preparation_diagnostic: diag } }; });
}

async function latestImpactStage(env, options = {}) {
  try {
    const engine = options.engine || createLearningEngine(env);
    const rows = await engine.benchmarks({ limit: 120 });
    const latest = rows.slice().reverse().find((row) => row?.kind === 'lora-impact-candidate') || null;
    return {
      rows,
      next_stage: String(latest?.metadata?.next_stage || 'UNCENSORED_WAITING'),
      uncensored_gate: latest?.metadata?.uncensored_gate === true,
      canonical_gate_passed: latest?.metadata?.canonical_gate_passed === true,
      measured_at: latest?.created_at || null,
      adapter_id: latest?.adapter_id || null,
    };
  } catch (error) {
    return {
      next_stage: 'UNCENSORED_WAITING',
      uncensored_gate: false,
      canonical_gate_passed: false,
      measured_at: null,
      adapter_id: null,
      error: String(error?.code || error?.message || 'LORA_IMPACT_STATUS_UNAVAILABLE').slice(0, 180),
    };
  }
}

async function githubJson(fetchImpl, url, token) {
  const response = await fetchImpl(url, { headers: ghHeaders(token) });
  if (!response.ok) {
    const error = new Error(`LORA_HEARTBEAT_GITHUB_READ_${response.status}`);
    error.code = 'LORA_HEARTBEAT_GITHUB_READ_FAILED';
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function candidateHead({ fetchImpl, repository, branch, token }) {
  const refPath = branch.split('/').map(encodeURIComponent).join('/');
  const body = await githubJson(
    fetchImpl,
    `https://api.github.com/repos/${repository}/git/ref/heads/${refPath}`,
    token,
  );
  const sha = String(body?.object?.sha || '').trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw Object.assign(new Error('LORA_HEARTBEAT_HEAD_INVALID'), { code: 'LORA_HEARTBEAT_HEAD_INVALID' });
  }
  return sha;
}

async function workflowRuns({ fetchImpl, repository, branch, workflow, token }) {
  const url = new URL(`https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/runs`);
  url.searchParams.set('branch', branch);
  url.searchParams.set('per_page', '20');
  const body = await githubJson(fetchImpl, url.toString(), token);
  return Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
}

// GitHub's release list is not a checkpoint-order guarantee: drafts can appear
// ahead of published training cycles, and c013 from an older lineage may appear
// after c003 from a newer one. Choose evidence, not array position.
// GPT6 / MEL-LORA-HEARTBEAT-PUBLISHED-20261022.
const CHECKPOINT_TAG_RE = /^mel-lora-kaggle-([0-9a-f]{12})-c(\d+)$/i;
const CHECKPOINT_ASSETS = ['kaggle-run.json', 'mel-lora-bundle.tar.gz'];

export function selectLatestCheckpointRelease(releases) {
  if (!Array.isArray(releases)) return null;
  const valid = [];
  for (const release of releases) {
    const tag = String(release?.tag_name || '').trim();
    const match = CHECKPOINT_TAG_RE.exec(tag);
    const target = String(release?.target_commitish || '').trim().toLowerCase();
    const published = String(release?.published_at || '').trim();
    const publishedMs = Date.parse(published);
    if (!match || release?.draft === true || !published
      || !Number.isFinite(publishedMs)
      || !/^[0-9a-f]{40}$/.test(target) || !target.startsWith(match[1].toLowerCase())) continue;
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    if (!CHECKPOINT_ASSETS.every(name => assets.some(asset =>
      asset?.name === name && Number(asset?.size) > 0))) continue;
    const cycle = Number(match[2]);
    if (!Number.isSafeInteger(cycle) || cycle < 0) continue;
    const body = String(release?.body || '');
    valid.push({
      tag,
      cycle,
      target_commitish: target,
      local_gate_ready: body.includes('LOCAL_GATE_READY_FOR_CANONICAL_BENCHMARK'),
      body: body.slice(0, 1000),
      published_at: published,
      published_ms: publishedMs,
    });
  }
  valid.sort((a, b) => b.published_ms - a.published_ms || b.cycle - a.cycle || a.tag.localeCompare(b.tag));
  if (!valid.length) return null;
  const { published_ms, ...checkpoint } = valid[0];
  return checkpoint;
}

async function latestCheckpointRelease({ fetchImpl, repository, token }) {
  const url = new URL(`https://api.github.com/repos/${repository}/releases`);
  url.searchParams.set('per_page', '100');
  const releases = await githubJson(fetchImpl, url.toString(), token);
  const checkpoint = selectLatestCheckpointRelease(releases);
  // Existing but unverified releases must not silently look like cycle zero:
  // that would discard the intended parent and restart the LoRA chain.
  if (!checkpoint && Array.isArray(releases) && releases.some(row =>
    CHECKPOINT_TAG_RE.test(String(row?.tag_name || '').trim()))) {
    throw Object.assign(new Error('LORA_CHECKPOINT_CHAIN_UNVERIFIED'), {
      code: 'LORA_CHECKPOINT_CHAIN_UNVERIFIED',
    });
  }
  return checkpoint;
}

async function dispatchWorkflow({ fetchImpl, repository, branch, workflow, token, inputs }) {
  const response = await fetchImpl(
    `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: 'POST',
      headers: {
        ...ghHeaders(token),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ref: branch, inputs }),
    },
  );
  if (response.status !== 204) {
    const error = new Error(`LORA_HEARTBEAT_DISPATCH_${response.status}`);
    error.code = 'LORA_HEARTBEAT_DISPATCH_FAILED';
    error.status = response.status;
    throw error;
  }
}

async function runLoraTrainingHeartbeatUnlocked(env = {}, options = {}) {
  // The scheduled training toggle must not disable the authenticated owner's
  // explicit one-cycle button. The manual path still enforces GitHub auth,
  // D1 single-flight deduplication, free GPU, and all benchmark/activation gates.
  if (options.manualSingleCycle !== true && String(env?.MEL_LORA_CONTINUOUS_TRAINING ?? 'true').toLowerCase() === 'false') {
    return { status: 'DISABLED', dispatched: false };
  }
  if (String(env?.MEL_RUNTIME_ENV || '').toLowerCase() === 'preview') {
    return { status: 'SKIPPED_PREVIEW', dispatched: false };
  }

  const token = String(env?.MEL_GITHUB_TOKEN || '').trim();
  if (!token) {
    return { status: 'SKIPPED_NO_GITHUB_TOKEN', dispatched: false };
  }

  const nowMs = epochNow(options.now);
  const intervalMinutes = safeInt(env?.MEL_LORA_HEARTBEAT_INTERVAL_MINUTES, 15, 1, 60);
  const intervalMs = intervalMinutes * 60_000;
  if (options.force !== true && Math.floor(nowMs / 60_000) % intervalMinutes !== 0) {
    return {
      status: 'SKIPPED_CADENCE',
      dispatched: false,
      interval_minutes: intervalMinutes,
    };
  }

  const impact = await latestImpactStage(env, options);
  // AGENTIC_READY used to end learning for good. It now only changes the
  // objective: the observer decides from repeated measured gaps whether a new
  // cycle is needed (uncensored regression, agentic gap) or whether the gap is
  // a code problem that a LoRA cannot fix.
  const objective = options.manualSingleCycle === true ? { decision: 'TRAIN_UNCENSORED', reason: 'OWNER_SINGLE_CYCLE_REQUEST' } : impact.next_stage === 'AGENTIC_READY'
    ? observeLoraObjectives({ impactRows: impact.rows || [], jobs: options.jobs || await recentJobs(env).catch(() => []) })
    : { decision: 'TRAIN_UNCENSORED', reason: 'UNCENSORED_GATE_NOT_REACHED' };
  delete impact.rows;
  if (objective.decision === 'OBSERVE') {
    return { status: 'AGENTIC_OBSERVING', dispatched: false, impact, objective };
  }
  if (objective.decision === 'CODE_FIX') {
    // The gap is the pipeline, not the model: hand it to MAX as a code mission
    // (one per distinct finding set) instead of training on it.
    const findings = (objective.findings || []).map(f => `${f.code}: ${f.detail}`);
    const mission = await (options.enqueueDevelopment || enqueueSupervisedDevelopmentRequest)({
      env,
      goal: ['[MEL-LORA-CODE-FIX] Le manque mesuré vient du pipeline, pas du modèle : le corriger dans le code.', ...findings,
        'Inspecter les rejets dominants, corriger sur la branche candidate, tester, sans entraînement LoRA.'].join(' '),
      requestKey: 'lora-code-fix:' + findings.join('|').slice(0, 200),
      requestedBy: 'mel-autonomy',
      source: 'lora-objective-observer',
      priority: 'P1',
      capabilities: [],
    }).then(result => ({ queued: true, id: result?.job?.id || result?.id || null }))
      .catch(error => ({ queued: false, error: String(error?.code || error?.message || error).slice(0, 120) }));
    return { status: 'CODE_FIX_REQUIRED', dispatched: false, impact, objective, mission };
  }
  // The gap names the skill; MEL looks up public training sets and benchmarks for it herself.
  if (objective.decision === 'TRAIN_AGENTIC' || objective.reason === 'OVER_REFUSAL_REGRESSED') {
    objective.datasets = await discoverLoraDatasets(objective.reason, { fetchImpl: options.fetchImpl || fetch }).catch(error => ({ status: 'DISCOVERY_FAILED', code: String(error?.code || error?.message || '').slice(0, 80) }));
  }
  // The Kaggle chain trains the agentic lane on the pinned public sets MEL found.
  // Without an enabled lane or a pinned train set, never relaunch the uncensored
  // chain to answer an agentic gap.
  const agenticSources = (objective.datasets?.train || []).filter(row => row?.id && /^[0-9a-f]{40}$/.test(String(row.revision || ''))).slice(0, 3).map(row => ({ id: row.id, revision: row.revision }));
  if (objective.decision === 'TRAIN_AGENTIC' && String(env?.MEL_LORA_AGENTIC_TRAINING || 'true') !== 'true') {
    return { status: 'AGENTIC_TRAINING_REQUIRED', dispatched: false, impact, objective, reason: 'AGENTIC_LANE_NOT_ENABLED' };
  }
  if (objective.decision === 'TRAIN_AGENTIC' && !agenticSources.length) {
    return { status: 'AGENTIC_TRAINING_REQUIRED', dispatched: false, impact, objective, reason: 'NO_PINNED_AGENTIC_DATASET' };
  }

  const fetchImpl = options.fetchImpl || fetch;
  const repository = String(env?.MEL_GITHUB_REPOSITORY || DEFAULT_REPOSITORY).trim();
  const branch = String(env?.MEL_LORA_GITHUB_BRANCH || DEFAULT_BRANCH).trim();
  const workflow = String(env?.MEL_LORA_KAGGLE_WORKFLOW || DEFAULT_WORKFLOW).trim();

  try {
    const runs = await workflowRuns({ fetchImpl, repository, branch, workflow, token });
    const active = runs.find((run) => ACTIVE_RUN_STATES.has(String(run?.status || '').toLowerCase())) || null;
    if (active) {
      return {
        status: 'TRAINING_CHAIN_ACTIVE',
        dispatched: false,
        workflow_run_id: active.id || null,
        workflow_status: active.status || null,
        impact,
      };
    }

    const latest = runs[0] || null;
    const retryMinutes = safeInt(env?.MEL_LORA_HEARTBEAT_RETRY_MINUTES, 60, 15, 360);
    const latestAt = Date.parse(latest?.updated_at || latest?.created_at || '') || 0;
    const latestFailed = latest && ['failure', 'cancelled', 'timed_out', 'action_required'].includes(String(latest?.conclusion || '').toLowerCase());
    if (latestFailed && latestAt > 0 && nowMs - latestAt < retryMinutes * 60_000 && options.force !== true) {
      return {
        status: 'RETRY_BACKOFF',
        dispatched: false,
        workflow_run_id: latest.id || null,
        conclusion: latest.conclusion || null,
        retry_after_minutes: retryMinutes,
        impact,
      };
    }

    const checkpoint = await latestCheckpointRelease({ fetchImpl, repository, token });
    if (checkpoint?.local_gate_ready === true && options.manualSingleCycle !== true) {
      return {
        status: 'LOCAL_GATE_READY_FOR_CANONICAL_BENCHMARK',
        dispatched: false,
        checkpoint,
        impact,
        reason: 'PRESERVE_UNCENSORED_CHECKPOINT',
      };
    }

    // A new dataset loader requires code from reviewed main, not an older
    // checkpoint SHA; the parent adapter is still verified by its own digest.
    const dolphinExperiment = objective.decision === 'TRAIN_AGENTIC'
      ? { sources: [], status: 'NOT_APPLICABLE' }
      : await (options.resolveDolphinSource || resolveDolphinExperiment)(env, fetchImpl);
    const sha = options.manualSingleCycle === true && checkpoint?.target_commitish && !dolphinExperiment.sources?.length
      ? checkpoint.target_commitish : await candidateHead({ fetchImpl, repository, branch, token });
    const shardSize = String(safeInt(env?.MEL_LORA_KAGGLE_SHARD_SIZE, 750, 50, 3000));
    const maxCyclesNumber = options.manualSingleCycle === true ? (checkpoint ? checkpoint.cycle + 2 : 1) : safeInt(env?.MEL_LORA_KAGGLE_MAX_CYCLES, 100, 1, 100);
    const maxCycles = String(maxCyclesNumber);
    const nextCycle = checkpoint ? checkpoint.cycle + 1 : 0;
    const parentReleaseTag = checkpoint?.tag || '';

    if (nextCycle >= maxCyclesNumber) {
      return {
        status: 'CYCLE_LIMIT_REACHED',
        dispatched: false,
        cycle: nextCycle,
        max_cycles: maxCyclesNumber,
        checkpoint,
        impact,
      };
    }

    await dispatchWorkflow({
      fetchImpl,
      repository,
      branch,
      workflow,
      token,
      inputs: {
        source_sha: sha,
        cycle: String(nextCycle),
        parent_release_tag: parentReleaseTag,
        shard_size: shardSize,
        max_cycles: maxCycles,
        benchmark_preview: 'false',
        ...(objective.decision === 'TRAIN_AGENTIC' ? { objective: 'agentic', agentic_sources: JSON.stringify(agenticSources) } : {}),
        ...(dolphinExperiment.sources?.length ? { uncensored_sources: JSON.stringify(dolphinExperiment.sources) } : {}),
      },
    });

    return {
      status: 'TRAINING_CHAIN_DISPATCHED',
      dispatched: true,
      repository,
      branch,
      workflow,
      source_sha: sha,
      cycle: nextCycle,
      parent_release_tag: parentReleaseTag,
      resumed_from_checkpoint: Boolean(checkpoint),
      shard_size: Number(shardSize),
      max_cycles: maxCyclesNumber,
      interval_minutes: intervalMinutes,
      dispatched_at: isoNow(options.now),
      checkpoint,
      impact,
      zero_cost_only: true,
      experimental_source: { status: dolphinExperiment.status, dataset: dolphinExperiment.sources?.[0]?.id || null,
        revision: dolphinExperiment.sources?.[0]?.revision || null },
    };
  } catch (error) {
    return {
      status: 'HEARTBEAT_ERROR',
      dispatched: false,
      error: String(error?.code || error?.message || 'LORA_HEARTBEAT_FAILED').slice(0, 180),
      http_status: Number(error?.status) || null,
      impact,
    };
  }
}

export const LORA_TRAINING_HEARTBEAT_DEFAULTS = Object.freeze({
  workflow: DEFAULT_WORKFLOW,
  source_branch: DEFAULT_BRANCH,
  interval_minutes: 15,
  retry_minutes: 60,
  shard_size: 750,
  max_cycles: 100,
  zero_cost_only: true,
});

// Manual and scheduled launches share the same atomic short lease. Retain it
// after dispatch until the new GitHub run becomes visible in the run listing.
export async function runLoraTrainingHeartbeat(env = {}, options = {}) {
  if (!env.DB?.prepare || !env.MEL_GITHUB_TOKEN) return runLoraTrainingHeartbeatUnlocked(env, options);
  const lease = await acquireD1WorkRunLease(env.DB, 'lora-training-launch', { ttlMs: 60_000 });
  if (!lease) return { status: 'TRAINING_LAUNCH_PENDING', dispatched: false };
  let result;
  try { result = await runLoraTrainingHeartbeatUnlocked(env, options);return result; }
  finally { if (!result?.dispatched) await releaseD1WorkRunLease(env.DB, lease); }
}
