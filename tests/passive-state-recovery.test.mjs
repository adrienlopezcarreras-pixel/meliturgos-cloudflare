import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { recoverPassiveRuntimeStates } from '../src/evolution/passive-state-recovery.js';

const OLD_SHA = '1111111111111111111111111111111111111111';
const NEW_SHA = '2222222222222222222222222222222222222222';

test('stale WAITING_TEACHER is requeued against the deployed candidate SHA', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'owner-chat-stale', requested_by: 'owner-chat', goal: 'stale teacher' });
  await repository.update(job.id, {
    status: 'WAITING_TEACHER',
    result_json: {
      teacher_bridge: {
        status: 'WAITING_TEACHER',
        request: { request_id: 'req-old', target_sha: OLD_SHA, candidate: { branch: 'candidate/mel-clean-autonomy', sha: OLD_SHA } },
      },
    },
  });
  const result = await recoverPassiveRuntimeStates(repository, { canonicalSha: NEW_SHA });
  assert.equal(result.recovered.length, 1);
  const stored = await repository.get(job.id);
  assert.equal(stored.status, 'QUEUED');
  assert.equal(stored.result_json.teacher_bridge, null);
  assert.equal(stored.plan_json.revision.current_candidate_sha, NEW_SHA);
});

test('orphan READY_FOR_REVIEW without Teacher chain is requeued instead of remaining passive forever', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'owner-goal-orphan', requested_by: 'owner-chat', goal: 'orphan review' });
  await repository.update(job.id, { status: 'READY_FOR_REVIEW', result_json: {} });
  const result = await recoverPassiveRuntimeStates(repository, { canonicalSha: NEW_SHA });
  assert.equal(result.recovered.length, 1);
  const stored = await repository.get(job.id);
  assert.equal(stored.status, 'QUEUED');
  assert.equal(stored.result_json.passive_state_recovery.reason, 'TEACHER_APPROVAL_MISSING');
});

test('valid READY_FOR_REVIEW with approved Teacher and dev package stays untouched', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'owner-goal-valid', requested_by: 'owner-chat', goal: 'valid review' });
  await repository.update(job.id, {
    status: 'READY_FOR_REVIEW',
    result_json: {
      teacher_bridge: { status: 'ANSWERED', review: { verdict: 'APPROVE_PLAN', development_allowed: true } },
      dev_bridge: { status: 'READY_FOR_REVIEW', needs_repair: false },
    },
  });
  const result = await recoverPassiveRuntimeStates(repository, { canonicalSha: NEW_SHA });
  assert.equal(result.recovered.length, 0);
  assert.equal((await repository.get(job.id)).status, 'READY_FOR_REVIEW');
});

test('exhausted approved Mentor work wakes only on a new deployed SHA and preserves a concurrent claim', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job=await repository.create({id:'mentor-exhausted',requested_by:'mel-autonomy',goal:'persistent A'});
  const result={teacher_bridge:{status:'ANSWERED',request:{request_id:'review-A',target_sha:OLD_SHA},review:{verdict:'APPROVE_PLAN',development_allowed:true,target_sha:OLD_SHA}},
    implementation_proposal:{candidate_sha:OLD_SHA},autonomy_deferral:{exhausted:true,attempts:3},preserved:'journal'};
  await repository.update(job.id,{status:'TEACHER_APPROVED',result_json:result});
  const before=structuredClone(await repository.get(job.id));
  assert.equal((await recoverPassiveRuntimeStates(repository,{canonicalSha:OLD_SHA})).recovered.length,0);
  assert.deepEqual(await repository.get(job.id),before);
  assert.equal((await recoverPassiveRuntimeStates(repository,{canonicalSha:NEW_SHA})).recovered.length,1);
  const recovered=await repository.get(job.id);
  assert.equal(recovered.status,'QUEUED');
  assert.equal(recovered.result_json.autonomy_deferral,undefined);
  assert.equal(recovered.result_json.implementation_proposal,undefined);
  assert.equal(recovered.result_json.teacher_bridge,null,'fresh Council/Teacher review is required');
  assert.equal(recovered.result_json.preserved,'journal');
  assert.equal(recovered.result_json.teacher_bridge_history.length,1);
  await repository.update(job.id,{status:'TEACHER_APPROVED',result_json:result});
  const racing={list:repository.list.bind(repository),async update(id,patch,options){
    await repository.update(id,{status:'CLAIMED',result_json:{...result,dev_bridge:{github_run_id:4242}}});
    return repository.update(id,patch,options);
  }};
  const conflict=await recoverPassiveRuntimeStates(racing,{canonicalSha:NEW_SHA});
  assert.equal(conflict.recovered.length,0);
  assert.equal(conflict.failed[0].code,'JOB_UPDATE_CONFLICT');
  assert.equal((await repository.get(job.id)).status,'CLAIMED');
});


test('passive recovery prioritizes orphan reviews beyond unrelated queue entries', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  for (let i = 0; i < 5; i++) await repository.create({ id: `unrelated-${i}`, requested_by: 'owner-chat', goal: 'unrelated queued work' });
  const orphan = await repository.create({ id: 'manifest-review-orphan', requested_by: 'owner-chat', goal: 'manifest review' });
  await repository.update(orphan.id, { status: 'READY_FOR_REVIEW', result_json: {} });
  const result = await recoverPassiveRuntimeStates(repository, { canonicalSha: NEW_SHA, limit: 1 });
  assert.equal(result.recovered.length, 1);
  assert.equal(result.recovered[0].job_id, orphan.id);
  assert.equal((await repository.get(orphan.id)).status, 'QUEUED');
});


test('orphan review recovery must not overwrite a concurrent runtime claim', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const orphan = await repository.create({ id: 'review-race', requested_by: 'owner-chat', goal: 'race recovery' });
  await repository.update(orphan.id, { status: 'READY_FOR_REVIEW', result_json: {} });
  const racing = {
    list: repository.list.bind(repository),
    async update(id, patch, options) {
      await repository.update(id, { status: 'CLAIMED', result_json: { runner: 'active' } });
      return repository.update(id, patch, options);
    },
  };
  const result = await recoverPassiveRuntimeStates(racing, { canonicalSha: NEW_SHA });
  assert.equal(result.recovered.length, 0);
  assert.equal(result.failed[0].code, 'JOB_UPDATE_CONFLICT');
  assert.equal((await repository.get(orphan.id)).status, 'CLAIMED');
  assert.equal((await repository.get(orphan.id)).result_json.runner, 'active');
});


test('maintenance finds old active manifest work beyond the 100-row D1 UI window', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const manifest = await repository.create({ id: 'old-manifest', requested_by: 'mel-autonomy', goal: 'manifest report', optional_context: { roadmap_id: 'MEL-MANIFEST-01' } });
  await repository.update(manifest.id, { status: 'READY_FOR_REVIEW', result_json: {} });
  for (let i = 0; i < 105; i++) {
    await repository.create({ id: `recent-ui-${i}`, requested_by: 'owner-chat', goal: 'unrelated queue item' });
  }
  const view = {
    list: async () => (await repository.list()).slice(-100),
    listActiveAutonomyJobs: repository.listActiveAutonomyJobs.bind(repository),
    update: repository.update.bind(repository),
  };
  const result = await recoverPassiveRuntimeStates(view, { canonicalSha: NEW_SHA, limit: 1 });
  assert.equal(result.recovered.length, 1);
  assert.equal(result.recovered[0].job_id, manifest.id);
  assert.equal((await repository.get(manifest.id)).status, 'QUEUED');
});


test('clearing the list during orphan review recovery never requeues or reports cancelled work', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'cleared-review', requested_by: 'mel-autonomy', goal: 'cleared review' });
  await repository.update(job.id, { status: 'READY_FOR_REVIEW', result_json: {} });
  const view = {
    list: repository.list.bind(repository),
    listActiveAutonomyJobs: repository.listActiveAutonomyJobs.bind(repository),
    async update(id, patch, options) {
      await repository.update(id, { status: 'CANCELLED' });
      return repository.update(id, patch, options);
    },
  };
  const result = await recoverPassiveRuntimeStates(view, { canonicalSha: NEW_SHA });
  assert.equal(result.recovered.length, 0);
  assert.equal(result.failed.length, 0);
  assert.equal((await repository.get(job.id)).status, 'CANCELLED');
});

test('clearing the list during stale Teacher recovery never reports cancelled work', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'cleared-teacher', requested_by: 'mel-autonomy', goal: 'cleared teacher' });
  await repository.update(job.id, { status: 'WAITING_TEACHER', result_json: {
    teacher_bridge: { status: 'WAITING_TEACHER', request: { request_id: 'stale', target_sha: OLD_SHA } },
  } });
  const view = {
    list: repository.list.bind(repository),
    listActiveAutonomyJobs: repository.listActiveAutonomyJobs.bind(repository),
    async update(id, patch, options) {
      await repository.update(id, { status: 'CANCELLED' });
      return repository.update(id, patch, options);
    },
  };
  const result = await recoverPassiveRuntimeStates(view, { canonicalSha: NEW_SHA });
  assert.equal(result.recovered.length, 0);
  assert.equal(result.failed.length, 0);
  assert.equal((await repository.get(job.id)).status, 'CANCELLED');
});
