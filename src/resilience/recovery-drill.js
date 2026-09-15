import { RecoveryBundleBuilder } from './recovery-bundle.js';
import { COLD_STANDBY_STATE, evaluateColdStandby } from './cold-standby.js';

export const RECOVERY_DRILL_SCHEMA = 'mel.resilience.recovery-drill.v1';

export const RECOVERY_DRILL_STATE = Object.freeze({
  READY: 'READY',
  DENIED: 'DENIED',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
});

const HASH_RE = /^[a-f0-9]{64}$/i;
const MAX_TEXT = 240;

function text(value, max = MAX_TEXT) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeChecks(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => text(entry, 120)).filter(Boolean))].slice(0, 64);
}

export function normalizeRecoveryDrill(input = {}) {
  const manifest = text(input.bundle?.manifestSha256, 64).toLowerCase();
  return {
    schema: RECOVERY_DRILL_SCHEMA,
    drill_id: text(input.drill_id),
    owner_halt: input.owner_halt === true,
    dry_run: input.dry_run === true,
    environment: {
      id: text(input.environment?.id),
      kind: text(input.environment?.kind, 80).toUpperCase(),
      isolated: input.environment?.isolated === true,
      production_access: input.environment?.production_access === true,
    },
    bundle: input.bundle && typeof input.bundle === 'object' ? input.bundle : null,
    standby: input.standby && typeof input.standby === 'object' ? input.standby : null,
    expected_checks: normalizeChecks(input.expected_checks),
    approval: {
      approved: input.approval?.approved === true,
      action: text(input.approval?.action, 80),
      drill_id: text(input.approval?.drill_id),
      manifest_sha256: text(input.approval?.manifest_sha256, 64).toLowerCase(),
    },
    manifest_sha256: manifest,
  };
}

function approvalMatches(request) {
  const approval = request.approval;
  return approval.approved === true
    && approval.action === 'RUN_RECOVERY_DRILL'
    && approval.drill_id === request.drill_id
    && approval.manifest_sha256 === request.manifest_sha256;
}

/**
 * Static gate before any restore drill work starts.
 *
 * The drill is intentionally dry-run only and must execute in an isolated
 * environment with no production access. A cold standby must be READY but not
 * activation-authorized/requested. This prevents a validation drill from
 * silently becoming a real failover.
 */
export function evaluateRecoveryDrill(input = {}) {
  const request = normalizeRecoveryDrill(input);
  const failures = [];

  if (request.owner_halt) failures.push('OWNER_HALT_ACTIVE');
  if (!request.drill_id) failures.push('DRILL_ID_REQUIRED');
  if (!request.dry_run) failures.push('DRY_RUN_REQUIRED');
  if (!request.environment.id) failures.push('ISOLATED_ENVIRONMENT_REQUIRED');
  if (request.environment.kind !== 'SANDBOX') failures.push('SANDBOX_ENVIRONMENT_REQUIRED');
  if (!request.environment.isolated) failures.push('ENVIRONMENT_ISOLATION_REQUIRED');
  if (request.environment.production_access) failures.push('PRODUCTION_ACCESS_FORBIDDEN');
  if (!request.bundle) failures.push('RECOVERY_BUNDLE_REQUIRED');
  if (!HASH_RE.test(request.manifest_sha256)) failures.push('VALID_MANIFEST_HASH_REQUIRED');
  if (!request.standby) failures.push('COLD_STANDBY_REQUIRED');

  if (request.standby) {
    const standbyResult = evaluateColdStandby({
      ...request.standby,
      activation: { ...(request.standby.activation || {}), requested: false },
    });
    if (standbyResult.state !== COLD_STANDBY_STATE.READY) {
      failures.push('COLD_STANDBY_NOT_READY');
    }
  }

  if (!approvalMatches(request)) failures.push('EXACT_DRILL_APPROVAL_REQUIRED');

  return Object.freeze({
    schema: RECOVERY_DRILL_SCHEMA,
    state: failures.length ? RECOVERY_DRILL_STATE.DENIED : RECOVERY_DRILL_STATE.READY,
    allowed: failures.length === 0,
    failures: Object.freeze(failures),
    request,
  });
}

export function createRecoveryDrillController({
  bundleBuilder = new RecoveryBundleBuilder(),
  adapter,
  authorize = async () => false,
  audit = async () => {},
} = {}) {
  if (!bundleBuilder || typeof bundleBuilder.verify !== 'function') {
    throw drillError('RECOVERY_BUNDLE_VERIFIER_REQUIRED');
  }
  if (!adapter
    || typeof adapter.stage !== 'function'
    || typeof adapter.validate !== 'function'
    || typeof adapter.teardown !== 'function') {
    throw drillError('RECOVERY_DRILL_ADAPTER_REQUIRED');
  }
  if (typeof authorize !== 'function') throw drillError('RECOVERY_DRILL_AUTHORIZER_REQUIRED');
  if (typeof audit !== 'function') throw drillError('RECOVERY_DRILL_AUDIT_REQUIRED');

  return Object.freeze({
    async run(input = {}, context = {}) {
      const gate = evaluateRecoveryDrill(input);
      if (!gate.allowed) {
        await audit(auditRow(gate, RECOVERY_DRILL_STATE.DENIED, gate.failures[0] || 'DRILL_DENIED'));
        throw drillError(gate.failures[0] || 'RECOVERY_DRILL_DENIED');
      }

      const authorized = await authorize('resilience:recovery:drill', scope(gate, context));
      if (!authorized) {
        await audit(auditRow(gate, RECOVERY_DRILL_STATE.DENIED, 'GLOBAL_PERMISSION_DENIED'));
        throw drillError('GLOBAL_PERMISSION_DENIED');
      }

      const integrity = await bundleBuilder.verify(gate.request.bundle);
      if (!integrity?.ok) {
        const code = text(integrity?.code, 120) || 'RECOVERY_BUNDLE_INTEGRITY_FAILED';
        await audit(auditRow(gate, RECOVERY_DRILL_STATE.FAILED, code));
        throw drillError(code);
      }
      if (String(integrity.manifestSha256 || '').toLowerCase() !== gate.request.manifest_sha256) {
        await audit(auditRow(gate, RECOVERY_DRILL_STATE.FAILED, 'MANIFEST_HASH_MISMATCH'));
        throw drillError('MANIFEST_HASH_MISMATCH');
      }

      let staged = false;
      let validation = null;
      let primaryError = null;
      try {
        await adapter.stage({
          drill_id: gate.request.drill_id,
          environment: structuredClone(gate.request.environment),
          bundle: structuredClone(gate.request.bundle),
          standby: structuredClone(gate.request.standby),
        }, context);
        staged = true;

        validation = await adapter.validate({
          drill_id: gate.request.drill_id,
          environment_id: gate.request.environment.id,
          expected_checks: [...gate.request.expected_checks],
          manifest_sha256: gate.request.manifest_sha256,
        }, context);

        const failedChecks = normalizeValidationFailures(validation, gate.request.expected_checks);
        if (failedChecks.length) {
          primaryError = drillError('RECOVERY_DRILL_VALIDATION_FAILED');
          primaryError.failed_checks = failedChecks;
        }
      } catch (error) {
        primaryError = error?.code
          ? error
          : drillError(text(error?.name || 'RECOVERY_DRILL_ADAPTER_FAILURE', 120) || 'RECOVERY_DRILL_ADAPTER_FAILURE');
      } finally {
        if (staged) {
          try {
            await adapter.teardown({
              drill_id: gate.request.drill_id,
              environment_id: gate.request.environment.id,
            }, context);
          } catch (error) {
            if (!primaryError) {
              primaryError = drillError(text(error?.code || error?.name || 'RECOVERY_DRILL_TEARDOWN_FAILED', 120));
            }
          }
        }
      }

      if (primaryError) {
        const code = text(primaryError.code || primaryError.name, 120) || 'RECOVERY_DRILL_FAILED';
        await audit(auditRow(gate, RECOVERY_DRILL_STATE.FAILED, code));
        throw primaryError;
      }

      const report = Object.freeze({
        schema: RECOVERY_DRILL_SCHEMA,
        state: RECOVERY_DRILL_STATE.PASSED,
        ok: true,
        drill_id: gate.request.drill_id,
        environment_id: gate.request.environment.id,
        manifest_sha256: gate.request.manifest_sha256,
        source_commit: text(gate.request.bundle?.source?.commit, 120) || null,
        checks: summarizeValidation(validation, gate.request.expected_checks),
        production_access_used: false,
        activation_performed: false,
        teardown_completed: true,
      });
      await audit(auditRow(gate, RECOVERY_DRILL_STATE.PASSED, 'OK', report.checks));
      return report;
    },
  });
}

function normalizeValidationFailures(validation, expectedChecks) {
  if (!validation || validation.ok !== true) {
    return expectedChecks.length ? [...expectedChecks] : ['VALIDATION_NOT_CONFIRMED'];
  }
  const results = Array.isArray(validation.checks) ? validation.checks : [];
  const byId = new Map(results.map((row) => [text(row?.id, 120), row?.ok === true]));
  return expectedChecks.filter((id) => byId.get(id) !== true);
}

function summarizeValidation(validation, expectedChecks) {
  const results = Array.isArray(validation?.checks) ? validation.checks : [];
  const byId = new Map(results.map((row) => [text(row?.id, 120), row?.ok === true]));
  return expectedChecks.map((id) => Object.freeze({ id, ok: byId.get(id) === true }));
}

function scope(gate, context) {
  return {
    ...context,
    drillId: gate.request.drill_id,
    manifestSha256: gate.request.manifest_sha256,
    environmentId: gate.request.environment.id,
  };
}

function auditRow(gate, state, reason, checks = []) {
  return {
    kind: 'RECOVERY_DRILL_AUDIT',
    schema: RECOVERY_DRILL_SCHEMA,
    drill_id: gate.request.drill_id || null,
    environment_id: gate.request.environment.id || null,
    manifest_sha256: gate.request.manifest_sha256 || null,
    state,
    reason,
    check_count: Array.isArray(checks) ? checks.length : 0,
    production_access_used: false,
    activation_performed: false,
  };
}

function drillError(code) {
  const error = new Error(code);
  error.name = 'RecoveryDrillError';
  error.code = code;
  return error;
}
