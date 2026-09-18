import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

function mockFetch(url) {
  const source = String(url).includes('duckduckgo') ? 'Duck source' : 'Google source';
  return Promise.resolve(new Response(`<!doctype html><html><head><title>${source}</title><meta name="description" content="Fresh public result"></head><body>Evidence for MEL web research.</body></html>`, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  }));
}

test('Gen2 registers web.research as a LOW-risk executable capability', () => {
  const runtime = createGen2Runtime({ env: { MEL_WEB_FETCH: mockFetch, MEL_WEB_MIN_INTERVAL_MS: 0 } });
  const row = runtime.bus.list().find(item => item.id === 'web.research');
  assert.ok(row);
  assert.equal(row.risk, 'LOW');
  assert.equal(row.health, 'HEALTHY');
});

test('web.research returns bounded sourced results with provenance through CapabilityBus', async () => {
  const runtime = createGen2Runtime({ env: { MEL_WEB_FETCH: mockFetch, MEL_WEB_MIN_INTERVAL_MS: 0 } });
  const result = await runtime.bus.execute('web.research', { query: 'MEL current information', depth: 2 }, { owner: 'test', permissions: [], requestId: 'web-test' });
  assert.equal(result.query, 'MEL current information');
  assert.equal(result.sources.length, 2);
  assert.equal(result.citations_count, 2);
  assert.ok(result.sources.every(source => source.url.startsWith('https://')));
  assert.ok(result.sources.every(source => source.provenance?.source_id));
  assert.match(result.citation, /URL:/);
});

test('web research HTTP API execution is locked to CapabilityBus', async () => {
  const source = await readFile(new URL('../src/api/research-api.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /InternetService/);
  assert.match(source, /runtime\.bus\.execute\(['"]web\.research['"]/);
});


test('web.research accepts bounded official seed URLs through CapabilityBus', async () => {
  const calls = [];
  const runtime = createGen2Runtime({ env: {
    MEL_WEB_MIN_INTERVAL_MS: 0,
    MEL_WEB_FETCH: async url => {
      calls.push(String(url));
      return new Response('<html><head><title>Official docs</title><meta name="description" content="Video generation update"></head><body>video generation</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  } });
  const result = await runtime.bus.execute('web.research', {
    query: 'official video generation update',
    depth: 2,
    seed_urls: ['https://docs.example.com/video'],
  }, { owner: 'test', permissions: [], requestId: 'seed-web-test' });
  assert.equal(result.citations_count, 1);
  assert.equal(result.sources[0].source_kind, 'OFFICIAL_SEED');
  assert.deepEqual(calls, ['https://docs.example.com/video']);
});
