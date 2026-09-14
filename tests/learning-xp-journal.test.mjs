import test from 'node:test';
import assert from 'node:assert/strict';
import { recordLearningXpCheckpoint } from '../src/learning/xp-journal.js';

class Memory {
  constructor() { this.rows = []; }
  async recent({ limit = 1, kind = null } = {}) {
    return this.rows.filter(row => !kind || row.kind === kind).slice(0, limit);
  }
  async remember(row) {
    const saved = { ...row, evidence: structuredClone(row.evidence) };
    this.rows.unshift(saved);
    return saved;
  }
}

const report = (validated = 0, trials = 0) => ({
  corrections_recorded: validated,
  corrections_validated: validated,
  corrections_available_for_training: validated,
  validation_rate: validated ? 1 : 0,
  average_validated_quality: validated ? 0.9 : 0,
  inference_trials: trials,
  repeated_taught_errors: 0,
  active_adapter_count: 0,
  neural_weights_changed: false,
  benchmark: { runs: 0, baseline_score: null, latest_score: null },
});

test('XP gain is awarded only from canonical evidence plus durable artifact', async () => {
  const memory = new Memory();
  const first = await recordLearningXpCheckpoint({
    memory,
    report: report(1, 0),
    artifacts: ['ci:sha-1'],
    source_sha: 'sha-1',
    now: () => new Date('2026-09-14T00:00:00Z'),
  });
  assert.equal(first.xp_after, 100);
  assert.equal(first.xp_delta, 100);
  assert.equal(first.awarded, true);

  const second = await recordLearningXpCheckpoint({
    memory,
    report: report(1, 1),
    artifacts: ['benchmark:run-2'],
    source_sha: 'sha-2',
    now: () => new Date('2026-09-14T01:00:00Z'),
  });
  assert.equal(second.xp_after, 110);
  assert.equal(second.xp_delta, 10);
  assert.equal(second.awarded, true);
});

test('canonical XP never regresses or advances without durable proof', async () => {
  const memory = new Memory();
  const baseline = await recordLearningXpCheckpoint({ memory, report: report(2, 0), artifacts: ['ci:baseline'] });
  assert.equal(baseline.xp_after, 200);

  const noProof = await recordLearningXpCheckpoint({ memory, report: report(2, 1), artifacts: [] });
  assert.equal(noProof.observed_xp, 210);
  assert.equal(noProof.measured_delta, 10);
  assert.equal(noProof.xp_after, 200);
  assert.equal(noProof.xp_delta, 0);
  assert.equal(noProof.awarded, false);

  const regression = await recordLearningXpCheckpoint({ memory, report: report(1, 0), artifacts: ['ci:regression'] });
  assert.equal(regression.observed_xp, 100);
  assert.equal(regression.xp_after, 200);
  assert.equal(regression.xp_delta, 0);
  assert.equal(regression.awarded, false);

  const recoveredWithProof = await recordLearningXpCheckpoint({ memory, report: report(2, 1), artifacts: ['benchmark:verified-run'] });
  assert.equal(recoveredWithProof.xp_before, 200);
  assert.equal(recoveredWithProof.xp_after, 210);
  assert.equal(recoveredWithProof.xp_delta, 10);
  assert.equal(recoveredWithProof.awarded, true);
});
