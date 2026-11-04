import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planCouncilDiffBatches, COUNCIL_REVIEW_BATCH_LIMIT_BYTES } from '../src/evolution/council-diff-batches.js';
import { runCouncilReview } from '../src/evolution/council-review.js';

const file=(path,n=10)=>
  'diff --git a/'+path+' b/'+path+'\n--- a/'+path+'\n+++ b/'+path+
  '\n@@ -0,0 +1,'+n+' @@\n'+('+const verified = "naïve–test";\n'.repeat(n));

test('multi-batch whole-file planning is deterministic and byte-for-byte complete',()=>{
  const diff=Array.from({length:12},(_,i)=>file('src/feature-'+i+'.js',160)).join('');
  const plan=planCouncilDiffBatches(diff);
  assert.equal(plan.ok,true);
  assert.ok(plan.totalBytes>48_000&&plan.batchCount>1);
  assert.equal(plan.fileCount,12);
  assert.equal(plan.status,'PENDING_ALL_BATCH_REVIEWS');
  assert.ok(plan.batches.every(b=>b.bytes<=COUNCIL_REVIEW_BATCH_LIMIT_BYTES));
  assert.equal(plan.batches.map(b=>b.diff).join(''),diff);
  assert.deepEqual(plan.batches.flatMap(b=>b.paths),
    Array.from({length:12},(_,i)=>'src/feature-'+i+'.js'));
  assert.equal(plan.batches.reduce((n,b)=>n+b.bytes,0),new TextEncoder().encode(diff).length);
});
test('oversize, malformed headers, too many batches and excessive source bytes all block',()=>{
  const code=(diff,opts)=>planCouncilDiffBatches(diff,opts).code;
  assert.equal(code('diff --git a/p b/p\n'+'x'.repeat(46_000)),'COUNCIL_REVIEW_SINGLE_FILE_TOO_LARGE');
  assert.equal(code('text before diff\ndiff --git a/p b/p\n'),'COUNCIL_REVIEW_BATCH_INPUT_INVALID');
  assert.equal(code('diff --git invalid header\n'),'COUNCIL_REVIEW_BATCH_INPUT_INVALID');
  assert.equal(code(file('x',20),{maxBatchBytes:1}),'COUNCIL_REVIEW_BATCH_INPUT_INVALID');
  const data=Array.from({length:8},(_,i)=>file('x'+i,75)).join('');
  assert.equal(code(data,{maxBatchBytes:3000,maxBatches:1}),'COUNCIL_REVIEW_TOO_MANY_BATCHES');
  assert.equal(code(data,{maxBatchBytes:3000,maxTotalBytes:3000}),'COUNCIL_REVIEW_TOTAL_TOO_LARGE');
});
test('oversized single Council calls never reach AI with truncated code',async()=>{
  let calls=0;
  const env={AI:{async run(){calls++;return {response:'{"verdict":"APPROVE","summary":"ok"}'};}}};
  const res=await runCouncilReview(env,{diff:file('safety.js',2000)});
  assert.equal(res.decision,'COUNCIL_DIFF_EXCEEDS_REVIEW_LIMIT');
  assert.deepEqual(res.reviews,[]);
  assert.equal(calls,0);
});
