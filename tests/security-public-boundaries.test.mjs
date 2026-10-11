import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { rejectCrossSiteMutation } from '../src/core/security.js';
import { enforcePublicRateLimit } from '../src/security/public-rate-limit.js';

test('private browser mutations reject foreign Origin and Sec-Fetch-Site cross-site', async () => {
  const foreign = rejectCrossSiteMutation(new Request('https://mel.example/api/gen2/autonomy/pause', {
    method: 'POST',
    headers: { origin: 'https://evil.example' },
  }));
  assert.ok(foreign instanceof Response);
  assert.equal(foreign.status, 403);
  assert.equal((await foreign.json()).code, 'CROSS_SITE_MUTATION_FORBIDDEN');

  const fetchSite = rejectCrossSiteMutation(new Request('https://mel.example/api/gen2/autonomy/pause', {
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site' },
  }));
  assert.ok(fetchSite instanceof Response);
  assert.equal(fetchSite.status, 403);
});

test('same-origin and server-to-server mutations remain allowed while public guest POST routes stay explicit exceptions', () => {
  assert.equal(rejectCrossSiteMutation(new Request('https://mel.example/api/gen2/autonomy/pause', {
    method: 'POST',
    headers: { origin: 'https://mel.example', 'sec-fetch-site': 'same-origin' },
  })), null);

  assert.equal(rejectCrossSiteMutation(new Request('https://mel.example/api/internal/cloudflare-api-relay/run', {
    method: 'POST',
  })), null);

  for (const path of ['/api/public/wordpress/chat','/api/public/fides/chat']) {
    assert.equal(rejectCrossSiteMutation(new Request('https://mel.example' + path, {
      method: 'POST',
      headers: { origin: 'https://another.example', 'sec-fetch-site': 'cross-site' },
    })), null);
  }
});

test('public AI limiter returns a bounded 429 with retry metadata', async () => {
  const scope = 'unit-' + crypto.randomUUID();
  const request = new Request('https://mel.example/api/public/fides/chat', {
    headers: { 'user-agent': 'mel-rate-test-' + scope },
  });
  const first = await enforcePublicRateLimit(request, {}, { scope, limit: 2, windowMs: 60_000 });
  const second = await enforcePublicRateLimit(request, {}, { scope, limit: 2, windowMs: 60_000 });
  const third = await enforcePublicRateLimit(request, {}, { scope, limit: 2, windowMs: 60_000 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(third.ok, false);
  assert.equal(third.status, 429);
  assert.equal(third.code, 'PUBLIC_RATE_LIMITED');
  assert.ok(third.retry_after_seconds >= 1);
});

test('canonical visual entry applies the cross-site guard before the app chain', async () => {
  const source = await readFile(new URL('../src/visual-final-entry.js', import.meta.url), 'utf8');
  assert.match(source, /rejectCrossSiteMutation\(request\)/);
  assert.match(source, /if \(crossSiteDenied\) return hardenResponseHeaders\(crossSiteDenied\)/);
});
