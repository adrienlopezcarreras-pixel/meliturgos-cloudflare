export const COLD_STANDBY_SCHEMA = 'mel.resilience.cold-standby.v1';

export const COLD_STANDBY_STATE = Object.freeze({
  NOT_READY: 'NOT_READY',
  READY: 'READY',
  ACTIVATION_AUTHORIZED: 'ACTIVATION_AUTHORIZED',
  DENIED: 'DENIED',
});

const HASH_RE = /^[a-f0-9]{64}$/i;
const MAX_TEXT = 240;

function text(value, max = MAX_TEXT) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeApproval(value = {}) {
  return {
    approved: value?.approved === true,
    action: text(value?.action, 80),
    standby_id: text(value?.standby_id),
    manifest_sha256: text(value?.manifest_sha256, 64).toLowerCase(),
  };
}

export function normalizeColdStandby(input = {}) {
  return {
    schema: COLD_STANDBY_SCHEMA,
    standby_id: text(input.standby_id),
    owner_halt: input.owner_halt === true,
    recovery: {
      bundle_id: text(input.recovery?.bundle_id),
      source_commit: text(input.recovery?.source_commit, 120),
      manifest_sha256: text(input.recovery?.manifest_sha256, 64).toLowerCase(),
      verified: input.recovery?.verified === true,
    },
    destination: {
      id: text(input.destination?.id),
      provider: text(input.destination?.provider, 120),
      location_hint: text(input.destination?.location_hint, 300),
      authorized: input.destination?.authorized === true,
      encrypted: input.destination?.encrypted === true,
    },
    readiness: {
      snapshot_present: input.readiness?.snapshot_present === true,
      config_present: input.readiness?.config_present === true,
      identity_present: input.readiness?.identity_present === true,
      restore_tested: input.readiness?.restore_tested === true,
      integrity_verified: input.readiness?.integrity_verified === true,
      checked_at: text(input.readiness?.checked_at, 80),
    },
    activation: {
      requested: input.activation?.requested === true,
      mode: text(input.activation?.mode, 40).toUpperCase() || 'MANUAL',
      approval: normalizeApproval(input.activation?.approval),
    },
  };
}

function readinessFailures(request) {
  const failures = [];
  if (!request.standby_id) failures.push('STANDBY_ID_REQUIRED');
  if (!request.recovery.bundle_id) failures.push('RECOVERY_BUNDLE_REQUIRED');
  if (!request.recovery.source_commit) failures.push('SOURCE_COMMIT_REQUIRED');
  if (!HASH_RE.test(request.recovery.manifest_sha256)) failures.push('VALID_MANIFEST_HASH_REQUIRED');
  if (!request.recovery.verified) failures.push('RECOVERY_BUNDLE_VERIFICATION_REQUIRED');
  if (!request.destination.id) failures.push('DESTINATION_REQUIRED');
  if (!request.destination.authorized) failures.push('AUTHORIZED_DESTINATION_REQUIRED');
  if (!request.destination.encrypted) failures.push('ENCRYPTED_DESTINATION_REQUIRED');
  if (!request.readiness.snapshot_present) failures.push('SNAPSHOT_REQUIRED');
  if (!request.readiness.config_present) failures.push('CONFIG_REQUIRED');
  if (!request.readiness.identity_present) failures.push('IDENTITY_REQUIRED');
  if (!request.readiness.restore_tested) failures.push('RESTORE_TEST_REQUIRED');
  if (!request.readiness.integrity_verified) failures.push('INTEGRITY_VERIFICATION_REQUIRED');
  if (!request.readiness.checked_at) failures.push('READINESS_TIMESTAMP_REQUIRED');
  return failures;
}

function activationApprovalMatches(request) {
  const approval = request.activation.approval;
  return approval.approved === true
    && approval.action === 'ACTIVATE_COLD_STANDBY'
    && approval.standby_id === request.standby_id
    && approval.manifest_sha256 === request.recovery.manifest_sha256;
}

/**
 * MEL-RES-04 gate for a cold standby.
 *
 * A standby can be READY without being activated. Activation is deliberately
 * manual-only and requires an approval scoped to the standby and exact recovery
 * manifest. Owner halt always wins. No provider-specific deployment happens here.
 */
export function evaluateColdStandby(input = {}) {
  const request = normalizeColdStandby(input);

  if (request.owner_halt) {
    return result(request, COLD_STANDBY_STATE.DENIED, ['OWNER_HALT_ACTIVE']);
  }

  const failures = readinessFailures(request);
  if (failures.length > 0) {
    return result(request, COLD_STANDBY_STATE.NOT_READY, failures);
  }

  if (!request.activation.requested) {
    return result(request, COLD_STANDBY_STATE.READY, []);
  }

  if (request.activation.mode !== 'MANUAL') {
    return result(request, COLD_STANDBY_STATE.DENIED, ['AUTOMATIC_ACTIVATION_FORBIDDEN']);
  }

  if (!activationApprovalMatches(request)) {
    return result(request, COLD_STANDBY_STATE.DENIED, ['EXACT_ACTIVATION_APPROVAL_REQUIRED']);
  }

  return result(request, COLD_STANDBY_STATE.ACTIVATION_AUTHORIZED, []);
}

export function createColdStandbyPlan(input = {}) {
  const evaluation = evaluateColdStandby(input);
  return Object.freeze({
    schema: COLD_STANDBY_SCHEMA,
    standby_id: evaluation.request.standby_id || null,
    state: evaluation.state,
    ready: evaluation.ready,
    activation_allowed: evaluation.activation_allowed,
    failures: Object.freeze([...evaluation.failures]),
    source_commit: evaluation.request.recovery.source_commit || null,
    recovery_bundle_id: evaluation.request.recovery.bundle_id || null,
    manifest_sha256: evaluation.request.recovery.manifest_sha256 || null,
    destination_id: evaluation.request.destination.id || null,
    destination_provider: evaluation.request.destination.provider || null,
    activation_mode: 'MANUAL',
    policy: Object.freeze({
      automatic_activation: false,
      owner_halt_always_wins: true,
      authorized_encrypted_destination_required: true,
      exact_manifest_approval_required: true,
      restore_test_required: true,
      integrity_verification_required: true,
    }),
  });
}

export function createColdStandbyController({
  adapter,
  authorize = async () => false,
  audit = async () => {},
} = {}) {
  if (!adapter || typeof adapter.prepare !== 'function' || typeof adapter.activate !== 'function') {
    throw standbyError('COLD_STANDBY_ADAPTER_REQUIRED');
  }
  if (typeof authorize !== 'function') throw standbyError('COLD_STANDBY_AUTHORIZER_REQUIRED');
  if (typeof audit !== 'function') throw standbyError('COLD_STANDBY_AUDIT_REQUIRED');

  return Object.freeze({
    async prepare(input = {}, context = {}) {
      const evaluation = evaluateColdStandby({
        ...input,
        activation: { ...(input.activation || {}), requested: false },
      });
      if (evaluation.state === COLD_STANDBY_STATE.DENIED || evaluation.state === COLD_STANDBY_STATE.NOT_READY) {
        await audit(auditRow(evaluation, 'PREPARE_DENIED'));
        throw standbyError(evaluation.failures[0] || 'COLD_STANDBY_NOT_READY');
      }

      const authorized = await authorize('resilience:standby:prepare', scope(evaluation, context));
      if (!authorized) {
        await audit(auditRow(evaluation, 'PREPARE_DENIED', 'GLOBAL_PERMISSION_DENIED'));
        throw standbyError('GLOBAL_PERMISSION_DENIED');
      }

      const plan = createColdStandbyPlan(evaluation.request);
      const adapterResult = await adapter.prepare(plan, context);
      await audit(auditRow(evaluation, 'PREPARED'));
      return { ok: true, plan, adapter_result: adapterResult ?? null };
    },

    async activate(input = {}, context = {}) {
      const evaluation = evaluateColdStandby(input);
      if (evaluation.state !== COLD_STANDBY_STATE.ACTIVATION_AUTHORIZED) {
        await audit(auditRow(evaluation, 'ACTIVATION_DENIED'));
        throw standbyError(evaluation.failures[0] || 'COLD_STANDBY_ACTIVATION_NOT_AUTHORIZED');
      }

      const authorized = await authorize('resilience:standby:activate', scope(evaluation, context));
      if (!authorized) {
        await audit(auditRow(evaluation, 'ACTIVATION_DENIED', 'GLOBAL_PERMISSION_DENIED'));
        throw standbyError('GLOBAL_PERMISSION_DENIED');
      }

      const plan = createColdStandbyPlan(evaluation.request);
      const adapterResult = await adapter.activate(plan, context);
      await audit(auditRow(evaluation, 'ACTIVATED'));
      return { ok: true, plan, adapter_result: adapterResult ?? null };
    },
  });
}

function result(request, state, failures) {
  const ready = state === COLD_STANDBY_STATE.READY || state === COLD_STANDBY_STATE.ACTIVATION_AUTHORIZED;
  return Object.freeze({
    schema: COLD_STANDBY_SCHEMA,
    request,
    state,
    ready,
    activation_allowed: state === COLD_STANDBY_STATE.ACTIVATION_AUTHORIZED,
    failures: Object.freeze([...failures]),
  });
}

function scope(evaluation, context) {
  return {
    ...context,
    standbyId: evaluation.request.standby_id,
    bundleId: evaluation.request.recovery.bundle_id,
    manifestSha256: evaluation.request.recovery.manifest_sha256,
    destinationId: evaluation.request.destination.id,
  };
}

function auditRow(evaluation, status, reason = null) {
  return {
    kind: 'COLD_STANDBY_AUDIT',
    schema: COLD_STANDBY_SCHEMA,
    standby_id: evaluation.request.standby_id || null,
    recovery_bundle_id: evaluation.request.recovery.bundle_id || null,
    manifest_sha256: evaluation.request.recovery.manifest_sha256 || null,
    destination_id: evaluation.request.destination.id || null,
    state: evaluation.state,
    status,
    reason: reason || evaluation.failures[0] || 'OK',
  };
}

function standbyError(code) {
  const error = new Error(code);
  error.name = 'ColdStandbyError';
  error.code = code;
  return error;
}
