import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const script=await readFile(new URL('../scripts/release-autonomy-deep-proof.sh',import.meta.url),'utf8');
const start=script.indexOf('  # Never expose D1/job/Mentor/bootstrap payloads.');
const end=script.indexOf("\n  echo 'Production autonomy proof response withheld",start);
assert.ok(start>0&&end>start,'sanitized GEN2-42 diagnostic block must exist');
const block=script.slice(start,end);
const js=block.slice(block.indexOf("node - <<'NODE'")+"node - <<'NODE'".length,block.lastIndexOf("\nNODE"));
function diagnostic(payload){
  const src=js.replace("fs.readFileSync('production-capability-watch-proof.json','utf8')",JSON.stringify(payload));
  return execFileSync(process.execPath,['--input-type=commonjs','-e',src],{encoding:'utf8'}).trim();
}
test('409 diagnostic reports only bounded reason code',()=>{
  assert.equal(diagnostic(JSON.stringify({error:'GEN2_42_HANDOFF_CONFLICT',job_id:'private-id',message:'secret'})),'GEN2-42 sanitized reason: GEN2_42_HANDOFF_CONFLICT');
});
test('409 diagnostic never prints secrets, arbitrary strings, or raw JSON',()=>{
  const output=diagnostic(JSON.stringify({error:'secret: leaked',reason:'BAD REASON',status:'CONFLICT',token:'secret'}));
  assert.equal(output,'GEN2-42 sanitized reason: CONFLICT');
  assert.doesNotMatch(output,/secret|BAD REASON|token/);
});
test('non-JSON proof remains fail-closed and sanitized',()=>{
  assert.equal(diagnostic('<html>secret</html>'),'GEN2-42 sanitized reason: NON_JSON_RESPONSE');
});
test('release verification still fails when handoff evidence is not 200',()=>{
  assert.match(script,/test "\$\{CAPABILITY_WATCH_READY\}" = "1"/);
  assert.match(script,/GEN2-42 handoff proof attempt/);
});

test('uppercase-looking secret is not accepted as a diagnostic reason',()=>{
  const output=diagnostic(JSON.stringify({error:'TOPSECRETAPIKEY123',reason:'PRIVATE_TOKEN_ABC123',status:'CONFLICT'}));
  assert.equal(output,'GEN2-42 sanitized reason: CONFLICT');
  assert.doesNotMatch(output,/TOPSECRETAPIKEY123|PRIVATE_TOKEN_ABC123/);
});
test('unknown all-uppercase codes fail closed',()=>{
  assert.equal(diagnostic(JSON.stringify({error:'UNREVIEWED_REASON_123'})),'GEN2-42 sanitized reason: UNCLASSIFIED_RESPONSE');
});

test('the actual NOT_READY release status is reported without exposing its handoff payload',()=>{
  assert.equal(diagnostic(JSON.stringify({status:'GEN2_42_TEACHER_HANDOFF_NOT_READY',open_handoffs:[{job_id:'private'}]})),'GEN2-42 sanitized reason: GEN2_42_TEACHER_HANDOFF_NOT_READY');
});

test('409 diagnostic exposes only bounded aggregate handoff counts, never identifiers',()=>{
  const out=diagnostic(JSON.stringify({status:'GEN2_42_TEACHER_HANDOFF_NOT_READY',open_handoff_count:3,teacher_proven_handoff_count:0,blocked_open_handoff_count:3,released_stale_teacher_requeue_count:1,open_handoffs:[{job_id:'private-id',teacher_request_id:'secret'}],token:'DO_NOT_LOG'}));
  assert.match(out,/GEN2-42 sanitized reason: GEN2_42_TEACHER_HANDOFF_NOT_READY/);
  assert.match(out,/GEN2-42 sanitized counts: open=3 teacher_proven=0 blocked=3 stale_requeued=1/);
  assert.doesNotMatch(out,/private-id|DO_NOT_LOG|secret/);
});
test('409 diagnostic rejects malformed or excessive count values',()=>{
  const out=diagnostic(JSON.stringify({status:'GEN2_42_TEACHER_HANDOFF_NOT_READY',open_handoff_count:'3',teacher_proven_handoff_count:-1,blocked_open_handoff_count:100001,released_stale_teacher_requeue_count:2}));
  assert.match(out,/GEN2-42 sanitized counts: stale_requeued=2/);
  assert.doesNotMatch(out,/open=|teacher_proven=|blocked=/);
});

test('409 diagnostic classifies blocked backlog without leaking statuses or ids',()=>{
 const out=diagnostic(JSON.stringify({status:'GEN2_42_TEACHER_HANDOFF_NOT_READY',blocked_queued_handoff_count:2,blocked_council_complete_handoff_count:1,blocked_other_handoff_count:4,open_handoffs:[{job_id:'PRIVATE'}]}));
 assert.match(out,/blocked_queued=2 blocked_council_complete=1 blocked_other=4/);
 assert.doesNotMatch(out,/PRIVATE|job_id/);
});

test('GEN2-42 redacted log counts jobs, not private job identifiers',()=>{
 const out=diagnostic(JSON.stringify({status:'GEN2_42_TEACHER_HANDOFF_NOT_READY',blocked_distinct_job_count:2,open_handoffs:[{job_id:'PRIVATE_INTERNAL_JOB'}]}));
 assert.match(out,/GEN2-42 sanitized counts: distinct_jobs=2/);
 assert.doesNotMatch(out,/PRIVATE_INTERNAL_JOB|open_handoffs/);
});

test('409 diagnostic splits blocked durable job groups without leaking identities',()=>{
 const out=diagnostic(JSON.stringify({status:'GEN2_42_TEACHER_HANDOFF_NOT_READY',blocked_other_handoff_count:3,blocked_failed_handoff_count:1,blocked_repair_required_handoff_count:1,blocked_waiting_dependency_handoff_count:1,open_handoffs:[{job_id:'SECRET_JOB',status:'REPAIR_REQUIRED'}],token:'PRIVATE'}));
 assert.match(out,/blocked_other=3 blocked_failed=1 blocked_repair_required=1 blocked_waiting_dependency=1/);
 assert.doesNotMatch(out,/SECRET_JOB|PRIVATE|job_id|open_handoffs|"status"/);
});
test('409 diagnostic rejects untrusted subgroup values',()=>{
 const out=diagnostic(JSON.stringify({status:'GEN2_42_TEACHER_HANDOFF_NOT_READY',blocked_failed_handoff_count:'1',blocked_repair_required_handoff_count:-1,blocked_waiting_dependency_handoff_count:100001}));
 assert.doesNotMatch(out,/blocked_failed=|blocked_repair_required=|blocked_waiting_dependency=/);
});
