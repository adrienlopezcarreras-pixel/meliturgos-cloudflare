import { DomainError, requireValue } from '../core/contracts.js';
import { verifyRestoreCandidate, buildRestorePlan } from './restore-service.js';

export const RECOVERY_DRILL_SCHEMA = 'MEL_RECOVERY_DRILL_V1';

function drillError(code, status = 500) {
  return new DomainError(code, status);
}

function text(value) {
  return String(value ?? '').trim();
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clean(value, depth = 0) {
  if (depth > 6) return '[DEPTH_LIMIT]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => clean(item, depth + 1));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).slice(0, 150).map(([key, child]) => [key, clean(child, depth + 1)])
    );
  }
  return String(value).slice(0, 4000);
}

function exactSha(value) {
  const sha = text(value).toLowerCase();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

function targetDescriptor(value) {
  requireValue(isRecord(value), 'RECOVERY_DRILL_TARGET_DESCRIPTOR_REQUIRED', 500);
  requireValue(value.isolated === true, 'RECOVERY_DRILL_TARGET_NOT_ISOLATED', 409);
  requireValue(value.production !== true, 'RECOVERY_DRILL_PRODUCTION_TARGET_FORBIDDEN', 409);
  requireValue(value.ephemeral === true, 'RECOVERY_DRILL_TARGET_NOT_EPHEMERAL', 409);
  const id = text(value.id);
  requireValue(id, 'RECOVERY_DRILL_TARGET_ID_REQUIRED', 500);
  return Object.freeze({
    id,
    isolated: true,
    production: false,
    ephemeral: true,
    runtime: text(value.runtime || 'unknown'),
    provider: text(value.provider || 'unknown'),
    region: text(value.region || ''),
  });
}

function requireMethod(target, name, code) {
  requireValue(typeof target?.[name] === 'function', code, 503);
}

function countsMatch(databaseExport, proof) {
  const expectedTables = Number(databaseExport?.tableCount || 0);
  const expectedRows = Array.isArray(databaseExport?.tables)
    ? databaseExport.tables.reduce((sum, table) => sum + Number(table?.rowCount || 0), 0)
    : 0;
  return Number(proof?.tableCount) === expectedTables
    && Number(proof?.rowCount) === expectedRows;
}

function r2CountsMatch(inventory, proof) {
  const expectedObjects = Number(inventory?.objectCount || 0);
  const expectedBytes = Array.isArray(inventory?.objects)
    ? inventory.objects.reduce((sum, item) => sum + Number(item?.size || 0), 0)
    : 0;
  return Number(proof?.objectCount) === expectedObjects
    && Number(proof?.totalBytes) === expectedBytes;
}

/**
 * Executes a disaster-recovery rehearsal only against an isolated ephemeral
 * target. It never calls production activation and it always attempts cleanup.
 */
export function createRecoveryDrill({
  storage,
  targetFactory,
  audit = async () => {},
  now = () => Date.now(),
} = {}) {
  requireValue(storage && typeof storage.get === 'function', 'RECOVERY_DRILL_STORAGE_REQUIRED');
  requireValue(typeof targetFactory === 'function', 'RECOVERY_DRILL_TARGET_FACTORY_REQUIRED');

  return Object.freeze({
    async run(input = {}, context = {}) {
      requireValue(isRecord(input), 'RECOVERY_DRILL_INPUT_INVALID', 400);
      requireValue(input.confirm_isolated_restore === true, 'RECOVERY_DRILL_CONFIRMATION_REQUIRED', 403);
      const snapshotId = text(input.snapshot_id);
      requireValue(snapshotId, 'RECOVERY_DRILL_SNAPSHOT_ID_REQUIRED', 400);

      const startedAt = now();
      const snapshot = await storage.get(snapshotId, context);
      requireValue(snapshot, 'SNAPSHOT_NOT_FOUND', 404);

      if (input.expected_integrity_sha256) {
        requireValue(
          text(snapshot.integritySha256) === text(input.expected_integrity_sha256),
          'RECOVERY_DRILL_SNAPSHOT_DIGEST_MISMATCH',
          409,
        );
      }

      const verification = await verifyRestoreCandidate(snapshot);
      requireValue(verification.ok === true, verification.code || 'RECOVERY_DRILL_SNAPSHOT_INVALID', 409);
      const plan = buildRestorePlan(snapshot, verification);

      const target = await targetFactory({
        snapshot_id: snapshot.id,
        integrity_sha256: snapshot.integritySha256,
        runtime: verification.runtime,
      }, context);

      requireValue(target && typeof target.describe === 'function', 'RECOVERY_DRILL_TARGET_DESCRIBE_REQUIRED', 503);
      const descriptor = targetDescriptor(await target.describe(context));

      requireMethod(target, 'prepare', 'RECOVERY_DRILL_TARGET_PREPARE_REQUIRED');
      requireMethod(target, 'verifyCriticalCode', 'RECOVERY_DRILL_CODE_VERIFIER_REQUIRED');
      requireMethod(target, 'restoreDatabase', 'RECOVERY_DRILL_DATABASE_RESTORE_REQUIRED');
      requireMethod(target, 'verifyDatabase', 'RECOVERY_DRILL_DATABASE_VERIFY_REQUIRED');
      requireMethod(target, 'verifyR2Inventory', 'RECOVERY_DRILL_R2_VERIFY_REQUIRED');
      requireMethod(target, 'smoke', 'RECOVERY_DRILL_SMOKE_REQUIRED');
      requireMethod(target, 'destroy', 'RECOVERY_DRILL_TARGET_DESTROY_REQUIRED');

      const evidence = [];
      let outcome = null;
      let rootError = null;
      try {
        const prepared = await target.prepare({ snapshot, plan }, context);
        requireValue(prepared?.ok === true, 'RECOVERY_DRILL_PREPARE_FAILED', 503);
        evidence.push({ check: 'target.prepare', ok: true, proof: clean(prepared) });

        const code = await target.verifyCriticalCode({ snapshot, verification }, context);
        requireValue(code?.ok === true, 'RECOVERY_DRILL_CODE_PROOF_FAILED', 409);
        if (verification.runtime?.deployedGitSha) {
          const restoredSha = exactSha(code.sha || code.source_sha || code.commit);
          requireValue(
            restoredSha === exactSha(verification.runtime.deployedGitSha),
            'RECOVERY_DRILL_CODE_SHA_MISMATCH',
            409,
          );
        }
        evidence.push({
          check: 'critical-code',
          ok: true,
          proof: clean({
            source: code.source || null,
            sha: code.sha || code.source_sha || code.commit || null,
          }),
        });

        const restored = await target.restoreDatabase(snapshot.exports.database, context);
        requireValue(restored?.ok === true, 'RECOVERY_DRILL_DATABASE_RESTORE_FAILED', 503);
        evidence.push({ check: 'database.restore', ok: true, proof: clean(restored) });

        const databaseProof = await target.verifyDatabase(snapshot.exports.database, context);
        requireValue(databaseProof?.ok === true, 'RECOVERY_DRILL_DATABASE_VERIFY_FAILED', 409);
        requireValue(
          countsMatch(snapshot.exports.database, databaseProof),
          'RECOVERY_DRILL_DATABASE_COUNT_MISMATCH',
          409,
        );
        evidence.push({ check: 'database.verify', ok: true, proof: clean(databaseProof) });

        const r2Proof = await target.verifyR2Inventory(snapshot.exports.r2_inventory, context);
        requireValue(r2Proof?.ok === true, 'RECOVERY_DRILL_R2_VERIFY_FAILED', 409);
        requireValue(
          r2CountsMatch(snapshot.exports.r2_inventory, r2Proof),
          'RECOVERY_DRILL_R2_COUNT_MISMATCH',
          409,
        );
        evidence.push({ check: 'r2.verify', ok: true, proof: clean(r2Proof) });

        const smoke = await target.smoke({
          snapshot,
          required_checks: Array.isArray(input.required_smoke_checks)
            ? input.required_smoke_checks.slice(0, 50).map(text).filter(Boolean)
            : [],
        }, context);
        requireValue(smoke?.ok === true, 'RECOVERY_DRILL_SMOKE_FAILED', 409);
        evidence.push({ check: 'smoke', ok: true, proof: clean(smoke) });

        const finishedAt = now();
        outcome = {
          ok: true,
          schema: RECOVERY_DRILL_SCHEMA,
          status: 'DRILL_PASSED',
          snapshot_id: snapshot.id,
          integritySha256: snapshot.integritySha256,
          target: descriptor,
          verification: clean(verification),
          plan: clean(plan),
          evidence: clean(evidence),
          production_activation_attempted: false,
          started_at: startedAt,
          finished_at: finishedAt,
          duration_ms: Math.max(0, Number(finishedAt) - Number(startedAt)),
        };
        await audit({
          kind: 'RECOVERY_DRILL',
          snapshot_id: snapshot.id,
          target_id: descriptor.id,
          ok: true,
          production_activation_attempted: false,
        });
        return outcome;
      } catch (error) {
        rootError = error;
        await audit({
          kind: 'RECOVERY_DRILL',
          snapshot_id: snapshot.id,
          target_id: descriptor.id,
          ok: false,
          code: error?.code || error?.message || 'RECOVERY_DRILL_FAILED',
          production_activation_attempted: false,
        });
        throw error;
      } finally {
        try {
          const cleanup = await target.destroy({
            snapshot_id: snapshot.id,
            passed: outcome?.ok === true,
            error_code: rootError?.code || rootError?.message || null,
          }, context);
          if (outcome && cleanup?.ok !== true) {
            outcome.ok = false;
            outcome.status = 'DRILL_CLEANUP_FAILED';
            outcome.cleanup = clean(cleanup || { ok: false });
          }
        } catch (cleanupError) {
          if (outcome) {
            outcome.ok = false;
            outcome.status = 'DRILL_CLEANUP_FAILED';
            outcome.cleanup = {
              ok: false,
              error: text(cleanupError?.code || cleanupError?.message || cleanupError),
            };
          }
        }
      }
    },
  });
}
