import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import {
  backfillLegacyInteractions,
  getLegacyInteractionMigrationStatus,
  LEGACY_INTERACTION_MIGRATION,
} from '../src/persistence/gen1-interactions-migration.js';

const ownerAuth='Basic '+Buffer.from('adrien:test').toString('base64');

async function createLegacyTable(DB){
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

async function insertLegacy(DB,{id,createdAt,user,assistant,model='@cf/zai-org/glm-4.7-flash',feedback=null,correction=null}){
  await DB.prepare(`INSERT INTO interactions(id,created_at,user_text,assistant_text,model,feedback,correction)
    VALUES(?,?,?,?,?,?,?)`)
    .bind(id,createdAt,user,assistant,model,feedback,correction).run();
}

test('GEN2-57 treats an absent Gen1 interactions table as a complete no-op',async()=>{
  const DB=sqliteD1();
  try{
    const status=await getLegacyInteractionMigrationStatus({DB});
    assert.equal(status.ok,true);
    assert.equal(status.source_present,false);
    assert.equal(status.source_rows,0);
    assert.equal(status.archived_messages,0);
    assert.equal(status.coverage_complete,true);
    assert.equal(status.status,'NOTHING_TO_MIGRATE');
  }finally{DB.close();}
});

test('GEN2-57 migrates each real Gen1 interaction into deterministic user and assistant archive messages',async()=>{
  const DB=sqliteD1();
  try{
    await createLegacyTable(DB);
    await insertLegacy(DB,{
      id:1,
      createdAt:1000,
      user:'bonjour MEL',
      assistant:'bonjour Adrien',
      feedback:1,
      correction:'garder ce ton',
    });
    await insertLegacy(DB,{
      id:2,
      createdAt:2000,
      user:'deuxième question',
      assistant:'deuxième réponse',
      model:'@cf/meta/llama-test',
      feedback:0,
      correction:'réponse à corriger',
    });
    const env={DB,MELITURGOS_USER:'adrien'};

    const before=await getLegacyInteractionMigrationStatus(env);
    assert.equal(before.source_present,true);
    assert.equal(before.schema.supported,true);
    assert.equal(before.source_rows,2);
    assert.equal(before.expected_archive_messages,4);
    assert.equal(before.archived_messages,0);
    assert.equal(before.coverage_complete,false);

    const first=await backfillLegacyInteractions(env,{afterId:0,limit:1});
    assert.equal(first.batch.read,1);
    assert.equal(first.batch.inserted_messages,2);
    assert.equal(first.batch.last_id,1);
    assert.equal(first.remaining_interactions,1);
    assert.equal(first.coverage_complete,false);

    const second=await backfillLegacyInteractions(env,{afterId:first.batch.last_id,limit:1});
    assert.equal(second.batch.read,1);
    assert.equal(second.batch.inserted_messages,2);
    assert.equal(second.batch.last_id,2);
    assert.equal(second.source_rows,2);
    assert.equal(second.archived_messages,4);
    assert.equal(second.migrated_interactions,2);
    assert.equal(second.remaining_interactions,0);
    assert.equal(second.coverage_complete,true);
    assert.equal(second.status,'COMPLETE');

    const rows=await DB.prepare(`SELECT id,conversation_id,role,content,model,timestamp,provenance,metadata
      FROM archive_messages
      WHERE provenance='legacy_gen1'
      ORDER BY timestamp,id`).all();
    assert.deepEqual((rows.results||[]).map(row=>[row.id,row.role,row.content,row.model,row.timestamp]),[
      ['legacy-gen1:1:user','user','bonjour MEL',null,1000],
      ['legacy-gen1:1:assistant','assistant','bonjour Adrien','@cf/zai-org/glm-4.7-flash',1001],
      ['legacy-gen1:2:user','user','deuxième question',null,2000],
      ['legacy-gen1:2:assistant','assistant','deuxième réponse','@cf/meta/llama-test',2001],
    ]);
    assert.ok((rows.results||[]).every(row=>row.conversation_id===LEGACY_INTERACTION_MIGRATION.conversation_id));
    const assistantMeta=JSON.parse(rows.results[1].metadata);
    assert.equal(assistantMeta.legacy_interaction_id,1);
    assert.equal(assistantMeta.legacy_feedback,1);
    assert.equal(assistantMeta.legacy_correction,'garder ce ton');
    assert.equal(assistantMeta.migrated_without_source_mutation,true);

    const source=await DB.prepare('SELECT COUNT(*) AS count FROM interactions').first();
    assert.equal(Number(source.count),2);

    const replay=await backfillLegacyInteractions(env,{afterId:0,limit:500});
    assert.equal(replay.batch.read,2);
    assert.equal(replay.batch.inserted_messages,0);
    assert.equal(replay.batch.replay_safe,true);
    assert.equal(replay.coverage_complete,true);

    const conversation=await DB.prepare('SELECT id,title,status,metadata FROM conversations WHERE id=?')
      .bind(LEGACY_INTERACTION_MIGRATION.conversation_id).first();
    assert.equal(conversation.title,'Historique MEL Gen1');
    assert.equal(conversation.status,'archived');
    assert.equal(JSON.parse(conversation.metadata).source_preserved,true);
  }finally{DB.close();}
});

test('GEN2-57 fails closed on an unknown interactions schema and performs no partial archive write',async()=>{
  const DB=sqliteD1();
  try{
    await DB.prepare('CREATE TABLE interactions(id INTEGER PRIMARY KEY,created_at INTEGER,user_text TEXT,assistant_text TEXT)').run();
    await DB.prepare('INSERT INTO interactions(id,created_at,user_text,assistant_text) VALUES(1,1,?,?)')
      .bind('u','a').run();
    const env={DB,MELITURGOS_USER:'adrien'};
    const status=await getLegacyInteractionMigrationStatus(env);
    assert.equal(status.schema.supported,false);
    assert.ok(status.schema.missing_columns.includes('model'));
    await assert.rejects(
      ()=>backfillLegacyInteractions(env),
      error=>error?.code==='GEN1_INTERACTIONS_SCHEMA_UNSUPPORTED'
    );
    const count=await DB.prepare("SELECT COUNT(*) AS count FROM archive_messages WHERE provenance='legacy_gen1'").first();
    assert.equal(Number(count.count),0);
  }finally{DB.close();}
});

test('GEN2-57 migration HTTP endpoints remain owner-authenticated and expose bounded backfill',async()=>{
  const DB=sqliteD1();
  try{
    await createLegacyTable(DB);
    await insertLegacy(DB,{id:1,createdAt:1234,user:'question legacy',assistant:'réponse legacy'});
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};

    const unauthorized=await app.fetch(new Request('https://mel.test/api/gen2/migration/gen1-status'),env,{});
    assert.equal(unauthorized.status,401);

    const status=await app.fetch(new Request('https://mel.test/api/gen2/migration/gen1-status',{
      headers:{authorization:ownerAuth},
    }),env,{});
    assert.equal(status.status,200);
    assert.equal((await status.json()).source_rows,1);

    const migrated=await app.fetch(new Request('https://mel.test/api/gen2/migration/gen1-backfill',{
      method:'POST',
      headers:{authorization:ownerAuth,'content-type':'application/json'},
      body:JSON.stringify({after_id:0,limit:1}),
    }),env,{});
    assert.equal(migrated.status,200);
    const body=await migrated.json();
    assert.equal(body.batch.inserted_messages,2);
    assert.equal(body.coverage_complete,true);
  }finally{DB.close();}
});


test('GEN2-57 release proof token is accepted only on exact migration methods and paths',async()=>{
  const DB=sqliteD1();
  try{
    await createLegacyTable(DB);
    await insertLegacy(DB,{id:1,createdAt:5000,user:'release proof',assistant:'migration proof'});
    const token='a'.repeat(64);
    const env={
      DB,
      MELITURGOS_USER:'adrien',
      MELITURGOS_PASSWORD:'owner-secret-not-used-by-smoke',
      MEL_LAUNCH_BOOTSTRAP_TOKEN:token,
    };
    const releaseHeaders={
      'x-mel-release-smoke':'1',
      'x-mel-launch-bootstrap':token,
    };

    const status=await app.fetch(new Request('https://mel.test/api/gen2/migration/gen1-status',{
      headers:releaseHeaders,
    }),env,{});
    assert.equal(status.status,200);
    assert.equal((await status.json()).source_rows,1);

    const backfill=await app.fetch(new Request('https://mel.test/api/gen2/migration/gen1-backfill',{
      method:'POST',
      headers:{...releaseHeaders,'content-type':'application/json'},
      body:JSON.stringify({after_id:0,limit:500}),
    }),env,{});
    assert.equal(backfill.status,200);
    assert.equal((await backfill.json()).coverage_complete,true);

    const wrongMethod=await app.fetch(new Request('https://mel.test/api/gen2/migration/gen1-status',{
      method:'POST',
      headers:{...releaseHeaders,'content-type':'application/json'},
      body:'{}',
    }),env,{});
    assert.equal(wrongMethod.status,401);

    const wrongPath=await app.fetch(new Request('https://mel.test/api/gen2/migration/not-allowed',{
      headers:releaseHeaders,
    }),env,{});
    assert.equal(wrongPath.status,401);

    const wrongToken=await app.fetch(new Request('https://mel.test/api/gen2/migration/gen1-status',{
      headers:{...releaseHeaders,'x-mel-launch-bootstrap':'b'.repeat(64)},
    }),env,{});
    assert.equal(wrongToken.status,401);
  }finally{DB.close();}
});


test('GEN2-57 refuses deterministic archive id collisions instead of silently ignoring them',async()=>{
  const DB=sqliteD1();
  try{
    await createLegacyTable(DB);
    await insertLegacy(DB,{id:9,createdAt:9000,user:'source user',assistant:'source assistant'});
    const env={DB,MELITURGOS_USER:'adrien'};
    await getLegacyInteractionMigrationStatus(env);
    await DB.prepare(`INSERT INTO conversations(id,owner,title,status,created_at,updated_at,metadata)
      VALUES(?,?,?,?,?,?,?)`)
      .bind('foreign-conversation','','foreign','active',1,1,'{}').run();
    await DB.prepare(`INSERT INTO archive_messages(
      id,conversation_id,role,content,timestamp,provenance,metadata
    ) VALUES(?,?,?,?,?,?,?)`)
      .bind('legacy-gen1:9:user','foreign-conversation','user','foreign content',1,'foreign_source','{}').run();

    const status=await getLegacyInteractionMigrationStatus(env);
    assert.equal(status.coverage_complete,false);
    assert.equal(status.existing_mismatches,1);
    assert.equal(status.status,'ARCHIVE_MISMATCH');

    await assert.rejects(
      ()=>backfillLegacyInteractions(env),
      error=>error?.code==='GEN1_ARCHIVE_ID_COLLISION_OR_MISMATCH'
    );
    const foreign=await DB.prepare("SELECT content,provenance FROM archive_messages WHERE id=?")
      .bind('legacy-gen1:9:user').first();
    assert.equal(foreign.content,'foreign content');
    assert.equal(foreign.provenance,'foreign_source');
  }finally{DB.close();}
});

test('GEN2-57 refuses to reuse an unrelated legacy-gen1 conversation id',async()=>{
  const DB=sqliteD1();
  try{
    await createLegacyTable(DB);
    await insertLegacy(DB,{id:4,createdAt:4000,user:'u',assistant:'a'});
    const env={DB,MELITURGOS_USER:'adrien'};
    await getLegacyInteractionMigrationStatus(env);
    await DB.prepare(`INSERT INTO conversations(id,owner,title,status,created_at,updated_at,metadata)
      VALUES(?,?,?,?,?,?,?)`)
      .bind('legacy-gen1','other','foreign conversation','active',1,1,JSON.stringify({source_table:'other'})).run();

    const status=await getLegacyInteractionMigrationStatus(env);
    assert.equal(status.conversation_collision,true);
    assert.equal(status.coverage_complete,false);
    assert.equal(status.status,'CONVERSATION_ID_COLLISION');

    await assert.rejects(
      ()=>backfillLegacyInteractions(env),
      error=>error?.code==='GEN1_CONVERSATION_ID_COLLISION'
    );
    const count=await DB.prepare("SELECT COUNT(*) AS count FROM archive_messages WHERE provenance=?")
      .bind(LEGACY_INTERACTION_MIGRATION.provenance).first();
    assert.equal(Number(count.count),0);
  }finally{DB.close();}
});
