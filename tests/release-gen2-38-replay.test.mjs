import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const proof = readFileSync(new URL('../scripts/release-autonomy-deep-proof.sh', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
const start = proof.indexOf('# Every workflow attempt must create its own D1 proof record.');
const end = proof.indexOf('\nPLAN_CODE=', start);
assert.ok(start >= 0 && end > start, 'GEN2-38 release identity block must exist');
const identityBlock = proof.slice(start, end);

function resolveProofId(runId, attempt) {
  const env = { ...process.env, EXPECTED_SHA: 'a'.repeat(40) };
  if (runId == null) delete env.GITHUB_RUN_ID;
  else env.GITHUB_RUN_ID = String(runId);
  if (attempt == null) delete env.GITHUB_RUN_ATTEMPT;
  else env.GITHUB_RUN_ATTEMPT = String(attempt);
  return spawnSync('bash', ['-c', ['set -euo pipefail', identityBlock, 'printf %s "$PLAN_ID"'].join('\n')], { env, encoding: 'utf8' });
}

test('GEN2-38 proof plan ids are unique per release run and rerun attempt', () => {
  const first = resolveProofId('1000', '1');
  const nextRun = resolveProofId('1001', '1');
  const retry = resolveProofId('1000', '2');
  for (const item of [first, nextRun, retry]) assert.equal(item.status, 0, item.stderr);
  assert.equal(first.stdout, 'release-proof-aaaaaaaaaaaa-1000-1');
  assert.notEqual(first.stdout, nextRun.stdout);
  assert.notEqual(first.stdout, retry.stdout);
});

test('GEN2-38 refuses missing or malformed workflow identity rather than reusing a plan', () => {
  for (const [run, attempt] of [[null, '1'], ['1000', null], ['bad-run', '1'], ['1000', 'attempt-2']]) {
    assert.notEqual(resolveProofId(run, attempt).status, 0);
  }
});

test('GEN2-38 save failures remain blocking and redact raw production responses', () => {
  const start = proof.indexOf('if [ "$SAVE_CODE" != "200" ]; then');
  const end = proof.indexOf('\nGET_BODY=', start);
  assert.ok(start > 0 && end > start);
  const gate = proof.slice(start, end);
  assert.match(gate, /exit 53/);
  assert.match(gate, /GEN2-38 sanitized save error code/);
  assert.match(gate, /WORK_PLAN_\[A-Z0-9_\]/);
  assert.doesNotMatch(gate, /cat production-gen2-38-saved\.json/);
});

test('automatic release still rejects human approval tokens and defaults to MAX off', () => {
  assert.match(workflow, /if \[ "\$APPROVAL" != "AUTONOMOUS_POLICY" \]; then/);
  assert.match(workflow, /test "\$APPROVAL" = "AUTONOMOUS_POLICY"/);
  assert.match(workflow, /test "\$APPROVAL" = "DEPLOY_APPROVED"/);
  assert.match(workflow, /owner_max_autorelease:[\s\S]*?default: false/);
});
