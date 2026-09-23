import test from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATIONS, migrate } from '../src/persistence/migrations.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const legacyMigration = MIGRATIONS.find(row => row.version === 13);

async function createLegacyTable(DB) {
  await DB.prepare(`CREATE TABLE interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    user_text TEXT NOT NULL,
    assistant_text TEXT NOT NULL,
    model TEXT NOT NULL,
    feedback INTEGER,
    correction TEXT
  )`).run();
}

test('GEN2-57 fresh databases record source absence without inventing legacy data', async()=>{
  const DB=sqliteD1();
  try{
    const result=await migrate(DB,13);
    assert.equal(result.currentVersion,13);
    assert.equal(await DB.prepare("SELECT COUNT(*) AS n FROM archive_messages").first().then(r=>Number(r.n)),0);
    const audit=await DB.prepare("SELECT * FROM legacy_migration_audit WHERE id='gen1-interactions-v1'").first();
    assert.equal(audit.source_exists,0);
    assert.equal(audit.source_rows,0);
    assert.equal(audit.migrated_messages,0);
    assert.equal(audit.verified,1);
    assert.equal(JSON.parse(audit.details_json).reason,'SOURCE_TABLE_ABSENT');
  }finally{DB.close();}
});

test('GEN2-57 migrates every Gen1 interaction losslessly and preserves the source table', async()=>{
  const DB=sqliteD1();
  try{
    await createLegacyTable(DB);
    await DB.prepare("INSERT INTO interactions(id,created_at,user_text,assistant_text,model,feedback,correction) VALUES(?,?,?,?,?,?,?)")
      .bind(7,1700000000000,'question historique','réponse historique','legacy-model',1,'correction validée').run();
    await DB.prepare("INSERT INTO interactions(id,created_at,user_text,assistant_text,model,feedback,correction) VALUES(?,?,?,?,?,?,?)")
      .bind(8,1700000010000,'deuxième question','deuxième réponse','legacy-model-2',0,null).run();

    const result=await migrate(DB,13);
    assert.equal(result.currentVersion,13);

    const source=await DB.prepare("SELECT COUNT(*) AS n FROM interactions").first();
    assert.equal(Number(source.n),2,'source legacy must remain untouched');

    const conversations=await DB.prepare("SELECT id,status,title FROM conversations WHERE id LIKE 'legacy-gen1-%' ORDER BY id").all();
    assert.equal(conversations.results.length,2);
    assert.deepEqual(conversations.results.map(r=>r.id),['legacy-gen1-7','legacy-gen1-8']);
    assert.ok(conversations.results.every(r=>r.status==='archived'));

    const rows=await DB.prepare("SELECT * FROM archive_messages WHERE provenance='legacy_gen1_interactions' ORDER BY id").all();
    assert.equal(rows.results.length,4);
    const user=rows.results.find(r=>r.id==='legacy-gen1-7-user');
    const assistant=rows.results.find(r=>r.id==='legacy-gen1-7-assistant');
    assert.equal(user.role,'user');
    assert.equal(user.content,'question historique');
    assert.equal(user.timestamp,1700000000000);
    assert.equal(assistant.role,'assistant');
    assert.equal(assistant.content,'réponse historique');
    assert.equal(assistant.model,'legacy-model');
    assert.equal(assistant.timestamp,1700000000001);
    const metadata=JSON.parse(assistant.metadata);
    assert.equal(metadata.legacy_interaction_id,7);
    assert.equal(metadata.feedback,1);
    assert.equal(metadata.correction,'correction validée');
    assert.equal(metadata.migration,'GEN2-57');

    const audit=await DB.prepare("SELECT * FROM legacy_migration_audit WHERE id='gen1-interactions-v1'").first();
    assert.equal(audit.source_exists,1);
    assert.equal(audit.source_rows,2);
    assert.equal(audit.expected_messages,4);
    assert.equal(audit.migrated_messages,4);
    assert.equal(audit.verified,1);
    assert.equal(JSON.parse(audit.details_json).source_preserved,true);
  }finally{DB.close();}
});

test('GEN2-57 migration is replay-safe and creates zero duplicates', async()=>{
  const DB=sqliteD1();
  try{
    await createLegacyTable(DB);
    await DB.prepare("INSERT INTO interactions(id,created_at,user_text,assistant_text,model,feedback,correction) VALUES(?,?,?,?,?,?,?)")
      .bind(1,1000,'u','a','m',null,null).run();
    await migrate(DB,12);

    await legacyMigration.run(DB);
    await legacyMigration.run(DB);

    const messages=await DB.prepare("SELECT COUNT(*) AS n FROM archive_messages WHERE provenance='legacy_gen1_interactions'").first();
    const conversations=await DB.prepare("SELECT COUNT(*) AS n FROM conversations WHERE id='legacy-gen1-1'").first();
    const source=await DB.prepare("SELECT COUNT(*) AS n FROM interactions").first();
    assert.equal(Number(messages.n),2);
    assert.equal(Number(conversations.n),1);
    assert.equal(Number(source.n),1);
  }finally{DB.close();}
});

test('GEN2-57 fails closed before overwrite when deterministic archive ids collide', async()=>{
  const DB=sqliteD1();
  try{
    await createLegacyTable(DB);
    await DB.prepare("INSERT INTO interactions(id,created_at,user_text,assistant_text,model,feedback,correction) VALUES(?,?,?,?,?,?,?)")
      .bind(3,3000,'legacy user','legacy assistant','m',null,null).run();
    await migrate(DB,12);
    await DB.prepare(`INSERT INTO conversations(id,owner,title,status,created_at,updated_at,metadata)
      VALUES('legacy-gen1-3','','foreign','active',1,1,'{}')`).run();
    await DB.prepare(`INSERT INTO archive_messages(
      id,conversation_id,role,content,timestamp,provenance,metadata
    ) VALUES('legacy-gen1-3-user','legacy-gen1-3','user','foreign content',1,'foreign_source','{}')`).run();

    await assert.rejects(
      legacyMigration.run(DB),
      error=>error.code==='LEGACY_ARCHIVE_ID_COLLISION'
    );
    const source=await DB.prepare("SELECT user_text FROM interactions WHERE id=3").first();
    assert.equal(source.user_text,'legacy user');
    const foreign=await DB.prepare("SELECT content,provenance FROM archive_messages WHERE id='legacy-gen1-3-user'").first();
    assert.equal(foreign.content,'foreign content');
    assert.equal(foreign.provenance,'foreign_source');
  }finally{DB.close();}
});

test('GEN2-57 refuses an unknown legacy interactions schema instead of guessing', async()=>{
  const DB=sqliteD1();
  try{
    await DB.prepare("CREATE TABLE interactions(id INTEGER PRIMARY KEY,created_at INTEGER,user_text TEXT,assistant_text TEXT)").run();
    await assert.rejects(
      migrate(DB,13),
      error=>error.code==='LEGACY_INTERACTIONS_SCHEMA_MISMATCH' && /model/.test(error.message)
    );
    const applied=await DB.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE version=13").first();
    assert.equal(Number(applied.n),0);
  }finally{DB.close();}
});
