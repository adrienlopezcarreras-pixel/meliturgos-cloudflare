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
