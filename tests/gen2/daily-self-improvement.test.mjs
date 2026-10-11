import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('daily self-improvement dispatches audit, autonomy and resumable LoRA', async () => {
  const source=await readFile(new URL('../../.github/workflows/mel-daily-self-improvement.yml', import.meta.url),'utf8');
  assert.match(source,/cron: '37 3 \* \* \*'/);
  assert.match(source,/mel-self-audit-production-proof\.yml/);
  assert.match(source,/gen2-42-runtime-tick\.yml/);
  assert.match(source,/lora-kaggle-free-gpu\.yml/);
  assert.match(source,/LORA_DAILY_MINIMUM_PASS_DISPATCHED/);
  assert.match(source,/LORA_DAILY_CHAIN_ALREADY_ACTIVE/);
  assert.match(source,/mel-lora-kaggle-/);
  assert.match(source,/max_cycles=100/);
  assert.match(source,/shard_size=750/);
  assert.doesNotMatch(source,/paid fallback/i);
});

test('daily self-audit follows the latest successful deploy job even when aggregate release health is red', async () => {
  const source=await readFile(new URL('../../.github/workflows/mel-daily-self-improvement.yml', import.meta.url),'utf8');
  assert.match(source,/actions\/runs\/\$\{run\.id\}\/jobs\?per_page=100/);
  assert.match(source,/\.find\(\w+=>\w+\?\.name==='deploy'\)/);
  assert.match(source,/deploy\?\.status==='completed'&&deploy\?\.conclusion==='success'/);
  assert.doesNotMatch(source,/deploy-cloudflare-release\.yml\/runs\?status=success/);
  assert.match(source,/latest successfully deployed production SHA/);
});
