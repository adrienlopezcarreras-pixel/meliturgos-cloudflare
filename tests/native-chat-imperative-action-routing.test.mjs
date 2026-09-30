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


for (const prompt of [
  'vérifie maintenant le Dev Bridge local réel',
  'inspecte le dev bridge et dis moi s il poll les packages READY',
  'contrôle le statut du poller et les paquets READY',
]) {
  test('routes live Dev Bridge inspection request: ' + prompt, () => {
    assert.deepEqual(inferNativeExecutionCapability(prompt), {
      id: 'autonomy.bridge.status',
      input: { limit: 20 },
      execution_intent: 'DEV_BRIDGE_LIVE_INSPECTION',
    });
  });
}

for (const prompt of [
  'où en est le stress test ?',
  'statut du stress-test global',
  'donne moi le rapport du stress test',
]) {
  test('routes persistent global stress status request: ' + prompt, () => {
    assert.deepEqual(inferNativeExecutionCapability(prompt), {
      id: 'capability.audit.status',
      input: {},
      execution_intent: 'GLOBAL_CAPABILITY_STRESS_STATUS',
    });
  });
}

test('routes one exact persistent stress job id when present', () => {
  assert.deepEqual(inferNativeExecutionCapability('statut du stress test cap-stress-12345678-1234-1234-1234-123456789abc'), {
    id: 'capability.audit.status',
    input: { job_id: 'cap-stress-12345678-1234-1234-1234-123456789abc' },
    execution_intent: 'GLOBAL_CAPABILITY_STRESS_STATUS',
  });
});

