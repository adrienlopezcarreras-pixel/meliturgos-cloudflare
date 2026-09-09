#!/usr/bin/env node

/**
 * P2 Internet Real: E2E Test
 * 
 * Validates real-world HTTP success path:
 * - POST /api/web/research
 * - HTTP 200 response
 * - Non-empty JSON with source, retrieved_at
 * - Provenance tracking
 */

async function testP2() {
  // Test credentials
  const username = 'adrien';
  const password = 'test'; // From wrangler dev / env
  const auth = `${username}:${password}`;
  const authHeader = `Basic ${Buffer.from(auth).toString('base64')}`;

  console.log("Sending request to:", `http://localhost:8791/api/web/research`);
  console.log("Authorization header:", authHeader.substring(0, 15) + "...");

  // Request body
  const requestBody = JSON.stringify({
    query: 'MELITURGOS',
    maxDepth: 1
  });

  console.log('=== P2 Internet Real: E2E Test ===');
  console.log('Target: POST /api/web/research');
  console.log('Auth:', auth);
  console.log('');

  try {
    const response = await fetch('http://localhost:8789/api/web/research', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: requestBody,
      signal: AbortSignal.timeout(30000) // Increased timeout to 30s
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    console.log('');

    const body = await response.text();
    console.log('Response body:');
    console.log(body);
    console.log('');

    // Validate
    const result = JSON.parse(body);
    
    let passed = true;

    // HTTP 200 check
    if (response.status !== 200) {
      console.error('✗ FAIL: Expected 200, got', response.status);
      passed = false;
    } else {
      console.log('✓ HTTP 200 OK');
    }

    // Response structure check
    if (!result.ok) {
      console.error('✗ FAIL: Expected ok: true');
      passed = false;
    } else {
      console.log('✓ Response structure: ok: true');
    }

    // Research content check
    if (!result.research) {
      console.error('✗ FAIL: Expected research object');
      passed = false;
    } else {
      console.log('✓ Research object present');
    }

    // Provenance tracking
    const re = result.research;
    
    if (!re.provenance || !re.provenance.source_id) {
      console.error('✗ FAIL: Expected provenance.source_id');
      passed = false;
    } else {
      console.log('✓ Provenance tracking:', re.provenance.source_id);
    }

    // Sources check
    if (!Array.isArray(re.sources) || re.sources.length === 0) {
      console.error('✗ FAIL: Expected non-empty sources array');
      passed = false;
    } else {
      console.log('✓ Sources found:', re.sources.length);
      if (re.sources.length > 0) {
        console.log('  Sample source:', re.sources[0].url);
      }
    }

    // Retrieved_at timestamp
    if (!re.retrieved_at) {
      console.error('✗ FAIL: Expected retrieved_at timestamp');
      passed = false;
    } else {
      console.log('✓ Retrieved at:', re.retrieved_at);
    }

    // JSON roundtrip
    const stringified = JSON.stringify(result);
    if (stringified.length === 0) {
      console.error('✗ FAIL: Response body empty');
      passed = false;
    } else {
      console.log('✓ Non-empty JSON response');
    }

    console.log('');
    if (passed) {
      console.log('=== ✓ ✓ ✓ P2 SUCCESS: All checks passed ===');
      process.exit(0);
    } else {
      console.log('=== ✗✗✗ P2 FAILURE: Some checks failed ===');
      process.exit(1);
    }

  } catch (error) {
    console.error('✗ Test failed with exception:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testP2();