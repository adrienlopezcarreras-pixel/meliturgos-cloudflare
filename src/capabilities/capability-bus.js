import { authorize } from '../security/permissions.js';
import { validate } from '../security/validation.js';
import { requireValue } from '../core/contracts.js';
import { assertCapabilityApproval, isCapabilityApprovalPolicyValid } from '../security/approval-gates.js';

/** Construct per composition root; adapters are trusted server code, never client JS. */
export class CapabilityBus {
  constructor({audit = async () => {}} = {}) { this.records = new Map(); this.audit = audit; }
  discover(record, execute, healthcheck = null) {
    for (const field of ['id','name','category','version','provider','description','input_schema','output_schema','risk','permissions','health','enabled']) requireValue(record[field] !== undefined, 'INVALID_CAPABILITY');
    requireValue(!this.records.has(record.id) && typeof execute === 'function' && Array.isArray(record.permissions) && typeof record.enabled === 'boolean', 'INVALID_CAPABILITY');
    requireValue(isCapabilityApprovalPolicyValid(record.approval), 'INVALID_CAPABILITY');
    const inlineHealthcheck = record.healthcheck ?? null;
    const resolvedHealthcheck = healthcheck ?? inlineHealthcheck;
    requireValue(resolvedHealthcheck === null || typeof resolvedHealthcheck === 'function', 'INVALID_CAPABILITY');
    const storedRecord = { ...record };
    delete storedRecord.healthcheck;
    this.records.set(record.id, {record: structuredClone(storedRecord), execute, healthcheck: resolvedHealthcheck});
    return this.describe(record.id);
  }
  replace(record, execute, healthcheck = null) {
    for (const field of ['id','name','category','version','provider','description','input_schema','output_schema','risk','permissions','health','enabled']) requireValue(record[field] !== undefined, 'INVALID_CAPABILITY');
    requireValue(this.records.has(record.id) && typeof execute === 'function' && Array.isArray(record.permissions) && typeof record.enabled === 'boolean', 'INVALID_CAPABILITY');
    requireValue(isCapabilityApprovalPolicyValid(record.approval), 'INVALID_CAPABILITY');
    const inlineHealthcheck = record.healthcheck ?? null;
    const resolvedHealthcheck = healthcheck ?? inlineHealthcheck;
    requireValue(resolvedHealthcheck === null || typeof resolvedHealthcheck === 'function', 'INVALID_CAPABILITY');
    const storedRecord = { ...record };
    delete storedRecord.healthcheck;
    this.records.set(record.id, {record: structuredClone(storedRecord), execute, healthcheck: resolvedHealthcheck});
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
    const approvalValid = isCapabilityApprovalPolicyValid(record.approval);
    const valid = inputSchemaValid && outputSchemaValid && permissionsValid && riskValid && healthValid && enabledValid && handlerRegistered && healthcheckValid && approvalValid;
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
      approval_policy_valid: approvalValid,
      explicit_approval_gate: record.approval?.required === true,
      authorization_gate: true,
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
      const detail = typeof observed === 'object' && observed
        ? String(observed.reason || observed.code || observed.detail || '').trim()
        : '';
      entry.record.health = status === 'ONLINE' || status === 'HEALTHY'
        ? 'HEALTHY'
        : status === 'SAFE_IDLE' || status === 'PROTECTED'
          ? 'PROTECTED'
          : status === 'OFFLINE' || status === 'UNAVAILABLE'
            ? 'UNAVAILABLE'
            : 'DEGRADED';
      if (detail) entry.record.health_detail = detail.slice(0, 240);
      else delete entry.record.health_detail;
    } catch (error) {
      entry.record.health = 'DEGRADED';
      entry.record.health_detail = String(error?.code || error?.message || 'HEALTHCHECK_FAILED').slice(0, 240);
    }
    return this.describe(id);
  }
  async refreshHealthAll() {
    const ids = [...this.records.keys()];
    const concurrency = 6;
    for (let index = 0; index < ids.length; index += concurrency) {
      await Promise.all(ids.slice(index, index + concurrency).map(id => this.refreshHealth(id)));
    }
    return this.list();
  }
  enable(id, context) { authorize(['capabilities.manage'],context); this.records.get(this.describe(id).id).record.enabled = true; }
  disable(id, context) { authorize(['capabilities.manage'],context); this.records.get(this.describe(id).id).record.enabled = false; }
  async execute(id, input, context = {}) {
    const entry = this.records.get(id); requireValue(entry, 'CAPABILITY_NOT_FOUND', 404);
    const event = {
      id: crypto.randomUUID(),
      capability: id,
      owner: context?.owner || null,
      requestId: context?.requestId || null,
    };
    let record;
    try {
      if (entry.healthcheck) await this.refreshHealth(id);
      record = this.describe(id);
      requireValue(record.enabled, 'CAPABILITY_DISABLED', 409);
      requireValue(record.health !== 'UNAVAILABLE', 'CAPABILITY_UNAVAILABLE', 503);
      authorize(record.permissions,context);
      assertCapabilityApproval(record, context);
      validate(input,record.input_schema);
    } catch (error) {
      await this.audit({
        ...event,
        status:'DENIED',
        reason:String(error?.code || error?.message || 'CAPABILITY_PREFLIGHT_DENIED').slice(0,120),
      });
      throw error;
    }
    const startedAt = Date.now();
    await this.audit({...event,status:'STARTED'});
    try {
      const output = await entry.execute(input,context);
      validate(output,record.output_schema);
      await this.audit({...event,status:'SUCCEEDED',duration_ms:Math.max(0,Date.now()-startedAt)});
      return output;
    } catch (error) {
      await this.audit({
        ...event,
        status:'FAILED',
        duration_ms:Math.max(0,Date.now()-startedAt),
        error_code:String(error?.code || error?.message || 'CAPABILITY_FAILED').slice(0,120),
      });
      throw error;
    }
  }
}
