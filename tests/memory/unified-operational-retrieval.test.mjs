import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { prepareGen2 } from '../../src/persistence/gen2-schema.js';
import { importChatGPTArchive } from '../../src/persistence/chatgpt-archive-importer.js';
import { createMemoryService } from '../../src/memory/memory-service.js';
import { retrieveContext } from '../../src/core/orchestrator/conversation-context.js';

test('MEL-MEM-06 unifies cognitive memories and ChatGPT archives behind MemoryService retrieval', async () => {
  const DB=sqliteD1();
  try {
    await prepareGen2(DB);
    await importChatGPTArchive({DB,MELITURGOS_USER:'adrien'}, [{
      id:'mem06-archive',
      title:'Décision cuivre',
      collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:1},
      messages:[{
        id:'u1',
        role:'user',
        content:'Le repère memsixcobalt désigne la décision historique venant des archives ChatGPT.',
        timestamp:100
      }],
    }], {preview:false});

    await DB.prepare("INSERT INTO memories(created_at,kind,content,importance,confidence,source,provenance,metadata) VALUES(?,?,?,?,?,?,?,?)")
      .bind(200,'fact','Le repère memsixcobalt existe aussi dans la mémoire cognitive active.',0.9,0.95,'explicit_user','manual-test','{}')
      .run();

    const service=createMemoryService(DB);
    const out=await service.retrieve({owner:'adrien',query:'memsixcobalt',limit:10});

    assert.equal(out.retrieval,'unified-operational-memory');
    assert.ok(out.results.some(row => (row.source||row.provenance?.table)==='archive_messages'));
    assert.ok(out.results.some(row => (row.source||row.provenance?.table)==='memories'));
    assert.ok(out.results.some(row => row.authority==='historical_user_message'));
    assert.ok(out.evidence_counts.archive>=1);
    assert.ok(out.evidence_counts.memories>=1);
    assert.ok(out.sources_consulted.includes('archive_messages'));
    assert.ok(out.sources_consulted.includes('memories'));
  } finally { DB.close(); }
});

test('conversation context uses the unified operational memory bridge without dumping the corpus', async () => {
  const DB=sqliteD1();
  try {
    await prepareGen2(DB);
    await importChatGPTArchive({DB,MELITURGOS_USER:'adrien'}, [{
      id:'mem06-context',
      title:'Projet mémoire unifiée',
      collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:2},
      messages:[
        {id:'u1',role:'user',content:'Le mot memsixviolet doit être retrouvé par le pont unifié.',timestamp:10},
        {id:'u2',role:'user',content:'Une autre phrase sans rapport ne doit pas forcer tout le corpus dans le contexte.',timestamp:11}
      ],
    }], {preview:false});

    const context=await retrieveContext(DB,'adrien','memsixviolet');
    assert.equal(context.unified?.retrieval,'unified-operational-memory');
    assert.match(context.prompt,/UNIFIED OPERATIONAL MEMORY/);
    assert.match(context.prompt,/memsixviolet/);
    assert.doesNotMatch(context.prompt,/Une autre phrase sans rapport/);
    assert.ok(context.prompt.length<20000);
  } finally { DB.close(); }
});
