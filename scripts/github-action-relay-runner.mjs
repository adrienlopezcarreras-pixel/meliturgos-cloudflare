const CF_TOKEN = String(process.env.CLOUDFLARE_API_TOKEN || '');
const ACCOUNT_ID = String(process.env.CLOUDFLARE_ACCOUNT_ID || '');
const BUCKET = String(process.env.MEL_R2_BUCKET || 'meliturgos-private-media');
const GH_TOKEN = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '');
const REPOSITORY = String(process.env.GITHUB_REPOSITORY || '');
const RUN_ID = Number(process.env.GITHUB_RUN_ID || 0);
const PREFIX = 'github-action-relay';

function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

function keyPath(key) {
  return String(key || '').split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function r2Base() {
  return `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${encodeURIComponent(BUCKET)}/objects`;
}

async function putObject(key, value) {
  const response = await fetch(`${r2Base()}/${keyPath(key)}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${CF_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(value),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok || body?.success !== true) {
    const code = body?.errors?.[0]?.code || body?.error?.code || null;
    throw Object.assign(new Error('GITHUB_RELAY_R2_PUT_FAILED'), {
      code: 'GITHUB_RELAY_R2_PUT_FAILED',
      status: response.status,
      provider_code: code,
    });
  }
}

async function getObject(key) {
  const response = await fetch(`${r2Base()}/${keyPath(key)}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${CF_TOKEN}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw Object.assign(new Error('GITHUB_RELAY_R2_GET_FAILED'), {
      code: 'GITHUB_RELAY_R2_GET_FAILED',
      status: response.status,
    });
  }
  const text = await response.text();
  try { return JSON.parse(text); } catch { throw new Error('GITHUB_RELAY_R2_OBJECT_INVALID'); }
}

async function listObjects(prefix) {
  const url = new URL(r2Base());
  url.searchParams.set('prefix', prefix);
  url.searchParams.set('limit', '100');
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${CF_TOKEN}` },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success !== true) {
    const code = body?.errors?.[0]?.code || body?.error?.code || null;
    throw Object.assign(new Error('GITHUB_RELAY_R2_LIST_FAILED'), {
      code: 'GITHUB_RELAY_R2_LIST_FAILED',
      status: response.status,
      provider_code: code,
    });
  }
  const rows = Array.isArray(body?.result?.objects)
    ? body.result.objects
    : Array.isArray(body?.result)
      ? body.result
      : [];
  return rows.map(row => String(row?.key || '')).filter(Boolean);
}

async function heartbeat() {
  await putObject(`${PREFIX}/state.json`, {
    status: 'ONLINE',
    last_seen_at: Date.now(),
    metadata: {
      run_id: RUN_ID || null,
      repository: REPOSITORY,
      source: 'github-actions-r2-direct',
    },
  });
}

async function claimOne() {
  const keys = await listObjects(`${PREFIX}/jobs/`);
  const candidates = [];
  for (const key of keys.slice(0, 100)) {
    const job = await getObject(key);
    if (job?.status === 'QUEUED' && /^gh-relay-[A-Za-z0-9-]+$/.test(String(job?.id || ''))) {
      candidates.push({ key, job });
    }
  }
  candidates.sort((a, b) => Number(a.job.created_at || 0) - Number(b.job.created_at || 0));
  const selected = candidates[0];
  if (!selected) return null;
  const now = Date.now();
  const job = {
    ...selected.job,
    status: 'CLAIMED',
    claimed_at: now,
    updated_at: now,
  };
  await putObject(selected.key, job);
  return { key: selected.key, job };
}

async function complete(claimed, status, result = null, error = null) {
  const now = Date.now();
  const job = {
    ...claimed.job,
    status,
    result,
    error: error ? String(error).slice(0, 500) : null,
    updated_at: now,
    completed_at: now,
  };
  await putObject(claimed.key, job);
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
    transport: 'github-actions-r2-direct',
  };
}

async function main() {
  assert(CF_TOKEN.length >= 20, 'CLOUDFLARE_API_TOKEN_REQUIRED');
  assert(ACCOUNT_ID.length >= 20, 'CLOUDFLARE_ACCOUNT_ID_REQUIRED');
  assert(BUCKET.length >= 3, 'MEL_R2_BUCKET_REQUIRED');
  assert(GH_TOKEN.length >= 20, 'GITHUB_ACTION_TOKEN_REQUIRED');
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPOSITORY), 'GITHUB_RELAY_REPOSITORY_INVALID');

  await heartbeat();

  let processed = 0;
  let dispatched = 0;
  let failed = 0;
  for (let index = 0; index < 5; index += 1) {
    const claimed = await claimOne();
    if (!claimed) break;
    processed += 1;
    try {
      const result = await dispatch(claimed.job);
      await complete(claimed, 'DISPATCHED', result, null);
      dispatched += 1;
      console.log(`GitHub relay dispatched ${claimed.job.id} -> ${claimed.job.workflow}@${claimed.job.ref}`);
    } catch (error) {
      failed += 1;
      await complete(claimed, 'FAILED', {
        http_status: Number(error?.status || 0) || null,
        repository: REPOSITORY,
        workflow: claimed.job.workflow,
        ref: claimed.job.ref,
        relay_run_id: RUN_ID || null,
      }, String(error?.code || error?.message || 'GITHUB_RELAY_DISPATCH_FAILED'));
      console.error(`GitHub relay failed ${claimed.job.id}: ${String(error?.code || error?.message || error)}`);
    }
  }

  console.log(JSON.stringify({ ok: failed === 0, processed, dispatched, failed, relay_run_id: RUN_ID || null }));
  if (failed > 0) process.exit(2);
}

main().catch(error => {
  console.error(JSON.stringify({
    code: String(error?.code || error?.message || error),
    status: Number(error?.status || 0) || null,
    provider_code: error?.provider_code || null,
  }));
  process.exit(1);
});
