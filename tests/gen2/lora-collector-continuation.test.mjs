import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('canonical LoRA collector accepts base and continued uncensored checkpoints', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/lora-kaggle-free-collect.yml', import.meta.url),'utf8');

  assert.match(workflow,/\['uncensored','uncensored-continue'\]\.includes\(String\(training\.stage\|\|''\)\)/);
  assert.match(workflow,/KAGGLE_STAGE_NOT_UNCENSORED/);
  assert.match(workflow,/Checkout exact collector SHA/);
  assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(workflow,/ref: candidate\/mel-clean-autonomy/);
  assert.match(workflow,/Benchmark exact Kaggle adapter/);
  assert.match(workflow,/allow-not-activated true/);
});
