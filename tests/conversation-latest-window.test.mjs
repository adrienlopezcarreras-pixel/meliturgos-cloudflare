import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createConversationService } from '../src/conversations/conversation-service.js';

test('latest conversation window returns the newest messages in chronological order', async () => {
  const DB = sqliteD1();
  try {
    const service = createConversationService({ DB });
    for (let i = 1; i <= 60; i++) {
      await service.archiveMessage({
        conversationId:'latest-window',
        role:i % 2 ? 'user' : 'assistant',
        content:'message-' + i,
        timestamp:i,
      });
    }
    const latest = await service.getMessages('latest-window', { limit:4, latest:true });
    assert.deepEqual(latest.map(x => x.content), ['message-57','message-58','message-59','message-60']);
    const first = await service.getMessages('latest-window', { limit:4 });
    assert.deepEqual(first.map(x => x.content), ['message-1','message-2','message-3','message-4']);
  } finally { DB.close(); }
});
