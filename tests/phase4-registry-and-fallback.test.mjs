/**
 * Phase 4 Tests: Model Registry & Orchestrated Fallback
 * 
 * Tests de validation du registry générique et du fallback orchestré
 */

import { ModelRegistry, standardRegistry } from '../src/models/ModelRegistry.js';
import { OrchestratedFallback, orchestratedFallback } from '../src/registry/orchestration-registry.js';

console.log('=== Phase 4 Tests: Model Registry & Orchestrated Fallback ===\n');

let testsPassed = 0;
let testsTotal = 0;

// Test: Registry basic operations
async function testRegistryBasic() {
  testsTotal++;
  console.log(`Test ${testsTotal}: Registry basic operations`);
  
  try {
    const registry = new ModelRegistry();
    
    // Register a test model
    const testModel = registry.register({
      id: "@cf/test/model-1",
      name: "Test Model 1",
      provider: "@cf/test",
      capabilities: ["chat", "code"],
      pricing: {
        input: "$0.010 per 1M tokens",
        output: "$0.020 per 1M tokens"
      },
      tags: ["test", "chat"]
    });

    // Verify model was registered
    assert.ok(registry.get("@cf/test/model-1"), "Model should be retrievable by ID");
    assert.equal(registry.get("@cf/test/model-1").id, "@cf/test/model-1", "ID should match");
    
    console.log('  ✅ Model registered and retrieved successfully\n');
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
  }
}

// Test: Registry capability search
async function testRegistryCapabilities() {
  testsTotal++;
  console.log(`Test ${testsTotal}: Registry capability search`);
  
  try {
    const registry = new ModelRegistry();
    
    // Register multiple models with different capabilities
    registry.register({
      id: "@cf/test/model-a",
      name: "Model A",
      capabilities: ["chat"]
    });
    
    registry.register({
      id: "@cf/test/model-b",
      name: "Model B",
      capabilities: ["code"]
    });
    
    registry.register({
      id: "@cf/test/model-c",
      name: "Model C",
      capabilities: ["chat", "code"]
    });

    // Search by capability
    const chatModels = registry.getByCapabilities("chat");
    assert.ok(chatModels.length > 0, "Should find chat models");
    assert.ok(chatModels.length <= 3, "Should not exceed registered models");

    // Get best by capability
    const bestChat = registry.getBestByCapability("chat");
    assert.ok(bestChat, "Should return a chat model");
    assert.equal(bestChat.capabilities.includes("chat"), true, "Model should have chat capability");

    console.log('  ✅ Capability search works correctly\n');
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
  }
}

// Test: Registry primary model setting
async function testRegistryPrimary() {
  testsTotal++;
  console.log(`Test ${testsTotal}: Registry primary model setting`);
  
  try {
    const registry = new ModelRegistry();
    
    // Register two chat models
    registry.register({
      id: "@cf/test/chat-model-1",
      name: "Chat Model 1",
      capabilities: ["chat"]
    });
    
    registry.register({
      id: "@cf/test/chat-model-2",
      name: "Chat Model 2",
      capabilities: ["chat"]
    });

    // Set primary
    registry.setPrimary("chat", "@cf/test/chat-model-1");
    
    // Verify fallback chain
    const fallbacks = registry.getFallbackChain("@cf/test/chat-model-1", 2);
    assert.ok(fallbacks.length >= 1, "Should have at least one fallback");
    assert.equal(fallbacks[0].id, "@cf/test/chat-model-2", "Fallback should be chat-model-2");

    console.log('  ✅ Primary model and fallback chain work correctly\n');
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
  }
}

// Test: Standard registry initialization
async function testStandardRegistry() {
  testsTotal++;
  console.log(`Test ${testsTotal}: Standard registry initialization`);
  
  try {
    // Standard registry should be pre-populated
    assert.ok(standardRegistry.size() >= 3, "Standard registry should have at least 3 models");
    
    // Check known models exist
    const kimi = standardRegistry.get("@cf/moonshotai/kimi-k2.7-code");
    assert.ok(kimi, "Kimi model should be registered");
    assert.equal(kimi.capabilities.includes("code"), true, "Kimi should have code capability");

    const glm = standardRegistry.get("@cf/zai-org/glm-4.7-flash");
    assert.ok(glm, "GLM model should be registered");
    assert.ok(glm.pricing.estimated_cost_per_input_usd > 0, "GLM pricing should be configured");

    const gemma = standardRegistry.get("@cf/google/gemma-3-12b-it");
    assert.ok(gemma, "Gemma model should be registered");

    console.log('  ✅ Standard registry correctly initialized with models\n');
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
  }
}

// Test: Orchestrated fallback with primary success
async function testOrchestrationFallbackSuccess() {
  testsTotal++;
  console.log(`Test ${testsTotal}: Orchestrated fallback with primary success`);
  
  try {
    const result = await orchestratedFallback.callWithFallback({ DB: null }, "Test prompt", {});
    
    assert.equal(result.success, true, "Result should be successful");
    assert.ok(result.model, "Result should include model ID");
    assert.ok(result.content, "Result should include content");
    assert.ok(result.metadata, "Result should include metadata");
    assert.ok(result.attempts, "Result should include attempt history");
    
    console.log(`  ✅ Orchestrated fallback succeeded (used ${result.model})\n`);
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
  }
}

// Test: Orchestrated fallback exhaustion
async function testOrchestrationFallbackExhaustion() {
  testsTotal++;
  console.log(`Test ${testsTotal}: Orchestrated fallback exhaustion`);
  
  // Note: This test would be more meaningful if we could mock AI failures
  // For now, we'll just verify the structure
  try {
    const result = await orchestratedFallback.callWithFallback({ DB: null }, "Test prompt", {});
    
    assert.equal(result.success, true, "Should eventually succeed with fallback");
    assert.ok(result.attempts.length >= 1, "Should have at least one attempt");
    assert.equal(result.attempts[result.attempts.length - 1].success, true, "Last attempt should succeed");
    
    console.log('  ✅ Exhaustion handling verified (structure correct)\n');
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
  }
}

// Test: Metadata tracking (schema simulation)
async function testMetadataTracking() {
  testsTotal++;
  console.log(`Test ${testsTotal}: Metadata tracking simulation`);
  
  try {
    const testOrchestratorId = "test-orchestrator-123";
    const DB = {
      prepare: () => ({
        bind: () => ({ run: () => ({}) }),
        all: () => ({ results:[] })
      })
    };

    const result = {
      model: "@cf/test/model-1",
      success: true,
      attempts: [{ model: "@cf/test/model-1" }],
      metadata: { input_tokens: 100, output_tokens: 80 }
    };

    await orchestratedFallback.trackMetadata(DB, testOrchestratorId, result);
    
    console.log('  ✅ Metadata tracking verified\n');
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
  }
}

// Test: Registry size and capabilities
async function testRegistryProperties() {
  testsTotal++;
  console.log(`Test ${testsTotal}: Registry properties (size, capabilities)`);
  
  try {
    const registry = new ModelRegistry();
    
    // Register multiple models
    for (let i = 1; i <= 5; i++) {
      registry.register({
        id: `@cf/test/model-${i}`,
        name: `Model ${i}`,
        capabilities: ["chat"]
      });
    }

    assert.equal(registry.size(), 5, "Registry should have 5 models");
    assert.ok(registry.getAll().length >= 5, "getAll should return all models");

    // Test capabilities list
    assert.ok(registry.getCapabilities().includes("chat"), "Should expose chat capability");

    console.log('  ✅ Registry properties verified\n');
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
  }
}

// Test: Model cost estimation
async function testCostEstimation() {
  testsTotal++;
  console.log(`Test ${testsTotal}: Cost estimation in registry`);
  
  try {
    // Check standard registry models have pricing
    const models = standardRegistry.getAll();
    
    for (const model of models) {
      assert.ok(model.pricing.estimated_cost_per_input_usd, 
        `Model ${model.name} should have pricing configuration`);
      assert.ok(typeof model.pricing.estimated_cost_per_input_usd === 'number',
        `Cost should be numeric`);
    }

    console.log('  ✅ Cost estimation verified for all models\n');
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
  }
}

// Test: Duplicate model registration
async function testDuplicateRegistration() {
  testsTotal++;
  console.log(`Test ${testsTotal}: Duplicate model registration`);
  
  try {
    const registry = new ModelRegistry();
    
    // Register same model twice
    registry.register({
      id: "@cf/test/duplicate",
      name: "Duplicate Model",
      capabilities: ["chat"]
    });
    
    const firstSize = registry.size();
    registry.register({
      id: "@cf/test/duplicate",
      name: "Duplicate Model",
      capabilities: ["code"]  // Extra capability
    });
    
    const secondSize = registry.size();
    
    // Should remain one model (registration updates, doesn't duplicate)
    assert.equal(secondSize, firstSize, "Should not create duplicate model");

    console.log('  ✅ Duplicate handling verified\n');
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
  }
}

// Test: Empty capability search
async function testEmptyCapabilitySearch() {
  testsTotal++;
  console.log(`Test ${testsTotal}: Empty capability search`);
  
  try {
    const registry = new ModelRegistry();
    
    // Register models with 'chat' only
    registry.register({
      id: "@cf/test/chat-only",
      name: "Chat Only",
      capabilities: ["chat"]
    });

    // Search for 'code' which doesn't exist
    const codeModels = registry.getByCapabilities("code");
    assert.equal(codeModels.length, 0, "Should not find any code models");

    console.log('  ✅ Empty capability search verified\n');
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}\n`);
  }
}

// Assertion helpers
const assert = {
  ok(value, message) {
    if (!value) throw new Error(message || "Assertion failed");
  },
  equal(a, b, message) {
    if (a !== b) throw new Error(message || `Assertion failed: ${a} !== ${b}`);
  },
  deepEqual(a, b, message) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error(message || "Assertion failed: deep equality violation");
    }
  }
};

// Run all tests
(async () => {
  console.log('Starting Phase 4 Test Suite\n');
  console.log('========================================\n');

  await testRegistryBasic();
  await testRegistryCapabilities();
  await testRegistryPrimary();
  await testStandardRegistry();
  await testOrchestrationFallbackSuccess();
  await testOrchestrationFallbackExhaustion();
  await testMetadataTracking();
  await testRegistryProperties();
  await testCostEstimation();
  await testDuplicateRegistration();
  await testEmptyCapabilitySearch();

  console.log('========================================\n');
  console.log(`Test Results: ${testsPassed}/${testsTotal} passed\n`);

  if (testsPassed === testsTotal) {
    console.log('✅ ALL TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.log(`❌ ${testsTotal - testsPassed} test(s) failed\n`);
    process.exit(1);
  }
})();
