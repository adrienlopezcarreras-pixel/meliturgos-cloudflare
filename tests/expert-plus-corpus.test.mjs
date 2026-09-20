import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPERT_PLUS_CYCLE_COUNT,
  EXPERT_PLUS_DISTILLED_XP_IDS,
  EXPERT_PLUS_DOMAIN_COUNT,
  EXPERT_PLUS_LENS_COUNT,
  buildExpertPlusCycles,
  expertPlusSummary,
  searchExpertPlusCycles,
} from '../src/learning/expert-plus-corpus.js';
import { BOOTSTRAP_CORRECTIONS } from '../src/learning/bootstrap-corrections.js';
import { DEVELOPMENT_EXPERIENCE_PACK } from '../src/learning/development-experience-pack.js';
import { LearningEngine } from '../src/learning/learning-engine.js';

class MemoryStub {
  async remember(row) { return structuredClone(row); }
  async recent() { return []; }
  async all() { return []; }
}

test('expert-plus curriculum is exactly 100 x 100 = 10,000 complete unique cycles', () => {
  assert.equal(EXPERT_PLUS_DOMAIN_COUNT, 100);
  assert.equal(EXPERT_PLUS_LENS_COUNT, 100);
  assert.equal(EXPERT_PLUS_CYCLE_COUNT, 10000);
  const cycles = buildExpertPlusCycles();
  assert.equal(cycles.length, 10000);
  assert.equal(new Set(cycles.map(row => row.id)).size, 10000);
  for (const row of cycles) {
    for (const key of ['id','domain','subdomain','lens','scenario','problem','principle','limitation_counterexample','pattern','antipattern','test_gate','mel_implication','status']) {
      assert.ok(String(row[key] || '').trim(), row.id + ' missing ' + key);
    }
    assert.equal(row.status, 'SOURCE_GROUNDED_GUIDANCE');
    assert.ok(Array.isArray(row.source_basis) && row.source_basis.length >= 2, row.id + ' missing source basis');
    assert.equal(row.source_basis.every(source => source.id && source.url && source.kind), true, row.id + ' incomplete source');
  }
});

test('expert-plus search returns targeted guidance without changing validation semantics', () => {
  const rows = searchExpertPlusCycles('ShardVault reconstruction three fragment loss retry', { limit: 12 });
  assert.ok(rows.length > 0 && rows.length <= 12);
  assert.equal(rows.some(row => row.domain === 'shardvault-recovery'), true);
  assert.equal(rows.every(row => row.status === 'SOURCE_GROUNDED_GUIDANCE'), true);
  const summary = expertPlusSummary();
  assert.deepEqual(
    { status: summary.status, cycles: summary.cycles, domains: summary.domains, lenses: summary.lenses },
    { status: 'COMPLETED', cycles: 10000, domains: 100, lenses: 100 },
  );
});

test('only proven distilled expert lessons enter canonical MEL training', async () => {
  assert.equal(EXPERT_PLUS_DISTILLED_XP_IDS.length, 10);
  assert.equal(new Set(EXPERT_PLUS_DISTILLED_XP_IDS).size, 10);
  const byId = new Map(DEVELOPMENT_EXPERIENCE_PACK.map(row => [row.id, row]));
  for (const id of EXPERT_PLUS_DISTILLED_XP_IDS) {
    const row = byId.get(id);
    assert.ok(row, 'distilled XP missing from canonical development pack: ' + id);
    assert.equal(row.validated, true);
    assert.ok(Number(row.quality) >= 0.95);
  }

  const bootstrapIds = new Set(BOOTSTRAP_CORRECTIONS.map(row => row.id));
  for (const id of EXPERT_PLUS_DISTILLED_XP_IDS) assert.equal(bootstrapIds.has(id), true, 'missing distilled XP: ' + id);

  const engine = new LearningEngine({ memory: new MemoryStub() });
  const guidance = engine.expertGuidance('knowledge provenance integrity', { limit: 8 });
  assert.equal(guidance.curriculum.cycles, 10000);
  assert.ok(guidance.cycles.length > 0 && guidance.cycles.length <= 8);

  const bundle = await engine.trainingBundle({ minQuality: 0.65 });
  const preferenceIds = new Set(bundle.preference.map(row => row.id));
  for (const id of EXPERT_PLUS_DISTILLED_XP_IDS) assert.equal(preferenceIds.has(id), true, 'distilled XP absent from trainingBundle: ' + id);
  assert.equal(bundle.expert_plus.cycles, 10000);
  assert.equal(bundle.expert_plus.runtime_policy, 'ON_DEMAND_GUIDANCE_PLUS_VALIDATED_DISTILLATION');
});
