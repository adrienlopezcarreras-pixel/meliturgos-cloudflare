import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';
import { approveAllWaitingTeachersUnderOwnerMax, mirrorAllWaitingInternalTeachers } from '../src/evolution/autonomy-runtime.js';
import { buildAutonomyActivity } from '../src/evolution/autonomy-activity.js';
import { currentAutonomyRepository } from '../src/evolution/autonomy-runtime-core.js';
import { reconcileRuntimeTeacherReplies } from '../src/teachers/github-reply-reconciler.js';

function waiting(id, created_at) {
  const sha = 'a'.repeat(40);
  return { id, requested_by: 'mel-autonomy', goal: id, created_at, updated_at: created_at,
    status: 'WAITING_TEACHER', optional_context: { source: 'error-ledger' },
    result_json: { teacher_bridge: { status: 'WAITING_TEACHER',
      evidence: { candidate_sha: sha }, request: { request_id: 'req-' + id,
        target_sha: sha, stage: 'TEACHER_REVIEW_REQUIRED',
        candidate: { branch: 'candidate/mel-clean-autonomy', sha },
        provenance: { source: 'MEL_RUNTIME_CRON' } } } } };
}

test('MAX approves only the current internal mission; an existing passive repair is untouched', async () => {
  const jobs = [waiting('manifest', 10), waiting('error-ledger-new', 20)];
  const repo = new D1DevJobRepository(null, { memoryStore: new Map(jobs.map(job => [job.id, job])) });
  const before = structuredClone(await repo.get('error-ledger-new'));
  const result = await approveAllWaitingTeachersUnderOwnerMax(repo);
  assert.deepEqual(result.applied.map(row => row.job_id), ['manifest']);
  assert.deepEqual(await repo.get('error-ledger-new'), before);
});

test('a stale Teacher reply scan cannot requeue the passive mission', async () => {
  const jobs = [waiting('manifest', 10), waiting('error-ledger-new', 20)];
  const repo = new D1DevJobRepository(null, { memoryStore: new Map(jobs.map(job => [job.id, job])) });
  const before = structuredClone(await repo.get('error-ledger-new'));
  await reconcileRuntimeTeacherReplies({
    repository: currentAutonomyRepository(repo, 0, { singleFlight: true }),
    env: { MEL_CANONICAL_CANDIDATE_SHA: 'b'.repeat(40) },
    fetchImpl: async () => new Response(''),
  });
  assert.equal((await repo.get('manifest')).status, 'QUEUED');
  assert.deepEqual(await repo.get('error-ledger-new'), before);
});

test('activity shows the current Teacher stage and a passive repair, including beyond the recent UI window', async () => {
  const jobs = [waiting('manifest', 10), { ...waiting('error-ledger-new', 20), status: 'TEACHER_APPROVED' }];
  const db = { prepare(sql) { const st = { bind() { return st; }, async run() { return {}; }, async all() { return { results: [] }; }, async first() { return sql.startsWith('SELECT status,last_seen,metadata_json FROM dev_bridge_state') ? { status: 'MAX_AUTONOMY', last_seen: 100, metadata_json: JSON.stringify({ paused: false, max_autonomy: true }) } : null; } }; return st; } };
  const result = await buildAutonomyActivity({ DB: db }, { now: 100, repository: {
    list: async () => [jobs[1]], listActiveAutonomyJobs: async () => jobs,
  } });
  assert.equal(result.counts.active, 1);
  assert.equal(result.counts.waiting, 1);
  assert.equal(result.jobs.find(job => job.id === 'manifest').queue_state, 'ACTIVE');
  assert.equal(result.jobs.find(job => job.id === 'error-ledger-new').queue_state, 'WAITING');
});

test('a focused PC or cloud continuation cannot bypass the current internal mission', async () => {
  const jobs = [waiting('manifest', 10), { ...waiting('error-ledger-new', 20), status: 'TEACHER_APPROVED' }];
  const repo = new D1DevJobRepository(null, { memoryStore: new Map(jobs.map(job => [job.id, job])) });
  const result = await new AutonomySupervisor({ repository: repo, roadmap: [], onlyJobId: 'error-ledger-new' }).ensureNextJob();
  assert.equal(result.job, null);
  assert.equal(result.external_progress.status, 'AUTONOMY_SINGLE_FLIGHT_BUSY');
  assert.equal(result.external_progress.job_id, 'manifest');
});

test('Teacher transport does not submit a second passive internal mission', async () => {
  const jobs = [waiting('manifest', 10), waiting('error-ledger-new', 20)];
  const repo = new D1DevJobRepository(null, { memoryStore: new Map(jobs.map(job => [job.id, job])) });
  const result = await mirrorAllWaitingInternalTeachers({ repository: repo, fetchImpl: async () => new Response('', { status: 403 }) });
  assert.equal(result.attempted, 1);
  assert.ok([...result.mirrored, ...result.failed].every(row => row.job_id === 'manifest'));
});

for (const persistent of [false, true]) test(`existing passive repair cannot be claimed by either Bridge (${persistent ? 'SQLite' : 'memory'})`, async () => {
  const db = persistent ? sqliteD1() : null;
  const repo = new D1DevJobRepository(db);
  try {
    // Legacy rows deliberately predate the admission fix: seed two unscoped
    // records, then restore the exact persisted stages observed in the incident.
    const old = await repo.create({ id: 'manifest', requested_by: 'mel-autonomy', goal: 'manifest' });
    const repair = await repo.create({ id: 'repair', requested_by: 'mel-autonomy', goal: 'repair' });
    await repo.update(old.id, { status: 'WAITING_TEACHER', created_at: 10 });
    await repo.update(repair.id, { status: 'TEACHER_APPROVED', created_at: 20,
      files_json: [{ path: 'src/test.js', content: 'export const x = 1;' }],
      tests_json: [{ command: 'npm test' }], result_json: {
        teacher_bridge: { status: 'ANSWERED', request: { request_id: 'req' },
          review: { request_id: 'req', verdict: 'APPROVE_PLAN', development_allowed: true } },
        bridge_preparation: { status: 'READY', teacher_request_id: 'req',
          candidate_branch: 'candidate/mel-clean-autonomy', candidate_sha: 'a'.repeat(40) },
      } });
    const before = await repo.get(repair.id);
    assert.equal(await repo.claimPrepared(repair.id), null);
    assert.equal(await repo.claim(), null);
    assert.deepEqual(await repo.get(repair.id), before);
    await repo.update(old.id, { status: 'CANCELLED' });
    assert.equal((await repo.claimPrepared(repair.id))?.id, repair.id);
  } finally { db?.close(); }
});


for (const persisted of [false,true]) test('MAX yields QUEUED requeue to another objective, then resumes second pass with atomic single-flight ('+(persisted?'D1':'memory')+')',async()=>{
  const db=persisted?sqliteD1():null;
  const repo=new D1DevJobRepository(db);
  try{
    const a=await repo.create({id:'round-a',requested_by:'mel-autonomy',goal:'A',optional_context:{roadmap_id:'MEL-A'}});
    const initial=await repo.get(a.id);
    assert.equal(initial.status,'QUEUED');
    assert.equal(initial.result_json,null);
    // First pass is permitted to start; only a requeue demotes the mission.
    const executing=await repo.update(a.id,{status:'WAITING_TEACHER'});
    assert.equal(executing.status,'WAITING_TEACHER');
    const deferred=await repo.update(a.id,{status:'QUEUED',result_json:{revision:{reason:'STALE_SHA'}}});
    assert.equal(deferred.result_json.autonomy_queue_pass.passive,true);
    assert.equal(deferred.result_json.autonomy_queue_pass.round,2);
    const {isSecondPassQueued,singleFlightAutonomyMission}=await import('../src/evolution/provider-exhaustion-rotation.js');
    assert.equal(isSecondPassQueued(deferred),true);
    assert.equal(singleFlightAutonomyMission([deferred]),null);

    const b=await repo.create({id:'round-b',requested_by:'mel-autonomy',goal:'B',optional_context:{roadmap_id:'MEL-B'}});
    assert.equal(b.status,'QUEUED');
    assert.equal(singleFlightAutonomyMission([deferred,b]),null,'queued admissions must not reserve the execution lane');
    const bClaim=await repo.claimQueuedAutonomy(b.id,{expected:b});
    assert.equal(bClaim?.status,'PLANNING');
    assert.equal(await repo.resumeSecondPassQueued(a.id,{expected:deferred}),null,'cannot resume while B owns the slot');
    await repo.update(b.id,{status:'COMPLETED'});
    const resumed=await repo.resumeSecondPassQueued(a.id,{expected:deferred});
    assert.equal(resumed?.id,a.id);
    assert.equal(resumed.status,'PLANNING');
    assert.equal(resumed.result_json.autonomy_queue_pass.passive,false);
    assert.equal(singleFlightAutonomyMission([resumed])?.id,a.id);
    assert.equal(await repo.resumeSecondPassQueued(a.id,{expected:deferred}),null,'CAS rejects a repeated resume');
    await repo.update(a.id,{status:'WAITING_TEACHER'});
    const afterSecond=await repo.update(a.id,{status:'QUEUED'});
    assert.equal(afterSecond.result_json.autonomy_queue_pass.round,3);
    assert.equal(afterSecond.result_json.autonomy_queue_pass.passive,true);
    assert.equal(await repo.resumeSecondPassQueued(a.id,{expected:afterSecond}),null,'no unbounded third round');
  }finally{db?.close();}
});

test('MAX supervisor processes fresh roadmap work before returning a deferred QUEUED revision',async()=>{
  const roadmap=[{id:'MEL-A',title:'First',status:'IN_PROGRESS',priority:'P0',depends_on:[]},
    {id:'MEL-B',title:'Second',status:'IN_PROGRESS',priority:'P1',depends_on:[]}];
  const repo=new D1DevJobRepository(null);
  const supervisor=new AutonomySupervisor({repository:repo,roadmap});
  const first=await supervisor.ensureNextJob();
  assert.equal(first.job.optional_context.roadmap_id,'MEL-A');
  await repo.update(first.job.id,{status:'WAITING_TEACHER'});
  const queued=await repo.update(first.job.id,{status:'QUEUED'});
  assert.equal(queued.result_json.autonomy_queue_pass.passive,true);
  const second=await supervisor.ensureNextJob();
  assert.equal(second.job.optional_context.roadmap_id,'MEL-B');
  assert.equal(second.created,true);
  assert.equal(await supervisor.ensureNextJob().then(x=>x.job.id),second.job.id);
  await repo.update(second.job.id,{status:'COMPLETED'});
  const resumed=await supervisor.ensureNextJob();
  assert.equal(resumed.job.id,first.job.id);
  assert.equal(resumed.job.result_json.autonomy_queue_pass.passive,false);
  assert.equal(resumed.created,false);
});

test('MAX protects QUEUED revisions still claimed by a live Bridge',async()=>{
  const {isSecondPassQueued}=await import('../src/evolution/provider-exhaustion-rotation.js');
  const job={id:'unsafe',requested_by:'mel-autonomy',status:'QUEUED',
    result_json:{autonomy_queue_pass:{passive:true,round:2},
      dev_bridge:{status:'RUNNING'}}};
  assert.equal(isSecondPassQueued(job),false);
  const repo=new D1DevJobRepository(null,{memoryStore:new Map([['unsafe',{...job,updated_at:1,created_at:1,optional_context:{roadmap_id:'X'}}]])});
  assert.equal(await repo.resumeSecondPassQueued('unsafe'),null);
});


test('legacy revisioned QUEUED rows move to round two; untouched roadmap items retain first-pass priority',async()=>{
  const old=(id,order)=>({id,requested_by:'mel-autonomy',status:'QUEUED',goal:id,
    created_at:order,updated_at:order,
    optional_context:{roadmap_id:id},
    result_json:{last_teacher_review:{request_id:'teacher-'+id}},
    plan_json:{revision:{reason:'TEACHER_REQUEST_STALE_SHA'}}});
  const raw=[old('MEL-A',10),old('MEL-B',11)];
  const repo=new D1DevJobRepository(null,{memoryStore:new Map(raw.map(row=>[row.id,row]))});
  const roadmap=['MEL-A','MEL-B','MEL-C'].map((id,i)=>({id,title:id,status:'IN_PROGRESS',priority:'P'+i,depends_on:[]}));
  const controller=new AutonomySupervisor({repository:repo,roadmap});
  const first=await controller.ensureNextJob();
  assert.equal(first.job.optional_context.roadmap_id,'MEL-C');
  assert.equal(first.created,true);
  const a=await repo.get('MEL-A'),b=await repo.get('MEL-B');
  assert.equal(a.status,'QUEUED');
  assert.equal(b.status,'QUEUED');
  assert.equal(a.result_json.autonomy_queue_pass.passive,true);
  assert.equal(b.result_json.autonomy_queue_pass.passive,true);
  assert.equal(a.result_json.last_teacher_review.request_id,'teacher-MEL-A');
  assert.equal(b.plan_json.revision.reason,'TEACHER_REQUEST_STALE_SHA');
  await repo.update(first.job.id,{status:'COMPLETED'});
  const second=await controller.ensureNextJob();
  assert.equal(second.job.id,'MEL-A');
  assert.equal(second.job.result_json.autonomy_queue_pass.passive,false);
  assert.equal((await repo.get('MEL-B')).result_json.autonomy_queue_pass.passive,true);
});

test('fresh QUEUED with no historic preflight is NOT misclassified as second-pass work',async()=>{
  const {isLegacyRequeuedMission}=await import('../src/evolution/provider-exhaustion-rotation.js');
  const untouched={requested_by:'mel-autonomy',status:'QUEUED',result_json:{},plan_json:{}};
  assert.equal(isLegacyRequeuedMission(untouched),false);
  assert.equal(isLegacyRequeuedMission({...untouched,plan_json:{revision:{reason:'SHA_MOVED'}}}),true);
  assert.equal(isLegacyRequeuedMission({...untouched,plan_json:{revision:{reason:'SHA_MOVED'}},result_json:{
    teacher_bridge:{status:'WAITING_TEACHER'}}}),false,'live Teacher transport must not be passivized');
});


for(const persistent of [false,true]) test('concurrent second pass claims cannot activate two queued jobs ('+(persistent?'D1':'memory')+')',async()=>{
  const db=persistent?sqliteD1():null;
  const repo=new D1DevJobRepository(db);
  try{
    const seed=async id=>{
      await repo.create({id,requested_by:'mel-autonomy',goal:id,optional_context:{roadmap_id:id}});
      await repo.update(id,{status:'WAITING_TEACHER'});
      return repo.update(id,{status:'QUEUED'});
    };
    const a=await seed('parallel-a');
    const b=await seed('parallel-b');
    const answers=await Promise.all([
      repo.resumeSecondPassQueued(a.id,{expected:a}),
      repo.resumeSecondPassQueued(b.id,{expected:b}),
    ]);
    assert.equal(answers.filter(Boolean).length,1,'D1 or memory must admit at most one second-pass mission');
    const {singleFlightAutonomyMission}=await import('../src/evolution/provider-exhaustion-rotation.js');
    const all=await repo.list();
    assert.equal(all.filter(x=>x.result_json?.autonomy_queue_pass?.passive===false).length,1);
    assert.equal(singleFlightAutonomyMission(all)?.id,answers.find(Boolean).id);
  }finally{db?.close();}
});


for (const persistent of [false, true]) test('blocked oldest QUEUED revision never starves eligible second-pass work ('+(persistent?'D1':'memory')+')', async()=>{
  const db=persistent?sqliteD1():null;
  const repo=new D1DevJobRepository(db);
  try{
    const roadmap=[
      {id:'A',title:'A blocked by cycle',status:'IN_PROGRESS',priority:'P0',depends_on:['X']},
      {id:'X',title:'X blocked by A',status:'IN_PROGRESS',priority:'P1',depends_on:['A']},
      {id:'B',title:'B ready',status:'IN_PROGRESS',priority:'P2',depends_on:[]},
    ];
    const defer=async (id)=>{
      await repo.create({id:'second-'+id,requested_by:'mel-autonomy',goal:id,optional_context:{roadmap_id:id}});
      await repo.update('second-'+id,{status:'WAITING_TEACHER'});
      return repo.update('second-'+id,{status:'QUEUED'});
    };
    const a=await defer('A'),b=await defer('B');
    const supervisor=new AutonomySupervisor({repository:repo,roadmap});
    const selected=await supervisor.ensureNextJob();
    assert.equal(selected.job?.id,b.id,'a blocked older revision must not starve an eligible one');
    assert.equal(selected.job?.result_json?.autonomy_queue_pass?.passive,false);
    const stillBlocked=await repo.get(a.id);
    assert.equal(stillBlocked.status,'QUEUED','a blocked passive job must not be parked to WAITING_DEPENDENCY');
    assert.equal(stillBlocked.result_json.autonomy_queue_pass.passive,true);
    assert.equal(stillBlocked.updated_at,a.updated_at,'no retry or mutation while blocked');
    await repo.update(b.id,{status:'COMPLETED'});
    const next=await supervisor.ensureNextJob();
    assert.equal(next.job,null);
    assert.equal(next.external_progress?.status,'SECOND_PASS_PREREQUISITES_PENDING');
    assert.equal(next.external_progress?.blocked_count,1);
    assert.equal((await repo.get(a.id)).result_json.autonomy_queue_pass.passive,true);
  }finally{db?.close();}
});


for (const persisted of [false, true]) test('live Teacher transport blocks a passive-QUEUED release ('+(persisted?'D1':'memory')+')',async()=>{
  const db=persisted?sqliteD1():null;
  const repo=new D1DevJobRepository(db);
  const {isSecondPassQueued,singleFlightAutonomyMission}=await import('../src/evolution/provider-exhaustion-rotation.js');
  try{
    const seed=await repo.create({id:'pending-teacher-a',requested_by:'mel-autonomy',goal:'Keep live review',
      optional_context:{roadmap_id:'MEL-A'}});
    await repo.update(seed.id,{status:'WAITING_TEACHER',
      result_json:{teacher_bridge:{status:'WAITING_TEACHER',request:{request_id:'pending-review'}}}});
    const queued=await repo.update(seed.id,{status:'QUEUED'});
    assert.notEqual(queued.result_json?.autonomy_queue_pass?.passive,true,
      'A live Teacher transport must prevent a passive requeue');
    assert.equal(singleFlightAutonomyMission([queued])?.id,seed.id);
    await assert.rejects(
      repo.create({id:'pending-teacher-b',requested_by:'mel-autonomy',goal:'Other mission',
        optional_context:{roadmap_id:'MEL-B'}}),
      error=>error?.code==='AUTONOMY_OBJECTIVE_ALREADY_ACTIVE',
      'A second mission must not acquire the still occupied lane'
    );
    const unsafe={...queued,result_json:{...queued.result_json,
      autonomy_queue_pass:{passive:true,round:2}}};
    assert.equal(isSecondPassQueued(unsafe),false,
      'The read-side selector must also reject a stale passive marker while Teacher is live');
  }finally{db?.close();}
});
