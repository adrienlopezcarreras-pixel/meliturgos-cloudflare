import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TOP_MODELS, topModelIds, preferTopModels, standardRegistry } from '../src/models/ModelRegistry.js';

// Owner decision 01/11: only MEL's top models deliberate and code. The list is
// MEL's own, evolvable through MEL-AUDIT-06 then MEL-MANIFEST-09.
test('top models are registered, free, and replace the weak free models in council and mentor', () => {
  assert.equal(TOP_MODELS.length, 2, 'two distinct models keep an independent second opinion');
  for (const id of TOP_MODELS) {
    const model = standardRegistry.get(id);
    assert.ok(model, id);
    assert.equal(model.cost, 0, id + ' must stay free');
  }
  assert.deepEqual(topModelIds({ MEL_TOP_MODELS: ' a , b ' }), ['a', 'b'], 'MEL can override its own choice');
  assert.deepEqual(topModelIds({}), [...TOP_MODELS]);
  const providers = [{ id: 'weak-1', modelId: '@cf/zai-org/glm-4.7-flash' }, { id: 'p2', modelId: TOP_MODELS[1] }, { id: 'p1', modelId: TOP_MODELS[0] }];
  assert.deepEqual(preferTopModels(providers, {}, { min: 2 }).map(row => row.id), ['p1', 'p2'], 'top order, weak models dropped');
  assert.deepEqual(preferTopModels(providers.slice(0, 1), {}, { min: 2 }).map(row => row.id), ['weak-1'], 'never leave MEL with nothing');
  for (const [file, needle] of [['src/teachers/augmentio-council.js', 'preferTopModels'], ['src/learning/mentor-engine.js', 'preferTopModels']])
    assert.match(fs.readFileSync(file, 'utf8'), new RegExp(needle), file);
});
