import assert from 'node:assert/strict';
import { ModelRegistry, standardRegistry } from '../src/models/ModelRegistry.js';
import { OrchestratedFallback } from '../src/registry/orchestration-registry.js';

const registry = new ModelRegistry([
  { id: 'fast', provider: 'test', name: 'Fast', capabilities: ['GENERAL', 'CODE'], priority: 20, cost: 0 },
  { id: 'deep', provider: 'test', name: 'Deep', capabilities: ['GENERAL', 'REASONING', 'CODE'], priority: 10, cost: 0 },
  { id: 'other', provider: 'test', name: 'Other', capabilities: ['GENERAL'], priority: 1, cost: 0 },
]);

assert.equal(registry.size(), 3);
assert.equal(registry.getAll().length, 3);
assert.ok(registry.getCapabilities().includes('CODE'));
assert.equal(registry.getBestByCapability('code').id, 'fast');
assert.equal(registry.getByCapabilities(['general', 'code'])[0].id, 'fast');

registry.setPrimary('CODE', 'deep');
assert.equal(registry.getBestByCapability('code').id, 'deep');
const fallbacks = registry.getFallbackChain('deep', 2);
assert.equal(fallbacks.length, 2);
assert.equal(fallbacks[0].id, 'fast');
assert.ok(!fallbacks.some(model => model.id === 'deep'));

registry.disable('deep');
assert.equal(registry.getBestByCapability('CODE').id, 'fast');

const configuredIds = new Set(standardRegistry.getAll().map(model => model.id));
assert.ok(configuredIds.has('@cf/zai-org/glm-4.7-flash'));
assert.ok(configuredIds.has('@cf/meta/llama-3.3-70b-instruct-fp8-fast'));
assert.ok(configuredIds.has('@cf/google/gemma-3-12b-it'));
assert.ok(configuredIds.has('ninjachat-default'));
assert.equal(standardRegistry.get('@cf/zai-org/glm-4.7-flash').cost, 0);

// The orchestration compatibility path must remain operational without network access.
const orchestrator = new OrchestratedFallback(new ModelRegistry([
  { id: 'primary', provider: 'test', name: 'Primary', capabilities: ['CODE'], priority: 10, cost: 0 },
  { id: 'fallback', provider: 'test', name: 'Fallback', capabilities: ['CODE'], priority: 5, cost: 0 },
]));
const result = await orchestrator.callWithFallback(null, 'test', { capability: 'CODE' });
assert.equal(result.success, true);
assert.equal(result.model, 'primary');
assert.equal(result.attempts.length, 1);
assert.equal(result.attempts[0].success, true);

// Metadata tracking is best-effort and must not turn a DB outage into a task failure.
await orchestrator.trackMetadata({
  prepare() {
    return { bind() { return { run() { throw new Error('DB unavailable'); } }; } };
  },
}, 'test-orchestrator', result);

console.log('phase4-registry-and-fallback: current registry, primary selection and fallback compatibility verified');
