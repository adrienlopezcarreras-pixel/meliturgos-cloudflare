import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { createCapabilityBusMcpHttpHandler } from '../../src/mcp/http-handler.js';

function buildBus() {
  const bus = new CapabilityBus();
  bus.discover({
    id: 'echo.test',
    name: 'Echo Test',
    category: 'diagnostic',
    version: '1.0.0',
    provider: 'core',
    description: 'Echoes one string.',
    input_schema: {
      type: 'object',
      properties: { value: { type: 'string' } },
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
  return bus;
}

function modernBody(id, method, params = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...params,
      _meta: {
        ...(params._meta || {}),
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientCapabilities': {},
        'io.modelcontextprotocol/clientInfo': { name: 'ci', version: '1.0.0' },
      },
    },
  };
}

test('modern Streamable HTTP-ready handler enforces protocol and method headers', async () => {
  const handler = createCapabilityBusMcpHttpHandler(buildBus());
  const body = modernBody(1, 'tools/list');

  const missing = await handler(new Request('https://mel.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
  assert.equal(missing.status, 400);
  const missingPayload = await missing.json();
  assert.equal(missingPayload.error.code, -32020);

  const valid = await handler(new Request('https://mel.test/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/list',
    },
    body: JSON.stringify(body),
  }));
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get('MCP-Protocol-Version'), '2026-07-28');
  const payload = await valid.json();
  assert.equal(payload.result.tools[0].name, 'echo.test');
});

test('modern tools/call requires matching Mcp-Name and passes server-built context', async () => {
  const contexts = [];
  const handler = createCapabilityBusMcpHttpHandler(buildBus(), {
    contextFactory: async (_request, message) => {
      const context = {
        owner: 'adrien',
        permissions: [],
        requestId: `http-mcp-${message.id}`,
      };
      contexts.push(context);
      return context;
    },
  });
  const body = modernBody(2, 'tools/call', {
    name: 'echo.test',
    arguments: { value: 'bonjour' },
  });

  const mismatch = await handler(new Request('https://mel.test/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': 'wrong.tool',
    },
    body: JSON.stringify(body),
  }));
  assert.equal(mismatch.status, 400);
  assert.equal((await mismatch.json()).error.data.reason, 'MCP_NAME_HEADER_MISMATCH');
  assert.equal(contexts.length, 0);

  const valid = await handler(new Request('https://mel.test/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': 'echo.test',
    },
    body: JSON.stringify(body),
  }));
  assert.equal(valid.status, 200);
  const payload = await valid.json();
  assert.equal(payload.result.structuredContent.value, 'bonjour');
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].requestId, 'http-mcp-2');
});

test('legacy initialize works without modern headers', async () => {
  const handler = createCapabilityBusMcpHttpHandler(buildBus(), {
    server: { name: 'mel-legacy-test', version: '1.0.0' },
  });
  const response = await handler(new Request('https://mel.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'legacy', version: '1.0.0' },
      },
    }),
  }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.protocolVersion, '2025-11-25');
  assert.equal(payload.result.serverInfo.name, 'mel-legacy-test');
});

test('HTTP handler rejects malformed JSON and non-POST methods', async () => {
  const handler = createCapabilityBusMcpHttpHandler(buildBus());

  const parse = await handler(new Request('https://mel.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{bad',
  }));
  assert.equal(parse.status, 400);
  assert.equal((await parse.json()).error.code, -32700);

  const get = await handler(new Request('https://mel.test/mcp', { method: 'GET' }));
  assert.equal(get.status, 405);
});

test('notifications are accepted with HTTP 202 and no JSON body', async () => {
  const handler = createCapabilityBusMcpHttpHandler(buildBus());
  const response = await handler(new Request('https://mel.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }),
  }));
  assert.equal(response.status, 202);
  assert.equal(await response.text(), '');
});
