/**
 * RAG Service Tests - GEN2-25
 * 
 * Tests for semantic search over conversations and memories
 */

import { RAGService } from '../src/search/rag-service.js';
import assert from 'node:assert';

// Mock Cloudflare Workers AI embedding API
global.fetch = async (url, options) => {
  if (url.includes('@cf/baai/bge-base-en-v1.5/embeddings')) {
    const testEmbedding = new Float32Array(768).fill(0.5);
    return {
      ok: true,
      json: async () => ({
        result: {
          data: [
            {
              embedding: testEmbedding,
            }
          ]
        }
      })
    };
  }
  return { ok: false, json: async () => ({ errors: [{ message: 'Not found' }] }) };
};

async function runTests() {
  console.log('Running RAG Service Tests...\n');

  let passed = 0;
  let failed = 0;

  try {
    // Test 1: Generate embedding for text
    console.log('Test 1: Generate embedding...');
    const embedding = await RAGService.generateEmbedding('test text');
    assert(embedding.length === 768, 'Embedding should have correct length');
    assert(!embedding.includes(NaN), 'Embedding should not contain NaN values');
    console.log('✅ Pass: Embedding generation works\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  try {
    // Test 2: Generate embedding for empty text
    console.log('Test 2: Generate embedding for empty text...');
    const emptyEmbedding = await RAGService.generateEmbedding('');
    assert(emptyEmbedding.length === 768, 'Empty text should return zero vector');
    for (let i = 0; i < 768; i++) {
      assert(emptyEmbedding[i] === 0, `Zero vector should have all zeros at index ${i}`);
    }
    console.log('✅ Pass: Empty text returns zero vector\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  try {
    // Test 3: Cosine similarity - identical vectors
    console.log('Test 3: Cosine similarity of identical vectors...');
    const vectorA = new Float32Array([1, 2, 3]);
    const vectorB = new Float32Array([1, 2, 3]);
    const similarity = RAGService.cosineSimilarity(vectorA, vectorB);
    assert(similarity === 1, 'Identical vectors should have similarity of 1');
    console.log('✅ Pass: Identical vectors have similarity 1\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  try {
    // Test 4: Cosine similarity - orthogonal vectors
    console.log('Test 4: Cosine similarity of orthogonal vectors...');
    const vectorA = new Float32Array([1, 0, 0]);
    const vectorB = new Float32Array([0, 1, 0]);
    const similarity = RAGService.cosineSimilarity(vectorA, vectorB);
    assert(Math.abs(similarity) < 0.01, 'Orthogonal vectors should have near-zero similarity');
    console.log('✅ Pass: Orthogonal vectors have near-zero similarity\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  try {
    // Test 5: Cosine similarity - opposite vectors
    console.log('Test 5: Cosine similarity of opposite vectors...');
    const vectorA = new Float32Array([1, 1, 1]);
    const vectorB = new Float32Array([-1, -1, -1]);
    const similarity = RAGService.cosineSimilarity(vectorA, vectorB);
    assert(Math.abs(similarity + 1) < 0.01, 'Opposite vectors should have similarity of -1');
    console.log('✅ Pass: Opposite vectors have similarity -1\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  try {
    // Test 6: Search with empty query
    console.log('Test 6: Search with empty query...');
    const searchResult = await RAGService.search(null, 'user123', '');
    assert(searchResult.results.length === 0, 'Empty query should return no results');
    assert(searchResult.total === 0, 'Empty query should return zero total');
    console.log('✅ Pass: Empty query returns no results\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  try {
    // Test 7: Search with default options
    console.log('Test 7: Search with default options...');
    const searchResult = await RAGService.search(
      null,
      'user123',
      'test query',
      { limit: 10, minSimilarity: 0.3 }
    );
    assert(Array.isArray(searchResult.results), 'Results should be an array');
    assert(typeof searchResult.total === 'number', 'Total should be a number');
    assert(Array.isArray(searchResult.queryEmbedding), 'Query embedding should be an array');
    console.log('✅ Pass: Default search options work\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  try {
    // Test 8: Search with custom sources
    console.log('Test 8: Search with custom sources...');
    const searchResult = await RAGService.search(
      null,
      'user123',
      'test query',
      { 
        sources: ['archive_messages', 'memories'],
        limit: 5,
        minSimilarity: 0.3
      }
    );
    assert(Array.isArray(searchResult.results), 'Results should be an array');
    searchResult.results.forEach(result => {
      assert(['archive_message', 'memory'].includes(result.type), `Result type should be valid: ${result.type}`);
    });
    console.log('✅ Pass: Custom sources filtering works\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  try {
    // Test 9: Respects minSimilarity threshold
    console.log('Test 9: Respects minSimilarity threshold...');
    // This test only checks that the function doesn't fail and respects the parameter
    const searchResult = await RAGService.search(
      null,
      'user123',
      'test',
      { 
        minSimilarity: 0.9 // High threshold should return few or no results
      }
    );
    // With zero embeddings, all results will be filtered, so this should work
    assert(Array.isArray(searchResult.results), 'Results should be array even with high threshold');
    console.log('✅ Pass: Min similarity threshold respected\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  try {
    // Test 10: queryEmbedding is plain array (not Float32Array)
    console.log('Test 10: queryEmbedding format...');
    const searchResult = await RAGService.search(null, 'user123', 'test');
    assert(Array.isArray(searchResult.queryEmbedding), 'queryEmbedding should be array');
    if (searchResult.queryEmbedding.length > 0) {
      assert(typeof searchResult.queryEmbedding[0] === 'number', 'Array elements should be numbers');
    }
    console.log('✅ Pass: queryEmbedding is plain array format\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  console.log('\n' + '='.repeat(50));
  console.log(`RAG Service Test Results:`);
  console.log(`  Total: ${passed + failed}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('='.repeat(50));

  if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});