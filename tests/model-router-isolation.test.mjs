import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelRouter } from '../src/models/ModelRouter.js';

test('default ModelRouter registries are isolated between instances', () => {
  const first = new ModelRouter();
  const second = new ModelRouter();
  const modelId = '@cf/zai-org/glm-4.7-flash';

  assert.notEqual(first.registry, second.registry);
  assert.equal(first.registry.get(modelId)?.enabled, true);
  assert.equal(second.registry.get(modelId)?.enabled, true);

  first.registry.disable(modelId);

  assert.equal(first.registry.get(modelId)?.enabled, false);
  assert.equal(second.registry.get(modelId)?.enabled, true);
});
