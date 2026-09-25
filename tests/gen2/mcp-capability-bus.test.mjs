import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import {
  createCapabilityBusMcpAdapter,
  MCP_MODERN_PROTOCOL_VERSION,
  MCP_LEGACY_PROTOCOL_VERSION,
} from '../../src/mcp/capability-bus-mcp.js';

function busFixture() {
  const bus = new CapabilityBus();
  bus.discover({
    id: 'echo.test',
    name: 'Echo Test',
    category: 'diagnostic',
    version: '1.0.0',
    provider: 'core',
    description: 'Echoes a bounded string.',
    input_schema: {
      type: 'object',
      properties: { value: { type: 'string', minLength: 1, maxLength: 100 } },
      required: ['value'],
      additionalProperties: false,
    },
    output_schema: {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
  }, async input => ({ value: input.value }));

  bus.discover({
    id: 'secure.test',
    name: 'Secure Test',
    category: 'diagnostic',
    version: '1.0.0',
    provider: 'core',
    description: 'Requires an explicit MEL permission.',
    input_schema: {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    },
    output_schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false,
    },
    risk: 'MEDIUM',
    permissions: ['secure.use'],
    health: 'HEALTHY',
    enabled: true,
  }, async () => ({ ok: true }));

  bus.discover({
    id: 'disabled.test',
    name: 'Disabled Test',
    category: 'diagnostic',
    version: '1.0.0',
    provider: 'core',
    description: 'Must not be advertised.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: false,
  }, async () => ({ ok: true }));

  return bus;
}

function modernMeta() {
  return {
    'io.modelcontextprotocol/protocolVersion': MCP_MODERN_PROTOCOL_VERSION,
    'io.modelcontextprotocol/clientCapabilities': {},
    'io.modelcontextprotocol/clientInfo': { name: 'test-client', version: '1.0.0' },
  };
}

test('modern MCP server/discover advertises tools and supported eras', async () => {
  const adapter = createCapabilityBusMcpAdapter(busFixture(), { name: 'mel-test', version: '1.2.3' });
  const response = await adapter.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'server/discover',
    params: { _meta: modernMeta() },
  });

  assert.equal(response.result.resultType, 'complete');
  assert.deepEqual(response.result.supportedVersions, [MCP_MODERN_PROTOCOL_VERSION, MCP_LEGACY_PROTOCOL_VERSION]);
  assert.equal(response.result.capabilities.tools.listChanged, false);
  assert.equal(response.result.cacheScope, 'private');
  assert.equal(response.result._meta['io.modelcontextprotocol/serverInfo'].name, 'mel-test');
});

test('tools/list maps live CapabilityBus records to MCP tools and hides disabled entries', async () => {
  const adapter = createCapabilityBusMcpAdapter(busFixture());
  const response = await adapter.handle({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: { _meta: modernMeta() },
  });

  const names = response.result.tools.map(tool => tool.name);
  assert.deepEqual(names, ['echo.test', 'secure.test']);
  const echo = response.result.tools.find(tool => tool.name === 'echo.test');
  assert.equal(echo.title, 'Echo Test');
  assert.equal(echo.inputSchema.type, 'object');
  assert.equal(echo.outputSchema.type, 'object');
  assert.equal(echo._meta['io.meliturgos/capability'].risk, 'LOW');
});

test('modern tools/call returns text plus structured content', async () => {
  const adapter = createCapabilityBusMcpAdapter(busFixture());
  const response = await adapter.handle({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'echo.test',
      arguments: { value: 'bonjour' },
      _meta: modernMeta(),
    },
  }, { owner: 'adrien', permissions: [], requestId: 'mcp-test-3' });

  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.value, 'bonjour');
  assert.deepEqual(JSON.parse(response.result.content[0].text), { value: 'bonjour' });
  assert.equal(response.result.resultType, 'complete');
});

test('MCP cannot bypass CapabilityBus permissions', async () => {
  const adapter = createCapabilityBusMcpAdapter(busFixture());
  const denied = await adapter.handle({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'secure.test',
      arguments: { value: 'x' },
      _meta: modernMeta(),
    },
  }, { owner: 'adrien', permissions: [], requestId: 'mcp-test-4' });

  assert.equal(denied.result.isError, true);
  assert.match(denied.result.content[0].text, /PERMISSION|AUTH|DENIED/i);

  const allowed = await adapter.handle({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'secure.test',
      arguments: { value: 'x' },
      _meta: modernMeta(),
    },
  }, { owner: 'adrien', permissions: ['secure.use'], requestId: 'mcp-test-5' });

  assert.equal(allowed.result.isError, false);
  assert.equal(allowed.result.structuredContent.ok, true);
});

test('MCP call preserves CapabilityBus input validation', async () => {
  const adapter = createCapabilityBusMcpAdapter(busFixture());
  const response = await adapter.handle({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'echo.test',
      arguments: { wrong: true },
      _meta: modernMeta(),
    },
  }, { owner: 'adrien', permissions: [], requestId: 'mcp-test-6' });

  assert.equal(response.result.isError, true);
  const errorPayload = JSON.parse(response.result.content[0].text);
  assert.equal(errorPayload.code, 'MISSING_FIELD');
  assert.equal(errorPayload.status, 400);
});

test('legacy initialize and tool calls remain supported without modern resultType', async () => {
  const adapter = createCapabilityBusMcpAdapter(busFixture(), { name: 'mel-legacy', version: '1.0.0' });
  const initialized = await adapter.handle({
    jsonrpc: '2.0',
    id: 7,
    method: 'initialize',
    params: {
      protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'legacy-client', version: '1.0.0' },
    },
  });

  assert.equal(initialized.result.protocolVersion, MCP_LEGACY_PROTOCOL_VERSION);
  assert.equal(initialized.result.serverInfo.name, 'mel-legacy');
  assert.equal('resultType' in initialized.result, false);

  const called = await adapter.handle({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'echo.test',
      arguments: { value: 'legacy' },
    },
  }, { owner: 'adrien', permissions: [] });

  assert.equal(called.result.isError, false);
  assert.deepEqual(called.result.structuredContent, { value: 'legacy' });
  assert.equal('resultType' in called.result, false);
});

test('notifications/initialized is notification-only and unknown methods return JSON-RPC method-not-found', async () => {
  const adapter = createCapabilityBusMcpAdapter(busFixture());
  const notification = await adapter.handle({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  });
  assert.equal(notification, null);

  const unknown = await adapter.handle({
    jsonrpc: '2.0',
    id: 9,
    method: 'resources/list',
    params: { _meta: modernMeta() },
  });
  assert.equal(unknown.error.code, -32601);
});
