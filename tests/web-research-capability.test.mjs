import test from 'node:test';
import assert from 'node:assert/strict';
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
