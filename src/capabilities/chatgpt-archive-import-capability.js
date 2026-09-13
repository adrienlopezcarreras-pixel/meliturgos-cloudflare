import { importChatGPTArchive } from '../persistence/chatgpt-archive-importer.js';

export function registerChatGPTArchiveImportCapability(bus, env = {}) {
  bus.discover({
    id: 'chatgpt.archive.import',
    name: 'Importer une archive ChatGPT',
    category: 'memory',
    version: '1.0.0',
    provider: 'core',
    description: 'Imports a validated ChatGPT conversations archive into persistent MEL conversation storage.',
    input_schema: { type: 'object', additionalProperties: true },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async input => importChatGPTArchive(env, input.archive ?? input, { preview: false }));
}
