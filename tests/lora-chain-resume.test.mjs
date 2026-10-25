import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('a failed LoRA cycle is resumed hourly from the latest checkpoint, bounded and free-only', () => {
  const wf = fs.readFileSync('.github/workflows/lora-chain-resume.yml', 'utf8');
  assert.match(wf, /cron: '23 \* \* \* \*'/);
  assert.match(wf, /DECISION','ACTIVE'/);
  assert.match(wf, /50\*60_000/);
  assert.match(wf, /streak>=3/);
  assert.match(wf, /gh workflow run lora-kaggle-free-gpu\.yml/);
  assert.match(wf, /benchmark_preview=false/);
  assert.doesNotMatch(wf, /secrets\./);
});
