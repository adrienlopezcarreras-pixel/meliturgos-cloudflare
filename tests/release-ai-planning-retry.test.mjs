import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(
  new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url),
  'utf8',
);

function readWorkflowStep(name) {
  const lines = workflow.split(/\r?\n/);
  const marker = '      - name: ' + name;
  const start = lines.findIndex(line => line === marker);
  assert.ok(start >= 0, 'YAML step not found: ' + name);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('      - name: ')) {
      end = i;
      break;
    }
  }
  const yaml = lines.slice(start, end).join('\n');
  const runLine = lines.findIndex((line, index) => index > start && index < end && line === '        run: |');
  assert.ok(runLine >= 0, 'YAML step ' + name + ' must have a block-scalar run script');
  let runEnd = runLine + 1;
  while (runEnd < end) {
    const line = lines[runEnd];
    if (line.trim() && (line.match(/^\s*/)?.[0].length ?? 0) < 10) break;
    runEnd += 1;
  }
  return {
    yaml,
    run: lines.slice(runLine + 1, runEnd)
      .map(line => line.startsWith('          ') ? line.slice(10) : line)
      .join('\n'),
  };
}

const planning = readWorkflowStep('Prepare and prove production autonomy launch evidence');
const rollback = readWorkflowStep('Automatic rollback on failed production verification');

test('GEN2-38 release proof is in the intended YAML step and remains bounded/read-only', () => {
  const proofStart = planning.run.indexOf('GEN_PLAN_CODE="$(curl');
  const proofEnd = planning.run.indexOf('if [ "$GEN_PLAN_CODE" != "200" ]; then', proofStart);
  assert.ok(proofStart >= 0 && proofEnd > proofStart, 'GEN2-38 production request is in the autonomy proof step');
  const proof = planning.run.slice(proofStart, proofEnd);
  assert.match(proof, /--max-time 120/);
  assert.doesNotMatch(proof, /--retry 1 --retry-all-errors/);
  assert.match(proof, /"id":"work\.plan\.generate"/);
  assert.match(proof, /"maxCandidates":2/);
  assert.match(proof, /--output production-gen2-38-generated\.json/);
  assert.match(proof, /\|\| true\)"/);
});

test('GEN2-38 network and provider failures exit nonzero through the actual failure gate', () => {
  const gateStart = planning.run.indexOf('if [ "$GEN_PLAN_CODE" != "200" ]; then');
  assert.ok(gateStart >= 0, 'non-200 failure gate exists in the selected YAML step');
  const exitAt = planning.run.indexOf('exit 55', gateStart);
  assert.ok(exitAt > gateStart, 'non-200 gate exits with a nonzero status');
  const closing = planning.run.slice(exitAt).match(/\n\s*fi\b/);
  assert.ok(closing, 'failure gate closes its shell conditional');
  const gate = planning.run.slice(gateStart, exitAt + closing.index + closing[0].length);
  assert.match(gate, /sanitized application diagnostics/);
  assert.match(gate, /exit 55/);
  for (const scenario of [
    { name: 'network transport failure', code: '', body: '' },
    { name: 'provider failure', code: '500', body: '{"code":"WORK_PLAN_GENERATION_PROVIDERS_UNAVAILABLE"}' },
  ]) {
    const dir = mkdtempSync(join(tmpdir(), 'mel-gen2-38-'));
    try {
      writeFileSync(join(dir, 'production-gen2-38-generated.json'), scenario.body, 'utf8');
      const script = 'GEN_PLAN_CODE="$TEST_HTTP_STATUS"\n' + gate;
      const result = spawnSync('bash', ['-e', '-u', '-o', 'pipefail', '-c', script], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, TEST_HTTP_STATUS: scenario.code },
      });
      assert.equal(result.status, 55, scenario.name + ' must fail release verification');
      assert.match(result.stdout, /GEN2-38 generated plan returned HTTP/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('failed GEN2-38 release proof activates the real rollback YAML step', () => {
  const proofStepAt = workflow.indexOf('      - name: Prepare and prove production autonomy launch evidence');
  const rollbackStepAt = workflow.indexOf('      - name: Automatic rollback on failed production verification');
  assert.ok(proofStepAt >= 0 && rollbackStepAt > proofStepAt);
  assert.match(rollback.yaml, /^\s*if: failure\(\)$/m);
  assert.match(rollback.run, /production-deploy-started\.marker/);
  assert.match(rollback.run, /npx wrangler rollback/);
  assert.match(rollback.run, /paused=true&max=false/);
  assert.match(rollback.run, /d\?\.paused!==true \|\| d\?\.max_autonomy!==false/);
});

test('production release does not repeat mutating Work plan endpoints as transport retries', () => {
  const run = planning.run;
  const start = run.indexOf('PLAN_CODE="$(curl');
  const end = run.indexOf('if [ "$PLAN_CODE" != "200" ]; then', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(run.slice(start, end), /--retry-all-errors/);
});

test('production Council proof uses a bounded per-model deadline and one transient transport retry', () => {
  const run = planning.run;
  const start = run.indexOf('COUNCIL_CODE="$(curl');
  const end = run.indexOf('if [ "$' + '{COUNCIL_CODE}" != "200" ]; then', start);
  assert.ok(start >= 0 && end > start, 'production Council request is present');
  const proof = run.slice(start, end);
  assert.match(proof, /--max-time 115 --retry 1 --retry-all-errors --retry-delay 2/);
  assert.match(proof, /"id":"model\.council"/);
  assert.match(proof, /"maxCandidates":4,"timeoutMs":15000/);
  assert.match(proof, /--output production-mel-council-02\.json/);
  assert.match(run.slice(end, end + 650), /exit 52/);
  assert.match(run.slice(end, end + 900), /scripts\/check-release-council-proof\.mjs/);
});

test('production Council timeout does not add retries to write-capable proof calls', () => {
  const run = planning.run;
  for (const identifier of ['SAVE_CODE="$(curl', 'GET_CODE="$(curl']) {
    const start = run.indexOf(identifier);
    assert.ok(start >= 0, 'expected proof call ' + identifier);
    const curlEnd = run.indexOf('--write-out', start);
    assert.ok(curlEnd > start);
    assert.doesNotMatch(run.slice(start, curlEnd), /--retry-all-errors/);
  }
});
