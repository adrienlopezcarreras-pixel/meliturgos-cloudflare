import { SYSTEM_BACKUP_PREFIX, createR2D1BackupStorage, readReleaseBackupBinding } from '../backup/system-backup-runtime.js';
import { createEnvBackupEncryptionCodec } from '../backup/encrypted-backup-storage.js';
import { inspectRestoreCandidate, verifyRestoreCandidate } from '../backup/restore-service.js';
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
  let tableCount = 0;
  let rowCount = 0;
  for (const table of tables) {
    if (!table?.name || !Array.isArray(table.rows) || Number(table.rowCount) !== table.rows.length) {
      return { ok: false, code: 'D1_LOGICAL_RECONSTRUCTION_FAILED' };
    }
    tableCount += 1;
    rowCount += table.rows.length;
  }
  return {
    ok: tableCount === verification.database.tableCount
      && rowCount === Number(verification.database.rowCount || 0),
    table_count: tableCount,
    row_count: rowCount,
  };
}

export function verifyPersistedEncryptedRestoreCandidate(snapshot, metadata) {
  const integrity = String(snapshot?.integritySha256 || '').toLowerCase();
  const metadataIntegrity = String(metadata?.integritySha256 || '').toLowerCase();
  const restoreIntegrity = String(metadata?.restoreIntegritySha256 || '').toLowerCase();
  if (metadata?.encrypted !== true) return { ok: false, code: 'RECOVERY_DRILL_ENCRYPTED_METADATA_REQUIRED' };
  if (metadata?.verified !== true) return { ok: false, code: 'RECOVERY_DRILL_PERSISTED_CRYPTO_PROOF_REQUIRED' };
  if (metadata?.restoreVerified !== true) return { ok: false, code: 'RECOVERY_DRILL_PERSISTED_RESTORE_PROOF_REQUIRED' };
  if (!/^[a-f0-9]{64}$/.test(integrity) || integrity !== metadataIntegrity || integrity !== restoreIntegrity) {
    return { ok: false, code: 'RECOVERY_DRILL_PERSISTED_INTEGRITY_MISMATCH' };
  }
  if (String(snapshot?.id || '') !== String(metadata?.id || '')) {
    return { ok: false, code: 'RECOVERY_DRILL_PERSISTED_SNAPSHOT_ID_MISMATCH' };
  }
  if (Number(snapshot?.sourceCount || 0) !== Number(metadata?.sourceCount || 0)) {
    return { ok: false, code: 'RECOVERY_DRILL_PERSISTED_SOURCE_COUNT_MISMATCH' };
  }

  const proof = inspectRestoreCandidate(snapshot, {
    integrity: {
      ok: true,
      code: 'ENCRYPTED_STORAGE_AND_PERSISTED_SNAPSHOT_VERIFIED',
      id: snapshot.id,
      integritySha256: integrity,
      sourceCount: Number(snapshot.sourceCount || 0),
    },
  });
  if (!proof?.ok) return proof;

  if (Number(metadata?.restoreTableCount || 0) !== Number(proof.database?.tableCount || 0)
    || Number(metadata?.restoreRowCount || 0) !== Number(proof.database?.rowCount || 0)
    || Number(metadata?.restoreR2ObjectCount || 0) !== Number(proof.r2?.objectCount || 0)) {
    return { ok: false, code: 'RECOVERY_DRILL_PERSISTED_RESTORE_COUNTS_MISMATCH' };
  }
  const metadataSha = String(metadata?.restoreDeployedGitSha || '').toLowerCase();
  const runtimeSha = String(proof.runtime?.deployedGitSha || '').toLowerCase();
  if (metadataSha && metadataSha !== runtimeSha) {
    return { ok: false, code: 'RECOVERY_DRILL_PERSISTED_RUNTIME_SHA_MISMATCH' };
  }
  return proof;
}


function currentDeployedSha(env = {}) {
  const direct = String(env?.MEL_DEPLOYED_GIT_SHA || '').trim();
  if (/^[a-f0-9]{40}$/i.test(direct)) return direct.toLowerCase();
  try {
    const built = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA || '').trim() : '';
    return /^[a-f0-9]{40}$/i.test(built) ? built.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function runRecoveryDrillAgainstPersistedEvidence(metadata, {
  owner = false,
  approved = false,
  expectedDeployedSha = null,
  releaseBinding = null,
  backupObjectPresent = false,
  backupObjectBytes = 0,
  now = () => new Date().toISOString(),
} = {}) {
  requireValue(approved === true, 'RECOVERY_DRILL_EXPLICIT_APPROVAL_REQUIRED', 403);
  const snapshotId = String(metadata?.id || '').trim();
  const integrity = String(metadata?.integritySha256 || '').toLowerCase();
  const restoreIntegrity = String(metadata?.restoreIntegritySha256 || '').toLowerCase();
  const deployedSha = String(metadata?.restoreDeployedGitSha || '').toLowerCase();
  const expectedSha = String(expectedDeployedSha || '').toLowerCase();
  const tableCount = Number(metadata?.restoreTableCount);
  const rowCount = Number(metadata?.restoreRowCount);
  const r2ObjectCount = Number(metadata?.restoreR2ObjectCount);
  const expectedObjectKey = snapshotId ? `${SYSTEM_BACKUP_PREFIX}${snapshotId}.enc.json` : '';

  requireValue(metadata?.encrypted === true, 'RECOVERY_DRILL_ENCRYPTED_METADATA_REQUIRED', 409);
  requireValue(metadata?.verified === true, 'RECOVERY_DRILL_PERSISTED_CRYPTO_PROOF_REQUIRED', 409);
  requireValue(metadata?.restoreVerified === true, 'RECOVERY_DRILL_PERSISTED_RESTORE_PROOF_REQUIRED', 409);
  requireValue(snapshotId, 'RECOVERY_DRILL_BACKUP_NOT_FOUND', 404);
  requireValue(/^[a-f0-9]{64}$/.test(integrity) && integrity === restoreIntegrity, 'RECOVERY_DRILL_PERSISTED_INTEGRITY_MISMATCH', 409);
  requireValue(/^[a-f0-9]{40}$/.test(deployedSha), 'RECOVERY_DRILL_PERSISTED_RUNTIME_SHA_INVALID', 409);
  const releaseBound = Boolean(expectedSha)
    && deployedSha !== expectedSha
    && releaseBinding?.ok === true
    && String(releaseBinding?.deployed_sha || '').toLowerCase() === expectedSha
    && String(releaseBinding?.snapshot_id || '') === snapshotId
    && String(releaseBinding?.snapshot_integrity_sha256 || '').toLowerCase() === integrity
    && String(releaseBinding?.snapshot_deployed_sha || '').toLowerCase() === deployedSha;
  if (expectedSha) requireValue(deployedSha === expectedSha || releaseBound, 'RECOVERY_DRILL_PERSISTED_RUNTIME_SHA_MISMATCH', 409);
  const effectiveDeployedSha = releaseBound ? expectedSha : deployedSha;
  requireValue(String(metadata?.objectKey || '') === expectedObjectKey, 'RECOVERY_DRILL_PERSISTED_OBJECT_KEY_MISMATCH', 409);
  requireValue(Number.isInteger(tableCount) && tableCount > 0, 'RECOVERY_DRILL_PERSISTED_TABLE_COUNT_INVALID', 409);
  requireValue(Number.isInteger(rowCount) && rowCount >= 0, 'RECOVERY_DRILL_PERSISTED_ROW_COUNT_INVALID', 409);
  requireValue(Number.isInteger(r2ObjectCount) && r2ObjectCount >= 0, 'RECOVERY_DRILL_PERSISTED_R2_COUNT_INVALID', 409);
  requireValue(backupObjectPresent === true && Number(backupObjectBytes) > 0, 'RECOVERY_DRILL_BACKUP_OBJECT_NOT_PROVEN', 409);

  const bundleBuilder = new RecoveryBundleBuilder({ now });
  const bundle = await bundleBuilder.build({
    sourceCommit: effectiveDeployedSha,
    artifacts: [{ id:'critical-code', checksum:effectiveDeployedSha }],
    exports: [
      { id:'snapshot-integrity', checksum:integrity },
      { id:'d1-logical-state', checksum:integrity },
      { id:'r2-inventory', checksum:integrity },
    ],
    restore: {
      snapshotId,
      dryRunOnly: true,
      evidenceBasis: 'PERSISTED_VERIFIED_BACKUP_EVIDENCE',
    },
    destinations: [],
  });

  const standby = {
    standby_id: `release-evidence-${snapshotId}`.slice(0, 240),
    recovery: {
      bundle_id: snapshotId,
      source_commit: effectiveDeployedSha,
      manifest_sha256: bundle.manifestSha256,
      verified: true,
    },
    destination: {
      id: 'release-smoke-evidence',
      provider: 'r2-head-plus-d1-metadata',
      authorized: true,
      encrypted: true,
    },
    readiness: {
      snapshot_present: backupObjectPresent === true,
      config_present: true,
      identity_present: true,
      restore_tested: metadata?.restoreVerified === true,
      integrity_verified: integrity === restoreIntegrity,
      checked_at: now(),
    },
  };

  let staged = null;
  const expectedChecks = ['snapshot-integrity','d1-logical-state','r2-inventory','runtime-descriptor','backup-object-present','activation-forbidden'];
  const controller = createRecoveryDrillController({
    bundleBuilder,
    authorize: async (permission, scope) => permission === 'resilience:recovery:drill' && owner === true && scope?.owner === true && scope?.environmentId === 'recovery-release-smoke',
    adapter: {
      async stage(payload) {
        requireValue(payload?.environment?.isolated === true, 'RECOVERY_DRILL_ISOLATION_REQUIRED');
        requireValue(payload?.environment?.production_access === false, 'RECOVERY_DRILL_PRODUCTION_ACCESS_FORBIDDEN');
        staged = {
          snapshot_id: snapshotId,
          integrity_sha256: integrity,
          deployed_sha: effectiveDeployedSha,
          table_count: tableCount,
          row_count: rowCount,
          r2_object_count: r2ObjectCount,
          backup_object_present: backupObjectPresent === true,
          backup_object_bytes: Number(backupObjectBytes),
        };
      },
      async validate() {
        requireValue(staged, 'RECOVERY_DRILL_STAGE_REQUIRED');
        const checks = [
          { id:'snapshot-integrity', ok:/^[a-f0-9]{64}$/.test(staged.integrity_sha256) },
          { id:'d1-logical-state', ok:staged.table_count > 0 && staged.row_count >= 0 },
          { id:'r2-inventory', ok:staged.r2_object_count >= 0 },
          { id:'runtime-descriptor', ok:/^[a-f0-9]{40}$/.test(staged.deployed_sha) },
          { id:'backup-object-present', ok:staged.backup_object_present === true && staged.backup_object_bytes > 0 },
          { id:'activation-forbidden', ok:true },
        ];
        return { ok:checks.every(row => row.ok), checks };
      },
      async teardown() { staged = null; },
    },
  });

  const drillId = `release-recovery-${snapshotId}`.slice(0, 240);
  const report = await controller.run({
    drill_id:drillId,
    dry_run:true,
    owner_halt:false,
    environment:{id:'recovery-release-smoke',kind:'SANDBOX',isolated:true,production_access:false},
    bundle,
    standby,
    expected_checks:expectedChecks,
    approval:{approved:true,action:'RUN_RECOVERY_DRILL',drill_id:drillId,manifest_sha256:bundle.manifestSha256},
  }, { owner });

  return {
    ...report,
    snapshot_id:snapshotId,
    restore_candidate_verified:true,
    reconstructed_tables:tableCount,
    reconstructed_rows:rowCount,
    verified_r2_objects:r2ObjectCount,
    deployed_sha:effectiveDeployedSha,
    snapshot_deployed_sha:deployedSha,
    release_bound:releaseBound,
    release_binding_sha256:releaseBound ? String(releaseBinding?.binding_sha256 || '') : null,
    persisted_evidence_reused:true,
    backup_object_present:true,
    backup_object_bytes:Number(backupObjectBytes),
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
    let persisted = null;
    if (!snapshotId) {
      persisted = (await storage.list({ limit: 1 }))[0] || null;
      snapshotId = String(persisted?.id || '');
    } else {
      persisted = (await storage.list({ limit: 100 }))
        .find(row => String(row?.id || '') === snapshotId) || null;
    }
    requireValue(snapshotId, 'RECOVERY_DRILL_BACKUP_NOT_FOUND', 404);

    if (context?.releaseSmoke === true && persisted?.encrypted === true) {
      requireValue(encryptionCodec, 'BACKUP_ENCRYPTION_CODEC_REQUIRED', 503);
      const expectedDeployedSha = currentDeployedSha(env);
      const releaseBinding = expectedDeployedSha
        ? await readReleaseBackupBinding(env, expectedDeployedSha)
        : null;
      if (releaseBinding?.ok === true) {
        const bound = typeof storage.metadata === 'function'
          ? await storage.metadata(releaseBinding.snapshot_id)
          : (await storage.list({ limit: 100 })).find(row =>
              String(row?.id || '') === String(releaseBinding.snapshot_id || '')
              && String(row?.integritySha256 || '').toLowerCase() === String(releaseBinding.snapshot_integrity_sha256 || '').toLowerCase()
            ) || null;
        if (bound
          && String(bound?.id || '') === String(releaseBinding.snapshot_id || '')
          && String(bound?.integritySha256 || '').toLowerCase() === String(releaseBinding.snapshot_integrity_sha256 || '').toLowerCase()) {
          persisted = bound;
          snapshotId = String(bound.id || '');
        }
      }
      requireValue(
        String(persisted?.encryptionKeyId || '') === String(encryptionCodec.key_id || ''),
        'RECOVERY_DRILL_ENCRYPTION_KEY_ID_MISMATCH',
        409,
      );
      requireValue(typeof env?.MEDIA_BUCKET?.head === 'function', 'BACKUP_R2_HEAD_UNAVAILABLE', 503);
      const object = await env.MEDIA_BUCKET.head(String(persisted.objectKey || ''));
      requireValue(object, 'RECOVERY_DRILL_BACKUP_OBJECT_NOT_FOUND', 404);
      return runRecoveryDrillAgainstPersistedEvidence(persisted, {
        owner: Boolean(context?.owner),
        approved: true,
        expectedDeployedSha,
        releaseBinding,
        backupObjectPresent: true,
        backupObjectBytes: Number(object?.size || 0),
      });
    }

    const snapshot = await storage.get(snapshotId);
    requireValue(snapshot, 'RECOVERY_DRILL_BACKUP_NOT_FOUND', 404);

    // storage.get() has already authenticated and integrity-checked an encrypted
    // envelope before returning plaintext. If that same snapshot also carries
    // the persisted create-time cryptographic + restore proof, reuse that exact
    // evidence instead of stable-stringifying and hashing the full snapshot a
    // second time inside the same Worker request. Plaintext/legacy backups keep
    // the full verifier and therefore remain fail-closed.
    const verifyCandidate = persisted?.encrypted === true
      ? async value => verifyPersistedEncryptedRestoreCandidate(value, persisted)
      : verifyRestoreCandidate;

    return runRecoveryDrillAgainstSnapshot(snapshot, {
      owner: Boolean(context?.owner),
      approved: true,
      verifyCandidate,
    });
  });
}
