import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { GEN2_42_HANDOFF_DIAGNOSTIC_SQL, sanitizeGen242Handoffs, GEN2_42_DEPENDENCY_REASON_SQL, sanitizeGen242DependencyReasons } from '../scripts/read-gen2-42-handoff-diagnostics.mjs';

test('GEN2-42 D1 diagnostic only groups handoff status and never exports identifiers', async t=>{
 const db=sqliteD1(); t.after(()=>db.close());
 await db.prepare('CREATE TABLE capability_watch_state(id TEXT PRIMARY KEY,state_json TEXT,updated_at INTEGER)').run();
 const items=[
  {fingerprint:'SECRET_FINGERPRINT',handoff:{job_id:'SECRET_JOB',teacher_request_id:null,status:'REPAIR_REQUIRED',closed:false,code:'SECRET_DETAIL'}},
  {fingerprint:'SECRET_TWO',handoff:{job_id:'SECRET_JOB',teacher_request_id:'SECRET_REQUEST',status:'WAITING_TEACHER',closed:false}},
  {fingerprint:'SECRET_OLD',handoff:{status:'QUEUED',closed:false,code:'TEACHER_REQUEST_STALE_SHA',retryable:true}},
  {fingerprint:'SECRET_CLOSED',handoff:{status:'FAILED',closed:true}},
 ];
 await db.prepare('INSERT INTO capability_watch_state VALUES(?,?,?)').bind('ecosystem-discoveries-canonical',JSON.stringify({items,secret:'PRIVATE_PAYLOAD'}),1).run();
 const original=(await db.prepare('SELECT * FROM capability_watch_state').all()).results;
 const result=sanitizeGen242Handoffs((await db.prepare(GEN2_42_HANDOFF_DIAGNOSTIC_SQL).all()).results);
 assert.equal(result.diagnostic_only,true);
 assert.deepEqual(result.groups.map(g=>g.handoff_class).sort(),['QUEUED','REPAIR_REQUIRED','WAITING_TEACHER']);
 assert.equal(result.groups.find(g=>g.handoff_class==='WAITING_TEACHER').with_teacher_request,1);
 assert.equal(result.groups.find(g=>g.handoff_class==='QUEUED').stale_sha_entries,1);
 assert.equal(result.groups.find(g=>g.handoff_class==='QUEUED').retryable_entries,1);
 assert.doesNotMatch(JSON.stringify(result),/SECRET|PRIVATE|FINGERPRINT|job_id|teacher_request_id/);
 assert.deepEqual((await db.prepare('SELECT * FROM capability_watch_state').all()).results,original);
});
test('GEN2-42 sanitization bounds values and drops raw payloads',()=>{
 const groups=sanitizeGen242Handoffs([{handoff_class:'SECRET',entries:-1,with_teacher_request:'8',retryable_entries:100001,stale_sha_entries:0,job_id:'PRIVATE'}]).groups;
 assert.deepEqual(groups,[{handoff_class:'OTHER',entries:null,with_teacher_request:null,retryable_entries:null,stale_sha_entries:0}]);
 assert.equal(sanitizeGen242Handoffs(Array.from({length:20},()=>({handoff_class:'FAILED',entries:1}))).groups.length,12);
});

test('GEN2-42 dependency reason query is read-only and exposes classifications only', async t=>{
 const db=sqliteD1(); t.after(()=>db.close());
 await db.prepare('CREATE TABLE dev_jobs(id TEXT,requested_by TEXT,status TEXT,optional_context TEXT,result_json TEXT)').run();
 const records=[
  ['PRIVATE_JOB_1','mel-autonomy','WAITING_DEPENDENCY',JSON.stringify({source:'ecosystem-watch'}),JSON.stringify({dependency_wait:{reason:'ROADMAP_PRIORITY_ABSOLUTE',prerequisites:['PRIVATE_FOUNDATION']},teacher_bridge:{request_id:'SECRET_TEACHER'}})],
  ['PRIVATE_JOB_2','mel-autonomy','WAITING_DEPENDENCY',JSON.stringify({source:'ecosystem-watch'}),JSON.stringify({dependency_wait:{prerequisites:['PRIVATE_OTHER']}})],
  ['PRIVATE_JOB_3','mel-autonomy','WAITING_DEPENDENCY',JSON.stringify({source:'unrelated'}),JSON.stringify({dependency_wait:{reason:'ROADMAP_PRIORITY_ABSOLUTE'}})],
 ];
 for(const record of records) await db.prepare('INSERT INTO dev_jobs VALUES(?,?,?,?,?)').bind(...record).run();
 const before=(await db.prepare('SELECT * FROM dev_jobs').all()).results;
 const diagnostic=sanitizeGen242DependencyReasons((await db.prepare(GEN2_42_DEPENDENCY_REASON_SQL).all()).results);
 assert.equal(diagnostic.diagnostic_only,true);
 assert.deepEqual(diagnostic.groups.map(g=>g.reason_class).sort(),['OTHER_OR_UNRECORDED','ROADMAP_PRIORITY_ABSOLUTE']);
 assert.deepEqual(diagnostic.groups.map(g=>g.with_prerequisites),[1,1]);
 assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE|SECRET|TEACHER|job_id|request_id|prerequisites:/);
 assert.deepEqual((await db.prepare('SELECT * FROM dev_jobs').all()).results,before);
});

test('GEN2-42 dependency reason sanitizer fails closed for raw inputs',()=>{
 const x=sanitizeGen242DependencyReasons([{reason_class:'PRIVATE',entries:-2,with_prerequisites:'1',job_id:'SECRET'}]).groups;
 assert.deepEqual(x,[{reason_class:'OTHER_OR_UNRECORDED',entries:null,with_prerequisites:null}]);
});
