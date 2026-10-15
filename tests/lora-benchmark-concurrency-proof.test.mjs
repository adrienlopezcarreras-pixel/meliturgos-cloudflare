import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/finalize-lora.mjs', import.meta.url));

function runOfflineBenchmark(responseConcurrency, args = ['--concurrency', '1']) {
  const dir = mkdtempSync(join(tmpdir(), 'mel-lora-proof-'));
  try {
    for (const [name, value] of [
      ['lora-plan.json', { id: 'test-plan' }],
      ['artifact-evidence.json', { finetune_id: 'test-adapter-id' }],
      ['approval-evidence.json', { approval_id: 'test-approval' }],
    ]) writeFileSync(join(dir, name), JSON.stringify(value));
    const response = {
      ok: true,
      benchmark_concurrency: responseConcurrency,
      baseline: { overall: 0.45, cases: [] },
      candidate: { overall: 0.75, cases: [] },
      decision: { reason: 'QUALITY_PASSED' },
      activated: false, canonical_gate_passed: true, impact_gate_passed: true,
    };
    const raw = JSON.stringify(response) + '\n__MEL_HTTP_STATUS__:200';
    const fakeCurl = join(dir, 'curl');
    writeFileSync(fakeCurl, '#!/usr/bin/env node\nprocess.stdout.write(' + JSON.stringify(raw) + ');\n');
    chmodSync(fakeCurl, 0o755);
    return spawnSync(process.execPath, [script, '--dir', dir, '--url', 'https://invalid.example.test', '--activate', 'false', '--allow-not-activated', 'true', ...args], {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, PATH: dir + ':' + (process.env.PATH || ''), MELITURGOS_PASSWORD: 'local-test-only' },
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('explicit diagnostic requires server acknowledgement of concurrency', () => {
  const result = runOfflineBenchmark(4);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /LORA_BENCHMARK_CONCURRENCY_NOT_ACKNOWLEDGED/);
  assert.doesNotMatch(result.stderr, /local-test-only/);
});
test('a matching backend acknowledgement permits a benchmark without activation', () => {
  const result = runOfflineBenchmark(1);
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.benchmark_concurrency, 1);
  assert.equal(data.activated, false);
});
test('legacy invocations without an explicit concurrency keep compatibility', () => {
  const result = runOfflineBenchmark(undefined, []);
  assert.equal(result.status, 0, result.stderr);
});
test('response proof is part of the backend benchmark contract', () => {
  const op = readFileSync(new URL('../src/learning/operator-actions.js', import.meta.url), 'utf8');
  const block = op.slice(op.indexOf('export async function runOperatorLoraBenchmark'),op.indexOf('export async function prepareOperatorLora'));
  assert.match(block, /benchmark_concurrency: benchmarkConcurrency/);
});
