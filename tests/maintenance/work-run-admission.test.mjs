import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from '../helpers/sqlite-d1.mjs';
import {startMaintenanceLease,finishMaintenanceLease} from '../../src/maintenance/maintenance-gate.js';
import {acquireD1WorkRunLease,releaseD1WorkRunLease} from '../../src/work/d1-work-run-lease.js';

test('real WORK lease blocks manual and cron admission during maintenance and resumes without double execution',async()=>{
 const db=sqliteD1({maintenanceFence:true});
 try{
  const existing=await acquireD1WorkRunLease(db,'existing',{now:1,ttlMs:1000,token:'existing-owner'});
  await startMaintenanceLease(db,{leaseId:'maintenance',now:2,ttlMs:1000});
  for(const token of ['manual','cron'])assert.equal(await acquireD1WorkRunLease(db,'new',{now:2000,token}),null);
  assert.equal(await acquireD1WorkRunLease(db,'existing',{now:2000,token:'replacement'}),null);
  assert.equal(await releaseD1WorkRunLease(db,existing),true);
  await finishMaintenanceLease(db,{leaseId:'maintenance',reconciled:true,now:2001});
  const [a,b]=await Promise.all(['manual','cron'].map(token=>acquireD1WorkRunLease(db,'new',{now:2002,token})));
  assert.equal([a,b].filter(Boolean).length,1);
 }finally{db.close();}
});

test('direct streamed WORK refuses maintenance before cycle creation, network, model or submission',async()=>{
 const {streamDirectWork}=await import('../../src/revenue/work-stream.js');
 const db=sqliteD1({maintenanceFence:true});let calls=0;
 try{
  await startMaintenanceLease(db,{leaseId:'stream',now:1,ttlMs:1000});
  const response=streamDirectWork({env:{DB:db,AI:{run:async()=>{calls++;}}},fetchImpl:async()=>{calls++;},queueSubmission:async()=>{calls++;}});
  const events=(await response.text()).trim().split('\n').map(x=>JSON.parse(x));
  assert.deepEqual(events,[{type:'error',code:'WORK_PAUSED_FOR_MAINTENANCE'}]);assert.equal(calls,0);
  assert.equal(await db.prepare("SELECT name FROM sqlite_master WHERE name='mel_work_cycles'").first(),null);
 }finally{db.close();}
});

test('absent global fence schema blocks WORK execution rather than assuming maintenance is off',async()=>{
 const db=sqliteD1();
 try{await assert.rejects(acquireD1WorkRunLease(db,'missing-fence'),/dev_bridge_state/);}finally{db.close();}
});

test('stream cycle admission is atomic when maintenance starts after the preliminary read',async()=>{
 const {streamDirectWork}=await import('../../src/revenue/work-stream.js');
 const db=sqliteD1({maintenanceFence:true});let calls=0;
 try{
  const prepare=db.prepare.bind(db);let injected=false;
  db.prepare=sql=>{
   const statement=prepare(sql);
   if(sql.startsWith('INSERT INTO mel_work_cycles')){
    const run=statement.run.bind(statement);
    statement.run=async()=>{injected=true;await startMaintenanceLease(db,{leaseId:'race',now:1,ttlMs:1000});return run();};
   }
   return statement;
  };
  const response=streamDirectWork({env:{DB:db,AI:{run:async()=>{calls++;}}},fetchImpl:async()=>{calls++;}});
  const events=(await response.text()).trim().split('\n').map(x=>JSON.parse(x));
  assert.equal(injected,true);assert.deepEqual(events,[{type:'error',code:'WORK_PAUSED_FOR_MAINTENANCE'}]);assert.equal(calls,0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM mel_work_cycles').first()).n,0);
 }finally{db.close();}
});

test('maintenance admission leaves an existing signed DAG byte-for-byte intact',async()=>{
 const {createWorkDag}=await import('../../src/work/work-dag.js');
 const {D1WorkDagStore}=await import('../../src/work/d1-work-dag-store.js');
 const db=sqliteD1({maintenanceFence:true});
 try{
  const store=new D1WorkDagStore(db,'signed-preserved');
  await store.createNew(createWorkDag({id:'signed-preserved',jobId:'job',goal:'preserve',nodes:[{id:'one',kind:'TASK',idempotent:true,payload:{capability:'echo',input:{value:'preserve'}}}]}));
  const before=await db.prepare("SELECT record_json FROM work_dags WHERE id='signed-preserved'").first();
  await startMaintenanceLease(db,{leaseId:'preserve',now:1,ttlMs:1000});
  assert.equal(await acquireD1WorkRunLease(db,'signed-preserved',{now:2000}),null);
  assert.deepEqual(await db.prepare("SELECT record_json FROM work_dags WHERE id='signed-preserved'").first(),before);
  assert.equal((await store.load()).id,'signed-preserved');
 }finally{db.close();}
});
