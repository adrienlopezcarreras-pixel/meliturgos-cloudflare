import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelRouter } from '../src/models/ModelRouter.js';

function registry(ids) {
  const models = ids.map(id => ({ id, provider: 'mock', capabilities: ['GENERAL'], cost: 0 }));
  return {
    modelsByCapability(cap) { return cap === 'GENERAL' ? models : []; },
    size() { return models.length; },
    list() { return models; },
  };
}

test('ModelRouter no longer hard-caps fallback attempts at two', async () => {
  const seen = [];
  const router = new ModelRouter({
    registry: registry(['m1','m2','m3','m4']),
    maxCalls: 4,
    invoke: async model => {
      seen.push(model.id);
      if (model.id !== 'm4') { const e = new Error('temporary unavailable'); e.status = 503; throw e; }
      return { response: 'fourth model worked' };
    },
  });
  const out = await router.execute({ task: 'GENERAL', messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(out.text, 'fourth model worked');
  assert.deepEqual(seen, ['m1','m2','m3','m4']);
  assert.equal(out.attempts, 4);
});

test('ModelRouter delegates parallel requests to Augmentio with provenance', async () => {
  let received;
  const augmentio = {
    async fanOut(input) {
      received = input;
      return {
        best: { text: 'synthesized', model: 'wa-1', provider: 'workers-ai', provenance: { provider: 'workers-ai', model: 'wa-1' } },
        candidates: [{ text: 'synthesized', model: 'wa-1', provider: 'workers-ai' }],
        providersAttempted: ['workers-ai:wa-1','workers-ai:wa-2','workers-ai:wa-3'],
        providerHealth: [{ id: 'workers-ai:wa-1', status: 'HEALTHY' }],
        failures: 0,
        cacheHit: false,
      };
    },
  };
  const router = new ModelRouter({ registry: registry(['legacy']), invoke: async () => 'legacy', augmentio, maxCalls: 6 });
  const out = await router.execute({ task: 'GENERAL', messages: [{ role: 'user', content: 'compare' }], parallel: true, maxCandidates: 5 }, { requestId: 'r1' });
  assert.equal(out.augmentio_used, true);
  assert.equal(out.text, 'synthesized');
  assert.equal(out.attempts, 3);
  assert.deepEqual(out.provenance, { provider: 'workers-ai', model: 'wa-1' });
  assert.equal(received.maxCandidates, 5);
  assert.deepEqual(received.input, [{ role: 'user', content: 'compare' }]);
  assert.equal(router.getStats().augmentioCalls, 1);
});

test('single-route behavior remains default when parallel is not requested', async () => {
  let augmentioCalled = false;
  const router = new ModelRouter({
    registry: registry(['legacy']),
    invoke: async () => ({ response: 'legacy path' }),
    augmentio: { async fanOut() { augmentioCalled = true; throw new Error('should not run'); } },
  });
  const out = await router.execute({ task: 'GENERAL', messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(out.text, 'legacy path');
  assert.equal(augmentioCalled, false);
});
