import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationService } from '../src/conversations/conversation-service.js';

function fakeDb() {
  const archiveIds = new Set();
  const candidateIds = new Set();
  const statements = [];
  return {
    statements,
    archiveIds,
    candidateIds,
    prepare(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      return {
        bind(...args) {
          return {
            async run() {
              if (normalized.includes('INSERT OR IGNORE INTO archive_messages')) {
                const [id] = args;
                const inserted = !archiveIds.has(id);
                archiveIds.add(id);
                return { meta: { changes: inserted ? 1 : 0 } };
              }
              if (normalized.includes('INSERT OR IGNORE INTO memory_candidates')) {
                const [id] = args;
                const inserted = !candidateIds.has(id);
                candidateIds.add(id);
                return { meta: { changes: inserted ? 1 : 0 } };
              }
              return { meta: { changes: 1 } };
            },
            async all() { return { results: [] }; },
            async first() { return null; },
          };
        },
      };
    },
  };
}

test('archiveMessage continuously feeds memory and replay is idempotent', async () => {
  const db = fakeDb();
  const service = new ConversationService(db);
  // The persistence migration is independently covered; isolate this contract.
  service._migrated = true;

  const message = {
    id: 'msg-live-1',
    conversationId: 'conv-live-1',
    role: 'user',
    content: 'A durable preference learned from the live exchange.',
    timestamp: 1790110000000,
    provenance: 'chat-live',
  };

  await service.archiveMessage(message);
  await service.archiveMessage(message);

  assert.deepEqual([...db.archiveIds], ['msg-live-1']);
  assert.equal(db.candidateIds.size, 1, 'the same live message must create one deterministic memory candidate');
  assert.ok(db.statements.some((sql) => sql.includes('INSERT OR IGNORE INTO archive_messages')),
    'archive replay must be safe after a post-archive memory failure');
  assert.ok(db.statements.some((sql) => sql.includes('INSERT OR IGNORE INTO memory_candidates')),
    'live archival must reach the durable memory candidate sink');
});

test('empty message remains archived but does not invent a memory candidate', async () => {
  const db = fakeDb();
  const service = new ConversationService(db);
  service._migrated = true;

  await service.archiveMessage({
    id: 'msg-empty-1',
    conversationId: 'conv-live-1',
    role: 'assistant',
    content: '   ',
    timestamp: 1790110000001,
  });

  assert.equal(db.archiveIds.size, 1);
  assert.equal(db.candidateIds.size, 0);
});
