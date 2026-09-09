import test from 'node:test';
import assert from 'node:assert/strict';
import InternetService from '../src/services/internet-service.js';
import { fetchWebContent, validateUrl } from '../src/devices/web-capability.js';

function mockFetch(url) {
  const title = url.includes('duckduckgo') ? 'Duck result' : 'Google result';
  return Promise.resolve(new Response(`<!doctype html><html><head><title>${title}</title><meta name="description" content="Résultat de recherche MEL"></head><body>Contenu fiable pour MEL.</body></html>`, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  }));
}

function service() {
  const instance = new InternetService({ MEL_WEB_FETCH: mockFetch });
  instance.minInterval = 0;
  return instance;
}

test('safe web fetch preserves content type, bounds content and provenance', async () => {
  const page = await fetchWebContent('source-test', 'https://example.com/test', { fetchImpl: mockFetch });
  assert.equal(page.source_id, 'source-test');
  assert.equal(page.content_type, 'text/html; charset=utf-8');
  assert.match(page.content, /Contenu fiable/);
  assert.equal(page.truncated, false);
  assert.ok(page.timestamp);
  assert.ok(Number.isFinite(page.fetch_duration_ms));
});

test('web research returns real structured sources, title, snippet, citation and per-page provenance', async () => {
  const result = await service().research('What is MEL?', null, 2);
  assert.equal(result.query, 'What is MEL?');
  assert.equal(result.sources.length, 2);
  assert.equal(result.citations_count, 2);
  assert.match(result.sources[0].content, /Contenu fiable/);
  assert.match(result.sources[0].title, /result/);
  assert.equal(result.sources[0].snippet, 'Résultat de recherche MEL');
  assert.equal(result.sources[0].provenance.content_type, 'text/html; charset=utf-8');
  assert.match(result.citation, /URL:/);
  assert.match(result.summary, /Found 2 relevant sources/);
  assert.ok(result.provenance.source_id.startsWith('web-svc-'));
});

test('web research rejects empty query', async () => {
  await assert.rejects(() => service().research('   '), /INVALID_QUERY/);
});

test('URL guard rejects private, local and dangerous schemes', async () => {
  for (const url of ['http://localhost:3000', 'https://192.168.1.1', "javascript:alert('xss')", 'file:///etc/passwd']) {
    assert.equal(validateUrl(url).valid, false, url);
    await assert.rejects(() => service().fetchPage(url));
  }
});

test('rate limiter serializes near-simultaneous requests', async () => {
  const s = service();
  s.minInterval = 40;
  s.lastFetch = Date.now();
  const start = Date.now();
  await s.ensureRateLimit();
  assert.ok(Date.now() - start >= 30);
});
