import test from 'node:test';
import assert from 'node:assert/strict';
import { inferNativeExecutionCapability } from '../src/api/native-chat.js';

const stressPrompts = [
  'lance un stress test',
  'lance un stresstest',
  'teste toutes tes capacités',
  'vérifie que tout fonctionne',
  'audite toutes tes capacités',
];

for (const prompt of stressPrompts) {
  test('routes imperative global stress request: ' + prompt, () => {
    assert.deepEqual(inferNativeExecutionCapability(prompt), {
      id: 'capability.audit',
      input: { deep: true },
      execution_intent: 'GLOBAL_CAPABILITY_STRESS_TEST',
    });
  });
}

test('does not hijack unrelated imperative requests', () => {
  assert.equal(inferNativeExecutionCapability('ouvre Firefox sur mon PC'), null);
  assert.equal(inferNativeExecutionCapability('cherche ce fichier dans le dépôt'), null);
});
