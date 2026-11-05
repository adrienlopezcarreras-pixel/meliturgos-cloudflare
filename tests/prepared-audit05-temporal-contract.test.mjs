import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const packet=JSON.parse(readFileSync('prepared/MEL-AUDIT-05.json','utf8'));
const changes=new Map(packet.changes.map(file=>[file.path,file]));
const source=changes.get('src/diagnostics/domain-audit.js').content;
// Execute the actual proposed pure audit, not a second implementation. The
// unrelated imported chat/architecture helpers are never invoked here.
const executable=source.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'');
const auditCore=runInNewContext(executable+'\nauditCore;',{}, {timeout:1000});
const NOW=Date.parse('2026-10-24T10:00:00Z'),H=3600000,WEEK=7*24*H;

test('the prepared AUDIT-05 packet retains source, executable regressions and base identities',()=>{
  assert.equal(packet.roadmap_id,'MEL-AUDIT-05');
  assert.deepEqual([...changes.keys()].sort(),['src/diagnostics/domain-audit.js','tests/domain-audit.test.mjs']);
  for(const file of changes.values())assert.match(file.base_sha256,/^[a-f0-9]{64}$/);
  assert.match(changes.get('tests/domain-audit.test.mjs').content,/healthy millisecond timestamps serialized as strings/);
});

test('the real proposed audit produces no repairs for healthy serialized millisecond data',()=>{
  const candidates=Array.from({length:101},()=>({status:'PENDING',created_at:String(NOW-H)}));
  const findings=auditCore({memory:{candidates},sessions:{rows:[{expires_at:String(NOW+H)}]},lastBackupAt:String(NOW-H)},{now:NOW});
  assert.equal(findings.length,0);
});

test('the proposed audit still detects the exact older and expired rows plus an absent backup',()=>{
  const candidates=[...Array.from({length:101},()=>({status:'PENDING',created_at:NOW-WEEK-1})),
    {status:'PENDING',created_at:NOW-WEEK},{status:'CONSOLIDATED',created_at:NOW-10*WEEK}];
  const findings=auditCore({memory:{candidates},sessions:{rows:[{expires_at:NOW-1},{expires_at:NOW},{expires_at:NOW+H}]},lastBackupAt:null},{now:NOW});
  assert.deepEqual(Array.from(findings,row=>row.code),['MEMORY_UNCONSOLIDATED','SECURITY_EXPIRED_SESSIONS_KEPT','BACKUP_STALE']);
  assert.match(findings[0].detail,/^101 souvenirs/);
  assert.match(findings[1].detail,/^1 sessions/);
});
