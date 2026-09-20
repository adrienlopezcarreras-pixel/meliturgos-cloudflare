import { prepareAutonomyLaunch } from './launch-readiness.js';
import { setAutonomyControl } from './autonomy-control.js';

const PATH = '/api/internal/release-launch-bootstrap';

function equalToken(expected, supplied) {
  const a = new TextEncoder().encode(String(expected || ''));
  const b = new TextEncoder().encode(String(supplied || ''));
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) diff |= (a[i % Math.max(1, a.length)] || 0) ^ (b[i % Math.max(1, b.length)] || 0);
  return a.length >= 32 && a.length === b.length && diff === 0;
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
      recoverable: value?.shardvault?.recoverable === true,
      active_external_count: Number(value?.shardvault?.active_external_count || 0),
      external_code_status: value?.shardvault?.external_code_status || null,
      external_code_endpoints: Number(value?.shardvault?.external_code_endpoints || 0),
      target_count: Number(value?.shardvault?.target_count || 7),
    },
  };
}

export async function maybeHandleReleaseLaunchBootstrap(request, env, {
  prepare = prepareAutonomyLaunch,
  setControl = setAutonomyControl,
} = {}) {
  const url = new URL(request.url);
  if (url.pathname !== PATH) return null;
  if (request.method !== 'POST') {
    return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
  }

  const expected = String(env?.MEL_LAUNCH_BOOTSTRAP_TOKEN || '');
  const supplied = String(request.headers.get('x-mel-launch-bootstrap') || '');
  if (!equalToken(expected, supplied)) {
    return Response.json({ ok: false, code: 'BOOTSTRAP_AUTH_REQUIRED' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }

  // A deployment may inherit RUNNING/MAX control state from the previous SHA.
  // Force the new release into PAUSED before any preparation. Only the normal
  // owner-authenticated Resume/MAX endpoint may approve and start this SHA.
  await setControl(env?.DB, {
    paused: true,
    max_autonomy: false,
    source: 'release-launch-bootstrap',
    reason: 'NEW_RELEASE_AWAITING_OWNER_LAUNCH',
    launch_approved_sha: null,
    launch_approved_at: null,
    launch_gate_digest: null,
  });

  const prepared = await prepare(env);
  const readiness = safeReadiness(prepared?.readiness);
  return Response.json({
    ok: prepared?.ok === true && readiness.launch_ready === true,
    status: prepared?.status || (readiness.launch_ready ? 'LAUNCH_EVIDENCE_READY' : 'LAUNCH_EVIDENCE_INCOMPLETE'),
    readiness,
    code_sync: prepared?.code_sync ? {
      ok: prepared.code_sync.ok === true,
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

export const __launchBootstrapTest = Object.freeze({ equalToken, safeReadiness });
