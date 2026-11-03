import test from 'node:test';
import assert from 'node:assert/strict';
import { allScenarios } from '../src/continuity/contingency-plan.js';
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
