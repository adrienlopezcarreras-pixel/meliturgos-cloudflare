import { createGitHubCodeReader } from '../capabilities/github-code-capabilities.js';
import { createMentorEngine } from '../learning/mentor-engine.js';

const SHA40 = /^[0-9a-f]{40}$/i;
const MAX_FILES = 8;
const MAX_SOURCE = 45_000;
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
  const branch = String(proposal?.candidate_branch || env.MEL_TEACHER_BRANCH || 'candidate/augmentio-core');
  if (!branch.startsWith('candidate/')) throw Object.assign(new Error('BRIDGE_PREPARATION_BRANCH_NOT_CANDIDATE'), { code: 'BRIDGE_PREPARATION_BRANCH_NOT_CANDIDATE' });
  if (env.MEL_TEACHER_BRANCH && String(env.MEL_TEACHER_BRANCH) !== branch) {
    throw Object.assign(new Error('BRIDGE_PREPARATION_BRANCH_MISMATCH'), { code: 'BRIDGE_PREPARATION_BRANCH_MISMATCH' });
  }
  return { repository, branch };
}

function uniquePaths(proposal) {
  const out = [];
  for (const row of Array.isArray(proposal?.inspected_files) ? proposal.inspected_files : []) {
    const value = String(row?.path || '').trim();
    if (!value || out.includes(value)) continue;
    out.push(value);
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

async function inspectSources(env, proposal, { fetchImpl = fetch } = {}) {
  const { repository, branch } = codeConfig(env, proposal);
  const reader = createGitHubCodeReader({ repository, branch, token: String(env?.MEL_GITHUB_TOKEN || ''), fetchImpl });
  const headBefore = await reader.head();
  if (!SHA40.test(String(headBefore?.sha || '')) || String(headBefore.sha).toLowerCase() !== String(proposal.candidate_sha).toLowerCase()) {
    throw Object.assign(new Error('BRIDGE_PREPARATION_CANDIDATE_STALE'), { code: 'BRIDGE_PREPARATION_CANDIDATE_STALE' });
  }

  const files = [];
  for (const path of uniquePaths(proposal)) {
    try {
      const source = await reader.read(path);
      files.push({ path: source.path, content: String(source.content || '').slice(0, MAX_SOURCE) });
    } catch {}
  }
  if (!files.length) throw Object.assign(new Error('BRIDGE_PREPARATION_SOURCE_REQUIRED'), { code: 'BRIDGE_PREPARATION_SOURCE_REQUIRED' });

  const headAfter = await reader.head();
  if (String(headAfter?.sha || '').toLowerCase() !== String(headBefore.sha).toLowerCase()) {
    throw Object.assign(new Error('CANDIDATE_HEAD_CHANGED_DURING_INSPECTION'), { code: 'CANDIDATE_HEAD_CHANGED_DURING_INSPECTION' });
  }
  return { repository, branch, candidate_sha: headAfter.sha, files };
}

function normalizeTests(tests = []) {
  const values = [];
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
  return bridge?.needs_repair === true ? String(bridge.received_at || '') : '';
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
  const reused = reusablePackage(current, implementation);
  if (reused) return reused;

  const code = await inspectSources(env, implementation, { fetchImpl });
  const engine = mentorEngine || createMentorEngine(env);
  const repairFor = repairMarker(current);
  const mode = repairFor ? 'repair' : 'implement';
  const mentor = await engine.propose({
    env,
    jobId: current.id,
    goal: current.goal,
    inspectedFiles: code.files,
    previousAttempts: current?.result_json?.dev_bridge?.tests || [],
    mode,
  });
  const proposal = mentor?.proposal;
  if (!proposal || !Array.isArray(proposal.changes) || !proposal.changes.length) {
    throw Object.assign(new Error('BRIDGE_PREPARATION_CHANGES_REQUIRED'), { code: 'BRIDGE_PREPARATION_CHANGES_REQUIRED' });
  }

  const files = proposal.changes.slice(0, 10).map((change) => ({
    path: String(change.path || ''),
    content: String(change.content || ''),
    reason: String(change.reason || '').slice(0, 1200),
  }));
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
  });
  return updated.result_json.bridge_preparation;
}

export { normalizeTests, repairMarker };
