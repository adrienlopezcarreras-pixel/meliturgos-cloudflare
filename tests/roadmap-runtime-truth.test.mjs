import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';

function byId(id) {
  return flattenRoadmap().find((row) => row.id === id);
}

test('roadmap keeps broader autonomy and Work partial while acknowledging verified gap detection', () => {
  for (const id of ['GEN2-17', 'MEL-WORK-02']) {
    const row = byId(id);
    assert.ok(row, `missing roadmap item ${id}`);
    assert.equal(row.status, 'PARTIAL', `${id} must remain PARTIAL until live end-to-end proof exists`);
  }

  const gapDetection = byId('MEL-EVOL-01');
  assert.ok(gapDetection, 'missing roadmap item MEL-EVOL-01');
  assert.equal(gapDetection.status, 'DONE_VERIFIED');
  assert.match(gapDetection.next, /d[ée]tection|gap|doublon|module/i);
});

test('web research remains partial until production validation while naming the remaining proof', () => {
  const row = byId('GEN2-37');
  assert.equal(row.status, 'PARTIAL');
  assert.match(row.next, /production/i);
  assert.match(row.next, /sources/i);
});

test('code access roadmap still requires production proof instead of inheriting candidate CI success', () => {
  assert.equal(byId('MEL-CODE-01').status, 'IN_PROGRESS');
  assert.equal(byId('MEL-CODE-02').status, 'IN_PROGRESS');
  assert.match(byId('MEL-CODE-01').next, /production/i);
});
