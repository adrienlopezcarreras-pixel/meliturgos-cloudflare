import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeRows } from '../src/core/orchestrator/conversation-context.js';

test('retrieved rows without IDs preserve distinct conversation evidence', () => {
  const first = { source: 'memories', conversation_id: 'a', role: 'user', content: 'Je parle espagnol' };
  const second = { source: 'memories', conversation_id: 'a', role: 'user', content: 'Je parle portugais' };
  assert.deepEqual(dedupeRows([first, second, { ...first }]), [first, second]);
});
test('identified memory records remain deduplicated by source and ID', () => {
  const first = { source: 'memories', id: 7, content: 'first' };
  assert.deepEqual(dedupeRows([first, { source: 'memories', id: 7, content: 'duplicate' }]), [first]);
});
