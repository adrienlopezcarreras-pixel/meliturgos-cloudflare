import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferAutonomyControlIntent,
  inferCodeIntegrityIntent,
  inferOpenWorkIntent,
  inferModuleProposalIntent,
  injectEvolutionPreflightCapability,
} from '../src/evolution/chat-intent.js';
import { shouldSemanticIntentCheck } from '../src/evolution/semantic-intent.js';

test('autonomy status language maps to evidence-based status capability', () => {
  for (const text of [
    'où en es-tu de ton autonomie ?',
    'quel est le statut de ton auto-développement ?',
    'es-tu prête pour le self-development ?',
    'donne-moi l’avancement de la feuille de route',
  ]) {
    assert.deepEqual(inferAutonomyControlIntent(text), { id: 'autonomy.status', input: {} }, text);
  }
});

test('explicit continue-development language maps to one bounded autonomy tick', () => {
  for (const text of [
    'continue ton développement MEL',
    'avance sur ta feuille de route',
    'reprends le programme MEL',
    'poursuis ton autonomie',
  ]) {
    assert.deepEqual(inferAutonomyControlIntent(text), { id: 'autonomy.tick', input: {} }, text);
  }
});

test('generic continue does not trigger autonomous development without a clear autonomy domain', () => {
  for (const text of ['continue', 'avance', 'reprends', 'où en es-tu ?', 'travaille là-dessus']) {
    assert.equal(inferAutonomyControlIntent(text), null, text);
  }
});

test('code integrity requests route to bounded code.integrity', () => {
  for (const text of [
    'vérifie que le code est cohérent',
    'contrôle l’intégrité du repo',
    'check github integrity',
  ]) {
    assert.deepEqual(inferCodeIntegrityIntent(text), { id: 'code.integrity', input: {} }, text);
  }
  assert.equal(inferCodeIntegrityIntent('vérifie que tout va bien'), null);
});

test('open work discovery is bounded and recognizes resume language', () => {
  assert.deepEqual(inferOpenWorkIntent('quels travaux sont encore ouverts ?'), { id: 'work.open', input: { limit: 20 } });
  assert.deepEqual(inferOpenWorkIntent('reprends les 8 jobs en attente'), { id: 'work.open', input: { limit: 8 } });
  assert.deepEqual(inferOpenWorkIntent('montre 999 tâches pending'), { id: 'work.open', input: { limit: 100 } });
  assert.equal(inferOpenWorkIntent('reprends'), null);
});

test('module proposal stays read-only while direct implementation does not', () => {
  assert.deepEqual(inferModuleProposalIntent('propose un module de mémoire'), {
    id: 'evolution.module.propose',
    input: { goal: 'propose un module de mémoire' },
  });
  assert.equal(inferModuleProposalIntent('développe un module de mémoire'), null);
  assert.equal(inferModuleProposalIntent('propose une idée générale'), null);
});

test('elliptical owner follow-ups are admitted to semantic routing when recent context is about MEL', () => {
  const context = 'Nous modifions le thème et le code de MEL sur la branche candidate. Le portrait et le bouton sont en cours de développement.';
  for (const text of [
    'fais-le',
    'continue',
    'reprends',
    'enlève ça',
    'plus doré',
    'corrige tout',
    'développe-toi',
    'où en es-tu ?',
    'peux-tu faire ça ?',
  ]) {
    assert.equal(shouldSemanticIntentCheck(text, context), true, text);
  }
});

test('context-only ellipses stay out of semantic self-routing without recent context', () => {
  for (const text of ['fais-le', 'plus doré']) {
    assert.equal(shouldSemanticIntentCheck(text, ''), false, text);
  }
});

test('explicit second-person ambiguity is admitted to semantic classification even without history', () => {
  assert.equal(shouldSemanticIntentCheck('peux-tu faire ça ?', ''), true);
});

test('specific capability development keeps evolution.enqueue priority over autonomy control', async () => {
  const request = new Request('https://mel/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'développe une compétence qui suit l’autonomie', conversation_id: 'c1' }),
  });
  const injected = await injectEvolutionPreflightCapability(request);
  const body = await injected.json();
  assert.equal(body.capability.id, 'evolution.enqueue');
});

test('autonomy continue command is injected as autonomy.tick without creating a new dev job', async () => {
  const request = new Request('https://mel/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'continue ton développement MEL' }),
  });
  const injected = await injectEvolutionPreflightCapability(request);
  const body = await injected.json();
  assert.deepEqual(body.capability, { id: 'autonomy.tick', input: {} });
});

test('new deterministic read-only routes are injected without semantic/provider calls', async () => {
  const cases = [
    ['vérifie l’intégrité du code', 'code.integrity', 'CODE_INTEGRITY'],
    ['quels travaux sont en attente ?', 'work.open', 'OPEN_WORK'],
    ['propose un module de mémoire', 'evolution.module.propose', 'MODULE_PROPOSAL'],
  ];
  for (const [text, capabilityId, intent] of cases) {
    const request = new Request('https://mel/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const body = await (await injectEvolutionPreflightCapability(request)).json();
    assert.equal(body.capability.id, capabilityId, text);
    assert.deepEqual(body.intent_routing, { mode: 'deterministic', intent, confidence: 1 }, text);
  }
});
