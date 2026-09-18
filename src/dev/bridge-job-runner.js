const MAX_FILES = 10;
const MAX_TESTS = 4;
const MAX_DIFF = 20_000;
const MAX_TEST_OUTPUT = 20_000;
const SHA40 = /^[0-9a-f]{40}$/i;

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function structuredFiles(job) {
  return parseArray(job?.files_json)
    .filter((file) => file && typeof file.path === 'string' && typeof file.content === 'string')
    .slice(0, MAX_FILES);
}

function requestedTests(job) {
  return parseArray(job?.tests_json)
    .filter((test) => test && typeof test.command === 'string' && test.command.trim())
    .slice(0, MAX_TESTS);
}

function resultExitCode(result) {
  const direct = Number(result?.exit_code);
  if (Number.isFinite(direct)) return direct;
  const nested = Number(result?.result?.exit_code);
  return Number.isFinite(nested) ? nested : 1;
}

function diffText(diff) {
  return String(diff?.result?.stdout ?? diff?.stdout ?? '').slice(0, MAX_DIFF);
}

function bridgePass(job) {
  return String(job?.patch_json?.mode || '').toLowerCase() === 'repair' ? 'repair' : 'implement';
}

function expectedCandidateBase(job) {
  const preparation = job?.result_json?.bridge_preparation;
  const branch = String(preparation?.candidate_branch || '').trim();
  const sha = String(preparation?.candidate_sha || '').trim().toLowerCase();
  if (!branch.startsWith('candidate/') || !SHA40.test(sha)) {
    throw Object.assign(new Error('BRIDGE_PREPARATION_BASE_REQUIRED'), { code: 'BRIDGE_PREPARATION_BASE_REQUIRED' });
  }
  return { branch, sha };
}

function reportValue(value) {
  return value?.result && typeof value.result === 'object' ? value.result : value;
}

function assertCandidateBase(report, expected) {
  const row = reportValue(report) || {};
  const branch = String(row.base_branch || row.base || '').trim();
  const sha = String(row.base_sha || '').trim().toLowerCase();
  if (branch !== expected.branch || sha !== expected.sha) {
    throw Object.assign(new Error('LOCAL_CANDIDATE_BASE_STALE'), {
      code: 'LOCAL_CANDIDATE_BASE_STALE',
      expected_branch: expected.branch,
      observed_branch: branch || null,
      expected_sha: expected.sha,
      observed_sha: sha || null,
    });
  }
  return row;
}

async function prepareCandidate(bridge, id, pass, context, steps, expected) {
  if (pass === 'repair') {
    try {
      await bridge.bus.execute('code.status', { job_id: id }, context);
      const existingReport = await bridge.bus.execute('dev.report', { job_id: id }, context);
      assertCandidateBase(existingReport, expected);
      steps.push({ capability: 'dev.resume_candidate', passed: true, base_branch: expected.branch, base_sha: expected.sha });
      return true;
    } catch {
      // Missing or stale local state is discarded. A fresh isolated candidate
      // may only be recreated if the local repository itself matches the exact
      // approved canonical candidate branch and SHA.
    }
  }
  await bridge.bus.execute('dev.create_candidate', {
    job_id: id,
    expected_branch: expected.branch,
    expected_sha: expected.sha,
  }, context);
  const createdReport = await bridge.bus.execute('dev.report', { job_id: id }, context);
  assertCandidateBase(createdReport, expected);
  steps.push({ capability: 'dev.create_candidate', passed: true, base_branch: expected.branch, base_sha: expected.sha });
  return false;
}

/**
 * Runs an already-approved structured work package in an isolated local
 * candidate. No commit or production deployment occurs here. The returned
 * payload is designed for /api/dev-bridge/result and contains evidence that
 * can drive a later repair pass when tests fail.
 */
export async function runStructuredBridgeJob({ bridge, job } = {}) {
  if (!bridge?.bus || !job) throw Object.assign(new Error('BRIDGE_RUNNER_INPUT_REQUIRED'), { code: 'BRIDGE_RUNNER_INPUT_REQUIRED' });
  const id = String(job.job_id || job.id || '');
  if (!id) throw Object.assign(new Error('BRIDGE_JOB_ID_REQUIRED'), { code: 'BRIDGE_JOB_ID_REQUIRED' });
  const files = structuredFiles(job);
  if (!files.length) return null;

  const pass = bridgePass(job);
  const expected = expectedCandidateBase(job);
  const context = { owner: 'dev-bridge', requestId: id };
  const steps = [];
  const candidateReused = await prepareCandidate(bridge, id, pass, context, steps, expected);

  for (const file of files) {
    let before = null;
    try {
      const read = await bridge.bus.execute('code.read', { path: file.path, job_id: id }, context);
      before = { path: file.path, chars: String(read?.content || '').length };
    } catch {
      before = { path: file.path, chars: 0, new_file: true };
    }
    const applied = await bridge.bus.execute('dev.apply_change', {
      job_id: id,
      path: file.path,
      content: file.content,
    }, context);
    steps.push({ capability: 'dev.apply_change', path: file.path, before, applied: Boolean(applied) });
  }

  const tests = [];
  for (const spec of requestedTests(job)) {
    try {
      const result = await bridge.bus.execute('dev.test', { job_id: id, command: spec.command }, context);
      const exitCode = resultExitCode(result);
      tests.push({
        name: String(spec.name || spec.command).slice(0, 200),
        command: String(spec.command).slice(0, 100),
        passed: exitCode === 0,
        exit_code: exitCode,
        stdout: String(result?.stdout ?? result?.result?.stdout ?? '').slice(0, MAX_TEST_OUTPUT),
        stderr: String(result?.stderr ?? result?.result?.stderr ?? '').slice(0, MAX_TEST_OUTPUT),
      });
    } catch (error) {
      tests.push({
        name: String(spec.name || spec.command).slice(0, 200),
        command: String(spec.command).slice(0, 100),
        passed: false,
        exit_code: 1,
        error: String(error?.code || error?.message || 'TEST_EXECUTION_FAILED').slice(0, 300),
      });
    }
  }

  const diff = await bridge.bus.execute('code.diff', { job_id: id }, context);
  const report = await bridge.bus.execute('dev.report', { job_id: id }, context);
  const localReport = assertCandidateBase(report, expected);
  const actualDiff = diffText(diff);
  const failed = tests.filter((test) => !test.passed);
  const diffSummary = actualDiff.trim() ? actualDiff : 'NO_CHANGES';
  const result = {
    mode: 'STRUCTURED_MENTOR_WORK',
    bridge_pass: pass,
    candidate_reused: candidateReused,
    applied_files: files.map((file) => file.path),
    steps,
    tests,
    diff_summary: diffSummary,
    changed: actualDiff.trim().length > 0,
    needs_repair: failed.length > 0,
    failed_tests: failed.map((test) => ({
      name: test.name,
      command: test.command,
      exit_code: test.exit_code,
      error: test.error || '',
      stdout: String(test.stdout || '').slice(0, MAX_TEST_OUTPUT),
      stderr: String(test.stderr || '').slice(0, MAX_TEST_OUTPUT),
    })),
    production_touched: false,
    approved_base: { candidate_branch: expected.branch, candidate_sha: expected.sha },
    local_candidate_branch: localReport.branch || null,
  };

  return {
    job_id: id,
    status: 'READY_FOR_REVIEW',
    candidate_branch: expected.branch,
    tests_json: tests,
    diff_summary: diffSummary,
    needs_repair: failed.length > 0,
    result_json: result,
    plan_json: {
      mode: 'STRUCTURED_MENTOR_WORK',
      bridge_pass: pass,
      candidate_reused: candidateReused,
      applied_files: files.map((file) => file.path),
      requested_tests: requestedTests(job).map((test) => test.command),
    },
  };
}

export { parseArray, structuredFiles, requestedTests, resultExitCode, diffText, bridgePass, expectedCandidateBase, assertCandidateBase, prepareCandidate };
