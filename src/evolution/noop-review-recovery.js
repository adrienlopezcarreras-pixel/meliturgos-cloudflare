import { getAutonomyControl } from './autonomy-control.js';
import { createGitHubCodeReader } from '../capabilities/github-code-capabilities.js';
import { assertRoadmapCodeChanges, codeContractForRoadmapJob } from '../roadmap/roadmap-code-contracts.js';
import { isCouncilRejectedPackage, packageContentFingerprint } from './council-rejected-package.js';
import { objectiveLiveChecks } from './verify-existing-live-checks.js';

// A real patch must keep waiting for its own CI and review. Only a package
// already present at the ORIGINAL approved snapshot can take this route.
export async function recoverNoopReview({ env, repository, job, fetchImpl = fetch,
  readControl = () => getAutonomyControl(env?.DB), readFile = null } = {}) {
  if (job?.requested_by !== 'mel-autonomy' || job.status !== 'READY_FOR_REVIEW'
    || !codeContractForRoadmapJob(job)
    || /^\s*\[([A-Z0-9-]+)\]/i.exec(job.goal || '')?.[1] !== job.optional_context?.roadmap_id
    || !objectiveLiveChecks(job.goal).length || /VERIFY_EXISTING_INTERDIT/.test(job.goal || '')) return null;
  const result = job.result_json || {};
  const teacher = result.teacher_bridge;
  const bridge = result.dev_bridge;
  const base = result.bridge_preparation?.candidate_sha;
  const files = job.files_json;
  if (result.noop_review_recovery || result.council_review || result.candidate_ci_failure
    || teacher?.status !== 'ANSWERED' || teacher?.review?.verdict !== 'APPROVE_PLAN'
    || teacher?.review?.development_allowed !== true
    || bridge?.status !== 'READY_FOR_REVIEW' || bridge?.needs_repair !== false
    || !Array.isArray(bridge.tests) || !bridge.tests.length
    || !bridge.tests.every(row => row?.passed === true && row?.executed === true)
    || !bridge.tests.some(row => row.command === 'test')
    || !/^[a-f0-9]{40}$/.test(String(base || ''))
    || result.implementation_proposal?.candidate_sha !== base
    || !Array.isArray(files) || !files.length || files.length > 8
    || files.some(file => typeof file.content !== 'string' || file.content.length > 200_000)) return null;
  const allowed = control => control?.max_autonomy === true && control?.paused === false
    && !control.repair_invalid && (!control.repair || control.repair.job_id === job.id);
  const control = await readControl();
  if (!allowed(control)) return null;
  try { assertRoadmapCodeChanges(job, files); } catch { return null; }
  if (await isCouncilRejectedPackage(job, files)) return null;
  const reader = readFile ? null : createGitHubCodeReader({
    repository: String(env?.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare'),
    branch: 'candidate/mel-clean-autonomy', pinnedSha: base,
    token: String(env?.MEL_GITHUB_TOKEN || ''), fetchImpl,
  });
  for (const file of files) {
    const original = readFile ? await readFile(file.path, base) : (await reader.read(file.path)).content;
    if (original !== file.content) return null;
  }
  const current = await readControl();
  if (!allowed(current) || current.updated_at !== control.updated_at
    || current.owner_control_version !== control.owner_control_version) return null;
  const at = new Date().toISOString();
  const next = { ...result,
    noop_review_recovery: { schema: 'mel.noop-review-recovery/v1', at,
      original_base_sha: base, content_sha256: await packageContentFingerprint(files),
      previous: { plan_json: job.plan_json, teacher_bridge: teacher, implementation_proposal: result.implementation_proposal,
        bridge_preparation: result.bridge_preparation, dev_bridge: bridge,
        implementation_planning_diagnostic: result.implementation_planning_diagnostic,
        bridge_preparation_diagnostic: result.bridge_preparation_diagnostic } },
    teacher_bridge: null,
    implementation_planning_diagnostic: { status: 'NOT_READY', code: 'NOOP_REQUIRES_FUNCTIONAL_VERIFICATION' },
    bridge_preparation_diagnostic: { status: 'NOT_READY', code: 'NOOP_REQUIRES_FUNCTIONAL_VERIFICATION' },
  };
  for (const key of ['implementation_proposal', 'bridge_preparation', 'bridge_package', 'dev_bridge']) delete next[key];
  const updated = await repository.update(job.id, { status: 'QUEUED', error: null,
    plan_json: { ...(job.plan_json || {}), preflight: null,
      revision: { requested_at: at, reason: 'ALREADY_APPLIED_PACKAGE_REQUIRES_FUNCTIONAL_VERIFICATION' } },
    result_json: next,
  }, { expected: job });
  return updated?.status === 'QUEUED' ? updated : null;
}
