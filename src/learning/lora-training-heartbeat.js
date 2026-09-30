import { createLearningEngine } from './learning-engine.js';

const DEFAULT_REPOSITORY = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
const DEFAULT_BRANCH = 'candidate/mel-clean-autonomy';
const DEFAULT_WORKFLOW = 'lora-kaggle-free-gpu.yml';
const ACTIVE_RUN_STATES = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);

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

async function latestImpactStage(env, options = {}) {
  try {
    const engine = options.engine || createLearningEngine(env);
    const rows = await engine.benchmarks({ limit: 120 });
    const latest = rows.slice().reverse().find((row) => row?.kind === 'lora-impact-candidate') || null;
    return {
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

const CHECKPOINT_TAG_RE = /^mel-lora-kaggle-[0-9a-f]{12}-c(\d+)$/i;

async function latestCheckpointRelease({ fetchImpl, repository, token }) {
  const url = new URL(`https://api.github.com/repos/${repository}/releases`);
  url.searchParams.set('per_page', '100');
  const releases = await githubJson(fetchImpl, url.toString(), token);
  if (!Array.isArray(releases)) return null;
  for (const release of releases) {
    const tag = String(release?.tag_name || '').trim();
    const match = CHECKPOINT_TAG_RE.exec(tag);
    if (!match) continue;
    const body = String(release?.body || '');
    return {
      tag,
      cycle: Number(match[1]),
      target_commitish: String(release?.target_commitish || '').trim(),
      local_gate_ready: body.includes('LOCAL_GATE_READY_FOR_CANONICAL_BENCHMARK'),
      body: body.slice(0, 1000),
      published_at: release?.published_at || release?.created_at || null,
    };
  }
  return null;
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

export async function runLoraTrainingHeartbeat(env = {}, options = {}) {
  if (String(env?.MEL_LORA_CONTINUOUS_TRAINING ?? 'true').toLowerCase() === 'false') {
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
  if (impact.next_stage === 'AGENTIC_READY') {
    return {
      status: 'AGENTIC_READY',
      dispatched: false,
      impact,
      reason: 'UNCENSORED_GATE_REACHED',
    };
  }

  const fetchImpl = options.fetchImpl || fetch;
  const repository = String(env?.MEL_GITHUB_REPOSITORY || DEFAULT_REPOSITORY).trim();
  const branch = String(env?.MEL_GITHUB_BRANCH || DEFAULT_BRANCH).trim();
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
    if (checkpoint?.local_gate_ready === true) {
      return {
        status: 'LOCAL_GATE_READY_FOR_CANONICAL_BENCHMARK',
        dispatched: false,
        checkpoint,
        impact,
        reason: 'PRESERVE_UNCENSORED_CHECKPOINT',
      };
    }

    const sha = await candidateHead({ fetchImpl, repository, branch, token });
    const shardSize = String(safeInt(env?.MEL_LORA_KAGGLE_SHARD_SIZE, 750, 50, 3000));
    const maxCyclesNumber = safeInt(env?.MEL_LORA_KAGGLE_MAX_CYCLES, 100, 1, 100);
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
  interval_minutes: 15,
  retry_minutes: 60,
  shard_size: 750,
  max_cycles: 100,
  zero_cost_only: true,
});
