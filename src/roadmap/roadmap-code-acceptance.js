import { ROADMAP_CODE_CONTRACT_REVISION, codeContractForRoadmapJob, assertRoadmapCodeChanges } from './roadmap-code-contracts.js';

// Produced only after the existing correlated Council/Teacher/full-CI gate.
// Static roadmap declarations are not changed by this software receipt.
// verifiedExisting: the Council approved a VERIFY_EXISTING decision on this
// exact SHA. The deliverable already exists, so demanding a new diff made the
// objective impossible to close (30/10: FOUNDER-01 approved three times, never
// completed). The exact-SHA full CI below still applies.
export function createRoadmapCodeAcceptance(job, completion, ci, { verifiedExisting = false } = {}) {
  const contract = codeContractForRoadmapJob(job);
  if (!contract || job.optional_context?.roadmap_contract_revision !== ROADMAP_CODE_CONTRACT_REVISION) return null;
  if (!verifiedExisting) assertRoadmapCodeChanges(job, job.files_json);
  if (ci?.verified !== true || ci.workflow !== 'full-candidate-ci' || ci.conclusion !== 'success'
      || ci.head_sha !== completion.candidate_sha || ci.head_branch !== completion.candidate_branch
      || !/^candidate\//.test(String(ci.head_branch || '')) || Number(ci.run_id) !== Number(completion.ci_run_id))
    throw Object.assign(new Error('ROADMAP_CODE_ACCEPTANCE_CI_REQUIRED'), { code: 'ROADMAP_CODE_ACCEPTANCE_CI_REQUIRED' });
  return { schema: 'mel.roadmap-code-acceptance/v1', status: 'VERIFIED',
    roadmap_id: job.optional_context.roadmap_id, contract_revision: ROADMAP_CODE_CONTRACT_REVISION,
    candidate_sha: ci.head_sha, candidate_branch: ci.head_branch, ci_run_id: ci.run_id,
    code_paths: [...contract.code_paths], test_paths: [...contract.test_paths],
    ...(verifiedExisting ? { verification: 'VERIFY_EXISTING' } : {}),
    external_acceptance_verified: false };
}

export function isAcceptedRoadmapCodeJob(job) {
  const contract = codeContractForRoadmapJob(job);
  const result = job?.result_json, proof = result?.roadmap_code_acceptance, completion = result?.autonomy_completion, ci = completion?.ci;
  if (!contract || job.status !== 'COMPLETED' || job.optional_context?.roadmap_contract_revision !== ROADMAP_CODE_CONTRACT_REVISION
      || proof?.schema !== 'mel.roadmap-code-acceptance/v1' || proof.status !== 'VERIFIED'
      || proof.roadmap_id !== job.optional_context.roadmap_id || proof.contract_revision !== ROADMAP_CODE_CONTRACT_REVISION
      || !/^[a-f0-9]{40}$/.test(String(proof.candidate_sha||'')) || !Number.isSafeInteger(proof.ci_run_id) || proof.ci_run_id <= 0
      || completion?.status !== 'VERIFIED' || completion.candidate_sha !== proof.candidate_sha
      || ci?.verified !== true || ci.workflow !== 'full-candidate-ci' || ci.conclusion !== 'success'
      || ci.head_sha !== proof.candidate_sha || ci.run_id !== proof.ci_run_id
      || !/^candidate\//.test(String(proof.candidate_branch || ''))
      || ci.head_branch !== proof.candidate_branch || completion.candidate_branch !== proof.candidate_branch
      || completion.mel_implementation?.verified !== true || !Number.isInteger(completion.mel_implementation.providers_attempted) || completion.mel_implementation.providers_attempted < 2) return false;
  const verifiedExisting = proof.verification === 'VERIFY_EXISTING'
    && result?.verify_existing?.status === 'VERIFIED' && result.verify_existing.candidate_sha === proof.candidate_sha;
  if (!verifiedExisting) {
    try { assertRoadmapCodeChanges(job, job.files_json); } catch { return false; }
  }
  return JSON.stringify(proof.code_paths) === JSON.stringify(contract.code_paths)
    && JSON.stringify(proof.test_paths) === JSON.stringify(contract.test_paths);
}
