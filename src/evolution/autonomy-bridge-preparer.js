import { assertRoadmapCodeChanges, ROADMAP_CODE_CONTRACTS } from '../roadmap/roadmap-code-contracts.js';
import { createGitHubCodeReader } from '../capabilities/github-code-capabilities.js';
import { assertMentorCodeContract } from '../learning/mentor-code-contract.js';
import { createMentorEngine } from '../learning/mentor-engine.js';

const SHA40 = /^[0-9a-f]{40}$/i;
const MAX_FILES = 8;
// Complete file: Mentor edits are applied on it; only the prompt is excerpted.
const MAX_SOURCE = 200_000;
const ALLOWED_TESTS = new Set(['test', 'test:mel', 'test:integration', 'test:acceptance', 'test:smoke', 'test:mvp', 'test:routes']);

function requireTeacherApproved(job) {
  const bridge = job?.result_json?.teacher_bridge;
  const review = bridge?.review;
  if (String(job?.status || '').toUpperCase() !== 'TEACHER_APPROVED') {
    throw Object.assign(new Error('TEACHER_APPROVAL_REQUIRED'), { code: 'TEACHER_APPROVAL_REQUIRED' });
  }
  if (bridge?.status !== 'ANSWERED' || review?.verdict !== 'APPROVE_PLAN' || review?.development_allowed !== true) {
    throw Object.assign(new Error('TEACHER_APPROVAL_REQUIRED'), { code: 'TEACHER_APPROVAL_REQUIRED' });
  }
  if (!bridge?.request?.request_id || bridge.request.request_id !== review.request_id) {
    throw Object.assign(new Error('TEACHER_APPROVAL_CORRELATION_INVALID'), { code: 'TEACHER_APPROVAL_CORRELATION_INVALID' });
  }
  return bridge;
}

function requireImplementationProposal(job, teacher) {
  const proposal = job?.result_json?.implementation_proposal;
  if (proposal?.status !== 'READY') {
    throw Object.assign(new Error('IMPLEMENTATION_PROPOSAL_REQUIRED'), { code: 'IMPLEMENTATION_PROPOSAL_REQUIRED' });
  }
  if (proposal.teacher_request_id !== teacher.request.request_id) {
    throw Object.assign(new Error('IMPLEMENTATION_PROPOSAL_CORRELATION_INVALID'), { code: 'IMPLEMENTATION_PROPOSAL_CORRELATION_INVALID' });
  }
  if (!String(proposal.candidate_branch || '').startsWith('candidate/') || !SHA40.test(String(proposal.candidate_sha || ''))) {
    throw Object.assign(new Error('IMPLEMENTATION_CANDIDATE_INVALID'), { code: 'IMPLEMENTATION_CANDIDATE_INVALID' });
  }
  return proposal;
}

function codeConfig(env = {}, proposal) {
  const repository = String(env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  const branch = String(proposal?.candidate_branch || env.MEL_TEACHER_BRANCH || 'candidate/mel-clean-autonomy');
  if (!branch.startsWith('candidate/')) throw Object.assign(new Error('BRIDGE_PREPARATION_BRANCH_NOT_CANDIDATE'), { code: 'BRIDGE_PREPARATION_BRANCH_NOT_CANDIDATE' });
  if (env.MEL_TEACHER_BRANCH && String(env.MEL_TEACHER_BRANCH) !== branch) {
    throw Object.assign(new Error('BRIDGE_PREPARATION_BRANCH_MISMATCH'), { code: 'BRIDGE_PREPARATION_BRANCH_MISMATCH' });
  }
  return { repository, branch };
}

export function uniquePaths(proposal) {
  const out = [];
  // The roadmap contract's files come first: the coder may only edit files it
  // was shown. 30/10: FOUNDER-07's planner inspected neighbours but not
  // src/backup/restore-service.js, so every edit of it was refused.
  const contract = ROADMAP_CODE_CONTRACTS[String(proposal?.roadmap_id || '')];
  const contractRows = contract ? [...contract.code_paths, ...contract.test_paths].map(path => ({ path })) : [];
  for (const row of [...contractRows, ...(Array.isArray(proposal?.inspected_files) ? proposal.inspected_files : [])]) {
    const value = String(row?.path || '').trim();
    if (!value || out.includes(value)) continue;
    out.push(value);
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

async function inspectSources(env, proposal, { fetchImpl = fetch } = {}) {
  const { repository, branch } = codeConfig(env, proposal);
  const approvedSha = String(proposal.candidate_sha || '').toLowerCase();
  const reader = createGitHubCodeReader({
    repository,
    branch,
    token: String(env?.MEL_GITHUB_TOKEN || ''),
    pinnedSha: approvedSha,
    fetchImpl,
  });
  // Immutable source inspection is read-only. If GitHub's commit API is
  // rate limited, retain the original strict mutable-head validation.
  async function inspectionHead() {
    if (env?.MEL_IMMUTABLE_PLANNING_ENABLED !== 'true') return reader.head();
    try {
      return await reader.approvedSnapshot();
    } catch (error) {
      if (error?.code !== 'CODE_APPROVED_SNAPSHOT_UNAVAILABLE') throw error;
      return reader.head();
    }
  }
  let headBefore;
  try {
    headBefore = await inspectionHead();
  } catch (error) {
    if (error?.code === 'CODE_HEAD_PIN_MISMATCH') {
      throw Object.assign(new Error('BRIDGE_PREPARATION_CANDIDATE_STALE'), {
        code: 'BRIDGE_PREPARATION_CANDIDATE_STALE',
        expected_sha: approvedSha,
        observed_sha: String(error?.observed_sha || '').toLowerCase() || null,
      });
    }
    throw error;
  }
  if (!SHA40.test(String(headBefore?.sha || '')) || String(headBefore.sha).toLowerCase() !== approvedSha) {
    throw Object.assign(new Error('BRIDGE_PREPARATION_CANDIDATE_STALE'), {
      code: 'BRIDGE_PREPARATION_CANDIDATE_STALE',
      expected_sha: approvedSha,
      observed_sha: SHA40.test(String(headBefore?.sha || '')) ? String(headBefore.sha).toLowerCase() : null,
    });
  }

  const files = [];
  for (const path of uniquePaths(proposal)) {
    try {
      const source = await reader.read(path);
      const content = String(source.content || '');
      if (content.length > MAX_SOURCE) continue;
      files.push({ path: source.path, content });
    } catch {}
  }
  if (!files.length) throw Object.assign(new Error('BRIDGE_PREPARATION_SOURCE_REQUIRED'), { code: 'BRIDGE_PREPARATION_SOURCE_REQUIRED' });

  let headAfter;
  try {
    headAfter = await inspectionHead();
  } catch (error) {
    if (error?.code === 'CODE_HEAD_PIN_MISMATCH') {
      throw Object.assign(new Error('CANDIDATE_HEAD_CHANGED_DURING_INSPECTION'), {
        code: 'CANDIDATE_HEAD_CHANGED_DURING_INSPECTION',
        expected_sha: approvedSha,
        observed_sha: String(error?.observed_sha || '').toLowerCase() || null,
      });
    }
    throw error;
  }
  if (String(headAfter?.sha || '').toLowerCase() !== String(headBefore.sha).toLowerCase()) {
    throw Object.assign(new Error('CANDIDATE_HEAD_CHANGED_DURING_INSPECTION'), {
      code: 'CANDIDATE_HEAD_CHANGED_DURING_INSPECTION',
      expected_sha: approvedSha,
      observed_sha: SHA40.test(String(headAfter?.sha || '')) ? String(headAfter.sha).toLowerCase() : null,
    });
  }
  return { repository, branch, candidate_sha: headAfter.sha, files };
}

function normalizeTests(tests = []) {
  // A model-selected smoke cannot stand in for preservation of existing behavior.
  const values = ['test'];
  for (const name of Array.isArray(tests) ? tests : []) {
    const value = String(name || '');
    if (!ALLOWED_TESTS.has(value) || values.includes(value)) continue;
    values.push(value);
    if (values.length >= 4) break;
  }
  if (!values.length) values.push('test:smoke');
  return values.map((name) => ({ name, command: name, passed: false }));
}

function repairMarker(job) {
  const bridge = job?.result_json?.dev_bridge;
  if (bridge?.needs_repair !== true) return '';
  // A failure received before the current Teacher approval belongs to a plan
  // replaced after a candidate SHA change: repairing it targets files the new
  // plan never inspected (MENTOR_UNINSPECTED_PATH). It stays in result_json.
  const failedAt = Date.parse(String(bridge.received_at || ''));
  const approvedAt = Date.parse(String(job?.result_json?.teacher_bridge?.reviewed_at || ''));
  if (SHA40.test(String(job?.result_json?.candidate_ci_failure?.base_sha || ''))) return String(bridge.received_at || '');
  if (Number.isFinite(failedAt) && Number.isFinite(approvedAt) && failedAt < approvedAt) return '';
  return String(bridge.received_at || '');
}

function reusablePackage(job, proposal) {
  const existing = job?.result_json?.bridge_preparation;
  if (existing?.status !== 'READY') return null;
  if (existing.teacher_request_id !== proposal.teacher_request_id) return null;
  if (existing.candidate_branch !== proposal.candidate_branch) return null;
  if (String(existing.candidate_sha || '').toLowerCase() !== String(proposal.candidate_sha || '').toLowerCase()) return null;
  if (!Array.isArray(job.files_json) || !job.files_json.length) return null;
  if (!Array.isArray(job.tests_json) || !job.tests_json.length) return null;
  const marker = repairMarker(job);
  if (marker && existing.repair_for_received_at !== marker) return null;
  return { ...existing, reused: true };
}

/**
 * Converts an approved, already-inspected multi-AI implementation plan into a
 * bounded structured package that the local Dev Bridge can actually apply.
 * It never commits or deploys production. All generated paths are revalidated
 * by MentorEngine and later again by LocalDevBridge. A failed bridge test may
 * trigger a repair proposal for the same approved goal, but never expands the
 * Teacher-approved scope or bypasses the release gate.
 */
export async function prepareApprovedBridgePackage({
  env,
  repository,
  job,
  fetchImpl = fetch,
  mentorEngine = null,
} = {}) {
  if (!repository || !job) throw Object.assign(new Error('BRIDGE_PREPARATION_INPUT_REQUIRED'), { code: 'BRIDGE_PREPARATION_INPUT_REQUIRED' });
  const current = await repository.get(job.id);
  if (!current) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });
  const teacher = requireTeacherApproved(current);
  const implementation = requireImplementationProposal(current, teacher);
  const code = await inspectSources(env, implementation, { fetchImpl });
  const reused = reusablePackage(current, implementation);
  if (reused) {
    assertRoadmapCodeChanges(current, current.files_json);
    for (const file of current.files_json) {
      const inspected = code.files.find(source => source.path === file.path);
      if (!inspected) throw Object.assign(new Error('MENTOR_UNINSPECTED_PATH'), { code: 'MENTOR_UNINSPECTED_PATH' });
      assertMentorCodeContract(file.path, inspected.content, file.content);
    }
    // Packages made before mandatory full regression must be rebuilt once.
    if (current.tests_json.some(test => test.command === 'test')) return reused;
  }
  const engine = mentorEngine || createMentorEngine(env);
  const repairFor = repairMarker(current);
  const mode = repairFor ? 'repair' : 'implement';
  const repairReferences = [];
  const failure = current.result_json?.candidate_ci_failure;
  if (repairFor && SHA40.test(String(failure?.base_sha || ''))) {
    const referenceReader = createGitHubCodeReader({ repository: code.repository, branch: code.branch,
      token: String(env?.MEL_GITHUB_TOKEN || ''), pinnedSha: failure.base_sha, fetchImpl });
    for (const file of code.files) {
      const reference = await referenceReader.read(file.path);
      if (reference.content.length > MAX_SOURCE) throw Object.assign(new Error('MENTOR_SOURCE_TOO_LARGE'), { code: 'MENTOR_SOURCE_TOO_LARGE' });
      repairReferences.push({ path: reference.path, content: reference.content });
    }
  }
  const reader = createGitHubCodeReader({ ...code, token: String(env?.MEL_GITHUB_TOKEN || ''), pinnedSha: code.candidate_sha, fetchImpl });
  // Only a confirmed 404 counts as missing; a network error must not block code.
  const pathExists = async (path) => {
    try { await reader.read(path); return true; } catch (error) { return Number(error?.status) !== 404; }
  };
  // A repair must see the regression tests its change broke, even outside the
  // contract (read-only: allowedPaths still refuses edits). 31/10: MANIFEST-08
  // spent 8 repairs blind on assistant-connected-routing it could not read.
  const inspectedFiles = [...code.files];
  if (repairFor) {
    const failing = new Set();
    for (const test of current?.result_json?.dev_bridge?.tests || [])
      for (const m of String(test?.error || '').matchAll(/✗ (tests\/[\w./-]+\.test\.mjs)/g)) failing.add(m[1]);
    for (const path of [...failing].slice(0, 2)) {
      if (inspectedFiles.some(file => file.path === path)) continue;
      try { const file = await reader.read(path); if (file.content.length <= MAX_SOURCE) inspectedFiles.push({ path: file.path, content: file.content }); } catch { /* best effort */ }
    }
  }
  // Owner decision 31/10: missions are implemented ahead of time and stored in
  // prepared/<ROADMAP-ID>.json on main. MAX applies that package instead of
  // calling the coder models, then the usual bridge, full CI, Council review
  // and acceptance receipt apply unchanged. A package whose base file hash no
  // longer matches the candidate is skipped (never overwrite newer work).
  // A mission already in repair also takes its prepared package once; when the
  // last package applied was the prepared one and it failed, the coders repair.
  const preparedAlreadyTried = current?.result_json?.bridge_preparation?.mentor?.provenance?.source === 'prepared-package';
  const prepared = repairFor && preparedAlreadyTried ? null : await preparedMissionPackage(env, code, current, inspectedFiles, fetchImpl);
  const mentor = prepared || await engine.propose({
    env,
    jobId: current.id,
    goal: current.goal,
    inspectedFiles,
    // A Council rejection is a failure the repair must see: 31/10 AUDIT-06 was
    // rejected for an unimported standardRegistry while its tests were green,
    // and the repair only received those passing tests.
    previousAttempts: repairFor
      ? [...(current?.result_json?.dev_bridge?.tests || []),
        ...(current?.result_json?.council_review?.decision === 'REJECTED' && current.result_json.council_review.objections?.length
          ? [{ name: 'council-review', command: 'council', passed: false, exit_code: 1,
            error: ('COUNCIL_REJECTED: ' + current.result_json.council_review.objections.join(' | ')).slice(0, 1800) }]
          : [])]
      : current?.result_json?.mentor_attempt_history || [],
    mode,
    repairReferences,
    pathExists,
    // Production implementations must ship a test the Council can check.
    requireTest: true,
    // Rounds already lost on this mission: repairs that failed their tests,
    // or proposal attempts MEL refused. Two lost rounds call the large coder.
    // A roadmap contract names the only editable files.
    allowedPaths: (() => { const c = ROADMAP_CODE_CONTRACTS[String(current?.optional_context?.roadmap_id || '')]; return c ? [...c.code_paths, ...c.test_paths] : null; })(),
    failedRounds: repairFor
      ? Number(current?.result_json?.repair_cycle?.attempts || 0)
      // A round where every coder timed out is not counted in the history (our
      // pipeline, not the model), but repeating the same timing-out small model
      // only burns neurons (31/10 CHAT-01): the next round calls the large one.
      : (current?.result_json?.mentor_attempt_history || []).length
        + ((current?.result_json?.bridge_preparation_diagnostic?.mentor_failure_codes || []).length
          && (current.result_json.bridge_preparation_diagnostic.mentor_failure_codes || []).every(row => /TIMEOUT/.test(String(row?.code || ''))) ? 2 : 0),
  });
  const proposal = mentor?.proposal;
  if (!proposal || !Array.isArray(proposal.changes) || !proposal.changes.length) {
    throw Object.assign(new Error('BRIDGE_PREPARATION_CHANGES_REQUIRED'), { code: 'BRIDGE_PREPARATION_CHANGES_REQUIRED' });
  }

  await reader.head();

  const files = proposal.changes.slice(0, 10).map((change) => ({
    path: String(change.path || ''),
    content: String(change.content || ''),
    reason: String(change.reason || '').slice(0, 1200),
  }));
  assertRoadmapCodeChanges(current, files);
  const tests = normalizeTests(proposal.tests);
  const bridgePreparation = {
    status: 'READY',
    schema: 'mel.dev-bridge-package',
    version: 1,
    created_at: new Date().toISOString(),
    teacher_request_id: teacher.request.request_id,
    candidate_branch: code.branch,
    candidate_sha: code.candidate_sha,
    source_files: code.files.map((file) => file.path),
    files: files.map((file) => file.path),
    tests: tests.map((test) => test.name),
    repair_for_received_at: repairFor || null,
    mentor: {
      confidence: Number(proposal.confidence || 0),
      provenance: proposal.provenance || null,
      council: mentor.council || null,
      mode: mentor.mode || mode,
    },
    production_deploy_allowed: false,
    human_release_approval_required: true,
  };
  const result = current.result_json && typeof current.result_json === 'object' ? { ...current.result_json } : {};
  result.bridge_preparation = bridgePreparation;
  if (repairFor && result.dev_bridge) {
    result.dev_bridge = { ...result.dev_bridge, repair_package_created_at: bridgePreparation.created_at };
  }
  const patch = {
    summary: String(proposal.summary || '').slice(0, 4000),
    risks: Array.isArray(proposal.risks) ? proposal.risks.slice(0, 8) : [],
    lessons: Array.isArray(proposal.lessons) ? proposal.lessons.slice(0, 8) : [],
    source: 'MentorEngine',
    mode,
  };
  const updated = await repository.update(current.id, {
    files_json: files,
    tests_json: tests,
    patch_json: patch,
    result_json: result,
  }, { expected: current });
  return updated.result_json.bridge_preparation;
}


async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function preparedMissionPackage(env, code, job, inspectedFiles = [], fetchImpl = fetch) {
  const roadmapId = String(job?.optional_context?.roadmap_id || '');
  const contract = ROADMAP_CODE_CONTRACTS[roadmapId];
  if (!contract || !/^MEL-[A-Z0-9-]+$/.test(roadmapId)) return null;
  let pkg;
  try {
    const mainReader = createGitHubCodeReader({ repository: code.repository, branch: 'main', token: String(env?.MEL_GITHUB_TOKEN || ''), fetchImpl });
    pkg = JSON.parse((await mainReader.read(`prepared/${roadmapId}.json`)).content);
  } catch { return null; }
  if (pkg?.roadmap_id !== roadmapId || !Array.isArray(pkg.changes) || !pkg.changes.length) return null;
  const reader = createGitHubCodeReader({ ...code, token: String(env?.MEL_GITHUB_TOKEN || ''), pinnedSha: code.candidate_sha, fetchImpl });
  const changes = [];
  for (const change of pkg.changes.slice(0, 10)) {
    const path = String(change?.path || '');
    if (![...contract.code_paths, ...contract.test_paths].includes(path)) return null;
    let base = '';
    try { base = (inspectedFiles.find(file => file.path === path) || await reader.read(path)).content; } catch (error) { if (Number(error?.status) !== 404) return null; }
    if (String(change.base_sha256 || '') !== (base ? await sha256Hex(base) : 'new')) return null;
    changes.push({ path, content: String(change.content || ''), reason: String(change.reason || 'Paquet préparé') });
  }
  return { mode: 'prepared', council: null, proposal: {
    changes, tests: Array.isArray(pkg.tests) ? pkg.tests : ['test'],
    summary: String(pkg.summary || ''), confidence: 1,
    provenance: { source: 'prepared-package', path: `prepared/${roadmapId}.json` },
    risks: [], lessons: [],
  } };
}

export { normalizeTests, repairMarker };
