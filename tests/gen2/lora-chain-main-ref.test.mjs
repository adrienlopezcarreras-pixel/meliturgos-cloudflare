import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('LoRA chained dispatches stay on current main instead of stale candidate branch', async () => {
  const source=await readFile(new URL('../../.github/workflows/lora-kaggle-free-gpu.yml', import.meta.url),'utf8');
  assert.doesNotMatch(source,/--ref candidate\/mel-clean-autonomy/);
  const currentMainRefs=(source.match(/--ref main/g) || []).length;
  assert.ok(currentMainRefs >= 2);
});
