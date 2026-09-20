import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MEL_OPERATING_MANUAL, buildMelOperatingManualPrompt } from '../src/identity/mel-operating-manual.js';
import { codeAccessTruth, selectRelevantOperationalExperience } from '../src/api/native-chat.js';
import { MEL_RUNTIME_OPERATING_EXPERIENCE } from '../src/learning/runtime-operating-experience.js';
import { onRequestGet as fullMode } from '../src/pages/full-interface-v2.js';

test('MEL operating manual keeps identity, experience and post-pass invariants explicit', () => {
  assert.ok(MEL_OPERATING_MANUAL.identity.some(x => /tutoie toujours Adrien/i.test(x)));
  assert.ok(MEL_OPERATING_MANUAL.mustAlways.some(x => /Relire mon expérience utile avant chaque réponse/i.test(x)));
  assert.ok(MEL_OPERATING_MANUAL.mustAlways.some(x => /nettoyer, unifier, réconcilier et adapter/i.test(x)));
  assert.ok(MEL_OPERATING_MANUAL.mustAlways.some(x => /candidate\/mel-clean-autonomy/i.test(x)));
  assert.ok(MEL_OPERATING_MANUAL.knowsHowTo.some(x => /protocoles matériels versionnés/i.test(x)));
  assert.ok(MEL_OPERATING_MANUAL.responseQuality.some(x => /réponse directe et concrète/i.test(x)));
  assert.ok(MEL_OPERATING_MANUAL.responseQuality.some(x => /statuts opérationnels/i.test(x)));
  assert.ok(MEL_OPERATING_MANUAL.responseQuality.some(x => /Maintenir un sujet actif/i.test(x)));
  assert.ok(MEL_OPERATING_MANUAL.responseQuality.some(x => /contexte récent/i.test(x)));

  const prompt = buildMelOperatingManualPrompt({
    capabilityManifest: [{ id:'code.read', status:'EXISTANT_NON_TESTE', health:'HEALTHY', tested_now:false }],
    experience: [{ id:'bootstrap-post-pass-reconcile-adapt-20260918', after:'Nettoyer, unifier, réconcilier et adapter.' }],
  });
  assert.match(prompt, /MEL_OPERATING_MANUAL/);
  assert.match(prompt, /code\.read/);
  assert.match(prompt, /bootstrap-post-pass-reconcile-adapt-20260918/);
  assert.match(prompt, /QUALITÉ DE MES RÉPONSES/);
});

test('code access truth never turns missing current read proof into a false global incapacity', () => {
  const available = codeAccessTruth([
    { id:'code.read', status:'EXISTANT_NON_TESTE', health:'HEALTHY', enabled:true, tested_now:false },
    { id:'code.search', status:'PARTIEL', health:'DEGRADED', enabled:true, tested_now:false },
  ]);
  assert.equal(available.available, true);
  assert.equal(available.capabilities.length, 2);

  const blocked = codeAccessTruth([
    { id:'code.read', status:'BLOCKED', health:'OFFLINE', enabled:false, tested_now:false },
    { id:'code.search', status:'BLOCKED_EXTERNAL', health:'OFFLINE', enabled:true, tested_now:false },
  ]);
  assert.equal(blocked.available, false);
});

test('critical operating experience remains in scope even when the current request has little lexical overlap', () => {
  const rows = [
    { id:'other', after:'Autre règle', validated:true, tags:['other'] },
    { id:'bootstrap-code-access-capability-truth-20260918', after:'Dire la vérité sur l’accès code.', validated:false, tags:['code'] },
    { id:'bootstrap-continuous-experience-read-20260918', after:'Relire expérience à chaque requête.', validated:false, tags:['experience'] },
    { id:'bootstrap-post-pass-reconcile-adapt-20260918', after:'Nettoyer et réconcilier.', validated:false, tags:['cleanup'] },
  ];
  const selected = selectRelevantOperationalExperience('bonjour', rows, [], 4);
  const ids = selected.map(x => x.id);
  assert.ok(ids.includes('bootstrap-code-access-capability-truth-20260918'));
  assert.ok(ids.includes('bootstrap-continuous-experience-read-20260918'));
  assert.ok(ids.includes('bootstrap-post-pass-reconcile-adapt-20260918'));
});

test('runtime operating experience keeps the four critical rules available without entering the training bundle', () => {
  const ids = MEL_RUNTIME_OPERATING_EXPERIENCE.map(row => row.id);
  for (const id of [
    'bootstrap-hardware-device-protocol-20260919',
    'bootstrap-runtime-path-authority-20260918',
    'bootstrap-post-pass-reconcile-adapt-20260918',
    'bootstrap-code-access-capability-truth-20260918',
    'bootstrap-continuous-experience-read-20260918',
  ]) assert.ok(ids.includes(id), `missing runtime operating experience ${id}`);
  assert.ok(MEL_RUNTIME_OPERATING_EXPERIENCE.every(row => row.validated === true));
});

test('Professor chat exposes a compact live capability sheet', async () => {
  const response = await fullMode();
  const html = await response.text();
  assert.match(html, /id="chatCapabilityHelp"/);
  assert.match(html, /Ce que je sais faire/);
  assert.match(html, /id="chatCapRefresh"/);
  assert.match(html, /\/api\/gen2\/capabilities/);
  assert.match(html, />Prête\.<\/div>/);
});

test('active chat route and model context use native MEL manual and experience path', async () => {
  const [index, router, native] = await Promise.all([
    readFile(new URL('../src/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/router.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/api/native-chat.js', import.meta.url), 'utf8'),
  ]);
  assert.match(index, /handleNativeChat\(preparedRequest, withChatAiDefaults\(env\)\)/);
  assert.doesNotMatch(router, /handleNativeChat\(/);
  assert.doesNotMatch(router, /legacyHandler\.fetch\(/);
  assert.match(native, /loadOperationalExperience\(env, text\)/);
  assert.match(native, /buildMelOperatingManualPrompt/);
  assert.match(native, /VÉRITÉ ACCÈS CODE/);
  assert.match(native, /TUTOIEMENT ABSOLU AVEC ADRIEN/);
});
