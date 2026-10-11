import { migrate } from '../persistence/migrations.js';
import { createVerifiedBackupService, verifySnapshot } from '../backup/backup-service.js';
import {
  createR2D1BackupStorage,
  createReleaseBackupBinding,
  readReleaseBackupBinding,
  DEFAULT_RELEASE_BACKUP_MAX_AGE_MS,
  exportD1SystemState,
  exportR2Inventory,
  runScheduledSystemBackup,
} from '../backup/system-backup-runtime.js';
import { verifyRestoreCandidate } from '../backup/restore-service.js';
import { createEnvBackupEncryptionCodec } from '../backup/encrypted-backup-storage.js';
import { getShardVaultStatus, syncShardVaultCodeExternally, verifyShardVaultCodeReconstruction } from '../continuity/shardvault-runtime.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import {
  AutonomySupervisor,
  isSupervisedAutonomyJob,
  MAX_AUTONOMOUS_ROADMAP_ATTEMPTS,
} from './autonomy-supervisor.js';

export const AUTONOMY_LAUNCH_READINESS_SCHEMA = 'mel.autonomy-launch-readiness.v1';
export const AUTONOMY_PUBLIC_READINESS_CACHE_SCHEMA = 'mel.autonomy-launch-readiness-cache.v1';
export const AUTONOMY_PUBLIC_READINESS_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const AUTONOMY_PUBLIC_READINESS_CACHE_KEY = 'current';

const TERMINAL = new Set(['COMPLETED', 'COMMITTED', 'CANCELLED', 'FAILED']);
const MAX_PUBLIC_FAILURE_GROUPS = 20;

function runtimeCandidateSha(env = {}) {
  const direct = String(env?.MEL_DEPLOYED_GIT_SHA || '').trim();
  if (/^[a-f0-9]{40}$/i.test(direct)) return direct.toLowerCase();
  try {
    const built = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA || '').trim() : '';
    return /^[a-f0-9]{40}$/i.test(built) ? built.toLowerCase() : '';
  } catch {
    return '';
  }
}

function isPreview(env = {}) {
  return String(env?.MEL_PREVIEW_ISOLATED || '').toLowerCase() === 'true'
    || String(env?.MEL_RUNTIME_ENV || '').toLowerCase() === 'preview';
}

function shardVaultRoadmapPaused(env = {}) {
  if (String(env?.MEL_SHARDVAULT_ROADMAP_PAUSED || '').toLowerCase() === 'true') return true;
  try {
    return typeof MEL_SHARDVAULT_ROADMAP_PAUSED !== 'undefined'
      && String(MEL_SHARDVAULT_ROADMAP_PAUSED || '').toLowerCase() === 'true';
  } catch {
    return false;
  }
}

function roadmapId(job) {
  return String(job?.optional_context?.roadmap_id || '').trim() || null;
}

export function evaluateFailureHygiene(jobs = []) {
  const supervised = jobs.filter(isSupervisedAutonomyJob);
  const failed = supervised.filter(job => String(job?.status || '').toUpperCase() === 'FAILED');
  const groups = new Map();

  for (const job of failed) {
    const id = roadmapId(job) || (job?.requested_by === 'mel-autonomy' ? 'UNSCOPED_AUTONOMY' : 'UNSCOPED_OWNER');
    const row = groups.get(id) || {
      roadmap_id: id,
      failed_attempts: 0,
      explicit_blocked: 0,
      retry_exhausted: 0,
      latest_at: 0,
      last_error: null,
    };
    row.failed_attempts += 1;
    if (job?.result_json?.autonomy_blocked === true) row.explicit_blocked += 1;
    if (job?.result_json?.runtime_retry?.quarantined === true || String(job?.error || '').startsWith('AUTONOMY_RUNTIME_RETRY_EXHAUSTED:')) {
      row.retry_exhausted += 1;
    }
    row.latest_at = Math.max(row.latest_at, Number(job?.updated_at || job?.created_at || 0));
    if (job?.error) row.last_error = String(job.error).slice(0, 180);
    groups.set(id, row);
  }

  const summary = [...groups.values()]
    .map(row => ({
      ...row,
      auto_quarantined: !String(row.roadmap_id).startsWith('UNSCOPED_') && row.failed_attempts >= MAX_AUTONOMOUS_ROADMAP_ATTEMPTS,
    }))
    .sort((a, b) => b.failed_attempts - a.failed_attempts || String(a.roadmap_id).localeCompare(String(b.roadmap_id)));

  // The launch blocker is not "old failures exist". Historical failures are
  // evidence, not active work. A launch is unsafe only if failed work is
  // unscoped and therefore cannot be bounded by the roadmap retry cap.
  const unbounded = summary.filter(row => row.roadmap_id === 'UNSCOPED_AUTONOMY' && row.failed_attempts > 0);

  return {
    ok: unbounded.length === 0,
    historical_failed_count: failed.length,
    roadmap_failure_groups: summary.slice(0, MAX_PUBLIC_FAILURE_GROUPS),
    quarantined_roadmap_ids: summary.filter(row => row.auto_quarantined || row.explicit_blocked > 0).map(row => row.roadmap_id).filter(id => !String(id).startsWith('UNSCOPED_')),
    retry_cap: MAX_AUTONOMOUS_ROADMAP_ATTEMPTS,
    unbounded_failed_count: unbounded.reduce((sum, row) => sum + row.failed_attempts, 0),
    code: unbounded.length ? 'UNSCOPED_FAILED_WORK_REQUIRES_REVIEW' : 'FAILURE_HISTORY_BOUNDED',
  };
}

function memoryBackupStorage() {
  const rows = new Map();
  return {
    async put(snapshot) { rows.set(snapshot.id, structuredClone(snapshot)); },
    async get(id) { return rows.has(id) ? structuredClone(rows.get(id)) : null; },
    async list() {
      return [...rows.values()].map(snapshot => ({
        id: snapshot.id,
        createdAt: snapshot.createdAt,
        integritySha256: snapshot.integritySha256,
        sourceCount: snapshot.sourceCount,
        verified: true,
      }));
    },
  };
}

async function syntheticPreviewRestoreProof(env) {
  const storage = memoryBackupStorage();
  const service = createVerifiedBackupService({
    storage,
    sources: {
      database: () => exportD1SystemState(env.DB),
      r2_inventory: () => exportR2Inventory(env.MEDIA_BUCKET),
      runtime: async () => ({
        type: 'MEL_RUNTIME_DESCRIPTOR_V1',
        appVersion: 'preview',
        dbSchemaVersion: 0,
        worker: 'meliturgos-preview',
        candidateBranch: env.MEL_GITHUB_BRANCH || 'candidate/mel-clean-autonomy',
        deployedGitSha: runtimeCandidateSha(env) || null,
        deployedGitBranch: env.MEL_DEPLOYED_GIT_BRANCH || 'candidate/mel-clean-autonomy',
        runtimeEnvironment: 'preview',
      }),
    },
  });
  const created = await service.create({ id: 'launch-preview-restore-proof' }, { requestId: 'launch-preview' });
  const snapshot = await storage.get(created.id);
  const restore = await verifyRestoreCandidate(snapshot);
  return {
    ok: restore.ok === true,
    status: restore.ok ? 'SYNTHETIC_PREVIEW_RESTORE_VERIFIED' : 'SYNTHETIC_PREVIEW_RESTORE_FAILED',
    snapshot_id: created.id,
    integritySha256: created.integritySha256,
    restore,
  };
}

export async function evaluateRestoreReadiness(env) {
  if (!env?.DB?.prepare || !env?.MEDIA_BUCKET?.put || !env?.MEDIA_BUCKET?.get) {
    return { ok: false, status: 'RESTORE_BINDINGS_UNAVAILABLE' };
  }

  await migrate(env.DB);

  if (isPreview(env)) {
    try {
      return await syntheticPreviewRestoreProof(env);
    } catch (error) {
      return { ok: false, status: 'SYNTHETIC_PREVIEW_RESTORE_FAILED', code: String(error?.code || error?.message || error) };
    }
  }

  try {
    const encryptionKeyId = String(env?.MEL_BACKUP_ENCRYPTION_KEY_ID || '').trim();
    const encryptionKey = String(env?.MEL_BACKUP_ENCRYPTION_KEY_B64 || '').trim();
    const encryptionRequested = Boolean(encryptionKeyId || encryptionKey);
    const encryptionCodec = encryptionRequested ? createEnvBackupEncryptionCodec(env) : null;
    const storage = createR2D1BackupStorage({ db: env.DB, bucket: env.MEDIA_BUCKET, encryptionCodec });
    const candidates = await storage.list({ limit: 100 });
    if (!candidates.length) return { ok: false, status: 'NO_VERIFIED_SYSTEM_BACKUP' };

    const deployedSha = runtimeCandidateSha(env);
    const proofBound = (row) => {
      const proofIntegrity = String(row?.restoreIntegritySha256 || '').toLowerCase();
      const snapshotIntegrity = String(row?.integritySha256 || '').toLowerCase();
      return Boolean(row?.id)
        && row?.verified === true
        && row?.restoreVerified === true
        && /^[a-f0-9]{64}$/i.test(proofIntegrity)
        && proofIntegrity === snapshotIntegrity;
    };

    const exact = candidates.find(row => proofBound(row)
      && Boolean(deployedSha)
      && String(row?.restoreDeployedGitSha || '').toLowerCase() === deployedSha) || null;

    let selected = exact;
    let releaseBinding = null;
    let releaseBound = false;

    if (!selected && deployedSha) {
      const binding = await readReleaseBackupBinding(env, deployedSha);
      if (binding?.ok === true) {
        const maxAgeRequested = Number(env?.MEL_RELEASE_BACKUP_MAX_AGE_MS ?? DEFAULT_RELEASE_BACKUP_MAX_AGE_MS);
        const maxAge = Number.isFinite(maxAgeRequested) && maxAgeRequested > 0
          ? Math.max(15 * 60 * 1000, Math.min(48 * 60 * 60 * 1000, maxAgeRequested))
          : DEFAULT_RELEASE_BACKUP_MAX_AGE_MS;
        const nowMs = Date.now();
        const boundSnapshot = candidates.find(row => proofBound(row)
          && String(row?.id || '') === String(binding.snapshot_id || '')
          && String(row?.integritySha256 || '').toLowerCase() === String(binding.snapshot_integrity_sha256 || '').toLowerCase()) || null;
        const createdMs = Date.parse(boundSnapshot?.createdAt || '');
        const boundSnapshotSha = String(boundSnapshot?.restoreDeployedGitSha || '').toLowerCase();
        const bindingSnapshotSha = String(binding?.snapshot_deployed_sha || '').toLowerCase();
        const ageOk = Boolean(boundSnapshot)
          && /^[a-f0-9]{40}$/.test(boundSnapshotSha)
          && bindingSnapshotSha === boundSnapshotSha
          && Number.isFinite(createdMs)
          && createdMs <= nowMs
          && nowMs - createdMs <= maxAge
          && String(binding.snapshot_created_at || '') === String(boundSnapshot?.createdAt || '');

        if (ageOk) {
          selected = boundSnapshot;
          releaseBinding = binding;
          releaseBound = true;
        }
      }
    }

    const latest = candidates[0] || null;
    if (!selected) {
      const latestProofSha = String(latest?.restoreDeployedGitSha || '').toLowerCase();
      const latestProofBound = proofBound(latest);
      return {
        ok: false,
        status: latestProofBound ? 'SYSTEM_BACKUP_DEPLOYED_SHA_MISMATCH' : 'SYSTEM_BACKUP_RESTORE_PROOF_MISSING',
        snapshot_id: latest?.id || null,
        created_at: latest?.createdAt || null,
        integritySha256: latest?.integritySha256 || null,
        deployed_sha: deployedSha || null,
        backup_deployed_sha: latestProofSha || null,
        snapshot_deployed_sha: latestProofSha || null,
        sha_matches: false,
        proof_bound: latestProofBound,
      };
    }

    const snapshotProofSha = String(selected.restoreDeployedGitSha || '').toLowerCase();
    const shaMatches = Boolean(deployedSha)
      && (snapshotProofSha === deployedSha || (releaseBound && releaseBinding?.deployed_sha === deployedSha));
    const packageBoundSha = releaseBound ? deployedSha : snapshotProofSha;

    return {
      ok: shaMatches,
      status: shaMatches
        ? (releaseBound
            ? 'RELEASE_BOUND_SYSTEM_BACKUP_RESTORE_PROOF_VERIFIED'
            : 'LATEST_SYSTEM_BACKUP_RESTORE_PROOF_VERIFIED')
        : 'SYSTEM_BACKUP_DEPLOYED_SHA_MISMATCH',
      snapshot_id: selected.id,
      created_at: selected.createdAt || null,
      integritySha256: selected.integritySha256 || null,
      deployed_sha: deployedSha || null,
      backup_deployed_sha: packageBoundSha || null,
      snapshot_deployed_sha: snapshotProofSha || null,
      sha_matches: shaMatches,
      proof_bound: true,
      release_binding: releaseBound ? {
        ok: true,
        schema: releaseBinding.schema,
        deployed_sha: releaseBinding.deployed_sha,
        binding_sha256: releaseBinding.binding_sha256,
        bound_at: releaseBinding.bound_at,
      } : null,
      restore: {
        ok: true,
        code: selected.restoreCode || 'RESTORE_CANDIDATE_VERIFIED',
        snapshot_id: selected.id,
        integritySha256: selected.restoreIntegritySha256,
        database: {
          tableCount: Number(selected.restoreTableCount || 0),
          rowCount: Number(selected.restoreRowCount || 0),
        },
        r2: {
          objectCount: Number(selected.restoreR2ObjectCount || 0),
        },
        runtime: {
          deployedGitSha: snapshotProofSha || null,
          releaseBoundGitSha: releaseBound ? deployedSha : null,
        },
        proof_source: releaseBound
          ? 'verified-backup-persist+release-binding'
          : 'verified-backup-persist',
      },
    };
  } catch (error) {
    return { ok: false, status: 'RESTORE_READINESS_ERROR', code: String(error?.code || error?.message || error) };
  }
}

export async function evaluateShardVaultLaunchReadiness(env) {
  if (shardVaultRoadmapPaused(env)) {
    return {
      ok: true,
      status: 'PAUSED_FOR_ROADMAP',
      paused: true,
      enabled: false,
      recoverable: false,
      active_external_count: 0,
      external_code_status: 'PAUSED_FOR_ROADMAP',
      external_code_endpoints: 0,
      target_count: 7,
      temporary: true,
      resume_condition: 'ROADMAP_COMPLETE',
    };
  }

  if (isPreview(env)) {
    // The isolated preview workflow executes the destructive/live Internet
    // ShardVault probe after autonomy bootstrap. Do not make that probe depend
    // on itself. Production never receives this exemption.
    return {
      ok: true,
      status: 'PREVIEW_LIVE_PROBE_REQUIRED_SEPARATELY',
      preview_only: true,
      target_count: 7,
    };
  }

  const status = await getShardVaultStatus(env);
  const activeExternal = Array.isArray(status?.active_external_registry) ? status.active_external_registry.length : 0;
  const externalCode = status?.code_survival?.external;
  const externalEndpoints = Array.isArray(externalCode?.endpoints) ? externalCode.endpoints.length : 0;
  const dataShards = Number(externalCode?.data_shards || status?.scheme?.data_shards || 4);
  const targetCount = Number(externalCode?.target_count || status?.scheme?.total_shards || 7);
  const releaseQuorum = Math.min(targetCount, Math.max(dataShards, 5));
  const reconstruction = await verifyShardVaultCodeReconstruction(env)
    .catch(error => ({ ok: false, status: 'CODE_RECONSTRUCTION_CHECK_FAILED', error: String(error?.message || error) }));
  const codeReconstructible = reconstruction?.ok === true
    && reconstruction?.status === 'CODE_RECONSTRUCTION_VERIFIED';
  const fullReplication = activeExternal >= targetCount
    && externalCode?.status === 'COPIED'
    && externalEndpoints >= targetCount;
  const quorumReplication = activeExternal >= releaseQuorum
    && ['COPIED', 'QUORUM_COPIED'].includes(String(externalCode?.status || ''))
    && externalEndpoints >= releaseQuorum
    && codeReconstructible;
  const ok = status?.ok === true
    && status?.enabled === true
    && status?.health?.recoverable === true
    && quorumReplication;

  return {
    ok,
    status: ok
      ? fullReplication ? 'SHARDVAULT_7X_CODE_SURVIVAL_VERIFIED' : 'SHARDVAULT_QUORUM_CODE_SURVIVAL_VERIFIED'
      : 'SHARDVAULT_LAUNCH_PROOF_INCOMPLETE',
    vault_status: status?.status || null,
    recoverable: status?.health?.recoverable === true,
    active_external_count: activeExternal,
    external_code_status: externalCode?.status || null,
    external_code_endpoints: externalEndpoints,
    target_count: targetCount,
    release_quorum: releaseQuorum,
    code_reconstruction_verified: codeReconstructible,
    repair_pending: ok && !fullReplication,
  };
}

function publicReadinessCachePayload(value) {
  return {
    ok: value?.ok === true,
    schema: value?.schema || AUTONOMY_LAUNCH_READINESS_SCHEMA,
    status: value?.status || 'NO_GO',
    launch_ready: value?.launch_ready === true,
    candidate_branch: value?.candidate_branch || null,
    teacher_branch: value?.teacher_branch || null,
    candidate_sha: value?.candidate_sha || null,
    gate_digest: value?.gate_digest || null,
    gates: value?.gates || {},
    blockers: Array.isArray(value?.blockers) ? value.blockers.slice(0, 20) : [],
    failure_hygiene: {
      ok: value?.failure_hygiene?.ok === true,
      historical_failed_count: Number(value?.failure_hygiene?.historical_failed_count || 0),
      retry_cap: Number(value?.failure_hygiene?.retry_cap || 0),
      quarantined_roadmap_ids: Array.isArray(value?.failure_hygiene?.quarantined_roadmap_ids)
        ? value.failure_hygiene.quarantined_roadmap_ids.slice(0, 30)
        : [],
      unbounded_failed_count: Number(value?.failure_hygiene?.unbounded_failed_count || 0),
      code: value?.failure_hygiene?.code || null,
    },
    restore: {
      ok: value?.restore?.ok === true,
      status: value?.restore?.status || null,
      snapshot_id: value?.restore?.snapshot_id || null,
      deployed_sha: value?.restore?.deployed_sha || null,
      backup_deployed_sha: value?.restore?.backup_deployed_sha || null,
      sha_matches: value?.restore?.sha_matches === true,
    },
    shardvault: {
      ok: value?.shardvault?.ok === true,
      status: value?.shardvault?.status || null,
      paused: value?.shardvault?.paused === true,
      temporary: value?.shardvault?.temporary === true,
      resume_condition: value?.shardvault?.resume_condition || null,
      recoverable: value?.shardvault?.recoverable === true,
      active_external_count: Number(value?.shardvault?.active_external_count || 0),
      external_code_status: value?.shardvault?.external_code_status || null,
      external_code_endpoints: Number(value?.shardvault?.external_code_endpoints || 0),
      target_count: Number(value?.shardvault?.target_count || 7),
      release_quorum: Number(value?.shardvault?.release_quorum || 5),
      code_reconstruction_verified: value?.shardvault?.code_reconstruction_verified === true,
      repair_pending: value?.shardvault?.repair_pending === true,
    },
    invariants: value?.invariants || {},
    evaluated_at: value?.evaluated_at || null,
  };
}

export async function writeAutonomyLaunchReadinessPublicCache(env, value, { now = Date.now() } = {}) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') {
    return { ok: false, status: 'PUBLIC_LAUNCH_READINESS_CACHE_DB_UNAVAILABLE' };
  }
  const readiness = publicReadinessCachePayload(value);
  const candidateSha = String(readiness.candidate_sha || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(candidateSha)) {
    return { ok: false, status: 'PUBLIC_LAUNCH_READINESS_CACHE_SHA_INVALID' };
  }
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mel_autonomy_launch_readiness_cache (
      cache_key TEXT PRIMARY KEY,
      candidate_sha TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`).run();
    await env.DB.prepare(`INSERT OR REPLACE INTO mel_autonomy_launch_readiness_cache
      (cache_key,candidate_sha,payload_json,updated_at) VALUES(?,?,?,?)`)
      .bind(AUTONOMY_PUBLIC_READINESS_CACHE_KEY, candidateSha, JSON.stringify(readiness), Number(now))
      .run();
    return {
      ok: true,
      status: 'PUBLIC_LAUNCH_READINESS_CACHE_WRITTEN',
      candidate_sha: candidateSha,
      updated_at: Number(now),
    };
  } catch (error) {
    return {
      ok: false,
      status: 'PUBLIC_LAUNCH_READINESS_CACHE_WRITE_FAILED',
      code: String(error?.code || error?.message || error).slice(0, 180),
    };
  }
}

export async function readAutonomyLaunchReadinessPublicCache(env, {
  now = Date.now(),
  maxAgeMs = AUTONOMY_PUBLIC_READINESS_CACHE_MAX_AGE_MS,
} = {}) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') {
    return { ok: false, status: 'PUBLIC_LAUNCH_READINESS_CACHE_DB_UNAVAILABLE', readiness: null };
  }
  const expectedSha = runtimeCandidateSha(env);
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
    return { ok: false, status: 'PUBLIC_LAUNCH_READINESS_DEPLOYED_SHA_INVALID', readiness: null };
  }
  try {
    const row = await env.DB.prepare(`SELECT candidate_sha,payload_json,updated_at
      FROM mel_autonomy_launch_readiness_cache WHERE cache_key=? LIMIT 1`)
      .bind(AUTONOMY_PUBLIC_READINESS_CACHE_KEY)
      .first();
    if (!row) {
      return { ok: false, status: 'PUBLIC_LAUNCH_READINESS_CACHE_MISSING', readiness: null };
    }
    const rowSha = String(row.candidate_sha || '').trim().toLowerCase();
    if (rowSha !== expectedSha) {
      return {
        ok: false,
        status: 'PUBLIC_LAUNCH_READINESS_CACHE_SHA_MISMATCH',
        candidate_sha: rowSha || null,
        expected_sha: expectedSha,
        readiness: null,
      };
    }
    const updatedAt = Number(row.updated_at || 0);
    const ageMs = updatedAt > 0 ? Math.max(0, Number(now) - updatedAt) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(ageMs) || ageMs > Math.max(1000, Number(maxAgeMs || 0))) {
      return {
        ok: false,
        status: 'PUBLIC_LAUNCH_READINESS_CACHE_STALE',
        candidate_sha: rowSha,
        cache_age_ms: Number.isFinite(ageMs) ? ageMs : null,
        readiness: null,
      };
    }
    const parsed = JSON.parse(String(row.payload_json || '{}'));
    const readiness = publicReadinessCachePayload(parsed);
    if (String(readiness.candidate_sha || '').trim().toLowerCase() !== expectedSha) {
      return {
        ok: false,
        status: 'PUBLIC_LAUNCH_READINESS_CACHE_PAYLOAD_SHA_MISMATCH',
        candidate_sha: String(readiness.candidate_sha || '') || null,
        expected_sha: expectedSha,
        readiness: null,
      };
    }
    return {
      ok: true,
      status: 'PUBLIC_LAUNCH_READINESS_CACHE_HIT',
      candidate_sha: expectedSha,
      cache_age_ms: ageMs,
      cache_schema: AUTONOMY_PUBLIC_READINESS_CACHE_SCHEMA,
      readiness,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'PUBLIC_LAUNCH_READINESS_CACHE_MISSING',
      code: String(error?.code || error?.message || error).slice(0, 180),
      readiness: null,
    };
  }
}

export async function getAutonomyLaunchReadiness(env, {
  repository = null,
} = {}) {
  if (env?.DB?.prepare) await migrate(env.DB);
  const repo = repository || new D1DevJobRepository(env?.DB);
  const supervisor = new AutonomySupervisor({ repository: repo });
  const state = await supervisor.state();
  const restore = await evaluateRestoreReadiness(env);
  const shardvault = await evaluateShardVaultLaunchReadiness(env);

  const branch = String(env?.MEL_GITHUB_BRANCH || 'candidate/mel-clean-autonomy').trim();
  const teacherBranch = String(env?.MEL_TEACHER_BRANCH || branch).trim();
  const candidateBoundary = branch.startsWith('candidate/') && teacherBranch === branch;
  const failureHygiene = evaluateFailureHygiene(state.supervisedJobs);
  const active = state.active.filter(isSupervisedAutonomyJob);
  const candidateSha = runtimeCandidateSha(env);

  const gates = {
    canonical_candidate_boundary: candidateBoundary,
    bounded_failure_history: failureHygiene.ok === true,
    no_unbounded_active_work: active.every(job => !String(job?.status || '').toUpperCase().startsWith('UNKNOWN')),
    verified_restore_dry_run: restore.ok === true,
    shardvault_critical_survival: shardvault.ok === true,
    production_release_separately_gated: true,
    owner_halt_invariant: true,
    zero_added_cost_fail_closed: true,
  };

  const blockers = [];
  if (!gates.canonical_candidate_boundary) blockers.push('CANONICAL_CANDIDATE_BOUNDARY_NOT_PROVEN');
  if (!gates.bounded_failure_history) blockers.push(failureHygiene.code || 'FAILURE_HISTORY_UNBOUNDED');
  if (!gates.no_unbounded_active_work) blockers.push('ACTIVE_WORK_STATE_UNBOUNDED');
  if (!gates.verified_restore_dry_run) blockers.push(restore.status || 'RESTORE_DRY_RUN_NOT_VERIFIED');
  if (!gates.shardvault_critical_survival) blockers.push(shardvault.status || 'SHARDVAULT_LAUNCH_PROOF_INCOMPLETE');

  const ready = blockers.length === 0;
  const digestInput = JSON.stringify({
    branch,
    teacherBranch,
    candidateSha,
    gates,
    failure_code: failureHygiene.code,
    restore: restore.status,
    shardvault: shardvault.status,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(digestInput));
  const gateDigest = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');

  return {
    ok: true,
    schema: AUTONOMY_LAUNCH_READINESS_SCHEMA,
    evaluated_at: new Date().toISOString(),
    status: ready ? 'GO_FOR_SUPERVISED_AUTONOMY' : 'NO_GO',
    launch_ready: ready,
    candidate_branch: branch,
    teacher_branch: teacherBranch,
    candidate_sha: candidateSha || null,
    gate_digest: gateDigest,
    gates,
    blockers,
    failure_hygiene: failureHygiene,
    restore,
    shardvault,
    active_work: {
      count: active.length,
      jobs: active.slice(0, 10).map(job => ({
        id: String(job?.id || ''),
        status: String(job?.status || ''),
        requested_by: String(job?.requested_by || ''),
        roadmap_id: roadmapId(job),
      })),
    },
    next_roadmap_item: state.next ? {
      id: state.next.id,
      title: state.next.title,
      status: state.next.status,
      priority: state.next.priority,
    } : null,
    invariants: {
      autonomous_changes_candidate_only: true,
      production_deploy_requires_separate_human_authorization: true,
      owner_shutdown_wins: true,
      max_roadmap_attempts: MAX_AUTONOMOUS_ROADMAP_ATTEMPTS,
    },
  };
}

export function summarizeAutonomyLaunchCodeSync(value) {
  if (!value) return null;
  const external = value?.external || {};
  return {
    ok: value?.ok === true,
    complete: value?.complete === true || external?.status === 'COPIED' || value?.status === 'COPIED',
    status: value?.status || external?.status || null,
    target_count: Number(external?.target_count || value?.target_count || 7),
    endpoints: Array.isArray(external?.endpoints) ? external.endpoints.slice(0, 14) : [],
    successful_endpoints: Array.isArray(external?.successful_endpoints) ? external.successful_endpoints.slice(0, 14) : [],
    attempted_endpoints: Array.isArray(external?.attempted_endpoints) ? external.attempted_endpoints.slice(0, 28) : [],
    completed_shards: Number(external?.completed_shards ?? external?.progress?.completed ?? 0),
    pending_shards: Number(external?.pending_shards ?? 0),
    progress: {
      completed: Number(external?.progress?.completed ?? external?.completed_shards ?? 0),
      target: Number(external?.progress?.target ?? external?.target_count ?? value?.target_count ?? 7),
    },
    reason: external?.reason || null,
    next_retry_at: external?.next_retry_at || null,
    relay_pending: external?.relay_pending === true,
    relay_job_id: external?.relay_job_id || null,
    relay_status: external?.relay_status || null,
    code_pool_exhaustions: Number(external?.code_pool_exhaustions || 0),
    code_pool_refreshes: Number(external?.code_pool_refreshes || 0),
    failures: Array.isArray(external?.failures)
      ? external.failures.slice(0, 24).map(row => ({
          shard_index: Number(row?.shard_index),
          endpoint_id: row?.endpoint_id || null,
          error: String(row?.error || '').slice(0, 160),
          retryable: row?.retryable === true,
          permanent: row?.permanent === true,
          retry_after_at: row?.retry_after_at || null,
        }))
      : [],
    verified_roundtrip: external?.verified_roundtrip === true,
    reconstruction_verified: external?.reconstruction_verified === true,
    release_quorum: Number(external?.release_quorum || 5),
    repair_pending: external?.repair_pending === true,
    critical_status: value?.critical_status || null,
  };
}

export async function prepareAutonomyLaunchBackup(env) {
  if (isPreview(env)) return { ok: true, status: 'SKIPPED_PREVIEW' };
  try {
    const existing = await evaluateRestoreReadiness(env);
    if (existing?.ok === true) {
      return {
        ok: true,
        status: existing.status === 'RELEASE_BOUND_SYSTEM_BACKUP_RESTORE_PROOF_VERIFIED'
          ? 'REUSED_RELEASE_BOUND_VERIFIED_BACKUP'
          : 'REUSED_VERIFIED_SHA_BOUND_BACKUP',
        id: existing.snapshot_id || null,
        integritySha256: existing.integritySha256 || null,
        deployedSha: existing.backup_deployed_sha || null,
      };
    }

    const binding = await createReleaseBackupBinding(env);
    if (binding?.ok === true) {
      const rebound = await evaluateRestoreReadiness(env);
      if (rebound?.ok === true) {
        return {
          ok: true,
          status: 'RELEASE_BOUND_VERIFIED_BACKUP',
          id: rebound.snapshot_id || binding.snapshot_id || null,
          integritySha256: rebound.integritySha256 || binding.snapshot_integrity_sha256 || null,
          deployedSha: rebound.backup_deployed_sha || binding.deployed_sha || null,
          snapshotDeployedSha: rebound.snapshot_deployed_sha || binding.snapshot_deployed_sha || null,
          bindingSha256: binding.binding_sha256 || null,
        };
      }
    }

    // If no recent verified snapshot exists, retain the original fail-closed
    // full-backup path. Small deployments can still create a fresh snapshot;
    // large deployments will remain NO_GO until the scheduled maintenance
    // backup produces one.
    const backup = await runScheduledSystemBackup(env, {
      intervalMs: 15 * 60 * 1000,
      force: true,
      compactPostPersistVerify: true,
    });
    return {
      ok: backup?.ok === true,
      status: backup?.status || 'BACKUP_PREPARED',
      id: backup?.id || null,
      integritySha256: backup?.integritySha256 || null,
      sourceCount: Number(backup?.sourceCount || 0),
      nextDueAt: backup?.nextDueAt || null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'LAUNCH_BACKUP_PREP_FAILED',
      code: String(error?.code || error?.message || error),
    };
  }
}

export async function prepareAutonomyLaunchCodeSync(env) {
  if (shardVaultRoadmapPaused(env)) {
    return {
      ok: true,
      complete: true,
      status: 'PAUSED_FOR_ROADMAP',
      code_sync: {
        ok: true,
        complete: true,
        paused: true,
        status: 'PAUSED_FOR_ROADMAP',
        target_count: 7,
        endpoints: [],
        successful_endpoints: [],
      },
    };
  }
  if (isPreview(env)) return { ok: true, complete: true, status: 'SKIPPED_PREVIEW', code_sync: null };
  try {
    const raw = await syncShardVaultCodeExternally(env);
    const codeSync = summarizeAutonomyLaunchCodeSync(raw);
    return {
      ok: raw?.ok === true,
      complete: codeSync?.complete === true,
      status: codeSync?.status || 'UNKNOWN',
      code_sync: codeSync,
    };
  } catch (error) {
    return {
      ok: false,
      complete: false,
      status: 'LAUNCH_EXTERNAL_CODE_SYNC_FAILED',
      code: String(error?.code || error?.message || error),
      code_sync: null,
    };
  }
}

export async function prepareAutonomyLaunch(env, {
  repository = null,
} = {}) {
  const existingReadiness = await getAutonomyLaunchReadiness(env, { repository });
  if (existingReadiness?.launch_ready === true) {
    return {
      ok: true,
      status: 'LAUNCH_EVIDENCE_REUSED',
      backup: {
        ok: true,
        status: 'REUSED_VERIFIED_SHA_BOUND_BACKUP',
        id: existingReadiness?.restore?.snapshot_id || null,
        integritySha256: existingReadiness?.restore?.integritySha256 || null,
      },
      code_sync: existingReadiness?.shardvault?.status === 'PAUSED_FOR_ROADMAP'
        ? { ok: true, complete: true, paused: true, status: 'PAUSED_FOR_ROADMAP', target_count: 7, endpoints: [], successful_endpoints: [] }
        : null,
      readiness: existingReadiness,
    };
  }

  const backup = await prepareAutonomyLaunchBackup(env);
  if (backup?.ok !== true) {
    return {
      ok: false,
      status: 'LAUNCH_BACKUP_PREP_FAILED',
      code: backup?.code || backup?.status || 'BACKUP_FAILED',
      backup,
      readiness: await getAutonomyLaunchReadiness(env, { repository }),
    };
  }

  const sync = await prepareAutonomyLaunchCodeSync(env);
  if (sync?.ok !== true) {
    return {
      ok: false,
      status: 'LAUNCH_EXTERNAL_CODE_SYNC_FAILED',
      code: sync?.code || sync?.status || 'CODE_SYNC_FAILED',
      backup,
      code_sync: sync?.code_sync || null,
      readiness: await getAutonomyLaunchReadiness(env, { repository }),
    };
  }

  const readiness = await getAutonomyLaunchReadiness(env, { repository });
  return {
    ok: readiness.launch_ready === true,
    status: readiness.launch_ready ? 'LAUNCH_EVIDENCE_READY' : 'LAUNCH_EVIDENCE_INCOMPLETE',
    backup,
    code_sync: sync?.code_sync || null,
    readiness,
  };
}
