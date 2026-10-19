import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createDefaultAugmentioPool } from '../src/augmentio/default-pool.js';
import { ZeroEuroGovernor } from '../src/augmentio/zero-euro-governor.js';
import { BOOTSTRAP_CORRECTIONS } from '../src/learning/bootstrap-corrections.js';
import {
  ZERO_COST_PROOF_STORE_KEY, withStoredZeroCostProofs,
  requestZeroCostProofRefresh, zeroCostProofPublicationSql,
} from '../src/augmentio/zero-cost-proof-store.js';

const MODEL = '@cf/zai-org/glm-4.7-flash';
function proofs(now, issued = now - 60_000) {
  const timestamps = { verified_at: new Date(issued).toISOString(), expires_at: new Date(issued + 3600_000).toISOString() };
  return {
    workers_ai: {
      schema: 'mel.workers-ai.zero-cost-proof/v1', provider: 'workers-ai', account_plan: 'WORKERS_FREE',
      billing_path: 'direct-workers-ai-binding', pricing_policy: 'cloudflare-workers-ai-pricing-2026-10-01',
      free_allocation_neurons_per_day: 10_000, free_overage_behavior: 'FAIL_NOT_BILL',
      plan_evidence: { source: 'cloudflare-account-entitlements-api', account_type: 'standard',
        entitlement_key: 'workers.static_assets.manifest_limit_file_count', entitlement_value: 20_000, workers_free_reference_value: 20_000 },
      models: [MODEL], ...timestamps,
    },
    browser_run: { schema: 'mel.browser-run.zero-cost-proof/v1', provider: 'cloudflare-browser-run',
      account_plan: 'WORKERS_FREE', included_minutes_per_day: 10, overage_behavior: 'HARD_LIMIT_NO_BILLING',
      documentation_url: 'https://developers.cloudflare.com/browser-run/pricing/', ...timestamps },
  };
}

async function publish(db, value, now) {
  const sql = zeroCostProofPublicationSql(value, { now });
  const at = sql.indexOf('\n  INSERT');
  await db.prepare(sql.slice(0, at)).run();
  await db.prepare(sql.slice(at)).run();
}

function envProofs(value) {
  return { MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: JSON.stringify(value.workers_ai),
    MEL_BROWSER_RUN_ZERO_COST_PROOF_JSON: JSON.stringify(value.browser_run) };
}

test('fresh D1 evidence replaces expired deployment evidence without changing Worker identity or extending expiry', async () => {
  const db = sqliteD1();
  const now = Date.now();
  try {
    const fresh = proofs(now);
    // Quote-bearing evidence must remain data in the workflow SQL, not SQL.
    fresh.workers_ai.note = "owner's verified evidence";
    await publish(db, fresh, now);
    const original = { DB: db, AI: { run: async () => ({ response: 'real adapter fixture' }) },
      MEL_DEPLOYED_GIT_SHA: 'b'.repeat(40), ...envProofs(proofs(now, now - 7200_000)) };
    const hydrated = await withStoredZeroCostProofs(original, { now });
    assert.deepEqual(JSON.parse(hydrated.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON), fresh.workers_ai);
    assert.equal(hydrated.MEL_DEPLOYED_GIT_SHA, original.MEL_DEPLOYED_GIT_SHA);
    assert.notEqual(hydrated.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON, original.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON);
    const pool = createDefaultAugmentioPool(hydrated);
    await pool.refreshHealth();
    assert.equal(new ZeroEuroGovernor().evaluate(pool.get(`workers-ai:${MODEL}`)).allowed, true);
    const expired = await withStoredZeroCostProofs(original, { now: Date.parse(fresh.workers_ai.expires_at) });
    assert.equal(expired.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON, original.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON);
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM dev_bridge_state').first('n'), 1);
  } finally { db.close(); }
});

test('invalid or overlong evidence cannot be published and an older concurrent publication cannot replace newer proof', async () => {
  const db = sqliteD1();
  const now = Date.now();
  try {
    for (const mutate of [
      p => { p.workers_ai.free_overage_behavior = 'BILL'; },
      p => { p.workers_ai.account_plan = 'WORKERS_PAID'; },
      p => { p.workers_ai.plan_evidence.entitlement_value = 100_000; },
      p => { p.workers_ai.expires_at = new Date(now + 7200_000).toISOString(); },
      p => { p.browser_run.overage_behavior = 'BILL'; },
      p => { p.browser_run.expires_at = new Date(now - 1).toISOString(); },
    ]) {
      const invalid = proofs(now); mutate(invalid);
      assert.throws(() => zeroCostProofPublicationSql(invalid, { now }), /ZERO_COST_PROOF_PUBLICATION_INVALID/);
    }
    const latest = proofs(now);
    await publish(db, latest, now);
    await publish(db, proofs(now, now - 120_000), now);
    const loaded = await withStoredZeroCostProofs({ DB: db }, { now });
    assert.deepEqual(JSON.parse(loaded.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON), latest.workers_ai);
    const newerEnv = envProofs(proofs(now, now));
    assert.deepEqual(await withStoredZeroCostProofs({ DB: db, ...newerEnv }, { now }), { DB: db, ...newerEnv });
  } finally { db.close(); }
});

test('unreadable or malformed persisted evidence preserves the independently validated deployment proof', async () => {
  const db = sqliteD1();
  const now = Date.now();
  const env = { DB: db, ...envProofs(proofs(now)) };
  try {
    assert.equal(await withStoredZeroCostProofs(env), env);
    await publish(db, proofs(now), now);
    await db.prepare('UPDATE dev_bridge_state SET metadata_json=? WHERE bridge_id=?')
      .bind('{broken', ZERO_COST_PROOF_STORE_KEY).run();
    assert.equal(await withStoredZeroCostProofs(env), env);
  } finally { db.close(); }
});

test('minute ticks admit one durable refresh per window before expiry, even when MAX is paused', async () => {
  const db = sqliteD1();
  const now = Date.now();
  try {
    const fresh = { DB: db, ...envProofs(proofs(now)) };
    assert.equal((await requestZeroCostProofRefresh(fresh, { now })).status, 'SKIPPED_FRESH');
    const stale = { DB: db, paused: true, ...envProofs(proofs(now, now - 7200_000)) };
    const results = await Promise.all(Array.from({ length: 8 }, () => requestZeroCostProofRefresh(stale, { now })));
    assert.equal(results.filter(row => row.status === 'REFRESH_QUEUED').length, 1);
    const rows = (await db.prepare('SELECT workflow,ref,status,inputs_json FROM github_action_relay_jobs').all()).results;
    assert.deepEqual(rows.map(row => ({ ...row })), [{ workflow: 'workers-ai-zero-cost-proof-refresh.yml', ref: 'main', status: 'QUEUED', inputs_json: '{}' }]);
    assert.equal((await requestZeroCostProofRefresh(stale, { now: now + 900_000 })).status, 'REFRESH_QUEUED');
  } finally { db.close(); }
});

test('the deployed HTTP path consumes persisted evidence and retains authentication', async () => {
  const previous = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  const db = sqliteD1();
  const now = Date.now();
  let calls = 0;
  try {
    await publish(db, proofs(now), now);
    const env = { DB: db, MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only',
      AI: { run: async () => { calls++; return { response: 'verified fixture response' }; } },
      ...envProofs(proofs(now, now - 7200_000)) };
    const worker = (await import('../src/visual-final-entry.js')).default;
    const request = (authorized) => new Request('https://localhost/api/gen2/capabilities/execute', {
      method: 'POST', headers: { 'content-type': 'application/json',
        ...(authorized ? { authorization: `Basic ${Buffer.from('test:test-only').toString('base64')}` } : {}) },
      body: JSON.stringify({ id: 'augmentio.fanout', input: { capability: 'CODE', input: 'bounded fixture', maxCandidates: 1 } }),
    });
    assert.equal((await worker.fetch(request(false), env)).status, 401);
    assert.equal(calls, 0);
    const response = await worker.fetch(request(true), env);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.ok, true);
    assert.equal(calls, 1);
    await db.prepare('DELETE FROM dev_bridge_state WHERE bridge_id=?').bind(ZERO_COST_PROOF_STORE_KEY).run();
    const blocked = await worker.fetch(request(true), env);
    assert.notEqual(blocked.status, 200);
    assert.equal(calls, 1, 'expired deployment proof must not call any model');
  } finally {
    db.close();
    if (previous !== undefined) process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = previous;
  }
});

test('refresh publishes data only, keeps authoritative plan checks, and the existing minute entry requests it', async () => {
  const workflow = await readFile(new URL('../.github/workflows/workers-ai-zero-cost-proof-refresh.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /wrangler\s+(?:versions|secret|deploy|publish)\b|\/workers\/scripts\/.*(?:deployments|versions)/);
  assert.match(workflow, /wrangler d1 execute DB --remote --config wrangler\.jsonc --env="" --file zero-cost-proof-publication\.sql/);
  assert.match(workflow, /accounts\/\$\{CLOUDFLARE_ACCOUNT_ID\}\/entitlements/);
  assert.match(workflow, /free_overage_behavior:'FAIL_NOT_BILL'/);
  assert.match(workflow, /expires_at:new Date\(now\+60\*60\*1000\)/);
  const entry = await readFile(new URL('../src/visual-final-entry.js', import.meta.url), 'utf8');
  assert.match(entry, /async scheduled\([^)]*\)\s*\{\s*env = await withStoredZeroCostProofs\(env\)/);
  assert.match(entry, /await requestZeroCostProofRefresh\(env\)/);
});

test('the reusable renewal and single-deployer rule is loaded by the canonical XP corpus', () => {
  assert.equal(BOOTSTRAP_CORRECTIONS.find(row => row.id === 'zero-cost-evidence-renewal-without-redeploy-20261019')?.validated, true);
});
