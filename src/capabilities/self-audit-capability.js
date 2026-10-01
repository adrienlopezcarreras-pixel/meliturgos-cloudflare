export function registerSelfAuditCapabilities(bus, env = {}) {
  bus.discover({
    id: 'self.audit.status',
    name: 'Statut du Self-Audit Supervisor',
    category: 'diagnostic',
    version: '1.0.0',
    provider: 'core',
    description: 'Reads the persistent MEL self-audit cadence, latest report, latest global stress job and repair state without starting a new audit.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env?.DB ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async () => {
    const { readMelSelfAuditStatus } = await import('../diagnostics/self-audit-supervisor.js');
    return readMelSelfAuditStatus(env);
  });

  bus.discover({
    id: 'self.audit.run',
    name: 'Lancer le Self-Audit Supervisor',
    category: 'diagnostic',
    version: '1.0.0',
    provider: 'core',
    description: 'Runs a bounded MEL self-audit level. HEARTBEAT is lightweight, DAILY refreshes health and watch pipelines, WEEKLY starts the durable full capability stress, MONTHLY adds non-destructive survival and backup drills.',
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['HEARTBEAT','DAILY','WEEKLY','MONTHLY'] },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env?.DB ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input, context = {}) => {
    const { runMelSelfAuditSupervisor } = await import('../diagnostics/self-audit-supervisor.js');
    const level = String(input?.level || 'DAILY').toUpperCase();
    return runMelSelfAuditSupervisor(env, {
      bus,
      forceLevel: level,
      maxLevel: level,
      waitUntil: typeof context?.waitUntil === 'function' ? context.waitUntil : null,
    });
  });
}
