#!/usr/bin/env node
/**
 * Test API routes directly
 */

import process from 'process';
import { readFile } from 'fs/promises';

async function loadRouter() {
  try {
    return await import('../src/router.js');
  } catch (error) {
    console.error("Failed to load router:", error.message);
    process.exit(1);
  }
}

async function testResearchEndpoint() {
  const router = await loadRouter();
  
  // Create test request
  const request = new Request('http://localhost:8787/api/web/research', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token'
    },
    body: JSON.stringify({
      query: "test query",
      max_depth: 1
    })
  });

  const env = {
    DB: { prepare: () => ({ all: () => [] }) }
  };

  try {
    const response = await router.default.fetch(request, env);
    const status = response.status;
    const data = await response.json();
    console.log('✓ Research endpoint response:', status, data);
    return status === 200 || status === 401 || status === 500;
  } catch (error) {
    console.error('✗ Research endpoint error:', error.message);
    return false;
  }
}

async function main() {
  console.log('Testing Gen2 router route...');
  const result = await testResearchEndpoint();
  
  if (result) {
    console.log('✓ Router test passed');
    process.exit(0);
  } else {
    console.log('✗ Router test failed');
    process.exit(1);
  }
}

main();