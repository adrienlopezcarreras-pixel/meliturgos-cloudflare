import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('LoRA chained dispatches stay on current main instead of stale candidate branch', async () => {
  const source=await readFile(new URL('../../.github/workflows/lora-kaggle-free-gpu.yml', import.meta.url),'utf8');
  assert.doesNotMatch(source,/--ref candidate\/mel-clean-autonomy/);
  const dispatches=[...source.matchAll(/gh workflow run [^\n]+\n(?:.*\n){0,8}?\s+--ref main/g)];
  assert.ok(dispatches.length >= 2);
});
