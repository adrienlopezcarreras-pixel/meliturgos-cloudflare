import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Kaggle continuation preserves an explicitly requested parent adapter', async () => {
  const source=await readFile(new URL('../../kaggle/mel-lora-uncensored/run.py', import.meta.url),'utf8');

  assert.match(source,/parent_expected = bool/);
  assert.match(source,/parent-bundle\.tar\.gz/);
  assert.match(source,/payload \/ "parent-bundle"/);
  assert.match(source,/KAGGLE_PARENT_REQUIRED_BUT_MISSING/);
  assert.match(source,/KAGGLE_PARENT_ARTIFACT_INCOMPLETE/);
  assert.match(source,/KAGGLE_PARENT_DIGEST_MISMATCH/);
  assert.match(source,/PARENT_ADAPTER_READY/);
  assert.match(source,/stage = "uncensored-continue" if parent_digest else "uncensored"/);
});
