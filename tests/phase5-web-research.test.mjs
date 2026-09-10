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

function service(fetchImpl = mockFetch) {
  const instance = new InternetService({ MEL_WEB_FETCH: fetchImpl });
  instance.minInterval = 0;
  return instance;
}

test('safe web fetch preserves content type, bounds content and provenance', async () => {
  const page = await fetchWebContent('source-test', 'https://example.com/test', { fetchImpl: mockFetch });
  assert.equal(page.source_id, 'source-test');
  assert.equal(page.content_type, 'text/html; charset=utf-8');
  assert.match(page.content, /Contenu fiable/);
  assert.equal(page.truncated, false);
  assert.equal(page.redirect_count, 0);
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
  assert.equal(result.discovery.direct_sources_loaded, 0);
});

test('depth two follows a bounded set of actual public result pages and cites those instead of search indexes', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    if (String(url).startsWith('https://www.google.com/search?')) {
      return new Response(`<!doctype html><html><head><title>Google</title></head><body>
        <a href="/url?q=https%3A%2F%2Fexample.com%2Fofficial&sa=U">official</a>
        <a href="http://127.0.0.1/internal">private</a>
      </body></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (String(url).startsWith('https://duckduckgo.com/html/?q=')) {
      return new Response(`<!doctype html><html><head><title>DuckDuckGo</title></head><body>
        <a href="/l/?uddg=https%3A%2F%2Fdocs.example.org%2Fupdate">docs</a>
      </body></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (String(url) === 'https://example.com/official') {
      return new Response('<html><head><title>Official source</title><meta name="description" content="Primary public evidence"></head><body>verified</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (String(url) === 'https://docs.example.org/update') {
      return new Response('<html><head><title>Documentation update</title><meta name="description" content="Secondary public evidence"></head><body>documented</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  };

  const result = await service(fetchImpl).research('current evidence', null, 2);
  assert.equal(result.sources.length, 2);
  assert.deepEqual(result.sources.map(source => source.source_kind), ['DIRECT_SOURCE', 'DIRECT_SOURCE']);
  assert.deepEqual(result.sources.map(source => source.url), ['https://example.com/official', 'https://docs.example.org/update']);
  assert.equal(result.discovery.candidate_urls_found, 2);
  assert.equal(result.discovery.direct_sources_loaded, 2);
  assert.equal(result.discovery.search_indexes.length, 2);
  assert.equal(calls.length, 4, 'two discovery pages plus at most two followed sources at depth two');
  assert.doesNotMatch(result.citation, /google\.com\/search|duckduckgo\.com\/html/i);
  assert.match(result.citation, /example\.com\/official/);
  assert.match(result.citation, /docs\.example\.org\/update/);
  assert.ok(!calls.some(url => /127\.0\.0\.1/.test(url)), 'private search result must never be fetched');
});

test('result-link extraction unwraps search redirects, de-duplicates and refuses private or search-engine links', () => {
  const s = service();
  const html = `
    <a href="/url?q=https%3A%2F%2Fexample.com%2Fa">a</a>
    <a href="https://example.com/a">duplicate</a>
    <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fb">b</a>
    <a href="https://www.google.com/preferences">engine</a>
    <a href="http://10.0.0.4/secret">private</a>`;
  assert.deepEqual(s.extractCandidateLinks(html, 'https://www.google.com/search?q=test'), [
    'https://example.com/a',
    'https://example.org/b',
  ]);
});

test('web research rejects empty query', async () => {
  await assert.rejects(() => service().research('   '), /INVALID_QUERY/);
});

test('URL guard rejects local, metadata, private, reserved, credentialed and dangerous destinations without blocking public 172 space', async () => {
  const blocked = [
    'http://localhost:3000',
    'https://192.168.1.1',
    'http://169.254.169.254/latest/meta-data',
    'http://100.64.0.1',
    'http://172.16.0.1',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://metadata.google.internal/',
    'https://user:password@example.com/',
    "javascript:alert('xss')",
    'file:///etc/passwd',
  ];
  for (const url of blocked) {
    assert.equal(validateUrl(url).valid, false, url);
    await assert.rejects(() => service().fetchPage(url));
  }
  assert.equal(validateUrl('https://172.40.1.1/').valid, true, 'public 172 addresses outside 172.16/12 must remain usable');
});

test('manual redirect validation blocks a public URL from bouncing MEL into a private metadata address', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    if (String(url) === 'https://example.com/start') {
      return new Response('', { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
    }
    throw new Error(`private redirect should never be fetched: ${url}`);
  };
  await assert.rejects(
    () => fetchWebContent('redirect-test', 'https://example.com/start', { fetchImpl }),
    /Private hostname not allowed/,
  );
  assert.deepEqual(calls, ['https://example.com/start']);
});

test('public redirects are followed only after validation and final provenance records the resolved URL', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    if (String(url) === 'https://example.com/start') {
      return new Response('', { status: 302, headers: { location: '/final' } });
    }
    if (String(url) === 'https://example.com/final') {
      return new Response('<html><head><title>Final</title></head><body>ok</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } });
  };
  const page = await fetchWebContent('redirect-public', 'https://example.com/start', { fetchImpl });
  assert.equal(page.url, 'https://example.com/final');
  assert.equal(page.redirect_count, 1);
  assert.deepEqual(calls, ['https://example.com/start', 'https://example.com/final']);
});

test('rate limiter serializes near-simultaneous requests', async () => {
  const s = service();
  s.minInterval = 40;
  s.lastFetch = Date.now();
  const start = Date.now();
  await s.ensureRateLimit();
  assert.ok(Date.now() - start >= 30);
});
