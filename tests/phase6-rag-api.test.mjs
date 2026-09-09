import test from 'node:test';
import assert from 'node:assert/strict';
import { RAGService } from '../src/search/rag-service.js';

function mockDB() {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async all() {
              if (sql.includes('FROM archive_messages')) return { results: [
                { id: 1, content: 'Projet jardin solaire avec capteurs', timestamp: 30, conversation_id: 'c1', source: 'archive_messages' },
                { id: 2, content: 'Recette de cuisine sans rapport', timestamp: 20, conversation_id: 'c1', source: 'archive_messages' },
              ] };
              if (sql.includes('FROM conversations')) return { results: [
                { id: 'c1', content: 'Plan du jardin solaire', timestamp: 25, source: 'conversations' },
              ] };
              if (sql.includes('FROM memories')) return { results: [
                { id: 3, content: 'Le jardin solaire est un projet durable', timestamp: 40, source: 'memories' },
              ] };
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

test('RAG lexical search returns bounded results with provenance', async () => {
  const result = await RAGService.search(mockDB(), 'adrien', 'jardin solaire', { limit: 5 });
  assert.equal(result.retrieval, 'lexical');
  assert.equal(result.total, 3);
  assert.equal(result.results[0].source, 'memories');
  assert.deepEqual(result.results[0].provenance, { table: 'memories', id: 3 });
  assert.ok(result.results.every(row => row.similarity > 0));
});

test('RAG source filters and minSimilarity are enforced', async () => {
  const result = await RAGService.search(mockDB(), 'adrien', 'jardin solaire capteurs', {
    sources: ['archive_messages'],
    limit: 10,
    minSimilarity: 0.66,
  });
  assert.equal(result.total, 1);
  assert.equal(result.results[0].source, 'archive_messages');
});

test('RAG rejects invalid owner, query, source and limit rather than silently weakening constraints', async () => {
  await assert.rejects(() => RAGService.search(mockDB(), '', 'jardin'), /AUTH_REQUIRED/);
  await assert.rejects(() => RAGService.search(mockDB(), 'adrien', ''), /INVALID_QUERY/);
  await assert.rejects(() => RAGService.search(mockDB(), 'adrien', 'jardin', { sources: ['secrets'] }), /INVALID_SOURCES/);
  await assert.rejects(() => RAGService.search(mockDB(), 'adrien', 'jardin', { limit: 101 }), /INVALID_LIMIT/);
});

test('cosine similarity remains available as a pure utility for future explicit semantic providers', () => {
  assert.ok(Math.abs(RAGService.cosineSimilarity(new Float32Array([1, 2, 3]), new Float32Array([2, 4, 6])) - 1) < 1e-6);
  assert.equal(RAGService.cosineSimilarity(new Float32Array([0, 0]), new Float32Array([0, 0])), 0);
  assert.equal(RAGService.cosineSimilarity([1], [1, 2]), 0);
});
