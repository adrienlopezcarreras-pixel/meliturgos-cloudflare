import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';

function isolatedRepo() {
  return new D1DevJobRepository(null, { memoryStore: new Map() });
}

const roadmap = [
  { id: 'MEL-WORK-01', title: 'Work Engine', status: 'PARTIAL', priority: 'P0', phase_id: 'P07', phase: 'Work' },
  { id: 'GEN2-17', title: 'Dev Agent', status: 'PLANNED', priority: 'P0', phase_id: 'P06', phase: 'Evolution' },
];

test('normal supervised mode retains the same mission while Teacher is pending', async () => {
  const repo = isolatedRepo();
  const first = await repo.create({
    id: 'mel-autonomy-mel-work-01-1',
    requested_by: 'mel-autonomy',
    goal: '[MEL-WORK-01] Work Engine',
    optional_context: { roadmap_id: 'MEL-WORK-01', source: 'autonomy-supervisor', priority: 'P0' },
  });
  await repo.update(first.id, {
    status: 'WAITING_TEACHER',
    result_json: {
      teacher_bridge: {
        status: 'WAITING_TEACHER',
        request: { request_id: 'teacher-request-1' },
      },
    },
  });

  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const next = await supervisor.ensureNextJob();

  assert.equal(next.created, false);
  assert.equal(next.job?.id, first.id);
  assert.equal((await repo.list()).length, 1);
  assert.equal((await repo.get(first.id)).status, 'WAITING_TEACHER');
});

test('normal supervised mode retains the same approved candidate while CI evidence is pending', async () => {
  const repo = isolatedRepo();
  const first = await repo.create({
    id: 'mel-autonomy-mel-work-01-1',
    requested_by: 'mel-autonomy',
    goal: '[MEL-WORK-01] Work Engine',
    optional_context: { roadmap_id: 'MEL-WORK-01', source: 'autonomy-supervisor', priority: 'P0' },
  });
  await repo.update(first.id, {
    status: 'READY_FOR_REVIEW',
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        review: { verdict: 'APPROVE_PLAN', development_allowed: true },
      },
      dev_bridge: {
        status: 'READY_FOR_REVIEW',
        needs_repair: false,
      },
    },
  });

  const supervisor = new AutonomySupervisor({ repository: repo, roadmap });
  const next = await supervisor.ensureNextJob();

  assert.equal(next.created, false);
  assert.equal(next.job?.id, first.id);
  assert.equal((await repo.list()).length, 1);
  assert.equal((await repo.get(first.id)).status, 'READY_FOR_REVIEW');
});

for(const bridge of [null,{status:'FAILED',needs_repair:false}])test('a Teacher answer without a healthy Bridge receipt remains recoverable: '+(bridge?.status||'missing'),async()=>{
 const repo=isolatedRepo();
 const first=await repo.create({id:'mel-autonomy-mel-work-01-1',requested_by:'mel-autonomy',goal:'[MEL-WORK-01] Work Engine',optional_context:{roadmap_id:'MEL-WORK-01',source:'autonomy-supervisor',priority:'P0'}});
 await repo.update(first.id,{status:'READY_FOR_REVIEW',result_json:{teacher_bridge:{status:'ANSWERED',review:{verdict:'APPROVE_PLAN',development_allowed:true}},...(bridge?{dev_bridge:bridge}:{})}});
 const next=await new AutonomySupervisor({repository:repo,roadmap}).ensureNextJob();
 assert.equal(next.created,false);assert.equal(next.job.id,first.id);
 assert.equal((await repo.list()).length,1,'no new mission hides an unproven passive lane');
 assert.equal((await repo.get(first.id)).status,'READY_FOR_REVIEW','selection does not invent completion');
});
