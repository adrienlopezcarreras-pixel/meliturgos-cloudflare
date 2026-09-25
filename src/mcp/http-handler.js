import {
  createCapabilityBusMcpAdapter,
  MCP_MODERN_PROTOCOL_VERSION,
} from './capability-bus-mcp.js';

const HEADER_PROTOCOL = 'MCP-Protocol-Version';
const HEADER_METHOD = 'Mcp-Method';
const HEADER_NAME = 'Mcp-Name';
const HEADER_ERROR_CODE = -32020;

function jsonRpcHttpError(id, code, message, data = undefined, status = 400) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return Response.json({ jsonrpc: '2.0', id: id ?? null, error }, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function modernEnvelope(message = {}) {
  return String(message?.params?._meta?.['io.modelcontextprotocol/protocolVersion'] || '') === MCP_MODERN_PROTOCOL_VERSION
    || message?.method === 'server/discover';
}

function isNotification(message = {}) {
  return message && typeof message === 'object' && !Array.isArray(message) && message.id === undefined;
}

function headerValue(request, name) {
  return String(request?.headers?.get?.(name) || '').trim();
}

function validateModernHeaders(request, message) {
  const protocol = headerValue(request, HEADER_PROTOCOL);
  const method = headerValue(request, HEADER_METHOD);
  const name = headerValue(request, HEADER_NAME);
  const expectedMethod = String(message?.method || '');
  const expectedName = expectedMethod === 'tools/call' ? String(message?.params?.name || '') : '';

  if (protocol !== MCP_MODERN_PROTOCOL_VERSION) {
    return {
      ok: false,
      reason: 'MCP_PROTOCOL_VERSION_HEADER_MISMATCH',
      expected: MCP_MODERN_PROTOCOL_VERSION,
      actual: protocol || null,
    };
  }
  if (method !== expectedMethod) {
    return {
      ok: false,
      reason: 'MCP_METHOD_HEADER_MISMATCH',
      expected: expectedMethod,
      actual: method || null,
    };
  }
  if (expectedName && name !== expectedName) {
    return {
      ok: false,
      reason: 'MCP_NAME_HEADER_MISMATCH',
      expected: expectedName,
      actual: name || null,
    };
  }
  if (!expectedName && name) {
    return {
      ok: false,
      reason: 'MCP_NAME_HEADER_UNEXPECTED',
      expected: null,
      actual: name,
    };
  }
  return { ok: true };
}

export function createCapabilityBusMcpHttpHandler(bus, {
  server = {},
  contextFactory = async () => ({}),
} = {}) {
  const adapter = createCapabilityBusMcpAdapter(bus, server);

  return async function handleMcpHttp(request) {
    if (!(request instanceof Request)) {
      return jsonRpcHttpError(null, -32600, 'Invalid Request', undefined, 400);
    }
    if (request.method !== 'POST') {
      return jsonRpcHttpError(null, -32600, 'MCP endpoint requires POST', undefined, 405);
    }

    let message;
    try {
      message = await request.json();
    } catch {
      return jsonRpcHttpError(null, -32700, 'Parse error', undefined, 400);
    }

    const modern = modernEnvelope(message);
    if (modern && !isNotification(message)) {
      const headers = validateModernHeaders(request, message);
      if (!headers.ok) {
        return jsonRpcHttpError(
          message?.id,
          HEADER_ERROR_CODE,
          'HeaderMismatch',
          {
            reason: headers.reason,
            expected: headers.expected,
            actual: headers.actual,
          },
          400,
        );
      }
    }

    let context;
    try {
      context = await contextFactory(request, message);
      if (!context || typeof context !== 'object' || Array.isArray(context)) {
        return jsonRpcHttpError(message?.id, -32603, 'Invalid server context', undefined, 500);
      }
    } catch (error) {
      return jsonRpcHttpError(message?.id, -32603, 'Server context failed', {
        code: String(error?.code || error?.message || 'MCP_CONTEXT_FAILED').slice(0, 160),
      }, 500);
    }

    const response = await adapter.handle(message, context, {
      protocolVersion: modern
        ? MCP_MODERN_PROTOCOL_VERSION
        : headerValue(request, HEADER_PROTOCOL),
    });

    if (response === null || isNotification(message)) {
      return new Response(null, {
        status: 202,
        headers: { 'cache-control': 'no-store' },
      });
    }

    return Response.json(response, {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        ...(modern ? { [HEADER_PROTOCOL]: MCP_MODERN_PROTOCOL_VERSION } : {}),
      },
    });
  };
}

export const MCP_HTTP_HEADERS = Object.freeze({
  protocol: HEADER_PROTOCOL,
  method: HEADER_METHOD,
  name: HEADER_NAME,
});
