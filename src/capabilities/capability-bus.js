import { authorize } from '../security/permissions.js';
import { validate } from '../security/validation.js';
import { requireValue } from '../core/contracts.js';
import { assertCapabilityApproval, isCapabilityApprovalPolicyValid } from '../security/approval-gates.js';

// Health diagnostics are included in API/UI inventory responses. Provider error
// messages can contain URLs, tokens or private account data; expose codes only.
function publicHealthDiagnostic(value, fallback = 'HEALTHCHECK_DETAIL_REDACTED') {
  if (typeof value !== 'string') return fallback;
  const code = value.trim();
  // Two documented Microsoft Graph diagnostics are safe, allowlisted error
  // identifiers (not raw upstream messages). Preserve actionable 403 clues.
  if (/^PIPEDREAM_PROXY_FAILED_HTTP_403_(?:Authorization_RequestDenied|accessDenied)$/.test(code)) return code;
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : fallback;
}

/** Construct per composition root; adapters are trusted server code, never client JS. */
export class CapabilityBus {
  // Requests already dispatched in this runtime, to refuse a replay.
  #dispatched = new Set();
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
      const reported = typeof observed === 'object' && observed
        ? (observed.code || observed.reason || observed.detail || '')
        : '';
      const detail = reported ? publicHealthDiagnostic(reported) : '';
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
      entry.record.health_detail = publicHealthDiagnostic(error?.code, 'HEALTHCHECK_FAILED');
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
  // MEL-CHAT-08: one execution identifier runs through validation, permission,
  // dispatch, the typed result and the render. Callers read it from
  // executeDetailed(); the audit rows of one call all carry it.
  async executeDetailed(id, input, context = {}) {
    const executionId = /^[0-9a-f-]{8,64}$/i.test(String(context?.executionId || ''))
      ? String(context.executionId) : crypto.randomUUID();
    const output = await this.execute(id, input, { ...context, executionId });
    return { execution_id: executionId, capability: id, output };
  }

  async execute(id, input, context = {}) {
    const entry = this.records.get(id); requireValue(entry, 'CAPABILITY_NOT_FOUND', 404);
    const event = {
      id: /^[0-9a-f-]{8,64}$/i.test(String(context?.executionId || '')) ? String(context.executionId) : crypto.randomUUID(),
      capability: id,
      owner: context?.owner || null,
      requestId: context?.requestId || null,
    };
    // A replayed dispatch must never run the action twice. Opt-in per call:
    // the caller passes an idempotencyKey for an action it must not duplicate.
    // requestId alone is reused legitimately and never arms this guard.
    const replayKey = context?.idempotencyKey ? id + '\u0000' + String(context.idempotencyKey) : '';
    if (replayKey && this.#dispatched.has(replayKey)) {
      await this.audit({ ...event, status: 'DENIED', reason: 'CAPABILITY_REPLAY_REFUSED' });
      throw Object.assign(new Error('CAPABILITY_REPLAY_REFUSED'), { code: 'CAPABILITY_REPLAY_REFUSED', status: 409, execution_id: event.id });
    }
    let record;
    try {
      // Security gates run before any provider/network health probe. This keeps
      // denied or approval-gated actions side-effect free even when a
      // capability has a live healthcheck.
      record = this.describe(id);
      requireValue(record.enabled, 'CAPABILITY_DISABLED', 409);
      authorize(record.permissions,context);
      assertCapabilityApproval(record, context);
      validate(input,record.input_schema);
      if (entry.healthcheck) {
        await this.refreshHealth(id);
        record = this.describe(id);
      }
      requireValue(record.health !== 'UNAVAILABLE', 'CAPABILITY_UNAVAILABLE', 503);
    } catch (error) {
      await this.audit({
        ...event,
        status:'DENIED',
        reason:String(error?.code || error?.message || 'CAPABILITY_PREFLIGHT_DENIED').slice(0,120),
      });
      throw error;
    }
    const startedAt = Date.now();
    if (replayKey) this.#dispatched.add(replayKey);
    await this.audit({...event,status:'STARTED'});
    try {
      const output = await entry.execute(input,context);
      // An output that breaks its contract is never a success. The original
      // validation error keeps its code and status; it only gains the facts a
      // caller needs: which execution, and that the action may already have run.
      try { validate(output,record.output_schema); }
      catch (invalid) {
        if (invalid && typeof invalid === 'object') {
          invalid.execution_id = event.id;
          invalid.output_contract_violation = true;
          invalid.action_may_have_run = true;
        }
        throw invalid;
      }
      await this.audit({...event,status:'SUCCEEDED',duration_ms:Math.max(0,Date.now()-startedAt)});
      return output;
    } catch (error) {
      await this.audit({
        ...event,
        status:'FAILED',
        duration_ms:Math.max(0,Date.now()-startedAt),
        error_code:String(error?.code || error?.message || 'CAPABILITY_FAILED').slice(0,120),
      });
      if (error && typeof error === 'object' && !error.execution_id) error.execution_id = event.id;
      throw error;
    }
  }
}

// MEL-MANIFEST-03: a delivered skill reaches the ONE canonical bus, or it does
// not exist. Registration demands a verified delivery receipt: a red CI, a name
// already taken, or a missing proof stops it. Otherwise MEL would believe it
// owns a skill that was never shipped.
export function skillDeliveryDescriptor(delivery = {}) {
  const id = String(delivery.capability_id || '').trim();
  const sha = String(delivery.candidate_sha || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,80}$/.test(id)) throw Object.assign(new Error('SKILL_DELIVERY_ID_INVALID'), { code: 'SKILL_DELIVERY_ID_INVALID' });
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Object.assign(new Error('SKILL_DELIVERY_SHA_REQUIRED'), { code: 'SKILL_DELIVERY_SHA_REQUIRED' });
  if (delivery.ci_passed !== true) throw Object.assign(new Error('SKILL_DELIVERY_CI_RED'), { code: 'SKILL_DELIVERY_CI_RED' });
  if (!Number(delivery.ci_run_id)) throw Object.assign(new Error('SKILL_DELIVERY_PROOF_REQUIRED'), { code: 'SKILL_DELIVERY_PROOF_REQUIRED' });
  return { schema: 'mel.skill-delivery-descriptor/v1', capability_id: id, candidate_sha: sha,
    ci_run_id: Number(delivery.ci_run_id), roadmap_id: String(delivery.roadmap_id || '').slice(0, 60) || null };
}

// Registers the delivered skill on this bus, once. A name already taken is a
// conflict, never a silent overwrite of a live capability.
export function registerDeliveredSkill(bus, delivery, record, execute, healthcheck = null) {
  const descriptor = skillDeliveryDescriptor(delivery);
  if (!bus || typeof bus.discover !== 'function') throw Object.assign(new Error('CAPABILITY_BUS_REQUIRED'), { code: 'CAPABILITY_BUS_REQUIRED' });
  if (String(record?.id || '') !== descriptor.capability_id) throw Object.assign(new Error('SKILL_DELIVERY_ID_MISMATCH'), { code: 'SKILL_DELIVERY_ID_MISMATCH' });
  if (bus.records?.has?.(descriptor.capability_id)) throw Object.assign(new Error('SKILL_DELIVERY_NAME_CONFLICT'), { code: 'SKILL_DELIVERY_NAME_CONFLICT' });
  bus.discover({ ...record, delivery: descriptor }, execute, healthcheck);
  return descriptor;
}
