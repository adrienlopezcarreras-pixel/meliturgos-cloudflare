import { DomainError, port, requireValue } from '../core/contracts.js';
import { verifySnapshot } from './backup-service.js';
import { stableStringify } from '../resilience/recovery-bundle.js';

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

const PATRIMONY_TABLES = ['evolution_ledger', 'conversations', 'dev_jobs'];

function validatePatrimonyExport(value) {
  const validation = validateDatabaseExport(value);
  if (!validation.ok) return validation;
  const tables = new Map();
  for (const table of asArray(value.tables)) {
    const name = String(table.name);
    if (tables.has(name)) return { ok: false, code: 'RESTORE_PATRIMONY_DUPLICATE_TABLE', table: name };
    tables.set(name, table);
  }
  for (const name of PATRIMONY_TABLES) {
    const table = tables.get(name);
    if (!table) return { ok: false, code: 'RESTORE_PATRIMONY_TABLE_REQUIRED', table: name };
    if (typeof table.schema !== 'string' || !table.schema.trim()) {
      return { ok: false, code: 'RESTORE_PATRIMONY_SCHEMA_REQUIRED', table: name };
    }
    const idField = name === 'evolution_ledger' ? 'event_id' : 'id';
    const ids = new Set();
    for (const row of table.rows) {
      const id = row?.[idField];
      if (typeof id !== 'string' || !id.trim()) {
        return { ok: false, code: 'RESTORE_PATRIMONY_ROW_ID_REQUIRED', table: name };
      }
      if (ids.has(id)) return { ok: false, code: 'RESTORE_PATRIMONY_DUPLICATE_ROW_ID', table: name };
      ids.add(id);
    }
  }
  return { ok: true, tables };
}

/** Compare complete patrimony data and schema without depending on export order or writing production. */
export function comparePatrimonyExports(before, after) {
  const left = validatePatrimonyExport(before);
  if (!left.ok) return { ...left, identical: false, side: 'before', production_written: false };
  const right = validatePatrimonyExport(after);
  if (!right.ok) return { ...right, identical: false, side: 'after', production_written: false };
  const tables = {};
  let identical = true;
  for (const name of PATRIMONY_TABLES) {
    const previousTable = left.tables.get(name);
    const nextTable = right.tables.get(name);
    const previous = previousTable.rows;
    const next = nextTable.rows;
    const same = previousTable.schema === nextTable.schema
      && previous.length === next.length
      && stableStringify(previous.map(stableStringify).sort()) === stableStringify(next.map(stableStringify).sort());
    if (!same) identical = false;
    tables[name] = { before: previous.length, after: next.length, same };
  }
  return { ok: true, identical, tables, production_written: false };
}

async function tableFingerprint(table) {
  const canonical = stableStringify({ schema: table.schema, rows: table.rows.map(stableStringify).sort() });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * MEL-FOUNDER-07: restore a patrimony export into an isolated copy, then
 * compare row counts and per-table SHA-256 fingerprints. The target must
 * declare itself isolated before anything is written; production is refused.
 */
export async function verifyIsolatedRestore(exported, target) {
  if (!target || target.isolated !== true || target.production === true || typeof target.restore !== 'function') {
    return { ok: false, code: 'RESTORE_ISOLATED_TARGET_REQUIRED', identical: false, production_written: false };
  }
  const source = validatePatrimonyExport(exported);
  if (!source.ok) return { ...source, identical: false, side: 'before', production_written: false };
  const restored = await target.restore(structuredClone(exported));
  const comparison = comparePatrimonyExports(exported, restored);
  if (!comparison.ok) return comparison;
  const after = validatePatrimonyExport(restored);
  const fingerprints = {};
  for (const name of PATRIMONY_TABLES) {
    fingerprints[name] = { before: await tableFingerprint(source.tables.get(name)), after: await tableFingerprint(after.tables.get(name)) };
    comparison.tables[name].fingerprint_match = fingerprints[name].before === fingerprints[name].after;
  }
  return { ...comparison, fingerprints, isolated: true, production_written: false };
}

export function registerPatrimonyCompareCapability(bus) {
  if (!bus || typeof bus.discover !== 'function') throw new TypeError('CAPABILITY_BUS_REQUIRED');
  bus.discover({
    id: 'backup.patrimony.compare',
    name: 'Comparer deux exports du patrimoine',
    category: 'resilience',
    version: '1.0.0',
    provider: 'mel',
    description: 'Compares evolution_ledger, conversations and dev_jobs between two logical exports. It never writes production.',
    input_schema: {
      type: 'object',
      properties: {
        before: { type: 'object', additionalProperties: true },
        after: { type: 'object', additionalProperties: true },
      },
      required: ['before', 'after'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'DEGRADED',
    enabled: true,
  }, async (input) => comparePatrimonyExports(input?.before, input?.after));
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
    deployedGitSha: /^[a-f0-9]{40}$/i.test(String(value.deployedGitSha || '')) ? String(value.deployedGitSha).toLowerCase() : null,
    deployedGitBranch: value.deployedGitBranch || null,
  };
}

export function inspectRestoreCandidate(snapshot, { integrity = null } = {}) {
  const exported = snapshot?.exports || {};
  const database = validateDatabaseExport(exported.database);
  if (!database.ok) return { ok: false, ...database, ...(integrity ? { integrity } : {}) };
  const r2 = validateR2Inventory(exported.r2_inventory);
  if (!r2.ok) return { ok: false, ...r2, ...(integrity ? { integrity } : {}) };
  const runtime = validateRuntimeDescriptor(exported.runtime);
  if (!runtime.ok) return { ok: false, ...runtime, ...(integrity ? { integrity } : {}) };

  return {
    ok: true,
    code: 'RESTORE_CANDIDATE_VERIFIED',
    snapshot_id: snapshot.id,
    integritySha256: snapshot.integritySha256,
    database,
    r2,
    runtime,
    ...(integrity ? { integrity } : {}),
    critical_recovery_scope: {
      d1_logical_state_reconstructable: true,
      r2_inventory_verified: true,
      r2_object_bytes_embedded: false,
      production_activation_automatic: false,
    },
  };
}

export async function verifyRestoreCandidate(snapshot) {
  const integrity = await verifySnapshot(snapshot);
  if (!integrity?.ok) return { ok: false, code: integrity?.code || 'RESTORE_SNAPSHOT_INVALID', integrity };
  return inspectRestoreCandidate(snapshot, { integrity });
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

export function createRestoreService(options = {}) {
  const { storage, target = null, audit = async () => {} } = options || {};
  if (!storage) {
    const legacyAdapters = Object.fromEntries(
      methods.filter(method => typeof options?.[method] === 'function').map(method => [method, options[method]])
    );
    return port('backup/restore-service', methods, legacyAdapters);
  }
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
