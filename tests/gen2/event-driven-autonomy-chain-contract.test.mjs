import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('runtime tick is event-driven, bounded, and has an hourly watchdog', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /cron: '17 \* \* \* \*'/);
  assert.match(source, /chain_depth/);
  assert.match(source, /CHAIN_DEPTH.*-ge 20/);
  assert.match(source, /AUTONOMY_CHAIN_CONTINUED/);
  assert.match(source, /gen2-42-runtime-tick\.yml\/dispatches/);
  assert.match(source, /steps\.bridge_fallback\.outputs\.dispatched != 'true'/);
});

test('cloud bridge resumes autonomy chain after execution', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  assert.match(source, /chain_depth/);
  assert.match(source, /actions:\s*write/);
  assert.match(source, /Continue autonomy after persisted bridge result/);
  assert.match(source, /AUTONOMY_CHAIN_CONTINUED_AFTER_BRIDGE/);
  assert.match(source, /steps\.report_satisfied\.outcome == 'success'.*steps\.report_result\.outcome == 'success'/);
  assert.match(source, /gen2-42-runtime-tick\.yml\/dispatches/);
});

test('verified release starts autonomy chain after MAX restore', async () => {
  const source = await readFile(new URL('../../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(source, /actions:\s*write/);
  assert.match(source, /Kick event-driven autonomy chain after MAX restore/);
  assert.match(source, /AUTONOMY_CHAIN_STARTED depth=0/);
  assert.match(source, /gen2-42-runtime-tick\.yml\/dispatches/);
});
