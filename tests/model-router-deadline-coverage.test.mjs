import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelRouter } from '../src/models/ModelRouter.js';

const messages = [{ role: 'user', content: 'Réponds à la question' }];

function modelRegistry() {
  const model = { id: 'test-model', provider: 'test', capabilities: ['GENERAL'], cost: 0 };
  return {
    modelsByCapability: name => name === 'GENERAL' ? [model] : [],
    size: () => 1,
    list: () => [model],
  };
}

function deadlineError(error) {
  assert.ok(error, 'timeout must reject');
  assert.match(String(error.reason || error.code || error.message || ''), /CHAT_DEADLINE_EXCEEDED/);
  return true;
}

test('parallel Augmentio cannot outlive the shared chat deadline', async () => {
  let fanOutCalls = 0;
  const router = new ModelRouter({
    registry: modelRegistry(),
    deadlineAt: Date.now() + 35,
    timeoutMs: 2000,
    invoke: async () => ({ response: 'unused' }),
    augmentio: { fanOut: () => { fanOutCalls++; return new Promise(() => {}); } },
  });
  const started = Date.now();
  await assert.rejects(router.execute({task:'GENERAL',messages,parallel:true}), deadlineError);
  assert.equal(fanOutCalls, 1);
  assert.ok(Date.now() - started < 1000, 'must fail within request deadline, not per-provider timeout');
});

test('parallel Augmentio with an expired deadline fails closed without invoking the provider', async () => {
  let fanOutCalls = 0;
  const router = new ModelRouter({
    registry: modelRegistry(),
    deadlineAt: Date.now() - 1000,
    invoke: async () => ({ response: 'unused' }),
    augmentio: { fanOut: () => { fanOutCalls++; return new Promise(() => {}); } },
  });
  await assert.rejects(router.execute({task:'GENERAL',messages,parallel:true}), deadlineError);
  assert.equal(fanOutCalls, 0);
});

test('a hung final fallback cannot outlive the shared chat deadline', async () => {
  let fallbackCalls = 0;
  const router = new ModelRouter({
    registry: modelRegistry(),
    deadlineAt: Date.now() + 60,
    timeoutMs: 2000,
    invoke: async () => { const e = Error('provider_unavailable'); e.reason = 'provider_unavailable'; throw e; },
    finalFallback: () => { fallbackCalls++; return new Promise(() => {}); },
  });
  const started = Date.now();
  await assert.rejects(router.execute({task:'GENERAL',messages}), deadlineError);
  assert.equal(fallbackCalls, 1);
  assert.ok(Date.now() - started < 1000);
});

test('successful parallel and final fallback requests retain their normal response formats', async () => {
  const augmented = new ModelRouter({
    registry: modelRegistry(), deadlineAt: Date.now() + 3000,
    invoke: async () => ({ response: 'unused' }),
    augmentio: { fanOut: async () => ({
      best: { text:'Parallel OK', model:'best-model', provider:'test' },
      providersAttempted: ['test:best-model'], failures:0,
    }) },
  });
  const parallel = await augmented.execute({task:'GENERAL',messages,parallel:true});
  assert.equal(parallel.text, 'Parallel OK');
  assert.equal(parallel.augmentio_used,true);

  const fallback = new ModelRouter({
    registry:modelRegistry(), deadlineAt:Date.now()+3000,
    invoke:async () => { throw Object.assign(Error('provider_unavailable'),{reason:'provider_unavailable'}); },
    finalFallback:async () => ({response:'Fallback OK',model:'final-model'}),
  });
  const result = await fallback.execute({task:'GENERAL',messages});
  assert.equal(result.text,'Fallback OK');
  assert.equal(result.ninjachat_used,true);
});

test('parallel Augmentio remains subject to per-provider timeout without global deadline', async () => {
  const router = new ModelRouter({
    registry:modelRegistry(), timeoutMs:25,
    invoke:async () => ({response:'unused'}),
    augmentio:{fanOut:()=>new Promise(()=>{})},
  });
  await assert.rejects(router.execute({task:'GENERAL',messages,parallel:true}), error => {
    assert.match(String(error.reason || error.code || error.message), /timeout/i);
    return true;
  });
});
