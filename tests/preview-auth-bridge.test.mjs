import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgePreviewBasicAuth } from '../src/preview-auth-entry.js';

const verifierUrl = 'https://meliturgos.adrien-lopezcarreras.workers.dev/sw.js';
const previewUrl = 'https://meliturgos-preview.adrien-lopezcarreras.workers.dev/';
const basic = 'Basic ' + btoa('adrien:mot-de-passe-habituel');

function previewEnv(extra = {}) {
  return {
    MEL_RUNTIME_ENV: 'preview',
    MELITURGOS_PASSWORD: 'preview-local-secret',
    MEL_PREVIEW_AUTH_VERIFY_URL: verifierUrl,
    ...extra,
  };
}

test('preview accepts a production-validated Basic header and rewrites it to the local Bearer secret', async () => {
  const request = new Request(previewUrl, { headers: { authorization: basic } });
  const calls = [];
  const bridged = await bridgePreviewBasicAuth(request, previewEnv(), async (url, init) => {
    calls.push({ url, init });
    return new Response('ok', { status: 200 });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, verifierUrl);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.authorization, basic);
  assert.equal(bridged.headers.get('authorization'), 'Bearer preview-local-secret');
});

test('preview keeps rejected Basic credentials rejected locally', async () => {
  const request = new Request(previewUrl, { headers: { authorization: basic } });
  const bridged = await bridgePreviewBasicAuth(request, previewEnv(), async () => new Response('no', { status: 401 }));
  assert.equal(bridged.headers.get('authorization'), basic);
});

test('preview never forwards its internal Bearer token to the production verifier', async () => {
  const request = new Request(previewUrl, { headers: { authorization: 'Bearer preview-local-secret' } });
  let calls = 0;
  const bridged = await bridgePreviewBasicAuth(request, previewEnv(), async () => {
    calls += 1;
    return new Response('ok');
  });
  assert.equal(calls, 0);
  assert.equal(bridged.headers.get('authorization'), 'Bearer preview-local-secret');
});

test('auth bridge is inert outside preview', async () => {
  const request = new Request('https://meliturgos.adrien-lopezcarreras.workers.dev/', { headers: { authorization: basic } });
  let calls = 0;
  const bridged = await bridgePreviewBasicAuth(request, {
    ...previewEnv(),
    MEL_RUNTIME_ENV: 'production',
  }, async () => {
    calls += 1;
    return new Response('ok');
  });
  assert.equal(calls, 0);
  assert.strictEqual(bridged, request);
});

test('auth bridge preserves a request body after successful verification', async () => {
  const request = new Request(previewUrl + 'api/chat', {
    method: 'POST',
    headers: { authorization: basic, 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'bonjour MEL' }),
  });
  const bridged = await bridgePreviewBasicAuth(request, previewEnv(), async () => new Response('ok', { status: 200 }));
  assert.equal(bridged.headers.get('authorization'), 'Bearer preview-local-secret');
  assert.deepEqual(await bridged.json(), { text: 'bonjour MEL' });
});

test('auth bridge refuses insecure or recursive verifier targets', async () => {
  for (const target of ['http://example.test/', previewUrl]) {
    const request = new Request(previewUrl, { headers: { authorization: basic } });
    let calls = 0;
    const bridged = await bridgePreviewBasicAuth(request, previewEnv({ MEL_PREVIEW_AUTH_VERIFY_URL: target }), async () => {
      calls += 1;
      return new Response('ok');
    });
    assert.equal(calls, 0);
    assert.equal(bridged.headers.get('authorization'), basic);
  }
});
