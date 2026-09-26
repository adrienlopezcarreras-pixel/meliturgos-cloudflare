import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Kaggle LoRA notebook stays observable, bounded and fails stalled background training', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/lora-kaggle-free-gpu.yml', import.meta.url),'utf8');
  const kernel=await readFile(new URL('../../kaggle/mel-lora-uncensored/run.py', import.meta.url),'utf8');
  const trainer=await readFile(new URL('../../scripts/train-mel-lora.py', import.meta.url),'utf8');

  assert.match(workflow,/TRAINING_BACKGROUND_STARTED/);
  assert.match(workflow,/mel-training-background\.json/);
  assert.match(workflow,/TRAINING_BACKGROUND_STALLED/);
  assert.match(workflow,/TRAINING_BACKGROUND_PROCESS_GONE/);
  assert.match(workflow,/time\.sleep\(45\)/);
  assert.match(workflow,/range\(80\)/);
  assert.match(workflow,/kaggle kernels logs/);
  assert.match(workflow,/progress\[\$attempt\]/);
  assert.match(workflow,/artifacts\/kaggle-live\.log/);
  assert.match(workflow,/TRAINING_BACKGROUND_COMPLETED/);
  assert.doesNotMatch(workflow,/\"source\":source\.splitlines\(keepends=True\)/);

  assert.match(kernel,/CYCLE_MAX_STEPS = 32/);
  assert.match(kernel,/--max-steps", str\(CYCLE_MAX_STEPS\)/);
  assert.match(kernel,/TRAINING_COMMAND_START/);
  assert.match(trainer,/MEL_TRAINING_STAGE/);
  assert.match(trainer,/MEL_TRAINING_PROGRESS/);
});
