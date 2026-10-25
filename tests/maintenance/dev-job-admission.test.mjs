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
