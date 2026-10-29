// Validate a runner-produced receipt against independently retrieved GitHub
// run metadata. The caller must obtain run and artifact from GitHub, never from
// model text or job-supplied JSON. This is necessary, not sufficient, for DONE.
const SHA = /^[a-f0-9]{40}$/;
const REQUIRED = [
  'a completed connected read replays its archived response without any model, provider or archive duplicate',
  'a partial turn and another conversation cannot be mistaken for a completed read receipt',
  'a completed connected read lookup failure stops before models and providers',
];
export function validateFounderMissionTestEvidence(receipt, run, { candidateSha, runId } = {}) {
  const sha = String(candidateSha || '').toLowerCase();
  const id = Number(runId);
  if (!SHA.test(sha) || !Number.isSafeInteger(id) || id <= 0) return { ok:false, code:'MISSION_TEST_PROVENANCE_INVALID' };
  if (run?.name !== 'full-candidate-ci' || String(run?.head_sha || '').toLowerCase() !== sha
      || Number(run?.id) !== id || run?.status !== 'completed' || run?.conclusion !== 'success') {
    return { ok:false, code:'MISSION_TEST_RUN_MISMATCH' };
  }
  if (receipt?.schema !== 'MEL_FOUNDER_MISSION_TEST_EVIDENCE_V1'
      || receipt?.source !== 'full-candidate-ci/full-suite'
      || receipt?.candidate_sha !== sha || receipt?.github_run_id !== id
      || !Number.isSafeInteger(receipt?.github_run_attempt) || receipt.github_run_attempt < 1
      || !/^[a-f0-9]{64}$/.test(String(receipt?.log_sha256 || ''))
      || receipt?.exit_code !== 0 || receipt?.mandatory_tests_verified !== true) {
    return { ok:false, code:'MISSION_TEST_RECEIPT_INVALID' };
  }
  const tests = receipt.tests;
  if (!Array.isArray(tests) || REQUIRED.some(name => !tests.some(t => t?.name === name && t?.passed === true))) {
    return { ok:false, code:'MISSION_TEST_REQUIRED_CASES_MISSING' };
  }
  // More mission checks (typed auth and no raw JSON) remain obligatory;
  // their absence must not be interpreted as success.
  if (Array.isArray(receipt.additional_required_proofs) && receipt.additional_required_proofs.length) {
    return { ok:false, code:'MISSION_TEST_ADDITIONAL_PROOFS_REQUIRED' };
  }
  return { ok:true, code:null };
}
