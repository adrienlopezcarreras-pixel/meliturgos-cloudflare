import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { GEN2_42_HANDOFF_DIAGNOSTIC_SQL, sanitizeGen242Handoffs } from '../scripts/read-gen2-42-handoff-diagnostics.mjs';

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
