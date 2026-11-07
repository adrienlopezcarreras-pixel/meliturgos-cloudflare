import { roadmapContractRevision } from '../roadmap/roadmap-code-contracts.js';
import { objectiveVerificationProfile } from './objective-verification-profiles.js';
import { getAutonomyControl } from './autonomy-control.js';
import { MAX_AUTONOMOUS_REPAIR_ATTEMPTS } from './autonomy-repair-policy.js';

// A format correction is not permission to reroll unchanged rejected evidence.
// Only the authorized held mission with a genuinely new deployed revision may
// receive one fresh planning cycle. All CI, Teacher and Council gates rerun.
export async function recoverVerificationEvidence({ env, repository, job, control, deployedSha,
  readControl = () => getAutonomyControl(env?.DB) } = {}) {
  const profile = objectiveVerificationProfile(job?.goal), result = job?.result_json || {};
  const veto = result.council_review, previous = result.verify_existing;
  const history = Array.isArray(result.verification_evidence_repairs) ? result.verification_evidence_repairs : [];
  const legacyRead = Array.isArray(previous?.live_checks) && previous.live_checks.some(row => row.capability === profile?.capability
    && row.ok === true && row.functional_evidence?.revision !== profile?.revision);
  const attempts = Math.max(Number(result.repair_cycle?.attempts || 0), Number(result.runtime_retry?.attempts || 0));
  if (!profile || job?.requested_by !== 'mel-autonomy' || job.status !== 'FAILED'
    || job.optional_context?.roadmap_id !== profile.id
    || job.optional_context?.roadmap_contract_revision !== roadmapContractRevision(profile.id)
    || veto?.decision !== 'REJECTED' || veto.mode !== 'VERIFY_EXISTING'
    || result.implementation_proposal?.status !== 'VERIFY_EXISTING'
    || result.implementation_proposal.candidate_sha !== veto.head || previous?.candidate_sha !== veto.head
    || result.teacher_bridge?.status !== 'ANSWERED'
    || result.teacher_bridge?.review?.verdict !== 'APPROVE_PLAN'
    || result.teacher_bridge?.review?.development_allowed !== true
    || previous?.evidence_revision === profile.revision
    || !/^[a-f0-9]{40}$/.test(String(deployedSha || ''))
    || !/^[a-f0-9]{40}$/.test(String(veto.head || '')) || veto.head === deployedSha
    || !legacyRead
    || history.some(row => row.revision === profile.revision)
    || !Number.isSafeInteger(attempts) || attempts >= MAX_AUTONOMOUS_REPAIR_ATTEMPTS
    || history.length >= MAX_AUTONOMOUS_REPAIR_ATTEMPTS) return null;
  const allowed = value => value?.max_autonomy === true && value.paused === false && !value.repair_invalid
    && value.repair?.job_id === job.id && value.owner_control_version === control?.owner_control_version;
  if (!allowed(control)) return null;
  const current = await readControl();
  if (!allowed(current) || current.updated_at !== control.updated_at) return null;
  const at = new Date().toISOString();
  const next = { ...result,
    verification_evidence_repairs: [...history, { revision: profile.revision, at, deployed_sha: deployedSha,
      previous_head: veto.head, previous_error: job.error,
      council_review: veto, verify_existing: previous, teacher_bridge: result.teacher_bridge,
      implementation_proposal: result.implementation_proposal, plan_json: job.plan_json }],
    repair_cycle: { ...(result.repair_cycle || {}), status: 'REQUESTED', attempts: attempts + 1,
      source: 'VERIFICATION_EVIDENCE_REVISION', requested_at: at },
    implementation_planning_diagnostic: { status: 'NOT_READY', code: 'VERIFICATION_EVIDENCE_REVISION' },
    teacher_bridge: null,
  };
  for (const key of ['implementation_proposal','bridge_package','bridge_preparation','dev_bridge','council_review','verify_existing']) delete next[key];
  const updated = await repository.update(job.id, { status: 'QUEUED', error: null, result_json: next,
    plan_json: { ...(job.plan_json || {}), preflight: null,
      revision: { reason: 'VERIFICATION_EVIDENCE_REVISION', requested_at: at, candidate_sha: deployedSha } },
  }, { expected: job });
  return updated?.status === 'QUEUED' ? updated : null;
}
