import test from 'node:test';
import assert from 'node:assert/strict';
import { RAGService } from '../src/search/rag-service.js';

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
  const result = await RAGService.search(db, 'adrien', 'MEL plusieurs modèles comparaison', { minSimilarity: 0.7 });
  assert.equal(result.total, 1);
  assert.equal(result.results[0].source, 'memories');
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
