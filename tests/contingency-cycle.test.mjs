import test from 'node:test';
import assert from 'node:assert/strict';
import { allScenarios, currentContingency, buildReconstructionKit, placeReconstructionCopies } from '../src/continuity/contingency-plan.js';
import { allLifeEvents } from '../src/continuity/life-contingency.js';
import { contingencyHandlers, runContingencyCycle } from '../src/continuity/contingency-cycle.js';

test('every outage countermeasure has a handler and a quiet tick changes nothing', async () => {
  const codes = new Set(allScenarios().flatMap(row => row.countermeasure));
  const handlers = contingencyHandlers();
  for (const code of codes) assert.equal(typeof handlers[code], 'string', code);
  const quiet = await runContingencyCycle({ observed: { cloudflareUp: true }, actions: { note: async () => { throw new Error('should not note'); } } });
  assert.equal(quiet.scenario.kind, 'NONE');
  assert.equal(quiet.ran.length, 0);
  assert.equal(quiet.activation_performed, false);
});

test('a fallen brick is recorded and an unproven model is not switched', async () => {
  const notes = [];
  const cycle = await runContingencyCycle({
    observed: { cloudflareUp: true, githubUp: false, modelUp: false },
    actions: { note: async (code) => { notes.push(code); return { ok: true }; } },
    replacements: [{ part: 'model', research: { kind: 'DOCUMENTARY', sources: [{ url: 'https://example.com/m', title: 'Doc' }] } }],
  });
  assert.ok(notes.includes('DO_NOT_DEPLOY'));
  assert.equal(cycle.ran.find(row => row.code === 'USE_OTHER_PROVEN_MODEL').reason, 'NO_PROVEN_REPLACEMENT');
  assert.equal(cycle.activation_performed, false);
  assert.equal(cycle.replacements[0].replacement_ready, false);
});

test('life countermeasures still run inside the same cycle', async () => {
  const calls = [];
  const cycle = await runContingencyCycle({
    observed: { cloudflareUp: true },
    life: Object.fromEntries(allLifeEvents().map(row => [row.id, false])),
    actions: { requeueReview: async () => { calls.push('requeue'); return { ok: true }; } },
  });
  assert.equal(cycle.life.length, 0);
  const stalled = await runContingencyCycle({
    observed: { cloudflareUp: true },
    life: { stalled: true },
    actions: { requeueReview: async () => { calls.push('requeue'); return { ok: true }; } },
  });
  assert.equal(stalled.life[0].applied, true);
  assert.deepEqual(calls, ['requeue']);
});

test('unexecuted failovers never count as applied or activated', async () => {
  const cases = [
    { observed: { cloudflareUp: false, githubUp: true, companionOnline: false }, code: 'RUN_CODE_ON_GITHUB_ACTIONS' },
    { observed: { cloudflareUp: false, githubUp: true, companionOnline: true, localGit: true, localDb: true, localModel: true }, code: 'MOVE_MAX_TO_PC' },
    { observed: { cloudflareUp: true, modelUp: false }, code: 'USE_OTHER_PROVEN_MODEL' },
  ];
  for (const row of cases) {
    const result = await runContingencyCycle({ observed: row.observed, actions: { note: async () => ({ ok: true }) } });
    const action = result.ran.find(action => action.code === row.code);
    assert.ok(action, row.code);
    assert.equal(action.applied, false, row.code);
    assert.equal(action.activation_performed, false, row.code);
    assert.equal(result.activation_performed, false, row.code);
  }
});

test('failed recording is isolated and subsequent life repair still runs', async () => {
  const repaired = [];
  const cycle = await runContingencyCycle({
    observed: { cloudflareUp: true, githubUp: false, modelUp: false },
    life: { stalled: true },
    actions: {
      note: async () => { const error = new Error('storage failure'); error.code = 'D1_WRITE_FAILED'; throw error; },
      requeueReview: async () => { repaired.push('requeue'); return { ok: true }; },
    },
  });
  assert.equal(cycle.ran.find(row => row.code === 'DO_NOT_DEPLOY')?.reason, 'D1_WRITE_FAILED');
  assert.equal(cycle.ran.find(row => row.code === 'DO_NOT_DEPLOY')?.applied, false);
  assert.equal(cycle.life.find(row => row.id === 'MAX_STALLED')?.applied, true);
  assert.deepEqual(repaired, ['requeue']);
});

test('exhaustive 127 outage combinations have executable mappings or explicit blocked decisions', async () => {
  const scenarios = allScenarios();
  assert.equal(scenarios.length, 127);
  const mapping = { cloudflare: 'cloudflareUp', pc: 'pcUp', github: 'githubUp', model: 'modelUp', gmail: 'gmailUp', onedrive: 'onedriveUp', shards: 'shardsUp' };
  const seen = new Set();
  for (const scenario of scenarios) {
    const observed = Object.fromEntries(Object.values(mapping).map(key => [key, true]));
    for (const part of scenario.down) observed[mapping[part]] = false;
    observed.companionOnline = observed.pcUp === true;
    observed.localGit = false;
    observed.localDb = false;
    observed.localModel = false;
    const cycle = await runContingencyCycle({ observed, actions: { note: async () => ({ ok: true }) } });
    assert.deepEqual(new Set(cycle.scenario.down), new Set(scenario.down));
    assert.equal(cycle.scenario.kind, scenario.kind);
    for (const action of cycle.ran) {
      assert.equal(typeof contingencyHandlers()[action.code], 'string', action.code);
      assert.notEqual(action.reason, 'NO_HANDLER', action.code);
      assert.equal(action.activation_performed, false, action.code);
    }
    assert.equal(cycle.activation_performed, false);
    seen.add([...scenario.down].sort().join(','));
  }
  assert.equal(seen.size, 127);
});

test('offline optional Companion does not create an outage without a failed probe', async () => {
  assert.equal(currentContingency({ cloudflareUp: true, companionOnline: false }).kind, 'NONE');
  assert.deepEqual(currentContingency({ cloudflareUp: true, pcUp: false }).down, ['pc']);
});

test('public shards have no private backup key and private reconstruction copies retain one', () => {
  const kit = buildReconstructionKit({
    sourceSha: 'a'.repeat(40),
    encryptedBackup: 'ENCRYPTED_FIXTURE',
    keyId: 'test-key',
    keyB64: 'TEST_ONLY_SECRET',
    index: { format: 'MEL-ShardVault-DiscoveryIndex', shards: [] },
  });
  const copies = placeReconstructionCopies(kit);
  assert.equal(copies.gmail.sufficient_alone, true);
  assert.equal(copies.onedrive.sufficient_alone, true);
  assert.equal(copies.shards.sufficient_alone, false);
  assert.equal(JSON.stringify(copies.shards).includes('TEST_ONLY_SECRET'), false);
  assert.equal(copies.shards.body.backup.key_b64, undefined);
});

test('a failed PC probe overrides contradictory online standby claims', async () => {
  const scenario = currentContingency({
    cloudflareUp: false, githubUp: true, pcUp: false,
    companionOnline: true, localGit: true, localDb: true, localModel: true,
  });
  assert.ok(scenario.down.includes('pc'));
  assert.notEqual(scenario.max, 'STANDBY_READY');
  assert.equal(scenario.countermeasure.includes('MOVE_MAX_TO_PC'), false);
  assert.equal(scenario.countermeasure.includes('RUN_CODE_ON_GITHUB_ACTIONS'), true);
});
test('proven PC standby is selectable only with Cloudflare down and a live PC', async () => {
  const scenario = currentContingency({
    cloudflareUp: false, githubUp: true, pcUp: true,
    companionOnline: true, localGit: true, localDb: true, localModel: true,
  });
  assert.equal(scenario.max, 'STANDBY_READY');
  const cycle = await runContingencyCycle({ observed: {
    cloudflareUp: false, githubUp: true, pcUp: true,
    companionOnline: true, localGit: true, localDb: true, localModel: true,
  }, actions: { note: async () => ({ok:true}) } });
  assert.equal(cycle.ran.find(row => row.code === 'MOVE_MAX_TO_PC').applied, false);
});
