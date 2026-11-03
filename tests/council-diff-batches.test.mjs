import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planCouncilDiffBatches, COUNCIL_REVIEW_BATCH_LIMIT_BYTES } from '../src/evolution/council-diff-batches.js';
import { runCouncilReview } from '../src/evolution/council-review.js';

const file = (path, lines = 10) =>
  'diff --git a/' + path + ' b/' + path + '\n' +
  '--- a/' + path + '\n+++ b/' + path + '\n@@ -0,0 +1,' + lines + ' @@\n' +
  ('+const verified = "naïve–test";\n'.repeat(lines));

test('plans a large Council diff in whole-file batches with byte-for-byte coverage', () => {
  const diff = Array.from({length: 12}, (_, i) => file('src/feature-' + i + '.js', 160)).join('');
  const result = planCouncilDiffBatches(diff);
  assert.equal(result.ok, true);
  assert.ok(result.totalBytes > 48_000);
  assert.ok(result.batchCount > 1);
  assert.equal(result.fileCount, 12);
  assert.equal(result.status, 'PENDING_ALL_BATCH_REVIEWS');
  assert.ok(result.batches.every(b => b.bytes <= COUNCIL_REVIEW_BATCH_LIMIT_BYTES));
  assert.equal(result.batches.map(b => b.diff).join(''), diff);
  assert.deepEqual(result.batches.flatMap(b => b.paths),
    Array.from({length: 12}, (_, i) => 'src/feature-' + i + '.js'));
  assert.equal(result.batches.reduce((sum, b) => sum + b.bytes, 0), new TextEncoder().encode(diff).byteLength);
});
test('never silently drops an oversized file, bad header, excessive count or data', () => {
  assert.equal(planCouncilDiffBatches('diff --git a/p b/p\n'+'x'.repeat(46_000)).code,'COUNCIL_REVIEW_SINGLE_FILE_TOO_LARGE');
  assert.equal(planCouncilDiffBatches('text before diff\ndiff --git a/p b/p\n').code,'COUNCIL_REVIEW_BATCH_INPUT_INVALID');
  assert.equal(planCouncilDiffBatches('diff --git invalid header\n').code,'COUNCIL_REVIEW_BATCH_INPUT_INVALID');
  assert.equal(planCouncilDiffBatches(file('x',20),{maxBatchBytes:1}).code,'COUNCIL_REVIEW_BATCH_INPUT_INVALID');
  const list = Array.from({length: 8}, (_,i) => file('x' + i, 75)).join('');
  assert.equal(planCouncilDiffBatches(list,{maxBatchBytes:3000,maxBatches:1}).code,'COUNCIL_REVIEW_TOO_MANY_BATCHES');
  assert.equal(planCouncilDiffBatches(list,{maxBatchBytes:3000,maxTotalBytes:3000}).code,'COUNCIL_REVIEW_TOTAL_TOO_LARGE');
});
test('oversized Council input cannot be signed off from a truncated AI prompt', async () => {
  let queried = 0;
  const env={ AI:{ async run(){ queried++; return { response:'{"verdict":"APPROVE","summary":"OK"}' }; }}};
  const decision=await runCouncilReview(env,{diff:file('safety.js',2000)});
  assert.equal(decision.decision,'COUNCIL_DIFF_EXCEEDS_REVIEW_LIMIT');
  assert.deepEqual(decision.reviews,[]);
  assert.equal(queried,0);
});
test('promotion remains explicitly blocked above the one-request Council limit', () => {
  const workflow=readFileSync(new URL('../.github/workflows/mel-candidate-promotion.yml',import.meta.url),'utf8');
  assert.match(workflow,/COUNCIL_DIFF_EXCEEDS_REVIEW_LIMIT/);
  assert.match(workflow,/DIFF_BYTES.*-gt 48000/);
  assert.match(workflow,/prepare-council-review-batches\.mjs/);
  assert.match(workflow,/council-review-manifest\.json/);
  const handler=readFileSync(new URL('../src/evolution/council-review.js',import.meta.url),'utf8');
  assert.match(handler,/COUNCIL_DIFF_EXCEEDS_REVIEW_LIMIT/);
});
