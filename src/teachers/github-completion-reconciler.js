import { createMentorEngine } from '../learning/mentor-engine.js';
import { hasDistinctProviderAttempts } from '../evolution/autonomy-provider-attempts.js';
import { createLearningEngine } from '../learning/learning-engine.js';
import { ingestValidatedHandoffs } from '../learning/handoff-ingestion.js';

const COMPLETION_KIND = 'MEL_WORK_COMPLETION';
const SHA_RE = /^[a-f0-9]{40}$/i;

function repoAndBranch(env = {}) {
  const repository = String(env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  const branch = String(env.MEL_TEACHER_BRANCH || 'candidate/mel-clean-autonomy');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw Object.assign(new Error('COMPLETION_REPOSITORY_INVALID'), { code: 'COMPLETION_REPOSITORY_INVALID' });
  }
  if (!branch.startsWith('candidate/')) {
    throw Object.assign(new Error('COMPLETION_BRANCH_NOT_CANDIDATE'), { code: 'COMPLETION_BRANCH_NOT_CANDIDATE' });
  }
  return { repository, branch };
}

function encodePath(value) {
  return String(value).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

export function defaultCompletionsUrl(env = {}) {
  const { repository, branch } = repoAndBranch(env);
  return `https://raw.githubusercontent.com/${encodePath(repository)}/refs/heads/${encodePath(branch)}/teacher-bridge/completions.jsonl`;
}

function normalizeTests(value) {
  if (!Array.isArray(value) || value.length === 0) return [];
  return value.slice(0, 50).map((test) => ({
    name: String(test?.name || '').slice(0, 200),
    passed: test?.passed === true,
  })).filter((test) => test.name);
}

function textValue(value, max = 8000) {
  if (typeof value === 'string') return value.slice(0, max);
  if (value == null) return '';
  try { return JSON.stringify(value).slice(0, max); } catch { return String(value).slice(0, max); }
}

function completionProvenanceSnapshot(job) {
  const teacher = job?.result_json?.teacher_bridge || {};
  const review = teacher?.review || {};
  const request = teacher?.request || {};
  const bridge = job?.result_json?.dev_bridge || {};
  return {
    teacher: {
      request_id: String(request.request_id || review.request_id || '').slice(0, 200) || null,
      status: String(teacher.status || '').slice(0, 80) || null,
      verdict: String(review.verdict || '').slice(0, 80) || null,
      development_allowed: review.development_allowed === true,
      producer: String(request?.provenance?.producer || request?.provenance?.source || '').slice(0, 120) || null,
      candidate_sha: String(request?.provenance?.candidate_sha || request?.candidate?.sha || '').slice(0, 80) || null,
    },
    dev_bridge: {
      status: String(bridge.status || job?.status || '').slice(0, 80) || null,
      candidate_branch: String(bridge.candidate_branch || job?.candidate_branch || '').slice(0, 300) || null,
      diff_summary: String(bridge.diff_summary || '').slice(0, 1000),
      needs_repair: bridge.needs_repair === true,
      received_at: String(bridge.received_at || '').slice(0, 100) || null,
      tests: normalizeTests(bridge.tests),
    },
  };
}

export function parseCompletionJsonl(text) {
  const completions = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value;
    try { value = JSON.parse(line); } catch { continue; }
    if (value?.kind !== COMPLETION_KIND || String(value?.status || '').toUpperCase() !== 'COMPLETED') continue;
    const jobId = String(value.job_id || '');
    const requestId = String(value.request_id || '');
    const candidateSha = String(value.candidate_sha || '');
    const candidateBranch = String(value.candidate_branch || '');
    const ciRunId = Number(value.ci_run_id || 0);
    const tests = normalizeTests(value.tests);
    if (!jobId || !requestId || !SHA_RE.test(candidateSha) || !candidateBranch.startsWith('candidate/')) continue;
    if (!Number.isSafeInteger(ciRunId) || ciRunId <= 0) continue;
    if (!tests.length || tests.some((test) => test.passed !== true)) continue;
    completions.push({
      kind: COMPLETION_KIND,
      status: 'COMPLETED',
      job_id: jobId,
      request_id: requestId,
      candidate_sha: candidateSha,
      candidate_branch: candidateBranch,
      ci_run_id: ciRunId,
      tests,
      summary: String(value.summary || '').slice(0, 4000),
      learning_handoffs: Array.isArray(value.learning_handoffs) ? value.learning_handoffs.slice(0, 50) : [],
      created_at: String(value.created_at || '').slice(0, 100),
    });
  }
  return completions;
}

async function fetchJson(fetchImpl, url, env = {}) {
  let response;
  try { response = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'meliturgos-completion-reconciler',
      'x-github-api-version': '2022-11-28',
      ...(env.MEL_GITHUB_TOKEN ? { authorization: 'Bearer ' + String(env.MEL_GITHUB_TOKEN) } : {}),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  }); } catch {
    throw Object.assign(new Error('COMPLETION_GITHUB_TRANSPORT_FAILED'), { code: 'COMPLETION_GITHUB_TRANSPORT_FAILED' });
  }
  if (!response.ok) {
    const error = new Error(`COMPLETION_GITHUB_VERIFY_FAILED_${response.status}`);
    error.code = 'COMPLETION_GITHUB_VERIFY_FAILED';
    error.status = response.status;
    throw error;
  }
  try { return await response.json(); } catch {
    throw Object.assign(new Error('COMPLETION_GITHUB_RESPONSE_INVALID'), { code: 'COMPLETION_GITHUB_RESPONSE_INVALID' });
  }
}

export async function verifyCompletionEvidence(completion, env = {}, { fetchImpl = fetch } = {}) {
  const { repository, branch } = repoAndBranch(env);
  if (completion.candidate_branch !== branch) {
    throw Object.assign(new Error('COMPLETION_BRANCH_MISMATCH'), { code: 'COMPLETION_BRANCH_MISMATCH' });
  }
  const run = await fetchJson(fetchImpl, `https://api.github.com/repos/${encodePath(repository)}/actions/runs/${completion.ci_run_id}`, env);
  const runName = String(run?.name || '');
  const headSha = String(run?.head_sha || '');
  const headBranch = String(run?.head_branch || '');
  const status = String(run?.status || '').toLowerCase();
  const conclusion = String(run?.conclusion || '').toLowerCase();
  if (runName !== 'full-candidate-ci' || headSha !== completion.candidate_sha || headBranch !== branch || status !== 'completed' || conclusion !== 'success') {
    throw Object.assign(new Error('COMPLETION_CI_EVIDENCE_INVALID'), { code: 'COMPLETION_CI_EVIDENCE_INVALID' });
  }
  return {
    verified: true,
    workflow: runName,
    run_id: completion.ci_run_id,
    head_sha: headSha,
    head_branch: headBranch,
    conclusion,
  };
}

export async function fetchCompletionRecords(env = {}, { fetchImpl = fetch } = {}) {
  const url = String(env.MEL_TEACHER_COMPLETIONS_URL || defaultCompletionsUrl(env));
  const response = await fetchImpl(url, { headers: { accept: 'text/plain', 'user-agent': 'meliturgos-completion-reconciler' } });
  if (response.status === 404) return [];
  if (!response.ok) {
    const error = new Error(`COMPLETIONS_FETCH_FAILED_${response.status}`);
    error.code = 'COMPLETIONS_FETCH_FAILED';
    error.status = response.status;
    throw error;
  }
  return parseCompletionJsonl(await response.text());
}

/** Green full-candidate-ci run on an exact candidate SHA, or null. */
export async function findGreenFullCandidateRun(env = {}, sha, { fetchImpl = fetch } = {}) {
  const { repository, branch } = repoAndBranch(env);
  const head = String(sha || '').toLowerCase();
  if (!SHA_RE.test(head)) return null;
  const page = await fetchJson(fetchImpl, `https://api.github.com/repos/${encodePath(repository)}/actions/workflows/full-candidate-ci.yml/runs?head_sha=${head}&per_page=10`, env);
  const run = (Array.isArray(page?.workflow_runs) ? page.workflow_runs : [])
    .find((row) => row?.head_sha === head && row?.head_branch === branch && row?.status === 'completed' && row?.conclusion === 'success');
  return run ? Number(run.id) : null;
}

// Completion without a hand-written Teacher record: the Council approved this
// exact candidate SHA (promotion diff, or VERIFY_EXISTING evidence) and the
// SHA has a green full-candidate-ci run, re-checked by verifyCompletionEvidence().
export async function approvedCouncilReviews(env = {}) {
  if (!env?.DB?.prepare) return [];
  const rows = await env.DB.prepare(
    "SELECT metadata_json FROM dev_bridge_state WHERE bridge_id LIKE 'council-review:%' AND status='APPROVED' ORDER BY last_seen DESC LIMIT 20"
  ).all().catch(() => null);
  const reviews = [];
  for (const row of Array.isArray(rows?.results) ? rows.results : []) {
    try {
      const review = JSON.parse(row?.metadata_json || '{}');
      if (review?.decision === 'APPROVED' && SHA_RE.test(String(review.head || ''))) reviews.push(review);
    } catch {}
  }
  return reviews;
}

export async function councilApprovedCompletionRecords(env = {}, jobsById = new Map(), reviews = [], { fetchImpl = fetch } = {}) {
  const { branch } = repoAndBranch(env);
  const runs = new Map();
  const records = [];
  for (const review of reviews) {
    const head = String(review.head).toLowerCase();
    for (const jobId of Array.isArray(review.jobs) ? review.jobs : []) {
      const job = jobsById.get(String(jobId));
      if (!job || String(job.status || '').toUpperCase() === 'COMPLETED') continue;
      const requestId = String(job.result_json?.teacher_bridge?.request?.request_id || '');
      if (!requestId) continue;
      if (!runs.has(head)) runs.set(head, await findGreenFullCandidateRun(env, head, { fetchImpl }).catch(() => null));
      const ciRunId = runs.get(head);
      if (!ciRunId) continue;
      records.push({
        kind: COMPLETION_KIND,
        status: 'COMPLETED',
        source: 'council-approved',
        job_id: job.id,
        request_id: requestId,
        candidate_sha: head,
        candidate_branch: branch,
        ci_run_id: ciRunId,
        tests: [{ name: 'full-candidate-ci', passed: true }],
        summary: `Council ${review.mode || 'promotion'} APPROVED; full-candidate-ci ${ciRunId} green.`,
        learning_handoffs: [],
        created_at: new Date(Number(review.reviewed_at) || Date.now()).toISOString(),
      });
    }
  }
  return records;
}

function validateMelImplementationProposal(job, record) {
  const proposal = job?.result_json?.implementation_proposal;
  if (!proposal || !['READY', 'VERIFY_EXISTING'].includes(proposal.status)) return null;
  if (String(proposal.teacher_request_id || '') !== record.request_id) return null;
  if (String(proposal.candidate_branch || '') !== record.candidate_branch) return null;
  if (!hasDistinctProviderAttempts(proposal.providers_attempted)) return null;
  if (!Array.isArray(proposal.inspected_files) || proposal.inspected_files.length < 1) return null;
  if (!proposal.selected?.text || !proposal.selected?.model) return null;
  if (proposal.production_touched !== false || proposal.candidate_write_performed !== false) return null;
  return proposal;
}

function teacherRevisionHistory(job) {
  const history = Array.isArray(job?.result_json?.teacher_bridge_history) ? job.result_json.teacher_bridge_history : [];
  return history.filter((state) => state?.review?.verdict === 'NEEDS_CHANGES' && state?.review?.feedback);
}

function bridgeRepairHistory(job) {
  const history = Array.isArray(job?.result_json?.dev_bridge_history) ? job.result_json.dev_bridge_history : [];
  return history.filter((row) => row && (row.needs_repair === true || normalizeTests(row.tests).some((test) => test.passed !== true)));
}

export function buildVerifiedRepairCorrections(job, record, proposal, ci) {
  const repairs = bridgeRepairHistory(job);
  return repairs.map((repair, index) => {
    const failed = normalizeTests(repair.tests).filter((test) => test.passed !== true);
    const failureEvidence = failed.length
      ? failed.map((test) => test.name + ':failed').join(', ')
      : 'runtime marked needs_repair=true';
    const before = textValue(repair.diff_summary || ('Failed candidate attempt: ' + failureEvidence));
    const after = textValue(record.summary || proposal?.selected?.text || job?.result_json?.dev_bridge?.diff_summary || 'Corrected candidate validated by full CI');
    if (!before || !after || before === after) return null;
    return {
      id: 'repair:' + String(job.id) + ':' + String(repair.received_at || index) + ':' + String(record.candidate_sha).slice(0, 12),
      job_id: job.id,
      source: 'runtime-test-repair',
      domain: String(job?.optional_context?.roadmap_id || 'autonomous-development').slice(0, 120),
      task: textValue(job.goal || 'Repair a failed MEL development attempt', 4000),
      input: textValue(job.goal || 'Repair the candidate until verification succeeds'),
      before,
      after,
      rationale: textValue('CAUSE: candidate tests failed (' + failureEvidence + '). METHOD: preserve the approved goal, reopen only the repair implementation stage, correct the candidate, rerun targeted tests, then require exact-SHA full-candidate-ci success. PROOF: ' + ci.workflow + '#' + ci.run_id + ' succeeded on ' + ci.head_sha + '.'),
      tests: [
        ...failed.map((test) => test.name + ':failed-before-repair'),
        ...record.tests.map((test) => test.name + ':passed-after-repair'),
        ci.workflow + '#' + ci.run_id + ':success',
      ],
      tags: ['runtime-repair', 'test-failure', 'verified-repair', 'full-candidate-ci'],
      validated: true,
      quality: 1,
    };
  }).filter(Boolean);
}

async function recordVerifiedRepairCorrections(env, job, record, proposal, ci) {
  if (!env?.DB) return { recorded: 0, reason: 'DB_BINDING_MISSING' };
  const candidates = buildVerifiedRepairCorrections(job, record, proposal, ci);
  if (!candidates.length) return { recorded: 0, reason: 'NO_VERIFIED_REPAIR_HISTORY' };
  const learning = createLearningEngine(env);
  let recorded = 0;
  const failures = [];
  for (const candidate of candidates) {
    try {
      await learning.recordCorrection(candidate);
      recorded += 1;
    } catch (error) {
      failures.push(String(error?.code || error?.message || 'CORRECTION_RECORD_FAILED').slice(0, 160));
    }
  }
  return { recorded, failures };
}

async function recordVerifiedTeacherCorrections(env, job, record, proposal, ci) {
  if (!env?.DB) return { recorded: 0, reason: 'DB_BINDING_MISSING' };
  const revisions = teacherRevisionHistory(job);
  if (!revisions.length) return { recorded: 0, reason: 'NO_TEACHER_REVISIONS' };
  const learning = createLearningEngine(env);
  let recorded = 0;
  const failures = [];
  for (let index = 0; index < revisions.length; index += 1) {
    const state = revisions[index];
    const request = state?.request || {};
    const review = state?.review || {};
    const before = textValue(request.patch_summary || request.objective || job.goal || 'Approche précédente rejetée');
    const after = textValue(record.summary || proposal?.selected?.text || 'Approche corrigée validée par CI');
    const rationale = textValue(review.feedback || 'Correction demandée par le Teacher externe.');
    if (!before || !after || before === after || !rationale) continue;
    try {
      await learning.recordCorrection({
        id: `teacher:${job.id}:${review.request_id || request.request_id || index}:${record.candidate_sha.slice(0, 12)}`,
        job_id: job.id,
        source: 'chatgpt-teacher',
        domain: String(job?.optional_context?.roadmap_id || 'autonomous-development').slice(0, 120),
        task: textValue(request.objective || job.goal || 'Correction de développement MEL', 4000),
        input: textValue(request.objective || job.goal || 'Corriger le développement MEL'),
        before,
        after,
        rationale,
        tests: [
          ...record.tests.map((test) => `${test.name}:passed`),
          `${ci.workflow}#${ci.run_id}:success`,
        ],
        tags: ['teacher', 'needs-changes', 'verified-repair', 'full-candidate-ci'],
        validated: true,
        quality: 1,
      });
      recorded += 1;
    } catch (error) {
      failures.push(String(error?.code || error?.message || 'CORRECTION_RECORD_FAILED').slice(0, 160));
    }
  }
  return { recorded, failures };
}

async function ingestVerifiedCompletionHandoffs(env, record, ci) {
  if (!env?.DB) return { accepted: [], duplicate: [], rejected: [], reason: 'DB_BINDING_MISSING' };
  if (!Array.isArray(record?.learning_handoffs) || record.learning_handoffs.length === 0) {
    return { accepted: [], duplicate: [], rejected: [], reason: 'NO_VALIDATED_HANDOFFS' };
  }
  try {
    const learning = createLearningEngine(env);
    const result = await ingestValidatedHandoffs({
      handoffs: record.learning_handoffs,
      learningEngine: learning,
      expectedSha: record.candidate_sha,
    });
    return {
      ...result,
      ci_run_id: ci?.run_id || null,
      candidate_sha: record.candidate_sha,
    };
  } catch (error) {
    return {
      accepted: [],
      duplicate: [],
      rejected: [],
      reason: String(error?.code || error?.message || 'HANDOFF_INGESTION_FAILED').slice(0, 160),
      ci_run_id: ci?.run_id || null,
      candidate_sha: record.candidate_sha,
    };
  }
}

async function recordVerifiedCompletionLesson(env, job, record, proposal, ci, benchmarkEvaluator = null, benchmarkModelId = '') {
  if (!env?.DB) return { recorded: false, reason: 'DB_BINDING_MISSING', corrections_recorded: 0 };
  try {
    const engine = createMentorEngine(env);
    await engine.recordOutcome({
      jobId: job.id,
      goal: job.goal || '',
      outcome: 'SUCCEEDED',
      lesson: record.summary || `Le job ${job.id} a été validé par la CI complète sur la candidate ${record.candidate_branch}.`,
      evidence: {
        request_id: record.request_id,
        candidate_sha: record.candidate_sha,
        candidate_branch: record.candidate_branch,
        ci,
        tests: record.tests,
        providers_attempted: proposal.providers_attempted.length,
        selected_model: String(proposal.selected.model || '').slice(0, 200),
        inspected_files: proposal.inspected_files.map((row) => row?.path).filter(Boolean).slice(0, 8),
        provenance: completionProvenanceSnapshot(job),
      },
      score: 1,
      tags: ['autonomy', 'verified-completion', 'full-candidate-ci'],
    });
    const [teacherLearning, repairLearning, handoffLearning] = await Promise.all([
      recordVerifiedTeacherCorrections(env, job, record, proposal, ci),
      recordVerifiedRepairCorrections(env, job, record, proposal, ci),
      ingestVerifiedCompletionHandoffs(env, record, ci),
    ]);
    const handoffCorrections = Array.isArray(handoffLearning.accepted) ? handoffLearning.accepted.length : 0;
    const correctionsRecorded = (teacherLearning.recorded || 0) + (repairLearning.recorded || 0) + handoffCorrections;
    let benchmarkCadence;
    try {
      const learning = createLearningEngine(env);
      benchmarkCadence = await learning.advanceBenchmarkCadence({
        verifiedJobsDelta: 1,
        significantCorrections: correctionsRecorded,
        evaluator: benchmarkEvaluator,
        model_id: String(benchmarkModelId || ''),
        source_sha: record.candidate_sha,
        metadata: {
          job_id: job.id,
          roadmap_id: String(job?.optional_context?.roadmap_id || '').slice(0, 120) || null,
          ci_run_id: ci.run_id,
        },
      });
    } catch (error) {
      benchmarkCadence = {
        status: 'CADENCE_RECORD_FAILED',
        failure: String(error?.code || error?.message || 'BENCHMARK_CADENCE_FAILED').slice(0, 160),
      };
    }
    return {
      recorded: true,
      kind: 'DEVELOPMENT_OUTCOME',
      corrections_recorded: correctionsRecorded,
      teacher_corrections_recorded: teacherLearning.recorded || 0,
      repair_corrections_recorded: repairLearning.recorded || 0,
      handoff_corrections_recorded: handoffCorrections,
      handoff_ingestion: handoffLearning,
      correction_failures: [...(teacherLearning.failures || []), ...(repairLearning.failures || [])],
      benchmark_cadence: benchmarkCadence,
    };
  } catch (error) {
    return { recorded: false, reason: String(error?.code || error?.message || 'MENTOR_LEARNING_FAILED').slice(0, 160), corrections_recorded: 0 };
  }
}

export async function reconcileRuntimeCompletions({ repository, env = {}, fetchImpl = fetch, benchmarkEvaluator = null, benchmarkModelId = '' } = {}) {
  if (!repository) throw Object.assign(new Error('COMPLETION_JOB_REPOSITORY_REQUIRED'), { code: 'COMPLETION_JOB_REPOSITORY_REQUIRED' });
  const teacherRecords = await fetchCompletionRecords(env, { fetchImpl });
  const reviews = await approvedCouncilReviews(env);
  if (!teacherRecords.length && !reviews.length) return { ok: true, records: 0, completed: [], rejected: [] };

  const jobs = await repository.list();
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const records = [...teacherRecords, ...await councilApprovedCompletionRecords(env, byId, reviews, { fetchImpl })];
  if (!records.length) return { ok: true, records: 0, completed: [], rejected: [] };
  const completed = [];
  const rejected = [];

  for (const record of records) {
    const job = byId.get(record.job_id);
    if (!job) continue;
    if (String(job.status || '').toUpperCase() === 'COMPLETED' && job.result_json?.autonomy_completion?.candidate_sha === record.candidate_sha) continue;

    const teacher = job.result_json?.teacher_bridge;
    if (teacher?.status !== 'ANSWERED' || teacher?.review?.development_allowed !== true || teacher?.review?.verdict !== 'APPROVE_PLAN' || teacher?.request?.request_id !== record.request_id) {
      rejected.push({ job_id: job.id, request_id: record.request_id, code: 'COMPLETION_TEACHER_APPROVAL_REQUIRED' });
      continue;
    }

    const proposal = validateMelImplementationProposal(job, record);
    if (!proposal) {
      rejected.push({ job_id: job.id, request_id: record.request_id, code: 'COMPLETION_MEL_IMPLEMENTATION_PROPOSAL_REQUIRED' });
      continue;
    }
    if (proposal.decision === 'VERIFY_EXISTING' && record.source !== 'council-approved') {
      rejected.push({ job_id: job.id, request_id: record.request_id, code: 'COMPLETION_VERIFICATION_COUNCIL_REQUIRED' });
      continue;
    }

    try {
      const ci = await verifyCompletionEvidence(record, env, { fetchImpl });
      const mentorLearning = await recordVerifiedCompletionLesson(env, job, record, proposal, ci, benchmarkEvaluator, benchmarkModelId);
      const result = job.result_json && typeof job.result_json === 'object' ? { ...job.result_json } : {};
      result.autonomy_completion = {
        status: 'VERIFIED',
        request_id: record.request_id,
        candidate_sha: record.candidate_sha,
        candidate_branch: record.candidate_branch,
        summary: record.summary,
        tests: record.tests,
        mel_implementation: {
          verified: true,
          providers_attempted: proposal.providers_attempted.length,
          selected_model: String(proposal.selected.model || '').slice(0, 200),
          inspected_files: proposal.inspected_files.map((row) => row?.path).filter(Boolean).slice(0, 8),
        },
        mentor_learning: mentorLearning,
        ci,
        completed_at: new Date().toISOString(),
      };
      // [Codex] Only the existing correlated Council/exact-CI completion gate
      // may promote a no-code assessment; neither planner nor wait can do so.
      if (proposal.decision === 'VERIFY_EXISTING') {
        result.verify_existing = {
          ...result.verify_existing,
          status: 'VERIFIED', objective_assessment: 'ALREADY_IMPLEMENTED_VERIFIED',
          candidate_sha: record.candidate_sha, ci_run_id: record.ci_run_id,
        };
      }
      const updated = await repository.update(job.id, {
        status: 'COMPLETED',
        tests_json: record.tests,
        result_json: result,
        candidate_branch: record.candidate_branch,
      });
      completed.push({
        job_id: updated.id,
        request_id: record.request_id,
        candidate_sha: record.candidate_sha,
        ci_run_id: record.ci_run_id,
        mentor_learning: mentorLearning.recorded === true,
        corrections_recorded: mentorLearning.corrections_recorded || 0,
        handoffs_ingested: mentorLearning.handoff_corrections_recorded || 0,
      });
    } catch (error) {
      rejected.push({ job_id: job.id, request_id: record.request_id, code: error?.code || 'COMPLETION_VERIFY_FAILED' });
    }
  }

  return { ok: true, records: records.length, completed, rejected };
}

// Reuse the active heartbeat and the existing repair state machine. This does
// not run behind the launch gate, complete a job or make any release decision.
export async function reconcileFailedCandidateRuns({ repository, env = {}, fetchImpl = fetch } = {}) {
  const { repository: repo, branch } = repoAndBranch(env);
  const repaired = [];
  const deferred = [];
  const jobs = (await repository.list()).filter(job => job.status === 'READY_FOR_REVIEW'
    && /^[a-f0-9]{40}$/i.test(String(job.result_json?.dev_bridge?.candidate_sha || ''))).slice(0, 8);
  for (const job of jobs) {
    try {
      const bridge = job.result_json.dev_bridge;
      const teacher = job.result_json.teacher_bridge;
      const prep = job.result_json.bridge_preparation;
      if (teacher?.status !== 'ANSWERED' || teacher?.review?.verdict !== 'APPROVE_PLAN'
          || teacher.review.development_allowed !== true
          || !teacher.request?.request_id || teacher.request.request_id !== teacher.review.request_id
          || prep?.status !== 'READY' || !/^[a-f0-9]{40}$/i.test(String(prep.candidate_sha || ''))
          || prep?.teacher_request_id !== teacher.request.request_id
          || prep?.candidate_branch !== branch) continue;
      const sha = bridge.candidate_sha;
      const page = await fetchJson(fetchImpl, `https://api.github.com/repos/${encodePath(repo)}/actions/workflows/full-candidate-ci.yml/runs?head_sha=${sha}&per_page=10`, env);
      if (!Array.isArray(page?.workflow_runs)) throw Object.assign(new Error('COMPLETION_GITHUB_RESPONSE_INVALID'), { code: 'COMPLETION_GITHUB_RESPONSE_INVALID' });
      const run = page.workflow_runs.filter(run => run.name === 'full-candidate-ci' && run.head_sha === sha
        && run.head_branch === branch).sort((a, b) => Number(b.id) - Number(a.id))[0];
      if (!run || !Number.isSafeInteger(Number(run.id)) || Number(run.id) <= 0 || run.status !== 'completed' || !['failure', 'timed_out'].includes(run.conclusion)) continue;
      const head = await fetchJson(fetchImpl, `https://api.github.com/repos/${encodePath(repo)}/commits/${encodeURIComponent(branch)}`, env);
      if (head.sha !== sha) {
        // Preserve unrelated work, but never carry a failure onto changed
        // package files or an unproved/non-descendant candidate.
        const paths = Array.isArray(prep.files) ? prep.files : [];
        if (!/^[a-f0-9]{40}$/i.test(String(head.sha || '')) || !paths.length) {
          deferred.push({ job_id: job.id, code: 'FAILED_CANDIDATE_SUPERSEDED' }); continue;
        }
        const comparison = await fetchJson(fetchImpl, `https://api.github.com/repos/${encodePath(repo)}/compare/${sha}...${head.sha}`, env);
        if (comparison.status !== 'ahead' || comparison.merge_base_commit?.sha !== sha
            || !Array.isArray(comparison.files) || comparison.files.length >= 300
            || comparison.files.some(file => paths.includes(file.filename) || paths.includes(file.previous_filename))) {
          deferred.push({ job_id: job.id, code: 'FAILED_CANDIDATE_SUPERSEDED' }); continue;
        }
      }
      const receivedAt = new Date().toISOString();
      const tests = [{ name: 'full-candidate-ci', command: 'test', passed: false,
        executed: true, error: 'FULL_CANDIDATE_CI_FAILED', run_id: run.id, head_sha: sha }];
      const result = { ...job.result_json,
        dev_bridge_history: [...(job.result_json.dev_bridge_history || []), bridge].slice(-20),
        dev_bridge: { ...bridge, status: 'REPAIR_REQUIRED', needs_repair: true, tests, received_at: receivedAt },
        candidate_ci_failure: { run_id: run.id, failed_candidate_sha: sha, candidate_sha: head.sha, base_sha: prep.candidate_sha,
          teacher_request_id: teacher.request.request_id, observed_at: receivedAt },
      };
      const updated = await repository.update(job.id, { status: 'REPAIR_REQUIRED', result_json: result }, { expected: job });
      if (updated.status === 'REPAIR_REQUIRED') repaired.push({ job_id: job.id, run_id: run.id });
    } catch (error) {
      deferred.push({ job_id: job.id, code: /^[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'CANDIDATE_CI_LOOKUP_FAILED' });
    }
  }
  return { repaired, deferred };
}
