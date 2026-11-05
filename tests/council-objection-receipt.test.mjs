import test from 'node:test';
import assert from 'node:assert/strict';
import { councilObjectionReceipt } from '../scripts/write-council-objection-receipt.mjs';
import { readFileSync } from 'node:fs';

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
