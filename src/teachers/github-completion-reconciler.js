const COMPLETION_KIND = 'MEL_WORK_COMPLETION';
const SHA_RE = /^[a-f0-9]{40}$/i;

function repoAndBranch(env = {}) {
  const repository = String(env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  const branch = String(env.MEL_TEACHER_BRANCH || 'candidate/augmentio-core');
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
      created_at: String(value.created_at || '').slice(0, 100),
    });
  }
  return completions;
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'meliturgos-completion-reconciler',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    const error = new Error(`COMPLETION_GITHUB_VERIFY_FAILED_${response.status}`);
    error.code = 'COMPLETION_GITHUB_VERIFY_FAILED';
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function verifyCompletionEvidence(completion, env = {}, { fetchImpl = fetch } = {}) {
  const { repository, branch } = repoAndBranch(env);
  if (completion.candidate_branch !== branch) {
    throw Object.assign(new Error('COMPLETION_BRANCH_MISMATCH'), { code: 'COMPLETION_BRANCH_MISMATCH' });
  }
  const run = await fetchJson(fetchImpl, `https://api.github.com/repos/${encodePath(repository)}/actions/runs/${completion.ci_run_id}`);
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

export async function reconcileRuntimeCompletions({ repository, env = {}, fetchImpl = fetch } = {}) {
  if (!repository) throw Object.assign(new Error('COMPLETION_JOB_REPOSITORY_REQUIRED'), { code: 'COMPLETION_JOB_REPOSITORY_REQUIRED' });
  const records = await fetchCompletionRecords(env, { fetchImpl });
  if (!records.length) return { ok: true, records: 0, completed: [], rejected: [] };

  const jobs = await repository.list();
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const completed = [];
  const rejected = [];

  for (const record of records) {
    const job = byId.get(record.job_id);
    if (!job) continue;
    if (String(job.status || '').toUpperCase() === 'COMPLETED' && job.result_json?.autonomy_completion?.candidate_sha === record.candidate_sha) continue;

    const teacher = job.result_json?.teacher_bridge;
    if (teacher?.status !== 'ANSWERED' || teacher?.review?.development_allowed !== true || teacher?.request?.request_id !== record.request_id) {
      rejected.push({ job_id: job.id, request_id: record.request_id, code: 'COMPLETION_TEACHER_APPROVAL_REQUIRED' });
      continue;
    }

    try {
      const ci = await verifyCompletionEvidence(record, env, { fetchImpl });
      const result = job.result_json && typeof job.result_json === 'object' ? { ...job.result_json } : {};
      result.autonomy_completion = {
        status: 'VERIFIED',
        request_id: record.request_id,
        candidate_sha: record.candidate_sha,
        candidate_branch: record.candidate_branch,
        summary: record.summary,
        tests: record.tests,
        ci,
        completed_at: new Date().toISOString(),
      };
      const updated = await repository.update(job.id, {
        status: 'COMPLETED',
        tests_json: record.tests,
        result_json: result,
        candidate_branch: record.candidate_branch,
      });
      completed.push({ job_id: updated.id, request_id: record.request_id, candidate_sha: record.candidate_sha, ci_run_id: record.ci_run_id });
    } catch (error) {
      rejected.push({ job_id: job.id, request_id: record.request_id, code: error?.code || 'COMPLETION_VERIFY_FAILED' });
    }
  }

  return { ok: true, records: records.length, completed, rejected };
}
