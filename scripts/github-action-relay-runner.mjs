const BASE_URL = String(process.env.MEL_RELAY_BASE_URL || 'https://meliturgos.adrien-lopezcarreras.workers.dev').replace(/\/$/, '');
const OIDC_TOKEN = String(process.env.MEL_GITHUB_OIDC_TOKEN || '');
const GH_TOKEN = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '');
const REPOSITORY = String(process.env.GITHUB_REPOSITORY || '');
const RUN_ID = Number(process.env.GITHUB_RUN_ID || 0);

function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

async function worker(path, body = {}) {
  const response = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: {
      'x-mel-github-oidc': OIDC_TOKEN,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok || data?.ok === false) {
    throw Object.assign(new Error(data?.code || 'GITHUB_RELAY_WORKER_REQUEST_FAILED'), {
      code: data?.code || 'GITHUB_RELAY_WORKER_REQUEST_FAILED',
      status: response.status,
    });
  }
  return data;
}

async function dispatch(job) {
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${encodeURIComponent(job.workflow)}/dispatches`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${GH_TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
        'user-agent': 'meliturgos-github-action-relay',
      },
      body: JSON.stringify({ ref: job.ref, inputs: job.inputs || {} }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (response.status !== 204) {
    throw Object.assign(new Error('GITHUB_RELAY_DISPATCH_FAILED'), {
      code: 'GITHUB_RELAY_DISPATCH_FAILED',
      status: response.status,
    });
  }
  return {
    accepted: true,
    http_status: 204,
    repository: REPOSITORY,
    workflow: job.workflow,
    ref: job.ref,
    dispatched_at: new Date().toISOString(),
    relay_run_id: RUN_ID || null,
    transport: 'github-actions-oidc-worker',
  };
}

async function main() {
  assert(OIDC_TOKEN.split('.').length === 3, 'GITHUB_ACTIONS_OIDC_TOKEN_REQUIRED');
  assert(GH_TOKEN.length >= 20, 'GITHUB_ACTION_TOKEN_REQUIRED');
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPOSITORY), 'GITHUB_RELAY_REPOSITORY_INVALID');

  await worker('/api/internal/github-action-relay/heartbeat', {
    run_id: RUN_ID,
    repository: REPOSITORY,
  });

  let processed = 0;
  let dispatched = 0;
  let failed = 0;
  for (let index = 0; index < 5; index += 1) {
    const claim = await worker('/api/internal/github-action-relay/claim');
    const job = claim?.job || null;
    if (!job) break;
    processed += 1;
    try {
      const result = await dispatch(job);
      await worker('/api/internal/github-action-relay/result', {
        job_id: job.id,
        status: 'DISPATCHED',
        result,
      });
      dispatched += 1;
      console.log(`GitHub relay dispatched ${job.id} -> ${job.workflow}@${job.ref}`);
    } catch (error) {
      failed += 1;
      await worker('/api/internal/github-action-relay/result', {
        job_id: job.id,
        status: 'FAILED',
        error: String(error?.code || error?.message || 'GITHUB_RELAY_DISPATCH_FAILED').slice(0, 180),
        result: {
          http_status: Number(error?.status || 0) || null,
          repository: REPOSITORY,
          workflow: job.workflow,
          ref: job.ref,
          relay_run_id: RUN_ID || null,
        },
      }).catch(() => {});
      console.error(`GitHub relay failed ${job.id}: ${String(error?.code || error?.message || error)}`);
    }
  }

  console.log(JSON.stringify({ ok: failed === 0, processed, dispatched, failed, relay_run_id: RUN_ID || null }));
  if (failed > 0) process.exit(2);
}

main().catch(error => {
  console.error(JSON.stringify({
    code: String(error?.code || error?.message || error),
    status: Number(error?.status || 0) || null,
  }));
  process.exit(1);
});
