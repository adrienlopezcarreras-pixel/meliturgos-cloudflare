import test from 'node:test';
import assert from 'node:assert/strict';
import { RAGService } from '../src/search/rag-service.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const db = {
  prepare(sql) {
    return {
      bind() {
        return {
          async all() {
            if (sql.includes('FROM archive_messages')) return { results: [
              { id: 10, content: 'MEL apprend à utiliser plusieurs modèles', timestamp: 100, conversation_id: 'c1', source: 'archive_messages' },
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
    await db.prepare("CREATE TABLE archive_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, content TEXT NOT NULL, timestamp INTEGER NOT NULL)").run();
    await db.prepare("CREATE TABLE memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, created_at INTEGER NOT NULL, valid_until INTEGER, provenance TEXT)").run();
    await db.prepare("INSERT INTO conversations VALUES (?,?,?,?)").bind('chatgpt:old','adrien','Ancienne conversation',1).run();
    await db.prepare("INSERT INTO archive_messages VALUES (?,?,?,?)").bind('old-match','chatgpt:old','Le mot repère ultraviolethistorique doit rester retrouvable',1).run();

    for (let i = 0; i < 1100; i++) {
      const cid = 'recent-' + i;
      await db.prepare("INSERT INTO conversations VALUES (?,?,?,?)").bind(cid,'adrien','Conversation récente '+i,10000+i).run();
      await db.prepare("INSERT INTO archive_messages VALUES (?,?,?,?)").bind('recent-msg-'+i,cid,'contenu récent sans le repère recherché',10000+i).run();
    }

    const result = await RAGService.search(db, 'adrien', 'ultraviolethistorique', { sources:['archive_messages'], limit:8 });
    assert.equal(result.total, 1);
    assert.equal(result.results[0].id, 'old-match');
  } finally {
    db.close();
  }
});
