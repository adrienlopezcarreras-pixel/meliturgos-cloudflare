import test from 'node:test';
import assert from 'node:assert/strict';
import { injectEvolutionPreflightCapability, inferCapabilityInspectionIntent } from '../src/evolution/chat-intent.js';
import { classifySemanticOwnerIntent } from '../src/evolution/semantic-intent.js';
import { setDefaultCapabilityEnvironment } from '../src/capabilities/default-bus.js';

test('deterministic capability inspection understands natural French formulations', () => {
  const shallow = [
    'Quelles sont tes capacités réelles ?',
    'MEL, liste tes compétences actives',
    'Que sais-tu faire actuellement ?',
    'Montre-moi les outils que tu peux vraiment utiliser',
  ];
  for (const text of shallow) {
    const routed = inferCapabilityInspectionIntent(text);
    assert.equal(routed?.id, 'capability.audit', text);
    assert.equal(routed?.input?.deep, false, text);
  }

  const deep = [
    'Teste toutes tes capacités réellement',
    'Vérifie tes compétences pour de vrai',
    'Fais un audit complet de tes outils',
  ];
  for (const text of deep) {
    const routed = inferCapabilityInspectionIntent(text);
    assert.equal(routed?.id, 'capability.audit', text);
    assert.equal(routed?.input?.deep, true, text);
  }
});

test('normal chat injects capability.audit instead of generic text-only self-description', async () => {
  const request = new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Teste toutes tes capacités réellement', conversation_id: 'conv-cap-1' }),
  });
  const prepared = await injectEvolutionPreflightCapability(request);
  const body = await prepared.json();
  assert.equal(body.capability?.id, 'capability.audit');
  assert.equal(body.capability?.input?.deep, true);
  assert.equal(body.intent_routing?.intent, 'CAPABILITY_STATUS');
});

test('semantic router can classify an elliptical capability-status follow-up', async () => {
  setDefaultCapabilityEnvironment({
    AI: {
      async run() {
        return { response: JSON.stringify({ intent: 'CAPABILITY_STATUS', resolved_goal: '', confidence: 0.98 }) };
      },
    },
  });
  const result = await classifySemanticOwnerIntent({
    text: 'et lesquelles marchent vraiment ?',
    context: 'USER: Parle-moi de tes modules et de tes capacités MEL.\nMEL: Je vais distinguer ce qui existe de ce qui est prévu.',
  });
  assert.equal(result?.intent, 'CAPABILITY_STATUS');
  assert.equal(result?.resolvedGoal, '');
});
