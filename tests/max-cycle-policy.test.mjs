import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { logCycleStep } from '../src/evolution/autonomy-runtime.js';

test('MAX cannot translate candidate Teacher authorization into production permission', async () => {
  const runtime = await readFile(new URL('../src/evolution/autonomy-runtime.js', import.meta.url), 'utf8');
  const approval = await readFile(new URL('../src/teachers/owner-max-approval.js', import.meta.url), 'utf8');
  assert.match(approval, /production_release_allowed:\s*false/);
  assert.match(runtime, /owner_max_applied:\s*true[\s\S]*?production_release_allowed:\s*false/);
  assert.doesNotMatch(runtime, /production_release_allowed:\s*control\.max_autonomy\s*===\s*true/);
});

test('MAX cycle logging reuses existing chained evolution ledger and degrades without DB', async () => {
  const result = await logCycleStep(null, 'some-cycle', 'CYCLE_STARTED');
  assert.deepEqual(result, { status: 'SKIPPED_NO_DB' });
  const runtime = await readFile(new URL('../src/evolution/autonomy-runtime.js', import.meta.url), 'utf8');
  assert.match(runtime, /new D1EvolutionLedger\(db\)\.append/);
  assert.match(runtime, /cycleLog\('CYCLE_STARTED'\)/);
  assert.match(runtime, /cycleLog\('LAUNCH_GATE_BLOCKED'/);
  assert.match(runtime, /cycleLog\('LEASE_BUSY'/);
  assert.match(runtime, /cycleLog\('CYCLE_FAILED'/);
});
