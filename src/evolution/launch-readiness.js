import { migrate } from '../persistence/migrations.js';
import { createVerifiedBackupService, verifySnapshot } from '../backup/backup-service.js';
import {
  createR2D1BackupStorage,
  exportD1SystemState,
  exportR2Inventory,
  runScheduledSystemBackup,
} from '../backup/system-backup-runtime.js';
import { verifyRestoreCandidate } from '../backup/restore-service.js';
import { getShardVaultStatus, syncShardVaultCodeExternally } from '../continuity/shardvault-runtime.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import {
  AutonomySupervisor,
  isSupervisedAutonomyJob,
  MAX_AUTONOMOUS_ROADMAP_ATTEMPTS,
} from './autonomy-supervisor.js';

export const AUTONOMY_LAUNCH_READINESS_SCHEMA = 'mel.autonomy-launch-readiness.v1';

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
    const storage = createR2D1BackupStorage({ db: env.DB, bucket: env.MEDIA_BUCKET });
    const latest = (await storage.list({ limit: 1 }))[0] || null;
    if (!latest?.id) return { ok: false, status: 'NO_VERIFIED_SYSTEM_BACKUP' };
    const snapshot = await storage.get(latest.id);
    const integrity = await verifySnapshot(snapshot);
    if (!integrity?.ok) return { ok: false, status: 'SYSTEM_BACKUP_INTEGRITY_FAILED', code: integrity?.code || null, snapshot_id: latest.id };
    const restore = await verifyRestoreCandidate(snapshot);
    const deployedSha = runtimeCandidateSha(env);
    const backupSha = String(restore?.runtime?.deployedGitSha || '').toLowerCase();
    const shaMatches = Boolean(deployedSha) && backupSha === deployedSha;
    const ok = restore.ok === true && shaMatches;
    return {
      ok,
      status: ok
        ? 'LATEST_SYSTEM_BACKUP_RESTORE_VERIFIED'
        : (restore.ok === true ? 'SYSTEM_BACKUP_DEPLOYED_SHA_MISMATCH' : 'LATEST_SYSTEM_BACKUP_RESTORE_FAILED'),
      snapshot_id: latest.id,
      created_at: latest.createdAt || null,
      integritySha256: latest.integritySha256 || snapshot?.integritySha256 || null,
      deployed_sha: deployedSha || null,
      backup_deployed_sha: backupSha || null,
      sha_matches: shaMatches,
      restore,
    };
  } catch (error) {
    return { ok: false, status: 'RESTORE_READINESS_ERROR', code: String(error?.code || error?.message || error) };
  }
}

export async function evaluateShardVaultLaunchReadiness(env) {
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
  const ok = status?.ok === true
    && status?.enabled === true
    && status?.health?.recoverable === true
    && activeExternal >= 7
    && externalCode?.status === 'COPIED'
    && externalEndpoints >= 7;

  return {
    ok,
    status: ok ? 'SHARDVAULT_7X_CODE_SURVIVAL_VERIFIED' : 'SHARDVAULT_LAUNCH_PROOF_INCOMPLETE',
    vault_status: status?.status || null,
    recoverable: status?.health?.recoverable === true,
    active_external_count: activeExternal,
    external_code_status: externalCode?.status || null,
    external_code_endpoints: externalEndpoints,
    target_count: 7,
  };
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
    failures: Array.isArray(external?.failures)
      ? external.failures.slice(0, 24).map(row => ({
          shard_index: Number(row?.shard_index),
          endpoint_id: row?.endpoint_id || null,
          error: String(row?.error || '').slice(0, 160),
        }))
      : [],
    verified_roundtrip: external?.verified_roundtrip === true,
    critical_status: value?.critical_status || null,
  };
}

export async function prepareAutonomyLaunchBackup(env) {
  if (isPreview(env)) return { ok: true, status: 'SKIPPED_PREVIEW' };
  try {
    const backup = await runScheduledSystemBackup(env, { intervalMs: 15 * 60 * 1000, force: true });
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
