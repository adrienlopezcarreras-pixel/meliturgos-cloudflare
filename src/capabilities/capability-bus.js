import { authorize } from '../security/permissions.js';
import { validate } from '../security/validation.js';
import { requireValue } from '../core/contracts.js';
import { requireExplicitApproval } from '../security/explicit-approval.js';

/** Construct per composition root; adapters are trusted server code, never client JS. */
export class CapabilityBus {
  constructor({audit = async () => {}} = {}) { this.records = new Map(); this.audit = audit; }
  discover(record, execute, healthcheck = null) {
    for (const field of ['id','name','category','version','provider','description','input_schema','output_schema','risk','permissions','health','enabled']) requireValue(record[field] !== undefined, 'INVALID_CAPABILITY');
    requireValue(!this.records.has(record.id) && typeof execute === 'function' && Array.isArray(record.permissions) && typeof record.enabled === 'boolean', 'INVALID_CAPABILITY');
    const inlineHealthcheck = record.healthcheck ?? null;
    const inlineApprovalcheck = record.approvalcheck ?? null;
    const resolvedHealthcheck = healthcheck ?? inlineHealthcheck;
    requireValue(resolvedHealthcheck === null || typeof resolvedHealthcheck === 'function', 'INVALID_CAPABILITY');
    requireValue(inlineApprovalcheck === null || typeof inlineApprovalcheck === 'function', 'INVALID_CAPABILITY');
    if (record.approval !== undefined) {
      requireValue(record.approval && typeof record.approval === 'object' && !Array.isArray(record.approval), 'INVALID_CAPABILITY');
      requireValue(record.approval.mode === 'EXPLICIT_CURRENT_REQUEST', 'INVALID_CAPABILITY');
      requireValue(typeof inlineApprovalcheck === 'function', 'INVALID_CAPABILITY');
    }
    const storedRecord = { ...record };
    delete storedRecord.healthcheck;
    delete storedRecord.approvalcheck;
    this.records.set(record.id, {
      record: structuredClone(storedRecord),
      execute,
      healthcheck: resolvedHealthcheck,
      approvalcheck: inlineApprovalcheck,
    });
    return this.describe(record.id);
  }
  list() { return [...this.records.values()].map(x => structuredClone(x.record)); }
  search(query) { return this.list().filter(x => `${x.id} ${x.name} ${x.description}`.toLowerCase().includes(String(query).toLowerCase())); }
  describe(id) { const entry = this.records.get(id); requireValue(entry, 'CAPABILITY_NOT_FOUND', 404); return structuredClone(entry.record); }
  health(id) { return this.describe(id).health; }
  contract(id) {
    const entry = this.records.get(id); requireValue(entry, 'CAPABILITY_NOT_FOUND', 404);
    const record = entry.record || {};
    const inputSchemaValid = Boolean(record.input_schema && typeof record.input_schema === 'object' && !Array.isArray(record.input_schema));
    const outputSchemaValid = Boolean(record.output_schema && typeof record.output_schema === 'object' && !Array.isArray(record.output_schema));
    const permissionsValid = Array.isArray(record.permissions) && record.permissions.every(value => typeof value === 'string' && value.trim().length > 0);
    const riskValid = ['LOW','MEDIUM','HIGH'].includes(String(record.risk || '').toUpperCase());
    const healthValid = typeof record.health === 'string' && record.health.trim().length > 0;
    const enabledValid = typeof record.enabled === 'boolean';
    const handlerRegistered = typeof entry.execute === 'function';
    const healthcheckValid = entry.healthcheck === null || typeof entry.healthcheck === 'function';
    const approvalGateValid = record.approval === undefined
      || (record.approval?.mode === 'EXPLICIT_CURRENT_REQUEST' && typeof entry.approvalcheck === 'function');
    const valid = inputSchemaValid && outputSchemaValid && permissionsValid && riskValid && healthValid && enabledValid && handlerRegistered && healthcheckValid && approvalGateValid;
    return Object.freeze({
      valid,
      handler_registered: handlerRegistered,
      input_schema_valid: inputSchemaValid,
      output_schema_valid: outputSchemaValid,
      permissions_valid: permissionsValid,
      risk_valid: riskValid,
      health_valid: healthValid,
      enabled_boolean: enabledValid,
      healthcheck_valid: healthcheckValid,
      authorization_gate: true,
      explicit_approval_gate: approvalGateValid,
      input_validation_gate: true,
      output_validation_gate: true,
    });
  }
  async refreshHealth(id) {
    const entry = this.records.get(id); requireValue(entry, 'CAPABILITY_NOT_FOUND', 404);
    if (!entry.healthcheck) return this.describe(id);
    try {
      const observed = await entry.healthcheck();
      const status = typeof observed === 'string' ? observed : observed?.status;
      entry.record.health = status === 'ONLINE' || status === 'HEALTHY'
        ? 'HEALTHY'
        : status === 'SAFE_IDLE' || status === 'PROTECTED'
          ? 'PROTECTED'
          : status === 'OFFLINE' || status === 'UNAVAILABLE'
            ? 'UNAVAILABLE'
            : 'DEGRADED';
    } catch { entry.record.health = 'DEGRADED'; }
    return this.describe(id);
  }
  async refreshHealthAll() {
    for (const id of this.records.keys()) await this.refreshHealth(id);
    return this.list();
  }
  enable(id, context) { authorize(['capabilities.manage'],context); this.records.get(this.describe(id).id).record.enabled = true; }
  disable(id, context) { authorize(['capabilities.manage'],context); this.records.get(this.describe(id).id).record.enabled = false; }
  async execute(id, input, context) {
    const entry = this.records.get(id); requireValue(entry, 'CAPABILITY_NOT_FOUND', 404);
    if (entry.healthcheck) await this.refreshHealth(id);
    const record = this.describe(id);
    requireValue(record.enabled, 'CAPABILITY_DISABLED', 409);
    requireValue(record.health !== 'UNAVAILABLE', 'CAPABILITY_UNAVAILABLE', 503);
    authorize(record.permissions,context);
    validate(input,record.input_schema);
    let approvalEvidence = null;
    if (typeof entry.approvalcheck === 'function') {
      const requirement = await entry.approvalcheck(input, context);
      if (requirement?.required === true) {
        approvalEvidence = await requireExplicitApproval({ capability: id, input, context });
      }
    }
    const executionContext = approvalEvidence
      ? { ...context, explicitApprovalVerified: approvalEvidence }
      : context;
    const event = {id: crypto.randomUUID(), capability: id, owner: context.owner, requestId: context.requestId};
    await this.audit({...event,status:'STARTED'});
    try {
      const output = await entry.execute(input,executionContext);
      validate(output,record.output_schema);
      await this.audit({...event,status:'SUCCEEDED'});
      return output;
    } catch (error) { await this.audit({...event,status:'FAILED'}); throw error; }
  }
}
