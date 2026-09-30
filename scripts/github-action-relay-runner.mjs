const CF_TOKEN = String(process.env.CLOUDFLARE_API_TOKEN || '');
const ACCOUNT_ID = String(process.env.CLOUDFLARE_ACCOUNT_ID || '');
const DATABASE_ID = String(process.env.MEL_D1_DATABASE_ID || '');
const GH_TOKEN = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '');
const REPOSITORY = String(process.env.GITHUB_REPOSITORY || '');
const RUN_ID = Number(process.env.GITHUB_RUN_ID || 0);

function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

async function d1(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${CF_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok || body?.success !== true) {
    throw Object.assign(new Error('GITHUB_RELAY_D1_QUERY_FAILED'), {
      code: 'GITHUB_RELAY_D1_QUERY_FAILED',
      status: response.status,
    });
  }
  const result = Array.isArray(body.result) ? body.result[0] : body.result;
  if (result?.success === false) throw new Error('GITHUB_RELAY_D1_STATEMENT_FAILED');
  return {
    rows: Array.isArray(result?.results) ? result.results : [],
    meta: result?.meta || {},
  };
}

async function ensureSchema() {
  await d1(`CREATE TABLE IF NOT EXISTS github_action_relay_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    workflow TEXT NOT NULL,
    ref TEXT NOT NULL,
    inputs_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    claimed_at INTEGER,
    completed_at INTEGER
  )`);
  await d1(`CREATE INDEX IF NOT EXISTS idx_github_action_relay_jobs_status_created
    ON github_action_relay_jobs(status, created_at)`);
  await d1(`CREATE TABLE IF NOT EXISTS github_action_relay_state (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  )`);
}

async function heartbeat() {
  const now = Date.now();
  const metadata = JSON.stringify({ run_id: RUN_ID || null, repository: REPOSITORY, source: 'github-actions-d1-direct' });
  await d1(`INSERT INTO github_action_relay_state(id,status,last_seen_at,metadata_json)
    VALUES('primary','ONLINE',?,?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status,last_seen_at=excluded.last_seen_at,metadata_json=excluded.metadata_json`,
    [now, metadata]);
}

async function claimOne() {
  const selected = await d1(`SELECT id,workflow,ref,inputs_json FROM github_action_relay_jobs
    WHERE status='QUEUED' ORDER BY created_at ASC LIMIT 1`);
  const row = selected.rows[0];
  if (!row?.id) return null;
  const now = Date.now();
  const updated = await d1(`UPDATE github_action_relay_jobs
    SET status='CLAIMED',claimed_at=?,updated_at=?
    WHERE id=? AND status='QUEUED'`,
    [now, now, row.id]);
  if (Number(updated.meta?.changes || 0) < 1) return null;
  let inputs = {};
  try { inputs = JSON.parse(String(row.inputs_json || '{}')); } catch {}
  return {
    id: String(row.id),
    workflow: String(row.workflow),
    ref: String(row.ref),
    inputs: inputs && typeof inputs === 'object' && !Array.isArray(inputs) ? inputs : {},
  };
}

async function complete(job, status, result = null, error = null) {
  const now = Date.now();
  await d1(`UPDATE github_action_relay_jobs
    SET status=?,result_json=?,error=?,updated_at=?,completed_at=?
    WHERE id=? AND status='CLAIMED'`,
    [
      status,
      result == null ? null : JSON.stringify(result),
      error ? String(error).slice(0, 500) : null,
      now,
      now,
      job.id,
    ]);
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
    transport: 'github-actions-d1-direct',
  };
}

async function main() {
  assert(CF_TOKEN.length >= 20, 'CLOUDFLARE_API_TOKEN_REQUIRED');
  assert(ACCOUNT_ID.length >= 20, 'CLOUDFLARE_ACCOUNT_ID_REQUIRED');
  assert(/^[0-9a-f-]{36}$/i.test(DATABASE_ID), 'MEL_D1_DATABASE_ID_REQUIRED');
  assert(GH_TOKEN.length >= 20, 'GITHUB_ACTION_TOKEN_REQUIRED');
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPOSITORY), 'GITHUB_RELAY_REPOSITORY_INVALID');

  await ensureSchema();
  await heartbeat();

  let processed = 0;
  let dispatched = 0;
  let failed = 0;
  for (let index = 0; index < 5; index += 1) {
    const job = await claimOne();
    if (!job) break;
    processed += 1;
    try {
      const result = await dispatch(job);
      await complete(job, 'DISPATCHED', result, null);
      dispatched += 1;
      console.log(`GitHub relay dispatched ${job.id} -> ${job.workflow}@${job.ref}`);
    } catch (error) {
      failed += 1;
      await complete(job, 'FAILED', {
        http_status: Number(error?.status || 0) || null,
        repository: REPOSITORY,
        workflow: job.workflow,
        ref: job.ref,
        relay_run_id: RUN_ID || null,
      }, String(error?.code || error?.message || 'GITHUB_RELAY_DISPATCH_FAILED'));
      console.error(`GitHub relay failed ${job.id}: ${String(error?.code || error?.message || error)}`);
    }
  }

  console.log(JSON.stringify({ ok: failed === 0, processed, dispatched, failed, relay_run_id: RUN_ID || null }));
  if (failed > 0) process.exit(2);
}

main().catch(error => {
  console.error(String(error?.code || error?.message || error));
  process.exit(1);
});
