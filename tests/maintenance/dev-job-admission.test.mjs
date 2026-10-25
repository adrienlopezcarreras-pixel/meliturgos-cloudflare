import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from '../helpers/sqlite-d1.mjs';
import {D1DevJobRepository} from '../../src/dev/d1-dev-job-repository.js';
import {startMaintenanceLease,finishMaintenanceLease} from '../../src/maintenance/maintenance-gate.js';

async function fixture(){
 const db=sqliteD1({maintenanceFence:true});
 await db.prepare('CREATE TABLE dev_jobs(id TEXT PRIMARY KEY,created_at INTEGER,updated_at INTEGER,status TEXT,requested_by TEXT,goal TEXT,optional_context TEXT,plan_json TEXT,files_json TEXT,patch_json TEXT,tests_json TEXT,result_json TEXT,candidate_branch TEXT,approval_status TEXT,error TEXT)').run();
 const events=[];
 const repo=new D1DevJobRepository(db,{evolutionLedger:{append:async value=>{events.push(value);}}});
 // Schema already installed in this isolated SQL fixture; exercise actual create SQL.
 repo.ready=Promise.resolve();
 return {db,repo,events};
}

test('canonical job admission blocks paused and expired maintenance, then resumes after verified release',async()=>{
 const {db,repo,events}=await fixture();
 try {
  await repo.create({id:'before',goal:'existing',requested_by:'mel-autonomy'});
  await startMaintenanceLease(db,{leaseId:'cleanup',now:1,ttlMs:1000});
  for(const requested_by of ['mel-autonomy','owner-chat','mel-founder','professor']){
   await assert.rejects(repo.create({id:requested_by,goal:'must not create',requested_by}),{code:'MAINTENANCE_JOB_ADMISSION_BLOCKED'});
  }
  // expires_at is in the past: expiry must not reopen creation.
  await assert.rejects(repo.createIfAbsent({id:'expired',goal:'must not create'}),{code:'MAINTENANCE_JOB_ADMISSION_BLOCKED'});
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM dev_jobs').first()).n,1);
  assert.equal(events.length,1);
  assert.equal((await repo.get('before')).goal,'existing');
  await finishMaintenanceLease(db,{leaseId:'cleanup',reconciled:true,now:1002});
  assert.equal((await repo.createIfAbsent({id:'after',goal:'resume'})).created,true);
  assert.equal(events.length,2);
 }finally{db.close();}
});

test('pause acquired immediately before INSERT prevents creation, without a read-then-write race',async()=>{
 const {db,repo,events}=await fixture();let injected=false;
 try {
  const prepare=db.prepare.bind(db);
  db.prepare=sql=>{
   const statement=prepare(sql);
   if(sql.startsWith('INSERT INTO dev_jobs')){
    const run=statement.run.bind(statement);
    statement.run=async()=>{await startMaintenanceLease(db,{leaseId:'race',now:1,ttlMs:1000});injected=true;return run();};
   }
   return statement;
  };
  await assert.rejects(repo.create({id:'race',goal:'racing request'}),{code:'MAINTENANCE_JOB_ADMISSION_BLOCKED'});
  assert.equal(injected,true);assert.equal(events.length,0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM dev_jobs').first()).n,0);
 }finally{db.close();}
});

test('both legacy and prepared Bridge claims stay fenced; verified release permits one claim',async()=>{
 const {db,repo}=await fixture();
 try {
  await repo.create({id:'legacy',goal:'legacy',requested_by:'professor'});
  await repo.create({id:'prepared',goal:'approved',requested_by:'mel-autonomy'});
  const result={teacher_bridge:{status:'ANSWERED',request:{request_id:'req'},review:{request_id:'req',verdict:'APPROVE_PLAN',development_allowed:true}},
   bridge_preparation:{status:'READY',teacher_request_id:'req',candidate_branch:'candidate/mel-clean-autonomy',candidate_sha:'a'.repeat(40)}};
  await db.prepare('UPDATE dev_jobs SET status=?,files_json=?,tests_json=?,result_json=? WHERE id=?').bind('TEACHER_APPROVED',JSON.stringify([{path:'src/example.js',content:'export const test=1;'}]),JSON.stringify([{command:'test:smoke'}]),JSON.stringify(result),'prepared').run();
  await startMaintenanceLease(db,{leaseId:'claims',now:1,ttlMs:1000});
  assert.equal(await repo.claim(),null);
  assert.equal(await repo.claimPrepared('prepared'),null);
  assert.equal((await repo.get('legacy')).status,'QUEUED');
  assert.equal((await repo.get('prepared')).status,'TEACHER_APPROVED');
  await finishMaintenanceLease(db,{leaseId:'claims',reconciled:true,now:1002});
  assert.equal((await repo.claimPrepared('prepared')).status,'CLAIMED');
  assert.equal(await repo.claimPrepared('prepared'),null);
  assert.equal((await repo.claim()).id,'legacy');
 } finally{db.close();}
});
