import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROADMAP_REGISTRY_REVISION,
  flattenRoadmap,
  getRoadmapPayload,
  validateRoadmap,
} from '../src/roadmap/master-roadmap.js';

function byId(id) {
  return flattenRoadmap().find(row => row.id === id);
}

test('roadmap registry stays structurally unique and exposes its revision', () => {
  const validation = validateRoadmap();
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  assert.match(ROADMAP_REGISTRY_REVISION, /^\d{4}-\d{2}-\d{2}\./);
  const payload = getRoadmapPayload();
  assert.equal(payload.source.kind, 'code_registry');
  assert.equal(payload.source.file, 'src/roadmap/master-roadmap.js');
  assert.equal(payload.source.revision, ROADMAP_REGISTRY_REVISION);
});

test('verified prompt/strategy versioning stays tied to the merged registry proof', () => {
  const row = byId('GEN2-52');
  assert.ok(row);
  assert.equal(row.status, 'DONE_VERIFIED');
  assert.match(row.next, /PR #56/i);
});

test('verified pre-LLM context interpreter is represented in the roadmap', () => {
  const row = byId('MEL-CONTEXT-04');
  assert.ok(row);
  assert.equal(row.status, 'DONE_VERIFIED');
  assert.match(row.title, /pré-LLM/i);
});

test('HD theme cleanup stays consolidated under the canonical control center deliverable', () => {
  assert.equal(byId('MEL-UI-04'), undefined);
  const row = byId('GEN2-54');
  assert.ok(row);
  assert.match(row.next, /une seule couche de présentation/i);
});

test('browser abstraction is done only with recorded real Browser Run proof', () => {
  const row = byId('GEN2-31');
  assert.ok(row);
  assert.equal(row.status, 'DONE_VERIFIED');
  assert.match(row.next, /Cloudflare Browser Run réel/i);
  assert.match(row.next, /browser\.execute validé de bout en bout/i);
  assert.match(row.next, /run 35708251465/i);
  assert.match(row.next, /2f3a0e108643fd407ca55760349cc00eb48426c8/i);
  assert.match(row.next, /audit COMPLETED/i);
});

test('canary rollback verification stays tied to the recorded real proof', () => {
  const row = byId('GEN2-53');
  assert.ok(row);
  assert.equal(row.status, 'DONE_VERIFIED');
  assert.match(row.next, /Actions run 35093195456/i);
});

test('canonical roadmap forbids bare DONE and requires exact production proof for promoted items', () => {
  const rows = flattenRoadmap();
  assert.equal(rows.some(row => row.status === 'DONE'), false);

  for (const id of ['MEL-COUNCIL-05','GEN2-33','MEL-SOV-01','MEL-UI-07']) {
    const row = byId(id);
    assert.equal(row.status, 'DONE_VERIFIED', id);
    assert.match(row.next, /1054e06986bc00d09eef29344df6f95ac7d557ba|release #669/i, id);
  }

  const media = byId('MEL-MEDIA-02');
  assert.equal(media.status, 'PARTIAL');
  assert.match(media.next, /37946032930|MEDIA_VIDEO_RENDER_TIMEOUT|12\/12/i);

  const loraTrace = byId('MEL-LORA-TRACE-01');
  assert.ok(loraTrace);
  assert.equal(loraTrace.status, 'DONE_VERIFIED');
  assert.match(loraTrace.next, /37923410226|11615521167|verifyLoraDailyTrace|trace_verified=1/i);

  const nonVerified = rows.filter(row => row.status !== 'DONE_VERIFIED');
  assert.deepEqual(nonVerified.map(row => row.id), ['MEL-MEDIA-02']);
});
