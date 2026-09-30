import { port, requireValue } from '../core/contracts.js';

export const PERMISSION_TIERS = Object.freeze({
  READ: 'READ',
  SAFE_WRITE: 'SAFE_WRITE',
  SENSITIVE: 'SENSITIVE',
  DESTRUCTIVE: 'DESTRUCTIVE',
});

export const RUN_STATUSES = Object.freeze({
  AUTHORIZED: 'AUTHORIZED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

const TIER_RANK = Object.freeze({
  [PERMISSION_TIERS.READ]: 0,
  [PERMISSION_TIERS.SAFE_WRITE]: 1,
  [PERMISSION_TIERS.SENSITIVE]: 2,
  [PERMISSION_TIERS.DESTRUCTIVE]: 3,
});

export const methods = Object.freeze([
  'authorizeRun',
  'completeRun',
  'failRun',
  'getRun',
  'listRuns',
]);

export const createAgentAutomationPolicy = (adapters = {}) => port('agent_automation_policy', methods, adapters);

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const clone = value => structuredClone(value);

function canonicalStrings(value, code, { min = 0 } = {}) {
  requireValue(Array.isArray(value) && value.length >= min, code, 400);
  const normalized = value.map(item => {
    requireValue(nonEmptyString(item), code, 400);
    return item.trim();
  });
  requireValue(new Set(normalized).size === normalized.length, `${code}_DUPLICATE`, 400);
  return normalized.sort((a, b) => a.localeCompare(b));
}

function validTier(value) {
  return Object.prototype.hasOwnProperty.call(TIER_RANK, value);
}

export function automationExecutionPolicy(input = {}) {
  requireValue(isRecord(input), 'AUTOMATION_POLICY_INVALID', 400);
  requireValue(nonEmptyString(input.automation_id), 'AUTOMATION_ID_INVALID', 400);
  requireValue(nonEmptyString(input.agent_id), 'AUTOMATION_AGENT_ID_INVALID', 400);
  requireValue(validTier(input.permission_tier), 'AUTOMATION_PERMISSION_TIER_INVALID', 400);
  requireValue(input.enabled === undefined || typeof input.enabled === 'boolean', 'AUTOMATION_ENABLED_INVALID', 400);

  return clone({
    automation_id: input.automation_id.trim(),
    agent_id: input.agent_id.trim(),
    required_capabilities: canonicalStrings(
      input.required_capabilities ?? [],
      'AUTOMATION_REQUIRED_CAPABILITIES_INVALID',
      { min: 1 },
    ),
    permission_tier: input.permission_tier,
    enabled: input.enabled ?? true,
    metadata: isRecord(input.metadata) ? clone(input.metadata) : {},
  });
}

export function authorizeRunRequest(input = {}) {
  requireValue(isRecord(input), 'AUTOMATION_RUN_INVALID', 400);
  requireValue(nonEmptyString(input.run_id), 'AUTOMATION_RUN_ID_INVALID', 400);
  requireValue(nonEmptyString(input.idempotency_key), 'AUTOMATION_IDEMPOTENCY_KEY_INVALID', 400);
  requireValue(nonEmptyString(input.owner), 'AUTOMATION_OWNER_INVALID', 400);
  requireValue(validTier(input.granted_tier), 'AUTOMATION_GRANTED_TIER_INVALID', 400);
  requireValue(Number.isFinite(input.requested_at), 'AUTOMATION_REQUESTED_AT_INVALID', 400);
  requireValue(input.approved === undefined || typeof input.approved === 'boolean', 'AUTOMATION_APPROVAL_INVALID', 400);

  return {
    run_id: input.run_id.trim(),
    idempotency_key: input.idempotency_key.trim(),
    owner: input.owner.trim(),
    granted_capabilities: canonicalStrings(input.granted_capabilities ?? [], 'AUTOMATION_GRANTED_CAPABILITIES_INVALID'),
    granted_tier: input.granted_tier,
    requested_at: input.requested_at,
    approved: input.approved === true,
  };
}

function completionRequest(input = {}, kind) {
  requireValue(isRecord(input), `AUTOMATION_${kind}_INVALID`, 400);
  requireValue(nonEmptyString(input.run_id), 'AUTOMATION_RUN_ID_INVALID', 400);
  const timeField = kind === 'COMPLETE' ? 'completed_at' : 'failed_at';
  requireValue(Number.isFinite(input[timeField]), `AUTOMATION_${kind}_TIME_INVALID`, 400);
  if (kind === 'FAIL') requireValue(nonEmptyString(input.error_code), 'AUTOMATION_FAILURE_CODE_INVALID', 400);
  return {
    run_id: input.run_id.trim(),
    [timeField]: input[timeField],
    ...(kind === 'FAIL' ? { error_code: input.error_code.trim() } : {}),
    ...(isRecord(input.result) ? { result: clone(input.result) } : {}),
  };
}

export function listRunsRequest(input = {}) {
  requireValue(isRecord(input), 'AUTOMATION_RUN_LIST_INVALID', 400);
  requireValue(input.status === undefined || Object.values(RUN_STATUSES).includes(input.status), 'AUTOMATION_RUN_STATUS_INVALID', 400);
  requireValue(input.automation_id === undefined || nonEmptyString(input.automation_id), 'AUTOMATION_ID_INVALID', 400);
  const limit = input.limit ?? 100;
  requireValue(Number.isInteger(limit) && limit > 0 && limit <= 500, 'AUTOMATION_RUN_LIMIT_INVALID', 400);
  return {
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.automation_id === undefined ? {} : { automation_id: input.automation_id.trim() }),
    limit,
  };
}

function runIdRequest(input = {}) {
  requireValue(isRecord(input) && nonEmptyString(input.run_id), 'AUTOMATION_RUN_ID_INVALID', 400);
  return input.run_id.trim();
}

function snapshot(record) {
  return clone({
    run_id: record.run_id,
    automation_id: record.policy.automation_id,
    agent_id: record.policy.agent_id,
    owner: record.owner,
    idempotency_key: record.idempotency_key,
    required_capabilities: record.policy.required_capabilities,
    permission_tier: record.policy.permission_tier,
    status: record.status,
    requested_at: record.requested_at,
    ...(record.completed_at !== undefined ? { completed_at: record.completed_at } : {}),
    ...(record.failed_at !== undefined ? { failed_at: record.failed_at } : {}),
    ...(record.error_code ? { error_code: record.error_code } : {}),
    ...(record.result ? { result: record.result } : {}),
  });
}

/**
 * Reference GEN2-39 adapter.
 *
 * It does not execute tools. It creates a bounded authorization claim that an
 * executor can consume after CapabilityBus has supplied the owner's grants.
 * This keeps agents/automations provider-neutral and makes permission tiers,
 * idempotency and destructive approval explicit before side effects occur.
 */
export function createInMemoryAgentAutomationPolicyAdapter() {
  const runs = new Map();
  const idempotency = new Map();
  let sequence = 0;

  const requireRun = runId => {
    const record = runs.get(runId);
    requireValue(record, 'AUTOMATION_RUN_NOT_FOUND', 404);
    return record;
  };

  return Object.freeze({
    async authorizeRun(input) {
      requireValue(isRecord(input), 'AUTOMATION_RUN_INVALID', 400);
      const policy = automationExecutionPolicy(input.policy);
      const request = authorizeRunRequest(input);
      requireValue(policy.enabled, 'AUTOMATION_DISABLED', 409);

      const idemOwner = idempotency.get(request.idempotency_key);
      if (idemOwner) {
        const existing = requireRun(idemOwner);
        requireValue(
          existing.policy.automation_id === policy.automation_id
            && existing.owner === request.owner
            && existing.run_id === request.run_id,
          'AUTOMATION_IDEMPOTENCY_CONFLICT',
          409,
        );
        return { claim: snapshot(existing), deduplicated: true };
      }

      requireValue(!runs.has(request.run_id), 'AUTOMATION_RUN_ID_EXISTS', 409);
      requireValue(
        TIER_RANK[request.granted_tier] >= TIER_RANK[policy.permission_tier],
        'AUTOMATION_PERMISSION_TIER_DENIED',
        403,
      );

      const grants = new Set(request.granted_capabilities);
      const missing = policy.required_capabilities.filter(capability => !grants.has(capability));
      requireValue(missing.length === 0, 'AUTOMATION_CAPABILITY_DENIED', 403);
      requireValue(policy.permission_tier !== PERMISSION_TIERS.DESTRUCTIVE || request.approved, 'AUTOMATION_EXPLICIT_APPROVAL_REQUIRED', 403);

      const record = {
        run_id: request.run_id,
        policy,
        owner: request.owner,
        idempotency_key: request.idempotency_key,
        requested_at: request.requested_at,
        status: RUN_STATUSES.AUTHORIZED,
        sequence: sequence++,
      };
      runs.set(record.run_id, record);
      idempotency.set(record.idempotency_key, record.run_id);
      return { claim: snapshot(record), deduplicated: false };
    },

    async completeRun(input) {
      const request = completionRequest(input, 'COMPLETE');
      const record = requireRun(request.run_id);
      if (record.status === RUN_STATUSES.COMPLETED) return snapshot(record);
      requireValue(record.status === RUN_STATUSES.AUTHORIZED, 'AUTOMATION_RUN_NOT_ACTIVE', 409);
      record.status = RUN_STATUSES.COMPLETED;
      record.completed_at = request.completed_at;
      if (request.result) record.result = request.result;
      return snapshot(record);
    },

    async failRun(input) {
      const request = completionRequest(input, 'FAIL');
      const record = requireRun(request.run_id);
      if (record.status === RUN_STATUSES.FAILED) {
        requireValue(record.error_code === request.error_code, 'AUTOMATION_FAILURE_CONFLICT', 409);
        return snapshot(record);
      }
      requireValue(record.status === RUN_STATUSES.AUTHORIZED, 'AUTOMATION_RUN_NOT_ACTIVE', 409);
      record.status = RUN_STATUSES.FAILED;
      record.failed_at = request.failed_at;
      record.error_code = request.error_code;
      if (request.result) record.result = request.result;
      return snapshot(record);
    },

    async getRun(input) {
      return snapshot(requireRun(runIdRequest(input)));
    },

    async listRuns(input = {}) {
      const query = listRunsRequest(input);
      return [...runs.values()]
        .filter(record => query.status === undefined || record.status === query.status)
        .filter(record => query.automation_id === undefined || record.policy.automation_id === query.automation_id)
        .sort((a, b) => a.sequence - b.sequence)
        .slice(0, query.limit)
        .map(snapshot);
    },
  });
}
