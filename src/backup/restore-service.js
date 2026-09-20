import { DomainError, port, requireValue } from '../core/contracts.js';
import { verifySnapshot } from './backup-service.js';

export const methods = ['plan', 'verify', 'restore'];
export const RESTORE_PLAN_SCHEMA = 'MEL_RESTORE_PLAN_V1';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function validateDatabaseExport(value) {
  if (!value || value.type !== 'MEL_D1_LOGICAL_EXPORT_V1') {
    return { ok: false, code: 'RESTORE_D1_EXPORT_REQUIRED' };
  }
  const tables = asArray(value.tables);
  if (Number(value.tableCount || 0) !== tables.length) {
    return { ok: false, code: 'RESTORE_D1_TABLE_COUNT_MISMATCH' };
  }
  for (const table of tables) {
    if (!table || !String(table.name || '').trim() || !Array.isArray(table.rows)) {
      return { ok: false, code: 'RESTORE_D1_TABLE_INVALID' };
    }
    if (Number(table.rowCount || 0) !== table.rows.length) {
      return { ok: false, code: 'RESTORE_D1_ROW_COUNT_MISMATCH', table: table.name || null };
    }
  }
  return {
    ok: true,
    tableCount: tables.length,
    rowCount: tables.reduce((sum, table) => sum + table.rows.length, 0),
  };
}

function validateR2Inventory(value) {
  if (!value || value.type !== 'MEL_R2_INVENTORY_V1') {
    return { ok: false, code: 'RESTORE_R2_INVENTORY_REQUIRED' };
  }
  const objects = asArray(value.objects);
  if (Number(value.objectCount || 0) !== objects.length) {
    return { ok: false, code: 'RESTORE_R2_OBJECT_COUNT_MISMATCH' };
  }
  for (const object of objects) {
    if (!object || !String(object.key || '').trim() || Number(object.size || 0) < 0) {
      return { ok: false, code: 'RESTORE_R2_OBJECT_INVALID' };
    }
  }
  return {
    ok: true,
    objectCount: objects.length,
    totalBytes: objects.reduce((sum, object) => sum + Number(object.size || 0), 0),
  };
}

function validateRuntimeDescriptor(value) {
  if (!value || value.type !== 'MEL_RUNTIME_DESCRIPTOR_V1') {
    return { ok: false, code: 'RESTORE_RUNTIME_DESCRIPTOR_REQUIRED' };
  }
  if (!String(value.appVersion || '').trim() || !String(value.worker || '').trim()) {
    return { ok: false, code: 'RESTORE_RUNTIME_DESCRIPTOR_INVALID' };
  }
  return {
    ok: true,
    appVersion: value.appVersion,
    dbSchemaVersion: value.dbSchemaVersion ?? null,
    candidateBranch: value.candidateBranch || null,
  };
}

export async function verifyRestoreCandidate(snapshot) {
  const integrity = await verifySnapshot(snapshot);
  if (!integrity?.ok) return { ok: false, code: integrity?.code || 'RESTORE_SNAPSHOT_INVALID', integrity };

  const exported = snapshot?.exports || {};
  const database = validateDatabaseExport(exported.database);
  if (!database.ok) return { ok: false, ...database, integrity };
  const r2 = validateR2Inventory(exported.r2_inventory);
  if (!r2.ok) return { ok: false, ...r2, integrity };
  const runtime = validateRuntimeDescriptor(exported.runtime);
  if (!runtime.ok) return { ok: false, ...runtime, integrity };

  return {
    ok: true,
    code: 'RESTORE_CANDIDATE_VERIFIED',
    snapshot_id: snapshot.id,
    integritySha256: snapshot.integritySha256,
    database,
    r2,
    runtime,
    critical_recovery_scope: {
      d1_logical_state_reconstructable: true,
      r2_inventory_verified: true,
      r2_object_bytes_embedded: false,
      production_activation_automatic: false,
    },
  };
}

export function buildRestorePlan(snapshot, verification) {
  requireValue(verification?.ok === true, 'RESTORE_VERIFICATION_REQUIRED', 409);
  return {
    schema: RESTORE_PLAN_SCHEMA,
    snapshot_id: snapshot.id,
    integritySha256: snapshot.integritySha256,
    dry_run_supported: true,
    automatic_activation: false,
    requires_owner_approval: true,
    steps: [
      { id: 'verify-integrity', destructive: false, status: 'VERIFIED' },
      { id: 'reconstruct-d1-logical-state', destructive: true, table_count: verification.database.tableCount, row_count: verification.database.rowCount },
      { id: 'verify-r2-inventory', destructive: false, object_count: verification.r2.objectCount, total_bytes: verification.r2.totalBytes },
      { id: 'restore-critical-code-from-independent-copy', destructive: true, external_proof_required: true },
      { id: 'activate-restored-runtime', destructive: true, owner_approval_required: true },
    ],
  };
}

export function createRestoreService({ storage, target = null, audit = async () => {} } = {}) {
  if (!storage) return port('backup/restore-service', methods, {});
  async function resolve(input = {}, context = {}) {
    requireValue(storage && typeof storage.get === 'function', 'RESTORE_STORAGE_GET_REQUIRED');
    const snapshot = input.snapshot || (input.id ? await storage.get(String(input.id), context) : null);
    if (!snapshot) throw new DomainError('SNAPSHOT_NOT_FOUND', 404);
    return snapshot;
  }

  return Object.freeze({
    async plan(input = {}, context = {}) {
      const snapshot = await resolve(input, context);
      const verification = await verifyRestoreCandidate(snapshot);
      if (!verification.ok) throw new DomainError(verification.code || 'RESTORE_VERIFICATION_FAILED', 409);
      const plan = buildRestorePlan(snapshot, verification);
      await audit({ kind: 'RESTORE_PLAN', snapshot_id: snapshot.id, ok: true, destructive: false });
      return { ok: true, verification, plan };
    },

    async verify(input = {}, context = {}) {
      const snapshot = await resolve(input, context);
      const verification = await verifyRestoreCandidate(snapshot);
      await audit({ kind: 'RESTORE_VERIFY', snapshot_id: snapshot.id, ok: verification.ok === true, code: verification.code || null, destructive: false });
      return verification;
    },

    async restore(input = {}, context = {}) {
      const snapshot = await resolve(input, context);
      const verification = await verifyRestoreCandidate(snapshot);
      if (!verification.ok) throw new DomainError(verification.code || 'RESTORE_VERIFICATION_FAILED', 409);

      requireValue(context?.owner === true, 'RESTORE_OWNER_REQUIRED', 403);
      requireValue(Array.isArray(context?.permissions) && context.permissions.includes('backup:restore'), 'RESTORE_PERMISSION_REQUIRED', 403);
      requireValue(input?.approval?.approved === true, 'RESTORE_EXPLICIT_APPROVAL_REQUIRED', 403);
      requireValue(input?.approval?.action === 'RESTORE_SYSTEM', 'RESTORE_APPROVAL_ACTION_INVALID', 403);
      requireValue(String(input?.approval?.snapshot_id || '') === String(snapshot.id || ''), 'RESTORE_APPROVAL_SNAPSHOT_MISMATCH', 403);
      requireValue(target && typeof target.restoreDatabase === 'function', 'RESTORE_TARGET_DATABASE_REQUIRED', 503);
      requireValue(typeof target.verifyCriticalCode === 'function', 'RESTORE_CRITICAL_CODE_VERIFIER_REQUIRED', 503);
      requireValue(typeof target.activate === 'function', 'RESTORE_TARGET_ACTIVATE_REQUIRED', 503);

      // The system snapshot intentionally stores an R2 inventory, not every R2
      // object byte. Critical executable code must therefore be proven from the
      // independent ShardVault/R2 code archive before any activation.
      const codeProof = await target.verifyCriticalCode({ snapshot, verification }, context);
      requireValue(codeProof?.ok === true, 'RESTORE_CRITICAL_CODE_PROOF_REQUIRED', 409);

      await target.restoreDatabase(snapshot.exports.database, context);
      const activation = await target.activate({ snapshot, verification, codeProof }, context);
      requireValue(activation?.ok === true, 'RESTORE_ACTIVATION_NOT_CONFIRMED', 503);

      const result = {
        ok: true,
        status: 'RESTORED',
        snapshot_id: snapshot.id,
        integritySha256: snapshot.integritySha256,
        production_activation_automatic: false,
        code_proof: { ok: true, source: codeProof.source || null },
      };
      await audit({ kind: 'RESTORE_EXECUTE', snapshot_id: snapshot.id, ok: true, destructive: true });
      return result;
    },
  });
}
