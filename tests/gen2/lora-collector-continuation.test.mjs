import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('canonical LoRA collector accepts base and continued uncensored checkpoints', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/lora-kaggle-free-collect.yml', import.meta.url),'utf8');

  assert.match(workflow,/const stage=String\(training\.stage\|\|''\)/);
  assert.match(workflow,/\['uncensored','uncensored-continue'\]\.includes\(stage\)/);
  assert.match(workflow,/KAGGLE_STAGE_NOT_UNCENSORED/);
  assert.match(workflow,/KAGGLE_CONTINUATION_PARENT_DIGEST_MISSING/);
  assert.match(workflow,/KAGGLE_CONTINUATION_ARTIFACT_PARENT_MISMATCH/);
  assert.match(workflow,/KAGGLE_CONTINUATION_RUN_PARENT_MISMATCH/);
  assert.match(workflow,/Checkout exact collector SHA/);
  assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(workflow,/ref: candidate\/mel-clean-autonomy/);
  assert.match(workflow,/DIR="artifacts\/kaggle-output\/mel-lora-output"/);
  assert.doesNotMatch(workflow,/find artifacts\/kaggle-output -type f -name training-evidence\.json -print -quit/);
  assert.doesNotMatch(workflow,/find artifacts\/kaggle-output -type f -name adapter_model\.safetensors -print -quit/);
  assert.match(workflow,/Benchmark exact Kaggle adapter/);
  assert.match(workflow,/allow-not-activated true/);
});
