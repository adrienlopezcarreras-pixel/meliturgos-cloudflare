import { D1EvolutionLedger } from '../evolution/evolution-ledger.js';

export function registerEvolutionLedgerCapabilities(bus, env = {}) {
  bus.discover({
    id: 'evolution.ledger.list',
    name: 'Historique immuable des évolutions',
    category: 'evolution',
    version: '1.0.0',
    provider: 'core',
    description: 'Lists bounded append-only evolution ledger entries, optionally filtered by evolution id.',
    input_schema: {
      type: 'object',
      properties: {
        evolution_id: { type: 'string', minLength: 1, maxLength: 220 },
        limit: { type: 'integer', minimum: 1, maximum: 2000 },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
    risk: 'LOW',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input = {}) => {
    if (!env.DB) throw Object.assign(new Error('DB_BINDING_MISSING'), { code: 'DB_BINDING_MISSING', status: 503 });
    return new D1EvolutionLedger(env.DB).list({
      evolution_id: input.evolution_id || '',
      limit: Number.isInteger(input.limit) ? input.limit : 200,
    });
  });

  bus.discover({
    id: 'evolution.ledger.verify',
    name: 'Vérifier le ledger des évolutions',
    category: 'evolution',
    version: '1.0.0',
    provider: 'core',
    description: 'Recomputes the complete append-only SHA-256 chain and reports any missing or altered ledger entry.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 2000 },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input = {}) => {
    if (!env.DB) throw Object.assign(new Error('DB_BINDING_MISSING'), { code: 'DB_BINDING_MISSING', status: 503 });
    return new D1EvolutionLedger(env.DB).verify({
      limit: Number.isInteger(input.limit) ? input.limit : 2000,
    });
  });
}
