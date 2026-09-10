import { auditRuntimeCapabilities } from '../diagnostics/capability-truth-audit.js';

export function registerCapabilityAuditCapability(bus) {
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
  }, async (input, context = {}) => auditRuntimeCapabilities(
    { bus },
    {
      deep: input.deep === true,
      context: {
        owner: context.owner || 'capability-audit',
        permissions: context.permissions || [],
        requestId: context.requestId || crypto.randomUUID(),
      },
    }
  ));
}
