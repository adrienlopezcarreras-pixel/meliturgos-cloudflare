import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySemanticOwnerIntent } from '../src/evolution/semantic-intent.js';
import { setDefaultCapabilityEnvironment } from '../src/capabilities/default-bus.js';

test('ordinary chat is rejected by the semantic gate without invoking a provider', async () => {
  let calls = 0;
  setDefaultCapabilityEnvironment({
    AI: {
      async run() {
        calls += 1;
        throw new Error('provider should not be invoked');
      },
    },
  });

  const result = await classifySemanticOwnerIntent({
    text: 'Explique-moi la photosynthèse simplement.',
    context: '',
  });

  assert.equal(result, null);
  assert.equal(calls, 0);
});

test('low-confidence semantic development classification fails closed', async () => {
  setDefaultCapabilityEnvironment({
    AI: {
      async run() {
        return { response: JSON.stringify({
          intent: 'DEVELOPMENT_REQUEST',
          resolved_goal: 'Modifier le code de MEL.',
          resolved_query: '',
          confidence: 0.71,
        }) };
      },
    },
  });

  const result = await classifySemanticOwnerIntent({
    text: 'fais-le',
    context: 'USER: Nous parlons du code et de l’interface de MEL.',
  });
  assert.equal(result, null);
});

test('malformed or unavailable semantic provider responses fail closed', async () => {
  for (const behavior of ['malformed', 'throw']) {
    setDefaultCapabilityEnvironment({
      AI: {
        async run() {
          if (behavior === 'throw') throw new Error('transient provider failure');
          return { response: 'not-json' };
        },
      },
    });

    const result = await classifySemanticOwnerIntent({
      text: 'plus doré',
      context: 'USER: Modifie le thème de MEL et garde la lisibilité.',
    });
    assert.equal(result, null, behavior);
  }
});
