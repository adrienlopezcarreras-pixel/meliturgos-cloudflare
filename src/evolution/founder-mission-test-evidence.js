import { decodeFounderEvidenceZip } from './founder-evidence-zip.js';
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
  if (run?.name !== 'full-candidate-ci' || run?.head_branch !== 'candidate/mel-clean-autonomy' || String(run?.head_sha || '').toLowerCase() !== sha
      || Number(run?.id) !== id || run?.status !== 'completed' || run?.conclusion !== 'success') {
    return { ok:false, code:'MISSION_TEST_RUN_MISMATCH' };
  }
  if (receipt?.schema !== 'MEL_FOUNDER_MISSION_TEST_EVIDENCE_V1'
      || receipt?.source !== 'full-candidate-ci/full-suite'
      || receipt?.candidate_sha !== sha || receipt?.github_run_id !== id
      || !Number.isSafeInteger(receipt?.github_run_attempt) || receipt.github_run_attempt < 1
      || (Number.isSafeInteger(Number(run?.run_attempt)) && Number(run.run_attempt) > 0 && receipt.github_run_attempt !== Number(run.run_attempt))
      || !/^[a-f0-9]{64}$/.test(String(receipt?.log_sha256 || ''))
      || receipt?.exit_code !== 0 || receipt?.mandatory_tests_verified !== true) {
    return { ok:false, code:'MISSION_TEST_RECEIPT_INVALID' };
  }
  const tests = receipt.tests;
  if (!Array.isArray(tests) || REQUIRED.some(name => !tests.some(t => t?.name === name && t?.passed === true))) {
    return { ok:false, code:'MISSION_TEST_REQUIRED_CASES_MISSING' };
  }
  const extraTests = [
    'Gmail missing authorization does not inherit the last Google Tasks token error',
    'missing Calendar grant reports a typed auth diagnostic without network calls',
    'missing Drive grant reports a typed auth diagnostic without network calls',
    'a completed connected tool response renders human text instead of raw tool-call JSON',
  ];
  if (extraTests.some(name => !tests.some(t => t?.name === name && t?.passed === true)))
    return { ok:false, code:'MISSION_TEST_ADDITIONAL_PROOFS_REQUIRED' };
  // More mission checks (typed auth and no raw JSON) remain obligatory;
  // their absence must not be interpreted as success.
  if (!Array.isArray(receipt.additional_required_proofs)
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
  let lookupStage = 'RUN_METADATA';
  try {
    const normalizedSha = String(candidateSha || '').toLowerCase();
    if (!SHA.test(normalizedSha) || !Number.isSafeInteger(Number(runId)) || Number(runId) <= 0)
      return { ok:false, code:'MISSION_TEST_PROVENANCE_INVALID' };
    const run = await read(root + '/actions/runs/' + Number(runId));
    if (run?.name !== 'full-candidate-ci' || run?.head_branch !== 'candidate/mel-clean-autonomy' || run?.status !== 'completed'
        || run?.conclusion !== 'success' || String(run?.head_sha || '').toLowerCase() !== normalizedSha
        || Number(run.id) !== Number(runId))
      return { ok:false, code:'MISSION_TEST_RUN_MISMATCH' };
    lookupStage = 'ARTIFACT_LIST';
    const listing = await read(root + '/actions/runs/' + Number(runId) + '/artifacts?per_page=100');
    if (!Array.isArray(listing?.artifacts) || Number(listing?.total_count) > 100)
      return { ok:false, code:'MISSION_TEST_ARTIFACT_LIST_INCOMPLETE' };
    const matches = (listing?.artifacts || []).filter(a => a?.name === 'founder-mission-test-evidence' && !a.expired && Number(a?.workflow_run?.id) === Number(runId) && a?.workflow_run?.head_sha === normalizedSha);
    if (matches.length !== 1) return { ok:false, code:'MISSION_TEST_ARTIFACT_MISSING_OR_AMBIGUOUS' };
    // GitHub returns a short-lived signed archive redirect; only fetch an HTTPS
    // GitHub Actions storage host, never arbitrary untrusted artifact URLs.
    lookupStage = 'ARCHIVE_REDIRECT';
    const archive = await fetchImpl(root + '/actions/artifacts/' + matches[0].id + '/zip', {
      headers, redirect:'manual', signal:AbortSignal.timeout(20000),
    });
    if (archive.status !== 302) return { ok:false, code:'MISSION_TEST_ARCHIVE_REDIRECT_INVALID' };
    const location = new URL(archive.headers.get('location') || '');
    const host = location.hostname.toLowerCase();
    // Signed archive URL must not contain embedded credentials, nonstandard ports,
    // or a hostname that merely ends with a trusted suffix after a lookalike label.
    if (location.username || location.password || location.port)
      return { ok:false, code:'MISSION_TEST_ARCHIVE_HOST_INVALID' };
    if (location.protocol !== 'https:' || !(
      host === 'objects.githubusercontent.com' || host.endsWith('.actions.githubusercontent.com')
      || /^productionresultssa[0-9]+\.blob\.core\.windows\.net$/.test(host)
    )) return { ok:false, code:'MISSION_TEST_ARCHIVE_HOST_INVALID' };
    lookupStage = 'ARCHIVE_DOWNLOAD';
    const download = await fetchImpl(location.toString(), { redirect:'manual', signal:AbortSignal.timeout(20000) });
    // Cloudflare Workers does not support redirect:'error'; manual mode also
    // prevents signed storage URLs from silently redirecting to another host.
    if (!download.ok || download.status >= 300 && download.status < 400
        || Number(download.headers.get('content-length') || 0) > 256 * 1024)
      return { ok:false, code:'MISSION_TEST_ARCHIVE_DOWNLOAD_FAILED' };
    const bytes = await download.arrayBuffer();
    if (bytes.byteLength > 256 * 1024) return { ok:false, code:'MISSION_TEST_ARCHIVE_TOO_LARGE' };
    lookupStage = 'ARCHIVE_PARSE';
    const receipt = decodeFounderEvidenceZip(bytes);
    const verdict = validateFounderMissionTestEvidence(receipt,run,{candidateSha,runId});
    if (!verdict.ok) return verdict;
    lookupStage = 'DIGEST';
    const digestBytes = await crypto.subtle.digest('SHA-256', bytes);
    const digest = Array.from(new Uint8Array(digestBytes), b => b.toString(16).padStart(2,'0')).join('');
    return { ok:true, candidate_sha: normalizedSha, run_id:Number(runId),
      mandatory_tests_verified:true, digest, tests:receipt.tests };
  } catch { return { ok:false, code:'MISSION_TEST_GITHUB_LOOKUP_FAILED', lookup_stage:lookupStage }; }
}
