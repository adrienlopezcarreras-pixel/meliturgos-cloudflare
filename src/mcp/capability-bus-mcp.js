export const MCP_MODERN_PROTOCOL_VERSION = '2026-07-28';
export const MCP_LEGACY_PROTOCOL_VERSION = '2025-11-25';
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
  MCP_MODERN_PROTOCOL_VERSION,
  MCP_LEGACY_PROTOCOL_VERSION,
]);

const SERVER_INFO_META_KEY = 'io.modelcontextprotocol/serverInfo';
const PROTOCOL_META_KEY = 'io.modelcontextprotocol/protocolVersion';

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function serverInfo(options = {}) {
  return Object.freeze({
    name: clean(options.name || 'meliturgos-capability-bus', 120),
    version: clean(options.version || '1.0.0', 80),
    description: clean(options.description || 'MEL CapabilityBus MCP adapter', 400),
  });
}

function isModernVersion(version) {
  return String(version || '') === MCP_MODERN_PROTOCOL_VERSION;
}

function detectProtocolVersion(message = {}, explicit = '') {
  const fromMeta = message?.params?._meta?.[PROTOCOL_META_KEY];
  const version = clean(explicit || fromMeta, 40);
  if (version) return version;
  if (message?.method === 'server/discover') return MCP_MODERN_PROTOCOL_VERSION;
  return MCP_LEGACY_PROTOCOL_VERSION;
}

function resultEnvelope(result, { id, modern, info }) {
  const payload = modern
    ? {
        ...result,
        resultType: result?.resultType || 'complete',
        _meta: {
          ...(result?._meta && typeof result._meta === 'object' ? result._meta : {}),
          [SERVER_INFO_META_KEY]: info,
        },
      }
    : result;
  return { jsonrpc: '2.0', id, result: payload };
}

function errorEnvelope(id, code, message, data = undefined) {
  const error = {
    code,
    message: String(message || 'Protocol error').slice(0, 500),
  };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error };
}

function toolMeta(record = {}) {
  return {
    'io.meliturgos/capability': {
      id: record.id,
      version: record.version,
      provider: record.provider,
      category: record.category,
      risk: record.risk,
      permissions: Array.isArray(record.permissions) ? [...record.permissions] : [],
      health: record.health,
    },
  };
}

export function capabilityToMcpTool(record = {}) {
  return {
    name: String(record.id || ''),
    title: String(record.name || record.id || ''),
    description: String(record.description || record.name || record.id || ''),
    inputSchema: record.input_schema && typeof record.input_schema === 'object'
      ? structuredClone(record.input_schema)
      : { type: 'object', additionalProperties: true },
    outputSchema: record.output_schema && typeof record.output_schema === 'object'
      ? structuredClone(record.output_schema)
      : undefined,
    _meta: toolMeta(record),
  };
}

function listedCapabilities(bus) {
  return bus.list()
    .filter(record => record?.enabled !== false)
    .filter(record => String(record?.health || '').toUpperCase() !== 'UNAVAILABLE')
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function jsonText(value) {
  try { return JSON.stringify(value); }
  catch { return JSON.stringify({ error: 'MCP_RESULT_SERIALIZATION_FAILED' }); }
}

function toolSuccessResult(output, modern) {
  const result = {
    content: [{ type: 'text', text: jsonText(output) }],
    isError: false,
  };
  if (modern || (output && typeof output === 'object' && !Array.isArray(output))) {
    result.structuredContent = output;
  }
  return result;
}

function toolErrorResult(error, modern) {
  const payload = {
    ok: false,
    code: clean(error?.code || 'CAPABILITY_FAILED', 160),
    message: clean(error?.message || error?.code || 'CAPABILITY_FAILED', 500),
    status: Number.isInteger(Number(error?.status)) ? Number(error.status) : null,
  };
  const result = {
    content: [{ type: 'text', text: jsonText(payload) }],
    isError: true,
  };
  if (modern) result.structuredContent = payload;
  return result;
}

export function createCapabilityBusMcpAdapter(bus, options = {}) {
  if (!bus || typeof bus.list !== 'function' || typeof bus.execute !== 'function') {
    throw Object.assign(new Error('MCP_CAPABILITY_BUS_REQUIRED'), { code: 'MCP_CAPABILITY_BUS_REQUIRED' });
  }
  const info = serverInfo(options);

  return Object.freeze({
    serverInfo: info,

    async handle(message = {}, context = {}, { protocolVersion = '' } = {}) {
      if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') {
        return errorEnvelope(message?.id, -32600, 'Invalid Request');
      }

      const id = message.id;
      const method = String(message.method || '');
      const version = detectProtocolVersion(message, protocolVersion);
      const modern = isModernVersion(version);

      if (modern && version !== MCP_MODERN_PROTOCOL_VERSION) {
        return errorEnvelope(id, -32602, 'Unsupported protocol version', {
          supportedVersions: MCP_SUPPORTED_PROTOCOL_VERSIONS,
        });
      }

      if (method === 'server/discover') {
        if (!modern) return errorEnvelope(id, -32601, 'Method not found');
        return resultEnvelope({
          supportedVersions: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
          capabilities: {
            tools: { listChanged: false },
          },
          instructions: 'MEL exposes the CapabilityBus as MCP tools. Server-side MEL permissions and approval gates remain authoritative.',
          ttlMs: 0,
          cacheScope: 'private',
        }, { id, modern: true, info });
      }

      if (method === 'initialize') {
        if (modern) return errorEnvelope(id, -32601, 'Method not supported by modern protocol');
        return resultEnvelope({
          protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: info,
          instructions: 'MEL exposes the CapabilityBus as MCP tools. Server-side MEL permissions and approval gates remain authoritative.',
        }, { id, modern: false, info });
      }

      if (method === 'notifications/initialized') {
        return null;
      }

      if (method === 'tools/list') {
        const tools = listedCapabilities(bus).map(capabilityToMcpTool);
        return resultEnvelope({
          tools,
          ...(modern ? { ttlMs: 0, cacheScope: 'private' } : {}),
        }, { id, modern, info });
      }

      if (method === 'tools/call') {
        const name = clean(message?.params?.name, 200);
        const args = message?.params?.arguments;
        if (!name) return errorEnvelope(id, -32602, 'Tool name is required');
        if (args !== undefined && (!args || typeof args !== 'object' || Array.isArray(args))) {
          return errorEnvelope(id, -32602, 'Tool arguments must be an object');
        }

        try {
          const output = await bus.execute(name, args || {}, context);
          return resultEnvelope(toolSuccessResult(output, modern), { id, modern, info });
        } catch (error) {
          return resultEnvelope(toolErrorResult(error, modern), { id, modern, info });
        }
      }

      return errorEnvelope(id, -32601, 'Method not found', { method });
    },
  });
}
