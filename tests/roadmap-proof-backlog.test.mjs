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
