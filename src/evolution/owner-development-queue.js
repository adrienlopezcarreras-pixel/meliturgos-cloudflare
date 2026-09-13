import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { prepareAutonomyTeacherRequest } from './autonomy-runtime.js';
import { proposeModuleDraft } from '../capabilities/module-proposal-capability.js';

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

function publicGapDecision(proposal) {
  return {
    ok: true,
    created: false,
    job_id: null,
    status: proposal.decision,
    requested_by: 'owner-chat',
    source: 'owner-chat',
    priority: 'P0',
    teacher: null,
    candidate_only: true,
    zero_added_cost: true,
    gap: {
      classification: proposal.gap?.classification || null,
      confidence: proposal.gap?.confidence ?? null,
      matched_capability: proposal.gap?.best_match?.id || null,
    },
    module_proposal: {
      decision: proposal.decision,
      proposal_only: true,
      activation_allowed: false,
    },
  };
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
 * inspection and queues Teacher review. It never edits or deploys production code.
 */
export async function enqueueOwnerDevelopmentRequest({
  env,
  goal,
  conversationId = '',
  requestKey = '',
  repository = null,
  fetchImpl = fetch,
  capabilities,
} = {}) {
  const objective = boundedGoal(goal);
  const capabilityInventory = snapshotCapabilities(capabilities);
  const moduleProposal = capabilityInventory
    ? proposeModuleDraft({ goal: objective, capabilities: capabilityInventory })
    : null;

  if (moduleProposal && moduleProposal.decision !== 'PROPOSE_MODULE') {
    return publicGapDecision(moduleProposal);
  }

  const repo = repository || new D1DevJobRepository(env?.DB);
  if (!repository && !env?.DB) {
    throw Object.assign(new Error('DB_BINDING_MISSING'), { code: 'DB_BINDING_MISSING', status: 503 });
  }

  const idempotencySeed = `${cleanKey(conversationId, 200)}\n${cleanKey(requestKey, 200)}\n${objective.toLowerCase()}`;
  const digest = await sha256(idempotencySeed);
  const id = `owner-chat-${digest.slice(0, 32)}`;
  const idempotencyContext = {
    source: 'owner-chat',
    priority: 'P0',
    conversation_id: cleanKey(conversationId, 200) || null,
    request_key: cleanKey(requestKey, 200) || null,
    candidate_branch_only: true,
    zero_added_cost: true,
    rule: 'AI_COUNCIL_BEFORE_CODE',
  };
  if (moduleProposal?.decision === 'PROPOSE_MODULE') {
    idempotencyContext.capability_inventory = capabilityInventory;
    idempotencyContext.module_proposal = {
      decision: moduleProposal.decision,
      proposal_only: true,
      gap_classification: moduleProposal.gap?.classification || null,
      manifest: moduleProposal.manifest,
      acceptance_tests: moduleProposal.acceptance_tests,
      activation_allowed: false,
    };
  }
  const input = {
    id,
    requested_by: 'owner-chat',
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

  return publicJob(job, { created: createdResult.created, teacher });
}
