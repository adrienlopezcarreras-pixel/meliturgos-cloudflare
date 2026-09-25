import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { migrate } from '../src/persistence/migrations.js';
import { prepareGen2 } from '../src/persistence/gen2-schema.js';
import { auditDataIntegrity } from '../src/diagnostics/data-integrity.js';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';

async function healthyDb() {
  const db=sqliteD1();
  await migrate(db);
  await prepareGen2(db);
  const now=Date.now();
  await db.prepare("INSERT INTO conversations(id,owner,title,status,created_at,updated_at,metadata) VALUES(?,?,?,?,?,?,?)")
    .bind('c1','owner','healthy','active',now,now,'{}').run();
  await db.prepare("INSERT INTO devices(id,owner,name,kind,created_at,updated_at,last_seen_at,metadata) VALUES(?,?,?,?,?,?,?,?)")
    .bind('d1','owner','device','test',now,now,now,'{}').run();
  await db.prepare("INSERT INTO archive_messages(id,conversation_id,device_id,role,content,timestamp,provenance,metadata) VALUES(?,?,?,?,?,?,?,?)")
    .bind('m1','c1','d1','user','hello',now,'test','{}').run();
  await db.prepare("INSERT INTO memory_candidates(id,conversation_id,message_id,content,confidence,source,status,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind('mc1','c1','m1','hello',0.8,'test','PENDING',now).run();
  return db;
}

test('GEN2-55 integrity audit passes a coherent migrated database without exposing content', async () => {
  const db=await healthyDb();
  try {
    const result=await auditDataIntegrity(db);
    assert.equal(result.ok,true);
    assert.equal(result.summary.failed,0);
    assert.equal(result.checks.find(check=>check.id==='schema.version').status,'PASS');
    assert.equal(JSON.stringify(result).includes('hello'),false);
  } finally { db.close(); }
});

test('GEN2-55 integrity audit detects orphan archive and memory references with bounded identifiers', async () => {
  const db=await healthyDb();
  try {
    const now=Date.now();
    await db.prepare("INSERT INTO archive_messages(id,conversation_id,device_id,role,content,timestamp,provenance,metadata) VALUES(?,?,?,?,?,?,?,?)")
      .bind('orphan-message','missing-conversation',null,'user','secret-content',now,'test','{}').run();
    await db.prepare("INSERT INTO memory_candidates(id,conversation_id,message_id,content,confidence,source,status,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind('orphan-candidate','c1','missing-message','secret-memory',0.8,'test','PENDING',now).run();

    const result=await auditDataIntegrity(db);
    assert.equal(result.ok,false);
    assert.equal(result.state,'FAIL');
    assert.equal(result.checks.find(check=>check.id==='archive_messages.conversation').count,1);
    assert.equal(result.checks.find(check=>check.id==='memory_candidates.message').count,1);
    assert.equal(JSON.stringify(result).includes('secret-content'),false);
    assert.equal(JSON.stringify(result).includes('secret-memory'),false);
    assert.ok(result.summary.anomaly_count>=2);
  } finally { db.close(); }
});

test('GEN2-55 integrity audit detects malformed JSON and reversed timestamps', async () => {
  const db=await healthyDb();
  try {
    await db.prepare("UPDATE conversations SET metadata=?, updated_at=? WHERE id=?")
      .bind('{broken',1,'c1').run();
    const result=await auditDataIntegrity(db);
    assert.equal(result.ok,false);
    assert.equal(result.checks.find(check=>check.id==='conversations.metadata').status,'FAIL');
    assert.equal(result.checks.find(check=>check.id==='conversations.time_order').status,'FAIL');
  } finally { db.close(); }
});

test('GEN2-55 integrity audit fails schema version when migrations are absent', async () => {
  const db=sqliteD1();
  try {
    const result=await auditDataIntegrity(db);
    assert.equal(result.ok,false);
    assert.equal(result.checks.find(check=>check.id==='schema.version').reason,'SCHEMA_MIGRATIONS_MISSING');
    assert.ok(result.summary.skipped>0);
  } finally { db.close(); }
});


test('GEN2-55 system.integrity is available through CapabilityBus and remains read-only', async () => {
  const db=await healthyDb();
  try {
    const bus=createDefaultCapabilityBus({env:{DB:db,MELITURGOS_USER:'owner'}});
    const descriptor=bus.describe('system.integrity');
    assert.equal(descriptor.risk,'LOW');
    assert.deepEqual(descriptor.permissions,[]);
    assert.equal(descriptor.health,'HEALTHY');

    const result=await bus.execute('system.integrity',{},{
      owner:'owner',
      requestId:'integrity-test',
      permissions:[],
    });
    assert.equal(result.schema,'mel.data-integrity-audit');
    assert.equal(result.ok,true);
  } finally { db.close(); }
});

test('GEN2-55 system.integrity is unavailable without D1', () => {
  const bus=createDefaultCapabilityBus({env:{}});
  assert.equal(bus.describe('system.integrity').health,'UNAVAILABLE');
});


test('GEN2-55 integrity audit fails when a required migration table is missing despite current schema version', async () => {
  const db=await healthyDb();
  try {
    await db.prepare('DROP TABLE archive_messages').run();
    const result=await auditDataIntegrity(db);
    const required=result.checks.find(check=>check.id==='schema.required_tables');
    assert.equal(required.status,'FAIL');
    assert.equal(required.samples.some(sample=>sample.table==='archive_messages'),true);
  } finally { db.close(); }
});

test('GEN2-55 integrity audit detects invalid archive roles and candidate confidence range', async () => {
  const db=await healthyDb();
  try {
    const now=Date.now();
    await db.prepare("INSERT INTO archive_messages(id,conversation_id,device_id,role,content,timestamp,provenance,metadata) VALUES(?,?,?,?,?,?,?,?)")
      .bind('m-bad-role','c1',null,'hacker','x',now,'test','{}').run();
    await db.prepare("INSERT INTO memory_candidates(id,conversation_id,message_id,content,confidence,source,status,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind('mc-bad-confidence','c1','m-bad-role','x',4.2,'test','PENDING',now).run();
    const result=await auditDataIntegrity(db);
    assert.equal(result.checks.find(check=>check.id==='archive_messages.role').status,'FAIL');
    assert.equal(result.checks.find(check=>check.id==='memory_candidates.confidence').status,'FAIL');
  } finally { db.close(); }
});


test('GEN2-55 integrity audit detects a missing intermediate migration even when max version is current', async () => {
  const db=await healthyDb();
  try {
    await db.prepare('DELETE FROM schema_migrations WHERE version=?').bind(6).run();
    const result=await auditDataIntegrity(db);
    assert.equal(result.checks.find(check=>check.id==='schema.version').status,'PASS');
    const history=result.checks.find(check=>check.id==='schema.migration_history');
    assert.equal(history.status,'FAIL');
    assert.equal(history.samples.some(sample=>sample.version===6 && sample.issue==='MISSING'),true);
  } finally { db.close(); }
});
