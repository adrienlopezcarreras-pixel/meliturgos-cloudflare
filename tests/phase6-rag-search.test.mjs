import test from 'node:test';
import assert from 'node:assert/strict';
import { RAGService, createWorkersAiSemanticProvider } from '../src/search/rag-service.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const db = {
  prepare(sql) {
    return {
      bind() {
        return {
          async all() {
            if (sql.includes('FROM archive_messages')) return { results: [
              { id: 10, content: 'MEL apprend à utiliser plusieurs modèles', timestamp: 100, conversation_id: 'c1', role: 'assistant', source: 'archive_messages' },
              { id: 11, content: 'Une information sans rapport', timestamp: 90, conversation_id: 'c1', source: 'archive_messages' },
            ] };
            if (sql.includes('FROM conversations')) return { results: [] };
            if (sql.includes('FROM memories')) return { results: [
              { id: 12, content: 'Plusieurs modèles peuvent être comparés par MEL', timestamp: 110, source: 'memories' },
            ] };
            return { results: [] };
          },
        };
      },
    };
  },
};

test('lexical retrieval scores matching tokens and sorts strongest/recent results', async () => {
  const result = await RAGService.search(db, 'adrien', 'MEL plusieurs modèles', { limit: 10 });
  assert.equal(result.total, 2);
  assert.equal(result.results[0].source, 'memories');
  assert.equal(result.results[0].similarity, 1);
  assert.equal(result.results[1].source, 'archive_messages');
  assert.equal(result.results[1].similarity, 1);
});

test('custom source selection excludes unrequested stores', async () => {
  const result = await RAGService.search(db, 'adrien', 'MEL modèles', { sources: ['archive_messages'] });
  assert.equal(result.total, 1);
  assert.ok(result.results.every(row => row.source === 'archive_messages'));
});

test('minSimilarity filters weak lexical matches', async () => {
  const result = await RAGService.search(db, 'adrien', 'MEL apprend utiliser plusieurs modèles', { minSimilarity: 0.7 });
  assert.equal(result.total, 1);
  assert.equal(result.results[0].source, 'archive_messages');
});

test('empty and invalid searches fail closed', async () => {
  await assert.rejects(() => RAGService.search(db, 'adrien', ''), /INVALID_QUERY/);
  await assert.rejects(() => RAGService.search(null, 'adrien', 'modèles'), /prepare/);
});

test('cosine helper handles identical, orthogonal, opposite and zero vectors', () => {
  assert.equal(RAGService.cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
  assert.equal(RAGService.cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(RAGService.cosineSimilarity([1, 1], [-1, -1]), -1);
  assert.equal(RAGService.cosineSimilarity([0, 0], [0, 0]), 0);
});

test('large ChatGPT archives keep old matching messages retrievable beyond the former 1000-row recency window', async () => {
  const db = sqliteD1();
  try {
    await db.prepare("CREATE TABLE conversations (id TEXT PRIMARY KEY, owner TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL)").run();
    await db.prepare("CREATE TABLE archive_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', content TEXT NOT NULL, timestamp INTEGER NOT NULL)").run();
    await db.prepare("CREATE TABLE memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, created_at INTEGER NOT NULL, valid_until INTEGER, provenance TEXT)").run();
    await db.prepare("INSERT INTO conversations VALUES (?,?,?,?)").bind('chatgpt:old','adrien','Ancienne conversation',1).run();
    await db.prepare("INSERT INTO archive_messages VALUES (?,?,?,?,?)").bind('old-match','chatgpt:old','user','Le mot repère ultraviolethistorique doit rester retrouvable',1).run();

    for (let i = 0; i < 1100; i++) {
      const cid = 'recent-' + i;
      await db.prepare("INSERT INTO conversations VALUES (?,?,?,?)").bind(cid,'adrien','Conversation récente '+i,10000+i).run();
      await db.prepare("INSERT INTO archive_messages VALUES (?,?,?,?,?)").bind('recent-msg-'+i,cid,'assistant','contenu récent sans le repère recherché',10000+i).run();
    }

    const result = await RAGService.search(db, 'adrien', 'ultraviolethistorique', { sources:['archive_messages'], limit:8 });
    assert.equal(result.total, 1);
    assert.equal(result.results[0].id, 'old-match');
  } finally {
    db.close();
  }
});


test('archive retrieval preserves speaker role and marks old assistant output as historical, not factual authority', async () => {
  const result = await RAGService.search(db, 'adrien', 'MEL modèles', { sources:['archive_messages'], limit:10 });
  assert.equal(result.results[0].role, 'assistant');
  assert.equal(result.results[0].authority, 'historical_assistant_output');
});


async function makeHybridDb() {
  const db = sqliteD1();
  await db.prepare("CREATE TABLE conversations (id TEXT PRIMARY KEY, owner TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', metadata TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL)").run();
  await db.prepare("CREATE TABLE archive_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', content TEXT NOT NULL, attachments_json TEXT, timestamp INTEGER NOT NULL, provenance TEXT NOT NULL DEFAULT '', metadata TEXT NOT NULL DEFAULT '{}')").run();
  await db.prepare("CREATE TABLE memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, created_at INTEGER NOT NULL, valid_until INTEGER, provenance TEXT, metadata TEXT)").run();
  await db.prepare("CREATE TABLE knowledge_artifacts (id TEXT PRIMARY KEY, owner TEXT NOT NULL DEFAULT '', filename TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL, verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED', content_sha256 TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL)").run();
  return db;
}

test('hybrid retrieval applies date, conversation, project, source and file-type filters before final ranking', async () => {
  const db = await makeHybridDb();
  try {
    await db.prepare("INSERT INTO conversations VALUES (?,?,?,?,?)").bind('c-project','adrien','Projet Orion','{}',100).run();
    await db.prepare("INSERT INTO conversations VALUES (?,?,?,?,?)").bind('c-other','adrien','Autre projet','{}',200).run();
    await db.prepare("INSERT INTO archive_messages VALUES (?,?,?,?,?,?,?,?)")
      .bind('m-project','c-project','user','Décision alpha beta pour Orion',JSON.stringify([{name:'decision.pdf',mime_type:'application/pdf'}]),120,'chatgpt_export','{}').run();
    await db.prepare("INSERT INTO archive_messages VALUES (?,?,?,?,?,?,?,?)")
      .bind('m-other','c-other','user','Décision alpha beta ailleurs',JSON.stringify([{name:'notes.txt',mime_type:'text/plain'}]),210,'chatgpt_export','{}').run();

    const result = await RAGService.searchHybrid(db,'adrien','alpha beta',{
      sources:['archive_messages'],
      limit:10,
      semanticProvider:null,
      filters:{
        from:100,
        to:150,
        conversation_id:'c-project',
        project:'Orion',
        source:'archive_messages',
        file_type:'pdf',
        role:'user'
      }
    });

    assert.equal(result.total,1);
    assert.equal(result.results[0].id,'m-project');
    assert.ok(result.results[0].exact_score>0);
    assert.equal(result.results[0].provenance?.conversation_id,'c-project');
    assert.equal(result.semantic_status,'DISABLED');
    assert.equal(result.filters.file_type,'pdf');
  } finally { db.close(); }
});

test('semantic hybrid retrieval can surface a recent candidate with no lexical token overlap', async () => {
  const db = await makeHybridDb();
  try {
    await db.prepare("INSERT INTO conversations VALUES (?,?,?,?,?)").bind('c-sem','adrien','Mobilité','{}',300).run();
    await db.prepare("INSERT INTO archive_messages VALUES (?,?,?,?,?,?,?,?)")
      .bind('m-sem','c-sem','user','Le véhicule à batterie rechargeable est stationné au garage',null,300,'chatgpt_export','{}').run();

    const semanticProvider = async ({documents}) => documents.map(text => text.includes('batterie rechargeable') ? 0.93 : 0.01);
    const result = await RAGService.searchHybrid(db,'adrien','automobile électrique',{
      sources:['archive_messages'],
      limit:5,
      semanticProvider,
      semanticCandidateLimit:20
    });

    assert.equal(result.semantic_status,'SUCCEEDED');
    assert.equal(result.retrieval,'hybrid-exact-lexical-semantic');
    assert.equal(result.results[0].id,'m-sem');
    assert.equal(result.results[0].authority,'historical_user_message');
    assert.ok(result.results[0].semantic_score>0.9);
    assert.equal(result.results[0].lexical_score,0);
  } finally { db.close(); }
});

test('semantic provider failure falls back to exact and lexical retrieval without losing results', async () => {
  const db = await makeHybridDb();
  try {
    await db.prepare("INSERT INTO conversations VALUES (?,?,?,?,?)").bind('c-fallback','adrien','Mémoire cobalt','{}',400).run();
    await db.prepare("INSERT INTO archive_messages VALUES (?,?,?,?,?,?,?,?)")
      .bind('m-fallback','c-fallback','user','Le repère cobalt est une décision importante',null,400,'chatgpt_export','{}').run();

    const result = await RAGService.searchHybrid(db,'adrien','cobalt',{
      sources:['archive_messages'],
      semanticProvider:async()=>{ throw new Error('quota exhausted'); }
    });

    assert.equal(result.semantic_status,'FAILED_FALLBACK_LEXICAL');
    assert.equal(result.retrieval,'hybrid-exact-lexical');
    assert.equal(result.results[0].id,'m-fallback');
  } finally { db.close(); }
});

test('Workers AI semantic adapter uses BGE-M3 and converts embeddings to cosine scores', async () => {
  const calls=[];
  const provider=createWorkersAiSemanticProvider({
    AI:{
      async run(model,input){
        calls.push({model,input});
        return {data:[[1,0],[0.9,0.1],[0,1]]};
      }
    }
  },{maxDocuments:2,enabled:true});
  const scores=await provider({query:'automobile',documents:['voiture','abeille']});
  assert.equal(calls[0].model,'@cf/baai/bge-m3');
  assert.deepEqual(calls[0].input.text,['automobile','voiture','abeille']);
  assert.ok(scores[0]>0.99);
  assert.equal(scores[1],0);
});


test('Workers AI semantic adapter is disabled by default without explicit opt-in', () => {
  const provider=createWorkersAiSemanticProvider({AI:{run:async()=>({data:[]})}});
  assert.equal(provider,null);
});


test('exact hybrid retrieval works for short phrases that lexical tokenization would ignore', async () => {
  const db = await makeHybridDb();
  try {
    await db.prepare("INSERT INTO conversations VALUES (?,?,?,?,?)").bind('c-ai','adrien','Projet IA','{}',500).run();
    await db.prepare("INSERT INTO archive_messages VALUES (?,?,?,?,?,?,?,?)")
      .bind('m-ai','c-ai','user','AI',null,500,'chatgpt_export','{}').run();

    const result = await RAGService.searchHybrid(db,'adrien','AI',{
      sources:['archive_messages'],
      semanticProvider:null
    });

    assert.equal(result.total,1);
    assert.equal(result.results[0].id,'m-ai');
    assert.ok(result.results[0].exact_score>0);
  } finally { db.close(); }
});

test('semantic hybrid retrieval rejects unrelated broad candidates with zero lexical exact and weak semantic score', async () => {
  const db = await makeHybridDb();
  try {
    await db.prepare("INSERT INTO conversations VALUES (?,?,?,?,?)").bind('c-noise','adrien','Cuisine','{}',600).run();
    await db.prepare("INSERT INTO archive_messages VALUES (?,?,?,?,?,?,?,?)")
      .bind('m-noise','c-noise','user','Recette de tarte aux pommes',null,600,'chatgpt_export','{}').run();

    const result = await RAGService.searchHybrid(db,'adrien','moteur quantique',{
      sources:['archive_messages'],
      semanticProvider:async({documents})=>documents.map(()=>0.05)
    });

    assert.equal(result.semantic_status,'SUCCEEDED');
    assert.equal(result.total,0);
  } finally { db.close(); }
});

test('hybrid retrieval rejects inverted date ranges', async () => {
  const db = await makeHybridDb();
  try {
    await assert.rejects(
      () => RAGService.searchHybrid(db,'adrien','test',{filters:{from:200,to:100}}),
      /INVALID_DATE_RANGE/
    );
  } finally { db.close(); }
});


test('semantic candidate budget remains source-diverse when archives are large', async () => {
  const db = await makeHybridDb();
  try {
    for (let i=0;i<20;i++) {
      const cid='c-bulk-'+i;
      await db.prepare("INSERT INTO conversations VALUES (?,?,?,?,?)").bind(cid,'adrien','Archive '+i,'{}',1000+i).run();
      await db.prepare("INSERT INTO archive_messages VALUES (?,?,?,?,?,?,?,?)")
        .bind('m-bulk-'+i,cid,'user','Texte ancien sans relation '+i,null,1000+i,'chatgpt_export','{}').run();
    }
    await db.prepare("INSERT INTO memories VALUES (?,?,?,?,?,?)")
      .bind('mem-semantic','La colonie apicole hiverne dans une ruche Dadant',2000,null,'manual','{}').run();

    const semanticProvider=async({documents})=>documents.map(text => text.includes('colonie apicole') ? 0.94 : 0.02);
    const result=await RAGService.searchHybrid(db,'adrien','abeilles hivernage',{
      sources:['archive_messages','memories'],
      semanticProvider,
      semanticCandidateLimit:12,
      limit:5
    });

    assert.ok(result.results.some(row => row.id==='mem-semantic'));
    assert.equal(result.results.find(row=>row.id==='mem-semantic')?.authority,'memory_record');
  } finally { db.close(); }
});
