import {
  getAutonomyLaunchReadiness,
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

function resolveDeployedSha(env = {}) {
  const direct = String(env?.MEL_DEPLOYED_GIT_SHA || '').trim();
  if (/^[a-f0-9]{40}$/i.test(direct)) return direct.toLowerCase();
  try {
    const built = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined'
      ? String(MEL_DEPLOYED_GIT_SHA || '').trim()
      : '';
    return /^[a-f0-9]{40}$/i.test(built) ? built.toLowerCase() : '';
  } catch {
    return '';
  }
}

function resolveDeployedBranch(env = {}) {
  const direct = resolveDeployedBranch(env).trim();
  if (direct) return direct;
  try {
    const built = typeof MEL_DEPLOYED_GIT_BRANCH !== 'undefined'
      ? String(MEL_DEPLOYED_GIT_BRANCH || '').trim()
      : '';
    return built;
  } catch {
    return '';
  }
}

const PATH = '/api/internal/release-launch-bootstrap';
const PHASES = new Set(['all', 'pause', 'backup', 'code-sync', 'readiness', 'skill-registry-proof', 'plugin-sdk-proof', 'evolution-ledger-proof', 'agent-automation-proof']);

function exactDeployedSha(env = {}) {
  const direct = resolveDeployedSha(env);
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

function exactDeployedBranch(env = {}) {
  const direct = resolveDeployedBranch(env).trim();
  if (direct) return direct;
  try {
    return typeof MEL_DEPLOYED_GIT_BRANCH !== 'undefined'
      ? String(MEL_DEPLOYED_GIT_BRANCH || '').trim()
      : '';
  } catch {
    return '';
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
    },
  };
}

export async function maybeHandleReleaseLaunchBootstrap(request, env, {
  prepare = prepareAutonomyLaunch,
  prepareBackup = prepareAutonomyLaunchBackup,
  prepareCodeSync = prepareAutonomyLaunchCodeSync,
  readReadiness = getAutonomyLaunchReadiness,
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

  const phase = await requestPhase(request);
  if (!phase) {
    return Response.json({ ok: false, code: 'BOOTSTRAP_PHASE_INVALID' }, { status: 400, headers: { 'cache-control': 'no-store' } });
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
      const deployedSha = resolveDeployedSha(env) || 'unknown';
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
      total_verified_count: Number(verification?.verified || 0),
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

  if (phase === 'pause') {
    return Response.json({
      ok: true,
      status: 'RELEASE_PAUSED',
      phase,
      autonomy_started: false,
      owner_launch_required: true,
    }, { status: 200, headers: { 'cache-control': 'no-store' } });
  }

  if (phase === 'backup') {
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
    const readiness = safeReadiness(await readReadiness(env));
    return Response.json({
      ok: readiness.launch_ready === true,
      status: readiness.launch_ready ? 'LAUNCH_EVIDENCE_READY' : 'LAUNCH_EVIDENCE_INCOMPLETE',
      phase,
      readiness,
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

export const __launchBootstrapTest = Object.freeze({ equalToken, safeReadiness, requestPhase, resolveDeployedSha, resolveDeployedBranch });
