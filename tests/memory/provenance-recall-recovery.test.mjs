import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { importChatGPTArchive } from '../../src/persistence/chatgpt-archive-importer.js';
import { createMemoryService } from '../../src/memory/memory-service.js';
import { createSyncService } from '../../src/conversations/sync-service.js';
import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';

test('MEL-MEM-08 confirms archive-derived learning with full provenance and contradiction snapshot', async () => {
  const DB = sqliteD1();
  try {
    const env = { DB, MELITURGOS_USER: 'adrien' };
    const fact = 'Le projet Atlas conserve le moteur local pour préserver la provenance.';
    await importChatGPTArchive(env, [
      { id:'learn-a', title:'Atlas décision', messages:[{id:'u1',role:'user',content:fact,timestamp:100}] },
      { id:'learn-b', title:'Atlas rappel', messages:[{id:'u2',role:'user',content:fact,timestamp:200}] },
    ], { preview:false });

    await DB.prepare(`INSERT INTO memories(created_at,kind,content,importance,confidence,source,provenance,metadata)
      VALUES (?,?,?,?,?,?,?,?)`)
      .bind(50,'fact','Le projet Atlas doit abandonner toute provenance.',0.7,0.6,'legacy','legacy:conflict','{}').run();
    const conflict = await DB.prepare("SELECT id FROM memories WHERE source='legacy' LIMIT 1").first();

    const rows = await DB.prepare("SELECT id FROM memory_candidates WHERE conversation_id IN ('chatgpt:learn-a','chatgpt:learn-b') ORDER BY created_at").all();
    const candidateIds = rows.results.map(row => row.id);
    assert.equal(candidateIds.length, 2);

    const runtime = createGen2Runtime({ env });
    const learned = await runtime.bus.execute('memory.learn', {
      candidate_ids: candidateIds,
      kind: 'fact',
      contradiction_ids: [String(conflict.id)],
    }, { owner:'adrien', permissions:[], requestId:'mem08-learn' });

    assert.equal(learned.created, true);
    assert.equal(learned.confidence, 0.72);
    assert.deepEqual(new Set(learned.provenance.conversation_ids), new Set(['chatgpt:learn-a','chatgpt:learn-b']));
    assert.equal(learned.provenance.evidence.length, 2);
    assert.ok(learned.provenance.evidence.every(item => item.message_id && item.source && item.observed_at > 0 && item.fragment === fact));
    assert.equal(learned.contradictions.length, 1);
    assert.equal(String(learned.contradictions[0].id), String(conflict.id));

    const stored = await DB.prepare('SELECT source,provenance,metadata FROM memories WHERE id=?').bind(learned.memory_id).first();
    assert.equal(stored.source, 'archive_learning');
    const provenance = JSON.parse(stored.provenance);
    const metadata = JSON.parse(stored.metadata);
    assert.equal(provenance.version, 2);
    assert.equal(provenance.evidence.length, 2);
    assert.equal(metadata.learning_class, 'archive_confirmed');
    assert.equal(metadata.contradictions.length, 1);

    const statuses = await DB.prepare(`SELECT status FROM memory_candidates
      WHERE id IN (?,?) ORDER BY id`).bind(...candidateIds).all();
    assert.ok(statuses.results.every(row => row.status === 'CONFIRMED'));

    const replay = await createMemoryService(DB).confirm({
      candidateIds,
      kind:'fact',
      contradictionIds:[String(conflict.id)],
    });
    assert.equal(replay.created, false);
    assert.equal(replay.action, 'REUSED_EXISTING');

    const conflicts = await createMemoryService(DB).findConflicts({ id: learned.memory_id });
    assert.deepEqual(conflicts.conflict_ids, [String(conflict.id)]);
    assert.equal(conflicts.conflicts.length, 1);
  } finally { DB.close(); }
});

test('MEL-MEM-09 difficult historical recall crosses conversations and returns only sourced archive evidence', async () => {
  const DB = sqliteD1();
  try {
    const env = { DB, MELITURGOS_USER: 'adrien' };
    const messages = [
      'Le repère ultrarare-omega relie le projet Orion à la décision de conserver une architecture locale.',
      'Pour ultrarare-omega, la raison donnée était de garder la provenance dans chaque résultat.',
      'ultrarare-omega signifie supprimer la provenance et tout externaliser.',
    ];
    await importChatGPTArchive(env, [
      { id:'history-a', title:'Orion architecture', messages:[{id:'a1',role:'user',content:messages[0],timestamp:1000}] },
      { id:'history-b', title:'Orion provenance', messages:[{id:'b1',role:'user',content:messages[1],timestamp:2000}] },
      { id:'history-c', title:'Ancienne sortie assistant', messages:[{id:'c1',role:'assistant',content:messages[2],timestamp:3000}] },
    ], { preview:false });

    const result = await createMemoryService(DB).retrieve({
      owner:'adrien',
      query:'ultrarare omega provenance architecture locale',
      limit:10,
      sources:['archive_messages'],
      semantic:false,
    });

    const userRows = result.results.filter(row => row.role === 'user');
    assert.ok(userRows.some(row => row.conversation_id === 'chatgpt:history-a'));
    assert.ok(userRows.some(row => row.conversation_id === 'chatgpt:history-b'));
    assert.ok(userRows.every(row => row.authority === 'historical_user_message'));
    const known = new Set(messages);
    assert.ok(result.results.length >= 2);
    assert.ok(result.results.every(row => known.has(row.content)));
    assert.ok(result.results.every(row => row.provenance?.table === 'archive_messages' && row.provenance?.id));
    assert.ok(result.results.every(row => ['user','assistant'].includes(row.role)));
  } finally { DB.close(); }
});

test('MEL-MEM-10 rebuild after index loss reproduces candidates, proposals and retrieval provenance', async () => {
  const DB = sqliteD1();
  try {
    const env = { DB, MELITURGOS_USER:'adrien' };
    const archive = [
      { id:'rebuild-a', title:'Rebuild A', messages:[{id:'m1',role:'user',content:'Le code reconstructible zephyr-741 reste attaché au projet Nova.',timestamp:111}] },
      { id:'rebuild-b', title:'Rebuild B', messages:[{id:'m2',role:'user',content:'La décision zephyr-741 exige de conserver la provenance Nova.',timestamp:222}] },
    ];
    await importChatGPTArchive(env, archive, { preview:false });

    const beforeService = createMemoryService(DB);
    const beforeCompiled = await beforeService.consolidate({limit:100});
    const beforeRetrieval = await beforeService.retrieve({
      owner:'adrien', query:'zephyr 741 Nova provenance', limit:10, sources:['archive_messages'], semantic:false,
    });

    const proposalSignature = rows => rows.map(row => ({
      content:row.content,
      confidence:row.confidence,
      candidate_ids:[...(row.provenance?.candidate_ids || [])].sort(),
      conversation_ids:[...(row.provenance?.conversation_ids || [])].sort(),
      message_ids:[...(row.provenance?.message_ids || [])].sort(),
      sources:[...(row.provenance?.sources || [])].sort(),
    })).sort((a,b) => a.content.localeCompare(b.content));
    const retrievalSignature = rows => rows.map(row => ({
      id:row.id,
      content:row.content,
      conversation_id:row.conversation_id,
      provenance_table:row.provenance?.table,
      provenance_id:row.provenance?.id,
      role:row.role,
    })).sort((a,b) => a.id.localeCompare(b.id));

    const beforeCandidateRows = await DB.prepare('SELECT id,conversation_id,message_id,content,confidence,source,created_at FROM memory_candidates ORDER BY id').all();
    assert.equal(beforeCandidateRows.results.length, 2);

    await DB.prepare('DELETE FROM memory_candidates').run();
    const restartedSync = createSyncService(env);
    for (const conversationId of ['chatgpt:rebuild-a','chatgpt:rebuild-b']) {
      const rebuilt = await restartedSync.syncToMemory({conversationId,limit:100});
      assert.equal(rebuilt.inserted,1);
    }

    const afterCandidateRows = await DB.prepare('SELECT id,conversation_id,message_id,content,confidence,source,created_at FROM memory_candidates ORDER BY id').all();
    assert.deepEqual(afterCandidateRows.results, beforeCandidateRows.results);

    const restartedService = createMemoryService(DB);
    const afterCompiled = await restartedService.consolidate({limit:100});
    const afterRetrieval = await restartedService.retrieve({
      owner:'adrien', query:'zephyr 741 Nova provenance', limit:10, sources:['archive_messages'], semantic:false,
    });
    assert.deepEqual(proposalSignature(afterCompiled.proposals), proposalSignature(beforeCompiled.proposals));
    assert.deepEqual(retrievalSignature(afterRetrieval.results), retrievalSignature(beforeRetrieval.results));
  } finally { DB.close(); }
});
