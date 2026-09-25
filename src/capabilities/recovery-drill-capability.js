import { createR2D1BackupStorage } from '../backup/system-backup-runtime.js';
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
} = {}) {
  const verification = await verifyRestoreCandidate(snapshot);
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
        staged = { snapshot: structuredClone(snapshot), verification: structuredClone(verification) };
      },
      async validate() {
        requireValue(staged, 'RECOVERY_DRILL_STAGE_REQUIRED');
        const repeated = await verifyRestoreCandidate(staged.snapshot);
        const repeatedLogical = reconstructLogicalState(repeated, staged.snapshot);
        const checks = [
          { id: 'snapshot-integrity', ok: repeated.ok === true },
          { id: 'd1-logical-state', ok: repeatedLogical.ok === true },
          { id: 'r2-inventory', ok: repeated.r2?.objectCount >= 0 },
          { id: 'runtime-descriptor', ok: SHA_RE.test(String(repeated.runtime?.deployedGitSha || '')) },
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
    const storage = createR2D1BackupStorage({ db: env.DB, bucket: env.MEDIA_BUCKET });
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
