import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

test('manifest contains all batches but grants no approval or diff content',()=>{
  const dir=mkdtempSync(join(tmpdir(),'council-'));
  try{
    const src=join(dir,'diff'),out=join(dir,'manifest');
    writeFileSync(src,Array.from({length:10},(_,i)=>
      'diff --git a/file'+i+' b/file'+i+'\n'+'+source\n'.repeat(1000)).join(''));
    execFileSync(process.execPath,[resolve('scripts/prepare-council-review-batches.mjs'),src,out]);
    const m=JSON.parse(readFileSync(out,'utf8'));
    assert.deepEqual([m.schema,m.status,m.approved,m.file_count],
      ['mel.council-review-batches/v1','PENDING_INDEPENDENT_COUNCIL',false,10]);
    assert.ok(m.batch_count>1&&m.batches.length===m.batch_count);
    assert.ok(m.batches.every(b=>b.reviewed===false));
    assert.equal(m.batches.reduce((n,b)=>n+b.bytes,0),m.total_bytes);
    assert.ok(!JSON.stringify(m).includes('+source'));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
