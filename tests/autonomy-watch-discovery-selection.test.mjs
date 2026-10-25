import test from 'node:test';
import assert from 'node:assert/strict';
import { selectActionableAutonomyJob } from '../src/evolution/autonomy-supervisor.js';

test('a watch discovery is worked even though its origin roadmap item GEN2-42 is closed', () => {
  const roadmap = [{ id: 'GEN2-42', status: 'DONE_VERIFIED' }];
  const discovery = { id: 'ecosystem-watch-x', requested_by: 'mel-autonomy', status: 'QUEUED', created_at: 1,
    optional_context: { source: 'ecosystem-watch', roadmap_id: 'GEN2-42', priority: 'P1' } };
  const closedAttempt = { id: 'mel-autonomy-gen2-42-1', requested_by: 'mel-autonomy', status: 'QUEUED', created_at: 1,
    optional_context: { roadmap_id: 'GEN2-42' } };
  assert.equal(selectActionableAutonomyJob([discovery], { roadmap })?.id, 'ecosystem-watch-x');
  assert.equal(selectActionableAutonomyJob([closedAttempt], { roadmap }), null);
});
