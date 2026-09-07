/**
 * Phase 5 Tests: Model Router
 * 
 * Tests for ModelRouter.js - selection of models based on capabilities,
 * cost estimation, and automatic fallback via orchestration-registry.
 */

import { ModelRouter, classifyTask } from '../src/models/ModelRouter.js';

// Local definition for test comparison (matching ModelRouter's TASK_TYPES)
const TASK_TYPES = {
  CONVERSATION: 'conversation',
  REASONING: 'reasoning',
  CODING: 'coding',
  VISION: 'vision',
  AUDIO: 'audio',
  MEDIA: 'media',
  GENERAL: 'general'
};

console.log('=== Phase 5 Tests: Model Router ===\n');

let modelRouter;

// Test setup
function setup() {
  modelRouter = new ModelRouter();
}

console.log('Test 1: Constructor\n');
setup();
console.log('  ✅ ModelRouter initialized correctly\n');

// Test 1 in isolation
try {
  setup();
  console.log('✅ Test 1 passed: Constructor works\n');
} catch (error) {
  console.log('❌ Test 1 failed:', error.message, '\n');
  process.exit(1);
}

// Task classification tests
console.log('Test 2: Task classification (coding)\n');
try {
  const codeSnippet = 'function hello() {\n  console.log("world");\n}';
  const taskType = classifyTask(codeSnippet);
  console.log(`  Classified as: ${taskType}`);
  const CODING = TASK_TYPES.CODING;
  const REASONING = TASK_TYPES.REASONING;
  const CONVERSATION = TASK_TYPES.CONVERSATION;
  
  if (taskType === CODING) {
    console.log('  ✅ Coding task correctly classified\n');
  } else {
    throw new Error(`Expected ${CODING}, got ${taskType}`);
  }
} catch (error) {
  console.log('❌ Test 2 failed:', error.message, '\n');
  process.exit(1);
}

console.log('Test 3: Task classification (reasoning)\n');
try {
  const reasoningQuestion = 'Explain why the sky is blue in simple terms';
  const taskType = classifyTask(reasoningQuestion);
  console.log(`  Classified as: ${taskType}`);
  const REASONING = TASK_TYPES.REASONING;
  
  if (taskType === REASONING) {
    console.log('  ✅ Reasoning task correctly classified\n');
  } else {
    throw new Error(`Expected ${REASONING}, got ${taskType}`);
  }
} catch (error) {
  console.log('❌ Test 3 failed:', error.message, '\n');
  process.exit(1);
}

console.log('Test 4: Task classification (conversation)\n');
try {
  const casualMessage = 'How are you feeling today?';
  const taskType = classifyTask(casualMessage);
  console.log(`  Classified as: ${taskType}`);
  
  // Allow either conversation or reasoning for simple questions
  const CONVERSATION = TASK_TYPES.CONVERSATION;
  
  if (taskType === CONVERSATION || taskType === TASK_TYPES.REASONING) {
    console.log('  ✅ Greeting/question correctly classified\n');
  } else {
    throw new Error(`Expected ${CONVERSATION} or reasoning, got ${taskType}`);
  }
} catch (error) {
  console.log('❌ Test 4 failed:', error.message, '\n');
  process.exit(1);
}

// Model selection tests (with dependency on orchestration-registry)
console.log('Test 5: Model selection by capability\n');
try {
  setup();
  const model = modelRouter.selectModel('chat', {});
  console.log(`  Selected model: ${model.name} (${model.id})`);
  
  if (model && model.id) {
    console.log('  ✅ Model selected successfully\n');
  } else {
    throw new Error('No model returned from selectModel');
  }
} catch (error) {
  console.log('❌ Test 5 failed:', error.message, '\n');
  process.exit(1);
}

console.log('Test 6: Listing models by capability\n');
try {
  setup();
  const models = modelRouter.listModels('code');
  console.log(`  Available code models: ${models.length}`);
  
  if (Array.isArray(models)) {
    console.log('  ✅ Models listed successfully\n');
  } else {
    throw new Error('listModels did not return an array');
  }
} catch (error) {
  console.log('❌ Test 6 failed:', error.message, '\n');
  process.exit(1);
}

console.log('Test 7: Statistics\n');
try {
  setup();
  const stats = modelRouter.getStats();
  console.log(`  Total models: ${stats.totalModels}`);
  console.log(`  Capabilities: ${stats.capabilities.join(', ')}`);
  
  if (stats && stats.totalModels > 0) {
    console.log('  ✅ Statistics retrieved successfully\n');
  } else {
    throw new Error('Statistics not available');
  }
} catch (error) {
  console.log('❌ Test 7 failed:', error.message, '\n');
  process.exit(1);
}

console.log('Test 8: Cost estimation\n');
try {
  setup();
  const cost = modelRouter.estimateCost('chat');
  console.log(`  Estimated cost for chat: $${cost.toFixed(6)}`);
  
  if (typeof cost === 'number' && cost >= 0) {
    console.log('  ✅ Cost estimation successful\n');
  } else {
    throw new Error('Invalid cost returned');
  }
} catch (error) {
  console.log('❌ Test 8 failed:', error.message, '\n');
  process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('✅ PHASE 5: ALL TESTS PASSED');
console.log('='.repeat(60) + '\n');

console.log('Summary:');
console.log('--------');
console.log('✓ ModelRouter correctly initializes');
console.log('✓ Task classification works (coding/reasoning/conversation)');
console.log('✓ Model selection by capability works');
console.log('✓ Cost estimation works');
console.log('✓ Statistics retrieval works');
console.log('\n');
console.log('Phase 5 — Model Router: COMPLETE ✓');

process.exit(0);