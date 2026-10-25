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
    risk: 'MEDIUM',
    permissions: [],
    health: env?.DB ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input, context = {}) => {
    const { runMelSelfAuditSupervisor } = await import('../diagnostics/self-audit-supervisor.js');
    const level = String(input?.level || 'DAILY').toUpperCase();
    if (context?.releaseSmoke === true && level !== 'HEARTBEAT') {
      const error = new Error('SELF_AUDIT_RELEASE_SMOKE_HEARTBEAT_ONLY');
      error.code = 'SELF_AUDIT_RELEASE_SMOKE_HEARTBEAT_ONLY';
      error.status = 403;
      throw error;
    }
    return runMelSelfAuditSupervisor(env, {
      bus,
      forceLevel: level,
      maxLevel: level,
      repairEnabled: context?.releaseSmoke !== true,
      waitUntil: typeof context?.waitUntil === 'function' ? context.waitUntil : null,
    });
  });
  // Deep audit capability: runs capability.audit with deep=true and returns counts of called, refused, and failed capabilities
  bus.discover({
    id: 'self.audit.deep',
    name: 'Lancer le Self-Audit Profond',
    category: 'diagnostic',
    version: '1.0.0',
    provider: 'core',
    description: 'Executes capability.audit with deep=true and returns counts of called, refused, and failed capabilities.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: {
      type: 'object',
      properties: {
        called: { type: 'integer' },
        refused: { type: 'integer' },
        failed: { type: 'integer' },
      },
      required: ['called', 'refused', 'failed'],
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: [],
    health: env?.DB ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input, context = {}) => {
    const auditResult = await bus.execute('capability.audit', { deep: true });
    const rows = Array.isArray(auditResult?.rows) ? auditResult.rows : [];
    const called = rows.filter(r => r.execution).length;
    const refused = rows.filter(r => r.truth_status === 'REFUSEE').length;
    const failed = rows.filter(r => r.execution && r.execution.ok === false).length;
    return { called, refused, failed };
  });
}
