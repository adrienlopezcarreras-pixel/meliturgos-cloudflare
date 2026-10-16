import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url),
  'utf8',
);

test('production GEN2-38 model plan proof gets exactly one bounded transport retry', () => {
  const start = workflow.indexOf('GEN_PLAN_CODE="$(curl');
  const end = workflow.indexOf('if [ "$GEN_PLAN_CODE" != "200" ]; then', start);
  assert.ok(start >= 0 && end > start, 'production plan generation gate exists');
  const proof = workflow.slice(start, end);
  assert.match(proof, /--max-time 120 --retry 1 --retry-all-errors --retry-delay 2/);
  assert.match(proof, /"id":"work\.plan\.generate"/);
  assert.match(proof, /--output production-gen2-38-generated\.json/);
  assert.match(workflow.slice(end, end + 500), /exit 55/,
    'unsuccessful retries must still fail release verification and trigger rollback');
});

test('production release does not repeat mutating Work plan endpoints as transport retries', () => {
  const start = workflow.indexOf('PLAN_CODE="$(curl');
  const end = workflow.indexOf('if [ "$PLAN_CODE" != "200" ]; then', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(workflow.slice(start, end), /--retry-all-errors/,
    'only the non-persistent AI planning proof is eligible for transport retries');
});
