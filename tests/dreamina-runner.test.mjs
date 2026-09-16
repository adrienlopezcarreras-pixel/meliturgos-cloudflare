import test from 'node:test';
import assert from 'node:assert/strict';
import { createDreaminaRunner, createInMemoryArtifactStore } from '../src/multimodal/dreamina-runner.js';
import { providerCapability } from '../src/multimodal/provider-contract.js';

function provider({ id, kinds = ['IMAGE'], paid = false, enabled = true, cost = 0, generate }) {
  return { id, capability: () => providerCapability({ id, kinds, paid, enabled }), estimateCostUsd: async () => cost, generate };
}
const allowAll = { isAllowed: async () => true };

test('routes image video and avatar providers', async () => {
  for (const kind of ['IMAGE', 'VIDEO', 'AVATAR']) {
    const runner = createDreaminaRunner({ providers: [provider({ id: `p-${kind}`, kinds: [kind], generate: async () => ({ outputs: [{ url: `artifact-${kind}` }] }) })], authorization: allowAll });
    const result = await runner.generate({ kind, prompt: 'hello' });
    assert.equal(result.kind, kind);
    assert.equal(result.provider, `p-${kind}`);
    assert.equal(result.artifacts.length, 1);
  }
});

test('authorization fails closed', async () => {
  let called = 0;
  const candidate = provider({ id: 'p', generate: async () => { called += 1; return { outputs: [{ url: 'artifact' }] }; } });
  const denied = createDreaminaRunner({ providers: [candidate], authorization: { isAllowed: async () => false } });
  await assert.rejects(() => denied.generate({ prompt: 'x' }), /MULTIMODAL_NO_PROVIDER/);
  assert.equal(called, 0);
  const broken = createDreaminaRunner({ providers: [candidate], authorization: { isAllowed: async () => { throw new Error('policy unavailable'); } } });
  await assert.rejects(() => broken.generate({ prompt: 'x' }), /authorization_error/);
  assert.equal(called, 0);
});

test('zero-cost guard requires explicit paid approval and budget', async () => {
  let calls = 0;
  const paid = provider({ id: 'paid', paid: true, cost: 0.01, generate: async () => { calls += 1; return { outputs: [{ url: 'artifact' }] }; } });
  const runner = createDreaminaRunner({ providers: [paid], authorization: allowAll });
  await assert.rejects(() => runner.generate({ prompt: 'x', approvedPaidCall: true }), /cost_guard/);
  assert.equal(calls, 0);
  await assert.rejects(() => runner.generate({ prompt: 'x' }, { maxCostUsd: 1 }), /cost_guard/);
  assert.equal(calls, 0);
  const result = await runner.generate({ prompt: 'x', approvedPaidCall: true }, { maxCostUsd: 1 });
  assert.equal(result.provider, 'paid');
  assert.equal(calls, 1);
});

test('falls back after quota failure and recovers stored artifact', async () => {
  const first = provider({ id: 'first', generate: async () => { const error = new Error('quota exceeded'); error.status = 429; throw error; } });
  const second = provider({ id: 'second', generate: async () => ({ model: 'm2', outputs: [{ url: 'artifact-ok' }] }) });
  const store = createInMemoryArtifactStore();
  const runner = createDreaminaRunner({ providers: [first, second], authorization: allowAll, artifactStore: store });
  const result = await runner.generate({ prompt: 'x' });
  assert.equal(result.provider, 'second');
  assert.equal(result.attempts[0].provider, 'first');
  assert.equal(result.attempts[0].status, 'failed');
  const recovered = await runner.recoverArtifact(result.artifacts[0].id);
  assert.equal(recovered.output.url, 'artifact-ok');
  assert.equal(recovered.model, 'm2');
});
