import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';
import { isPassiveQueuedAutonomyJob, singleFlightAutonomyMission } from '../src/evolution/provider-exhaustion-rotation.js';

const input=id=>({id,goal:id,requested_by:'mel-autonomy',
  optional_context:{roadmap_id:id}});
for(const persistent of [false,true]){
  test('all initial QUEUED admissions are inert, and only one CAS can claim ('+(persistent?'D1':'memory')+')',async()=>{
    const db=persistent?sqliteD1():null,repo=new D1DevJobRepository(db);
    try{
      const [a,b]=await Promise.all([repo.create(input('A')),repo.create(input('B'))]);
      assert.ok(isPassiveQueuedAutonomyJob(a)&&isPassiveQueuedAutonomyJob(b));
      assert.equal(singleFlightAutonomyMission([a,b]),null);
      const results=await Promise.all([repo.claimQueuedAutonomy(a.id,{expected:a}),
        repo.claimQueuedAutonomy(b.id,{expected:b})]);
      assert.equal(results.filter(Boolean).length,1);
      const winner=results.find(Boolean);
      assert.equal(winner.status,'PLANNING');
      assert.equal(singleFlightAutonomyMission(await repo.list())?.id,winner.id);
      assert.equal(await repo.claimQueuedAutonomy(a.id===winner.id?b.id:a.id),null);
      const queued=await repo.update(winner.id,{status:'QUEUED'});
      assert.equal(queued.result_json.autonomy_queue_pass.passive,true);
      assert.equal(queued.result_json.autonomy_queue_pass.round,2);
      assert.equal(singleFlightAutonomyMission(await repo.list()),null);
      const next=await repo.claimQueuedAutonomy(a.id===winner.id?b.id:a.id);
      assert.equal(next?.status,'PLANNING');
      assert.equal(await repo.resumeSecondPassQueued(winner.id,{expected:queued}),null);
      await repo.update(next.id,{status:'COMPLETED'});
      const second=await repo.resumeSecondPassQueued(winner.id,{expected:queued});
      assert.equal(second?.status,'PLANNING');
      assert.equal(second.result_json.autonomy_queue_pass.passive,false);
      assert.equal(singleFlightAutonomyMission(await repo.list())?.id,winner.id);
    }finally{db?.close();}
  });
  test('a live Teacher transport in QUEUED keeps the exclusive lane ('+(persistent?'D1':'memory')+')',async()=>{
    const db=persistent?sqliteD1():null,repo=new D1DevJobRepository(db);
    try{
      const a=await repo.create(input('teacher-a'));
      await repo.update(a.id,{status:'WAITING_TEACHER',result_json:{
        teacher_bridge:{status:'WAITING_TEACHER',request:{request_id:'external'}}}});
      const q=await repo.update(a.id,{status:'QUEUED'});
      assert.equal(isPassiveQueuedAutonomyJob(q),false);
      assert.equal(singleFlightAutonomyMission([q])?.id,a.id);
      await assert.rejects(repo.create(input('teacher-b')),{
        code:'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE'
      });
      assert.equal(await repo.claimQueuedAutonomy(a.id),null);
    }finally{db?.close();}
  });
}
test('supervisor prioritizes the next unattempted objective after a QUEUED requeue',async()=>{
  const roadmap=['A','B'].map((id,index)=>({
    id,title:id,status:'PLANNED',priority:index?'P1':'P0',depends_on:[]
  }));
  const repo=new D1DevJobRepository(null);
  const scheduler=new AutonomySupervisor({repository:repo,roadmap});
  const first=await scheduler.ensureNextJob();
  assert.equal(first.job.optional_context.roadmap_id,'A');
  assert.equal(first.job.status,'QUEUED');
  assert.equal(singleFlightAutonomyMission(await repo.list()),null);
  const claimed=await repo.claimQueuedAutonomy(first.job.id,{expected:first.job});
  assert.equal(claimed?.status,'PLANNING');
  await repo.update(claimed.id,{status:'QUEUED'});
  const second=await scheduler.ensureNextJob();
  assert.equal(second.job.optional_context.roadmap_id,'B');
  assert.equal(second.job.status,'QUEUED');
  assert.equal(singleFlightAutonomyMission(await repo.list()),null);
});

for (const second of [false,true]) test(`D1 ${second?'second':'first'} pass refuses a Teacher mutation between snapshot and CAS`,async()=>{
 const db=sqliteD1(),repo=new D1DevJobRepository(db);
 try {
  let job=await repo.create(input('snapshot-race'));
  if(second){await repo.claimQueuedAutonomy(job.id);job=await repo.update(job.id,{status:'QUEUED'});}
  const changed={...job.result_json,teacher_bridge:{status:'WAITING_TEACHER',request:{request_id:'arrived-concurrently'}}};
  const prepare=db.prepare.bind(db);let injected=false;
  db.prepare=sql=>{
   const statement=prepare(sql);
   if(sql==='SELECT result_json,plan_json FROM dev_jobs WHERE id=?'){
    const first=statement.first.bind(statement);
    statement.first=async()=>{
     if(!injected){injected=true;await prepare('UPDATE dev_jobs SET result_json=? WHERE id=?').bind(JSON.stringify(changed),job.id).run();}
     return first();
    };
   }
   return statement;
  };
  const result=second?await repo.resumeSecondPassQueued(job.id,{expected:job}):await repo.claimQueuedAutonomy(job.id,{expected:job});
  assert.equal(injected,true);assert.equal(result,null);
  const preserved=await repo.get(job.id);
  assert.equal(preserved.status,'QUEUED');assert.deepEqual(preserved.result_json,changed);
 }finally{db.close();}
});
