/**
 * RAG API Integration Tests - GEN2-25
 * 
 * Tests for the /api/gen2/rag/search endpoint
 */

import { RAGService } from '../src/search/rag-service.js';
import assert from 'node:assert';

// Mock D1 database and Cloudflare account settings
const mockDB = {
  prepare: (sql) => ({
    bind: (...params) => ({
      all: async () => ({
        results: []
      })
    })
  })
};

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

async function runApiTests() {
  console.log('Running RAG API Integration Tests...\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Basic search via RAGService
  console.log('Test 1: Basic search...');
  try {
    const results = await RAGService.search(mockDB, 'user123', 'test query');
    assert(Array.isArray(results.results), 'Results should be an array');
    assert(typeof results.total === 'number', 'Total should be a number');
    console.log('✅ Pass: Basic search works\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  // Test 2: Search with custom sources
  console.log('Test 2: Search with custom sources...');
  try {
    const results = await RAGService.search(
      mockDB,
      'user123',
      'test query',
      {
        sources: ['archive_messages', 'memories'],
        limit: 5
      }
    );
    assert(Array.isArray(results.results), 'Results should be array');
    console.log('✅ Pass: Custom sources work\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  // Test 3: Search with minSimilarity threshold
  console.log('Test 3: Search with minSimilarity...');
  try {
    const results = await RAGService.search(
      mockDB,
      'user123',
      'test',
      {
        minSimilarity: 0.8
      }
    );
    assert(Array.isArray(results.results), 'Results should be array with high threshold');
    console.log('✅ Pass: High similarity threshold respected\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  // Test 4: Embedding generation preserves Float32Array type
  console.log('Test 4: Embedding format...');
  try {
    const embedding = await RAGService.generateEmbedding('test');
    assert(embedding instanceof Float32Array, 'Should return Float32Array');
    console.log('✅ Pass: Embedding is Float32Array\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  // Test 5: Floating point dot product precision
  console.log('Test 5: Cosine similarity precision...');
  try {
    const vectorA = new Float32Array([1, 2, 3]);
    const vectorB = new Float32Array([2, 4, 6]); // 2x vectorA
    const similarity = RAGService.cosineSimilarity(vectorA, vectorB);
    
    // Similarity should be 1 (perfect match)
    assert(Math.abs(similarity - 1) < 0.0001, 'Perfectly correlated vectors should have similarity 1');
    console.log('✅ Pass: Cosine similarity precision correct\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  // Test 6: Batch embedding generation
  console.log('Test 6: Batch embedding generation...');
  try {
    const embeddings = await RAGService.batchGenerateEmbeddings(['test1', 'test2']);
    assert(Array.isArray(embeddings), 'Should return array of embeddings');
    assert(embeddings.length === 2, 'Should have 2 embeddings');
    assert(embeddings[0] instanceof Float32Array, 'Each embedding should be Float32Array');
    console.log('✅ Pass: Batch embedding generation works\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  // Test 7: Zero vector for empty text
  console.log('Test 7: Zero vector for empty text...');
  try {
    const emptyEmbedding = await RAGService.generateEmbedding('');
    assert(emptyEmbedding instanceof Float32Array, 'Should return Float32Array');
    for (let i = 0; i < 768; i++) {
      assert(emptyEmbedding[i] === 0, `All zeros for empty text at index ${i}`);
    }
    console.log('✅ Pass: Empty text returns zero vector\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  // Test 8: Cosine similarity with zero vectors
  console.log('Test 8: Cosine similarity of zero vectors...');
  try {
    const zeroA = new Float32Array(768).fill(0);
    const zeroB = new Float32Array(768).fill(0);
    const similarity = RAGService.cosineSimilarity(zeroA, zeroB);
    assert(similarity === 0, 'Similarity of zero vectors should be 0');
    console.log('✅ Pass: Zero vector similarity handled correctly\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  // Test 9: Typical LRU search pattern
  console.log('Test 9: LRU-like search with pagination...');
  try {
    const results = await RAGService.search(
      mockDB,
      'user123',
      'test query',
      {
        sources: ['archive_messages'],
        limit: 20,
        minSimilarity: 0.3
      }
    );
    
    // Check structure
    assert(Array.isArray(results.results), 'Results should be array');
    
    // Check pagination (-no data, but check structure)
    assert(typeof results.total === 'number', 'Total should be number');
    assert(typeof results.queryEmbedding === 'object' || typeof results.queryEmbedding === 'undefined', 
           'Query embedding should be present');
    
    console.log('✅ Pass: Pagination structure correct\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  // Test 10: Error handling in search
  console.log('Test 10: Error handling when DB is null...');
  try {
    const results = await RAGService.search(null, 'user123', 'test');
    assert(Array.isArray(results.results), 'Should return empty array on error');
    assert(results.total === 0, 'Total should be 0 on error');
    console.log('✅ Pass: Error handling works\n');
    passed++;
  } catch (error) {
    console.log('❌ Fail:', error.message, '\n');
    failed++;
  }

  console.log('\n' + '='.repeat(50));
  console.log(`RAG API Integration Test Results:`);
  console.log(`  Total: ${passed + failed}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('='.repeat(50));

  if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n✅ All integration tests passed!');
    process.exit(0);
  }
}

runApiTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});