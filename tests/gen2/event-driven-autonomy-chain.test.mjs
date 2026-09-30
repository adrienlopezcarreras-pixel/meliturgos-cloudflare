import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = rel => readFile(new URL(rel, import.meta.url), 'utf8');

test('runtime tick continues event-driven work without permanent polling', async () => {
  const source = await read('../../.github/workflows/gen2-42-runtime-tick.yml');
  assert.match(source, /chain_depth/);
  assert.match(source, /Continue event-driven autonomy while work is advancing/);
  assert.match(source, /AUTONOMY_CHAIN_CONTINUED/);
  assert.match(source, /CHAIN_DEPTH.*-ge 20/);
  assert.match(source, /actions\/workflows\/gen2-42-runtime-tick\.yml\/dispatches/);
  assert.doesNotMatch(source, /schedule:\s*\n\s*- cron:/);
});

test('cloud bridge resumes autonomy only after persisting a result', async () => {
  const source = await read('../../.github/workflows/gen2-42-apply-ready-bridge.yml');
  assert.match(source, /actions:\s*write/);
  assert.match(source, /id: report_satisfied/);
  assert.match(source, /id: report_result/);
  assert.match(source, /Continue autonomy after persisted bridge result/);
  assert.match(source, /steps\.report_satisfied\.outcome == 'success' \|\| steps\.report_result\.outcome == 'success'/);
  assert.match(source, /AUTONOMY_CHAIN_CONTINUED_AFTER_BRIDGE/);
  assert.match(source, /CHAIN_DEPTH.*-ge 20/);
});

test('verified MAX release kicks the event-driven autonomy chain', async () => {
  const source = await read('../../.github/workflows/deploy-cloudflare-release.yml');
  assert.match(source, /actions:\s*write/);
  assert.match(source, /Kick event-driven autonomy after MAX release/);
  assert.match(source, /AUTONOMY_CHAIN_KICKED_AFTER_RELEASE/);
  assert.match(source, /chain_depth:'0'/);
  assert.match(source, /actions\/workflows\/gen2-42-runtime-tick\.yml\/dispatches/);
});
