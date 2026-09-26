import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Kaggle LoRA notebook avoids a single long-running training cell', async () => {
  const source=await readFile(new URL('../../.github/workflows/lora-kaggle-free-gpu.yml', import.meta.url),'utf8');
  assert.match(source,/TRAINING_BACKGROUND_STARTED/);
  assert.match(source,/mel-training-exit-code\.txt/);
  assert.match(source,/time\.sleep\(75\)/);
  assert.match(source,/range\(145\)/);
  assert.match(source,/TRAINING_BACKGROUND_COMPLETED/);
  assert.doesNotMatch(source,/"source":source\.splitlines\(keepends=True\)/);
});
