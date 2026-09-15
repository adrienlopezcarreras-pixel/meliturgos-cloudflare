import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { createMcpCapabilityAdapter, MCP_MODERN_VERSION } from '../../src/mcp/capability-adapter.js';

const MODERN_META = {
  'io.modelcontextprotocol/protocolVersion': MCP_MODERN_VERSION,
  'io.modelcontextprotocol/clientInfo': { name: 'test-client', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

function makeFixture({ maxToolsPerPage = 100 } = {}) {
  const events = [];
  const bus = new CapabilityBus({ audit: async event => events.push(event) });
  bus.discover({
    id: 'echo', name: 'Echo', category: 'tool', version: '1.0.0', provider: 'test', description: 'Echo object input',
    input_schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
    output_schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
    risk: 'LOW', permissions: ['echo.use'], health: 'HEALTHY', enabled: true,
  }, async input => ({ value: input.value }));
  bus.discover({
    id: 'scalar', name: 'Scalar', category: 'tool', version: '1.0.0', provider: 'test', description: 'Accept scalar capability input',
    input_schema: { type: 'string' }, output_schema: { type: 'string' }, risk: 'LOW', permissions: ['echo.use'], health: 'HEALTHY', enabled: true,
  }, async input => input.toUpperCase());
  bus.discover({
    id: 'disabled', name: 'Disabled', category: 'tool', version: '1.0.0', provider: 'test', description: 'Unavailable',
    input_schema: { type: 'object' }, output_schema: { type: 'object' }, risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: false,
  }, async input => input);

  const adapter = createMcpCapabilityAdapter({
    bus,
    serverInfo: { name: 'mel-test', version: '1.0.0' },
    listTtlMs: 2500,
    maxToolsPerPage,
  });
  return { bus, adapter, events };
}

const context = { owner: 'mcp-test', permissions: ['echo.use'] };

test('MCP modern discovery advertises stateless 2026 revision and tool capability', async () => {
  const { adapter } = makeFixture();
  const response = await adapter.handle({ jsonrpc: '2.0', id: 'd1', method: 'server/discover', params: { _meta: MODERN_META } }, context);
  assert.equal(response.result.resultType, 'complete');
  assert.ok(response.result.supportedVersions.includes('2026-07-28'));
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
  assert.deepEqual(response.result._meta['io.modelcontextprotocol/serverInfo'], { name: 'mel-test', version: '1.0.0' });
  assert.equal(response.result.ttlMs, 2500);
  assert.equal(response.result.cacheScope, 'private');
});

test('MCP legacy initialize negotiates handshake-era compatibility', async () => {
  const { adapter } = makeFixture();
  const response = await adapter.handle({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'legacy', version: '1' } },
  }, context);
  assert.equal(response.result.protocolVersion, '2025-11-25');
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
  assert.deepEqual(response.result.serverInfo, { name: 'mel-test', version: '1.0.0' });
  assert.equal(response.result.resultType, undefined);
});

test('tools/list is deterministic, authorization-aware and wraps scalar MEL inputs', async () => {
  const { adapter } = makeFixture();
  const response = await adapter.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: MODERN_META } }, context);
  assert.deepEqual(response.result.tools.map(tool => tool.name), ['echo', 'scalar']);
  assert.equal(response.result.tools.some(tool => tool.name === 'disabled'), false);
  const scalar = response.result.tools.find(tool => tool.name === 'scalar');
  assert.equal(scalar.inputSchema.type, 'object');
  assert.deepEqual(scalar.inputSchema.required, ['input']);
  assert.equal(scalar.inputSchema.properties.input.type, 'string');

  const hidden = await adapter.handle({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} }, { owner: 'no-perms', permissions: [] });
  assert.deepEqual(hidden.result.tools, []);
});

test('tools/list supports bounded pagination and rejects invalid cursors', async () => {
  const { adapter } = makeFixture({ maxToolsPerPage: 1 });
  const first = await adapter.handle({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} }, context);
  assert.equal(first.result.tools.length, 1);
  assert.equal(first.result.nextCursor, 'mel:1');
  const second = await adapter.handle({ jsonrpc: '2.0', id: 5, method: 'tools/list', params: { cursor: first.result.nextCursor } }, context);
  assert.equal(second.result.tools.length, 1);
  assert.equal(second.result.nextCursor, undefined);
  const invalid = await adapter.handle({ jsonrpc: '2.0', id: 6, method: 'tools/list', params: { cursor: 'bad' } }, context);
  assert.equal(invalid.error.code, -32602);
});

test('tools/call delegates to CapabilityBus and emits modern structured output', async () => {
  const { adapter, events } = makeFixture();
  const response = await adapter.handle({
    jsonrpc: '2.0', id: 7, method: 'tools/call',
    params: { name: 'echo', arguments: { value: 'ok' }, _meta: MODERN_META },
  }, context);
  assert.equal(response.result.resultType, 'complete');
  assert.deepEqual(response.result.structuredContent, { value: 'ok' });
  assert.equal(response.result.isError, false);
  assert.deepEqual(events.map(event => event.status), ['STARTED', 'SUCCEEDED']);
});

test('tools/call unwraps scalar capability input and legacy result stays compatible', async () => {
  const { adapter } = makeFixture();
  const response = await adapter.handle({
    jsonrpc: '2.0', id: 8, method: 'tools/call',
    params: { name: 'scalar', arguments: { input: 'hello' } },
  }, context);
  assert.equal(response.result.content[0].text, '"HELLO"');
  assert.equal(response.result.structuredContent, undefined);
  assert.equal(response.result.resultType, undefined);
});

test('CapabilityBus validation failures become model-visible tool errors without leaking exception text', async () => {
  const { adapter } = makeFixture();
  const response = await adapter.handle({
    jsonrpc: '2.0', id: 9, method: 'tools/call',
    params: { name: 'echo', arguments: { value: 42 }, _meta: MODERN_META },
  }, context);
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /INVALID_TYPE/);
  assert.doesNotMatch(response.result.content[0].text, /value|42/);
});

test('unknown/unavailable tools are protocol errors and notifications never receive responses', async () => {
  const { adapter } = makeFixture();
  const missing = await adapter.handle({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'missing', arguments: {} } }, context);
  assert.equal(missing.error.code, -32602);
  const disabled = await adapter.handle({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'disabled', arguments: {} } }, context);
  assert.equal(disabled.error.code, -32602);
  assert.equal(await adapter.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, context), null);
  assert.equal(await adapter.handle({ jsonrpc: '2.0', method: 'unknown/notification' }, context), null);
});

test('unsupported protocol versions and malformed requests fail closed', async () => {
  const { adapter } = makeFixture();
  const unsupported = await adapter.handle({
    jsonrpc: '2.0', id: 12, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } },
  }, context);
  assert.equal(unsupported.error.code, -32001);
  const malformed = await adapter.handle({ id: 13, method: 'tools/list' }, context);
  assert.equal(malformed.error.code, -32600);
  const unknown = await adapter.handle({ jsonrpc: '2.0', id: 14, method: 'anything/else' }, context);
  assert.equal(unknown.error.code, -32601);
});
