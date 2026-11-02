import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { generateCompletionMatrix } from '../src/roadmap/completion-matrix.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';

test('GEN2-61 executes the real final report contract without claiming maturity', async () => {
  const bus = createDefaultCapabilityBus({ env: {} });
  const result = await bus.execute('roadmap.final-report.verify', {}, { owner: 'test', permissions: [] });
  const matrix = generateCompletionMatrix();
  assert.equal(result.ok, true);
  assert.equal(result.fingerprint, matrix.matrix_fingerprint);
  assert.equal(result.total, matrix.rows.length);
  assert.equal(result.complete, matrix.summary.complete);
  if (matrix.summary.complete < matrix.summary.total) assert.notEqual(result.verdict, 'MATURE');
});

test('GEN2-61 does not become VERIFIED_LIVE merely because its source is mapped', () => {
  assert.deepEqual(ROADMAP_PROOF_SOURCES['GEN2-61'], { capabilities: ['roadmap.final-report.verify'] });
  assert.equal(classifyRoadmapItem('GEN2-61', { capabilities: new Map(), computer: new Map() }).truth, 'UNPROVEN');
});
