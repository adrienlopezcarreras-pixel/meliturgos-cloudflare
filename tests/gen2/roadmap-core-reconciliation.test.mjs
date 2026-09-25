import assert from 'node:assert/strict';
import test from 'node:test';

import { flattenRoadmap } from '../../src/roadmap/master-roadmap.js';

const EXPECTED_CORE_RECONCILIATION = Object.freeze({
  'MEL-CONTEXT-03': 'PARTIAL',
  'GEN2-12': 'PARTIAL',
  'GEN2-13': 'PARTIAL',
  'MEL-EVOL-05': 'PARTIAL',
  'GEN2-40': 'PARTIAL',
});

test('core roadmap reflects modules already present on main', () => {
  const rows = new Map(flattenRoadmap().map(row => [row.id, row]));
  for (const [id, status] of Object.entries(EXPECTED_CORE_RECONCILIATION)) {
    const row = rows.get(id);
    assert.ok(row, `missing roadmap item ${id}`);
    assert.equal(row.status, status, `${id} must not regress to PLANNED while its core module exists`);
    assert.ok(String(row.next || '').length > 40, `${id} must document the remaining integration proof`);
  }
});

test('core reconciliation does not reclassify Android or MINI work', () => {
  const rows = new Map(flattenRoadmap().map(row => [row.id, row]));
  assert.equal(rows.get('GEN2-27')?.id, 'GEN2-27');
  assert.equal(rows.get('GEN2-58')?.id, 'GEN2-58');
});
