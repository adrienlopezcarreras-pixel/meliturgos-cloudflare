import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const packet = JSON.parse(readFileSync('prepared/MEL-LIFE-01.json', 'utf8'));
const source = packet.changes.find(file => file.path === 'src/continuity/life-contingency.js').content;
// Exercise the actual serialized proposal before MAX applies it. The imported
// replacement judge is unrelated to this safety batch and is never invoked.
const { applyDueLifeCountermeasures, actionsRelayDecision } = runInNewContext(
  source.replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')
    + '\n({ applyDueLifeCountermeasures, actionsRelayDecision });', {}, { timeout: 1000 });

test('the prepared LIFE-01 proposal preserves a safety pause before any recovery executor', async () => {
  assert.equal(packet.roadmap_id, 'MEL-LIFE-01');
  assert.deepEqual(packet.changes.map(file => file.path).sort(), [
    'src/continuity/life-contingency.js', 'tests/life-contingency.test.mjs',
  ]);
  const calls = [];
  const result = await applyDueLifeCountermeasures({
    pausedByMistake: true, ownerAbsent: true, pausedBySafety: true, updateCiFailed: true,
  }, {
    restoreMax: async () => { calls.push('resume'); return { ok: true }; },
    keepMax: async () => { calls.push('keep-running'); return { ok: true }; },
    keepPrevious: async () => { calls.push('keep-previous'); return { ok: true }; },
  });
  assert.deepEqual(calls, ['keep-previous']);
  assert.equal(result.find(row => row.id === 'MAX_PAUSED_BY_MISTAKE').reason, 'SAFETY_PAUSE_PRESERVED');
  assert.equal(result.find(row => row.id === 'OWNER_ABSENT').activation_performed, false);
  assert.equal(result.find(row => row.id === 'MAX_PAUSED_BY_SAFETY').applied, true);
  assert.equal(actionsRelayDecision({ workerUp: false, companionOnline: false }).activation_performed, false);
  const normal = await applyDueLifeCountermeasures({ pausedByMistake: true }, {
    restoreMax: async () => { calls.push('resume'); return { ok: true }; },
  });
  assert.equal(normal[0].activation_performed, true);
  assert.deepEqual(calls, ['keep-previous', 'resume']);
});
