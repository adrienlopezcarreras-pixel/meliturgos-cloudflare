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
  if (!Array.isArray(receipt.additional_required_proofs)
      || !receipt.additional_required_proofs.includes('GMAIL_CALENDAR_DRIVE_TYPED_AUTH')
      || !receipt.additional_required_proofs.includes('NO_RAW_TOOL_CALL_JSON')
      || receipt.additional_required_proofs.length > 0) {
    return { ok:false, code:'MISSION_TEST_ADDITIONAL_PROOFS_REQUIRED' };
  }
  return { ok:true, code:null };
}

// Retrieve the artifact from GitHub Actions, checking the independently
// supplied run metadata and exact artifact identity before trusting its bytes.
// Caller-provided receipt JSON alone is never an authorization.
export async function fetchFounderMissionTestEvidence({ repository, candidateSha, runId, token, fetchImpl = fetch } = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repository || '')))
    return { ok: false, code: 'MISSION_TEST_REPOSITORY_INVALID' };
  const root = 'https://api.github.com/repos/' + repository;
  const headers = { accept: 'application/vnd.github+json', 'user-agent':'mel-founder-evidence',
    ...(token ? { authorization:'Bearer ' + token } : {}) };
  const read = async url => {
    const response = await fetchImpl(url, { headers, redirect:'manual', signal:AbortSignal.timeout(20000) });
    if (!response.ok || response.status >= 300 && response.status < 400) throw new Error('GITHUB_ARTIFACT_FETCH_FAILED');
    return response.json();
  };
  try {
    const run = await read(root + '/actions/runs/' + Number(runId));
    const preliminary = validateFounderMissionTestEvidence({
      schema:'MEL_FOUNDER_MISSION_TEST_EVIDENCE_V1', source:'full-candidate-ci/full-suite',
      candidate_sha:candidateSha, github_run_id:Number(runId), github_run_attempt:1,
      log_sha256:'a'.repeat(64), exit_code:0, mandatory_tests_verified:true,
      tests:REQUIRED.map(name => ({name,passed:true})), additional_required_proofs:['pending'],
    },run,{candidateSha,runId});
    if (preliminary.code === 'MISSION_TEST_RUN_MISMATCH' || preliminary.code === 'MISSION_TEST_PROVENANCE_INVALID')
      return preliminary;
    const listing = await read(root + '/actions/runs/' + Number(runId) + '/artifacts?per_page=100');
    const matches = (listing?.artifacts || []).filter(a => a?.name === 'founder-mission-test-evidence' && !a.expired);
    if (matches.length !== 1) return { ok:false, code:'MISSION_TEST_ARTIFACT_MISSING_OR_AMBIGUOUS' };
    // GitHub artifact downloads are ZIP archives requiring validated extraction.
    // Do not return untrusted redirects or interpret a ZIP as a JSON receipt.
    return { ok:false, code:'MISSION_TEST_ARTIFACT_ZIP_READER_REQUIRED', artifact_id:matches[0].id };
  } catch { return { ok:false, code:'MISSION_TEST_GITHUB_LOOKUP_FAILED' }; }
}
