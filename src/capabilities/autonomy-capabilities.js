import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { getAutonomyReadiness } from '../evolution/autonomy-readiness.js';
import { runAutonomyRuntimeTick } from '../evolution/autonomy-runtime.js';
import { getAutonomyControl, setAutonomyControl } from '../evolution/autonomy-control.js';

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
    version: '1.1.0',
    provider: 'mel',
    description: 'Calculates SELF_DEVELOPMENT_READY and returns the persisted autonomy control state.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async () => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    const [readiness, control] = await Promise.all([
      getAutonomyReadiness({ repository: new D1DevJobRepository(env.DB) }),
      getAutonomyControl(env.DB),
    ]);
    return { ...readiness, control };
  });

  bus.discover({
    id: 'autonomy.pause',
    name: 'Pause d’urgence MEL',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Immediately pauses future autonomous development heartbeats while keeping normal MEL chat available.',
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async (input = {}) => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    return setAutonomyControl(env.DB, { paused: true, source: 'mel-capability', reason: input.reason || 'owner-request' });
  });

  bus.discover({
    id: 'autonomy.resume',
    name: 'Reprise d’autonomie MEL',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Resumes future autonomous development heartbeats after an explicit owner request.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async () => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    return setAutonomyControl(env.DB, { paused: false, source: 'mel-capability', reason: 'owner-resume' });
  });

  bus.discover({
    id: 'autonomy.tick',
    name: 'Cycle autonome MEL',
    category: 'evolution',
    version: '1.1.0',
    provider: 'mel',
    description: 'Runs one bounded supervised-autonomy heartbeat unless the persisted emergency pause is active.',
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
