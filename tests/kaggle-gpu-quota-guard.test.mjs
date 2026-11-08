import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectKaggleGpuQuota} from '../scripts/kaggle-gpu-quota-guard.mjs';
test('Kaggle explicit zero free GPU blocks launch',()=>{
 assert.deepEqual(inspectKaggleGpuQuota([{resource:'GPU',used:'30.11h',remaining:'0.00h'}]),{status:'EXHAUSTED'});
 assert.deepEqual(inspectKaggleGpuQuota([{resource:'CPU',remaining:'0.00h'},{resource:'GPU',remaining:'0h'}]),{status:'EXHAUSTED'});
});
test('positive quota passes while missing or malformed data stays unknown',()=>{
 for(const remaining of ['0.01h','8.75h','20h'])assert.deepEqual(inspectKaggleGpuQuota([{resource:'GPU',remaining}]),{status:'AVAILABLE'});
 for(const q of [null,{},[],[{resource:'GPU'}],[{resource:'GPU',remaining:'unknown'}],[{resource:'CPU',remaining:'0h'}],[{resource:'GPU',remaining:'0h injected'}]])assert.deepEqual(inspectKaggleGpuQuota(q),{status:'UNKNOWN'});
});

test('quota guard CLI exits nonzero before launch for explicit zero GPU',async t=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'mel-kaggle-quota-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const json=join(dir,'quota.json');
 const cli=new URL('../scripts/kaggle-gpu-quota-guard.mjs',import.meta.url);
 for(const [remaining,expected] of [['0.00h',3],['0h',3],['0.01h',0]]){
  writeFileSync(json,JSON.stringify([{resource:'GPU',remaining}]));
  const run=spawnSync(process.execPath,[cli.pathname,json],{encoding:'utf8'});
  assert.equal(run.status,expected,remaining);
  if(expected===3)assert.match(run.stderr,/KAGGLE_GPU_WEEKLY_QUOTA_EXHAUSTED/);
 }
 writeFileSync(json,'not-json');
 const unknown=spawnSync(process.execPath,[cli.pathname,json],{encoding:'utf8'});
 assert.equal(unknown.status,0);
 assert.match(unknown.stdout,/KAGGLE_GPU_QUOTA_UNKNOWN/);
});
