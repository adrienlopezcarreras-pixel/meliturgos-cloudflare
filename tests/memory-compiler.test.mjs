import test from 'node:test';
import assert from 'node:assert/strict';
import { compileMemoryCandidates, normalizeMemoryContent } from '../src/memory/compiler.js';
import { createMemoryService } from '../src/memory/memory-service.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

test('memory compiler canonically deduplicates without synthetic confidence boost and preserves provenance', () => {
  assert.equal(normalizeMemoryContent('  Projet\u00a0  solaire  '), 'Projet solaire');

  const result = compileMemoryCandidates({
    candidates: [
      { id: 'c1', conversation_id: 'conv-a', message_id: 'm1', content: 'Projet  solaire', confidence: 0.62, source: 'chat', created_at: 1 },
      { id: 'c2', conversation_id: 'conv-b', message_id: 'm2', content: 'projet solaire', confidence: 0.81, source: 'import', created_at: 2 },
      { id: 'c3', conversation_id: 'conv-b', message_id: 'm3', content: 'Autre fait', confidence: 0.4, source: 'chat', created_at: 3 },
    ],
  });

  assert.equal(result.input_count, 3);
  assert.equal(result.proposal_count, 2);
  assert.equal(result.deduplicated_count, 1);
  assert.equal(result.writes_performed, 0);

  const solar = result.proposals.find(row => /solaire/i.test(row.content));
  assert.equal(solar.action, 'PROPOSE_MEMORY');
  assert.equal(solar.confidence, 0.81);
  assert.equal(solar.confidence_policy, 'MAX_OBSERVED_NO_DUPLICATE_BOOST');
  assert.equal(solar.duplicate_count, 1);
  assert.deepEqual(solar.provenance.candidate_ids, ['c1', 'c2']);
  assert.deepEqual(solar.provenance.conversation_ids, ['conv-a', 'conv-b']);
  assert.deepEqual(solar.provenance.message_ids, ['m1', 'm2']);
  assert.deepEqual(solar.provenance.sources, ['chat', 'import']);
  assert.equal(solar.provenance.observations, 2);
});

test('memory compiler emits deterministic recency, normalized topics and evidence quality', () => {
  const result = compileMemoryCandidates({
    candidates: [
      {
        id: 'old', content: 'Même projet', confidence: 0.6, source: 'chat',
        created_at: '2026-09-10T12:00:00.000Z', topic: ' Projet unique ', topics: ['Apiculture'],
      },
      {
        id: 'new', content: 'même projet', confidence: 0.8, source: 'teacher',
        created_at: '2026-09-13T15:30:00.000Z', topics: ['Mémoire', 'APICULTURE'],
      },
    ],
  });

  const proposal = result.proposals[0];
  assert.deepEqual(proposal.topics, ['projet unique', 'apiculture', 'mémoire']);
  assert.deepEqual(proposal.recency, {
    first_observed_at: '2026-09-10T12:00:00.000Z',
    last_observed_at: '2026-09-13T15:30:00.000Z',
    observation_span_ms: 271800000,
    timestamped_observations: 2,
  });
  assert.deepEqual(proposal.quality, {
    score: 0.8,
    policy: 'MAX_OBSERVED_CONFIDENCE_NO_DUPLICATE_BOOST',
    observations: 2,
    distinct_sources: 2,
    timestamp_coverage: 1,
    provenance_complete: true,
  });
  assert.equal(proposal.confidence, 0.8);
});

test('memory compiler reuses an existing canonical memory and rejects invalid confidence fail-closed', () => {
  const result = compileMemoryCandidates({
    candidates: [
      { id: 'new-1', content: '  JARDIN solaire ', confidence: 0.7, source: 'chat' },
      { id: 'bad', content: 'fait invalide', confidence: 4, source: 'chat' },
    ],
    existingMemories: [
      { id: 42, kind: 'fact', content: 'jardin solaire', confidence: 1, source: 'explicit_user' },
    ],
  });

  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].action, 'REUSE_EXISTING');
  assert.equal(result.proposals[0].existing_memory_id, 42);
  assert.equal(result.rejected_count, 1);
  assert.deepEqual(result.rejected[0], { id: 'bad', code: 'MEMORY_CONFIDENCE_INVALID' });
});

test('MemoryService.consolidate runs the real D1 candidate path without persisting or confirming proposals', async () => {
  const db = sqliteD1();
  try {
    await db.prepare(`CREATE TABLE memory_candidates (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`).run();
    await db.prepare(`CREATE TABLE memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      importance REAL NOT NULL,
      confidence REAL NOT NULL,
      valid_from INTEGER,
      valid_until INTEGER,
      supersedes_id INTEGER,
      source TEXT NOT NULL,
      provenance TEXT NOT NULL,
      metadata TEXT NOT NULL,
      fingerprint TEXT
    )`).run();

    await db.prepare("INSERT INTO memory_candidates VALUES (?,?,?,?,?,?,?,?)")
      .bind('c1','conv','m1','Même   fait',0.55,'chat','PENDING',1).run();
    await db.prepare("INSERT INTO memory_candidates VALUES (?,?,?,?,?,?,?,?)")
      .bind('c2','conv','m2','même fait',0.75,'archive','PENDING',2).run();
    await db.prepare("INSERT INTO memory_candidates VALUES (?,?,?,?,?,?,?,?)")
      .bind('ignored','conv','m3','pas encore',0.99,'chat','REJECTED',3).run();

    const service = createMemoryService(db);
    const result = await service.consolidate({ limit: 50 });

    assert.equal(result.input_count, 2);
    assert.equal(result.proposal_count, 1);
    assert.equal(result.proposals[0].confidence, 0.75);
    assert.equal(result.proposals[0].action, 'PROPOSE_MEMORY');
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM memories').first()).n, 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM memory_candidates WHERE status='PENDING'").first()).n, 2);
  } finally {
    db.close();
  }
});
