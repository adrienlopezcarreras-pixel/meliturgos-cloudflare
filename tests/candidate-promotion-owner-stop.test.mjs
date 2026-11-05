import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/mel-candidate-promotion.yml', import.meta.url), 'utf8');
const start = workflow.indexOf('          owner_max_still_authorizes_promotion() {');
const end = workflow.indexOf('          if [ "$MAIN" = "$CAND" ]; then', start);
const helper = start >= 0 && end > start
  ? workflow.slice(start, end).split('\n').map(s => s.replace(/^          /, '')).join('\n') : '';

function checkOwnerControl(payload, unavailable = false) {
  assert.ok(helper.includes('owner_max_still_authorizes_promotion()'), 'promotion helper is present');
  const script = [
    'set -euo pipefail',
    'CONTROL_URL=https://mel.test/api/gen2/autonomy/control',
    'curl() { if [ "${MOCK_CURL_FAIL:-0}" = "1" ]; then return 7; fi; printf "%s" "$MOCK_CONTROL_BODY"; }',
    helper,
    'if owner_max_still_authorizes_promotion; then echo OWNER_MAX_ALLOW; else echo OWNER_MAX_BLOCK; fi',
  ].join('\n');
  const run = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, MOCK_CONTROL_BODY: payload, MOCK_CURL_FAIL: unavailable ? '1' : '0' },
    timeout: 5000,
  });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim().split('\n').at(-1);
}

test('MAX candidate promotion authorizes only a fresh explicit unpaused owner MAX', () => {
  assert.equal(checkOwnerControl('{"max_autonomy":true,"paused":false}'), 'OWNER_MAX_ALLOW');
  for (const control of [
    '{"max_autonomy":true,"paused":true}',
    '{"max_autonomy":false,"paused":false}',
    '{"max_autonomy":true}',
    '{}',
    '{invalid-json',
  ]) assert.equal(checkOwnerControl(control), 'OWNER_MAX_BLOCK', control);
  assert.equal(checkOwnerControl('{"max_autonomy":true,"paused":false}', true), 'OWNER_MAX_BLOCK',
    'network failure may not authorize a main push');
});

test('both main promotion paths and both release dispatches recheck owner control', () => {
  const guardedPushes = workflow.match(/if ! owner_max_still_authorizes_promotion; then exit 0; fi\n\s+git -c http\.https:\/\/github\.com\/\.extraheader= push/g) || [];
  assert.equal(guardedPushes.length, 2, 'empty diff and Council-approved diff each revalidate STOP');
  const guardedDispatches = workflow.match(/if owner_max_still_authorizes_promotion; then\n\s+dispatch_release/g) || [];
  assert.equal(guardedDispatches.length, 2, 'release launch also requires a fresh owner authorization');
  assert.ok(workflow.includes('COUNCIL_REVIEW $CAND -> $DECISION'));
  assert.ok(workflow.includes('if [ "$DECISION" != "APPROVED" ]'));
  assert.ok(workflow.includes('if [ "$MAX" != "true" ]'));
  assert.ok(workflow.includes('OWNER_STOP_BEFORE_PROMOTION'));
});
