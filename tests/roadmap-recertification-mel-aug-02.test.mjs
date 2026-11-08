import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { ZeroEuroGovernor } from '../src/augmentio/zero-euro-governor.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';
import { withRuntimeRecertification, executeRuntimeRecertification, isAcceptedRuntimeRecertificationJob } from '../src/roadmap/runtime-recertification.js';
import { computeRoadmapTruth } from '../src/roadmap/roadmap-truth.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';
const capability = 'policy.zero-euro-governor.verify';
function environment() {
  const issued = Date.now() - 60_000;
  const proof = { schema: 'mel.workers-ai.zero-cost-proof/v1', provider: 'workers-ai', account_plan: 'WORKERS_FREE',
    billing_path: 'direct-workers-ai-binding', pricing_policy: 'cloudflare-workers-ai-pricing-2026-10-01',
    free_allocation_neurons_per_day: 10_000, free_overage_behavior: 'FAIL_NOT_BILL',
    plan_evidence: { source: 'cloudflare-account-entitlements-api', account_type: 'standard',
      entitlement_key: 'workers.static_assets.manifest_limit_file_count', entitlement_value: 20_000, workers_free_reference_value: 20_000 },
    models: ['@cf/openai/gpt-oss-120b'], verified_at: new Date(issued).toISOString(), expires_at: new Date(issued + 3600_000).toISOString() };
  return { AI: { run: async () => { throw new Error('PROBE_MUST_NOT_INVOKE_AI'); } },
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: JSON.stringify(proof) };
}
function verify(env) { return createDefaultCapabilityBus({ env }).execute(capability, {}, { owner: 'proof', permissions: [] }); }
const historical = () => flattenRoadmap().find(row => row.id === 'MEL-AUG-02');

test('AUG-02 proves the real governor against current authorization without model calls', async () => {
  assert.deepEqual(await verify(environment()), { ok: true, negative_checks: 7, authorized_providers: 1 });
  const mapped = withRuntimeRecertification([historical()], { available: true, items: { 'MEL-AUG-02': { truth: 'BROKEN' } } });
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].verification_capability, capability);
  assert.equal(mapped[0].mode, 'VERIFY_RUNTIME');
});

test('no proof, expired proof and test-only free-provider shortcuts never certify policy', async () => {
  await assert.rejects(verify({}), { code: 'ZERO_EURO_RUNTIME_PROOF_REQUIRED' });
  const env = environment(), proof = JSON.parse(env.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON);
  proof.verified_at = new Date(Date.now() - 7200_000).toISOString();
  proof.expires_at = new Date(Date.now() - 3600_000).toISOString();
  env.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON = JSON.stringify(proof);
  await assert.rejects(verify(env), { code: 'ZERO_EURO_RUNTIME_PROOF_REQUIRED' });
});

test('a governor regression cannot produce an ok receipt', async () => {
  const original = ZeroEuroGovernor.prototype.evaluate;
  try {
    ZeroEuroGovernor.prototype.evaluate = function(candidate) {
      return candidate.id?.endsWith('-identity-probe') ? { allowed: true, code: 'ZERO_EURO_ALLOWED' } : original.call(this, candidate);
    };
    await assert.rejects(verify(environment()), { code: 'ZERO_EURO_RUNTIME_GUARD_FAILED' });
  } finally { ZeroEuroGovernor.prototype.evaluate = original; }
});

async function runtimeFixture(t) {
  const db = sqliteD1({ maintenanceFence: true }); t.after(() => db.close());
  await db.prepare('CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,timestamp INTEGER,action TEXT,path TEXT,details_json TEXT,client_ip TEXT,user_agent TEXT,request_method TEXT,response_status INTEGER,error_message TEXT,duration_ms INTEGER,created_at INTEGER)').run();
  await db.prepare('INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)')
    .bind('mel-autonomy-control', Date.now(), 'MAX_AUTONOMY', JSON.stringify({ paused: false, max_autonomy: true, owner_control_version: 1 })).run();
  const repository = new D1DevJobRepository(db);
  const job = await repository.create({ id: 'aug02-recert', requested_by: 'mel-autonomy', goal: 'Prove zero-cost policy',
    optional_context: { roadmap_id: 'MEL-AUG-02', work_mode: 'VERIFY_RUNTIME', source: 'autonomy-supervisor' } });
  return { db, repository, job: await repository.update(job.id, { status: 'PLANNING' }),
    env: { ...environment(), DB: db, MEL_DEPLOYED_GIT_SHA: 'a'.repeat(40) } };
}

test('only a fresh audited exact-deployment policy result certifies AUG-02', async t => {
  const f = await runtimeFixture(t);
  const result = await executeRuntimeRecertification(f.env, f.repository, f.job);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(isAcceptedRuntimeRecertificationJob(result.job), true);
  const proof = result.job.result_json.runtime_recertification;
  const row = await f.db.prepare('SELECT details_json FROM audit_logs WHERE id=?').bind(proof.audit_id).first();
  assert.equal(JSON.parse(row.details_json).capability, capability);
  const truth = await computeRoadmapTruth(f.db, [{ items: [historical()] }]);
  assert.equal(truth.items['MEL-AUG-02'].truth, 'VERIFIED_LIVE');
  assert.equal(proof.external_acceptance_verified, false);
});

test('the existing scheduler parks obsolete recipe work and admits only its parent verification', async t => {
  const f = await runtimeFixture(t);
  await f.repository.update(f.job.id, { status: 'CANCELLED' });
  const aux = await f.repository.create({ id: 'old-aug02-recipe', requested_by: 'mel-autonomy', goal: 'Old missing recipe',
    optional_context: { roadmap_id: 'ROADMAP-PROOF-MEL-AUG-02', source: 'autonomy-supervisor' } });
  await f.repository.update(aux.id, { status: 'TEACHER_APPROVED' });
  const parent = { ...historical(), depends_on: [] };
  const roadmap = withRuntimeRecertification([parent], { available: true, items: { [parent.id]: { truth: 'BROKEN' } } });
  const supervisor = new AutonomySupervisor({ repository: f.repository, roadmap });
  const admitted = await supervisor.ensureNextJob();
  assert.equal((await f.repository.get(aux.id)).status, 'WAITING_DEPENDENCY');
  assert.equal(admitted.job.optional_context.roadmap_id, 'MEL-AUG-02');
  assert.equal(admitted.job.optional_context.work_mode, 'VERIFY_RUNTIME');
  assert.equal((await supervisor.state()).active.length, 1);
  assert.notEqual(admitted.job.status, 'COMPLETED');
});


test('fresh canonical D1 proof replaces an expired deployment proof without changing policy', async t => {
  const f = await runtimeFixture(t);
  const fresh = JSON.parse(f.env.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON);
  const { ZERO_COST_PROOF_STORE_KEY } = await import('../src/augmentio/zero-cost-proof-store.js');
  await f.db.prepare('INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)')
    .bind(ZERO_COST_PROOF_STORE_KEY, Date.now(), 'VERIFIED', JSON.stringify({ workers_ai: fresh })).run();
  f.env.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON = '{}';
  assert.equal((await verify(f.env)).ok, true);
});

test('an old fanout success does not prove that unknown or unauthorized costs are refused', async t => {
  const f = await runtimeFixture(t);
  await f.db.prepare('INSERT INTO audit_logs(timestamp,action,details_json,created_at) VALUES(?,?,?,?)')
    .bind(Date.now(), 'capability_bus', JSON.stringify({ capability: 'augmentio.fanout', status: 'SUCCEEDED', event_id: 'old-fanout' }), Date.now()).run();
  const truth = await computeRoadmapTruth(f.db, [{ items: [historical()] }]);
  assert.notEqual(truth.items['MEL-AUG-02'].truth, 'VERIFIED_LIVE');
});

test('successful policy output without a durable matching audit cannot complete the mission', async t => {
  const f = await runtimeFixture(t);
  const { createGen2Runtime } = await import('../src/core/orchestrator/gen2-runtime.js');
  const result = await executeRuntimeRecertification(f.env, f.repository, f.job, {
    createRuntime: ({ env }) => createGen2Runtime({ env, audit: async () => {} }),
  });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.code, 'ROADMAP_RECERTIFICATION_AUDIT_REQUIRED');
});
