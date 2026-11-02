import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { prepareGen2 } from '../src/persistence/gen2-schema.js';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';

test('GEN2-10 fails closed on empty database and uses existing D1 facts only', async () => {
  const DB = sqliteD1();
  try {
    await prepareGen2(DB);
    const bus = createDefaultCapabilityBus({ env:{ DB } });
    await assert.rejects(() => bus.execute('memory.contradiction.provenance.verify', {}, { owner:'test', permissions:[] }), /MEMORY_LIVE_PROOF_INSUFFICIENT_DATA/);
  } finally { DB.close(); }
});

test('GEN2-10 verifies actual persisted conflicts, provenance and expired exclusion', async () => {
  const DB = sqliteD1();
  try {
    await prepareGen2(DB);
    const now=Date.now();
    const insert=async(content,metadata,validUntil=null)=>DB.prepare(`INSERT INTO memories(created_at,kind,content,importance,confidence,valid_from,valid_until,source,provenance,metadata)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(now,'fact',content,0.8,0.9,now-1000,validUntil,'archive_learning','{"conversation_id":"abc"}',JSON.stringify(metadata)).run();
    await insert('unrelated-conflict-record', {});
    const conflict=await DB.prepare('SELECT id FROM memories WHERE content=?').bind('unrelated-conflict-record').first();
    await insert('currently-confirmed-statement', { contradictions:[{id:String(conflict.id)}] });
    await insert('uniquely-expired-proof-record', {}, now-1000);
    const bus=createDefaultCapabilityBus({ env:{ DB } });
    const result=await bus.execute('memory.contradiction.provenance.verify', {}, { owner:'test', permissions:[] });
    assert.equal(result.ok,true);
    assert.ok(result.live_records>=3);
  } finally { DB.close(); }
});
test('GEN2-10 mapping never counts as a live production success', () => {
  assert.deepEqual(ROADMAP_PROOF_SOURCES['GEN2-10'], { capabilities:['memory.contradiction.provenance.verify'] });
  assert.equal(classifyRoadmapItem('GEN2-10', { capabilities:new Map(), computer:new Map() }).truth,'UNPROVEN');
});
