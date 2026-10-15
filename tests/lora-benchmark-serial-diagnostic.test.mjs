import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runLoraBenchmarkPair } from '../src/learning/operator-actions.js';

test('default LoRA pairs run in parallel, preserving existing production behavior', async () => {
  const sequence = [];
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const a = async () => { sequence.push('baseline-start'); await wait; sequence.push('baseline-end'); return 'baseline'; };
  const b = async () => { sequence.push('candidate-start'); return 'candidate'; };
  const promise = runLoraBenchmarkPair([a, b]);
  assert.deepEqual(sequence, ['baseline-start', 'candidate-start']);
  release();
  assert.deepEqual(await promise, ['baseline', 'candidate']);
});

test('diagnostic LoRA pairs perform no overlapping baseline/candidate inference', async () => {
  const sequence = [];
  const a = async () => { sequence.push('baseline-start'); await Promise.resolve(); sequence.push('baseline-end'); return 1; };
  const b = async () => { sequence.push('candidate-start'); await Promise.resolve(); sequence.push('candidate-end'); return 2; };
  assert.deepEqual(await runLoraBenchmarkPair([a, b], true), [1, 2]);
  assert.deepEqual(sequence, ['baseline-start', 'baseline-end', 'candidate-start', 'candidate-end']);
});

test('bad pair is rejected without running any provider calls', async () => {
  await assert.rejects(runLoraBenchmarkPair([async()=>1], true), /LORA_BENCHMARK_PAIR_INVALID/);
  await assert.rejects(runLoraBenchmarkPair([async()=>1, null], false), /LORA_BENCHMARK_PAIR_INVALID/);
});

test('automatic collector sends and proves serialized benchmarking without enabling activation', () => {
  const workflow = readFileSync('.github/workflows/lora-kaggle-free-collect.yml', 'utf8');
  const cli = readFileSync('scripts/finalize-lora.mjs', 'utf8');
  const backend = readFileSync('src/learning/operator-actions.js', 'utf8');
  const route = readFileSync('src/professor-live-learning-entry.js', 'utf8');
  assert.match(workflow, /BENCHMARK_SERIAL: \$\{\{ github\.event_name == 'push' && 'true' \|\| 'false' \}\}/);
  assert.match(workflow, /--serial "\$BENCHMARK_SERIAL"/);
  assert.match(workflow, /ACTIVATE_PREVIEW: \$\{\{ github\.event_name == 'workflow_dispatch'/);
  assert.match(cli, /LORA_BENCHMARK_SERIAL_NOT_ACKNOWLEDGED/);
  assert.match(backend, /benchmark_serial: benchmarkSerial/);
  assert.match(route, /benchmark_serial: body\.benchmark_serial === true/);
  assert.match(cli, /benchmark_serial: benchmarkSerial/);
});
