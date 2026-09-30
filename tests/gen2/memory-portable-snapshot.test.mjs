import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { registerMemoryCompatibilityCapabilities } from '../../src/capabilities/memory-compat-capabilities.js';
import {
  createPortableMemorySnapshot,
  verifyPortableMemorySnapshot,
  MEMORY_SNAPSHOT_SCHEMA_VERSION,
} from '../../src/memory/portable-export.js';
import { DB_SCHEMA_VERSION } from '../../src/core/config.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

test('portable full-memory snapshot is deterministic, versioned and self-verifying', async () => {
  const snapshot = await createPortableMemorySnapshot({
    owner: 'adrien',
    exportedAt: '2026-09-25T08:30:00.000Z',
    db_schema_version: DB_SCHEMA_VERSION,
    memories: [
      { id: 2, content: 'B', created_at: 2 },
      { id: 1, content: 'A', created_at: 1 },
    ],
    conversations: [
      { id: 'c2', title: 'Deux', created_at: 2 },
      { id: 'c1', title: 'Un', created_at: 1 },
    ],
    archive_messages: [
      { id: 'm2', conversation_id: 'c2', content: 'B', timestamp: 2 },
      { id: 'm1', conversation_id: 'c1', content: 'A', timestamp: 1 },
    ],
    source_counts: {
      memories: 2,
      conversations: 2,
      archive_messages: 2,
    },
  });

  assert.equal(snapshot.schema_version, MEMORY_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.manifest.db_schema_version, DB_SCHEMA_VERSION);
  assert.equal(snapshot.manifest.checksum_algorithm, 'SHA-256');
  assert.equal(snapshot.manifest.total_source_records, 6);
  assert.equal(snapshot.manifest.total_exported_records, 6);
  assert.equal(snapshot.manifest.complete, true);
  assert.match(snapshot.manifest.export_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(snapshot.memories.map(row => row.id), [1, 2]);

  const verification = await verifyPortableMemorySnapshot(snapshot);
  assert.equal(verification.ok, true);
  assert.equal(verification.complete, true);
  assert.deepEqual(verification.failures, []);
});

test('snapshot verifier detects record, owner and manifest tampering', async () => {
  const snapshot = await createPortableMemorySnapshot({
    owner: 'adrien',
    exportedAt: '2026-09-25T08:31:00.000Z',
    memories: [{ id: 1, content: 'original' }],
    conversations: [],
    archive_messages: [],
  });
  const tampered = structuredClone(snapshot);
  tampered.owner = 'intruder';
  tampered.memories[0].content = 'modified';
  tampered.manifest.total_exported_records = 99;

  const verification = await verifyPortableMemorySnapshot(tampered);
  assert.equal(verification.ok, false);
  assert.ok(verification.failures.includes('OWNER_MISMATCH'));
  assert.ok(verification.failures.includes('COLLECTION_memories_CHECKSUM_MISMATCH'));
  assert.ok(verification.failures.includes('EXPORT_CHECKSUM_MISMATCH'));
  assert.ok(verification.failures.includes('TOTAL_EXPORTED_COUNT_MISMATCH'));
});

test('bounded export declares truncation instead of silently claiming completeness', async () => {
  const snapshot = await createPortableMemorySnapshot({
    memories: [{ id: 1, content: 'one' }],
    conversations: [],
    archive_messages: [],
    source_counts: {
      memories: 4,
      conversations: 0,
      archive_messages: 0,
    },
  });
  assert.equal(snapshot.manifest.complete, false);
  const memory = snapshot.manifest.collections.find(row => row.name === 'memories');
  assert.equal(memory.source_count, 4);
  assert.equal(memory.exported_count, 1);
  assert.equal(memory.complete, false);

  const verification = await verifyPortableMemorySnapshot(snapshot);
  assert.equal(verification.ok, true);
  assert.equal(verification.complete, false);
});

test('memory.export capability returns manifest and memory.export.verify validates it', async () => {
  const db = sqliteD1();
  try {
    await db.prepare('CREATE TABLE memories (id INTEGER PRIMARY KEY, content TEXT NOT NULL, created_at INTEGER NOT NULL)').run();
    await db.prepare('CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT, created_at INTEGER)').run();
    await db.prepare('CREATE TABLE archive_messages (id TEXT PRIMARY KEY, conversation_id TEXT, content TEXT, timestamp INTEGER)').run();
    await db.prepare('INSERT INTO memories(id,content,created_at) VALUES(?,?,?)').bind(1, 'mémoire test', 1).run();
    await db.prepare('INSERT INTO conversations(id,title,created_at) VALUES(?,?,?)').bind('c1', 'Conversation', 2).run();
    await db.prepare('INSERT INTO archive_messages(id,conversation_id,content,timestamp) VALUES(?,?,?,?)').bind('m1', 'c1', 'bonjour', 3).run();

    const bus = new CapabilityBus();
    registerMemoryCompatibilityCapabilities(bus, { DB: db, MELITURGOS_USER: 'adrien' });
    const context = { owner: 'adrien', permissions: [] };

    const snapshot = await bus.execute('memory.export', {}, context);
    assert.equal(snapshot.manifest.complete, true);
    assert.equal(snapshot.manifest.total_exported_records, 3);
    assert.equal(snapshot.memories.length, 1);
    assert.equal(snapshot.conversations.length, 1);
    assert.equal(snapshot.archive_messages.length, 1);

    const verification = await bus.execute('memory.export.verify', snapshot, context);
    assert.equal(verification.ok, true);
    assert.equal(verification.complete, true);
  } finally {
    db.close();
  }
});
