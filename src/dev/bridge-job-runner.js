const MAX_FILES = 10;
const MAX_TESTS = 4;
const MAX_DIFF = 20_000;

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
  const context = { owner: 'dev-bridge', requestId: id };
  const steps = [];
  await bridge.bus.execute('dev.create_candidate', { job_id: id }, context);
  steps.push({ capability: 'dev.create_candidate', passed: true });

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
        stdout: String(result?.stdout ?? result?.result?.stdout ?? '').slice(0, 8000),
        stderr: String(result?.stderr ?? result?.result?.stderr ?? '').slice(0, 8000),
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
  const actualDiff = diffText(diff);
  const failed = tests.filter((test) => !test.passed);
  const diffSummary = actualDiff.trim() ? actualDiff : 'NO_CHANGES';
  const result = {
    mode: 'STRUCTURED_MENTOR_WORK',
    bridge_pass: pass,
    applied_files: files.map((file) => file.path),
    steps,
    tests,
    diff_summary: diffSummary,
    changed: actualDiff.trim().length > 0,
    needs_repair: failed.length > 0,
    failed_tests: failed.map((test) => ({ name: test.name, command: test.command, exit_code: test.exit_code, error: test.error || '', stderr: String(test.stderr || '').slice(0, 4000) })),
    production_touched: false,
  };

  return {
    job_id: id,
    status: 'READY_FOR_REVIEW',
    candidate_branch: report?.branch || report?.result?.branch || null,
    tests_json: tests,
    diff_summary: diffSummary,
    needs_repair: failed.length > 0,
    result_json: result,
    plan_json: {
      mode: 'STRUCTURED_MENTOR_WORK',
      bridge_pass: pass,
      applied_files: files.map((file) => file.path),
      requested_tests: requestedTests(job).map((test) => test.command),
    },
  };
}

export { parseArray, structuredFiles, requestedTests, resultExitCode, diffText, bridgePass };
