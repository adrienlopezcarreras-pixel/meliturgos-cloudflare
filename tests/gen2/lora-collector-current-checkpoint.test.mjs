import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('LoRA collector selects current Kaggle checkpoint and rejects parent reuse', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/lora-kaggle-free-collect.yml', import.meta.url),'utf8');
  assert.match(workflow,/DIR="artifacts\/kaggle-output\/mel-lora-output"/);
  assert.match(workflow,/CURRENT_KAGGLE_CHECKPOINT_SELECTED/);
  assert.match(workflow,/KAGGLE_COLLECTOR_SELECTED_PARENT_INSTEAD_OF_CURRENT/);
  assert.doesNotMatch(workflow,/find artifacts\/kaggle-output -type f -name training-evidence\.json -print -quit/);
});
