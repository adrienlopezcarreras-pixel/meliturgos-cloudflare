// [Codex] Real disposable SQLite persistence and scheduler recovery; no live
// provider/production result is claimed by these local regressions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { persistVerificationWait } from '../src/evolution/autonomy-runtime-core.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';
import { reviewVerificationEvidence } from '../src/evolution/council-review.js';

const SHA = 'a'.repeat(40);
async function fixture(t) {
  const DB = sqliteD1();
  t.after(() => DB.close());
  const repository = new D1DevJobRepository(DB);
  const job = await repository.create({ id: 'verify-existing', requested_by: 'mel-autonomy', goal: 'Lire Gmail', optional_context: { roadmap_id: 'MEL-FOUNDER-01' } });
  await repository.update(job.id, { status: 'TEACHER_APPROVED', result_json: {
    implementation_proposal: { status: 'VERIFY_EXISTING', candidate_sha: SHA },
    preserved: 'existing evidence',
  } });
  return { DB, repository, id: job.id };
}

test('missing exact CI or live proof persists a resumable verification, not a failed implementation', async t => {
  const { repository, id } = await fixture(t);
  for (const code of ['FULL_CANDIDATE_CI_REQUIRED', 'VERIFY_EXISTING_LIVE_CHECK_FAILED:drive.files.list:GOOGLE_AUTH_REQUIRED']) {
    const checks = [{ capability: 'drive.files.list', ok: false, code: 'GOOGLE_AUTH_REQUIRED' }];
    await persistVerificationWait(repository, id, { code, candidateSha: SHA, liveChecks: checks });
    const stored = await repository.get(id);
    assert.equal(stored.status, 'TEACHER_APPROVED');
    assert.equal(stored.result_json.verify_existing.status, 'WAITING_VERIFICATION');
    assert.equal(stored.result_json.verify_existing.objective_assessment, 'ALREADY_IMPLEMENTED_UNVERIFIED');
    assert.equal(stored.result_json.verify_existing.code, code);
    assert.deepEqual(stored.result_json.verify_existing.live_checks, checks);
    assert.equal(stored.result_json.preserved, 'existing evidence');
    assert.equal(stored.result_json.autonomy_completion, undefined);
    assert.equal(stored.files_json.length, 0);
  }
});

test('restart retains one mission while verification waits and resumes it after expiry', async t => {
  const { repository, id } = await fixture(t);
  const roadmap = [
    { id: 'MEL-FOUNDER-01', title: 'Read Gmail', status: 'IN_PROGRESS', priority: 'P0' },
    { id: 'MEL-FOUNDER-02', title: 'Independent cloud work', status: 'PLANNED', priority: 'P0' },
  ];
  await persistVerificationWait(repository, id, { code: 'FULL_CANDIDATE_CI_REQUIRED' });
  const waiting = await new AutonomySupervisor({ repository, roadmap }).ensureNextJob();
  assert.equal(waiting.job, null);
  assert.equal(waiting.external_progress?.job_id, id);
  assert.equal((await repository.list()).length, 1, 'pending verification cannot start an independent mission');
  await persistVerificationWait(repository, id, { code: 'FULL_CANDIDATE_CI_REQUIRED', now: Date.now() - 6 * 60_000 });
  const resumed = await new AutonomySupervisor({ repository, roadmap }).ensureNextJob();
  assert.equal(resumed.job.id, id);
});

test('verification waits never revive terminal jobs or reclaim externally executing work', async t => {
  const { repository, id } = await fixture(t);
  for (const status of ['FAILED', 'CANCELLED', 'COMPLETED', 'CLAIMED', 'READY_FOR_REVIEW']) {
    await repository.update(id, { status });
    const before = await repository.get(id);
    await persistVerificationWait(repository, id, { code: 'COUNCIL_UNAVAILABLE' });
    assert.deepEqual(await repository.get(id), before);
  }
});

test('a concurrent result cannot be overwritten by an older verification snapshot', async t => {
  const { repository, id } = await fixture(t);
  const concurrent = {
    get: repository.get.bind(repository),
    async update(jobId, patch, options) {
      await repository.update(jobId, { status: 'CANCELLED', error: 'OWNER_CANCELLED' });
      return repository.update(jobId, patch, options);
    },
  };
  await persistVerificationWait(concurrent, id, { code: 'COUNCIL_UNAVAILABLE' });
  assert.equal((await repository.get(id)).status, 'CANCELLED');
  assert.equal((await repository.get(id)).error, 'OWNER_CANCELLED');
});

for (const decision of ['COUNCIL_UNAVAILABLE', 'INSUFFICIENT_REVIEWERS']) test(`real review persistence retains an unavailable verification for retry: ${decision}`, async t => {
  const { DB, repository, id } = await fixture(t);
  const result = await reviewVerificationEvidence({ DB }, {
    job: await repository.get(id), implementation: { candidate_sha: SHA }, ciRunId: 4242,
    review: async () => ({ decision, reviews: [] }),
  });
  assert.equal(result.decision, decision);
  assert.equal((await repository.get(id)).status, 'TEACHER_APPROVED');
  await persistVerificationWait(repository, id, { code: result.decision, ciRunId: 4242, candidateSha: SHA });
  assert.equal((await repository.get(id)).result_json.verify_existing.status, 'WAITING_VERIFICATION');
  const persisted = await DB.prepare('SELECT status FROM dev_bridge_state WHERE bridge_id=?').bind(`council-review:verify:${id}:${SHA}`).first();
  assert.equal(persisted.status, decision);
});

test('retryable Mentor provider failures receive a persistent bounded deferral', async () => {
  const { providerDeferral } = await import('../src/evolution/autonomy-runtime-core.js');
  const now = 1792749000000;
  for (const code of ['MENTOR_PROVIDER_TIMEOUT','MENTOR_NO_VALID_CODE_PROPOSAL','MENTOR_JSON_INVALID','MENTOR_JSON_REQUIRED','COUNCIL_INSUFFICIENT_RESPONSES','COUNCIL_REVIEW_DEADLINE']) {
    const result = providerDeferral(code, now);
    assert.equal(result.code, code);
    assert.equal(result.retry_after, now + 300000);
  }
  assert.equal(providerDeferral('MENTOR_UNINSPECTED_EDIT', now), null);
});

for (const phase of ['implementation','bridge']) test(`diagnostic deferral ownership and safe CAS recovery: ${phase}`, async t => {
  const { persistImplementationDiagnostic, persistBridgePreparationDiagnostic } = await import('../src/evolution/autonomy-runtime-core.js');
  const persist = phase === 'bridge' ? persistBridgePreparationDiagnostic : persistImplementationDiagnostic;
  const other = phase === 'bridge' ? persistImplementationDiagnostic : persistBridgePreparationDiagnostic;
  const { repository, id } = await fixture(t);
  await persist(repository,id,{status:'NOT_READY',code:'MENTOR_PROVIDER_TIMEOUT'});
  const first = await repository.get(id);
  assert.equal(first.result_json.autonomy_deferral.phase,phase);
  await other(repository,id,{status:'READY'});
  assert.deepEqual((await repository.get(id)).result_json.autonomy_deferral,first.result_json.autonomy_deferral);
  await persist(repository,id,{status:'NOT_READY',code:'MENTOR_UNINSPECTED_EDIT'});
  assert.equal((await repository.get(id)).result_json.autonomy_deferral,undefined,'nonreportable error clears its obsolete delay');
  let calls=0;
  const concurrent={get:repository.get.bind(repository),async update(jobId,patch,options){
    calls++;
    if(calls===1) await repository.update(jobId,{result_json:{...(await repository.get(jobId)).result_json,unrelated:'preserved'}});
    return repository.update(jobId,patch,options);
  }};
  await persist(concurrent,id,{status:'NOT_READY',code:'MENTOR_JSON_INVALID'});
  assert.equal(calls,2,'one CAS retry of persistence only');
  assert.equal((await repository.get(id)).result_json.unrelated,'preserved');
  calls=0;
  const claimed={get:repository.get.bind(repository),async update(jobId,patch,options){
    calls++;
    await repository.update(jobId,{status:'CLAIMED',result_json:{...(await repository.get(jobId)).result_json,dev_bridge:{github_run_id:4242}}});
    return repository.update(jobId,patch,options);
  }};
  await persist(claimed,id,{status:'NOT_READY',code:'MENTOR_JSON_REQUIRED'});
  assert.equal(calls,1,'a newer Bridge transition is never retried or overwritten');
  assert.equal((await repository.get(id)).status,'CLAIMED');
  assert.equal((await repository.get(id)).result_json.dev_bridge.github_run_id,4242);
});

test('retry code matching rejects invented prefix extensions and structural failures', async () => {
  const {providerDeferral}=await import('../src/evolution/autonomy-runtime-core.js');
  for(const code of ['MENTOR_PROVIDER_TIMEOUT_UNSAFE','MENTOR_JSON_INVALID_EXTRA','NO_ELIGIBLE_MISSION','MENTOR_UNINSPECTED_PATH','MENTOR_INVALID_CHANGE']) assert.equal(providerDeferral(code),null,code);
});

test('three identical provider retries rotate the mission without a fourth attempt, then wake on new context', async t => {
  const {persistBridgePreparationDiagnostic}=await import('../src/evolution/autonomy-runtime-core.js');
  const {repository,id}=await fixture(t);
  const now=Date.now;
  let clock=now();
  try {
    Date.now=()=>clock;
    for(let attempt=1;attempt<=3;attempt++) {
      await persistBridgePreparationDiagnostic(repository,id,{status:'NOT_READY',code:'MENTOR_PROVIDER_TIMEOUT'});
      const delay=(await repository.get(id)).result_json.autonomy_deferral;
      assert.equal(delay.attempts,attempt);
      assert.equal(delay.exhausted,attempt===3);
      clock=delay.retry_after+1;
    }
    const roadmap=[{id:'MEL-FOUNDER-01',title:'A',status:'IN_PROGRESS',priority:'P0'},
      {id:'MEL-FOUNDER-02',title:'B',status:'PLANNED',priority:'P0'}];
    const supervisor=new AutonomySupervisor({repository,roadmap});
    const rotated=await supervisor.ensureNextJob();
    assert.equal(rotated.created,true,'one unrelated roadmap mission should progress after exhaustion');
    assert.equal(rotated.job.optional_context.roadmap_id,'MEL-FOUNDER-02');
    assert.equal((await repository.list()).length,2);
    assert.equal((await repository.get(id)).result_json.autonomy_deferral.attempts,3,
      'the parked objective must retain its exact provider failure budget');
    assert.equal((await supervisor.ensureNextJob()).job.id,rotated.job.id,
      'one runnable internal job still owns the single-flight slot');
    await repository.update(rotated.job.id,{status:'COMPLETED'});
    supervisor.roadmap=[roadmap[0]];
    const parked=await supervisor.ensureNextJob();
    assert.equal(parked.job,null,'expiry alone cannot grant unlimited identical retries');
    assert.equal(parked.external_progress.reason,'PROVIDER_EXHAUSTED_CONTEXT_REQUIRED');
    const current=await repository.get(id);
    await repository.update(id,{result_json:{...current.result_json,implementation_proposal:{...current.result_json.implementation_proposal,candidate_sha:'b'.repeat(40)}}});
    assert.equal((await supervisor.ensureNextJob()).job.id,id,'changed context can be selected, without bypassing runtime SHA gate');
    await persistBridgePreparationDiagnostic(repository,id,{status:'NOT_READY',code:'MENTOR_PROVIDER_TIMEOUT'});
    assert.equal((await repository.get(id)).result_json.autonomy_deferral.attempts,1);
  } finally {Date.now=now;}
});
