import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROADMAP_REGISTRY_REVISION,
  flattenRoadmap,
  getRoadmapPayload,
  validateRoadmap,
} from '../src/roadmap/master-roadmap.js';
import { selectNextAutonomyItem, manifestObjective } from '../src/evolution/autonomy-supervisor.js';

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
  assert.equal(media.status, 'DONE_VERIFIED');
  assert.match(media.next, /release #693|71d028320aabd9240478993629ed36f32344df7e|12\/12|#1193/i);

  const loraTrace = byId('MEL-LORA-TRACE-01');
  assert.ok(loraTrace);
  assert.equal(loraTrace.status, 'DONE_VERIFIED');
  assert.match(loraTrace.next, /37923410226|11615521167|verifyLoraDailyTrace|trace_verified=1/i);

  const nonVerified = rows.filter(row => row.status !== 'DONE_VERIFIED').map(row => row.id).sort();
  assert.deepEqual(nonVerified, [
    'MEL-AUDIT-02',
    'MEL-AUDIT-03',
    'MEL-AUDIT-04',
    'MEL-AUDIT-05',
    'MEL-AUDIT-06',
    'MEL-AUDIT-07',
    'MEL-UI-AUDIT-01',
    'MEL-UI-AUDIT-02',
    'MEL-UI-AUDIT-03',
    'MEL-UI-AUDIT-04',
    'MEL-UI-AUDIT-05',
    'MEL-UI-AUDIT-06',
    'MEL-UI-AUDIT-07',
    'MEL-CHAT-01',
    'MEL-CHAT-02',
    'MEL-CHAT-03',
    'MEL-CHAT-04',
    'MEL-CHAT-05',
    'MEL-CHAT-06',
    'MEL-CHAT-07',
    'MEL-CHAT-08',
    'MEL-COUNCIL-OPS-01',
    'MEL-COUNCIL-OPS-02',
    'MEL-LORA-CHAT-01',
    'MEL-LORA-MODE-01',
    'MEL-FOUNDER-01',
    'MEL-FOUNDER-02',
    'MEL-FOUNDER-03',
    'MEL-FOUNDER-04',
    'MEL-FOUNDER-05',
    'MEL-FOUNDER-06',
    'MEL-FOUNDER-07',
    'MEL-FOUNDER-08',
    'MEL-MANIFEST-01',
    'MEL-MANIFEST-02',
    'MEL-MANIFEST-03',
    'MEL-MANIFEST-04',
    'MEL-MANIFEST-05',
    'MEL-MANIFEST-06',
    'MEL-MANIFEST-07',
    'MEL-MANIFEST-08',
    'MEL-MANIFEST-09',
    'MEL-MANIFEST-10',
  ].sort());
});

test('MAX selects the open founder cycle instead of treating the historical registry as finished', () => {
  const next = selectNextAutonomyItem();
  assert.equal(next.id, 'MEL-FOUNDER-01');
  assert.equal(next.status, 'IN_PROGRESS');
  const followed = selectNextAutonomyItem({
    completedIds: ['MEL-FOUNDER-01', 'MEL-FOUNDER-02', 'MEL-FOUNDER-03', 'MEL-FOUNDER-04', 'MEL-FOUNDER-05', 'MEL-FOUNDER-07', 'MEL-FOUNDER-08'],
    verifiedIds: ['MEL-FOUNDER-01', 'MEL-FOUNDER-02', 'MEL-FOUNDER-03', 'MEL-FOUNDER-04', 'MEL-FOUNDER-05', 'MEL-FOUNDER-07', 'MEL-FOUNDER-08'],
  });
  assert.equal(followed.id, 'MEL-FOUNDER-06', 'the software device-protocol harness is schedulable without physical hardware');
  const objective = manifestObjective();
  assert.match(objective, /MEL-FOUNDER-01:IN_PROGRESS/);
  assert.match(objective, /MEL-MANIFEST-10:PLANNED/);
  assert.match(objective, /MEL-FOUNDER-06:PLANNED/);
  const decisionIds = ['MEL-FOUNDER-01','MEL-FOUNDER-02','MEL-FOUNDER-03','MEL-FOUNDER-04','MEL-FOUNDER-05'];
  for (const id of decisionIds) assert.notEqual(byId(id).status, 'DONE_VERIFIED', id);
  assert.equal(byId('MEL-FOUNDER-06').status, 'PLANNED');
  assert.equal(byId('MEL-FOUNDER-06').external_acceptance.status, 'BLOCKED_HUMAN');
});
