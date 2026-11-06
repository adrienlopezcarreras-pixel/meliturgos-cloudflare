import test from 'node:test';
import assert from 'node:assert/strict';
import { councilObjectionReceipt } from '../scripts/write-council-objection-receipt.mjs';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('a scoped rejection preserves actionable blockers without publishing raw context', () => {
  const head = 'a'.repeat(40), base = 'b'.repeat(40);
  const receipt = councilObjectionReceipt({ head, base, decision: 'REJECTED',
    dependency_context: { source: 'private-source' }, prompt: 'private-prompt',
    reviews: [{ model: 'reviewer', verdict: 'REJECT', blocking: ['Missing the required boundary regression'],
      response: 'private-model-response', error: 'private-error' }],
  }, head, base);
  assert.deepEqual(receipt.reviews[0].blocking, ['Missing the required boundary regression']);
  assert.doesNotMatch(JSON.stringify(receipt), /private-/);
  assert.equal(receipt.diagnostic_only, true);
  assert.equal(receipt.release_authorized, false);
});

test('a stale or missing identity never produces an approval receipt', () => {
  const receipt = councilObjectionReceipt({ head: 'c'.repeat(40), base: 'b'.repeat(40), decision: 'APPROVED',
    reviews: [{ model: 'wrong-sha', verdict: 'APPROVE' }] }, 'a'.repeat(40), 'b'.repeat(40));
  assert.equal(receipt.decision, 'UNAVAILABLE');
  assert.deepEqual(receipt.reviews, []);
  assert.equal(receipt.release_authorized, false);
});

test('model timeouts remain diagnosable without exposing arbitrary provider exceptions', () => {
  const head='a'.repeat(40),base='b'.repeat(40);
  const receipt=councilObjectionReceipt({head,base,decision:'INSUFFICIENT_REVIEWERS',reviews:[
    {model:'slow',verdict:null,error:'REVIEW_TIMEOUT'},
    {model:'unsafe',verdict:null,error:'provider-private-message token=fixture'},
  ]},head,base);
  assert.equal(receipt.reviews[0].error_code,'REVIEW_TIMEOUT');
  assert.equal(receipt.reviews[1].error_code,null);
  assert.doesNotMatch(JSON.stringify(receipt),/provider-private-message|token=/);
});

test('the workflow artifact stays outside candidate git add -A and is never an approval input', () => {
  const workflow = readFileSync('.github/workflows/mel-candidate-promotion.yml', 'utf8');
  assert.match(workflow, /write-council-objection-receipt\.mjs "\$CAND" "\$MAIN" "\$RUNNER_TEMP\/council-review-objections\.json"/);
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/council-review-objections\.json/);
  assert.doesNotMatch(workflow, /DECISION=.*council-review-objections/);
});

test('canonical CLI filters remote D1 batches without workflow-relative imports',t=>{
 const dir=mkdtempSync(join(tmpdir(),'council-latest-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const output=join(dir,'receipt.json');
 const row={head:'a'.repeat(40),base:'b'.repeat(40),decision:'COUNCIL_BATCH_QUORUM_UNPROVEN',
  reviews:JSON.stringify([{model:'reviewer',verdict:'REJECT',blocking:['Inspect the actual code'],summary:'private-summary'}]),
  diff:'private-code',prompt:'private-prompt'};
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/write-council-objection-receipt.mjs',import.meta.url)),
  '--latest',output],{input:JSON.stringify([{results:Array(12).fill(row)}]),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const raw=readFileSync(output,'utf8'),receipt=JSON.parse(raw);
 assert.equal(receipt.receipts.length,10);assert.equal(receipt.release_authorized,false);
 assert.deepEqual(receipt.receipts[0].reviews[0].blocking,['Inspect the actual code']);
 assert.doesNotMatch(raw,/private-/);assert.equal(result.stdout,'');
 const workflow=readFileSync('.github/workflows/gen2-42-live-proof.yml','utf8');
 assert.match(workflow,/node scripts\/write-council-objection-receipt\.mjs --latest/);
 assert.doesNotMatch(workflow,/from ['"]\.\/scripts\/write-council-objection-receipt/);
});
