import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCapabilityGap } from '../src/evolution/capability-gap-detector.js';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

const sample = [
  { id: 'code.read', name: 'Lire code', category: 'coding', description: 'Read repository files', health: 'HEALTHY', enabled: true },
  { id: 'rag.search', name: 'Recherche mémoire', category: 'memory', description: 'Search persistent memory', health: 'HEALTHY', enabled: true },
  { id: 'gmail.send', name: 'Envoyer email', category: 'connector', description: 'Send Gmail email', health: 'UNAVAILABLE', enabled: true },
];

test('gap detector prefers a live existing capability over duplicate development', () => {
  const result = detectCapabilityGap({ goal: 'lis le code du repository', capabilities: sample, threshold: 2 });
  assert.equal(result.classification, 'MATCHED_AVAILABLE');
  assert.equal(result.best_match.id, 'code.read');
  assert.match(result.next_action, /existing capability/);
});

test('gap detector distinguishes a known blocked integration from a missing capability', () => {
  const result = detectCapabilityGap({ goal: 'envoie un email gmail', capabilities: sample, threshold: 2 });
  assert.equal(result.classification, 'MATCHED_BUT_BLOCKED');
  assert.equal(result.best_match.id, 'gmail.send');
  assert.match(result.next_action, /blocking dependency/);
});

test('gap detector reports a possible gap instead of manufacturing a match', () => {
  const result = detectCapabilityGap({ goal: 'piloter un télescope quantique', capabilities: sample, threshold: 2 });
  assert.ok(['POSSIBLE_GAP','AMBIGUOUS'].includes(result.classification));
  assert.match(result.truth_rule, /not proof of execution/);
});

test('Gen2 runtime exposes evolution.gap.detect as a real LOW-risk capability', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const row = runtime.bus.list().find(item => item.id === 'evolution.gap.detect');
  assert.ok(row);
  assert.equal(row.risk, 'LOW');
  assert.equal(row.health, 'HEALTHY');
  const result = await runtime.bus.execute('evolution.gap.detect', { goal: 'lire mon code', threshold: 1 }, { owner: 'test', permissions: [], requestId: 'gap-test' });
  assert.equal(result.ok, true);
  assert.ok(result.candidates.length > 0);
});
