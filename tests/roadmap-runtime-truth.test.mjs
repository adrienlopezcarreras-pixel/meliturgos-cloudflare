import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';

function byId(id) {
  return flattenRoadmap().find((row) => row.id === id);
}

test('roadmap keeps broader autonomy open while preserving verified Work and gap evidence', () => {
  const autonomy = byId('GEN2-17');
  assert.ok(autonomy, 'missing roadmap item GEN2-17');
  assert.equal(autonomy.status, 'PARTIAL');

  const work = byId('MEL-WORK-02');
  assert.ok(work, 'missing roadmap item MEL-WORK-02');
  assert.equal(work.status, 'DONE_VERIFIED');
  assert.match(work.next, /50 tâches|50 gates|heartbeats|sans duplication/i);

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
  assert.match(byId('MEL-CODE-01').next, /production|Worker réellement déployé/i);
});
