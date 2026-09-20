import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { loadConversationFocusState, saveConversationFocusState } from '../src/api/conversation-focus-store.js';

test('conversation focus persists anchor, constraints and exclusions across turns', async () => {
  const DB = sqliteD1();
  try {
    const env = { DB };
    const saved = await saveConversationFocusState(env, 'focus-c1', {
      anchor:'améliore la communication de MEL',
      constraints:['reste uniquement sur la communication'],
      excluded_topics:['shardvault'],
    });
    assert.equal(saved, true);
    const row = await loadConversationFocusState(env, 'focus-c1');
    assert.equal(row.anchor, 'améliore la communication de MEL');
    assert.deepEqual(row.constraints, ['reste uniquement sur la communication']);
    assert.deepEqual(row.excluded_topics, ['shardvault']);
    assert.ok(row.updated_at > 0);
  } finally {
    DB.close();
  }
});

test('conversation focus store fails soft without D1', async () => {
  assert.equal(await loadConversationFocusState({}, 'x'), null);
  assert.equal(await saveConversationFocusState({}, 'x', { anchor:'a' }), false);
});
