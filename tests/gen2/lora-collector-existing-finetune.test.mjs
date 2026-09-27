import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('LoRA collector can benchmark a pre-uploaded exact finetune without re-uploading', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/lora-kaggle-free-collect.yml', import.meta.url),'utf8');
  assert.match(workflow,/existing_finetune_id:/);
  assert.match(workflow,/EXISTING_FINETUNE_ATTACHED/);
  assert.match(workflow,/INVALID_EXISTING_FINETUNE_ID/);
  assert.match(workflow,/artifact\.finetune_id=id/);
  assert.match(workflow,/inputs\.existing_finetune_id == ''/);
  assert.match(workflow,/inputs\.existing_finetune_id != ''/);
  assert.match(workflow,/Approve exact uploaded artifact/);
  assert.match(workflow,/Benchmark exact Kaggle adapter/);
});
