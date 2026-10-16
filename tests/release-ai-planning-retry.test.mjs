import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url),
  'utf8',
);

test('production GEN2-38 model plan proof uses one bounded request and surfaces transport failures', () => {
  const start = workflow.indexOf('GEN_PLAN_CODE="$(curl');
  const end = workflow.indexOf('if [ "$GEN_PLAN_CODE" != "200" ]; then', start);
  assert.ok(start >= 0 && end > start, 'production plan generation gate exists');
  const proof = workflow.slice(start, end);
  assert.match(proof, /--max-time 120/);
  assert.doesNotMatch(proof, /--retry 1 --retry-all-errors/,
    'the fan-out already has bounded provider retries; do not add a second 120s curl retry');
  assert.match(proof, /"id":"work\.plan\.generate"/);
  assert.match(proof, /"maxCandidates":2/);
  assert.match(proof, /--output production-gen2-38-generated\.json/);
  assert.match(proof, /\|\| true\)"/,
    'curl transport failure must reach the explicit sanitized non-200 release gate');
  assert.match(workflow.slice(end, end + 500), /exit 55/,
    'provider or transport failure must still fail release verification and trigger rollback');
});

test('production release does not repeat mutating Work plan endpoints as transport retries', () => {
  const start = workflow.indexOf('PLAN_CODE="$(curl');
  const end = workflow.indexOf('if [ "$PLAN_CODE" != "200" ]; then', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(workflow.slice(start, end), /--retry-all-errors/,
    'only the non-persistent AI planning proof is eligible for transport retries');
});

test('production Council proof uses a bounded per-model deadline and one transient transport retry', () => {
  const start = workflow.indexOf('COUNCIL_CODE="$(curl');
  const end = workflow.indexOf('if [ "${COUNCIL_CODE}" != "200" ]; then', start);
  assert.ok(start >= 0 && end > start, 'production Council request is present');
  const proof = workflow.slice(start, end);
  assert.match(proof, /--max-time 115 --retry 1 --retry-all-errors --retry-delay 2/);
  assert.match(proof, /"id":"model\.council"/);
  assert.match(proof, /"maxCandidates":4,"timeoutMs":15000/);
  assert.match(proof, /--output production-mel-council-02\.json/);
  assert.match(workflow.slice(end, end + 330), /exit 52/,
    'failing both Council proof attempts must still stop the deployment');
  const checks = workflow.slice(end, end + 450);
  assert.match(checks, /scripts\/check-release-council-proof\.mjs/,
    'retry does not relax actual independent-model and synthesis checks');
});

test('production Council timeout leaves other write-capable proof calls without retries', () => {
  for (const identifier of ['SAVE_CODE="$(curl', 'GET_CODE="$(curl']) {
    const start = workflow.indexOf(identifier);
    assert.ok(start >= 0, `expected proof call ${identifier}`);
    const curlEnd = workflow.indexOf('--write-out', start);
    assert.ok(curlEnd > start);
    assert.doesNotMatch(workflow.slice(start, curlEnd), /--retry-all-errors/,
      'Council-only timeout hardening must not retry D1 mutation or subsequent proof calls');
  }
});
