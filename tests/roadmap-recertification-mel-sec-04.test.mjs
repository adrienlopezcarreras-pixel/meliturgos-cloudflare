import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { verifyOwnerStopPolicy } from '../src/evolution/owner-stop-policy-proof.js';
import { setAutonomyControl } from '../src/evolution/autonomy-control.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';
import { computeRoadmapTruth } from '../src/roadmap/roadmap-truth.js';
import { withRuntimeRecertification, executeRuntimeRecertification, isAcceptedRuntimeRecertificationJob } from '../src/roadmap/runtime-recertification.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';
const capability = 'policy.owner-stop.verify';
const item = () => flattenRoadmap().find(row => row.id === 'MEL-SEC-04');
async function fixture(t) {
  const db = sqliteD1({ maintenanceFence: true }); t.after(() => db.close());
  await setAutonomyControl(db, { paused: false, max_autonomy: true, source: 'owner-ui', reason: 'owner-max-autonomy' });
  return { db, env: { DB: db, MEL_DEPLOYED_GIT_SHA: 'a'.repeat(40) } };
}
const snapshot = db => db.prepare("SELECT * FROM dev_bridge_state WHERE bridge_id='mel-autonomy-control'").first();

test('the live policy proof checks real D1 CAS and shared decisions without mutating owner control', async t => {
  const f = await fixture(t), before = await snapshot(f.db);
  const result = await createDefaultCapabilityBus({ env: f.env }).execute(capability, {}, { owner: 'proof', permissions: [] });
  assert.equal(result.ok, true);
  assert.ok(result.policy_checks >= 30);
  assert.equal(result.cas_checks, 4);
  assert.deepEqual(await snapshot(f.db), before);
  const mapped = withRuntimeRecertification([item()], { available: true, items: { 'MEL-SEC-04': { truth: 'UNPROVEN' } } });
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].verification_capability, capability);
  assert.equal(mapped[0].mode, 'VERIFY_RUNTIME');
});

test('the probe itself can execute with a SELECT-only D1 wrapper', async t => {
  const f = await fixture(t);
  const readonly = { prepare(sql) { assert.match(sql.trim(), /^SELECT\b/); return f.db.prepare(sql); } };
  assert.equal((await verifyOwnerStopPolicy({ DB: readonly })).ok, true);
});

test('missing live control or a stale CAS that would authorize writes cannot certify the invariant', async t => {
  await assert.rejects(verifyOwnerStopPolicy({}), { code: 'OWNER_STOP_PROOF_DB_UNAVAILABLE' });
  const f = await fixture(t);
  const broken = { prepare(sql) {
    if (sql.includes('COUNT(*) AS n')) return { bind() { return { first: async () => ({ n: 1 }) }; } };
    return f.db.prepare(sql);
  } };
  await assert.rejects(verifyOwnerStopPolicy({ DB: broken }), { code: 'OWNER_STOP_PROOF_CAS_FAILED' });
});

async function jobFixture(t) {
  const f = await fixture(t);
  await f.db.prepare('CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY,timestamp INTEGER,action TEXT,path TEXT,details_json TEXT,client_ip TEXT,user_agent TEXT,request_method TEXT,response_status INTEGER,error_message TEXT,duration_ms INTEGER,created_at INTEGER)').run();
  f.repository = new D1DevJobRepository(f.db);
  const job = await f.repository.create({ id: 'owner-proof', requested_by: 'mel-autonomy', goal: 'Prove owner-stop priority',
    optional_context: { roadmap_id: 'MEL-SEC-04', work_mode: 'VERIFY_RUNTIME', source: 'autonomy-supervisor' } });
  f.job = await f.repository.update(job.id, { status: 'PLANNING' });
  return f;
}

test('only the audited exact-deployment execution marks SEC-04 verified, with owner control unchanged', async t => {
  const f = await jobFixture(t), before = await snapshot(f.db);
  const result = await executeRuntimeRecertification(f.env, f.repository, f.job);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(isAcceptedRuntimeRecertificationJob(result.job), true);
  assert.deepEqual(await snapshot(f.db), before);
  const proof = result.job.result_json.runtime_recertification;
  const audit = await f.db.prepare('SELECT details_json FROM audit_logs WHERE id=?').bind(proof.audit_id).first();
  assert.equal(JSON.parse(audit.details_json).capability, capability);
  const truth = await computeRoadmapTruth(f.db, [{ items: [item()] }]);
  assert.equal(truth.items['MEL-SEC-04'].truth, 'VERIFIED_LIVE');
});

test('a successful pause alone does not prove that later automatic resumes honor it', async t => {
  const f = await jobFixture(t);
  await f.db.prepare('INSERT INTO audit_logs(timestamp,action,details_json,created_at) VALUES(?,?,?,?)')
    .bind(Date.now(), 'capability_bus', JSON.stringify({ capability: 'autonomy.pause', status: 'SUCCEEDED', event_id: 'old-pause' }), Date.now()).run();
  const truth = await computeRoadmapTruth(f.db, [{ items: [item()] }]);
  assert.notEqual(truth.items['MEL-SEC-04'].truth, 'VERIFIED_LIVE');
});

test('the missing-recipe mission is parked and only its parent runtime verification is admitted', async t => {
  const f = await jobFixture(t);
  await f.repository.update(f.job.id, { status: 'CANCELLED' });
  const old = await f.repository.create({ id: 'old-owner-proof', requested_by: 'mel-autonomy', goal: 'Prepare owner-stop recipe',
    optional_context: { roadmap_id: 'ROADMAP-PROOF-MEL-SEC-04', source: 'autonomy-supervisor' } });
  await f.repository.update(old.id, { status: 'TEACHER_APPROVED' });
  const parent = { ...item(), depends_on: [] };
  const roadmap = withRuntimeRecertification([parent], { available: true, items: { [parent.id]: { truth: 'UNPROVEN' } } });
  const supervisor = new AutonomySupervisor({ repository: f.repository, roadmap });
  const admitted = await supervisor.ensureNextJob();
  assert.equal((await f.repository.get(old.id)).status, 'WAITING_DEPENDENCY');
  assert.equal(admitted.job.optional_context.roadmap_id, 'MEL-SEC-04');
  assert.equal(admitted.job.optional_context.work_mode, 'VERIFY_RUNTIME');
  assert.equal((await supervisor.state()).active.length, 1);
  assert.notEqual(admitted.job.status, 'COMPLETED');
});
