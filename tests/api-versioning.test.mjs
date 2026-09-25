import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  API_CURRENT_VERSION,
  apiVersionRegistry,
  resolveApiVersionRequest,
} from '../src/api/api-versioning.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

function env() {
  return { DB: sqliteD1(), MELITURGOS_USER:'test', MELITURGOS_PASSWORD:'test-only' };
}

function auth() {
  return { authorization:`Basic ${Buffer.from('test:test-only').toString('base64')}` };
}

test('GEN2-51 registry exposes one stable v1 facade without Android/MINI/device routes', () => {
  const registry=apiVersionRegistry();
  assert.equal(registry.current_version,'v1');
  assert.deepEqual(registry.supported_versions,['v1']);
  assert.equal(registry.validation.ok,true);
  assert.deepEqual(registry.validation.issues,[]);
  assert.ok(registry.routes.some(route=>route.canonical==='/api/v1/roadmap'));
  assert.ok(registry.routes.some(route=>route.canonical==='/api/v1/conversations'));
  const serialized=JSON.stringify(registry);
  assert.doesNotMatch(serialized,/\/api\/android\//);
  assert.doesNotMatch(serialized,/\/api\/device\//);
  assert.doesNotMatch(serialized,/\/api\/android\//);
  assert.doesNotMatch(serialized,/\/api\/computer\//);
  assert.doesNotMatch(serialized,/\/api\/voice\//);
  assert.doesNotMatch(serialized,/\/api\/files\//);
  assert.doesNotMatch(serialized,/mini/i);
});

test('GEN2-51 resolver rewrites canonical v1 core paths and marks legacy aliases', () => {
  const canonical=resolveApiVersionRequest(new Request('http://localhost/api/v1/roadmap'),{handler:'router'});
  assert.equal(canonical.status,'canonical');
  assert.equal(new URL(canonical.request.url).pathname,'/api/gen2/roadmap');

  const nested=resolveApiVersionRequest(new Request('http://localhost/api/v1/conversations/abc/messages'),{handler:'router'});
  assert.equal(nested.status,'canonical');
  assert.equal(new URL(nested.request.url).pathname,'/api/conversations/abc/messages');

  const legacy=resolveApiVersionRequest(new Request('http://localhost/api/gen2/roadmap'),{handler:'router'});
  assert.equal(legacy.status,'legacy');
  assert.equal(legacy.canonical_path,'/api/v1/roadmap');

  const indexOwned=resolveApiVersionRequest(new Request('http://localhost/api/v1/work/health'),{handler:'index'});
  assert.equal(indexOwned.status,'canonical');
  assert.equal(new URL(indexOwned.request.url).pathname,'/api/work/health');
  assert.equal(resolveApiVersionRequest(new Request('http://localhost/api/v1/work/health'),{handler:'router'}).matched,false);
});

test('GEN2-51 /api/v1/version exposes the API contract and legacy alias is deprecated', async () => {
  const e=env();
  try {
    const current=await worker.fetch(new Request('http://localhost/api/v1/version',{headers:auth()}),e);
    assert.equal(current.status,200);
    assert.equal(current.headers.get('x-mel-api-version'),API_CURRENT_VERSION);
    assert.equal(current.headers.get('x-mel-api-route-status'),'canonical');
    const payload=await current.json();
    assert.equal(payload.current_version,'v1');

    const legacy=await worker.fetch(new Request('http://localhost/api/gen2/version',{headers:auth()}),e);
    assert.equal(legacy.status,200);
    assert.equal(legacy.headers.get('deprecation'),'true');
    assert.match(legacy.headers.get('link')||'',/<\/api\/v1\/version>; rel="successor-version"/);
  } finally { e.DB.close(); }
});

test('GEN2-51 v1 roadmap is equivalent to gen2 alias and legacy response advertises successor', async () => {
  const e=env();
  try {
    const canonical=await worker.fetch(new Request('http://localhost/api/v1/roadmap',{headers:auth()}),e);
    const legacy=await worker.fetch(new Request('http://localhost/api/gen2/roadmap',{headers:auth()}),e);
    assert.equal(canonical.status,200);
    assert.equal(legacy.status,200);
    assert.equal(canonical.headers.get('x-mel-api-route-status'),'canonical');
    assert.equal(canonical.headers.get('x-mel-api-canonical-path'),'/api/v1/roadmap');
    assert.equal(legacy.headers.get('x-mel-api-route-status'),'legacy');
    assert.equal(legacy.headers.get('deprecation'),'true');
    const canonicalPayload=await canonical.json();
    const legacyPayload=await legacy.json();
    assert.deepEqual(canonicalPayload.source,legacyPayload.source);
    assert.deepEqual(canonicalPayload.validation,legacyPayload.validation);
    assert.deepEqual(canonicalPayload.phases,legacyPayload.phases);
    assert.deepEqual(
      {...canonicalPayload.summary,generated_at:null},
      {...legacyPayload.summary,generated_at:null}
    );
  } finally { e.DB.close(); }
});

test('GEN2-51 v1 conversations use the existing canonical ConversationService route', async () => {
  const e=env();
  try {
    const created=await worker.fetch(new Request('http://localhost/api/v1/conversations',{
      method:'POST',
      headers:{...auth(),'content-type':'application/json'},
      body:JSON.stringify({title:'versioned'}),
    }),e);
    assert.equal(created.status,201);
    assert.equal(created.headers.get('x-mel-api-route-status'),'canonical');
    const conversation=await created.json();

    const added=await worker.fetch(new Request(`http://localhost/api/v1/conversations/${conversation.id}/messages`,{
      method:'POST',
      headers:{...auth(),'content-type':'application/json'},
      body:JSON.stringify({content:'hello v1'}),
    }),e);
    assert.equal(added.status,201);

    const history=await worker.fetch(new Request(`http://localhost/api/v1/conversations/${conversation.id}/messages`,{headers:auth()}),e);
    assert.equal(history.status,200);
    assert.equal((await history.json()).messages.length,1);
  } finally { e.DB.close(); }
});

test('GEN2-51 unsupported semantic versions fail explicitly before routing', async () => {
  const e=env();
  try {
    const response=await worker.fetch(new Request('http://localhost/api/v9/roadmap',{headers:auth()}),e);
    assert.equal(response.status,400);
    const payload=await response.json();
    assert.equal(payload.code,'API_VERSION_UNSUPPORTED');
    assert.deepEqual(payload.supported_versions,['v1']);
  } finally { e.DB.close(); }
});


test('GEN2-51 versioning also covers MEL index-owned Work routes without companion changes', async () => {
  const e=env();
  try {
    const canonical=await worker.fetch(new Request('http://localhost/api/v1/work/health',{headers:auth()}),e);
    assert.equal(canonical.status,200);
    assert.equal(canonical.headers.get('x-mel-api-version'),'v1');
    assert.equal(canonical.headers.get('x-mel-api-route-status'),'canonical');
    const body=await canonical.json();
    assert.equal(body.mode,'preflight-only');

    const legacy=await worker.fetch(new Request('http://localhost/api/work/health',{headers:auth()}),e);
    assert.equal(legacy.status,200);
    assert.equal(legacy.headers.get('x-mel-api-route-status'),'legacy');
    assert.equal(legacy.headers.get('deprecation'),'true');
    assert.match(legacy.headers.get('link')||'',/<\/api\/v1\/work\/health>; rel="successor-version"/);
  } finally { e.DB.close(); }
});


test('GEN2-51 versioned routes return explicit 405 with Allow before handler dispatch', async () => {
  const e=env();
  try {
    const response=await worker.fetch(new Request('http://localhost/api/v1/chat',{method:'GET',headers:auth()}),e);
    assert.equal(response.status,405);
    assert.equal(response.headers.get('allow'),'POST');
    assert.equal(response.headers.get('x-mel-api-route-id'),'chat');
    assert.equal(response.headers.get('x-mel-api-route-status'),'canonical');
    assert.equal((await response.json()).code,'API_METHOD_NOT_ALLOWED');
  } finally { e.DB.close(); }
});


test('GEN2-51 canonical v1 keeps owner-auth parity with legacy routes', async () => {
  const e=env();
  try {
    const canonical=await worker.fetch(new Request('http://localhost/api/v1/roadmap'),e);
    const legacy=await worker.fetch(new Request('http://localhost/api/gen2/roadmap'),e);
    assert.equal(canonical.status,401);
    assert.equal(legacy.status,401);
  } finally { e.DB.close(); }
});

test('GEN2-51 rewrite preserves query parameters for core GET routes', async () => {
  const canonical=resolveApiVersionRequest(
    new Request('http://localhost/api/v1/capabilities?refresh=1&x=test'),
    {handler:'router'}
  );
  const rewritten=new URL(canonical.request.url);
  assert.equal(rewritten.pathname,'/api/gen2/capabilities');
  assert.equal(rewritten.searchParams.get('refresh'),'1');
  assert.equal(rewritten.searchParams.get('x'),'test');
});

test('GEN2-51 rewrite preserves POST method, headers and JSON body', async () => {
  const original=new Request('http://localhost/api/v1/capabilities/execute',{
    method:'POST',
    headers:{'content-type':'application/json','x-test':'kept'},
    body:JSON.stringify({id:'echo',input:{value:'hello'}}),
  });
  const resolved=resolveApiVersionRequest(original,{handler:'router'});
  assert.equal(resolved.request.method,'POST');
  assert.equal(resolved.request.headers.get('x-test'),'kept');
  assert.deepEqual(await resolved.request.json(),{id:'echo',input:{value:'hello'}});
});
