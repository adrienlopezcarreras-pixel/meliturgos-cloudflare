import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { prepareAutonomyTeacherRequest } from './autonomy-runtime.js';
import { canonicalDevelopmentJobId, UNIFIED_DEVELOPMENT_POLICY } from './unified-development-policy.js';

function boundedGoal(value) {
  const goal = String(value || '').trim();
  if (!goal) throw Object.assign(new Error('DEVELOPMENT_GOAL_REQUIRED'), { code: 'DEVELOPMENT_GOAL_REQUIRED', status: 400 });
  if (goal.length > 4000) throw Object.assign(new Error('DEVELOPMENT_GOAL_TOO_LONG'), { code: 'DEVELOPMENT_GOAL_TOO_LONG', status: 400 });
  return goal;
}

function cleanKey(value, max = 180) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9._:-]+/g, '-').slice(0, max);
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
    canonical_objective: job?.optional_context?.canonical_objective || null,
    unified_update: true,
    policy: UNIFIED_DEVELOPMENT_POLICY.mode,
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
 * work. Idempotency is GLOBAL TO THE DEVELOPMENT OBJECTIVE, not to a chat
 * message. Conversation/request ids remain provenance only. Repeating the same
 * objective from another chat therefore reuses the same canonical job instead
 * of creating a permanent duplicate. The function performs the mandatory
 * multi-AI Council + candidate inspection and queues Teacher review when the
 * canonical job is new/ready. It never edits or deploys production code.
 */
export async function enqueueOwnerDevelopmentRequest({
  env,
  goal,
  conversationId = '',
  requestKey = '',
  roadmapId = '',
  repository = null,
  fetchImpl = fetch,
} = {}) {
  const objective = boundedGoal(goal);
  const repo = repository || new D1DevJobRepository(env?.DB);
  if (!repository && !env?.DB) {
    throw Object.assign(new Error('DB_BINDING_MISSING'), { code: 'DB_BINDING_MISSING', status: 503 });
  }

  const repositoryName = String(env?.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  const id = await canonicalDevelopmentJobId(objective, { repository: repositoryName, roadmapId });
  const input = {
    id,
    requested_by: 'owner-chat',
    goal: objective,
    optional_context: {
      source: 'owner-chat',
      priority: 'P0',
      roadmap_id: cleanKey(roadmapId, 120) || null,
      canonical_objective: id,
      conversation_id: cleanKey(conversationId, 200) || null,
      request_key: cleanKey(requestKey, 200) || null,
      candidate_branch_only: true,
      zero_added_cost: true,
      unified_update: true,
      parallel_implementations_allowed: false,
      provider_direct_writes_allowed: false,
      rule: 'AI_COUNCIL_ADVISORY_ONLY_THEN_ONE_CANONICAL_UPDATE',
    },
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
