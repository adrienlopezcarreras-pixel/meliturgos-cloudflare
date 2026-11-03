import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

test('Council preflight produces a content-free manifest, not an approval',()=>{
  const root=mkdtempSync(join(tmpdir(),'council-batches-'));
  try {
    const diff=Array.from({length:10},(_,i)=>'diff --git a/src/file'+i+'.js b/src/file'+i+'.js\n'+'+source\n'.repeat(1000)).join('');
    const source=join(root,'council.diff'),destination=join(root,'manifest.json');
    writeFileSync(source,diff);
    execFileSync(process.execPath,[resolve('scripts/prepare-council-review-batches.mjs'),source,destination],{stdio:'pipe'});
    const manifest=JSON.parse(readFileSync(destination,'utf8'));
    assert.equal(manifest.schema,'mel.council-review-batches/v1');
    assert.equal(manifest.status,'PENDING_INDEPENDENT_COUNCIL');
    assert.equal(manifest.approved,false);
    assert.ok(manifest.batch_count>1);
    assert.equal(manifest.file_count,10);
    assert.equal(manifest.batches.length,manifest.batch_count);
    assert.ok(manifest.batches.every(batch=>batch.reviewed===false));
    assert.equal(manifest.batches.reduce((n,b)=>n+b.bytes,0),manifest.total_bytes);
    assert.ok(!JSON.stringify(manifest).includes('+source'));
  } finally {rmSync(root,{recursive:true,force:true});}
});
