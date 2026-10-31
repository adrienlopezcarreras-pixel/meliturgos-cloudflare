import { isAcceptedRoadmapCodeJob } from '../roadmap/roadmap-code-acceptance.js';
import { roadmapContractRevision } from '../roadmap/roadmap-code-contracts.js';
import { unmetRoadmapPrerequisites } from '../roadmap/roadmap-dependencies.js';

export function roadmapCodeMissionContext(item) {
  if (!item?.id || item.contract_revision !== roadmapContractRevision(item.id)) return {};
  return { roadmap_contract_revision: item.contract_revision, code_paths: [...item.code_paths],
    test_paths: [...item.test_paths], acceptance: [...item.acceptance], max_attempts: 3 };
}

export function roadmapCodeMissionGoal(item) {
  return `[${item.id}] ${item.title}${item.next ? ` — ${item.next}` : ''}`
    + ` | MODE_TECHNIQUE ${item.mode || 'IMPLEMENT'} | PREUVE_REQUISE ${item.required_proof || 'DIFF_TESTS_EXACT_SHA_CI'}`
    + (item.verify_existing === false ? ' | VERIFY_EXISTING_INTERDIT' : '');
}

// A changed technical contract invalidates the old plan, never its archived
// evidence. Do not interrupt an executing Bridge, live review or committed CI.
export async function refreshRoadmapCodeMissions(repository, jobs, roadmap) {
  const refreshed = [];
  const verifiedCodeIds = jobs.filter(isAcceptedRoadmapCodeJob).map(job => job.optional_context.roadmap_id);
  const safe = new Set(['QUEUED','TEACHER_APPROVED','COUNCIL_COMPLETE','REPAIR_REQUIRED','WAITING_TEACHER','WAITING_DEPENDENCY']);
  for (const job of jobs) {
    const item = roadmap.find(row => row.id === job.optional_context?.roadmap_id);
    if (job.requested_by !== 'mel-autonomy' || !item || item.contract_revision !== roadmapContractRevision(item.id)
        || ['DONE_VERIFIED','VERIFIED','ACCEPTED'].includes(item.status)
        || !safe.has(job.status) || job.optional_context?.roadmap_contract_revision === item.contract_revision
        || ['RUNNING','IN_PROGRESS','CLAIMED','READY_FOR_REVIEW'].includes(job.result_json?.dev_bridge?.status)) continue;
    const result = { ...(job.result_json || {}) };
    result.superseded_code_contract = { goal: job.goal, revision: job.optional_context?.roadmap_contract_revision || null,
      plan: job.plan_json, files: job.files_json, tests: job.tests_json, patch: job.patch_json,
      teacher_bridge: result.teacher_bridge || null, implementation: result.implementation_proposal || null,
      bridge: result.dev_bridge || null, deferral: result.autonomy_deferral || null,
      runtime_retry: result.runtime_retry || null, error: job.error || null,
      last_teacher_review: result.last_teacher_review || null, completion: result.autonomy_completion || null,
      code_acceptance: result.roadmap_code_acceptance || null, at: Date.now() };
    for (const key of ['teacher_bridge','implementation_proposal','bridge_preparation','bridge_package','dev_bridge',
      'autonomy_deferral','council_model_exclusions','runtime_retry','candidate_ci_failure',
      'last_teacher_review','last_teacher_stale','repair_cycle','verify_existing','autonomy_completion','roadmap_code_acceptance']) delete result[key];
    const pending = unmetRoadmapPrerequisites(item, roadmap, verifiedCodeIds);
    if (pending.length || job.status === 'WAITING_DEPENDENCY')
      result.dependency_wait = { previous_status: 'QUEUED', prerequisites: pending, observed_at: new Date().toISOString() };
    const next = await repository.update(job.id, { status: pending.length || job.status === 'WAITING_DEPENDENCY' ? 'WAITING_DEPENDENCY' : 'QUEUED',
      goal: roadmapCodeMissionGoal(item), optional_context: { ...(job.optional_context || {}),
        ...roadmapCodeMissionContext(item), work_mode: item.mode, required_proof: item.required_proof, depends_on: [...item.depends_on] },
      plan_json: null, files_json: [], tests_json: [], patch_json: null, approval_status: 'PENDING', result_json: result, error: null,
    }, { expected: job });
    refreshed.push(next.id);
  }
  return refreshed;
}
