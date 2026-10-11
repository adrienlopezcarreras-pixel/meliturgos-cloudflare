import {
  evaluateRestoreReadiness,
  getAutonomyLaunchReadiness,
  writeAutonomyLaunchReadinessPublicCache,
  prepareAutonomyLaunch,
  prepareAutonomyLaunchBackup,
  prepareAutonomyLaunchCodeSync,
} from './launch-readiness.js';
import { setAutonomyControl } from './autonomy-control.js';
import { D1SkillRegistryStore } from './d1-skill-registry-store.js';
import { SkillRegistry } from './skill-registry.js';
import { D1PluginVersionStore } from '../plugins/d1-version-store.js';
import { PluginVersionManager } from '../plugins/version-manager.js';
import { D1EvolutionLedger } from './evolution-ledger.js';
import { createAgentRegistry } from '../agents/agent-registry.js';
import { createD1AgentRegistryAdapter } from '../agents/d1-agent-registry.js';
import { createD1AgentAutomationPolicyAdapter } from '../automations/d1-agent-automation-policy.js';
import { createAgentAutomationPolicy, PERMISSION_TIERS } from '../automations/agent-automation-policy.js';
import { createProviderNeutralManifest } from '../portability/provider-neutral-manifest.js';
import { createProviderEscapeCapsule, providerEscapeSummary, validateProviderEscapeCapsule } from '../portability/provider-escape-capsule.js';
import { boundRecentMessages, compileHistoricalDecisionCapsule, buildContext } from '../core/orchestrator/context-builder.js';
import { proveEcosystemTeacherHandoff } from '../evaluation/capability-watch-runtime.js';
import { runAutonomyRuntimeTick } from './autonomy-runtime.js';
import { maybeHandleConnectionSettingsApi } from '../api/connection-settings-api.js';
import { D1AlternativeRegistryStore } from '../portability/d1-alternative-registry-store.js';
import { eligibleAlternatives, sovereigntyCoverageFromRegistry } from '../portability/prevalidated-alternative-registry.js';
import { liveTechnicalSovereigntyReport } from '../portability/technical-sovereignty-live.js';
import { runConfiguredAiCandidateValidationRuntime } from '../portability/configured-ai-candidate-validation-runtime.js';
import { runCompanionAiPrevalidationRuntime } from '../portability/companion-ai-prevalidation-runtime.js';
import { runCompanionSourceControlPrevalidationRuntime } from '../portability/companion-source-control-prevalidation-runtime.js';
import { runCompanionInfrastructurePrevalidationRuntime } from '../portability/companion-infrastructure-prevalidation-runtime.js';
import { runGoogleDriveBackupRestorePrevalidationRuntime } from '../portability/google-drive-backup-restore-prevalidation-runtime.js';
import { authorizeGitHubActionsOidcRequest } from '../security/github-actions-oidc.js';
import { runMelMedia02LiveProof } from '../media/media-roadmap-proof.js';

const PATH = '/api/internal/release-launch-bootstrap';
const PHASES = new Set(['all', 'identity', 'pause', 'backup', 'code-sync', 'readiness', 'sovereignty-proof', 'skill-registry-proof', 'plugin-sdk-proof', 'evolution-ledger-proof', 'agent-automation-proof', 'provider-escape-proof', 'long-context-proof', 'capability-watch-proof', 'connection-proof', 'media-proof', 'gen2-42-runtime-tick', 'gen2-42-owner-max', 'release-rollback-restore']);

function exactDeployedSha(env = {}) {
  const direct = String(env?.MEL_DEPLOYED_GIT_SHA || '').trim().toLowerCase();
  if (/^[0-9a-f]{40}$/.test(direct)) return direct;
  try {
    const built = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined'
      ? String(MEL_DEPLOYED_GIT_SHA || '').trim().toLowerCase()
      : '';
    return /^[0-9a-f]{40}$/.test(built) ? built : '';
  } catch {
    return '';
  }
}

function exactShaReusableAlternative(registry, layer, deployedSha, { now = Date.now() } = {}) {
  const sha = String(deployedSha || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) return null;
  const rows = eligibleAlternatives(registry, layer, { maxAddedCostEur: 0, now });
  return rows.find((row) => String(row?.proof?.source_sha || '').trim().toLowerCase() === sha) || null;
}

function exactDeployedBranch(env = {}) {
  const direct = String(env?.MEL_DEPLOYED_GIT_BRANCH || '').trim();
  if (direct) return direct;
  try {
    return typeof MEL_DEPLOYED_GIT_BRANCH !== 'undefined'
      ? String(MEL_DEPLOYED_GIT_BRANCH || '').trim()
      : '';
  } catch {
    return '';
  }
}

async function devBridgeExecutorState(env = {}, { now = Date.now(), onlineWithinMs = 60000 } = {}) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') {
    return { online: false, status: 'DB_UNAVAILABLE', last_seen_age_ms: null };
  }
  try {
    const row = await env.DB.prepare(
      "SELECT last_seen,status FROM dev_bridge_state WHERE bridge_id='primary' LIMIT 1"
    ).first();
    if (!row) return { online: false, status: 'OFFLINE', last_seen_age_ms: null };
    const lastSeen = Number(row.last_seen || 0);
    const age = lastSeen > 0 ? Math.max(0, now - lastSeen) : null;
    return {
      online: age != null && age < onlineWithinMs && String(row.status || '').toUpperCase() === 'ONLINE',
      status: String(row.status || 'OFFLINE').slice(0, 80),
      last_seen_age_ms: age,
    };
  } catch {
    return { online: false, status: 'UNKNOWN', last_seen_age_ms: null };
  }
}

async function requestPhase(request) {
  try {
    const body = await request.json();
    const phase = String(body?.phase || 'all').trim().toLowerCase();
    return PHASES.has(phase) ? phase : null;
  } catch {
    return 'all';
  }
}

function equalToken(expected, supplied) {
  const a = new TextEncoder().encode(String(expected || ''));
  const b = new TextEncoder().encode(String(supplied || ''));
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) diff |= (a[i % Math.max(1, a.length)] || 0) ^ (b[i % Math.max(1, b.length)] || 0);
  return a.length >= 32 && a.length === b.length && diff === 0;
}


async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readBootstrapChallengeObject(bucket, key) {
  if (!bucket || typeof bucket.get !== 'function') return null;
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    if (typeof object.json === 'function') return await object.json();
    if (typeof object.text === 'function') return JSON.parse(await object.text());
  } catch {}
  return null;
}

export async function consumeBootstrapChallenge(env, supplied, scope, { now = Date.now() } = {}) {
  const token = String(supplied || '');
  if (token.length < 32 || !env?.DB || typeof env.DB.prepare !== 'function') return false;
  const normalizedScope = String(scope || '').trim().slice(0, 120);
  if (!normalizedScope) return false;

  const hash = await sha256Hex(token);

  // Compatibility path for challenges written directly into D1.
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mel_bootstrap_challenges (
    token_hash TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    created_at INTEGER NOT NULL
  )`).run();
  const direct = await env.DB.prepare(`UPDATE mel_bootstrap_challenges
    SET consumed_at=?
    WHERE token_hash=? AND scope=? AND consumed_at IS NULL AND expires_at>=?`)
    .bind(now, hash, normalizedScope, now)
    .run();
  const directChanges = Number(direct?.meta?.changes ?? direct?.changes ?? 0);
  if (directChanges > 0) return true;

  // Production path: Actions provisions the random challenge in R2 using the
  // already-proven R2 credential. D1 remains the atomic replay ledger.
  if (!env?.MEDIA_BUCKET || typeof env.MEDIA_BUCKET.get !== 'function') return false;
  const key = `bootstrap-challenges/${normalizedScope}/${hash}.json`;
  const challenge = await readBootstrapChallengeObject(env.MEDIA_BUCKET, key);
  if (!challenge) return false;
  if (String(challenge?.token_hash || '') !== hash) return false;
  if (String(challenge?.scope || '') !== normalizedScope) return false;
  if (Number(challenge?.expires_at || 0) < now) return false;

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mel_bootstrap_challenge_consumptions (
    token_hash TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    consumed_at INTEGER NOT NULL
  )`).run();
  const consumed = await env.DB.prepare(`INSERT OR IGNORE INTO mel_bootstrap_challenge_consumptions
    (token_hash,scope,consumed_at) VALUES(?,?,?)`)
    .bind(hash, normalizedScope, now)
    .run();
  const consumedChanges = Number(consumed?.meta?.changes ?? consumed?.changes ?? 0);
  if (consumedChanges < 1) return false;

  if (typeof env.MEDIA_BUCKET.delete === 'function') {
    try { await env.MEDIA_BUCKET.delete(key); } catch {}
  }
  return true;
}

async function internalConnectionCall(connectionHandler, env, provider, action, { method = 'GET', body = null } = {}) {
  const url = new URL('https://mel.internal/api/gen2/connections/' + provider + '/' + action);
  const request = new Request(url.toString(), {
    method,
    headers: body == null ? {} : { 'content-type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  });
  try {
    const response = await connectionHandler(request, env, url);
    if (!response) return { ok: false, status: 404, code: 'CONNECTION_PROOF_ROUTE_MISSING', body: {} };
    const payload = await response.clone().json().catch(() => ({}));
    return { ok: response.ok && payload?.ok !== false, status: response.status, code: payload?.code || payload?.error || null, body: payload && typeof payload === 'object' ? payload : {} };
  } catch (error) {
    return { ok: false, status: Number(error?.status || 500), code: String(error?.code || error?.message || 'CONNECTION_PROOF_FAILED').slice(0, 180), body: {} };
  }
}

async function runConnectionProof(env, connectionHandler = maybeHandleConnectionSettingsApi) {
  const [gmail, pipedream, accounts, vercel, yahoo] = await Promise.all([
    internalConnectionCall(connectionHandler, env, 'google', 'test', { method: 'POST', body: { connector_id: 'gmail' } }),
    internalConnectionCall(connectionHandler, env, 'pipedream', 'test', { method: 'POST', body: {} }),
    internalConnectionCall(connectionHandler, env, 'pipedream', 'accounts'),
    internalConnectionCall(connectionHandler, env, 'vercel', 'test', { method: 'POST', body: {} }),
    internalConnectionCall(connectionHandler, env, 'yahoo-imap', 'test', { method: 'POST', body: {} }),
  ]);
  const connectedApps = new Set(Array.isArray(accounts?.body?.connected_apps) ? accounts.body.connected_apps : []);
  const gmailVerified = gmail.ok && gmail.body?.live_probe === true;
  const outlookVerified = pipedream.ok && accounts.ok && connectedApps.has('microsoft_outlook');
  const oneDriveVerified = pipedream.ok && accounts.ok && connectedApps.has('microsoft_onedrive');
  const sharePointVerified = pipedream.ok && accounts.ok && connectedApps.has('sharepoint');
  const vercelVerified = vercel.ok && vercel.body?.authenticated === true && vercel.body?.target_ready === true && Number(vercel.body?.deployment_count || 0) >= 1;
  const yahooViaPipedream = pipedream.ok && accounts.ok && connectedApps.has('imap');
  const proof = {
    gmail: { verified: gmailVerified, status: gmail.status, code: gmail.code },
    outlook: { verified: outlookVerified, via: 'pipedream' },
    onedrive: { verified: oneDriveVerified, via: 'pipedream' },
    sharepoint: { verified: sharePointVerified, via: 'pipedream' },
    vercel: { verified: vercelVerified, authenticated: vercel.body?.authenticated === true, target_ready: vercel.body?.target_ready === true, has_deployment: Number(vercel.body?.deployment_count || 0) >= 1, status: vercel.status, code: vercel.code },
    yahoo_ymail: { verified: yahoo.ok || yahooViaPipedream, via: yahoo.ok ? 'direct-imap-smtp' : yahooViaPipedream ? 'pipedream-imap' : null, status: yahoo.status, code: yahoo.code },
  };
  const verifiedRoadmapIds = [];
  const pendingRoadmapIds = [];
  if (gmailVerified) verifiedRoadmapIds.push('GEN2-33'); else pendingRoadmapIds.push('GEN2-33');
  if (outlookVerified) verifiedRoadmapIds.push('GEN2-34'); else pendingRoadmapIds.push('GEN2-34');
  if (oneDriveVerified && sharePointVerified) verifiedRoadmapIds.push('GEN2-35'); else pendingRoadmapIds.push('GEN2-35');
  if (vercelVerified) verifiedRoadmapIds.push('GEN2-36'); else pendingRoadmapIds.push('GEN2-36');
  if (proof.yahoo_ymail.verified) verifiedRoadmapIds.push('MEL-CONN-03'); else pendingRoadmapIds.push('MEL-CONN-03');
  return { ok: true, status: 'MEL_CONNECTIONS_PRODUCTION_PROOF_COLLECTED', proof, verified_roadmap_ids: verifiedRoadmapIds, pending_roadmap_ids: pendingRoadmapIds, private_content_returned: false };
}

function preparednessDigest(value) {
  const raw = String(value?.gate_digest || '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(raw) ? raw : null;
}

function safeReadiness(value) {
  return {
    ok: value?.ok === true,
    status: value?.status || 'NO_GO',
    launch_ready: value?.launch_ready === true,
    candidate_branch: value?.candidate_branch || null,
    candidate_sha: value?.candidate_sha || null,
    gate_digest: value?.gate_digest || null,
    gates: value?.gates || {},
    blockers: Array.isArray(value?.blockers) ? value.blockers.slice(0, 20) : [],
    failure_hygiene: {
      ok: value?.failure_hygiene?.ok === true,
      retry_cap: Number(value?.failure_hygiene?.retry_cap || 0),
      historical_failed_count: Number(value?.failure_hygiene?.historical_failed_count || 0),
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
  };
}

export async function maybeHandleReleaseLaunchBootstrap(request, env, {
  prepare = prepareAutonomyLaunch,
  prepareBackup = prepareAutonomyLaunchBackup,
  prepareCodeSync = prepareAutonomyLaunchCodeSync,
  readReadiness = getAutonomyLaunchReadiness,
  setControl = setAutonomyControl,
  proveCapabilityWatch = proveEcosystemTeacherHandoff,
  runAutonomyTick = runAutonomyRuntimeTick,
  connectionHandler = maybeHandleConnectionSettingsApi,
  proveMedia = runMelMedia02LiveProof,
  authorizeOidc = authorizeGitHubActionsOidcRequest,
} = {}) {
  const url = new URL(request.url);
  if (url.pathname !== PATH) return null;
  if (request.method !== 'POST') {
    return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
  }

  const phase = await requestPhase(request);
  if (!phase) {
    return Response.json({ ok: false, code: 'BOOTSTRAP_PHASE_INVALID' }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }

  const expected = String(env?.MEL_LAUNCH_BOOTSTRAP_TOKEN || '');
  const supplied = String(request.headers.get('x-mel-launch-bootstrap') || '');
  const gen2Expected = String(env?.MEL_GEN2_42_BOOTSTRAP_TOKEN || '');
  const gen2Supplied = String(request.headers.get('x-mel-gen2-42-bootstrap') || '');
  const primaryAuthorized = equalToken(expected, supplied);
  const parallelExpected = String(env?.MEL_PARALLEL_PROOF_TOKEN || '');
  const parallelSupplied = String(request.headers.get('x-mel-parallel-proof') || '');
  const parallelAuthorized = equalToken(parallelExpected, parallelSupplied);
  const proofPhase = phase === 'identity' || phase === 'sovereignty-proof';
  const sovAutoCloseOidc = proofPhase
    ? await authorizeOidc(request, env, {
        allowedWorkflows: ['mel-sov-ai-auto-close.yml'],
        allowedWorkflowBranches: ['main'],
        allowedEvents: ['schedule', 'workflow_dispatch', 'push'],
      })
    : { ok: false };
  const sovAutoCloseAuthorized = sovAutoCloseOidc.ok === true;
  const gen2SecretAuthorized = equalToken(gen2Expected, gen2Supplied);
  const gen2ChallengeAuthorized = phase === 'gen2-42-runtime-tick'
    ? await consumeBootstrapChallenge(env, gen2Supplied, 'gen2-42-runtime-tick')
    : false;
  const gen2Oidc = phase === 'gen2-42-runtime-tick'
    ? await authorizeOidc(request, env, {
        allowedWorkflows: ['gen2-42-runtime-tick.yml'],
        allowedEvents: ['schedule', 'workflow_dispatch'],
      })
    : { ok: false };
  const rollbackOidc = phase === 'release-rollback-restore'
    ? await authorizeOidc(request, env, {
        allowedWorkflows: ['deploy-cloudflare-release.yml'],
        allowedWorkflowBranches: [...new Set(['main', exactDeployedBranch(env)].filter(Boolean))],
        allowedEvents: ['push', 'workflow_dispatch'],
      })
    : { ok: false };
  const gen2Authorized = gen2SecretAuthorized || gen2ChallengeAuthorized || gen2Oidc.ok === true;
  const rollbackAuthorized = rollbackOidc.ok === true;
  if (!primaryAuthorized && !gen2Authorized && !parallelAuthorized && !rollbackAuthorized && !sovAutoCloseAuthorized) {
    return Response.json({ ok: false, code: 'BOOTSTRAP_AUTH_REQUIRED' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  if (parallelAuthorized && !primaryAuthorized && !gen2Authorized && !rollbackAuthorized && !sovAutoCloseAuthorized && !proofPhase) {
    return Response.json({ ok: false, code: 'BOOTSTRAP_SCOPE_DENIED' }, { status: 403, headers: { 'cache-control': 'no-store' } });
  }
  if (sovAutoCloseAuthorized && !primaryAuthorized && !gen2Authorized && !rollbackAuthorized && !parallelAuthorized && !proofPhase) {
    return Response.json({ ok: false, code: 'BOOTSTRAP_SCOPE_DENIED' }, { status: 403, headers: { 'cache-control': 'no-store' } });
  }
  if (gen2Authorized && !primaryAuthorized && phase !== 'gen2-42-runtime-tick') {
    return Response.json({ ok: false, code: 'BOOTSTRAP_SCOPE_DENIED' }, { status: 403, headers: { 'cache-control': 'no-store' } });
  }
  if (rollbackAuthorized && !primaryAuthorized && phase !== 'release-rollback-restore') {
    return Response.json({ ok: false, code: 'BOOTSTRAP_SCOPE_DENIED' }, { status: 403, headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'release-rollback-restore') {
    const deployedSha = exactDeployedSha(env);
    const expectedSha = String(url.searchParams.get('expected_sha') || '').trim().toLowerCase();
    const restoreShaRaw = String(url.searchParams.get('restore_sha') || '').trim().toLowerCase();
    const pausedRaw = String(url.searchParams.get('paused') || '').trim().toLowerCase();
    const maxRaw = String(url.searchParams.get('max') || '').trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(expectedSha)
      || (restoreShaRaw && !/^[0-9a-f]{40}$/.test(restoreShaRaw))
      || !['true','false'].includes(pausedRaw)
      || !['true','false'].includes(maxRaw)) {
      return Response.json({ ok: false, code: 'ROLLBACK_RESTORE_INPUT_INVALID', phase }, { status: 400, headers: { 'cache-control': 'no-store' } });
    }
    const restorePaused = pausedRaw === 'true';
    const restoreMax = maxRaw === 'true';
    const restoreSha = restoreShaRaw || expectedSha;
    if (restorePaused && restoreMax) {
      return Response.json({ ok: false, code: 'ROLLBACK_RESTORE_STATE_INVALID', phase }, { status: 400, headers: { 'cache-control': 'no-store' } });
    }
    if (!deployedSha || deployedSha !== expectedSha) {
      return Response.json({
        ok: false,
        code: 'ROLLBACK_RESTORE_SHA_MISMATCH',
        phase,
        deployed_sha: deployedSha || null,
        expected_sha: expectedSha,
      }, { status: 409, headers: { 'cache-control': 'no-store' } });
    }
    if (!env?.DB || typeof env.DB.prepare !== 'function') {
      return Response.json({ ok: false, code: 'D1_NOT_BOUND', phase }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }

    // Rollback restore is a recovery operation, not a launch authorization for
    // the failing candidate. Re-opening candidate readiness here can deadlock
    // recovery on the very gate that caused the release to fail (for example
    // ShardVault launch proof). Authorization is instead bound to the trusted
    // release workflow through OIDC and to the exact candidate SHA currently
    // deployed above. After the Worker rollback, the autonomy runtime still
    // enforces that launch_approved_sha matches the exact deployed stable SHA.
    const launch = restorePaused
      ? { sha: null, at: null, digest: null }
      : { sha: restoreSha, at: new Date().toISOString(), digest: null };

    const control = await setControl(env.DB, {
      paused: restorePaused,
      max_autonomy: restoreMax,
      source: 'release-rollback-restore',
      reason: 'restore-predeploy-autonomy-state',
      launch_approved_sha: launch.sha,
      launch_approved_at: launch.at,
      launch_gate_digest: launch.digest,
    });
    return Response.json({
      ok: true,
      status: 'RELEASE_ROLLBACK_AUTONOMY_RESTORED',
      phase,
      deployed_sha: deployedSha,
      restore_sha: restorePaused ? null : restoreSha,
      paused: control?.paused === true,
      max_autonomy: control?.max_autonomy === true,
      launch_approved_sha: control?.launch_approved_sha || null,
      oidc_authorized: rollbackAuthorized,
    }, { headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'identity') {
    const deployedSha = exactDeployedSha(env);
    const deployedBranch = exactDeployedBranch(env);
    const ok = /^[0-9a-f]{40}$/.test(deployedSha);
    return Response.json({
      ok,
      status: ok ? 'RELEASE_IDENTITY_VERIFIED' : 'DEPLOYED_SHA_INVALID',
      phase,
      deployed_sha: deployedSha || null,
      deployed_branch: deployedBranch || null,
      autonomy_started: false,
      owner_launch_required: true,
    }, { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'connection-proof') {
    const result = await runConnectionProof(env, connectionHandler);
    return Response.json({ ...result, phase, deployed_sha: exactDeployedSha(env) || null, autonomy_started: false, owner_launch_required: true }, { status: 200, headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'media-proof') {
    const deployedSha = exactDeployedSha(env);
    try {
      const result = await proveMedia(env, { sourceSha: deployedSha });
      const ok = result?.ok === true
        && result?.status === 'MEL_MEDIA_02_DONE_VERIFIED_ELIGIBLE'
        && result?.done_verified_eligible === true
        && result?.capability_count === 12
        && result?.all_executions_zero_added_cost === true
        && String(result?.source_sha || '').toLowerCase() === deployedSha;
      return Response.json({
        ...result,
        ok,
        phase,
        deployed_sha: deployedSha || null,
        autonomy_started: false,
        owner_launch_required: true,
        secret_values_exposed: false,
      }, { status: ok ? 200 : 409, headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      return Response.json({
        ok: false,
        status: 'MEL_MEDIA_02_NOT_VERIFIED',
        code: String(error?.code || error?.message || 'MEL_MEDIA_02_PROOF_FAILED').slice(0,180),
        capability: error?.capability || null,
        step: error?.step || null,
        cause_code: error?.cause_code || null,
        cause_message: error?.cause_message || null,
        health: error?.health || null,
        detail: error?.detail || null,
        phase,
        deployed_sha: deployedSha || null,
        autonomy_started: false,
        owner_launch_required: true,
        secret_values_exposed: false,
      }, { status: Number(error?.status) || 503, headers: { 'cache-control': 'no-store' } });
    }
  }

  if (phase === 'sovereignty-proof') {
    if (!env?.DB || typeof env.DB.prepare !== 'function') {
      return Response.json({ ok: false, code: 'D1_NOT_BOUND', phase }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    const now = Date.now();
    const deployedSha = exactDeployedSha(env);
    const refresh = {};
    const runRefresh = async (id, fn) => {
      try {
        const result = await fn(env, { now, force: true });
        refresh[id] = {
          ok: result?.ok !== false,
          skipped: result?.skipped === true,
          status: result?.status || null,
          reason: result?.reason || null,
          processed: Number(result?.processed || 0),
          prevalidated: Number(result?.prevalidated || 0),
          blocked: Number(result?.blocked || 0),
          results: Array.isArray(result?.results)
            ? result.results.slice(0,20).map((row)=>({
                layer: String(row?.layer || '').slice(0,80) || null,
                id: String(row?.id || '').slice(0,160) || null,
                status: String(row?.status || '').slice(0,80) || null,
                validation_status: String(row?.validation_status || '').slice(0,160) || null,
                code: String(row?.code || '').slice(0,180) || null,
                reason: String(row?.reason || '').slice(0,180) || null,
              }))
            : [],
        };
      } catch (error) {
        refresh[id] = {
          ok: false,
          skipped: false,
          status: 'REFRESH_FAILED',
          reason: String(error?.code || error?.message || 'REFRESH_FAILED').slice(0,180),
          processed: 0,
          prevalidated: 0,
          blocked: 0,
        };
      }
    };
    const requestedRefresh = String(url.searchParams.get('refresh') || '').trim().toLowerCase();
    const requestedRefreshStep = String(url.searchParams.get('step') || '').trim().toLowerCase();
    const backupRestoreSteps = new Set(['resolve','prepare','readback','rollback','finalize']);
    const infrastructureRefreshSteps = new Set(['runtime','storage','database','ci_cd','secrets_identity','scheduler','observability','backup_restore']);
    if (requestedRefresh === 'backup_restore' && requestedRefreshStep && !backupRestoreSteps.has(requestedRefreshStep)) {
      return Response.json({
        ok: false,
        code: 'MEL_SOV_01_BACKUP_RESTORE_STEP_INVALID',
        phase,
        allowed_refresh_steps: [...backupRestoreSteps],
        autonomy_started: false,
      }, { status: 400, headers: { 'cache-control': 'no-store' } });
    }
    if (requestedRefresh === 'infrastructure' && requestedRefreshStep && !infrastructureRefreshSteps.has(requestedRefreshStep)) {
      return Response.json({
        ok: false,
        code: 'MEL_SOV_01_INFRASTRUCTURE_STEP_INVALID',
        phase,
        allowed_refresh_steps: [...infrastructureRefreshSteps],
        autonomy_started: false,
      }, { status: 400, headers: { 'cache-control': 'no-store' } });
    }
    const refreshers = {
      ai: runConfiguredAiCandidateValidationRuntime,
      ai_local: (runtimeEnv, options) =>
        runCompanionAiPrevalidationRuntime(runtimeEnv, { ...options, sourceSha: deployedSha }),
      source_control: (runtimeEnv, options) =>
        runCompanionSourceControlPrevalidationRuntime(runtimeEnv, { ...options, sourceSha: deployedSha }),
      infrastructure: (runtimeEnv, options) =>
        runCompanionInfrastructurePrevalidationRuntime(runtimeEnv, {
          ...options,
          sourceSha: deployedSha,
          targetLayer: requestedRefreshStep || null,
        }),
      backup_restore: (runtimeEnv, options) =>
        runGoogleDriveBackupRestorePrevalidationRuntime(runtimeEnv, {
          ...options,
          sourceSha: deployedSha,
          stage: requestedRefreshStep || 'all',
        }),
    };
    if (requestedRefresh) {
      const refresher = refreshers[requestedRefresh];
      if (!refresher) {
        return Response.json({
          ok: false,
          code: 'MEL_SOV_01_REFRESH_TARGET_INVALID',
          phase,
          allowed_refresh_targets: Object.keys(refreshers),
          autonomy_started: false,
        }, { status: 400, headers: { 'cache-control': 'no-store' } });
      }

      // Post-release proofs must not re-run expensive provider prevalidations
      // when a fresh zero-cost proof already exists for this exact deployed SHA.
      // This is deliberately fail-closed: eligibleAlternatives enforces proof
      // freshness/shape and exactShaReusableAlternative binds it to deployedSha.
      const reusableLayer = requestedRefresh === 'source_control'
        ? 'source_control'
        : requestedRefresh === 'infrastructure' && requestedRefreshStep
          ? requestedRefreshStep
          : requestedRefresh === 'backup_restore'
            ? 'backup_restore'
            : requestedRefresh === 'ai'
              ? 'ai'
              : null;
      if (reusableLayer) {
        try {
          const registryStore = new D1AlternativeRegistryStore(env.DB);
          const registry = await registryStore.load();
          const reusable = exactShaReusableAlternative(registry, reusableLayer, deployedSha, { now });
          if (reusable) {
            refresh[requestedRefresh] = {
              ok: true,
              skipped: false,
              status: 'EXACT_SHA_PREVALIDATED_REUSED',
              reason: null,
              processed: 0,
              prevalidated: 1,
              blocked: 0,
              reused_exact_sha_prevalidation: true,
              reused_alternative_id: reusable.id,
              reused_provider: reusable.provider,
              proof_source_sha: reusable.proof?.source_sha || null,
              reusable_layer: reusableLayer,
            };
          }
        } catch {
          // Fall through to the bounded live refresh below.
        }
      }

      if (!refresh[requestedRefresh]) {
        await runRefresh(requestedRefresh, refresher);
      }
      let row = refresh[requestedRefresh];

      // Source-control may already have a fresh, zero-cost prevalidated proof
      // for this exact deployed SHA even when the paired Windows Companion is
      // temporarily offline. Reuse is deliberately limited to source_control.
      const offlineSourceControl = requestedRefresh === 'source_control'
        && row?.skipped === true
        && ['COMPANION_OFFLINE','DEVICE_OFFLINE'].includes(String(row?.reason || ''));
      if (offlineSourceControl) {
        try {
          const registryStore = new D1AlternativeRegistryStore(env.DB);
          const registry = await registryStore.load();
          const reusable = exactShaReusableAlternative(registry, 'source_control', deployedSha, { now });
          if (reusable) {
            row = {
              ...row,
              ok: true,
              skipped: false,
              status: 'EXACT_SHA_PREVALIDATED_REUSED',
              reason: null,
              prevalidated: Math.max(1, Number(row?.prevalidated || 0)),
              blocked: 0,
              reused_exact_sha_prevalidation: true,
              reused_alternative_id: reusable.id,
              reused_provider: reusable.provider,
              proof_source_sha: reusable.proof?.source_sha || null,
            };
            refresh[requestedRefresh] = row;
          }
        } catch {
          // Fail closed below if exact-SHA registry reuse cannot be proven.
        }
      }

      const requiresConcreteLiveProof = requestedRefresh === 'ai'
        || requestedRefresh === 'ai_local'
        || requestedRefresh === 'source_control'
        || requestedRefresh === 'infrastructure'
        || requestedRefresh === 'backup_restore';
      const requiresPrevalidatedResult = requestedRefresh === 'ai'
        || requestedRefresh === 'ai_local'
        || requestedRefresh === 'source_control'
        || requestedRefresh === 'infrastructure'
        || (requestedRefresh === 'backup_restore' && (!requestedRefreshStep || requestedRefreshStep === 'finalize'));
      const verifiedRefresh = row?.ok !== false
        && (!requiresConcreteLiveProof || row?.skipped !== true)
        && (!requiresPrevalidatedResult || Number(row?.prevalidated || 0) > 0);
      const concreteFailureCode = row?.reason
        || row?.results?.find?.(result=>result?.status==='BLOCKED')?.code
        || row?.results?.find?.(result=>result?.status==='BLOCKED')?.validation_status
        || null;
      const verifiedRow = {
        ...row,
        verified: verifiedRefresh,
        verification_reason: verifiedRefresh
          ? null
          : concreteFailureCode || (row?.skipped === true ? 'LIVE_PROOF_SKIPPED' : 'LIVE_PREVALIDATION_REQUIRED'),
      };
      return Response.json({
        ok: verifiedRefresh,
        code: verifiedRefresh ? null : (concreteFailureCode || 'MEL_SOV_01_REFRESH_STEP_FAILED'),
        status: verifiedRefresh ? 'MEL_SOV_01_REFRESH_STEP_VERIFIED' : 'MEL_SOV_01_REFRESH_STEP_FAILED',
        phase,
        refresh_target: requestedRefresh,
        refresh_step: (requestedRefresh === 'backup_restore' || requestedRefresh === 'infrastructure')
          ? (requestedRefreshStep || 'all')
          : null,
        refresh: verifiedRow,
        deployed_sha: deployedSha || null,
        secret_values_exposed: false,
        autonomy_started: false,
        owner_launch_required: true,
      }, { status: verifiedRefresh ? 200 : 409, headers: { 'cache-control': 'no-store' } });
    }

    // The final proof is deliberately lightweight: all expensive live
    // prevalidation refreshes are executed as separate bounded requests above.
    // Coverage still rejects stale/incomplete registry evidence.
    const store = new D1AlternativeRegistryStore(env.DB);
    const registry = await store.load();
    const coverage = sovereigntyCoverageFromRegistry(registry, { now });
    const architecture = liveTechnicalSovereigntyReport(registry, { maxAutonomy: true, now });
    const layers = {};
    for (const [id, row] of Object.entries(coverage.coverage || {})) {
      layers[id] = {
        ready: row?.ready === true,
        prevalidated_count: Number(row?.prevalidated_count || 0),
        alternative_count: Array.isArray(row?.alternatives) ? row.alternatives.length : 0,
      };
    }
    const doneVerifiedEligible = coverage.fully_covered === true
      && architecture.fully_sovereign === true
      && coverage.ai_low_refusal_ready === true
      && Number(architecture.ready_layer_count || 0) === 10
      && Number(architecture.layer_count || 0) === 10;
    return Response.json({
      ok: true,
      status: doneVerifiedEligible ? 'MEL_SOV_01_DONE_VERIFIED_ELIGIBLE' : 'MEL_SOV_01_INCOMPLETE',
      phase,
      deployed_sha: exactDeployedSha(env) || null,
      done_verified_eligible: doneVerifiedEligible,
      fully_covered: coverage.fully_covered === true,
      architecture_fully_sovereign: architecture.fully_sovereign === true,
      ai_low_refusal_ready: coverage.ai_low_refusal_ready === true,
      ready_layer_count: Number(architecture.ready_layer_count || 0),
      layer_count: Number(architecture.layer_count || 0),
      covered_layers: coverage.covered_layers || [],
      uncovered_layers: coverage.uncovered_layers || [],
      blocked_layers: architecture.blocked_layers || [],
      layers,
      registry_count: Array.isArray(registry?.all) ? registry.all.length : 0,
      prevalidation_refresh: refresh,
      secret_values_exposed: false,
      autonomy_started: false,
      owner_launch_required: true,
    }, { status: doneVerifiedEligible ? 200 : 409, headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'gen2-42-runtime-tick') {
    const tick = await runAutonomyTick(env);
    const completions = tick?.completions || tick?.passive_completions || {};
    const completed = Array.isArray(completions?.completed) ? completions.completed : [];
    const rejected = Array.isArray(completions?.rejected) ? completions.rejected : [];
    const bridgePreparation = tick?.bridge_preparation || null;
    const bridgeJob = tick?.job || null;
    const bridgeExecutor = await devBridgeExecutorState(env);
    const bridgeReady = bridgePreparation?.status === 'READY'
      && Boolean(bridgeJob?.id)
      && String(bridgeJob?.status || '').toUpperCase() === 'TEACHER_APPROVED';
    return Response.json({
      ok: tick?.ok !== false,
      status: 'GEN2_42_RUNTIME_TICK_EXECUTED',
      phase,
      tick_status: tick?.status || null,
      advanced: tick?.advanced === true,
      progress: tick?.progress && typeof tick.progress === 'object' ? {
        advanced: tick.progress.advanced === true,
        events: Array.isArray(tick.progress.events) ? tick.progress.events.slice(0, 20) : [],
        work_remaining: tick.progress.work_remaining === true,
        waiting_external: tick.progress.waiting_external === true,
        block_reason: tick.progress.block_reason || null,
        active_jobs: Number.isFinite(Number(tick.progress.active_jobs)) ? Number(tick.progress.active_jobs) : null,
        completed_roadmap_items: Number.isFinite(Number(tick.progress.completed_roadmap_items)) ? Number(tick.progress.completed_roadmap_items) : null,
        next_roadmap_id: tick.progress.next_roadmap_id || null,
        job_id: tick.progress.job_id || null,
        job_status: tick.progress.job_status || null,
      } : null,
      watchdog: tick?.watchdog && typeof tick.watchdog === 'object' ? {
        status: tick.watchdog.status || null,
        tripped: tick.watchdog.tripped === true,
        consecutive_stalls: Number(tick.watchdog.consecutive_stalls || 0),
        stall_limit: Number(tick.watchdog.stall_limit || 0),
        last_block_reason: tick.watchdog.last_block_reason || null,
        counters: tick.watchdog.counters || null,
      } : null,
      paused: tick?.paused === true || tick?.control?.paused === true,
      max_autonomy: tick?.control?.max_autonomy === true,
      bridge_preparation_ready: bridgeReady,
      bridge_job: bridgeReady ? {
        job_id: String(bridgeJob.id).slice(0, 180),
        status: String(bridgeJob.status || '').slice(0, 80),
        roadmap_id: String(bridgeJob.roadmap_id || '').slice(0, 120) || null,
      } : null,
      bridge_executor: bridgeExecutor,
      completed: completed.map((row) => ({
        job_id: String(row?.job_id || '').slice(0, 160),
        candidate_sha: String(row?.candidate_sha || '').slice(0, 40),
        ci_run_id: Number(row?.ci_run_id || 0),
      })),
      rejected: rejected.map((row) => ({
        job_id: String(row?.job_id || '').slice(0, 160),
        request_id: String(row?.request_id || '').slice(0, 160),
        code: String(row?.code || '').slice(0, 180),
      })).slice(0, 20),
      control_unchanged_by_bootstrap: true,
    }, { status: tick?.ok === false ? 409 : 200, headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'gen2-42-owner-max') {
    const prepared = await prepare(env);
    const readiness = safeReadiness(prepared?.readiness);
    const approvedSha = String(prepared?.readiness?.candidate_sha || readiness.candidate_sha || '').trim().toLowerCase();
    if (prepared?.ok !== true || readiness.launch_ready !== true || !/^[0-9a-f]{40}$/.test(approvedSha)) {
      return Response.json({
        ok: false,
        code: 'GEN2_42_OWNER_MAX_LAUNCH_GATE_BLOCKED',
        phase,
        readiness,
      }, { status: 409, headers: { 'cache-control': 'no-store' } });
    }

    const control = await setControl(env?.DB, {
      paused: false,
      max_autonomy: true,
      source: 'owner-authorized-bootstrap',
      reason: 'owner-max-autonomy',
      launch_approved_sha: approvedSha,
      launch_approved_at: prepared?.readiness?.evaluated_at || new Date().toISOString(),
      launch_gate_digest: preparednessDigest(prepared?.readiness) || readiness.gate_digest || null,
    });

    const tick = await runAutonomyTick(env);
    const completions = tick?.completions || tick?.passive_completions || {};
    const completed = Array.isArray(completions?.completed) ? completions.completed : [];
    const rejected = Array.isArray(completions?.rejected) ? completions.rejected : [];
    const bridgePreparation = tick?.bridge_preparation || null;
    const bridgeJob = tick?.job || null;
    const bridgeExecutor = await devBridgeExecutorState(env);
    const bridgeReady = bridgePreparation?.status === 'READY'
      && Boolean(bridgeJob?.id)
      && String(bridgeJob?.status || '').toUpperCase() === 'TEACHER_APPROVED';
    return Response.json({
      ok: tick?.ok !== false,
      status: 'GEN2_42_OWNER_MAX_EXECUTED',
      phase,
      candidate_sha: approvedSha,
      paused: control?.paused === true,
      max_autonomy: control?.max_autonomy === true,
      launch_approved_sha: control?.launch_approved_sha || null,
      tick_status: tick?.status || null,
      advanced: tick?.advanced === true,
      progress: tick?.progress && typeof tick.progress === 'object' ? {
        advanced: tick.progress.advanced === true,
        events: Array.isArray(tick.progress.events) ? tick.progress.events.slice(0, 20) : [],
        work_remaining: tick.progress.work_remaining === true,
        waiting_external: tick.progress.waiting_external === true,
        block_reason: tick.progress.block_reason || null,
        active_jobs: Number.isFinite(Number(tick.progress.active_jobs)) ? Number(tick.progress.active_jobs) : null,
        completed_roadmap_items: Number.isFinite(Number(tick.progress.completed_roadmap_items)) ? Number(tick.progress.completed_roadmap_items) : null,
        next_roadmap_id: tick.progress.next_roadmap_id || null,
        job_id: tick.progress.job_id || null,
        job_status: tick.progress.job_status || null,
      } : null,
      watchdog: tick?.watchdog && typeof tick.watchdog === 'object' ? {
        status: tick.watchdog.status || null,
        tripped: tick.watchdog.tripped === true,
        consecutive_stalls: Number(tick.watchdog.consecutive_stalls || 0),
        stall_limit: Number(tick.watchdog.stall_limit || 0),
        last_block_reason: tick.watchdog.last_block_reason || null,
        counters: tick.watchdog.counters || null,
      } : null,
      bridge_preparation_ready: bridgeReady,
      bridge_job: bridgeReady ? {
        job_id: String(bridgeJob.id).slice(0, 180),
        status: String(bridgeJob.status || '').slice(0, 80),
        roadmap_id: String(bridgeJob.roadmap_id || '').slice(0, 120) || null,
      } : null,
      bridge_executor: bridgeExecutor,
      completed: completed.map((row) => ({
        job_id: String(row?.job_id || '').slice(0, 160),
        candidate_sha: String(row?.candidate_sha || '').slice(0, 40),
        ci_run_id: Number(row?.ci_run_id || 0),
      })),
      rejected: rejected.map((row) => ({
        job_id: String(row?.job_id || '').slice(0, 160),
        request_id: String(row?.request_id || '').slice(0, 160),
        code: String(row?.code || '').slice(0, 180),
      })).slice(0, 20),
      owner_authorized_bootstrap: true,
    }, { status: tick?.ok === false ? 409 : 200, headers: { 'cache-control': 'no-store' } });
  }

  // A deployment may inherit RUNNING/MAX control state from the previous SHA.
  // Force the new release into PAUSED before any preparation. Only the normal
  // owner-authenticated Resume/MAX endpoint may approve and start this SHA.
  const releaseControl = await setControl(env?.DB, {
    paused: true,
    max_autonomy: false,
    source: 'release-launch-bootstrap',
    reason: 'NEW_RELEASE_AWAITING_OWNER_LAUNCH',
    launch_approved_sha: null,
    launch_approved_at: null,
    launch_gate_digest: null,
  });

  if (phase === 'capability-watch-proof') {
    const proof = await proveCapabilityWatch(env);
    const status = String(proof?.status || '');
    const ready = status === 'GEN2_42_TEACHER_HANDOFF_READY'
      && Number(proof?.active_teacher_handoff_count || 0) >= 1
      && Boolean(proof?.job_id)
      && Boolean(proof?.teacher_request_id);
    const progress = status === 'GEN2_42_TEACHER_HANDOFF_PROGRESS_VERIFIED'
      && proof?.progress_verified === true
      && Number(proof?.blocked_open_handoff_count || 0) === 0
      && Number(proof?.teacher_proven_handoff_count || 0) >= 1;
    const idle = status === 'GEN2_42_TEACHER_HANDOFF_IDLE_VERIFIED'
      && proof?.idle_verified === true
      && Number(proof?.open_handoff_count || 0) === 0;
    const ok = proof?.ok === true && (ready || progress || idle);
    return Response.json({
      ...proof,
      ok,
      status: ok ? status : 'GEN2_42_TEACHER_HANDOFF_NOT_READY',
      autonomy_started: false,
      owner_launch_required: true,
      production_activation_allowed: false,
      auto_approval_allowed: false,
    }, { status: ok ? 200 : 409, headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'skill-registry-proof') {
    if (!env?.DB || typeof env.DB.prepare !== 'function') {
      return Response.json({ ok: false, code: 'D1_NOT_BOUND' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    const registryKey = 'mel-evol-05-production-proof';
    const store = new D1SkillRegistryStore(env.DB, { registryKey });
    const registry = await SkillRegistry.restore(store);
    const skillId = 'skill.mel-evol-05-production-proof';
    const ensure = (version) => {
      try {
        registry.resolve(skillId, version);
        return;
      } catch (error) {
        if (error?.message !== 'SKILL_REGISTRY_VERSION_NOT_FOUND') throw error;
      }
      const deployedSha = String(env?.MEL_DEPLOYED_GIT_SHA || 'unknown');
      registry.register({
        skillId,
        name: 'MEL-EVOL-05 production D1 proof',
        version,
        capabilities: ['skill.registry.persistence'],
        state: 'verified',
        evidence: [{
          id: `production-d1-proof-${version}`,
          status: 'verified',
          kind: 'production-d1-proof',
          value: deployedSha,
        }],
        metadata: { deployed_sha: deployedSha },
      });
    };
    ensure('1.0.0'); ensure('1.1.0');
    registry.activate(skillId, '1.0.0');
    registry.activate(skillId, '1.1.0');
    await registry.persist();

    const restarted = await SkillRegistry.restore(new D1SkillRegistryStore(env.DB, { registryKey }));
    const restoredBeforeRollback = restarted.resolve(skillId)?.version || null;
    restarted.rollback(skillId);
    await restarted.persist();

    const restartedAgain = await SkillRegistry.restore(new D1SkillRegistryStore(env.DB, { registryKey }));
    const restoredAfterRollback = restartedAgain.resolve(skillId)?.version || null;
    const ok = restoredBeforeRollback === '1.1.0' && restoredAfterRollback === '1.0.0';
    return Response.json({
      ok,
      status: ok ? 'MEL_EVOL_05_PRODUCTION_D1_VERIFIED' : 'MEL_EVOL_05_PRODUCTION_D1_FAILED',
      phase, registry_key: registryKey, restored_before_rollback: restoredBeforeRollback,
      restored_after_rollback: restoredAfterRollback, autonomy_started: false, owner_launch_required: true,
    }, { status: ok ? 200 : 500, headers: { 'cache-control': 'no-store' } });
  }


  if (phase === 'plugin-sdk-proof') {
    if (!env?.DB || typeof env.DB.prepare !== 'function') {
      return Response.json({ ok: false, code: 'D1_NOT_BOUND' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    const deployedSha = exactDeployedSha(env);
    if (!/^[0-9a-f]{40}$/.test(deployedSha)) {
      return Response.json({ ok: false, code: 'DEPLOYED_SHA_INVALID' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    const pluginId = `release-proof.${deployedSha.slice(0,12)}`;
    const store = new D1PluginVersionStore(env.DB);
    const manager = new PluginVersionManager(store);
    const manifest = version => ({
      id: pluginId,
      name: 'Release proof plugin',
      version,
      description: 'Production D1 lifecycle proof only',
      author: 'MEL release bootstrap',
      capabilities: ['proof.echo'],
      permissions: ['memory.read'],
      secrets_required: [],
      dependencies: [],
      entrypoint: 'plugin/index.js',
      healthcheck: 'plugin/health.js',
      risk: 'LOW',
    });
    const testProof = version => ({
      tests: true,
      version,
      suite: 'release-bootstrap-plugin-sdk-v1',
      run_id: `release-${deployedSha.slice(0,12)}-${version}`,
    });
    const releaseProof = (version, seed) => ({
      tests: true,
      sandbox: true,
      security: true,
      activation: true,
      version,
      artifact_digest: 'sha256:' + seed.repeat(64),
      source_sha: deployedSha,
      approval_id: `release-bootstrap-${deployedSha.slice(0,12)}-${version}`,
    });

    const existing = await manager.list(pluginId);
    if (!existing.length) {
      for (const [version, seed] of [['1.0.0','a'],['1.1.0','b']]) {
        await manager.installCandidate({
          manifest: manifest(version),
          artifactRef: `r2://release-proof/plugins/${pluginId}/${version}.zip`,
          metadata: { proof: 'GEN2-15', deployed_sha: deployedSha },
        });
        await manager.markTested(pluginId, version, testProof(version));
        await manager.activate(pluginId, version, releaseProof(version, seed));
      }
      await manager.rollback(pluginId, '1.0.0', { approval_id: `release-bootstrap-rollback-${deployedSha.slice(0,12)}` });
    }

    const restartedStore = new D1PluginVersionStore(env.DB);
    const restartedManager = new PluginVersionManager(restartedStore);
    const active = await restartedManager.get(pluginId);
    const versions = await restartedManager.list(pluginId);
    const history = await restartedStore.activationHistory(pluginId);
    const v1 = versions.find(row => row.version === '1.0.0');
    const v2 = versions.find(row => row.version === '1.1.0');
    const ok = active?.version === '1.0.0'
      && active?.status === 'ACTIVE'
      && v1?.evidence?.release?.source_sha === deployedSha
      && v2?.status === 'ROLLED_BACK'
      && history.filter(row => row.action === 'ACTIVATE').length >= 3;
    return Response.json({
      ok,
      status: ok ? 'GEN2_15_PRODUCTION_D1_VERIFIED' : 'GEN2_15_PRODUCTION_D1_FAILED',
      phase,
      plugin_id: pluginId,
      active_version: active?.version || null,
      version_count: versions.length,
      activation_history_count: history.length,
      replay_safe: existing.length > 0,
      autonomy_started: false,
      owner_launch_required: true,
    }, { status: ok ? 200 : 500, headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'evolution-ledger-proof') {
    if (!env?.DB || typeof env.DB.prepare !== 'function') {
      return Response.json({ ok: false, code: 'D1_NOT_BOUND' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    const deployedSha = exactDeployedSha(env);
    if (!/^[0-9a-f]{40}$/.test(deployedSha)) {
      return Response.json({ ok: false, code: 'DEPLOYED_SHA_INVALID' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    const ledger = new D1EvolutionLedger(env.DB);
    const prefix = `release-proof-${deployedSha.slice(0,12)}`;
    await ledger.append({
      event_id: `${prefix}-created`,
      evolution_id: prefix,
      stage: 'JOB_CREATED',
      status: 'QUEUED',
      actor: 'release-bootstrap',
      source_sha: deployedSha,
      branch: exactDeployedBranch(env),
      evidence: { roadmap_id: 'MEL-EVOL-04', proof: 'production-runtime' },
      occurred_at: Date.now(),
    });
    await ledger.append({
      event_id: `${prefix}-verified`,
      evolution_id: prefix,
      stage: 'PRODUCTION_VERIFIED',
      status: 'DONE_VERIFIED',
      actor: 'release-bootstrap',
      source_sha: deployedSha,
      branch: exactDeployedBranch(env),
      evidence: { roadmap_id: 'MEL-EVOL-04', exact_sha: true },
      occurred_at: Date.now() + 1,
    });
    const verification = await ledger.verify();
    const proofRows = await ledger.list({ evolution_id: prefix, limit: 10 });
    const ok = verification?.ok === true
      && proofRows.length === 2
      && proofRows.every(row => row.source_sha === deployedSha)
      && proofRows[1]?.previous_hash === proofRows[0]?.entry_hash;
    return Response.json({
      ok,
      status: ok ? 'MEL_EVOL_04_PRODUCTION_LEDGER_VERIFIED' : 'MEL_EVOL_04_PRODUCTION_LEDGER_FAILED',
      phase,
      proof_event_count: proofRows.length,
      total_ledger_count: Number(verification?.count || 0),
      total_verified_count: Number(verification?.verified || 0),
      verification_code: verification?.code || null,
      verification_failure_count: Array.isArray(verification?.failures) ? verification.failures.length : 0,
      head_hash: verification?.head_hash || null,
      replay_safe: proofRows.length === 2,
      autonomy_started: false,
      owner_launch_required: true,
    }, { status: ok ? 200 : 500, headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'agent-automation-proof') {
    if (!env?.DB || typeof env.DB.prepare !== 'function') {
      return Response.json({ ok: false, code: 'D1_NOT_BOUND' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    const deployedSha = exactDeployedSha(env);
    if (!/^[0-9a-f]{40}$/.test(deployedSha)) {
      return Response.json({ ok: false, code: 'DEPLOYED_SHA_INVALID' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    const owner = 'release-bootstrap';
    const suffix = deployedSha.slice(0,12);
    const agentId = `release-proof-${suffix}`;
    const runId = `release-proof-run-${suffix}`;
    const registry = createAgentRegistry(createD1AgentRegistryAdapter(env.DB));
    let agent;
    try {
      agent = await registry.get({ agent_id: agentId }, { owner });
    } catch (error) {
      if (error?.code !== 'AGENT_NOT_FOUND') throw error;
      agent = await registry.register({
        agent_id: agentId,
        name: 'Release Proof Agent',
        role: 'Bounded production persistence proof only.',
        capabilities: ['memory.read'],
        permission_ceiling: PERMISSION_TIERS.READ,
        enabled: true,
        metadata: { roadmap_id: 'GEN2-39', deployed_sha: deployedSha },
      }, { owner });
    }

    const policy = createAgentAutomationPolicy(createD1AgentAutomationPolicyAdapter(env.DB));
    let run;
    try {
      run = await policy.getRun({ run_id: runId });
    } catch (error) {
      if (error?.code !== 'AUTOMATION_RUN_NOT_FOUND') throw error;
      const authorized = await policy.authorizeRun({
        run_id: runId,
        idempotency_key: `release-proof-idem-${suffix}`,
        owner,
        granted_capabilities: ['memory.read'],
        granted_tier: PERMISSION_TIERS.READ,
        requested_at: Date.now(),
        approved: false,
        policy: {
          automation_id: `release-proof-auto-${suffix}`,
          agent_id: agentId,
          required_capabilities: ['memory.read'],
          permission_tier: PERMISSION_TIERS.READ,
          enabled: true,
          metadata: { roadmap_id: 'GEN2-39' },
        },
      });
      const replay = await policy.authorizeRun({
        run_id: runId,
        idempotency_key: `release-proof-idem-${suffix}`,
        owner,
        granted_capabilities: ['memory.read'],
        granted_tier: PERMISSION_TIERS.READ,
        requested_at: authorized.claim.requested_at,
        approved: false,
        policy: {
          automation_id: `release-proof-auto-${suffix}`,
          agent_id: agentId,
          required_capabilities: ['memory.read'],
          permission_tier: PERMISSION_TIERS.READ,
          enabled: true,
          metadata: { roadmap_id: 'GEN2-39' },
        },
      });
      if (replay?.deduplicated !== true) throw new Error('AUTOMATION_REPLAY_NOT_DEDUPLICATED');
      run = await policy.completeRun({
        run_id: runId,
        completed_at: Date.now() + 1,
        result: { ok: true, deployed_sha: deployedSha },
      });
    }

    const restartedRegistry = createAgentRegistry(createD1AgentRegistryAdapter(env.DB));
    const restartedPolicy = createAgentAutomationPolicy(createD1AgentAutomationPolicyAdapter(env.DB));
    const restoredAgent = await restartedRegistry.get({ agent_id: agentId }, { owner });
    const restoredRun = await restartedPolicy.getRun({ run_id: runId });
    const ok = restoredAgent?.agent_id === agentId
      && restoredAgent?.metadata?.deployed_sha === deployedSha
      && restoredRun?.status === 'COMPLETED'
      && restoredRun?.result?.deployed_sha === deployedSha;
    return Response.json({
      ok,
      status: ok ? 'GEN2_39_PRODUCTION_D1_VERIFIED' : 'GEN2_39_PRODUCTION_D1_FAILED',
      phase,
      agent_id: agentId,
      run_id: runId,
      run_status: restoredRun?.status || null,
      persisted_across_adapter_recreation: ok,
      autonomy_started: false,
      owner_launch_required: true,
    }, { status: ok ? 200 : 500, headers: { 'cache-control': 'no-store' } });
  }



  if (phase === 'long-context-proof') {
    if (!env?.DB || typeof env.DB.prepare !== 'function') {
      return Response.json({ ok: false, code: 'D1_NOT_BOUND' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    const deployedSha = exactDeployedSha(env);
    if (!/^[0-9a-f]{40}$/.test(deployedSha)) {
      return Response.json({ ok: false, code: 'DEPLOYED_SHA_INVALID' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }

    const candidatesResult = await env.DB.prepare(`
      SELECT conversation_id,
             COUNT(*) AS message_count,
             SUM(LENGTH(COALESCE(content,''))) AS total_chars
      FROM archive_messages
      WHERE role IN ('user','assistant')
        AND LENGTH(TRIM(COALESCE(content,''))) > 0
      GROUP BY conversation_id
      HAVING COUNT(*) >= 12 AND SUM(LENGTH(COALESCE(content,''))) > 65000
      ORDER BY total_chars DESC
      LIMIT 20
    `).all();
    const candidates = candidatesResult?.results || [];

    let selected = null;
    for (const candidate of candidates) {
      const rowsResult = await env.DB.prepare(`
        SELECT role,content,timestamp,id
        FROM archive_messages
        WHERE conversation_id=? AND role IN ('user','assistant')
        ORDER BY timestamp ASC,id ASC
        LIMIT 1000
      `).bind(candidate.conversation_id).all();
      const recent = (rowsResult?.results || []).map(row => ({
        role: row.role,
        content: String(row.content || ''),
      }));
      const bounded = boundRecentMessages(recent);
      if (bounded.omitted < 1) continue;
      const capsule = compileHistoricalDecisionCapsule(bounded.decision_source_messages);
      if (!capsule.anchors.length) continue;

      const current = 'continue la validation du contexte long';
      const context = buildContext({
        system: 'MEL production long-context proof',
        recent,
        current,
      });
      const systemText = String(context?.[0]?.content || '');
      const currentMessage = context?.at?.(-1);
      const anchorPreserved = capsule.anchors.some(anchor =>
        anchor?.content && systemText.includes(anchor.content)
      );
      const currentPreserved = currentMessage?.role === 'user' && currentMessage?.content === current;
      if (!anchorPreserved || !currentPreserved) continue;

      const digest = async value => {
        const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
        return [...new Uint8Array(raw)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      };

      selected = {
        source_key_sha256: await digest(candidate.conversation_id),
        message_count: recent.length,
        total_chars: recent.reduce((sum,row)=>sum+row.content.length,0),
        active_message_count: bounded.messages.length,
        omitted_message_count: bounded.omitted,
        decision_anchor_count: capsule.anchors.length,
        decision_capsule_chars: capsule.chars,
        anchor_preserved: true,
        current_turn_preserved_exactly: true,
      };
      break;
    }

    const ok = Boolean(selected)
      && selected.total_chars > 65000
      && selected.omitted_message_count > 0
      && selected.decision_anchor_count > 0
      && selected.anchor_preserved === true
      && selected.current_turn_preserved_exactly === true;

    return Response.json({
      ok,
      status: ok ? 'MEL_CONTEXT_02_REAL_LONG_CONVERSATION_VERIFIED' : 'MEL_CONTEXT_02_REAL_LONG_CONVERSATION_NOT_FOUND',
      phase,
      deployed_sha: deployedSha,
      proof: selected,
      candidate_long_conversations: candidates.length,
      private_content_returned: false,
      autonomy_started: false,
      owner_launch_required: true,
    }, { status: ok ? 200 : 409, headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'provider-escape-proof') {
    if (!env?.DB || typeof env.DB.prepare !== 'function') {
      return Response.json({ ok: false, code: 'D1_NOT_BOUND' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    if (!env?.MEDIA_BUCKET || typeof env.MEDIA_BUCKET.get !== 'function') {
      return Response.json({ ok: false, code: 'R2_NOT_BOUND' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    if (!env?.AI || typeof env.AI.run !== 'function') {
      return Response.json({ ok: false, code: 'AI_BINDING_NOT_BOUND' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    const deployedSha = exactDeployedSha(env);
    const deployedBranch = exactDeployedBranch(env);
    if (!/^[0-9a-f]{40}$/.test(deployedSha)) {
      return Response.json({ ok: false, code: 'DEPLOYED_SHA_INVALID' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }

    const restoreReadiness = await evaluateRestoreReadiness(env);
    const releaseBound = restoreReadiness?.status === 'RELEASE_BOUND_SYSTEM_BACKUP_RESTORE_PROOF_VERIFIED';
    const releaseBinding = restoreReadiness?.release_binding || null;
    const restoreVerified = restoreReadiness?.ok === true
      && restoreReadiness?.sha_matches === true
      && String(restoreReadiness?.backup_deployed_sha || '').toLowerCase() === deployedSha
      && Boolean(restoreReadiness?.snapshot_id)
      && /^[0-9a-f]{64}$/i.test(String(restoreReadiness?.integritySha256 || ''))
      && restoreReadiness?.restore?.ok === true;
    const releaseBindingVerified = !releaseBound || (
      releaseBinding?.ok === true
      && String(releaseBinding?.deployed_sha || '').toLowerCase() === deployedSha
      && /^[0-9a-f]{64}$/i.test(String(releaseBinding?.binding_sha256 || ''))
    );
    if (!restoreVerified || !releaseBindingVerified) {
      return Response.json({
        ok: false,
        code: 'PRODUCTION_BACKUP_PERSISTED_VERIFICATION_REQUIRED',
        restore_status: restoreReadiness?.status || null,
      }, { status: 409, headers: { 'cache-control': 'no-store' } });
    }

    const snapshot = await env.DB.prepare(
      "SELECT id,object_key,metadata_json,created_at FROM backup_objects WHERE id=? LIMIT 1"
    ).bind(String(restoreReadiness.snapshot_id)).first();
    if (!snapshot?.id || !snapshot?.object_key) {
      return Response.json({ ok: false, code: 'PRODUCTION_BACKUP_REQUIRED' }, { status: 409, headers: { 'cache-control': 'no-store' } });
    }
    let backupMetadata = {};
    try { backupMetadata = JSON.parse(snapshot.metadata_json || '{}'); } catch {}

    const snapshotIntegrity = String(backupMetadata.integritySha256 || '').toLowerCase();
    const restoreIntegrity = String(backupMetadata.restoreIntegritySha256 || '').toLowerCase();
    const backupVerified = backupMetadata.verified === true
      && backupMetadata.restoreVerified === true
      && /^[0-9a-f]{64}$/.test(snapshotIntegrity)
      && restoreIntegrity === snapshotIntegrity
      && snapshotIntegrity === String(restoreReadiness.integritySha256 || '').toLowerCase();
    if (!backupVerified) {
      return Response.json({
        ok: false,
        code: 'PRODUCTION_BACKUP_PERSISTED_VERIFICATION_REQUIRED',
        restore_status: restoreReadiness?.status || null,
      }, { status: 409, headers: { 'cache-control': 'no-store' } });
    }

    const digest = async (value) => {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      const raw = await crypto.subtle.digest('SHA-256', bytes);
      return 'sha256:' + [...new Uint8Array(raw)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    };

    const manifest = createProviderNeutralManifest({
      generated_at: new Date().toISOString(),
      source: { branch: deployedBranch, commit: deployedSha },
      contracts: [
        { id: 'model.inference', version: '1', required: true, description: 'Production model inference contract' },
        { id: 'memory.storage', version: '1', required: true, description: 'Production memory and backup storage contract' },
        { id: 'runtime.http', version: '1', required: true, description: 'Production HTTP runtime contract' },
      ],
      artifacts: [
        {
          id: 'production-model-binding',
          contract_id: 'model.inference',
          format: 'application/json',
          ref: 'runtime://workers-ai-binding',
          checksum: await digest({ binding: 'AI', deployed_sha: deployedSha }),
        },
        {
          id: 'production-system-backup',
          contract_id: 'memory.storage',
          format: 'application/json',
          ref: String(snapshot.object_key),
          checksum: String(backupMetadata.integritySha256 || await digest({ backup_id: snapshot.id, object_key: latest.object_key })),
        },
        {
          id: 'production-runtime-release',
          contract_id: 'runtime.http',
          format: 'git-commit',
          ref: `github://adrienlopezcarreras-pixel/meliturgos-cloudflare@${deployedSha}`,
          checksum: await digest({ deployed_sha: deployedSha, branch: deployedBranch }),
        },
      ],
      adapters: [
        { id: 'ai.workers-current', contract_id: 'model.inference', provider: 'cloudflare-workers-ai', optional: true },
        { id: 'ai.ninjachat-alt', contract_id: 'model.inference', provider: 'ninjachat', optional: true },
        { id: 'storage.d1-r2-current', contract_id: 'memory.storage', provider: 'cloudflare-d1-r2', optional: true },
        { id: 'storage.cold-object-alt', contract_id: 'memory.storage', provider: 'provider-neutral-object-store', optional: true },
        { id: 'runtime.worker-current', contract_id: 'runtime.http', provider: 'cloudflare-workers', optional: true },
        { id: 'runtime.alternate-restore-alt', contract_id: 'runtime.http', provider: 'provider-neutral-alternate-runtime', optional: true },
      ],
      metadata: {
        roadmap_id: 'MEL-RES-03',
        backup_id: String(snapshot.id),
        backup_verified: backupVerified,
        backup_integrity_sha256: String(backupMetadata.integritySha256 || ''),
        backup_encrypted: backupMetadata.encrypted === true,
        release_bound: releaseBound,
        release_binding_sha256: releaseBound ? String(releaseBinding?.binding_sha256 || '') : null,
        snapshot_deployed_sha: String(restoreReadiness?.snapshot_deployed_sha || '') || null,
        production_manifest: true,
      },
    });

    const capsule = createProviderEscapeCapsule({
      manifest,
      generated_at: new Date().toISOString(),
      source: { branch: deployedBranch, commit: deployedSha },
      layers: {
        ai: { contract_ids: ['model.inference'], current_adapter_ids: ['ai.workers-current'] },
        storage: { contract_ids: ['memory.storage'], current_adapter_ids: ['storage.d1-r2-current'] },
        runtime: { contract_ids: ['runtime.http'], current_adapter_ids: ['runtime.worker-current'] },
      },
    });
    const validation = validateProviderEscapeCapsule(capsule);
    const summary = providerEscapeSummary(capsule);
    const ok = validation.ok === true
      && summary.ready_to_escape === true
      && summary.ready_layers.length === 3
      && summary.alternative_adapter_count >= 3
      && capsule?.policy?.automatic_activation === false
      && capsule?.policy?.owner_approval_required === true;

    return Response.json({
      ok,
      status: ok ? 'MEL_RES_03_PRODUCTION_MANIFEST_VERIFIED' : 'MEL_RES_03_PRODUCTION_MANIFEST_FAILED',
      phase,
      deployed_sha: deployedSha,
      deployed_branch: deployedBranch,
      backup_id: String(snapshot.id),
      backup_verified: backupVerified,
      backup_integrity_sha256: String(backupMetadata.integritySha256 || ''),
      backup_encrypted: backupMetadata.encrypted === true,
      release_bound: releaseBound,
      release_binding_sha256: releaseBound ? String(releaseBinding?.binding_sha256 || '') : null,
      snapshot_deployed_sha: String(restoreReadiness?.snapshot_deployed_sha || '') || null,
      manifest_schema: manifest.schema,
      capsule_schema: capsule.schema,
      ready_to_escape: summary.ready_to_escape,
      ready_layers: summary.ready_layers,
      alternative_adapter_count: summary.alternative_adapter_count,
      validation_issue_count: validation.issues.length,
      execution_started: false,
      activation_allowed: false,
      owner_launch_required: true,
    }, { status: ok ? 200 : 500, headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'pause') {
    const paused = releaseControl?.paused === true;
    const maxDisabled = releaseControl?.max_autonomy === false;
    return Response.json({
      ok: paused && maxDisabled,
      status: paused && maxDisabled ? 'RELEASE_PAUSED' : 'RELEASE_PAUSE_FAILED',
      phase,
      paused,
      max_autonomy: releaseControl?.max_autonomy === true,
      control_status: releaseControl?.status || null,
      autonomy_started: false,
      owner_launch_required: true,
    }, { status: paused && maxDisabled ? 200 : 409, headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'backup') {
    let existing = null;
    try {
      existing = safeReadiness(await readReadiness(env));
    } catch {
      existing = null;
    }
    const deployedSha = exactDeployedSha(env);
    const restore = existing?.restore || null;
    const reusable = Boolean(deployedSha)
      && existing?.launch_ready === true
      && String(existing?.candidate_sha || '').toLowerCase() === deployedSha
      && restore?.ok === true
      && restore?.sha_matches === true
      && String(restore?.deployed_sha || '').toLowerCase() === deployedSha
      && String(restore?.backup_deployed_sha || '').toLowerCase() === deployedSha
      && Boolean(restore?.snapshot_id);

    if (reusable) {
      const backup = {
        ok: true,
        status: 'REUSED_VERIFIED_SHA_BOUND_BACKUP',
        id: restore.snapshot_id,
        deployed_sha: deployedSha,
        sha_matches: true,
      };
      return Response.json({
        ok: true,
        status: backup.status,
        phase,
        backup,
        autonomy_started: false,
        owner_launch_required: true,
      }, { status: 200, headers: { 'cache-control': 'no-store' } });
    }

    const backup = await prepareBackup(env);
    return Response.json({
      ok: backup?.ok === true,
      status: backup?.status || (backup?.ok === true ? 'BACKUP_PREPARED' : 'LAUNCH_BACKUP_PREP_FAILED'),
      phase,
      backup,
      autonomy_started: false,
      owner_launch_required: true,
    }, {
      status: backup?.ok === true ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    });
  }

  if (phase === 'code-sync') {
    const sync = await prepareCodeSync(env);
    return Response.json({
      ok: sync?.ok === true,
      complete: sync?.complete === true,
      status: sync?.status || (sync?.ok === true ? 'CODE_SYNC_PROGRESS' : 'LAUNCH_EXTERNAL_CODE_SYNC_FAILED'),
      phase,
      code_sync: sync?.code_sync || null,
      autonomy_started: false,
      owner_launch_required: true,
    }, {
      status: sync?.ok === true ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    });
  }

  if (phase === 'readiness') {
    let readiness = safeReadiness(await readReadiness(env));
    let backupRepair = null;
    const repairableBackupBindingMismatch = readiness.launch_ready !== true
      && Array.isArray(readiness.blockers)
      && readiness.blockers.includes('SYSTEM_BACKUP_DEPLOYED_SHA_MISMATCH');

    if (repairableBackupBindingMismatch) {
      try {
        const repaired = await prepareBackup(env);
        backupRepair = {
          attempted: true,
          ok: repaired?.ok === true,
          status: repaired?.status || null,
          id: repaired?.id || null,
          deployed_sha: repaired?.deployedSha || repaired?.deployed_sha || null,
        };
        if (repaired?.ok === true) {
          readiness = safeReadiness(await readReadiness(env));
        }
      } catch (error) {
        backupRepair = {
          attempted: true,
          ok: false,
          status: 'BACKUP_BINDING_REPAIR_FAILED',
          code: String(error?.code || error?.message || error).slice(0,180),
        };
      }
    }

    const publicCache = env?.DB && typeof env.DB.prepare === 'function'
      ? await writeAutonomyLaunchReadinessPublicCache(env, readiness)
      : { ok: false, status: 'PUBLIC_LAUNCH_READINESS_CACHE_DB_UNAVAILABLE' };
    if (readiness.launch_ready === true
      && env?.DB && typeof env.DB.prepare === 'function'
      && publicCache?.ok !== true) {
      return Response.json({
        ok: false,
        status: 'PUBLIC_LAUNCH_READINESS_CACHE_WRITE_FAILED',
        phase,
        readiness,
        backup_repair: backupRepair,
        public_cache: {
          ok: false,
          status: publicCache?.status || 'PUBLIC_LAUNCH_READINESS_CACHE_WRITE_FAILED',
          code: publicCache?.code || null,
        },
        autonomy_started: false,
        owner_launch_required: true,
      }, {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      });
    }

    return Response.json({
      ok: readiness.launch_ready === true,
      status: readiness.launch_ready ? 'LAUNCH_EVIDENCE_READY' : 'LAUNCH_EVIDENCE_INCOMPLETE',
      phase,
      readiness,
      backup_repair: backupRepair,
      public_cache: {
        ok: publicCache?.ok === true,
        status: publicCache?.status || null,
        candidate_sha: publicCache?.candidate_sha || null,
      },
      autonomy_started: false,
      owner_launch_required: true,
    }, {
      status: readiness.launch_ready === true ? 200 : 409,
      headers: { 'cache-control': 'no-store' },
    });
  }

  const prepared = await prepare(env);
  const readiness = safeReadiness(prepared?.readiness);
  return Response.json({
    ok: prepared?.ok === true && readiness.launch_ready === true,
    status: prepared?.status || (readiness.launch_ready ? 'LAUNCH_EVIDENCE_READY' : 'LAUNCH_EVIDENCE_INCOMPLETE'),
    phase,
    readiness,
    backup: prepared?.backup || null,
    code_sync: prepared?.code_sync ? {
      ok: prepared.code_sync.ok === true,
      complete: prepared.code_sync.complete === true,
      status: prepared.code_sync.status || null,
      target_count: Number(prepared.code_sync.target_count || 7),
      endpoints: Array.isArray(prepared.code_sync.endpoints) ? prepared.code_sync.endpoints.slice(0, 14) : [],
      successful_endpoints: Array.isArray(prepared.code_sync.successful_endpoints) ? prepared.code_sync.successful_endpoints.slice(0, 14) : [],
      attempted_endpoints: Array.isArray(prepared.code_sync.attempted_endpoints) ? prepared.code_sync.attempted_endpoints.slice(0, 28) : [],
      failures: Array.isArray(prepared.code_sync.failures) ? prepared.code_sync.failures.slice(0, 24) : [],
      verified_roundtrip: prepared.code_sync.verified_roundtrip === true,
      critical_status: prepared.code_sync.critical_status || null,
    } : null,
    autonomy_started: false,
    owner_launch_required: true,
  }, {
    status: prepared?.ok === true && readiness.launch_ready === true ? 200 : 409,
    headers: { 'cache-control': 'no-store' },
  });
}

export const __launchBootstrapTest = Object.freeze({
  runConnectionProof, equalToken, safeReadiness, requestPhase, exactShaReusableAlternative });
