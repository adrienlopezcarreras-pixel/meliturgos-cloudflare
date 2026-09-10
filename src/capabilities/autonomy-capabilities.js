import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { getAutonomyReadiness } from '../evolution/autonomy-readiness.js';
import { runAutonomyRuntimeTick } from '../evolution/autonomy-runtime.js';

function capabilityError(message, code = message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function registerAutonomyCapabilities(bus, env = {}) {
  if (!bus || typeof bus.discover !== 'function') throw new TypeError('CAPABILITY_BUS_REQUIRED');

  bus.discover({
    id: 'autonomy.status',
    name: 'État d’autonomie MEL',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Calculates SELF_DEVELOPMENT_READY from durable runtime evidence instead of declarations.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async () => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    return getAutonomyReadiness({ repository: new D1DevJobRepository(env.DB) });
  });

  bus.discover({
    id: 'autonomy.tick',
    name: 'Cycle autonome MEL',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Runs one bounded supervised-autonomy heartbeat: reconcile Teacher/completion evidence, prove Work DAG resume, and advance the next candidate-only job.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM',
    permissions: [],
    health: env.DB && env.AI ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async () => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    if (!env.AI || typeof env.AI.run !== 'function') throw capabilityError('AI_BINDING_MISSING');
    const repository = new D1DevJobRepository(env.DB);
    return runAutonomyRuntimeTick(env, {
      repository,
      fetchImpl: env.MEL_GITHUB_FETCH || fetch,
    });
  });

  return bus;
}
