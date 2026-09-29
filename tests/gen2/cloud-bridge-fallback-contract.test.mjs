import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('runtime tick dispatches cloud bridge only from a READY package when local executor is offline', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /bridge_preparation_ready/);
  assert.match(source, /bridge_executor/);
  assert.match(source, /gen2-42-apply-ready-bridge\.yml\/dispatches/);
  assert.match(source, /CLOUD_BRIDGE_FALLBACK_DISPATCHED/);
  assert.match(source, /actions:\s*write/);
});

test('cloud bridge workflow claims exact job, reconciles main, and reports result back to D1', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  assert.match(source, /Claim exact READY bridge package atomically/);
  assert.match(source, /"job_id":process\.env\.JOB_ID|job_id:process\.env\.JOB_ID/);
  assert.match(source, /ALREADY_SATISFIED_ON_MAIN/);
  assert.match(source, /\/api\/dev-bridge\/result/);
  assert.match(source, /SKIPPED_NOT_CLAIMABLE/);
  assert.match(source, /GITHUB_CLOUD_BRIDGE/);
});
