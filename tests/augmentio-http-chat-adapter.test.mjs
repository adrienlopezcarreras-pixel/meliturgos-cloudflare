import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpChatAdapter, parseHttpChatProviderDescriptors } from '../src/augmentio/http-chat-adapter.js';
import { createDefaultAugmentioPool } from '../src/augmentio/default-pool.js';
import { ModelRegistry } from '../src/models/ModelRegistry.js';

test('provider-neutral HTTP adapter invokes an alternate model without Cloudflare AI binding', async()=>{
  const calls=[];
  const adapter=createHttpChatAdapter({
    env:{ALT_TOKEN:'secret-test-token'},
    id:'alt:test',
    providerId:'alternate-ai',
    modelId:'model-x',
    endpoint:'https://example.invalid/v1/chat/completions',
    secretEnv:'ALT_TOKEN',
    capabilities:['GENERAL','CODE'],
    estimatedCost:0,
    costProvenance:{verified:true,addedCost:0,source:'test',authorization:{approved:true,policy:'ZERO_EURO',authority:'test',adapter_id:'alt:test',provider:'alternate-ai',model:'model-x'}},
    fetchImpl:async(url,init)=>{
      calls.push({url,init});
      return Response.json({choices:[{message:{content:'alternate ok'}}]});
    },
  });
  const result=await adapter.invoke({input:'bonjour'});
  assert.equal(result.text,'alternate ok');
  assert.equal(result.provenance.provider,'alternate-ai');
  assert.equal(calls.length,1);
  assert.match(calls[0].init.headers.authorization,/^Bearer /);
});

test('alternate provider descriptor keeps secrets by env reference instead of embedding secret value',()=>{
  const rows=parseHttpChatProviderDescriptors({
    MEL_ALT_AI_PROVIDERS_JSON:JSON.stringify([{
      id:'alt:one',provider:'alt',model:'m1',endpoint:'https://alt.example/v1/chat/completions',
      secret_env:'ALT_PROVIDER_TOKEN',capabilities:['GENERAL'],estimated_cost:0,
    }]),
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].secretEnv,'ALT_PROVIDER_TOKEN');
  assert.equal(JSON.stringify(rows).includes('secret-test-token'),false);
});

test('default pool can contain a non-Cloudflare AI provider',()=>{
  const registry=new ModelRegistry([]);
  const pool=createDefaultAugmentioPool({
    MEL_ALT_AI_PROVIDERS_JSON:JSON.stringify([{
      id:'alt:one',provider:'alt',model:'m1',endpoint:'https://alt.example/v1/chat/completions',
      capabilities:['GENERAL'],estimated_cost:0,
    }]),
  },{registry});
  assert.deepEqual(pool.list().map(x=>x.id),['alt:one']);
  assert.equal(pool.get('alt:one').providerId,'alt');
});

test('invalid optional alternate provider cannot break the core pool',()=>{
  const registry=new ModelRegistry([]);
  const pool=createDefaultAugmentioPool({
    MEL_ALT_AI_PROVIDERS_JSON:JSON.stringify([{id:'bad',provider:'alt',model:'m1',endpoint:'file:///tmp/model'}]),
  },{registry});
  assert.equal(pool.list().length,0);
});


test('legacy NinjaChat config is bridged without inventing zero-cost proof',()=>{
  const rows=parseHttpChatProviderDescriptors({
    NINJACHAT_ENDPOINT:'https://ninja.example/v1/chat/completions',
    NINJACHAT_API_KEY:'legacy-secret',
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,'ninjachat:default');
  assert.equal(rows[0].providerId,'ninjachat');
  assert.equal(rows[0].estimatedCost,null);
  assert.equal(rows[0].costProvenance,null);
  assert.equal(rows[0].lowRefusal,false);
  assert.equal(rows[0].secretEnv,'NINJACHAT_API_KEY');
});

test('legacy NinjaChat zero-cost status requires explicit verified flag and authority',()=>{
  const rows=parseHttpChatProviderDescriptors({
    NINJACHAT_ENDPOINT:'https://ninja.example/v1/chat/completions',
    NINJACHAT_TOKEN:'legacy-secret',
    MEL_NINJACHAT_ZERO_COST_VERIFIED:'1',
    MEL_NINJACHAT_ZERO_COST_AUTHORITY:'owner',
    MEL_NINJACHAT_LOW_REFUSAL_CANDIDATE:'1',
    MEL_NINJACHAT_POLICY_PROFILE:'LOW_REFUSAL',
  });
  assert.equal(rows[0].estimatedCost,0);
  assert.equal(rows[0].costProvenance.verified,true);
  assert.equal(rows[0].costProvenance.authorization.approved,true);
  assert.equal(rows[0].lowRefusal,true);
  assert.equal(rows[0].policyProfile,'LOW_REFUSAL');
});

test('explicit alternate provider config wins over legacy NinjaChat duplicate',()=>{
  const rows=parseHttpChatProviderDescriptors({
    MEL_ALT_AI_PROVIDERS_JSON:JSON.stringify([{
      id:'ninjachat:custom',
      provider:'ninjachat',
      model:'custom',
      endpoint:'https://custom.example/v1/chat/completions',
      secret_env:'CUSTOM_NINJA_KEY',
    }]),
    NINJACHAT_ENDPOINT:'https://legacy.example/v1/chat/completions',
    NINJACHAT_API_KEY:'legacy-secret',
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,'ninjachat:custom');
});

test('remote plaintext HTTP cannot receive model prompts or bearer credentials', () => {
  for (const endpoint of [
    'http://public.example/v1/chat/completions',
    'http://192.0.2.1/api/chat',
    'http://localhost.evil.example/api',
    'http://127.0.0.2/api',
  ]) {
    assert.throws(() => createHttpChatAdapter({
      id: 'remote-plaintext', providerId: 'external', modelId: 'model',
      endpoint,
      env: { SECRET_TOKEN: 'private-token' }, secretEnv: 'SECRET_TOKEN',
    }), error => error?.message === 'HTTP_CHAT_ENDPOINT_TLS_REQUIRED', endpoint);
    assert.throws(() => createHttpChatAdapter({
      id: 'remote-plaintext', providerId: 'external', modelId: 'model', endpoint,
    }), error => error?.message === 'HTTP_CHAT_ENDPOINT_TLS_REQUIRED', endpoint);
  }
});

test('loopback AI can use plaintext only without configured credentials', async () => {
  for (const endpoint of ['http://localhost:11434/api/chat',
    'http://127.0.0.1:11434/api/chat', 'http://[::1]:11434/api/chat']) {
    let calls = 0;
    const adapter = createHttpChatAdapter({
      id: 'local-ollama', providerId: 'local', modelId: 'local-model',
      endpoint, fetchImpl: async () => {
        calls += 1;
        return Response.json({choices:[{message:{content:'local output'}}]});
      },
    });
    const result = await adapter.invoke({input:'local input'});
    assert.equal(result.text, 'local output');
    assert.equal(calls, 1);
    assert.throws(() => createHttpChatAdapter({
      id: 'insecure-local-secret', providerId: 'local', modelId: 'local-model',
      endpoint, secretEnv: 'OPTIONAL_TOKEN',
    }), error => error?.message === 'HTTP_CHAT_ENDPOINT_TLS_REQUIRED');
  }
});

test('provider URL rejects embedded Basic Auth and fragments even on HTTPS', () => {
  for (const endpoint of [
    'https://username:password@example.invalid/v1/chat',
    'https://example.invalid/v1/chat#private',
    'file:///tmp/private-model',
  ]) {
    assert.throws(() => createHttpChatAdapter({
      id:'invalid-endpoint', providerId:'external', modelId:'model', endpoint,
    }), error => error?.message === 'HTTP_CHAT_ENDPOINT_INVALID');
  }
});
