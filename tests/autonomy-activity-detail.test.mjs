import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAutonomyActivity, jobPipeline, foldLedger, describeJob } from '../src/evolution/autonomy-activity.js';

const now = 1_792_325_000_000;
const approved = {
  id: 'ecosystem-watch-1', status: 'TEACHER_APPROVED', requested_by: 'mel-autonomy', goal: 'Débloquer media.image.analyze',
  created_at: now - 86_400_000, updated_at: now - 600_000, files_json: [{path:'src/a.js',content:'export const result = 1;'}], tests_json: [{command:'test:smoke'}],
  result_json: { teacher_bridge: { status:'ANSWERED',request:{request_id:'teacher-1'},review: { request_id:'teacher-1',verdict: 'APPROVE_PLAN',development_allowed:true,owner_override: true } }, implementation_proposal: { status: 'READY',teacher_request_id:'teacher-1',candidate_sha:'a'.repeat(40) }, bridge_preparation: { status: 'READY',teacher_request_id:'teacher-1',candidate_branch: 'candidate/mel-clean-autonomy', candidate_sha: 'a'.repeat(40) } },
};

test('legacy owner MAX-off never displays an executing mission', async () => {
  const { visibleActiveAutonomyMission } = await import('../src/evolution/autonomy-activity.js');
  const job = { id: 'job-1', status: 'PLANNING' };
  const ownerStopped = {
    source: 'owner-ui', paused: false, max_autonomy: false,
    max_remembered: false, reason: 'owner-stop',
  };
  assert.equal(visibleActiveAutonomyMission(job, ownerStopped), null);
  assert.equal(visibleActiveAutonomyMission(job, { ...ownerStopped, paused: true }), null);
  assert.equal(visibleActiveAutonomyMission({ ...job, status: 'QUEUED' }, { paused: false, max_autonomy: true }), null);
  assert.equal(visibleActiveAutonomyMission(job, { source: 'owner-ui', paused: false, max_autonomy: true }), job);
  assert.equal(visibleActiveAutonomyMission(job, { paused: false, max_autonomy: true }), job);
});

test('terminal jobs cannot masquerade as the active MAX mission', async () => {
  const { visibleActiveAutonomyMission } = await import('../src/evolution/autonomy-activity.js');
  const control = { source: 'owner-ui', paused: false, max_autonomy: true };
  for (const status of ['QUEUED', 'COMPLETED', 'FAILED', 'CANCELLED']) {
    assert.equal(visibleActiveAutonomyMission({ id: 'job-1', status }, control), null, status);
  }
  for (const status of ['PLANNING', 'COMMITTED']) {
    const job = { id: 'job-1', status };
    assert.equal(visibleActiveAutonomyMission(job, control), job, status);
  }
  assert.equal(visibleActiveAutonomyMission({ id: 'job-1', status: 'COMMITTED' }, { ...control, paused: true }), null);
  const ownerStopped = {
    source: 'owner-ui', paused: false, max_autonomy: false,
    max_remembered: false, reason: 'owner-stop',
  };
  const committed = { id: 'job-committed', status: 'COMMITTED' };
  assert.equal(visibleActiveAutonomyMission(committed, ownerStopped), committed);
  for (const status of ['QUEUED', 'COMPLETED', 'FAILED', 'CANCELLED', 'PLANNING']) {
    assert.equal(visibleActiveAutonomyMission({ id: 'job-owner-stop', status }, ownerStopped), null, status);
  }
  assert.equal(visibleActiveAutonomyMission(committed, { ...ownerStopped, paused: true }), null);

});

test('pipeline shows where a MAX job stands', () => {
  const steps = jobPipeline(approved);
  assert.deepEqual(steps.map(s => s.state), ['done', 'done', 'done', 'done', 'current', 'todo', 'todo', 'todo']);
  assert.match(steps[1].label, /par MAX/);
  const failed = jobPipeline({ status: 'FAILED', result_json: {} });
  assert.ok(failed.some(s => s.state === 'blocked'));
  const job = describeJob(approved, now);
  assert.equal(job.origin, 'veille des capacités');
  assert.equal(job.idle_minutes, 10);
  assert.equal(job.candidate.branch, 'candidate/mel-clean-autonomy');
});

test('repeated identical ledger updates are folded', () => {
  const ev = i => ({ evolution_id: 'j', stage: 'JOB_UPDATED', status: 'TEACHER_APPROVED', occurred_at: now - i, evidence_json: '{"bridge_status":"READY"}' });
  const rows = foldLedger([ev(1), ev(2), ev(3), { evolution_id: 'j', stage: 'JOB_CREATED', status: 'QUEUED', occurred_at: now - 9 }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].repeat, 3);
  assert.equal(rows[0].stage_text, 'Travail mis à jour');
});

test('activity report gathers jobs, ledger, dispatches and WORK from D1', async () => {
  const db = { prepare(sql) { const st = { bind() { return st; }, async run() { return {}; },
    async all() {
      if (/FROM dev_jobs/.test(sql)) return { results: [{ ...approved, result_json: JSON.stringify(approved.result_json), files_json: '["src/a.js"]', tests_json: '["tests/a.test.mjs"]' }] };
      if (/cloud-bridge-dispatch/.test(sql)) return { results: [{ bridge_id: 'cloud-bridge-dispatch:ecosystem-watch-1', status: 'DISPATCHED', last_seen: now, metadata_json: '{"relay_job_id":"r1"}' }] };
      if (/github_action_relay_jobs/.test(sql)) return { results: [{ id: 'r1', status: 'DISPATCHED', workflow: 'gen2-42-apply-ready-bridge.yml', result_json: '{"relay_run_id":7}', created_at: now }] };
      if (/mel_work_cycles/.test(sql)) return { results: [{ state: 'DONE', result: '{"status":"NO_ELIGIBLE_MISSION"}', updated_at: '2026-10-18T12:00:00Z' }] };
      return { results: [] };
    },
    async first() { return null; } }; return st; } };
  const a = await buildAutonomyActivity({ DB: db }, { now });
  assert.equal(a.ok, true);
  assert.equal(a.jobs[0].status, 'TEACHER_APPROVED');
  assert.equal(a.cloud_bridge_dispatches[0].relay_job_id, 'r1');
  assert.equal(a.workflow_dispatches[0].run_id, 7);
  assert.equal(a.work_cycles[0].status, 'NO_ELIGIBLE_MISSION');
});

test('the Activité panel reads the detailed feed and the top buttons report their result', async () => {
  const page = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  assert.match(page, /jfetch\('\/api\/gen2\/autonomy\/activity'\)/);
  assert.match(page, /id="melFullFeedback"/);
  for (const label of ['MAX 100 %', 'Cycle MEL']) assert.ok(page.includes("'" + label + "',qs('#melFullFeedback'))"), label);
  const api = await readFile(new URL('../src/evolution/autonomy-api.js', import.meta.url), 'utf8');
  assert.match(api, /'\/api\/gen2\/autonomy\/activity'/);
});

test('header buttons follow the real control state and never act during a release pause', async () => {
  const page = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  assert.match(page, /'MAX en attente \(pause\)'/);
  assert.match(page, /max\.disabled=releasePause/);
  assert.match(page, /pause\.disabled=releasePause/);
  assert.match(page, /NEW_RELEASE_AWAITING_OWNER_LAUNCH/);
  assert.match(page, /!awaitingOwnerLaunch&&/);
  assert.match(page, /b\.disabled=autonomyControl\.paused===true/);
  assert.match(page, /setInterval\(\(\)=>\{if\(!document\.hidden\)loadAutonomy\(\)/);
});

test('an activity reset hides older jobs and cancels only the active supervised ones', async () => {
  const { resetAutonomyActivityList, buildAutonomyActivity } = await import('../src/evolution/autonomy-activity.js');
  const calls = [];
  const now = 1_800_000_000_000;
  const db = {
    prepare(sql) {
      let bound = [];
      const st = {
        bind(...args) { bound = args; return st; },
        async run() { calls.push(sql); return { meta: { changes: 4 } }; },
        async all() {
          if (/FROM dev_jobs/.test(sql)) return { results: [
            { id: 'old', status: 'FAILED', requested_by: 'mel-autonomy', goal: 'ancien', created_at: now - 10_000, updated_at: now - 10_000, result_json: '{}' },
            { id: 'new', status: 'QUEUED', requested_by: 'mel-autonomy', goal: 'nouveau', created_at: now + 1000, updated_at: now + 1000, result_json: '{}' },
          ] };
          return { results: [] };
        },
        async first() { return bound[0] === 'activity-list-epoch' ? { last_seen: now } : null; },
      };
      return st;
    },
  };
  const reset = await resetAutonomyActivityList(db, { now });
  assert.equal(reset.cancelled_active, 4);
  assert.match(calls[0], /UPDATE dev_jobs/);
  assert.match(calls[1], /INSERT INTO dev_bridge_state/);
  const view = await buildAutonomyActivity({ DB: db }, { now: now + 5000 });
  assert.deepEqual(view.jobs.map(job => job.id), ['new']);
  assert.equal(view.activity_list_epoch, now);
});

// Promotion is part of the same current mission; no second job may advance.
test('COMMITTED supervised job remains current until COMPLETED', async () => {
  const { buildAutonomyActivity } = await import('../src/evolution/autonomy-activity.js');
  const now = Date.now();
  const db = { prepare(sql) {
    const st = {
      bind() { return st; },
      async all() {
        if (/FROM dev_jobs/.test(sql)) return { results: [
          { id: 'commit-1', status: 'COMMITTED', requested_by: 'mel-autonomy', goal: 'CI pending', created_at: now, updated_at: now, result_json: '{}' },
          { id: 'done-1', status: 'COMPLETED', requested_by: 'mel-autonomy', goal: 'Released', created_at: now, updated_at: now, result_json: '{}' },
        ] };
        return { results: [] };
      },
      async first() { return null; },
    };
    return st;
  } };
  // Isolate the activity counter from unrelated migration/schema initialization:
  // the fixture validates COMMITTED semantics, not D1 repository migrations.
  const fixtureJobs = [
    { id: 'commit-1', status: 'COMMITTED', requested_by: 'mel-autonomy', goal: 'CI pending', created_at: now, updated_at: now, result_json: '{}' },
    { id: 'done-1', status: 'COMPLETED', requested_by: 'mel-autonomy', goal: 'Released', created_at: now, updated_at: now, result_json: '{}' },
  ];
  const view = await buildAutonomyActivity({ DB: db }, { now, repository: { async list() { return fixtureJobs; } } });
  assert.equal(view.counts.active, 1);
  assert.equal(view.counts.waiting, 0);
  assert.equal(view.jobs.find(job => job.id === 'commit-1').queue_state, 'ACTIVE');
  assert.equal(view.counts.by_status.COMMITTED, 1);
  assert.equal(view.jobs.find(job => job.id === 'commit-1').pipeline.at(-1).done, false);
});

test('CLAIMED alone proves neither plan, generated code, package nor cloud execution', () => {
  const job={status:'CLAIMED',result_json:{},files_json:[],tests_json:[]};
  const stages=jobPipeline(job);
  assert.deepEqual(stages.map(s=>s.done),[true,false,false,false,false,false,false,false]);
  assert.doesNotMatch(describeJob(job).status_text,/Pris par le pont cloud/);
});

test('a READY implementation plan is not generated code and a stale Teacher package is not ready', () => {
  const noCode={...approved,files_json:[],result_json:{...approved.result_json,bridge_preparation:null}};
  assert.deepEqual(jobPipeline(noCode).map(s=>s.done),[true,true,false,false,false,false,false,false]);
  const stale=structuredClone(approved);stale.result_json.bridge_preparation.teacher_request_id='older-teacher';
  assert.equal(jobPipeline(stale).find(s=>s.key==='code').done,false);
  assert.equal(jobPipeline(stale).find(s=>s.key==='package').done,false);
  const wrongBase=structuredClone(approved);wrongBase.result_json.implementation_proposal.candidate_sha='b'.repeat(40);
  assert.equal(jobPipeline(wrongBase).find(s=>s.key==='package').done,false);
});

test('a claim preserves existing package evidence but never implies a published candidate', () => {
  const job={...approved,status:'CLAIMED'};
  assert.deepEqual(jobPipeline(job).map(s=>s.done),[true,true,true,true,false,false,false,false]);
  const local=structuredClone(job);local.result_json.dev_bridge={mode:'STRUCTURED_MENTOR_WORK',changed:true,status:'READY_FOR_REVIEW',candidate_sha:'c'.repeat(40)};
  assert.equal(jobPipeline(local).find(s=>s.key==='candidate').done,false);
  local.result_json.dev_bridge={mode:'GITHUB_CLOUD_BRIDGE',needs_repair:false,status:'READY_FOR_REVIEW',github_run_id:123,candidate_sha:'c'.repeat(40)};
  assert.equal(jobPipeline(local).find(s=>s.key==='candidate').done,true);
  assert.equal(jobPipeline(local).find(s=>s.key==='ci').done,false);
});

test('COMPLETED and an uncorrelated green CI cannot manufacture verified completion', () => {
  const job=structuredClone(approved);job.status='COMPLETED';
  assert.equal(jobPipeline(job).find(s=>s.key==='done').done,false);
  job.result_json.autonomy_completion={status:'VERIFIED',request_id:'teacher-1',candidate_sha:'c'.repeat(40),ci:{verified:true,workflow:'full-candidate-ci',run_id:12,head_sha:'d'.repeat(40),conclusion:'success'}};
  assert.equal(jobPipeline(job).find(s=>s.key==='ci').done,false);
  job.result_json.autonomy_completion.ci.head_sha='c'.repeat(40);
  assert.equal(jobPipeline(job).find(s=>s.key==='done').done,true);
  assert.doesNotMatch(jobPipeline(job).find(s=>s.key==='done').label,/release automatiques/);
});

test('verified existing code is described without claiming that Mentor generated a new package', () => {
  const job=structuredClone(approved);job.status='COMPLETED';job.files_json=[];
  job.result_json.implementation_proposal.decision='VERIFY_EXISTING';
  job.result_json.autonomy_completion={status:'VERIFIED',request_id:'teacher-1',candidate_sha:'c'.repeat(40),ci:{verified:true,workflow:'full-candidate-ci',run_id:12,head_sha:'c'.repeat(40),conclusion:'success'}};
  const stages=jobPipeline(job);
  assert.equal(stages.find(s=>s.key==='code').label,'Code existant vérifié');
  assert.equal(stages.find(s=>s.key==='package').label,'Vérification sans nouveau paquet');
  assert.ok(stages.filter(s=>s.key!=='objective').every(s=>s.done));
});

// [ChatGPT-GPT6] COMMITTED is not terminal: promotion can still be pending.
test('activity reset includes COMMITTED but excludes terminal job states', async () => {
  const { resetAutonomyActivityList } = await import('../src/evolution/autonomy-activity.js');
  const statements = [];
  const db = { prepare(sql) {
    statements.push(sql);
    return { bind() { return this; }, async run() { return { meta: { changes: 1 } }; } };
  } };
  const result = await resetAutonomyActivityList(db, { now: 1_800_000_000_000 });
  assert.equal(result.cancelled_active, 1);
  assert.match(statements[0], /UPDATE dev_jobs SET status='CANCELLED'/);
  assert.ok(statements[0].includes("status NOT IN ('COMPLETED','DONE','DONE_VERIFIED','VERIFIED','ACCEPTED','CANCELLED','FAILED')"));
  assert.doesNotMatch(statements[0], /'COMMITTED'/);
  assert.match(statements[0], /'DONE_VERIFIED'/);
  assert.match(statements[0], /'ACCEPTED'/);
});

test('activity exposes bounded bridge diagnostics without secret-bearing output', () => {
  const job = structuredClone(approved);
  job.result_json.dev_bridge = {
    status: 'REPAIR_REQUIRED', mode: 'GITHUB_CLOUD_BRIDGE_EMERGENCY',
    github_run_id: 39924660001, needs_repair: true,
    tests: [{name:'npm test',passed:false,executed:true,exit_code:1,error:'TEST_COMMAND_FAILED',stderr:'secret-token'}],
    diff_summary:'secret-token', token:'secret-token'
  };
  job.result_json.repair_cycle = {source:'OWNER_MAX_EXECUTOR_FAILURE',attempts:3};
  job.result_json.runtime_retry = {last_error:'CLOUD_BRIDGE_EXECUTOR_FAILURE'};
  const activity = describeJob(job, now);
  assert.equal(activity.bridge_diagnostics.github_run_id,39924660001);
  assert.equal(activity.bridge_diagnostics.mode,'GITHUB_CLOUD_BRIDGE_EMERGENCY');
  assert.equal(activity.bridge_diagnostics.repair_source,'OWNER_MAX_EXECUTOR_FAILURE');
  assert.equal(activity.bridge_diagnostics.repair_attempts,3);
  assert.equal(activity.bridge_diagnostics.tests[0].error_code,'TEST_COMMAND_FAILED');
  assert.ok(!JSON.stringify(activity).includes('secret-token'));
});

test('activity redacts unstructured error text in bridge diagnostics', () => {
  const job = structuredClone(approved);
  job.result_json.dev_bridge = {tests:[{error:'Access denied token=private'}],github_run_id:'abc',mode:'text with secrets'};
  job.result_json.runtime_retry={last_error:'HTTP 403 bearer private'};
  const activity=describeJob(job,now);
  assert.equal(activity.bridge_diagnostics.github_run_id,null);
  assert.equal(activity.bridge_diagnostics.mode,null);
  assert.equal(activity.bridge_diagnostics.tests[0].error_code,null);
  assert.equal(activity.bridge_diagnostics.retry_error_code,null);
});

test('a completed job is code delivered; only a verified roadmap item proves the objective', () => {
  const done = { status: 'COMPLETED', optional_context: { roadmap_id: 'MEL-FOUNDER-05' }, result_json: {} };
  assert.match(describeJob(done, now).status_text, /Code livré.*pas encore prouvé/);
  assert.equal(jobPipeline(done).at(-1).key, 'objective');
  assert.equal(jobPipeline(done).at(-1).done, false);
});

test('the Code chat plan shows the mission in progress, what comes next and the next scheduled cycles', async () => {
  const { buildCodePlan, scheduledCycles } = await import('../src/evolution/autonomy-activity.js');
  const now = Date.parse('2026-10-24T08:05:30Z');
  const plan = buildCodePlan([
    { roadmap_id: 'MEL-FOUNDER-07', status: 'TEACHER_APPROVED', goal: '[MEL-FOUNDER-07] Restaurer | OBJECTIF MEL-FOUNDER-01:IN_PROGRESS', pipeline: [{ label: 'Chantier choisi', state: 'done' }] },
    { roadmap_id: 'MEL-MANIFEST-03', status: 'REPAIR_REQUIRED' },
    { roadmap_id: 'MEL-FOUNDER-05', status: 'COMPLETED' },
  ], { now });
  assert.equal(plan.current.roadmap_id, 'MEL-FOUNDER-07');
  assert.equal(plan.current.goal, '[MEL-FOUNDER-07] Restaurer');
  assert.deepEqual(plan.queued, [{ roadmap_id: 'MEL-MANIFEST-03', status: 'REPAIR_REQUIRED' }]);
  assert.ok(plan.next.length > 0 && plan.next.every(item => !['MEL-FOUNDER-07', 'MEL-MANIFEST-03'].includes(item.id)));
  assert.deepEqual(scheduledCycles(now).map(c => new Date(c.next_at).toISOString()), ['2026-10-24T08:06:00.000Z', '2026-10-24T08:17:00.000Z', '2026-10-25T02:43:00.000Z']);
});

test('each pipeline step of a mission is traced to its exact run and SHA', async () => {
  const { jobTrace } = await import('../src/evolution/autonomy-activity.js');
  const sha = 'a'.repeat(40);
  const trace = jobTrace({
    dev_bridge: { github_run_id: 101, candidate_sha: sha, status: 'READY_FOR_REVIEW' },
    autonomy_completion: { ci: { run_id: 202, head_sha: sha, conclusion: 'success' } },
    council_review: { decision: 'REJECTED', head: sha },
  });
  assert.deepEqual(trace.map(t => [t.step, t.run_id ?? null, t.status]), [['bridge', 101, 'READY_FOR_REVIEW'], ['ci', 202, 'success'], ['council', null, 'REJECTED']]);
  assert.ok(trace.every(t => t.sha === sha));
  assert.deepEqual(jobTrace({}), []);
});

test('activity keeps all QUEUED missions waiting without inventing an active execution',async()=>{
  const jobs=Array.from({length:15},(_,i)=>({...approved,id:'queued-'+i,status:'QUEUED',created_at:now-i*1000,result_json:'{}',files_json:'[]',tests_json:'[]'}));
  const db={prepare(sql){const st={bind(){return st;},async run(){return {};},async all(){return {results:/FROM dev_jobs/.test(sql)?jobs:[]};},async first(){return sql.startsWith('SELECT status,last_seen,metadata_json FROM dev_bridge_state')?{status:'MAX_AUTONOMY',last_seen:now,metadata_json:JSON.stringify({paused:false,max_autonomy:true})}:null;}};return st;}};
  const activity=await buildAutonomyActivity({DB:db},{now,repository:{list:async()=>jobs.map(job=>({...job,result_json:{},files_json:[],tests_json:[]}))}});
  assert.equal(activity.counts.active,0);assert.equal(activity.counts.waiting,15);
  assert.equal(activity.jobs.filter(job=>job.queue_state==='ACTIVE').length,0);
  assert.equal(activity.jobs.filter(job=>job.queue_state==='WAITING').length,15);
});


test('QUEUED missions never occupy the displayed execution slot', async () => {
  const { activeAutonomyMission } = await import('../src/evolution/provider-exhaustion-rotation.js');
  const queued = Array.from({length:100},(_,i)=>({id:'MEL-MANIFEST-'+i,status:'QUEUED',requested_by:'mel-autonomy',created_at:i}));
  assert.equal(activeAutonomyMission(queued),null);
  const running={id:'running',status:'PLANNING',requested_by:'mel-autonomy',created_at:101};
  assert.equal(activeAutonomyMission([...queued,running])?.id,'running');
  assert.equal(activeAutonomyMission([...queued,{...running,status:'COMPLETED'}]),null);
});


test('displayed mission selection and waiting count are deduplicated', async () => {
  const running={...approved,id:'single-running',status:'PLANNING',result_json:{}};
  const queued={...approved,id:'single-waiting',status:'QUEUED',result_json:{}};
  const rows=[running,running,queued,queued];
  const db={prepare(sql){const st={bind(){return st;},async run(){return {};},async all(){return {results:/FROM dev_jobs/.test(sql)?rows:[]};},async first(){return sql.startsWith('SELECT status,last_seen,metadata_json FROM dev_bridge_state')?{status:'MAX_AUTONOMY',last_seen:now,metadata_json:JSON.stringify({paused:false,max_autonomy:true})}:null;}};return st;}};
  const activity=await buildAutonomyActivity({DB:db},{now,repository:{list:async()=>rows}});
  assert.equal(activity.counts.active,1);
  assert.equal(activity.counts.waiting,1);
  assert.equal(activity.counts.supervised_total,2);
  assert.equal(activity.counts.by_status.PLANNING,1);
  assert.equal(activity.counts.by_status.QUEUED,1);
  assert.equal(Object.values(activity.counts.by_status).reduce((sum,n)=>sum+n,0),2);
  assert.equal(activity.jobs.filter(job=>job.queue_state==='ACTIVE').length,1);
  assert.equal(activity.jobs.filter(job=>job.queue_state==='WAITING').length,1);
});


test('passive queue retains over 60 distinct missions without an execution slot', async () => {
  const queued=Array.from({length:125},(_,i)=>({...approved,id:'passive-'+i,status:'QUEUED',created_at:now-i*1000,updated_at:now-i*1000,result_json:{}}));
  const db={prepare(sql){const st={bind(){return st;},async run(){return {};},async all(){return {results:[]};},async first(){return null;}};return st;}};
  const activity=await buildAutonomyActivity({DB:db},{now,repository:{list:async()=>queued}});
  assert.equal(activity.counts.active,0);
  assert.equal(activity.counts.waiting,125);
  assert.equal(activity.counts.by_status.QUEUED,125);
  assert.equal(activity.jobs.filter(job=>job.queue_state==='WAITING').length,125);
  assert.equal(new Set(activity.jobs.map(job=>job.id)).size,125);
});


test('scheduler admits only one queued mission while the rest remain unmodified', async () => {
  const { selectActionableAutonomyJob } = await import('../src/evolution/autonomy-supervisor.js');
  const queued=Array.from({length:125},(_,i)=>({id:'queue-'+i,requested_by:'mel-autonomy',status:'QUEUED',created_at:now+i,updated_at:now+i,result_json:{}}));
  const original=JSON.stringify(queued);
  const selected=selectActionableAutonomyJob(queued,{roadmap:[],epochMs:0});
  assert.ok(selected);
  assert.equal(queued.filter(job=>job.id===selected.id).length,1);
  assert.equal(queued.filter(job=>job.status==='QUEUED').length,125);
  assert.equal(JSON.stringify(queued),original);
});


test('automatic error-correction jobs keep their queue category and remain passive until admitted', async () => {
  const { autonomyQueueCategory, selectActionableAutonomyJob } = await import('../src/evolution/autonomy-supervisor.js');
  const error={id:'error-ledger-504',requested_by:'mel-autonomy',status:'QUEUED',optional_context:{source:'error-ledger'},created_at:now,updated_at:now,result_json:{}};
  const roadmap={...error,id:'roadmap-1',optional_context:{source:'roadmap'}};
  const watch={...error,id:'ecosystem-watch-1',optional_context:{source:'ecosystem-watch'}};
  assert.equal(autonomyQueueCategory(roadmap),0);
  assert.equal(autonomyQueueCategory(error),1);
  assert.equal(autonomyQueueCategory(watch),2);
  const jobs=[error,roadmap,watch];
  const before=JSON.stringify(jobs);
  assert.equal(selectActionableAutonomyJob(jobs,{roadmap:[]})?.id,'roadmap-1');
  assert.equal(selectActionableAutonomyJob([error,watch],{roadmap:[]})?.id,'error-ledger-504');
  assert.equal(JSON.stringify(jobs),before);
  assert.ok(jobs.every(job=>job.status==='QUEUED'));
});

// 31/10: FOUNDER-04 was completed by MAX with a verified acceptance receipt,
// yet its follow-up never showed « Objectif prouvé » (only the static
// declaration, never edited by MAX, was read).
test('a verified roadmap acceptance receipt marks the objective proven in the pipeline', async () => {
  const { jobPipeline: pipeline } = await import('../src/evolution/autonomy-activity.js');
  const { ROADMAP_CODE_CONTRACT_REVISION } = await import('../src/roadmap/roadmap-code-contracts.js');
  const sha = 'a'.repeat(40), branch = 'candidate/mel-clean-autonomy';
  const ci = { verified: true, workflow: 'full-candidate-ci', run_id: 7, head_sha: sha, head_branch: branch, conclusion: 'success' };
  const job = { id: 'f4', status: 'COMPLETED', requested_by: 'mel-autonomy',
    optional_context: { roadmap_id: 'MEL-FOUNDER-04', roadmap_contract_revision: ROADMAP_CODE_CONTRACT_REVISION },
    files_json: [{ path: 'src/teachers/augmentio-council.js' }, { path: 'tests/augmentio-council.test.mjs' }],
    result_json: {
      roadmap_code_acceptance: { schema: 'mel.roadmap-code-acceptance/v1', status: 'VERIFIED', roadmap_id: 'MEL-FOUNDER-04', contract_revision: ROADMAP_CODE_CONTRACT_REVISION,
        candidate_sha: sha, candidate_branch: branch, ci_run_id: 7, code_paths: ['src/teachers/augmentio-council.js'], test_paths: ['tests/augmentio-council.test.mjs'], external_acceptance_verified: false },
      autonomy_completion: { status: 'VERIFIED', candidate_sha: sha, candidate_branch: branch, ci, mel_implementation: { verified: true, providers_attempted: 2 } },
    } };
  assert.equal(pipeline(job).find(step => step.key === 'objective').done, true);
  const unproven = { ...job, result_json: { ...job.result_json, roadmap_code_acceptance: undefined } };
  assert.equal(pipeline(unproven).find(step => step.key === 'objective').done, false);
});


test('MAX passive catalog includes every unresolved roadmap point without creating D1 jobs', async()=>{
  const { buildPassiveRoadmapCatalog }=await import('../src/evolution/autonomy-activity.js');
  const roadmap=[
    {id:'MEL-A',title:'A préparé',status:'PLANNED',priority:'P0',depends_on:[],contract_revision:'v1',code_paths:['src/a.js'],test_paths:['tests/a.test.mjs']},
    {id:'MEL-B',title:'B dépendant',status:'PLANNED',depends_on:['MEL-A']},
    {id:'MEL-C',title:'Attente externe',status:'BLOCKED_EXTERNAL',depends_on:[]},
    {id:'MEL-D',title:'Déjà certifié',status:'DONE_VERIFIED',depends_on:[]},
    {id:'MEL-E',title:'Code livré mais non prouvé',status:'IN_PROGRESS',depends_on:[]},
  ];
  const jobs=[
    {id:'job-a',optional_context:{roadmap_id:'MEL-A'},status:'QUEUED',updated_at:12,result_json:{}},
    {id:'job-e',optional_context:{roadmap_id:'MEL-E'},status:'COMPLETED',updated_at:13,result_json:{}},
  ];
  const before=JSON.stringify({roadmap,jobs});
  const catalog=buildPassiveRoadmapCatalog(roadmap,jobs);
  assert.deepEqual([catalog.total,catalog.verified,catalog.remaining],[5,1,4]);
  assert.deepEqual(catalog.items.map(x=>x.id),['MEL-A','MEL-B','MEL-C','MEL-E']);
  assert.deepEqual(catalog.items.map(x=>x.state),['MISSION_REGISTERED','WAITING_PREREQUISITES','BLOCKED_EXTERNAL','CODE_DELIVERED_UNVERIFIED']);
  assert.equal(catalog.items[0].mission_status,'QUEUED');
  assert.equal(catalog.items[0].contract_defined,true);
  assert.equal(catalog.items[1].mission_id,null);
  assert.deepEqual(catalog.items[1].unmet_prerequisites,['MEL-A']);
  assert.equal(JSON.stringify({roadmap,jobs}),before,'read-only catalog must preserve inputs');
});

test('MAX passive catalog never truncates roadmap to 3, 30, 60 or 100 items',async()=>{
  const { buildPassiveRoadmapCatalog,buildAutonomyActivity }=await import('../src/evolution/autonomy-activity.js');
  const { flattenRoadmap,isClosedRoadmapStatus }=await import('../src/roadmap/master-roadmap.js');
  const full=flattenRoadmap(),open=full.filter(x=>!isClosedRoadmapStatus(x.status));
  const catalog=buildPassiveRoadmapCatalog(full,[]);
  assert.equal(catalog.items.length,open.length);
  assert.deepEqual(catalog.items.map(x=>x.id),open.map(x=>x.id));
  const generated=Array.from({length:220},(_,i)=>({id:'TEST-'+i,title:'Objective '+i,status:'PLANNED',depends_on:[]}));
  assert.equal(buildPassiveRoadmapCatalog(generated,[]).items.length,220);
  const db={prepare(){const st={bind(){return st;},async run(){return{};},async all(){return{results:[]};},async first(){return null;}};return st;}};
  const a=await buildAutonomyActivity({DB:db},{now,repository:{list:async()=>[]}});
  assert.equal(a.counts.waiting,0);
  assert.equal(a.counts.active,0);
  assert.equal(a.scheduler_slot.reserved,false);
  assert.equal(a.passive_roadmap.remaining,full.length,'empty live audits must reopen historical DONE points too');
  assert.equal(a.passive_roadmap.items.length,full.length);
  assert.equal(a.passive_roadmap.verified,0);
  assert.equal(a.passive_roadmap.verification_source,'production_d1_audit');
  assert.equal(a.plan.next[0].status,'RECERTIFICATION_REQUIRED','the plan and actual scheduler both see historical points needing runtime proofs');
});

test('the plan uses canonical execution state rather than calling a passive queued mission current',async()=>{
  const {buildCodePlan}=await import('../src/evolution/autonomy-activity.js');
  const roadmap=[{id:'MEL-A',status:'PLANNED',depends_on:[]}];
  const passive={roadmap_id:'MEL-A',status:'QUEUED',queue_state:'WAITING'};
  assert.equal(buildCodePlan([passive],{roadmap}).current,null);
  assert.equal(buildCodePlan([{...passive,status:'PLANNING',queue_state:'ACTIVE'}],{roadmap}).current.roadmap_id,'MEL-A');
});

test('MAX passive UI shows catalog separate from true D1 QUEUED missions',async()=>{
  const {readFile}=await import('node:fs/promises');
  const ui=await readFile(new URL('../src/pages/full-interface-v2.js',import.meta.url),'utf8');
  assert.ok(ui.includes('a.passive_roadmap?.items'));
  assert.ok(ui.includes('passiveRoadmap.map(item=>'));
  assert.ok(ui.includes('+passiveRoadmapPanel+'));
  assert.ok(ui.includes('pas de mission D1'));
  assert.ok(ui.includes('aucun appel IA, aucune réservation de créneau'));
  assert.ok(ui.includes("const awaiting=(a.jobs||[]).filter(j=>j.queue_state==='WAITING');"));
});


test('QUEUED is passive and never reserves the MAX execution lane',async()=>{
  const first={id:'queued-old',requested_by:'mel-autonomy',status:'QUEUED',created_at:now-2000,updated_at:now-2000,
    optional_context:{roadmap_id:'MEL-FOUNDER-05'},result_json:{}};
  const second={...first,id:'queued-new',created_at:now-1000,updated_at:now-1000,
    optional_context:{roadmap_id:'MEL-FOUNDER-06'}};
  const db={prepare(){const st={bind(){return st;},async run(){return{};},async all(){return{results:[]};},async first(){return null;}};return st;}};
  const rows=[first,second],before=JSON.stringify(rows);
  const activity=await buildAutonomyActivity({DB:db},{now,repository:{list:async()=>rows}});
  assert.equal(activity.counts.active,0);
  assert.equal(activity.counts.waiting,2);
  assert.equal(activity.scheduler_slot.reserved,false);
  assert.equal(activity.scheduler_slot.executing,false);
  assert.equal(activity.scheduler_slot.mission_id,null);
  assert.equal(activity.scheduler_slot.reason,null);
  assert.equal(JSON.stringify(rows),before);
  const ui=await (await import('node:fs/promises')).readFile(new URL('../src/pages/full-interface-v2.js',import.meta.url),'utf8');
  assert.ok(ui.includes('a.scheduler_slot?.reserved===true'));
  assert.ok(ui.includes('Créneau MAX réservé par'));
});


test('MEL-EVOL-04 deployment ledger drills are distinguished from real mission creation', () => {
  const sha='b'.repeat(40), id='release-proof-'+sha.slice(0,12);
  const event={evolution_id:id,source_sha:sha,actor:'release-bootstrap',stage:'JOB_CREATED',status:'QUEUED',occurred_at:now,evidence:{roadmap_id:'MEL-EVOL-04'}};
  const [created,verified]=foldLedger([event,{...event,stage:'PRODUCTION_VERIFIED',status:'DONE_VERIFIED'}]);
  assert.equal(created.stage_text,'Contrôle du journal de déploiement démarré');
  assert.equal(verified.stage_text,'Journal du déploiement vérifié');
  assert.match(created.detail,/aucune mission MAX relancée/);
  assert.equal(created.stage,'JOB_CREATED','immutable original evidence remains intact');
  assert.equal(foldLedger([{...event,actor:'mel-autonomy'}])[0].stage_text,'Travail créé');
  assert.equal(foldLedger([{...event,source_sha:'c'.repeat(40)}])[0].stage_text,'Travail créé');
});
