import { spawnSync } from 'node:child_process';

const GH_TOKEN = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '');
const REPOSITORY = String(process.env.GITHUB_REPOSITORY || '');
const RUN_ID = Number(process.env.GITHUB_RUN_ID || 0);

function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

function sqlString(value) {
  return "'" + String(value ?? '').replaceAll("'", "''") + "'";
}

function d1(sql) {
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--remote', '--json', '--command', sql], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const message = String(result.stderr || result.stdout || 'GITHUB_RELAY_D1_CLI_FAILED').slice(0, 4000);
    throw Object.assign(new Error('GITHUB_RELAY_D1_CLI_FAILED'), { code: 'GITHUB_RELAY_D1_CLI_FAILED', detail: message });
  }
  let payload;
  try { payload = JSON.parse(String(result.stdout || '[]')); }
  catch { throw new Error('GITHUB_RELAY_D1_CLI_INVALID_JSON'); }
  const parts = Array.isArray(payload) ? payload : [payload];
  const rows = [];
  for (const part of parts) {
    if (Array.isArray(part?.results)) rows.push(...part.results);
    else if (Array.isArray(part?.result?.results)) rows.push(...part.result.results);
  }
  return rows;
}

function ensureSchema() {
  d1(`CREATE TABLE IF NOT EXISTS github_action_relay_jobs (
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
  d1(`CREATE INDEX IF NOT EXISTS idx_github_action_relay_jobs_status_created
    ON github_action_relay_jobs(status, created_at)`);
  d1(`CREATE TABLE IF NOT EXISTS github_action_relay_state (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  )`);
}

function heartbeat() {
  const now = Date.now();
  const metadata = JSON.stringify({
    run_id: RUN_ID || null,
    repository: REPOSITORY,
    source: 'github-actions-wrangler-d1',
  });
  d1(`INSERT INTO github_action_relay_state(id,status,last_seen_at,metadata_json)
    VALUES('primary','ONLINE',${now},${sqlString(metadata)})
    ON CONFLICT(id) DO UPDATE SET
      status=excluded.status,
      last_seen_at=excluded.last_seen_at,
      metadata_json=excluded.metadata_json`);
}

function claimOne() {
  const now = Date.now();
  const rows = d1(`UPDATE github_action_relay_jobs
    SET status='CLAIMED', claimed_at=${now}, updated_at=${now}
    WHERE id=(
      SELECT id FROM github_action_relay_jobs
      WHERE status='QUEUED'
      ORDER BY created_at ASC
      LIMIT 1
    ) AND status='QUEUED'
    RETURNING id,status,workflow,ref,inputs_json,created_at,updated_at,claimed_at`);
  const row = rows[0];
  if (!row?.id) return null;
  let inputs = {};
  try { inputs = JSON.parse(String(row.inputs_json || '{}')); } catch {}
  return {
    id: String(row.id),
    status: String(row.status || ''),
    workflow: String(row.workflow || ''),
    ref: String(row.ref || ''),
    inputs: inputs && typeof inputs === 'object' && !Array.isArray(inputs) ? inputs : {},
  };
}

function complete(job, status, result = null, error = null) {
  const now = Date.now();
  d1(`UPDATE github_action_relay_jobs
    SET status=${sqlString(status)},
        result_json=${result == null ? 'NULL' : sqlString(JSON.stringify(result))},
        error=${error ? sqlString(String(error).slice(0, 500)) : 'NULL'},
        updated_at=${now},
        completed_at=${now}
    WHERE id=${sqlString(job.id)} AND status='CLAIMED'`);
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
    transport: 'github-actions-wrangler-d1',
  };
}

async function main() {
  assert(String(process.env.CLOUDFLARE_API_TOKEN || '').length >= 20, 'CLOUDFLARE_API_TOKEN_REQUIRED');
  assert(String(process.env.CLOUDFLARE_ACCOUNT_ID || '').length >= 20, 'CLOUDFLARE_ACCOUNT_ID_REQUIRED');
  assert(GH_TOKEN.length >= 20, 'GITHUB_ACTION_TOKEN_REQUIRED');
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPOSITORY), 'GITHUB_RELAY_REPOSITORY_INVALID');

  ensureSchema();
  heartbeat();

  let processed = 0;
  let dispatched = 0;
  let failed = 0;
  for (let index = 0; index < 5; index += 1) {
    const job = claimOne();
    if (!job) break;
    processed += 1;
    try {
      const result = await dispatch(job);
      complete(job, 'DISPATCHED', result, null);
      dispatched += 1;
      console.log(`GitHub relay dispatched ${job.id} -> ${job.workflow}@${job.ref}`);
    } catch (error) {
      failed += 1;
      complete(job, 'FAILED', {
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
  console.error(JSON.stringify({
    code: String(error?.code || error?.message || error),
    detail: error?.detail || null,
  }));
  process.exit(1);
});
