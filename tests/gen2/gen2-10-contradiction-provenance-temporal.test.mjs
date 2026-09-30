import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { prepareGen2 } from '../../src/persistence/gen2-schema.js';
import { createMemoryService } from '../../src/memory/memory-service.js';

test('GEN2-10 preserves contradiction, provenance and temporal validity on the current runtime', async () => {
  const DB = sqliteD1();
  try {
    await prepareGen2(DB);
    const now = Date.now();

    await DB.prepare(`INSERT INTO memories(created_at,kind,content,importance,confidence,valid_from,valid_until,source,provenance,metadata)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
      now - 3000, 'fact', 'Le projet Atlas utilise le moteur local.', 0.8, 0.9,
      now - 5000, null, 'archive_learning',
      JSON.stringify({ conversation_id:'conv-a', message_id:'msg-a', observed_at:now-3000 }),
      JSON.stringify({})
    ).run();
    const conflict = await DB.prepare("SELECT id FROM memories WHERE content LIKE '%Atlas utilise%' LIMIT 1").first();

    await DB.prepare(`INSERT INTO memories(created_at,kind,content,importance,confidence,valid_from,valid_until,source,provenance,metadata)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
      now - 2000, 'fact', 'Le projet Atlas abandonne le moteur local.', 0.8, 0.88,
      now - 2500, null, 'archive_learning',
      JSON.stringify({ conversation_id:'conv-b', message_id:'msg-b', observed_at:now-2000 }),
      JSON.stringify({ contradictions:[{ id:String(conflict.id), observed_at:now-2000 }] })
    ).run();
    const current = await DB.prepare("SELECT id FROM memories WHERE content LIKE '%Atlas abandonne%' LIMIT 1").first();

    await DB.prepare(`INSERT INTO memories(created_at,kind,content,importance,confidence,valid_from,valid_until,source,provenance,metadata)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
      now - 10000, 'fact', 'Atlas ancien état expiré.', 0.5, 0.7,
      now - 12000, now - 1000, 'legacy',
      JSON.stringify({ conversation_id:'conv-old', message_id:'msg-old', observed_at:now-10000 }),
      JSON.stringify({})
    ).run();

    const service = createMemoryService(DB);
    const conflicts = await service.findConflicts({ id: current.id });
    assert.deepEqual(conflicts.conflict_ids, [String(conflict.id)]);
    assert.equal(conflicts.conflicts.length, 1);
    assert.equal(conflicts.conflicts[0].content, 'Le projet Atlas utilise le moteur local.');

    const provenance = await service.getProvenance({ id: current.id });
    assert.equal(provenance.source, 'archive_learning');
    assert.equal(JSON.parse(provenance.provenance).conversation_id, 'conv-b');
    assert.equal(JSON.parse(provenance.provenance).message_id, 'msg-b');

    const active = await service.search({ query:'Atlas', limit:10 });
    assert.ok(active.some(row => row.id === current.id));
    assert.ok(active.some(row => row.id === conflict.id));
    assert.ok(!active.some(row => row.content === 'Atlas ancien état expiré.'));
  } finally {
    DB.close();
  }
});
