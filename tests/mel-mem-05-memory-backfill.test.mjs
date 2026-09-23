import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { migrate } from '../src/persistence/migrations.js';
import { createSyncService } from '../src/conversations/sync-service.js';
import {
  getChatGPTMemoryBackfillStatus,
  backfillChatGPTArchiveToMemory,
  CHATGPT_MEMORY_BACKFILL_LIMITS,
} from '../src/persistence/chatgpt-memory-backfill.js';

async function seed(DB){
  await migrate(DB);
  await DB.prepare(`INSERT INTO conversations(id,owner,title,status,created_at,updated_at,metadata)
    VALUES(?,?,?,?,?,?,?)`).bind('chatgpt:mem05','adrien','MEM05 fixture','active',1,1,'{}').run();
  const rows=[
    ['m1','user','message utilisateur',100,'chatgpt_export'],
    ['m2','assistant','réponse assistant',101,'chatgpt_export'],
    ['m3','assistant','   ',102,'chatgpt_export'],
    ['m4','developer','instruction non mémoire',103,'chatgpt_export'],
    ['m5','user','hors archive ChatGPT',104,'native-chat'],
  ];
  for(const [id,role,content,timestamp,provenance] of rows){
    await DB.prepare(`INSERT INTO archive_messages(
      id,conversation_id,role,content,timestamp,provenance,metadata
    ) VALUES(?,?,?,?,?,?,?)`)
      .bind(id,'chatgpt:mem05',role,content,timestamp,provenance,'{}').run();
  }
}

test('MEL-MEM-05 global memory backfill is bounded, replay-safe and ignores non-eligible archive rows',async()=>{
  const DB=sqliteD1();
  try{
    await seed(DB);
    const env={DB,MELITURGOS_USER:'adrien'};
    const before=await getChatGPTMemoryBackfillStatus(env);
    assert.equal(before.total_messages,4);
    assert.equal(before.eligible_messages,2);
    assert.equal(before.ineligible_messages,2);
    assert.equal(before.synced_eligible_messages,0);
    assert.equal(before.remaining_eligible_messages,2);
    assert.equal(before.remaining_conversations,1);
    assert.equal(before.complete,false);

    const first=await backfillChatGPTArchiveToMemory(env,{conversationLimit:50});
    assert.equal(first.batch.conversations_processed,1);
    assert.equal(first.batch.scanned,2);
    assert.equal(first.batch.eligible,2);
    assert.equal(first.batch.inserted,2);
    assert.equal(first.remaining_eligible_messages,0);
    assert.equal(first.complete,true);

    const candidates=await DB.prepare('SELECT message_id,content FROM memory_candidates ORDER BY message_id').all();
    assert.deepEqual((candidates.results||[]).map(row=>[row.message_id,row.content]),[
      ['m1','message utilisateur'],
      ['m2','réponse assistant'],
    ]);

    const replay=await backfillChatGPTArchiveToMemory(env,{conversationLimit:50});
    assert.equal(replay.batch.conversations_processed,0);
    assert.equal(replay.batch.inserted,0);
    assert.equal(replay.batch.replay_safe,true);
    assert.equal(replay.complete,true);
  }finally{DB.close();}
});

test('SyncService does not loop forever on empty or unsupported archive messages',async()=>{
  const DB=sqliteD1();
  try{
    await seed(DB);
    const service=createSyncService({DB});
    const result=await service.syncToMemory({conversationId:'chatgpt:mem05',limit:1000});
    assert.equal(result.scanned,2);
    assert.equal(result.inserted,2);
    const again=await service.syncToMemory({conversationId:'chatgpt:mem05',limit:1000});
    assert.equal(again.scanned,0);
  }finally{DB.close();}
});

test('MEL-MEM-05 backfill enforces batch limit',async()=>{
  const DB=sqliteD1();
  try{
    await seed(DB);
    await assert.rejects(
      ()=>backfillChatGPTArchiveToMemory({DB},{conversationLimit:CHATGPT_MEMORY_BACKFILL_LIMITS.max_conversations_per_batch+1}),
      error=>error?.code==='CHATGPT_MEMORY_BACKFILL_LIMIT_INVALID'
    );
  }finally{DB.close();}
});

test('release smoke token is accepted only on exact MEM05 memory backfill routes',async()=>{
  const DB=sqliteD1();
  try{
    await seed(DB);
    const token='c'.repeat(64);
    const env={
      DB,
      MELITURGOS_USER:'adrien',
      MELITURGOS_PASSWORD:'owner-password-not-used',
      MEL_LAUNCH_BOOTSTRAP_TOKEN:token,
    };
    const headers={
      'x-mel-release-smoke':'1',
      'x-mel-launch-bootstrap':token,
    };

    const status=await worker.fetch(new Request('https://mel.test/api/gen2/migration/chatgpt-memory-status',{headers}),env,{});
    assert.equal(status.status,200);
    assert.equal((await status.json()).remaining_eligible_messages,2);

    const backfill=await worker.fetch(new Request('https://mel.test/api/gen2/migration/chatgpt-memory-backfill',{
      method:'POST',
      headers:{...headers,'content-type':'application/json'},
      body:JSON.stringify({conversation_limit:50}),
    }),env,{});
    assert.equal(backfill.status,200);
    assert.equal((await backfill.json()).complete,true);

    const wrongMethod=await worker.fetch(new Request('https://mel.test/api/gen2/migration/chatgpt-memory-status',{
      method:'POST',
      headers:{...headers,'content-type':'application/json'},
      body:'{}',
    }),env,{});
    assert.equal(wrongMethod.status,401);

    const wrongToken=await worker.fetch(new Request('https://mel.test/api/gen2/migration/chatgpt-memory-status',{
      headers:{...headers,'x-mel-launch-bootstrap':'d'.repeat(64)},
    }),env,{});
    assert.equal(wrongToken.status,401);
  }finally{DB.close();}
});
