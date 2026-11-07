import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { providerRetryContext } from '../src/evolution/provider-exhaustion-rotation.js';
import { ACTIVE_MISSION_DIAGNOSTIC_SQL, sanitizeActiveMissions } from '../scripts/read-active-mission-diagnostics.mjs';

test('bounded active diagnostic explains real SQL admission without returning private context or changing jobs', async t => {
  const db = sqliteD1(); t.after(() => db.close());
  await db.prepare('CREATE TABLE dev_jobs (id TEXT,status TEXT,requested_by TEXT,candidate_branch TEXT,optional_context TEXT,result_json TEXT,created_at INTEGER)').run();
  for (const [id, requested_by, status] of [['current','mel-autonomy','TEACHER_APPROVED'], ['owner','owner-chat','TEACHER_APPROVED'], ['terminal','mel-autonomy','COMPLETED']]) {
    const result = { autonomy_deferral: { phase: 'bridge', code: 'MENTOR_NO_VALID_CODE_PROPOSAL', attempts: 3, max_attempts: 3, exhausted: true },
      teacher_bridge: { status: 'ANSWERED', review: { target_sha: 'PRIVATE_SHA', request_id: 'PRIVATE_REQUEST' } }, private_prompt: 'PRIVATE_PROMPT' };
    result.autonomy_deferral.context = providerRetryContext({ candidate_branch: 'PRIVATE_BRANCH', result_json: result });
    await db.prepare('INSERT INTO dev_jobs VALUES(?,?,?,?,?,?,?)').bind(id,status,requested_by,'PRIVATE_BRANCH',JSON.stringify({roadmap_id:'ROADMAP-PROOF-GEN2-28',private:'PRIVATE_GOAL'}),JSON.stringify(result),1).run();
  }
  const before = (await db.prepare('SELECT * FROM dev_jobs ORDER BY id').all()).results;
  const safe = sanitizeActiveMissions((await db.prepare(ACTIVE_MISSION_DIAGNOSTIC_SQL).all()).results);
  assert.equal(safe.jobs.length, 1); assert.equal(safe.jobs[0].roadmap_id, 'ROADMAP-PROOF-GEN2-28');
  assert.equal(safe.jobs[0].context_matches, true); assert.equal(safe.jobs[0].admission_rotatable, true);
  assert.equal(safe.jobs[0].attempts, 3); assert.equal(safe.jobs[0].exhausted, true);
  assert.equal(JSON.stringify(safe).includes('PRIVATE'), false);
  assert.deepEqual((await db.prepare('SELECT * FROM dev_jobs ORDER BY id').all()).results, before);
  await db.prepare("UPDATE dev_jobs SET result_json=json_set(result_json,'$.teacher_bridge.status','WAITING_TEACHER') WHERE id='current'").run();
  const waiting = sanitizeActiveMissions((await db.prepare(ACTIVE_MISSION_DIAGNOSTIC_SQL).all()).results);
  assert.equal(waiting.jobs[0].admission_rotatable, false, 'an active Teacher transport must not yield the SQL slot');
  await db.prepare("UPDATE dev_jobs SET result_json=json_set(result_json,'$.teacher_bridge.status','ANSWERED','$.autonomy_deferral.context','stale') WHERE id='current'").run();
  const stale = sanitizeActiveMissions((await db.prepare(ACTIVE_MISSION_DIAGNOSTIC_SQL).all()).results);
  assert.equal(stale.jobs[0].context_matches, false); assert.equal(stale.jobs[0].admission_rotatable, false);
  assert.equal(before.length, (await db.prepare('SELECT * FROM dev_jobs').all()).results.length);
});
test('active diagnostics cap rows and discard raw strings, identifiers and unexpected payload fields', () => {
  const rows = Array.from({length: 12}, () => ({ roadmap_id:'PRIVATE_GOAL', status:'private message', attempts:-2, retry_after:'123', context_matches:'PRIVATE', raw:'PRIVATE' }));
  const result = sanitizeActiveMissions(rows);
  assert.equal(result.jobs.length, 10); assert.equal(result.jobs[0].roadmap_id, null);
  assert.equal(result.jobs[0].status, 'UNSTRUCTURED_VALUE_REDACTED'); assert.equal(result.jobs[0].attempts, null);
  assert.equal(result.jobs[0].retry_after, null); assert.equal(result.jobs[0].context_matches, false);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});


test('Mentor diagnostics expose bounded validator codes and stages, never replies or rejection detail', async t => {
  const db = sqliteD1(); t.after(() => db.close());
  await db.prepare('CREATE TABLE dev_jobs (id TEXT,status TEXT,requested_by TEXT,candidate_branch TEXT,optional_context TEXT,result_json TEXT,created_at INTEGER)').run();
  const result = { bridge_preparation_diagnostic: {mentor_failure_codes: Array.from({length:12}, (_,i) => ({
    code: i === 0 ? 'MENTOR_UNINSPECTED_EDIT' : 'PRIVATE_UNTRUSTED_VALUE', stage: i === 0 ? 'repair' : 'PRIVATE_STAGE',
    detail: 'PRIVATE_SOURCE_OR_REPLY', provider: 'PRIVATE_PROVIDER',
  }))} };
  await db.prepare('INSERT INTO dev_jobs VALUES(?,?,?,?,?,?,?)')
    .bind('job','TEACHER_APPROVED','mel-autonomy',null,JSON.stringify({roadmap_id:'GEN2-16'}),JSON.stringify(result),1).run();
  const rows = (await db.prepare(ACTIVE_MISSION_DIAGNOSTIC_SQL).all()).results;
  assert.equal(JSON.stringify(rows).includes('PRIVATE_SOURCE_OR_REPLY'), false);
  assert.equal(JSON.stringify(rows).includes('PRIVATE_PROVIDER'), false);
  const safe = sanitizeActiveMissions(rows);
  assert.equal(safe.jobs[0].mentor_failures.length,8);
  assert.deepEqual(safe.jobs[0].mentor_failures[0],{code:'MENTOR_UNINSPECTED_EDIT',stage:'repair'});
  assert.deepEqual(safe.jobs[0].mentor_failures[1],{code:'OTHER_FAILURE',stage:'unknown'});
  assert.equal(JSON.stringify(safe).includes('PRIVATE'),false);
  assert.deepEqual(sanitizeActiveMissions([{mentor_failures:'malformed'}]).jobs[0].mentor_failures,[]);
});
