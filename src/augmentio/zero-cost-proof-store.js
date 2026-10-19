import { workersAiRuntimeZeroCostProvenance } from './workers-ai-zero-cost-proof.js';
import { browserRunZeroCostProvenance } from '../media/browser-run-zero-cost-proof.js';
import { D1GitHubActionRelayStore } from '../platform/github-action-relay.js';

export const ZERO_COST_PROOF_STORE_KEY = 'runtime-proof:cloudflare-zero-cost';
export const ZERO_COST_PROOF_REFRESH_WORKFLOW = 'workers-ai-zero-cost-proof-refresh.yml';
const REFRESH_WINDOW_MS = 15 * 60 * 1000;
const REFRESH_AHEAD_MS = 20 * 60 * 1000;

function object(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.length > 32_768) return null;
  try { return object(JSON.parse(value)); } catch { return null; }
}

function validWorkersProof(proof, now) {
  const model = Array.isArray(proof?.models) ? proof.models[0] : null;
  return Boolean(model && workersAiRuntimeZeroCostProvenance({
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: proof,
  }, { adapterId: `workers-ai:${model}`, modelId: model, now }));
}

function validBrowserProof(proof, now) {
  return Boolean(browserRunZeroCostProvenance({ MEL_BROWSER_RUN_ZERO_COST_PROOF_JSON: proof }, { now }));
}

// Only the existing privileged Cloudflare workflow writes this document. D1
// stores evidence, never a bypass: the same one-hour validators still decide
// whether each provider/model may run. A read failure retains the env proof,
// whose own expiry remains mandatory at invocation time.
export async function withStoredZeroCostProofs(env = {}, { now = Date.now() } = {}) {
  if (!env?.DB?.prepare) return env;
  let stored;
  try {
    const row = await env.DB.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?')
      .bind(ZERO_COST_PROOF_STORE_KEY).first();
    stored = object(row?.metadata_json);
  } catch { return env; }
  if (!stored) return env;
  const updated = { ...env };
  for (const [key, proof, validate] of [
    ['MEL_WORKERS_AI_ZERO_COST_PROOF_JSON', stored.workers_ai, validWorkersProof],
    ['MEL_BROWSER_RUN_ZERO_COST_PROOF_JSON', stored.browser_run, validBrowserProof],
  ]) {
    const current = object(env[key]);
    if (validate(proof, now)
      && (!validate(current, now) || Date.parse(proof.verified_at) > Date.parse(current.verified_at))) {
      updated[key] = JSON.stringify(proof);
    }
  }
  return updated;
}

// A live minute tick asks the already-running GitHub relay for fresh evidence;
// it does not wait for GitHub's delayed schedule and cannot deploy a Worker.
// The deterministic primary key makes concurrent ticks admit one request.
export async function requestZeroCostProofRefresh(env = {}, { now = Date.now() } = {}) {
  if (!env?.DB?.prepare) return { status: 'SKIPPED_NO_DB' };
  const workers = object(env.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON);
  const browser = object(env.MEL_BROWSER_RUN_ZERO_COST_PROOF_JSON);
  const freshUntil = Math.min(Date.parse(workers?.expires_at), Date.parse(browser?.expires_at));
  if (validWorkersProof(workers, now) && validBrowserProof(browser, now)
    && freshUntil > now + REFRESH_AHEAD_MS) return { status: 'SKIPPED_FRESH' };
  const store = new D1GitHubActionRelayStore(env.DB);
  await store.init();
  const id = `zero-cost-proof-refresh-${Math.floor(now / REFRESH_WINDOW_MS)}`;
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO github_action_relay_jobs
    (id,status,workflow,ref,inputs_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`)
    .bind(id, 'QUEUED', ZERO_COST_PROOF_REFRESH_WORKFLOW, 'main', '{}', now, now).run();
  return { status: Number(result?.meta?.changes) === 1 ? 'REFRESH_QUEUED' : 'SKIPPED_ALREADY_QUEUED', relay_job_id: id };
}

// Used by the workflow after authoritative account/entitlement/doc checks.
// Publication changes data only; no secrets, Worker versions or traffic move.
export function zeroCostProofPublicationSql({ workers_ai, browser_run }, { now = Date.now() } = {}) {
  if (!validWorkersProof(workers_ai, now) || !validBrowserProof(browser_run, now)) {
    throw Object.assign(new Error('ZERO_COST_PROOF_PUBLICATION_INVALID'), { code: 'ZERO_COST_PROOF_PUBLICATION_INVALID' });
  }
  const verifiedAt = Math.min(Date.parse(workers_ai.verified_at), Date.parse(browser_run.verified_at));
  const metadata = JSON.stringify({ workers_ai, browser_run }).replaceAll("'", "''");
  return `CREATE TABLE IF NOT EXISTS dev_bridge_state (
    bridge_id TEXT PRIMARY KEY,last_seen INTEGER NOT NULL,status TEXT NOT NULL,metadata_json TEXT NOT NULL DEFAULT '{}'
  );
  INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json)
  VALUES('${ZERO_COST_PROOF_STORE_KEY}',${verifiedAt},'VERIFIED','${metadata}')
  ON CONFLICT(bridge_id) DO UPDATE SET last_seen=excluded.last_seen,status=excluded.status,metadata_json=excluded.metadata_json
  WHERE excluded.last_seen > dev_bridge_state.last_seen;`;
}
