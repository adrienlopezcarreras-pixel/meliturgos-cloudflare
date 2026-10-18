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


test('resolves follow-up asking exact link of an internal stress job from recent assistant message', () => {
  const id = 'cap-stress-52ebd31d-4806-4d13-a973-d7e93eaf54b8';
  const recent = [
    { role:'user', content:'Lance un stress test global.' },
    { role:'assistant', content:'Audit enregistré. job_id=' + id + '. Le test suit son cours.' },
  ];
  assert.deepEqual(inferNativeExecutionCapability('donne moi le lien exact', recent), {
    id: 'capability.audit.status',
    input: { job_id:id },
    execution_intent: 'GLOBAL_CAPABILITY_STRESS_LINK',
  });
});

test('resolves explicit cap-stress URL question without prior conversation', () => {
  const id = 'cap-stress-52ebd31d-4806-4d13-a973-d7e93eaf54b8';
  assert.deepEqual(inferNativeExecutionCapability('où est le lien exact ' + id), {
    id: 'capability.audit.status',
    input: { job_id:id },
    execution_intent: 'GLOBAL_CAPABILITY_STRESS_LINK',
  });
});

test('never substitutes arbitrary GitHub job IDs or unrelated context for a stress job', () => {
  assert.equal(inferNativeExecutionCapability('donne moi le lien exact'), null);
  assert.equal(inferNativeExecutionCapability('donne moi le lien exact', [
    { role:'assistant', content:'Workflow GitHub run_id 39118774567.' },
  ]), null);
  assert.equal(inferNativeExecutionCapability('ouvre le lien de mon dépôt', [
    { role:'assistant', content:'https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare' },
  ]), null);
});

test('short maj uses D1 stress status only when the latest assistant discussed that stress test', () => {
  const jobId = 'cap-stress-52ebd31d-4806-4d13-a973-d7e93eaf54b8';
  const recent = [
    { role:'user', content:'où en est ton stress test ?' },
    { role:'assistant', content:'L’audit reste à 36 / 168 étapes ; le lot 48 (stress-test) attend. job_id=' + jobId },
  ];
  assert.deepEqual(inferNativeExecutionCapability('maj', recent), {
    id: 'capability.audit.status',
    input: { job_id:jobId },
    execution_intent: 'GLOBAL_CAPABILITY_STRESS_STATUS',
  });
  assert.deepEqual(inferNativeExecutionCapability('maj', [
    { role:'assistant', content:'Le stress-test de mes capacités est toujours en cours.' },
  ]), {
    id: 'capability.audit.status', input: {}, execution_intent: 'GLOBAL_CAPABILITY_STRESS_STATUS',
  });
  assert.equal(inferNativeExecutionCapability('maj'), null);
  assert.equal(inferNativeExecutionCapability('maj', [
    { role:'assistant', content:'Le stress-test était hier.' },
    { role:'user', content:'Passons au roman.' },
    { role:'assistant', content:'Je travaille sur les chapitres du roman.' },
  ]), null);
});

test('persistent stress status has deterministic D1-only response and fail-closed fallback', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/api/native-chat.js', import.meta.url), 'utf8');
  const branch = source.slice(source.indexOf("execution_intent === 'GLOBAL_CAPABILITY_STRESS_STATUS'"));
  assert.match(branch, /evidence\?\.status === 'SUCCEEDED'/);
  assert.match(branch, /formatVerifiedCapabilityAuditResponse\(observed\)/);
  assert.match(branch, /Je ne peux pas v[eé]rifier maintenant la progression du stress test dans D1/);
  assert.match(branch, /status: verified \? 200 : 503/);
});

test('full audit with repair request uses durable audit execution instead of a development placeholder', () => {
  const action = inferNativeExecutionCapability("essaye de relancer l'audit de toutes tes capacités, et corrige les cassées en développant avec le council");
  assert.equal(action?.id,'capability.audit');
  assert.equal(action?.execution_intent,'GLOBAL_CAPABILITY_STRESS_TEST');
  assert.equal(inferNativeExecutionCapability('où en est le stress test ?')?.id, 'capability.audit.status');
});
