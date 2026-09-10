import InternetService from '../services/internet-service.js';

export function registerWebResearchCapability(bus, env = {}) {
  bus.discover({
    id: 'web.research',
    name: 'Recherche web sourcée',
    category: 'research',
    version: '1.0.0',
    provider: 'mel',
    description: 'Performs bounded public-web research with URL safety, provenance, rate limiting and source snippets.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 2000 },
        domains: { type: 'array', maxItems: 3, items: { type: 'string', minLength: 1, maxLength: 253 } },
        depth: { type: 'integer', minimum: 1, maximum: 3 }
      },
      required: ['query'],
      additionalProperties: false
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true
  }, async input => {
    const service = new InternetService(env);
    service.minInterval = Math.max(0, Math.min(5000, Number(env.MEL_WEB_MIN_INTERVAL_MS ?? 1000) || 0));
    return service.research(input.query, input.domains || null, Math.max(1, Math.min(3, Number(input.depth) || 2)));
  });
}
