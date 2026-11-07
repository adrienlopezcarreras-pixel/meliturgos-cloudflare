import { OBJECTIVE_VERIFICATION_PROFILES, objectiveVerificationProfile } from './objective-verification-profiles.js';
import { ROADMAP_CODE_CONTRACTS, roadmapContractRevision } from '../roadmap/roadmap-code-contracts.js';
import { fetchFounderMissionTestEvidence } from './founder-mission-test-evidence.js';

// Only actual runner blocks count. A similarly named case in another file,
// a model's plan, or a file path appearing in ordinary prose is not evidence.
export function collectRoadmapTestEvidence(log, { candidateSha, runId, attempt, exitCode } = {}) {
  const required = new Map();
  for (const contract of Object.values(ROADMAP_CODE_CONTRACTS))
    for (const path of contract.test_paths) if (!required.has(path)) required.set(path, new Set());
  for (const profile of Object.values(OBJECTIVE_VERIFICATION_PROFILES))
    for (const [path, names] of Object.entries(profile.required_tests))
      required.set(path, new Set([...(required.get(path) || []), ...names]));
  const found = new Map();
  let previous = 0;
  for (const match of String(log).matchAll(/^(✓|✗) (tests\/[^\r\n]+\.test\.mjs)(?: \(rc=\d+\))?\s*$/gm)) {
    const chunk = String(log).slice(previous, match.index);
    previous = match.index + match[0].length;
    if (!required.has(match[2])) continue;
    const passed = new Set([...chunk.matchAll(/^\s*ok\s+\d+\s+-\s+(.+)$/gm)].map(row => row[1].trim()));
    const failed = new Set([...chunk.matchAll(/^\s*not ok\s+\d+\s+-\s+(.+)$/gm)].map(row => row[1].trim()));
    found.set(match[2], { path: match[2], passed: exitCode === 0 && match[1] === '✓',
      cases: [...required.get(match[2])].map(name => ({ name, passed: match[1] === '✓' && passed.has(name) && !failed.has(name) })) });
  }
  return { schema: 'mel.roadmap-test-evidence/v1', candidate_sha: candidateSha,
    github_run_id: runId, github_run_attempt: attempt,
    full_suite_passed: exitCode === 0 && /^\d+ passed, 0 failed\s*$/m.test(log), files: [...found.values()] };
}

export function validateObjectiveTestEvidence(proof, job, candidateSha, runId) {
  const profile = objectiveVerificationProfile(job?.goal);
  if (!profile || job?.optional_context?.roadmap_id !== profile.id
    || job.optional_context.roadmap_contract_revision !== roadmapContractRevision(profile.id)) return false;
  const evidence = proof?.roadmap_test_evidence;
  if (proof?.ok !== true || proof.mandatory_tests_verified !== true || proof.candidate_sha !== candidateSha || Number(proof.run_id) !== Number(runId)
    || !/^[a-f0-9]{64}$/.test(String(proof.digest || ''))
    || evidence?.schema !== 'mel.roadmap-test-evidence/v1' || evidence.candidate_sha !== candidateSha
    || Number(evidence.github_run_id) !== Number(runId) || evidence.full_suite_passed !== true
    || !Number.isSafeInteger(evidence.github_run_attempt) || evidence.github_run_attempt < 1
    || !Array.isArray(evidence.files)) return false;
  const paths = new Set([...ROADMAP_CODE_CONTRACTS[profile.id].test_paths, ...Object.keys(profile.required_tests)]);
  return [...paths].every(path => {
    const matching = evidence.files.filter(file => file?.path === path);
    return matching.length === 1 && matching[0].passed === true
      && (profile.required_tests[path] || []).every(name =>
        matching[0].cases?.some(row => row?.name === name && row.passed === true));
  });
}

export async function fetchObjectiveMissionTestEvidence({ job, ...options } = {}) {
  // Reuse the existing independent GitHub run/artifact checks, bounded ZIP
  // decoder and digest. The full-suite artifact retains all Founder safeguards.
  const proof = await fetchFounderMissionTestEvidence(options);
  if (proof.ok !== true) return proof;
  if (!validateObjectiveTestEvidence(proof, job, options.candidateSha, options.runId))
    return { ok: false, code: proof.code || 'MISSION_TEST_OBJECTIVE_CASES_MISSING' };
  const profile = objectiveVerificationProfile(job.goal);
  const wanted = new Set([...ROADMAP_CODE_CONTRACTS[profile.id].test_paths, ...Object.keys(profile.required_tests)]);
  return { ...proof, roadmap_id: profile.id, evidence_revision: profile.revision,
    roadmap_test_evidence: { ...proof.roadmap_test_evidence, files: proof.roadmap_test_evidence.files.filter(file => wanted.has(file.path)) },
    test_files: proof.roadmap_test_evidence.files.filter(file => wanted.has(file.path)) };
}
