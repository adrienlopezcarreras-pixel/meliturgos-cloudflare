import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { recoverVerificationEvidence } from '../src/evolution/verification-evidence-repair.js';
import { objectiveVerificationProfile } from '../src/evolution/objective-verification-profiles.js';
import { roadmapContractRevision } from '../src/roadmap/roadmap-code-contracts.js';
import { jobPipeline, describeJob } from '../src/evolution/autonomy-activity.js';
const oldSha = 'a'.repeat(40), deployedSha = 'b'.repeat(40);
async function fixture(db = null) {
  const repository = new D1DevJobRepository(db, { memoryStore: new Map() });
  let job = await repository.create({ id: 'held-verification', requested_by: 'mel-autonomy', goal: '[MEL-MANIFEST-01] Rapport',
    optional_context: { roadmap_id: 'MEL-MANIFEST-01', roadmap_contract_revision: roadmapContractRevision('MEL-MANIFEST-01') } });
  job = await repository.update(job.id, { status: 'FAILED', error: 'COUNCIL_REJECTED_VERIFY_EXISTING', result_json: {
    runtime_retry: { attempts: 3 }, repair_cycle: { attempts: 2 },
    teacher_bridge: { status: 'ANSWERED', request: { request_id: 'request-1', private_prompt: 'PRIVATE' },
      review: { request_id: 'request-1', verdict: 'APPROVE_PLAN', development_allowed: true } },
    implementation_proposal: { status: 'VERIFY_EXISTING', candidate_sha: oldSha, selected: { text: 'PRIVATE' } },
    council_review: { mode: 'VERIFY_EXISTING', decision: 'REJECTED', head: oldSha },
    verify_existing: { status: 'COUNCIL_REVIEWED', candidate_sha: oldSha, ci_run_id: 123,
      code: 'COUNCIL_REJECTED_VERIFY_EXISTING', live_checks: [{ capability: 'autonomy.status', ok: true, items: 5 }] },
    bridge_preparation_diagnostic: { code: 'NOOP_REQUIRES_FUNCTIONAL_VERIFICATION' },
  } });
  const control = { paused: false, max_autonomy: true, owner_control_version: 1, updated_at: 1, repair: { job_id: job.id } };
  return { env: {}, repository, job, control, deployedSha, readControl: async () => control };
}

test('corrected evidence revision reopens only the held job once, preserving the existing repair budget and veto', async () => {
  const db = sqliteD1();
  try {
    const f = await fixture(db), updated = await recoverVerificationEvidence(f);
    assert.equal(updated.status, 'QUEUED');
    assert.equal(updated.id, f.job.id);
    assert.equal(updated.goal, f.job.goal);
    assert.equal(updated.result_json.runtime_retry.attempts, 3);
    assert.equal(updated.result_json.repair_cycle.attempts, 4);
    assert.equal(updated.result_json.verification_evidence_repairs[0].council_review.decision, 'REJECTED');
    assert.equal(updated.result_json.teacher_bridge, null);
    assert.equal(updated.result_json.council_review, undefined);
    assert.equal(await recoverVerificationEvidence({ ...f, job: { ...f.job, result_json: { ...f.job.result_json, verification_evidence_repairs: updated.result_json.verification_evidence_repairs } } }), null);
  } finally { db.close(); }
});

test('unchanged code, unchanged evidence, owner stop, another held job, cancellation and exhausted budget never reopen', async () => {
  for (const kind of ['same-code','same-evidence','stop','other-job','cancelled','budget','revision']) {
    const f = await fixture();
    if (kind === 'same-code') f.deployedSha = oldSha;
    if (kind === 'same-evidence') f.job.result_json.verify_existing.evidence_revision = objectiveVerificationProfile(f.job.goal).revision;
    if (kind === 'stop') f.control.paused = true;
    if (kind === 'other-job') f.control.repair.job_id = 'other';
    if (kind === 'cancelled') f.job.status = 'CANCELLED';
    if (kind === 'budget') f.job.result_json.runtime_retry.attempts = 8;
    if (kind === 'revision') f.job.optional_context.roadmap_contract_revision = 'old';
    assert.equal(await recoverVerificationEvidence(f), null, kind);
  }
});

test('owner cancellation during the recovery read remains terminal', async () => {
  const f = await fixture();
  f.readControl = async () => { await f.repository.update(f.job.id, { status: 'CANCELLED' }); return f.control; };
  assert.equal(await recoverVerificationEvidence(f), null);
  assert.equal((await f.repository.get(f.job.id)).status, 'CANCELLED');
});

test('failed verification UI retains correlated Teacher approval and isolates the later Council rejection without private payload', async () => {
  const db = sqliteD1();
  try {
    const f = await fixture(db);
    const light = (await f.repository.list()).find(row => row.id === f.job.id);
    assert.equal(JSON.stringify(light).includes('PRIVATE'), false);
    const steps = jobPipeline(light);
    assert.equal(steps.find(row => row.key === 'plan').state, 'done');
    assert.equal(steps.find(row => row.key === 'council').state, 'blocked');
    assert.equal(steps.some(row => row.label === 'Code écrit'), false);
    const view = describeJob(light);
    assert.match(view.status_text, /Vérification refusée par le Council/);
    assert.deepEqual(view.diagnostics, ['COUNCIL_REJECTED_VERIFY_EXISTING']);
  } finally { db.close(); }
});

test('terminal UI projections never export archived verification prompts after repair', async () => {
  const db = sqliteD1();
  try {
    const f = await fixture(db);
    const recovered = await recoverVerificationEvidence(f);
    await f.repository.update(f.job.id, { status: 'FAILED' });
    assert.ok(JSON.stringify((await f.repository.get(f.job.id)).result_json).includes('PRIVATE'));
    assert.equal(JSON.stringify(await f.repository.list()).includes('PRIVATE'), false);
    assert.equal((await f.repository.get(f.job.id)).result_json.repair_cycle.attempts, 4);
  } finally { db.close(); }
});
