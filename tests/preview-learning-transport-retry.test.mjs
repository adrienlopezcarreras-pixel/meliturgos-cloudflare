import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const workflow=readFileSync('.github/workflows/deploy-candidate-preview.yml','utf8');
const first=workflow.indexOf('          refresh_preview_learning() {');
const last=workflow.indexOf("          refresh_preview_learning '/api/learning/benchmark/run'",first);
assert.ok(first>=0&&last>first,'Preview refresh helper must be present');
const func=workflow.slice(first,last).split('\n').map(line=>line.replace(/^ {10}/,'')).join('\n');
const all=workflow.slice(workflow.indexOf('      - name: Refresh zero-cost Benchmark and LoRA readiness'),workflow.indexOf('      - name: Upload learning refresh evidence'));

const curlShim=`#!/usr/bin/env bash
n="$(cat "$FAKE_COUNTER")"
n="$((n+1))"
echo "$n" > "$FAKE_COUNTER"
output=""
previous=""
for arg in "$@"; do
  if [ "$previous" = '--output' ]; then output="$arg"; fi
  previous="$arg"
done
if [ "$FAKE_MODE" = "transport-once" ] && [ "$n" = "1" ]; then
  printf '200'
  exit 56
fi
if [ "$FAKE_MODE" = "always-reset" ]; then
  printf '200'
  exit 56
fi
if [ "$FAKE_MODE" = "http-403" ]; then
  printf '403'
  exit 22
fi
printf '{"ok":true}' > "$output"
printf '200'
exit 0
`;

function invoke(mode) {
  const dir=mkdtempSync(join(tmpdir(),'mel-preview-refresh-'));
  try {
    writeFileSync(join(dir,'curl'),curlShim,{mode:0o755});
    writeFileSync(join(dir,'sleep'),'#!/usr/bin/env bash\nexit 0\n',{mode:0o755});
    writeFileSync(join(dir,'counter'),'0');
    const script='set -euo pipefail\n'+func+"\nrefresh_preview_learning '/api/learning/benchmark/run' benchmark-refresh.json 30\n";
    const result=spawnSync('bash',['-c',script],{
      cwd:dir,encoding:'utf8',timeout:10000,
      env:{...process.env,PATH:dir+':'+process.env.PATH,
        MEL_PREVIEW_PASSWORD:'test-only',BASE_URL:'https://preview.invalid',
        FAKE_COUNTER:join(dir,'counter'),FAKE_MODE:mode},
    });
    const attempts=Number(readFileSync(join(dir,'counter'),'utf8'));
    const content=result.status===0?readFileSync(join(dir,'benchmark-refresh.json'),'utf8'):null;
    return {status:result.status,attempts,stdout:result.stdout,stderr:result.stderr,content,error:result.error};
  }finally{rmSync(dir,{recursive:true,force:true});}
}

test('preview refresh retries only transport reset and requires completed HTTP transfer',()=>{
  const r=invoke('transport-once');
  assert.equal(r.status,0,JSON.stringify({error:r.error?.message,stderr:r.stderr}));
  assert.equal(r.attempts,2);
  assert.deepEqual(JSON.parse(r.content),{ok:true});
});
test('permanent HTTP rejection fails after one attempt without repeating paid or unauthorized work',()=>{
  const r=invoke('http-403');
  assert.notEqual(r.status,0);
  assert.equal(r.attempts,1);
});
test('repeated dropped connections fail closed after three bounded attempts',()=>{
  const r=invoke('always-reset');
  assert.notEqual(r.status,0);
  assert.equal(r.attempts,3);
});
test('normal successful refresh and independent app responses remain validated',()=>{
  const r=invoke('always-success');
  assert.equal(r.status,0);
  assert.equal(r.attempts,1);
  assert.match(all,/refresh_preview_learning '\/api\/learning\/lora\/prepare'/);
  assert.match(all,/if bench\.get\('ok'\) is not True/);
  assert.match(all,/if lora\.get\('ok'\) is not True/);
  assert.doesNotMatch(func,/lora\/benchmark|activateAdapter|--activate/);
});
