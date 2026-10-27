import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';
import { AutonomySupervisor, selectActionableAutonomyJob } from '../src/evolution/autonomy-supervisor.js';
import { setAutonomyControl } from '../src/evolution/autonomy-control.js';
import { tryAcquireAutonomyRuntimeLease, releaseAutonomyRuntimeLease } from '../src/evolution/autonomy-runtime-lease.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';
const SHA = 'a'.repeat(40);
const BRANCH = 'candidate/mel-clean-autonomy';
const ROADMAP = [{ id: 'TEST-EPOCH-01', title: 'Current activity only', status: 'PLANNED', priority: 'P0' }];

async function fixture({ maxAutonomy = false, roadmap = ROADMAP } = {}) {
  const DB = sqliteD1();
  const repository = new D1DevJobRepository(DB);
  await setAutonomyControl(DB, { paused: false, max_autonomy: maxAutonomy, launch_approved_sha: SHA });
  let epoch = Date.now() - 1000;
  let replies = '';
  let providerCalls = 0;
  let forbiddenSearches = 0;
  const env = {
    DB,
    MEL_DEPLOYED_GIT_SHA: SHA,
    MEL_CANONICAL_CANDIDATE_SHA: SHA,
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_GITHUB_BRANCH: BRANCH,
    MEL_TEACHER_BRANCH: BRANCH,
    AI: { async run(model) { providerCalls++; return { response: `FICHIERS: src/evolution/autonomy-runtime.js\nCHANGEMENTS: bounded proposal from ${model}\nREUTILISATION: existing scheduler\nTESTS: npm test\nRISQUES: low\nROLLBACK: revert\nCRITERES_DE_FIN: green CI` }; } },
  };
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes('teacher-bridge/replies.jsonl')) return new Response(replies);
    if (target.includes('teacher-bridge/completions.jsonl')) return new Response('');
    if (target.includes('/commits/candidate%2Fmel-clean-autonomy')) return Response.json({ sha: SHA });
    if (target.startsWith('https://api.github.com/')) { forbiddenSearches++; return new Response('fixture restricted', { status: 403 }); }
    if (target.startsWith('https://raw.githubusercontent.com/')) return new Response('export const fixture = true;\n// immutable inspected source\n');
    return new Response('not found', { status: 404 });
  };
  async function saveEpoch(value = epoch) {
    epoch = value;
    await DB.prepare(`INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,'RESET','{}')
      ON CONFLICT(bridge_id) DO UPDATE SET last_seen=excluded.last_seen`).bind('activity-list-epoch', epoch).run();
  }
  async function oldJob(id, status = 'QUEUED', extra = {}) {
    await repository.create({ id, requested_by: 'mel-autonomy', goal: id, optional_context: { roadmap_id: 'OLD-' + id } });
    await repository.update(id, { status, ...extra });
    await DB.prepare('UPDATE dev_jobs SET created_at=?,updated_at=? WHERE id=?').bind(epoch - 2000, epoch - 1000, id).run();
    return repository.get(id);
  }
  const tick = (options = {}) => runAutonomyRuntimeTick(env, { repository, fetchImpl, roadmap, ...options });
  await saveEpoch();
  return { DB, repository, env, tick, oldJob, saveEpoch, get epoch() { return epoch; }, get providerCalls() { return providerCalls; }, get forbiddenSearches() { return forbiddenSearches; }, setReplies(value) { replies = value; } };
}

test('the real runtime ignores old approved/queued work and preserves its journal', async () => {
  const f = await fixture();
  try {
    const before = [await f.oldJob('old-approved', 'TEACHER_APPROVED'), await f.oldJob('old-queued')];
    const result = await f.tick();
    assert.equal(result.ok, true);
    assert.equal(result.job.roadmap_id, ROADMAP[0].id);
    assert.equal(result.job.status, 'WAITING_TEACHER');
    assert.deepEqual(await Promise.all(before.map(job => f.repository.get(job.id))), before);
  } finally { f.DB.close(); }
});

test('resetting activity cannot resurrect a deterministic job id from a previous epoch', async () => {
  const f = await fixture();
  try {
    const id = 'mel-autonomy-test-epoch-01-1';
    const old = await f.oldJob(id, 'CANCELLED', { error: 'ACTIVITY_LIST_RESET' });
    await f.DB.prepare('UPDATE dev_jobs SET optional_context=? WHERE id=?').bind(JSON.stringify({ roadmap_id: ROADMAP[0].id }), id).run();
    const result = await f.tick();
    assert.notEqual(result.job?.id, old.id);
    assert.equal(result.job?.status, 'WAITING_TEACHER');
    assert.equal((await f.repository.get(old.id)).status, 'CANCELLED');
    const again = await f.tick();
    assert.equal(again.job?.id, result.job.id);
    assert.equal(again.ensured.created, false);
    assert.equal((await f.repository.list()).length, 2);
  } finally { f.DB.close(); }
});

for (const stale of [true, false]) {
  test(`${stale ? 'stale Teacher reconciliation' : 'MAX approval'} cannot restart a real waiting job from before reset`, async () => {
    const f = await fixture();
    try {
      const first = await f.tick();
      await f.saveEpoch(Date.now() - 1);
      await f.DB.prepare('UPDATE dev_jobs SET created_at=?,updated_at=? WHERE id=?').bind(f.epoch - 2000, f.epoch - 1000, first.job.id).run();
      const old = await f.repository.get(first.job.id);
      if (stale) f.env.MEL_CANONICAL_CANDIDATE_SHA = 'b'.repeat(40);
      await setAutonomyControl(f.DB, { max_autonomy: true });
      const result = await f.tick();
      assert.deepEqual(await f.repository.get(old.id), old);
      assert.ok(!result.reconciliation?.stale?.some(row => row.job_id === old.id));
      assert.ok(!result.owner_max_sweep?.applied?.some(row => row.job_id === old.id));
      assert.ok(!result.internal_teacher_mirror?.mirrored?.some(row => row.job_id === old.id));
      assert.notEqual(result.job?.id, old.id);
    } finally { f.DB.close(); }
  });
}

test('a current job resumes with its journal and the runtime releases its lease on each tick', async () => {
  const f = await fixture();
  try {
    const first = await f.tick();
    const requestId = first.teacher.request_id;
    f.setReplies(JSON.stringify({ kind: 'TEACHER_REPLY', request_id: requestId, target_sha: SHA, verdict: 'APPROVE_PLAN', feedback: 'Proceed on exact candidate.' }));
    const second = await f.tick();
    assert.equal(second.job.id, first.job.id);
    assert.equal(second.job.status, 'TEACHER_APPROVED');
    assert.equal(second.bridge_preparation.code, 'MENTOR_NO_VALID_CODE_PROPOSAL');
    const before = await f.repository.get(first.job.id);
    assert.ok(before.result_json.bridge_preparation_diagnostic.mentor_failure_codes.every(row => row.code === 'MENTOR_JSON_REQUIRED'));
    assert.ok(f.forbiddenSearches > 0, 'restricted GitHub fixture was exercised');
    const calls = f.providerCalls;
    const third = await f.tick();
    assert.equal(third.job, null);
    assert.equal(third.progress.block_reason, 'DEFERRED_PROVIDER_RETRY_PENDING');
    assert.equal(third.progress.waiting_external, true);
    assert.equal(f.providerCalls, calls, 'deferred tick must not call Mentor or Council again');
    assert.deepEqual(await f.repository.get(first.job.id), before, 'job and journal persist unchanged');
    const now = Date.now;
    try {
      Date.now = () => before.result_json.autonomy_deferral.retry_after + 1;
      const resumed = await f.tick();
      assert.equal(resumed.job.id, first.job.id);
      assert.ok(f.providerCalls > calls, 'provider retry is allowed after expiry');
    } finally { Date.now = now; }
    assert.equal((await f.repository.list()).length, 1);
    const stored = await f.repository.get(first.job.id);
    assert.equal(stored.result_json.teacher_bridge.review.request_id, requestId);
    assert.equal(stored.result_json.autonomy_proofs.work_dag_resume.status, 'VERIFIED');
    const lease = await tryAcquireAutonomyRuntimeLease({ db: f.DB, owner: 'after-ticks' });
    assert.equal(lease.acquired, true);
    await releaseAutonomyRuntimeLease({ db: f.DB, owner: 'after-ticks' });
  } finally { f.DB.close(); }
});

test('a busy lease reports only current work without selecting or changing historical work', async () => {
  const f = await fixture();
  try {
    const old = await f.oldJob('old-approved', 'TEACHER_APPROVED');
    await tryAcquireAutonomyRuntimeLease({ db: f.DB, owner: 'holder' });
    const result = await f.tick({ runtimeLeaseOwner: 'contender' });
    assert.equal(result.status, 'SKIPPED_LEASE_BUSY');
    assert.equal(result.progress.active_jobs, 0);
    assert.equal(result.progress.job_id, null);
    assert.equal(result.progress.next_roadmap_id, ROADMAP[0].id);
    assert.deepEqual(await f.repository.get(old.id), old);
    await releaseAutonomyRuntimeLease({ db: f.DB, owner: 'holder' });
    assert.equal((await f.tick()).job.roadmap_id, ROADMAP[0].id);
  } finally { f.DB.close(); }
});

test('a transient core failure is attributed to the current job, then resumes it after the lease is released', async () => {
  const f = await fixture();
  try {
    const old = await f.oldJob('old-approved', 'TEACHER_APPROVED');
    const current = await f.repository.create({ id: 'current-queued', requested_by: 'mel-autonomy', goal: 'current work', optional_context: { roadmap_id: ROADMAP[0].id } });
    let reads = 0;
    const repository = Object.create(f.repository);
    repository.list = async () => {
      reads += 1;
      if (reads === 3) throw Object.assign(new Error('TRANSIENT_STATE_READ'), { code: 'TRANSIENT_STATE_READ' });
      return f.repository.list();
    };
    const failed = await f.tick({ repository });
    assert.equal(failed.status, 'CORE_RETRY_PENDING');
    assert.equal(failed.retry.job_id, current.id);
    assert.equal(failed.retry.attempts, 1);
    assert.deepEqual(await f.repository.get(old.id), old);
    const resumed = await f.tick();
    assert.equal(resumed.job.id, current.id);
    assert.equal(resumed.job.status, 'WAITING_TEACHER');
    assert.equal((await f.repository.list()).length, 2);
  } finally { f.DB.close(); }
});

test('a write conflict is not a job failure: it never quarantines a healthy job', async () => {
  const f = await fixture();
  try {
    const current = await f.repository.create({ id: 'current-queued', requested_by: 'mel-autonomy', goal: 'current work', optional_context: { roadmap_id: ROADMAP[0].id } });
    let reads = 0;
    const repository = Object.create(f.repository);
    repository.list = async () => {
      reads += 1;
      if (reads % 3 === 0) throw Object.assign(new Error('JOB_UPDATE_CONFLICT'), { code: 'JOB_UPDATE_CONFLICT' });
      return f.repository.list();
    };
    for (let i = 0; i < 4; i += 1) {
      reads = 0;
      const tick = await f.tick({ repository });
      assert.equal(tick.status, 'CORE_RETRY_PENDING');
      assert.equal(tick.retry.quarantined, false);
    }
    const stored = await f.repository.get(current.id);
    assert.notEqual(stored.status, 'FAILED');
    assert.equal(stored.result_json?.runtime_retry, undefined, 'a conflict does not count as a failed attempt');
  } finally { f.DB.close(); }
});

test('the supervisor creates one job per objective in each epoch without reusing an older primary key', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const original = await new AutonomySupervisor({ repository, roadmap: ROADMAP }).ensureNextJob();
  await repository.update(original.job.id, { created_at: 1000, status: 'CANCELLED' });
  const supervisor = new AutonomySupervisor({ repository, roadmap: ROADMAP, epochMs: 4000 });
  const results = await Promise.all([supervisor.ensureNextJob(), supervisor.ensureNextJob()]);
  assert.equal(results.filter(result => result.created).length, 1);
  assert.notEqual(results[0].job.id, original.job.id);
  assert.equal(results[0].job.id, results[1].job.id);
  assert.equal((await supervisor.ensureNextJob()).job.id, results[0].job.id);
  assert.equal((await repository.list()).length, 2);
});

test('the epoch includes new work at the reset instant but never cancelled work', () => {
  const row = { id: 'boundary', status: 'QUEUED', created_at: 4000, requested_by: 'mel-autonomy' };
  assert.equal(selectActionableAutonomyJob([row], { epochMs: 4000 }).id, row.id);
  assert.equal(selectActionableAutonomyJob([{ ...row, created_at: 3999 }], { epochMs: 4000 }), null);
  assert.equal(selectActionableAutonomyJob([{ ...row, status: 'CANCELLED', created_at: 5000 }], { epochMs: 4000 }), null);
  assert.equal(selectActionableAutonomyJob([{ ...row, created_at: 4001 }], { epochMs: 4000 }).id, row.id);
});

test('a job created in the same millisecond as the epoch resumes without creating a second job', async () => {
  const f = await fixture();
  const originalNow = Date.now;
  try {
    // A reset and the first admission can share the same clock resolution.
    Date.now = () => f.epoch;
    const first = await f.tick();
    assert.equal((await f.repository.get(first.job.id)).created_at, f.epoch);
    const second = await f.tick();
    assert.equal(second.job.id, first.job.id);
    assert.equal(second.ensured.created, false);
    assert.equal((await f.repository.list()).length, 1);
  } finally {
    Date.now = originalNow;
    f.DB.close();
  }
});

test('an unreadable activity epoch cannot make historical jobs actionable', async () => {
  const f = await fixture();
  try {
    const old = await f.oldJob('old-approved', 'TEACHER_APPROVED');
    f.env.DB = {
      ...f.DB,
      prepare(sql) {
        if (sql.startsWith('SELECT last_seen FROM dev_bridge_state')) {
          return { bind() { return { async first() { throw new Error('fixture epoch read unavailable'); } }; } };
        }
        return f.DB.prepare(sql);
      },
    };
    await assert.rejects(() => f.tick(), { code: 'ACTIVITY_EPOCH_READ_FAILED' });
    assert.deepEqual(await f.repository.get(old.id), old);
    assert.equal((await f.repository.list()).length, 1);
  } finally { f.DB.close(); }
});


test('a real runtime tick advances B while Mentor A remains durably deferred', async () => {
  const f=await fixture({roadmap:[...ROADMAP,{id:'TEST-EPOCH-02',title:'Independent B',status:'PLANNED',priority:'P0'}]});
  try {
    const first=await f.tick();
    f.setReplies(JSON.stringify({kind:'TEACHER_REPLY',request_id:first.teacher.request_id,target_sha:SHA,verdict:'APPROVE_PLAN',feedback:'Proceed on exact candidate.'}));
    await f.tick();
    const a=await f.repository.get(first.job.id);
    assert.equal(a.result_json.autonomy_deferral.code,'MENTOR_NO_VALID_CODE_PROPOSAL');
    const next=await f.tick();
    assert.equal(next.job.roadmap_id,'TEST-EPOCH-02');
    assert.equal(next.job.status,'WAITING_TEACHER');
    assert.deepEqual(await f.repository.get(a.id),a);
    const lease=await tryAcquireAutonomyRuntimeLease({db:f.DB,owner:'after-independent-tick'});
    assert.equal(lease.acquired,true);
    await releaseAutonomyRuntimeLease({db:f.DB,owner:'after-independent-tick'});
  } finally {f.DB.close();}
});


test('focused MAX pass never starts another mission or revives a cancelled target', async () => {
  const f = await fixture({maxAutonomy:true});
  try {
    const target = await f.repository.create({id:'focused-target',requested_by:'mel-autonomy',goal:'target',optional_context:{roadmap_id:ROADMAP[0].id}});
    const other = await f.repository.create({id:'unrelated',requested_by:'mel-autonomy',goal:'untouched',optional_context:{roadmap_id:'TEST-OTHER'}});
    const before = await f.repository.get(other.id);
    await f.tick({onlyJobId:target.id});
    assert.deepEqual(await f.repository.get(other.id),before);
    assert.equal((await f.repository.list()).length,2);
    await f.repository.update(target.id,{status:'CANCELLED',error:'ACTIVITY_LIST_RESET'});
    const cancelled=await f.repository.get(target.id);
    await f.tick({onlyJobId:target.id});
    assert.deepEqual(await f.repository.get(target.id),cancelled);
    assert.deepEqual(await f.repository.get(other.id),before);
    assert.equal((await f.repository.list()).length,2);
  } finally {f.DB.close();}
});


test('a timed-out MAX pass reports its actual queued mission instead of a false IDLE watchdog', async () => {
  const f = await fixture({maxAutonomy:true});
  let release;
  const gate = new Promise(resolve=>{release=resolve;});
  const original = f.env.AI.run;
  f.env.AI.run = async (...args)=>{await gate;return original(...args);};
  try {
    const job=await f.repository.create({id:'timeout-current',requested_by:'mel-autonomy',goal:'current objective',optional_context:{roadmap_id:ROADMAP[0].id}});
    const tick=await f.tick({tickBudgetMs:10});
    assert.equal(tick.status,'TICK_TIMEOUT');
    assert.equal(tick.progress.work_remaining,true);
    assert.equal(tick.progress.active_jobs,1);
    assert.equal(tick.progress.job_id,job.id);
    assert.equal(tick.watchdog.status,'NO_PROGRESS');
    assert.equal(tick.watchdog.counters.blocked_ticks,1);
  } finally {
    release();
    // Allow the uncancelled pre-existing callback to finish before closing D1.
    await new Promise(resolve=>setTimeout(resolve,100));
    f.DB.close();
  }
});
