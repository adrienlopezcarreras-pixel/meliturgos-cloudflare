import { auditRuntimeCapabilities } from '../diagnostics/capability-truth-audit.js';
import { readPersistentCapabilityStress, startPersistentCapabilityStress } from '../diagnostics/persistent-capability-stress.js';

export function registerCapabilityAuditCapability(bus, env = {}) {
  bus.discover({
    id: 'capability.audit',
    name: 'Audit vérité des capacités MEL',
    category: 'diagnostic',
    version: '1.0.0',
    provider: 'core',
    description: 'Inventories every registered runtime capability and optionally executes only bounded LOW-risk smoke samples.',
    input_schema: {
      type: 'object',
      properties: {
        deep: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
  }, async (input, context = {}) => {
    const auditContext = {
      owner: context.owner || 'capability-audit',
      permissions: context.permissions || [],
      approvedCapabilities: context.approvedCapabilities || [],
      requestId: context.requestId || crypto.randomUUID(),
      waitUntil: context.waitUntil,
    };
    if (input.deep === true && env?.DB) {
      return startPersistentCapabilityStress({ bus, db: env.DB, context: auditContext });
    }
    return auditRuntimeCapabilities(
      { bus },
      {
        deep: input.deep === true,
        context: auditContext,
      }
    );
  });

  bus.discover({
    id: 'capability.audit.status',
    name: 'Statut du stress test global des capacités MEL',
    category: 'diagnostic',
    version: '1.0.0',
    provider: 'core',
    description: 'Reads the latest durable global capability stress-test job or one exact job_id without executing another audit.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string', minLength: 1, maxLength: 200 },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env?.DB ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input) => {
    if (!env?.DB) throw Object.assign(new Error('CAPABILITY_STRESS_DB_REQUIRED'), { code: 'CAPABILITY_STRESS_DB_REQUIRED' });
    return readPersistentCapabilityStress({ db: env.DB, jobId: input.job_id || null });
  });
}
