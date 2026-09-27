import { createR2D1BackupStorage } from '../backup/system-backup-runtime.js';
import { createEnvBackupEncryptionCodec } from '../backup/encrypted-backup-storage.js';
import { evaluateRestoreReadiness } from '../evolution/launch-readiness.js';
import { verifyRestoreCandidate } from '../backup/restore-service.js';
import { requireValue } from '../core/contracts.js';
import { RecoveryBundleBuilder } from '../resilience/recovery-bundle.js';
import { createRecoveryDrillController } from '../resilience/recovery-drill.js';

const SHA_RE = /^[a-f0-9]{40}$/i;

function backupEntry(snapshot, name) {
  return snapshot?.entries?.find((entry) => entry?.name === name) || null;
}

function reconstructLogicalState(verification, snapshot) {
  if (!verification?.ok) return { ok: false, code: 'RESTORE_CANDIDATE_NOT_VERIFIED' };
  const tables = snapshot?.exports?.database?.tables;
  if (!Array.isArray(tables)) return { ok: false, code: 'D1_LOGICAL_EXPORT_REQUIRED' };
  const reconstructed = new Map();
  for (const table of tables) {
    if (!table?.name || !Array.isArray(table.rows) || Number(table.rowCount) !== table.rows.length) {
      return { ok: false, code: 'D1_LOGICAL_RECONSTRUCTION_FAILED' };
    }
    reconstructed.set(String(table.name), structuredClone(table.rows));
  }
  return {
    ok: reconstructed.size === verification.database.tableCount,
    table_count: reconstructed.size,
    row_count: [...reconstructed.values()].reduce((sum, rows) => sum + rows.length, 0),
  };
}

export async function runRecoveryDrillAgainstSnapshot(snapshot, {
  owner = false,
  approved = false,
  now = () => new Date().toISOString(),
  verifyCandidate = verifyRestoreCandidate,
} = {}) {
  const verification = await verifyCandidate(snapshot);
  requireValue(verification?.ok === true, verification?.code || 'RESTORE_CANDIDATE_INVALID', 409);
  const logicalRestore = reconstructLogicalState(verification, snapshot);
  requireValue(logicalRestore.ok === true, logicalRestore.code || 'D1_LOGICAL_RECONSTRUCTION_FAILED', 409);

  const sourceCommit = String(verification.runtime?.deployedGitSha || '').toLowerCase();
  requireValue(SHA_RE.test(sourceCommit), 'RECOVERY_DRILL_DEPLOYED_SHA_REQUIRED', 409);

  const builder = new RecoveryBundleBuilder({ now });
  const bundle = await builder.build({
    sourceCommit,
    schemaVersion: String(verification.runtime?.dbSchemaVersion ?? ''),
    artifacts: [{ id: 'critical-code', checksum: sourceCommit }],
    exports: [
      { id: 'database', checksum: backupEntry(snapshot, 'database')?.sha256 || null },
      { id: 'r2_inventory', checksum: backupEntry(snapshot, 'r2_inventory')?.sha256 || null },
      { id: 'runtime', checksum: backupEntry(snapshot, 'runtime')?.sha256 || null },
    ],
    restore: { snapshotId: snapshot.id, dryRunOnly: true },
    destinations: [{ id: 'runtime-memory-sandbox', kind: 'ephemeral-memory', authorized: true, encrypted: true }],
  });

  const standby = {
    standby_id: `runtime-${snapshot.id}`,
    recovery: {
      bundle_id: snapshot.id,
      source_commit: sourceCommit,
      manifest_sha256: bundle.manifestSha256,
      verified: true,
    },
    destination: {
      id: 'runtime-memory-sandbox',
      provider: 'in-process',
      authorized: true,
      encrypted: true,
    },
    readiness: {
      snapshot_present: true,
      config_present: true,
      identity_present: true,
      restore_tested: logicalRestore.ok === true,
      integrity_verified: verification.ok === true,
      checked_at: now(),
    },
  };

  let staged = null;
  const audits = [];
  const controller = createRecoveryDrillController({
    bundleBuilder: builder,
    authorize: async (permission, scope) => permission === 'resilience:recovery:drill' && scope?.owner === true,
    audit: async (row) => audits.push(row),
    adapter: {
      async stage(payload) {
        requireValue(payload?.environment?.isolated === true, 'RECOVERY_DRILL_ISOLATION_REQUIRED');
        requireValue(payload?.environment?.production_access === false, 'RECOVERY_DRILL_PRODUCTION_ACCESS_FORBIDDEN');
        // The full snapshot has already passed cryptographic/integrity verification
        // before staging. Do not clone and re-hash the entire production backup
        // inside a single Worker request: real snapshots can be large enough to
        // exceed Cloudflare CPU limits. Stage only the verified evidence needed
        // for the isolated logical drill.
        staged = {
          snapshot_id: snapshot.id,
          integrity_sha256: snapshot.integritySha256,
          verification_ok: verification.ok === true,
          runtime_sha: String(verification.runtime?.deployedGitSha || ''),
          r2_object_count: Number(verification.r2?.objectCount ?? -1),
          logical_restore_ok: logicalRestore.ok === true,
        };
      },
      async validate() {
        requireValue(staged, 'RECOVERY_DRILL_STAGE_REQUIRED');
        const checks = [
          { id: 'snapshot-integrity', ok: staged.verification_ok === true && Boolean(staged.integrity_sha256) },
          { id: 'd1-logical-state', ok: staged.logical_restore_ok === true },
          { id: 'r2-inventory', ok: staged.r2_object_count >= 0 },
          { id: 'runtime-descriptor', ok: SHA_RE.test(staged.runtime_sha) },
          { id: 'activation-forbidden', ok: true },
        ];
        return { ok: checks.every((row) => row.ok), checks };
      },
      async teardown() {
        staged = null;
      },
    },
  });

  const drillId = `system-backup-${snapshot.id}`.slice(0, 240);
  const report = await controller.run({
    drill_id: drillId,
    dry_run: true,
    environment: { id: `sandbox-${snapshot.id}`.slice(0, 240), kind: 'SANDBOX', isolated: true, production_access: false },
    bundle,
    standby,
    expected_checks: ['snapshot-integrity', 'd1-logical-state', 'r2-inventory', 'runtime-descriptor', 'activation-forbidden'],
    approval: { approved: approved === true, action: 'RUN_RECOVERY_DRILL', drill_id: drillId, manifest_sha256: bundle.manifestSha256 },
  }, { owner: owner === true });

  return {
    ...report,
    snapshot_id: snapshot.id,
    snapshot_integrity_sha256: snapshot.integritySha256,
    deployed_sha: sourceCommit,
    restore_candidate_verified: verification.ok === true,
    reconstructed_tables: logicalRestore.table_count,
    reconstructed_rows: logicalRestore.row_count,
    audit_events: audits.length,
  };
}


export async function runReleaseBoundRecoveryProof(env, {
  owner = false,
  approved = false,
  now = () => new Date().toISOString(),
  readReadiness = evaluateRestoreReadiness,
} = {}) {
  requireValue(approved === true, 'RECOVERY_DRILL_EXPLICIT_APPROVAL_REQUIRED', 403);
  const readiness = await readReadiness(env);
  requireValue(readiness?.ok === true, readiness?.status || 'RESTORE_READINESS_NOT_VERIFIED', 409);
  requireValue(readiness?.restore?.ok === true, readiness?.restore?.code || 'RESTORE_CANDIDATE_NOT_VERIFIED', 409);
  requireValue(readiness?.sha_matches === true, 'RECOVERY_RELEASE_SHA_MISMATCH', 409);

  const sourceCommit = String(readiness?.deployed_sha || '').toLowerCase();
  const snapshotId = String(readiness?.snapshot_id || '').trim();
  const integritySha256 = String(readiness?.integritySha256 || '').trim().toLowerCase();
  const tableCount = Number(readiness?.restore?.database?.tableCount ?? -1);
  const rowCount = Number(readiness?.restore?.database?.rowCount ?? -1);
  const r2ObjectCount = Number(readiness?.restore?.r2?.objectCount ?? -1);

  requireValue(SHA_RE.test(sourceCommit), 'RECOVERY_DRILL_DEPLOYED_SHA_REQUIRED', 409);
  requireValue(snapshotId, 'RECOVERY_DRILL_BACKUP_NOT_FOUND', 404);
  requireValue(/^[a-f0-9]{64}$/i.test(integritySha256), 'RECOVERY_DRILL_INTEGRITY_PROOF_REQUIRED', 409);
  requireValue(Number.isInteger(tableCount) && tableCount >= 1, 'RECOVERY_DRILL_D1_RECONSTRUCTION_PROOF_REQUIRED', 409);
  requireValue(Number.isInteger(rowCount) && rowCount >= 0, 'RECOVERY_DRILL_D1_ROW_PROOF_REQUIRED', 409);
  requireValue(Number.isInteger(r2ObjectCount) && r2ObjectCount >= 0, 'RECOVERY_DRILL_R2_PROOF_REQUIRED', 409);

  const builder = new RecoveryBundleBuilder({ now });
  const bundle = await builder.build({
    sourceCommit,
    artifacts: [{ id: 'critical-code', checksum: sourceCommit }],
    exports: [
      { id: 'database', checksum: integritySha256 },
      { id: 'r2_inventory', checksum: integritySha256 },
      { id: 'runtime', checksum: sourceCommit },
    ],
    restore: {
      snapshotId,
      dryRunOnly: true,
      proofSource: String(readiness?.restore?.proof_source || 'verified-backup-persist'),
    },
    destinations: [{ id: 'runtime-memory-sandbox', kind: 'ephemeral-memory', authorized: true, encrypted: true }],
  });

  const standby = {
    standby_id: `release-bound-${snapshotId}`.slice(0, 240),
    recovery: {
      bundle_id: snapshotId,
      source_commit: sourceCommit,
      manifest_sha256: bundle.manifestSha256,
      verified: true,
    },
    destination: {
      id: 'runtime-memory-sandbox',
      provider: 'in-process',
      authorized: true,
      encrypted: true,
    },
    readiness: {
      snapshot_present: true,
      config_present: true,
      identity_present: true,
      restore_tested: true,
      integrity_verified: true,
      checked_at: now(),
    },
  };

  let staged = null;
  const audits = [];
  const controller = createRecoveryDrillController({
    bundleBuilder: builder,
    authorize: async (permission, scope) => permission === 'resilience:recovery:drill' && scope?.owner === true,
    audit: async (row) => audits.push(row),
    adapter: {
      async stage(payload) {
        requireValue(payload?.environment?.isolated === true, 'RECOVERY_DRILL_ISOLATION_REQUIRED');
        requireValue(payload?.environment?.production_access === false, 'RECOVERY_DRILL_PRODUCTION_ACCESS_FORBIDDEN');
        staged = {
          restore_ok: readiness.restore.ok === true,
          sha_matches: readiness.sha_matches === true,
          integrity_sha256: integritySha256,
          deployed_sha: sourceCommit,
          table_count: tableCount,
          row_count: rowCount,
          r2_object_count: r2ObjectCount,
        };
      },
      async validate() {
        requireValue(staged, 'RECOVERY_DRILL_STAGE_REQUIRED');
        const checks = [
          { id: 'snapshot-integrity', ok: /^[a-f0-9]{64}$/i.test(staged.integrity_sha256) },
          { id: 'd1-logical-state', ok: staged.restore_ok === true && staged.table_count >= 1 && staged.row_count >= 0 },
          { id: 'r2-inventory', ok: staged.r2_object_count >= 0 },
          { id: 'runtime-descriptor', ok: staged.sha_matches === true && SHA_RE.test(staged.deployed_sha) },
          { id: 'activation-forbidden', ok: true },
        ];
        return { ok: checks.every((row) => row.ok), checks };
      },
      async teardown() {
        staged = null;
      },
    },
  });

  const drillId = `release-bound-${snapshotId}`.slice(0, 240);
  const report = await controller.run({
    drill_id: drillId,
    dry_run: true,
    environment: { id: `sandbox-${snapshotId}`.slice(0, 240), kind: 'SANDBOX', isolated: true, production_access: false },
    bundle,
    standby,
    expected_checks: ['snapshot-integrity', 'd1-logical-state', 'r2-inventory', 'runtime-descriptor', 'activation-forbidden'],
    approval: { approved: true, action: 'RUN_RECOVERY_DRILL', drill_id: drillId, manifest_sha256: bundle.manifestSha256 },
  }, { owner: owner === true });

  return {
    ...report,
    proof_mode: 'RELEASE_BOUND_PERSISTED_RESTORE',
    full_snapshot_read: false,
    reconstruction_source: 'PERSISTED_VERIFIED_RESTORE_PROOF',
    snapshot_id: snapshotId,
    snapshot_integrity_sha256: integritySha256,
    deployed_sha: sourceCommit,
    snapshot_deployed_sha: readiness?.snapshot_deployed_sha || null,
    release_bound: readiness?.status === 'RELEASE_BOUND_SYSTEM_BACKUP_RESTORE_PROOF_VERIFIED',
    release_binding_sha256: readiness?.release_binding?.binding_sha256 || null,
    restore_candidate_verified: true,
    reconstructed_tables: tableCount,
    reconstructed_rows: rowCount,
    r2_object_count: r2ObjectCount,
    audit_events: audits.length,
  };
}

export function registerRecoveryDrillCapability(bus, env = {}) {
  const ready = Boolean(env?.DB?.prepare && env?.MEDIA_BUCKET?.get);
  bus.discover({
    id: 'resilience.recovery.drill.latest',
    name: 'Drill de restauration de la dernière sauvegarde',
    category: 'resilience',
    version: '1.0.0',
    provider: 'core',
    description: 'Runs an owner-approved isolated in-memory recovery drill against a verified system backup without production activation.',
    input_schema: {
      type: 'object',
      properties: {
        snapshot_id: { type: 'string', minLength: 1, maxLength: 160 },
        approved: { type: 'boolean' },
        proof_mode: { type: 'string', enum: ['full', 'release-bound'] },
      },
      required: ['approved'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: ready ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input, context = {}) => {
    requireValue(input?.approved === true, 'RECOVERY_DRILL_EXPLICIT_APPROVAL_REQUIRED', 403);
    requireValue(env?.DB?.prepare, 'BACKUP_DB_UNAVAILABLE', 503);
    requireValue(env?.MEDIA_BUCKET?.get, 'BACKUP_R2_UNAVAILABLE', 503);
    const proofMode = String(input?.proof_mode || 'full').trim().toLowerCase();
    requireValue(['full', 'release-bound'].includes(proofMode), 'RECOVERY_DRILL_PROOF_MODE_INVALID', 400);
    if (proofMode === 'release-bound') {
      requireValue(context?.release_smoke === true, 'RECOVERY_RELEASE_PROOF_CONTEXT_REQUIRED', 403);
      return runReleaseBoundRecoveryProof(env, {
        owner: Boolean(context?.owner),
        approved: true,
      });
    }

    const encryptionKeyId = String(env?.MEL_BACKUP_ENCRYPTION_KEY_ID || '').trim();
    const encryptionKey = String(env?.MEL_BACKUP_ENCRYPTION_KEY_B64 || '').trim();
    const encryptionRequested = Boolean(encryptionKeyId || encryptionKey);
    requireValue(
      !encryptionRequested || Boolean(encryptionKeyId && encryptionKey),
      'BACKUP_ENCRYPTION_CONFIG_INCOMPLETE',
      503,
    );
    const encryptionCodec = encryptionRequested ? createEnvBackupEncryptionCodec(env) : null;
    const storage = createR2D1BackupStorage({
      db: env.DB,
      bucket: env.MEDIA_BUCKET,
      encryptionCodec,
    });
    let snapshotId = String(input.snapshot_id || '').trim();
    if (!snapshotId) {
      const latest = (await storage.list({ limit: 1 }))[0] || null;
      snapshotId = String(latest?.id || '');
    }
    requireValue(snapshotId, 'RECOVERY_DRILL_BACKUP_NOT_FOUND', 404);
    const snapshot = await storage.get(snapshotId);
    requireValue(snapshot, 'RECOVERY_DRILL_BACKUP_NOT_FOUND', 404);
    return runRecoveryDrillAgainstSnapshot(snapshot, { owner: Boolean(context?.owner), approved: true });
  });
}
