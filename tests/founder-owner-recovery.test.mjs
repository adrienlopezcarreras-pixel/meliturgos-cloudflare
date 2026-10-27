import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { recoverFounderOwner,ORIGINAL,DUPLICATE } from '../scripts/recover-founder-owner.mjs';
import { replayFounderSnapshot } from '../scripts/reproduce-founder-runtime-failure.mjs';
import { jobActivityTimestamp } from '../src/evolution/autonomy-job-epoch.js';
const SHA='b'.repeat(40);
async function fixture(){
  const db=sqliteD1();const repo=new D1DevJobRepository(db);await repo.init();
  await db.prepare('CREATE TABLE revenue_watch(url TEXT,data TEXT)').run();
  await repo.create({id:ORIGINAL,requested_by:'mel-autonomy',goal:'original objective',optional_context:{roadmap_id:'MEL-FOUNDER-01'}});
  const result={runtime_retry:{attempts:2,last_error:"Cannot read properties of undefined (reading 'length')"},dev_bridge:{status:'REPAIR_REQUIRED',needs_repair:true},private:'PRIVATE_ORIGINAL'};
  await repo.update(ORIGINAL,{status:'CANCELLED',result_json:result,patch_json:{summary:'real repair'},tests_json:[{command:'test',passed:false}],error:'ACTIVITY_LIST_RESET'});
  await repo.create({id:DUPLICATE,requested_by:'mel-autonomy',goal:'duplicate objective',optional_context:{roadmap_id:'MEL-FOUNDER-01'}});
  const epoch=Date.now()+100;
  await db.prepare('INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)').bind('activity-list-epoch',epoch,'RESET','{}').run();
  await db.prepare('INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)').bind('mel-autonomy-control',epoch,'MAX_AUTONOMY',JSON.stringify({launch_approved_sha:SHA})).run();
  return {db,repo,epoch};
}
test('owner recovery preserves real tests, patch and creation, removes only the duplicate and admits the original epoch',async()=>{
  const {db,repo,epoch}=await fixture();
  try {
    const before=await repo.get(ORIGINAL);
    const proof=await recoverFounderOwner(db,{expectedSha:SHA});
    assert.equal(proof.ok,true);assert.equal(proof.ci_verified,false);assert.equal(await repo.get(DUPLICATE),null);
    const after=await repo.get(ORIGINAL);assert.equal(after.status,'QUEUED');assert.equal(after.created_at,before.created_at);
    assert.deepEqual(after.tests_json,before.tests_json);assert.deepEqual(after.patch_json,before.patch_json);assert.equal(after.result_json.private,'PRIVATE_ORIGINAL');
    assert.equal(after.result_json.runtime_retry,undefined);assert.equal(jobActivityTimestamp(after),epoch);
    assert.doesNotMatch(JSON.stringify(proof),/PRIVATE_ORIGINAL/);
    assert.equal((await db.prepare("SELECT status FROM dev_bridge_state WHERE bridge_id='mel-global-maintenance-fence'").first()).status,'RUNNING');
  }finally{db.close();}
});
test('after interrupted duplicate removal the durable backup and owned fence permit safe completion',async()=>{
  const {db,repo}=await fixture();let fail=true;
  const wrapper={prepare(sql){if(sql.startsWith('UPDATE dev_jobs SET status=\'QUEUED\'')&&fail){fail=false;return {bind(){return this;},run(){throw Error('simulated interrupt');}};}return db.prepare(sql);}};
  try {
    await assert.rejects(recoverFounderOwner(wrapper,{expectedSha:SHA}),/simulated interrupt/);
    assert.equal(await repo.get(DUPLICATE),null);assert.equal((await repo.get(ORIGINAL)).status,'CANCELLED');
    assert.equal((await db.prepare("SELECT status FROM dev_bridge_state WHERE bridge_id='mel-global-maintenance-fence'").first()).status,'PAUSED');
    assert.equal((await recoverFounderOwner(db,{expectedSha:SHA})).ok,true);
    assert.equal((await repo.get(ORIGINAL)).status,'QUEUED');
  }finally{db.close();}
});
test('wrong deployed approval SHA never changes original or duplicate',async()=>{
  const {db,repo}=await fixture();try{const before=await repo.list({full:true});await assert.rejects(recoverFounderOwner(db,{expectedSha:'c'.repeat(40)}),/SHA_MISMATCH/);assert.deepEqual(await repo.list({full:true}),before);}finally{db.close();}
});
test('snapshot replay retains every real result field and never modifies its input',async()=>{
  const row={id:ORIGINAL,result_json:JSON.stringify({dev_bridge:{needs_repair:true},private:'PRIVATE_SNAPSHOT'}),optional_context:'{}'};
  const before=JSON.stringify(row);
  await replayFounderSnapshot(row,async(_env,options)=>{const job=await options.repository.get(ORIGINAL);assert.equal(job.result_json.private,'PRIVATE_SNAPSHOT');assert.equal(job.status,'TEACHER_APPROVED');return {};});
  assert.equal(JSON.stringify(row),before);
});


test('the real fixed core accepts the captured repair result shape without the focused length failure',async()=>{
  const {runAutonomyRuntimeTick}=await import('../src/evolution/autonomy-runtime-core.js');
  const row={id:ORIGINAL,result_json:JSON.stringify({teacher_bridge:null,dev_bridge:{status:'REPAIR_REQUIRED',needs_repair:true},runtime_retry:{attempts:2,last_error:"Cannot read properties of undefined (reading 'length')"}}),plan_json:JSON.stringify({preflight:null,revision:{reason:'TEACHER_APPROVAL_CANDIDATE_SHA_STALE'}}),optional_context:JSON.stringify({roadmap_id:'MEL-FOUNDER-01'})};
  const result=await replayFounderSnapshot(row,runAutonomyRuntimeTick);
  assert.equal(result.ok,true);assert.ok(result.progress);assert.deepEqual(result.candidate_ci.repaired,[]);
});


test('explicit original recovery archives and supersedes a newer active generation without deleting its journal',async()=>{
  const {db,repo}=await fixture();
  try {
    await repo.update(DUPLICATE,{status:'CANCELLED',error:'ACTIVITY_LIST_RESET'});
    const newer=await repo.create({id:'new-current-generation',requested_by:'mel-autonomy',goal:'same original objective',optional_context:{roadmap_id:'MEL-FOUNDER-01'}});
    const proof=await recoverFounderOwner(db,{expectedSha:SHA});
    assert.equal(proof.ok,true);assert.deepEqual(proof.superseded_replacements,[newer.id]);
    assert.equal((await repo.get(newer.id)).status,'CANCELLED');
    assert.equal((await repo.get(newer.id)).error,'SUPERSEDED_BY_OWNER_ORIGINAL_RESTORE');
    const archive=await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?').bind(proof.backup_key).first();
    assert.equal(JSON.parse(archive.metadata_json).replacements[0].id,newer.id);
    assert.equal((await repo.get(ORIGINAL)).status,'QUEUED');assert.equal(await repo.get(DUPLICATE),null);
  }finally{db.close();}
});
