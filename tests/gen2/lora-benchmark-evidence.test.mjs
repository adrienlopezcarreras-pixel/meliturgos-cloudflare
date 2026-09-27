import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('LoRA finalizer persists complete benchmark evidence and reports case errors', async () => {
  const source=await readFile(new URL('../../scripts/finalize-lora.mjs', import.meta.url),'utf8');
  const workflow=await readFile(new URL('../../.github/workflows/lora-kaggle-free-collect.yml', import.meta.url),'utf8');

  assert.match(source,/benchmark-evidence\.json/);
  assert.match(source,/mel\.lora-canonical-benchmark-evidence\.v1/);
  assert.match(source,/baseline_case_errors/);
  assert.match(source,/candidate_case_errors/);
  assert.match(workflow,/artifacts\/kaggle-output\/\*\*\/benchmark-evidence\.json/);
});
