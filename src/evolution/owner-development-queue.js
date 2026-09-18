import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { prepareAutonomyTeacherRequest } from './autonomy-runtime.js';
import { proposeModuleDraft, proposePluginDraft, enterModuleLabForGap } from '../capabilities/module-proposal-capability.js';
import { createModuleLab } from '../modules/module-lab.js';

function boundedGoal(value) {
  const goal = String(value || '').trim();
  if (!goal) throw Object.assign(new Error('DEVELOPMENT_GOAL_REQUIRED'), { code: 'DEVELOPMENT_GOAL_REQUIRED', status: 400 });
  if (goal.length > 4000) throw Object.assign(new Error('DEVELOPMENT_GOAL_TOO_LONG'), { code: 'DEVELOPMENT_GOAL_TOO_LONG', status: 400 });
  return goal;
}

function cleanKey(value, max = 180) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9._:-]+/g, '-').slice(0, max);
}

function snapshotCapabilities(capabilities) {
  if (!Array.isArray(capabilities)) return null;
  return capabilities.slice(0, 200).map((row) => ({
    id: String(row?.id || '').slice(0, 160),
    name: String(row?.name || '').slice(0, 240),
    category: String(row?.category || '').slice(0, 120),
    description: String(row?.description || '').slice(0, 800),
    health: String(row?.health || '').slice(0, 80),
    enabled: row?.enabled !== false,
  })).filter((row) => row.id);
}

const SUPERVISED_REQUESTERS = new Set(['owner-chat', 'mel-autonomy']);
const EXTENSION_KINDS = new Set(['module', 'plugin']);

function proposalForKind(kind, options) {
  return kind === 'plugin' ? proposePluginDraft(options) : proposeModuleDraft(options);
}

function expectedProposalDecision(kind) {
  return kind === 'plugin' ? 'PROPOSE_PLUGIN' : 'PROPOSE_MODULE';
}

function boundedEvidence(value) {
  if (!value || typeof value !== 'object') return null;
  const sources = Array.isArray(value.sources)
    ? value.sources.slice(0, 8).map(source => ({
        title: String(source?.title || '').slice(0, 240),
        url: String(source?.url || '').slice(0, 500),
      }))
    : [];
  return {
    fingerprint: cleanKey(value.fingerprint, 180) || null,
    capability_hint: String(value.capability_hint || '').slice(0, 240) || null,
    citations_count: Math.max(0, Number(value.citations_count) || 0),
    observed_on: Array.isArray(value.observed_on) ? value.observed_on.slice(0, 12).map(item => cleanKey(item, 120)).filter(Boolean) : [],
    sources,
    source_watch_sha: String(value.source_watch_sha || '').slice(0, 80) || null,
  };
}

function safeInspectionPaths(paths) {
  return (Array.isArray(paths) ? paths : [])
    .map(path => String(path || '').trim())
    .filter(path => path && path.length <= 240 && !path.startsWith('/') && !path.split('/').includes('..') && /^[a-zA-Z0-9_./-]+$/.test(path))
    .slice(0, 12);
}

function safeInspectionQueries(queries) {
  return (Array.isArray(queries) ? queries : [])
    .map(query => String(query || '').trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 8);
}

function publicGapDecision(proposal, { requestedBy = 'owner-chat', source = 'owner-chat', priority = 'P0', extensionKind = 'module' } = {}) {
  return {
    ok: true,
    created: false,
    job_id: null,
    status: proposal.decision,
    requested_by: requestedBy,
    source,
    priority,
    teacher: null,
    candidate_only: true,
    zero_added_cost: true,
    gap: {
      classification: proposal.gap?.classification || null,
      confidence: proposal.gap?.confidence ?? null,
      matched_capability: proposal.gap?.best_match?.id || null,
    },
    extension_proposal: {
      kind: extensionKind,
      decision: proposal.decision,
      proposal_only: true,
      activation_allowed: false,
    },
    module_proposal: extensionKind === 'module' ? {
      decision: proposal.decision,
      proposal_only: true,
      activation_allowed: false,
    } : null,
  };
}

async function persistModuleLabNeed(repository, job) {
  if (!job || job.plan_json?.module_lab?.stage === 'need') return job;
  const inventory = job.optional_context?.capability_inventory;
  const proposal = job.optional_context?.module_proposal;
  const council = job.plan_json?.preflight?.council;
  if (!Array.isArray(inventory) || proposal?.decision !== 'PROPOSE_MODULE' || !council) return job;

  const moduleLab = createModuleLab({
    async need(input) {
      return {
        status: 'NEED_READY',
        manifest_id: input.manifest?.id || null,
        gap_classification: input.gap?.classification || null,
        proposal_only: input.proposal_only === true,
        activation_allowed: false,
      };
    },
  });
  const bridge = await enterModuleLabForGap({
    goal: job.goal,
    capabilities: inventory,
    councilReport: council,
    moduleLab,
    context: { owner: 'mel-autonomy', requestId: job.id },
  });
  const plan = job.plan_json && typeof job.plan_json === 'object' ? { ...job.plan_json } : {};
  plan.module_lab = {
    status: bridge.module_lab_need?.status || 'NEED_READY',
    stage: bridge.module_lab_stage,
    manifest_id: bridge.manifest?.id || proposal.manifest?.id || null,
    gap_classification: bridge.gap?.classification || proposal.gap_classification || null,
    council_phase: bridge.council_gate?.phase || null,
    council_responses: bridge.council_gate?.responses || 0,
    code_generation_allowed: false,
    activation_allowed: false,
    teacher_required: true,
  };
  return repository.update(job.id, { plan_json: plan });
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function publicJob(job, { created = false, teacher = null } = {}) {
  return {
    ok: true,
    created,
    job_id: job.id,
    status: job.status,
    requested_by: job.requested_by,
    source: job?.optional_context?.source || null,
    priority: job?.optional_context?.priority || null,
    teacher: teacher ? {
      status: teacher.status || null,
      request_id: teacher.request?.request_id || null,
    } : job?.result_json?.teacher_bridge ? {
      status: job.result_json.teacher_bridge.status || null,
      request_id: job.result_json.teacher_bridge.request?.request_id || job.result_json.teacher_bridge.review?.request_id || null,
    } : null,
    candidate_only: true,
    zero_added_cost: true,
  };
}

/**
 * Turns an explicit owner development request into durable supervised-autonomy
 * work. A bounded capability inventory, when supplied by the live CapabilityBus,
 * is checked first so MEL reuses or diagnoses an existing capability instead of
 * creating duplicate development work. Only a genuine POSSIBLE_GAP is persisted.
 * New work immediately performs the mandatory multi-AI Council + candidate
 * inspection and queues Teacher review. Its gap proposal is then persisted at
 * the non-mutating Module Lab `need` stage. It never generates or deploys
 * production code here.
 */
export async function enqueueSupervisedDevelopmentRequest({
  env,
  goal,
  conversationId = '',
  requestKey = '',
  repository = null,
  fetchImpl = fetch,
  capabilities,
  requestedBy = 'owner-chat',
  source = 'owner-chat',
  priority = 'P0',
  extensionKind = 'module',
  allowBlockedExisting = false,
  targetCapabilityId = '',
  evidence = null,
  roadmapId = '',
  inspectionPaths = [],
  inspectionQueries = [],
} = {}) {
  const objective = boundedGoal(goal);
  const requester = String(requestedBy || '').trim();
  const origin = cleanKey(source, 100) || requester;
  const kind = String(extensionKind || 'module').trim().toLowerCase();
  if (!SUPERVISED_REQUESTERS.has(requester)) {
    throw Object.assign(new Error('SUPERVISED_REQUESTER_INVALID'), { code: 'SUPERVISED_REQUESTER_INVALID', status: 400 });
  }
  if (!EXTENSION_KINDS.has(kind)) {
    throw Object.assign(new Error('EXTENSION_KIND_INVALID'), { code: 'EXTENSION_KIND_INVALID', status: 400 });
  }

  const capabilityInventory = snapshotCapabilities(capabilities);
  const extensionProposal = capabilityInventory
    ? proposalForKind(kind, { goal: objective, capabilities: capabilityInventory })
    : null;
  const expectedDecision = expectedProposalDecision(kind);
  const unblocksExisting = extensionProposal
    && allowBlockedExisting === true
    && extensionProposal.gap?.classification === 'MATCHED_BUT_BLOCKED';

  if (extensionProposal && extensionProposal.decision !== expectedDecision && !unblocksExisting) {
    return publicGapDecision(extensionProposal, {
      requestedBy: requester,
      source: origin,
      priority,
      extensionKind: kind,
    });
  }

  const repo = repository || new D1DevJobRepository(env?.DB);
  if (!repository && !env?.DB) {
    throw Object.assign(new Error('DB_BINDING_MISSING'), { code: 'DB_BINDING_MISSING', status: 503 });
  }

  const ownerCompat = requester === 'owner-chat' && origin === 'owner-chat';
  const idempotencySeed = ownerCompat
    ? `${cleanKey(conversationId, 200)}\n${cleanKey(requestKey, 200)}\n${objective.toLowerCase()}`
    : `${origin}\n${cleanKey(requestKey, 200)}\n${objective.toLowerCase()}`;
  const digest = await sha256(idempotencySeed);
  const idPrefix = ownerCompat ? 'owner-chat' : (cleanKey(origin, 48) || 'mel-autonomy');
  const id = `${idPrefix}-${digest.slice(0, 32)}`;
  const idempotencyContext = {
    source: origin,
    priority: String(priority || 'P1').slice(0, 8),
    conversation_id: cleanKey(conversationId, 200) || null,
    request_key: cleanKey(requestKey, 200) || null,
    candidate_branch_only: true,
    zero_added_cost: true,
    rule: 'AI_COUNCIL_BEFORE_CODE',
    extension_kind: kind,
    roadmap_id: cleanKey(roadmapId, 120) || null,
    target_capability_id: String(targetCapabilityId || '').slice(0, 160) || extensionProposal?.gap?.best_match?.id || null,
    discovery_evidence: boundedEvidence(evidence),
    inspection_paths: safeInspectionPaths(inspectionPaths),
    inspection_queries: safeInspectionQueries(inspectionQueries),
  };

  if (extensionProposal) {
    idempotencyContext.capability_inventory = capabilityInventory;
    idempotencyContext.extension_proposal = {
      kind,
      decision: unblocksExisting ? 'UNBLOCK_EXISTING' : extensionProposal.decision,
      proposal_only: true,
      gap_classification: extensionProposal.gap?.classification || null,
      matched_capability: extensionProposal.gap?.best_match?.id || null,
      manifest: extensionProposal.manifest,
      acceptance_tests: extensionProposal.acceptance_tests || [],
      activation_allowed: false,
    };
    if (kind === 'module' && extensionProposal.decision === 'PROPOSE_MODULE') {
      idempotencyContext.module_proposal = idempotencyContext.extension_proposal;
    }
    if (kind === 'plugin') {
      idempotencyContext.plugin_proposal = idempotencyContext.extension_proposal;
    }
  }
  const input = {
    id,
    requested_by: requester,
    goal: objective,
    optional_context: idempotencyContext,
  };

  const createdResult = typeof repo.createIfAbsent === 'function'
    ? await repo.createIfAbsent(input)
    : { created: true, job: await repo.create(input) };
  let job = createdResult.job;
  let teacher = null;

  if (['QUEUED', 'CLAIMED', 'COUNCIL_COMPLETE'].includes(String(job.status || '').toUpperCase())) {
    teacher = await prepareAutonomyTeacherRequest({ env, repository: repo, job, fetchImpl });
    job = await repo.get(job.id);
  }
  job = await persistModuleLabNeed(repo, job);

  return publicJob(job, { created: createdResult.created, teacher });
}

export async function enqueueOwnerDevelopmentRequest(options = {}) {
  return enqueueSupervisedDevelopmentRequest({
    ...options,
    requestedBy: 'owner-chat',
    source: 'owner-chat',
    priority: 'P0',
    extensionKind: 'module',
  });
}
