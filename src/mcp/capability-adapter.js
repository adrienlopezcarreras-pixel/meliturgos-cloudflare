const MODERN_VERSION = '2026-07-28';
const DEFAULT_LEGACY_VERSIONS = Object.freeze([
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
]);
const SERVER_INFO_META_KEY = 'io.modelcontextprotocol/serverInfo';
const PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function safeJson(value) {
  if (value === undefined) return 'null';
  try { return JSON.stringify(value); }
  catch { return JSON.stringify({ error: 'UNSERIALIZABLE_TOOL_RESULT' }); }
}

function permissionsAllow(record, context) {
  const required = Array.isArray(record.permissions) ? record.permissions : [];
  const granted = new Set(Array.isArray(context?.permissions) ? context.permissions : []);
  return required.every(permission => granted.has(permission));
}

function capabilityAvailable(record, context) {
  return record?.enabled !== false && record?.health !== 'UNAVAILABLE' && permissionsAllow(record, context);
}

function requiresInputEnvelope(schema) {
  return isObject(schema) && schema.type !== undefined && schema.type !== 'object';
}

function toTool(record) {
  const wrapped = requiresInputEnvelope(record.input_schema);
  const inputSchema = wrapped
    ? {
        type: 'object',
        properties: { input: structuredClone(record.input_schema) },
        required: ['input'],
        additionalProperties: false,
      }
    : structuredClone(isObject(record.input_schema) ? record.input_schema : { type: 'object' });

  const tool = {
    name: String(record.id),
    title: String(record.name ?? record.id),
    description: String(record.description ?? ''),
    inputSchema,
  };
  if (isObject(record.output_schema)) tool.outputSchema = structuredClone(record.output_schema);
  return tool;
}

function decodeCursor(cursor, total) {
  if (cursor === undefined) return 0;
  if (typeof cursor !== 'string' || !/^mel:\d+$/.test(cursor)) throw Object.assign(new Error('INVALID_CURSOR'), { code: 'INVALID_CURSOR' });
  const offset = Number(cursor.slice(4));
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > total) throw Object.assign(new Error('INVALID_CURSOR'), { code: 'INVALID_CURSOR' });
  return offset;
}

function legacyStructuredContent(value) {
  return isObject(value) ? structuredClone(value) : undefined;
}

function modernStructuredContent(value) {
  if (value === undefined) return null;
  return structuredClone(value);
}

export const MCP_MODERN_VERSION = MODERN_VERSION;
export const MCP_LEGACY_VERSIONS = DEFAULT_LEGACY_VERSIONS;

/**
 * Transport-neutral MCP compatibility adapter for MEL's CapabilityBus contract.
 *
 * The adapter intentionally owns no transport, auth, session store, or capability
 * lifecycle. Callers provide the authorization context per request; execution is
 * delegated to bus.execute(), preserving MEL's existing validation and audit gates.
 */
export function createMcpCapabilityAdapter({
  bus,
  serverInfo = { name: 'meliturgos', version: '0.0.0' },
  instructions = 'MEL capabilities exposed through the Model Context Protocol.',
  modernVersions = [MODERN_VERSION],
  legacyVersions = DEFAULT_LEGACY_VERSIONS,
  listTtlMs = 0,
  cacheScope = 'private',
  maxToolsPerPage = 100,
} = {}) {
  if (!bus || typeof bus.list !== 'function' || typeof bus.execute !== 'function') throw new TypeError('MCP_BUS_REQUIRED');
  if (!isObject(serverInfo) || !serverInfo.name || !serverInfo.version) throw new TypeError('MCP_SERVER_INFO_REQUIRED');
  if (!Array.isArray(modernVersions) || !modernVersions.includes(MODERN_VERSION)) throw new TypeError('MCP_MODERN_VERSION_REQUIRED');
  if (!Array.isArray(legacyVersions)) throw new TypeError('MCP_LEGACY_VERSIONS_REQUIRED');
  if (!Number.isSafeInteger(listTtlMs) || listTtlMs < 0) throw new TypeError('MCP_INVALID_TTL');
  if (!['private', 'public'].includes(cacheScope)) throw new TypeError('MCP_INVALID_CACHE_SCOPE');
  if (!Number.isSafeInteger(maxToolsPerPage) || maxToolsPerPage < 1) throw new TypeError('MCP_INVALID_PAGE_SIZE');

  const supportedVersions = [...new Set([...modernVersions, ...legacyVersions])];

  function visibleRecords(context) {
    return bus.list()
      .filter(record => capabilityAvailable(record, context))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  function isModernRequest(message) {
    return message?.params?._meta?.[PROTOCOL_VERSION_META_KEY] === MODERN_VERSION;
  }

  function stampModernResult(result, modern, { cacheable = false } = {}) {
    if (!modern) return result;
    const stamped = {
      resultType: 'complete',
      ...result,
      _meta: {
        ...(isObject(result?._meta) ? result._meta : {}),
        [SERVER_INFO_META_KEY]: structuredClone(serverInfo),
      },
    };
    if (cacheable) {
      stamped.ttlMs = listTtlMs;
      stamped.cacheScope = cacheScope;
    }
    return stamped;
  }

  function negotiateLegacyVersion(requested) {
    if (legacyVersions.includes(requested)) return requested;
    return legacyVersions[0] ?? null;
  }

  async function handle(message, context = {}) {
    if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return jsonRpcError(hasOwn(message ?? {}, 'id') ? message.id : null, -32600, 'Invalid Request');
    }

    const hasId = hasOwn(message, 'id');
    const modern = isModernRequest(message);
    const requestedVersion = message?.params?._meta?.[PROTOCOL_VERSION_META_KEY];
    if (requestedVersion !== undefined && !supportedVersions.includes(requestedVersion)) {
      return hasId ? jsonRpcError(message.id, -32001, 'Unsupported protocol version', { supportedVersions }) : null;
    }

    if (message.method === 'notifications/initialized') return null;

    if (message.method === 'initialize') {
      if (!hasId || !isObject(message.params) || typeof message.params.protocolVersion !== 'string') {
        return hasId ? jsonRpcError(message.id, -32602, 'Invalid params') : null;
      }
      const protocolVersion = negotiateLegacyVersion(message.params.protocolVersion);
      if (!protocolVersion) return jsonRpcError(message.id, -32001, 'Unsupported protocol version');
      const result = {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: structuredClone(serverInfo),
        instructions,
      };
      return jsonRpcResult(message.id, result);
    }

    if (message.method === 'server/discover') {
      if (!hasId) return null;
      const result = stampModernResult({
        supportedVersions: structuredClone(supportedVersions),
        capabilities: { tools: { listChanged: false } },
        instructions,
      }, true, { cacheable: true });
      return jsonRpcResult(message.id, result);
    }

    if (message.method === 'ping') {
      if (!hasId) return null;
      return jsonRpcResult(message.id, modern ? stampModernResult({}, true) : {});
    }

    if (message.method === 'tools/list') {
      if (!hasId) return null;
      if (message.params !== undefined && !isObject(message.params)) return jsonRpcError(message.id, -32602, 'Invalid params');
      const records = visibleRecords(context);
      let offset;
      try { offset = decodeCursor(message.params?.cursor, records.length); }
      catch { return jsonRpcError(message.id, -32602, 'Invalid params', { field: 'cursor' }); }
      const page = records.slice(offset, offset + maxToolsPerPage);
      const result = { tools: page.map(toTool) };
      if (offset + page.length < records.length) result.nextCursor = `mel:${offset + page.length}`;
      return jsonRpcResult(message.id, stampModernResult(result, modern, { cacheable: true }));
    }

    if (message.method === 'tools/call') {
      if (!hasId || !isObject(message.params) || typeof message.params.name !== 'string') {
        return hasId ? jsonRpcError(message.id, -32602, 'Invalid params') : null;
      }
      if (message.params.arguments !== undefined && !isObject(message.params.arguments)) {
        return jsonRpcError(message.id, -32602, 'Invalid params', { field: 'arguments' });
      }

      const record = visibleRecords(context).find(item => String(item.id) === message.params.name);
      if (!record) return jsonRpcError(message.id, -32602, 'Unknown or unavailable tool');

      const args = message.params.arguments ?? {};
      const input = requiresInputEnvelope(record.input_schema) ? args.input : args;
      const requestContext = {
        ...context,
        requestId: context.requestId ?? `mcp:${String(message.id)}`,
      };

      try {
        const output = await bus.execute(record.id, input, requestContext);
        const result = {
          content: [{ type: 'text', text: safeJson(output) }],
          isError: false,
        };
        const structured = modern ? modernStructuredContent(output) : legacyStructuredContent(output);
        if (structured !== undefined) result.structuredContent = structured;
        return jsonRpcResult(message.id, stampModernResult(result, modern));
      } catch (error) {
        if (error?.code === 'CAPABILITY_NOT_FOUND') return jsonRpcError(message.id, -32602, 'Unknown or unavailable tool');
        const safeCode = typeof error?.code === 'string' ? error.code : 'TOOL_EXECUTION_FAILED';
        const result = {
          content: [{ type: 'text', text: `MEL capability error: ${safeCode}` }],
          isError: true,
        };
        return jsonRpcResult(message.id, stampModernResult(result, modern));
      }
    }

    return hasId ? jsonRpcError(message.id, -32601, 'Method not found') : null;
  }

  return Object.freeze({ handle, supportedVersions: structuredClone(supportedVersions) });
}
