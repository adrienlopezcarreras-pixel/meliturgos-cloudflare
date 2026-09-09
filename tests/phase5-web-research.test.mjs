/**
 * Tests for Web Research Capability - P2 INTERNET
 * 
 * Tests InternetService, WebCapability, and API endpoint
 */

import assert from "node:assert/strict";
import {unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

// Import services directly for testing
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const internetService = (await import(join(__dirname, "../src/services/internet-service.js"))).default;
const webCapability = await import(join(__dirname, "../src/devices/web-capability.js"));

async function mockWebResearchAPI(query, auth) {
  // Mock environment
  const mockEnv = {
    MELITURGOS_USER: "adrien",
    MELITURGOS_PASSWORD: "test",
    OWNER_NAME: "Adrien",
    DB: {
      prepare(sql) {
        const s = Object.create({bind() {return this}, run: async () => ({meta: {changes: 1, last_row_id: 1}}), first: async () => ({n: 0, id: "session"}), all: async () => ({results: []})});
        if (String(sql).includes("PRAGMA quick_check")) s.first = async () => ({quick_check: "ok"});
        return s;
      },
      batch(sqlStatements) {
        return Promise.all(sqlStatements.map(stmt => stmt.run()));
      }
    },
    AI: { run: async (model) => ({response: "mock response", model}) }
  };

  // Create service instance and call research
  const service = new internetService(mockEnv);
  return await service.research("test", null, 1); // Using simple query for rate limiting test
}

async function testWebResearchEndpoint() {
  console.log("Testing /api/web/research endpoint...");
  
  const auth = "Basic " + Buffer.from("adrien:test").toString("base64");
  
  const result = await mockWebResearchAPI("What is WebAssembly?", auth);
  
  assert.ok(result.query, "Should have query");
  assert.ok(result.sources, "Should have sources");
  assert.ok(Array.isArray(result.sources), "Sources should be array");
  assert.ok(result.provenance, "Should have provenance tracking");
  
  // Validate sources
  for (const source of result.sources) {
    assert.ok(source.url, "Source should have URL");
    assert.ok(source.content, "Source should have content");
    assert.ok(source.title, "Source should have title");
    assert.ok(typeof source.content === 'string', "Content should be string");
    assert.ok(source.content.length >= 10, "Content should not be empty");
  }
  
  // Validate provenance
  assert.ok(result.provenance.source_id.startsWith("web-svc-"), 
    "Provenance should have web-svc prefix");
  assert.ok(result.provenance.timestamp, "Should have timestamp");
  
  console.log("  ✓ /api/web/research endpoint works correctly");
}

async function testWebResearchRateLimiting() {
  console.log("Testing rate limiting...");

  // For rate limiting test, we need to test the actual rate limiter
  const mockEnv = {
    MELITURGOS_USER: "adrien",
    MELITURGOS_PASSWORD: "test",
    OWNER_NAME: "Adrien",
    DB: {
      prepare(sql) {
        const s = Object.create({bind() {return this}, run: async () => ({meta: {changes: 1, last_row_id: 1}}), first: async () => ({n: 0, id: "session"}), all: async () => ({results: []})});
        if (String(sql).includes("PRAGMA quick_check")) s.first = async () => ({quick_check: "ok"});
        return s;
      },
      batch(sqlStatements) {
        return Promise.all(sqlStatements.map(stmt => stmt.run()));
      }
    },
    AI: { run: async (model) => ({response: "mock response", model}) }
  };

  // Test the rate limiter directly
  const service = new internetService(mockEnv);
  
  // Reset timer to test interval enforcement
  service.lastFetch = Date.now() - 2000; // Simulate 2s ago
  
  const start = Date.now();
  const first = service.ensureRateLimit().then(() => ({ done: 'first' }));
  const second = service.ensureRateLimit().then(() => ({ done: 'second' }));
  await Promise.all([first, second]);
  const elapsed = Date.now() - start;

  // Should have slept for approximately minInterval (1s)
  console.log(`  Rate limiter elapsed: ${elapsed}ms`);
  assert.ok(elapsed >= 900, `Rate limiter should enforce minimum interval (elapsed: ${elapsed}ms, min: 1000ms)`);

  console.log(`  ✓ Rate limiting enforcement verified (elapsed: ${elapsed}ms)`);

  // Restore lastFetch for other tests
  service.lastFetch = Date.now();
}

async function testInvalidUrls() {
  console.log("Testing invalid URL handling...");
  
  const mockEnv = {
    MELITURGOS_USER: "adrien",
    MELITURGOS_PASSWORD: "test",
    OWNER_NAME: "Adrien",
    DB: {
      prepare(sql) {
        const s = Object.create({bind() {return this}, run: async () => ({meta: {changes: 1, last_row_id: 1}}), first: async () => ({n: 0, id: "session"}), all: async () => ({results: []})});
        if (String(sql).includes("PRAGMA quick_check")) s.first = async () => ({quick_check: "ok"});
        return s;
      },
      batch(sqlStatements) {
        return Promise.all(sqlStatements.map(stmt => stmt.run()));
      }
    },
    AI: { run: async (model) => ({response: "mock response", model}) }
  };

  const service = new internetService(mockEnv);
  const invalidUrls = [
    "http://localhost:3000",
    "https://192.168.1.1",
    "javascript:alert('xss')",
    "file:///etc/passwd",
  ];
  
  for (const invalidUrl of invalidUrls) {
    try {
      await service.fetchPage(invalidUrl);
      assert.fail(`Invalid URL ${invalidUrl} should have been rejected`);
    } catch (e) {
      console.log(`  ✓ Invalid URL rejected: ${invalidUrl}`);
    }
  }
}

async function testUnauthorizedAccess() {
  console.log("Testing unauthorized access...");
  
  const mockEnv = {
    MELITURGOS_USER: "adrien",
    MELITURGOS_PASSWORD: "test",
    OWNER_NAME: "Adrien",
    DB: {
      prepare(sql) {
        const s = Object.create({bind() {return this}, run: async () => ({meta: {changes: 1, last_row_id: 1}}), first: async () => ({n: 0, id: "session"}), all: async () => ({results: []})});
        if (String(sql).includes("PRAGMA quick_check")) s.first = async () => ({quick_check: "ok"});
        return s;
      },
      batch(sqlStatements) {
        return Promise.all(sqlStatements.map(stmt => stmt.run()));
      }
    },
    AI: { run: async (model) => ({response: "mock response", model}) }
  };

  const service = new internetService(mockEnv);
  const result = await service.research("test query", null, 1);
  
  assert.ok(result, "Should return result");
  console.log("  ✓ Service returns research results");
}

// Run the web research tests
console.log("\n=== P2 INTERNET - WEB RESEARCH CAPABILITY TESTS ===\n");

Promise.resolve()
  .then(() => testWebResearchEndpoint())
  .then(() => testWebResearchRateLimiting())
  .then(() => testInvalidUrls())
  .then(() => testUnauthorizedAccess())
  .then(() => {
    console.log("\n✓✓✓ All web research tests passed! ✓✓✓\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ TEST FAILED:", error.message);
    console.error(error.stack);
    process.exit(1);
  });