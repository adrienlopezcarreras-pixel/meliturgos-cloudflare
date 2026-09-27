import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('LoRA benchmark bounds case concurrency and per-inference latency', async () => {
  const canonical=await readFile(new URL('../../src/learning/benchmark-suite.js', import.meta.url),'utf8');
  const impact=await readFile(new URL('../../src/learning/lora-impact-benchmark.js', import.meta.url),'utf8');
  const operator=await readFile(new URL('../../src/learning/operator-actions.js', import.meta.url),'utf8');
  const start=operator.indexOf('export async function runOperatorLoraBenchmark');
  const end=operator.indexOf('export async function prepareOperatorLora', start);
  const block=operator.slice(start,end);

  assert.match(canonical,/concurrency = 1/);
  assert.match(canonical,/mapWithConcurrency/);
  assert.match(impact,/concurrency = 1/);
  assert.match(impact,/mapImpactWithConcurrency/);
  assert.match(operator,/BENCHMARK_INFERENCE_TIMEOUT/);
  assert.match(operator,/Promise\.race\(\[ai\.run\(modelId, input\), timeout\]\)/);
  assert.ok((block.match(/concurrency: 4/g)||[]).length >= 4);
});
