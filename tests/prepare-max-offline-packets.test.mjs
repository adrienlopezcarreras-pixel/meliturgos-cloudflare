import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfflinePackets } from '../scripts/prepare-max-offline-packets.mjs';

test('offline packets include only registry-open objectives, without invented approvals', () => {
  const packets = buildOfflinePackets([
    { id: 'A', title: 'Open', priority: 'P1', status: 'PLANNED', code_paths: ['src/a.js'], test_paths: ['tests/a.test.mjs'], depends_on: ['B'] },
    { id: 'B', title: 'Done', priority: 'P1', status: 'DONE_VERIFIED' },
    { id: 'C', title: 'Blocked', priority: 'P2', status: 'BLOCKED_EXTERNAL' },
  ]);
  assert.deepEqual(packets.map(x => x.roadmap_id), ['A', 'C']);
  assert.deepEqual(packets[0].code_paths, ['src/a.js']);
  assert.deepEqual(packets[0].depends_on, ['B']);
  assert.ok(packets.every(x => x.council_verdict === 'NOT_REQUESTED' && x.candidate_sha === null && x.status === 'PREPARATION_ONLY_NOT_EXECUTED'));
});

test('offline packet preparation rejects duplicate open IDs', () => {
  assert.throws(() => buildOfflinePackets([
    {id:'A',status:'PLANNED'}, {id:'A',status:'PLANNED'}
  ]), /INVALID_OR_DUPLICATE_ROADMAP_ID/);
});
