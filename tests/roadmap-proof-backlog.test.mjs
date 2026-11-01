import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadmapProofBacklog } from '../scripts/roadmap-proof-backlog.mjs';

test('proof backlog includes only declared done items without registered proof sources', () => {
  const items = [
    { id: 'A', title: 'Unproven', status: 'DONE_VERIFIED' },
    { id: 'B', title: 'Mapped', status: 'DONE_VERIFIED' },
    { id: 'C', title: 'Incomplete', status: 'IN_PROGRESS' },
  ];
  const result = buildRoadmapProofBacklog(items, { B: { capabilities: ['code.read'] } });
  assert.deepEqual(result.items.map(item => item.id), ['A']);
  assert.equal(result.remaining_count, 1);
  assert.equal(result.items[0].proof_status, 'DECLARED');
  assert.equal(result.schema, 'mel.roadmap-proof-backlog/v1');
});

test('backlog never turns a mapping or a declaration into verified evidence', () => {
  const items = [{ id: 'A', status: 'DONE_VERIFIED' }];
  const result = buildRoadmapProofBacklog(items, {});
  assert.equal(result.items[0].proof_status, 'DECLARED');
  assert.equal('verified_live' in result, false);
});

// Explicit baseline. Every proof-source change must deliberately update this
// expected set, so a previously removed item cannot silently return while the
// old <= 42 count still passes.
test('unproven DONE_VERIFIED IDs match the reviewed proof baseline exactly', () => {
  const expected = [
    "GEN2-03",
    "GEN2-04",
    "MEL-CONTEXT-01",
    "MEL-CONTEXT-02",
    "MEL-CONTEXT-04",
    "MEL-MEM-02",
    "MEL-COUNCIL-03",
    "MEL-COUNCIL-04",
    "MEL-EVOL-06",
    "GEN2-32",
    "MEL-CONN-01",
    "MEL-CONN-02",
    "MEL-VOICE-01",
    "MEL-AVATAR-01",
    "MEL-AVATAR-02",
    "MEL-AVATAR-03",
    "GEN2-26",
    "GEN2-27",
    "GEN2-58",
    "GEN2-59",
    "MEL-DEVICE-02",
    "MEL-DEVICE-03",
    "MEL-SEC-05",
    "MEL-SOV-01",
    "GEN2-43",
    "MEL-LORA-TRACE-01",
    "GEN2-54",
    "MEL-UI-01",
    "MEL-UI-02",
    "MEL-UI-03",
    "MEL-UI-06",
    "GEN2-57",
    "MEL-REL-03"
  ];
  const actual = buildRoadmapProofBacklog().items.map(item => item.id);
  assert.deepEqual([...actual].sort(), [...expected].sort(),
    'Review the evidence and update the explicit baseline when proof coverage changes');
});
