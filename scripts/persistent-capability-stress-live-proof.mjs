import fs from 'node:fs/promises';

const BASE_URL = String(process.env.MEL_PROOF_BASE_URL || 'https://meliturgos.adrien-lopezcarreras.workers.dev').replace(/\/$/, '');
const TOKEN = String(process.env.MEL_PROOF_TOKEN || '');
const EXPECTED_SHA = String(process.env.EXPECTED_SHA || '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

export function validateStart(body) {
  const r = body?.result || {};
  assert(body?.ok === true && body?.capability === 'capability.audit', 'CAPABILITY_STRESS_START_NOT_OK');
  assert(r?.persistent === true, 'CAPABILITY_STRESS_NOT_PERSISTENT');
  assert(/^cap-stress-/.test(String(r?.job_id || '')), 'CAPABILITY_STRESS_JOB_ID_MISSING');
  assert(['RUNNING', 'QUEUED', 'RETRYING'].includes(String(r?.status || '')), 'CAPABILITY_STRESS_NOT_ASYNC');
  return r;
}

export function validateTerminal(body, jobId) {
  const r = body?.result || {};
  assert(body?.ok === true && body?.capability === 'capability.audit.status', 'CAPABILITY_STRESS_STATUS_NOT_OK');
  assert(r?.persistent === true && String(r?.job_id || '') === String(jobId || ''), 'CAPABILITY_STRESS_JOB_MISMATCH');
  const status = String(r?.status || '');
  assert(status !== 'FAILED', 'CAPABILITY_STRESS_JOB_FAILED:' + String(r?.error || 'UNKNOWN'));
  assert(['COMPLETE', 'COMPLETE_WITH_FAILURES'].includes(status), 'CAPABILITY_STRESS_NOT_TERMINAL');
  // GitHub Actions must not be green merely because a durable report was
  // written. An internally failed stress is NOT a successful production proof.
  // Approval-/cost-blocked actions are not runtime failures.
  const failures = Array.isArray(r?.summary?.remaining_runtime_failures)
    ? r.summary.remaining_runtime_failures
    : [];
  assert(status === 'COMPLETE' && failures.length === 0,
    'CAPABILITY_STRESS_RUNTIME_FAILURES:' + failures.map(String).join(',').slice(0, 350));
  const done = Number(r?.progress?.done || 0);
  const total = Number(r?.progress?.total || 0);
  assert(total > 0 && done === total, 'CAPABILITY_STRESS_PROGRESS_INCOMPLETE');
  assert(r?.report?.persistent === true && String(r?.report?.job_id || '') === String(r?.job_id || ''), 'CAPABILITY_STRESS_REPORT_NOT_DURABLE');
  return r;
}

// Audit completion proves that every registry contract was inspected; it
// does NOT mean that every capability was safely executed against production.
// Keep these two truths distinct in the immutable proof artifact.
export function summarizeStressCoverage(result) {
  const total = Number(result?.progress?.total);
  const counts = result?.report?.counts;
  const contracts = result?.report?.contracts;
  assert(Number.isSafeInteger(total) && total > 0, 'CAPABILITY_COVERAGE_TOTAL_INVALID');
  assert(counts && typeof counts === 'object' && !Array.isArray(counts), 'CAPABILITY_COVERAGE_COUNTS_MISSING');
  const entries = Object.entries(counts);
  assert(entries.length > 0 && entries.every(([key,value]) =>
    key.length > 0 && Number.isSafeInteger(value) && value >= 0
  ), 'CAPABILITY_COVERAGE_COUNTS_INVALID');
  const counted = entries.reduce((sum, [, count]) => sum + count, 0);
  assert(counted === total, 'CAPABILITY_COVERAGE_COUNTS_INCONSISTENT');
  const executed = Number(counts.EXISTANT_ET_TESTE || 0);
  const contractInspected = Number(contracts?.inspected);
  const contractValid = Number(contracts?.valid);
  const contractInvalid = Number(contracts?.invalid);
  assert([contractInspected,contractValid,contractInvalid].every(
    n => Number.isSafeInteger(n) && n >= 0
  ), 'CAPABILITY_COVERAGE_CONTRACTS_INVALID');
  assert(contractInspected === total && contractValid + contractInvalid === total
    && contractInvalid === 0, 'CAPABILITY_COVERAGE_CONTRACTS_NOT_ALL_VALID');
  const pending = total - executed;
  // The persisted full report may provide per-capability execution blockers.
  // Export ONLY sanitized aggregate reason codes, never IDs, inputs, results,
  // provider messages, stack traces or user content.
  const rows = result?.report?.capabilities;
  let reasonCounts = null;
  if (Array.isArray(rows) && rows.length === total) {
    const buckets = Object.create(null);
    let inspectedRuntimeCount = 0;
    for (const row of rows) {
      if (row?.truth_status === 'EXISTANT_ET_TESTE') {
        inspectedRuntimeCount += 1;
        continue;
      }
      const raw = String(row?.auto_execution_blocked || '');
      const coarse = raw.split(':')[0];
      const safeReasons = new Set([
        'RISK_NOT_LOW', 'OWNER_APPROVAL_REQUIRED',
        'UNKNOWN_OR_EXTERNAL_COST', 'NO_BOUNDED_SAMPLE', 'NO_RUNTIME_FIXTURE',
        'DISABLED', 'DECLARED_NON_EXECUTABLE', 'HEALTH_UNAVAILABLE',
        'HEALTH_REFRESH_UNVERIFIED', 'SAMPLE_PREPARATION_FAILED',
      ]);
      const reason = safeReasons.has(coarse) ? coarse : 'UNVERIFIED_REASON_UNSPECIFIED';
      buckets[reason] = (buckets[reason] || 0) + 1;
    }
    assert(inspectedRuntimeCount === executed,
      'CAPABILITY_COVERAGE_EXECUTION_COUNT_MISMATCH');
    assert(Object.values(buckets).reduce((sum, count) => sum + count, 0) === pending,
      'CAPABILITY_COVERAGE_REASON_COUNTS_MISMATCH');
    reasonCounts = Object.fromEntries(Object.entries(buckets).sort(([a],[b]) => a.localeCompare(b)));
  }
  return {
    schema: 'mel.capability-runtime-coverage/v1',
    contract_validation_complete: true,
    inspected_contracts: contractInspected,
    valid_contracts: contractValid,
    runtime_tested: executed,
    runtime_unverified: pending,
    reason_breakdown_available: reasonCounts !== null,
    runtime_unverified_reasons: reasonCounts,
    runtime_coverage_percent: Number((100 * executed / total).toFixed(2)),
    runtime_validation_complete: pending === 0,
    evidence_scope: pending === 0 ? 'ALL_RUNTIME_SAMPLES_EXECUTED' : 'PARTIAL_SAFE_RUNTIME_EXECUTION',
    note: 'Audit completed and contracts validated; unexecuted or blocked capabilities remain unverified.',
  };
}

export function validateProgressTransition(previous = { pass: 1, done: 0 }, current = { pass: 1, done: 0 }) {
  const previousPass = Number(previous?.pass ?? 1);
  const currentPass = Number(current?.pass ?? 1);
  const previousDone = Number(previous?.done ?? 0);
  const currentDone = Number(current?.done ?? 0);
  assert([previousPass, currentPass].every(n => Number.isSafeInteger(n) && n >= 1),
    'CAPABILITY_STRESS_PASS_INVALID');
  assert([previousDone, currentDone].every(n => Number.isSafeInteger(n) && n >= 0),
    'CAPABILITY_STRESS_DONE_INVALID');
  assert(currentPass >= previousPass, 'CAPABILITY_STRESS_PASS_REGRESSED');
  if (currentPass === previousPass) {
    assert(currentDone >= previousDone, 'CAPABILITY_STRESS_PROGRESS_REGRESSED');
  }
  return { pass: currentPass, done: currentDone };
}

async function callCapability(payload, outputPath) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(BASE_URL + '/api/gen2/capabilities/execute', {
      method: 'POST',
      headers: {
        'x-mel-release-smoke': '1',
        'x-mel-parallel-proof': TOKEN,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    await fs.writeFile(outputPath, text || '{}', 'utf8');
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch {}
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  assert(TOKEN.length >= 32, 'CAPABILITY_STRESS_PROOF_TOKEN_REQUIRED');
  assert(/^[a-f0-9]{40}$/i.test(EXPECTED_SHA), 'CAPABILITY_STRESS_EXACT_SHA_REQUIRED');

  let start = null;
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    const result = await callCapability({ id: 'capability.audit', input: { deep: true } }, 'stress-start.json');
    if (result.status === 200) {
      start = validateStart(result.body);
      break;
    }
    if (result.status === 401 || result.status === 403) {
      throw Object.assign(new Error('CAPABILITY_STRESS_AUTH_REJECTED'), { code: 'CAPABILITY_STRESS_AUTH_REJECTED' });
    }
    console.log(`Persistent stress bounded start attempt ${attempt}/15 returned HTTP ${result.status}.`);
    await sleep(2000);
  }
  assert(start, 'CAPABILITY_STRESS_START_TIMEOUT');
  const jobId = String(start.job_id);
  console.log(`Persistent stress started: ${jobId}`);

  let terminalBody = null;
  let lastDone = 0;
  let lastPass = 1;
  for (let attempt = 1; attempt <= 240; attempt += 1) {
    const result = await callCapability({ id: 'capability.audit.status', input: { job_id: jobId } }, 'stress-status.json');
    if (result.status === 401 || result.status === 403) {
      throw Object.assign(new Error('CAPABILITY_STRESS_STATUS_AUTH_REJECTED'), { code: 'CAPABILITY_STRESS_STATUS_AUTH_REJECTED' });
    }
    if (result.status !== 200) {
      console.log(`Stress status attempt ${attempt}/240 returned HTTP ${result.status}.`);
      await sleep(2000);
      continue;
    }
    const r = result.body?.result || {};
    assert(result.body?.ok === true && result.body?.capability === 'capability.audit.status', 'CAPABILITY_STRESS_STATUS_NOT_OK');
    assert(r?.persistent === true && String(r?.job_id || '') === jobId, 'CAPABILITY_STRESS_JOB_MISMATCH');
    const done = Number(r?.progress?.done || 0);
    const total = Number(r?.progress?.total || 0);
    const progressState = validateProgressTransition(
      { pass: lastPass, done: lastDone },
      { pass: r?.progress?.pass, done },
    );
    const pass = progressState.pass;
    lastPass = progressState.pass;
    lastDone = progressState.done;
    const status = String(r?.status || '');
    console.log(`Persistent stress ${jobId}: status=${status} progress=${done}/${total} current=${String(r?.progress?.current_capability||"none").slice(0,160)} pass=${pass}`);
    if (['COMPLETE', 'COMPLETE_WITH_FAILURES', 'FAILED'].includes(status)) {
      terminalBody = result.body;
      break;
    }

    // A completed chunk is persisted as QUEUED. Re-enter capability.audit to
    // claim the next bounded chunk. A periodic re-entry also lets a stale
    // RUNNING lease recover after a Worker background task disappears.
    if (status === 'QUEUED' || (status === 'RUNNING' && attempt % 5 === 0) || status === 'RETRYING') {
      const resume = await callCapability(
        { id: 'capability.audit', input: { deep: true } },
        'stress-resume.json'
      );
      if (resume.status === 401 || resume.status === 403) {
        throw Object.assign(new Error('CAPABILITY_STRESS_RESUME_AUTH_REJECTED'),
          { code: 'CAPABILITY_STRESS_RESUME_AUTH_REJECTED' });
      }
      if (resume.status === 200) {
        const resumed = resume.body?.result || {};
        assert(resume.body?.ok === true && resume.body?.capability === 'capability.audit',
          'CAPABILITY_STRESS_RESUME_NOT_OK');
        assert(resumed?.persistent === true, 'CAPABILITY_STRESS_RESUME_NOT_PERSISTENT');
        assert(/^cap-stress-[a-zA-Z0-9-]+$/.test(String(resumed?.job_id || '')),
          'CAPABILITY_STRESS_RESUME_JOB_ID_INVALID');
        if (String(resumed?.job_id || '') !== jobId) {
          // The generic start endpoint may return another active audit after the
          // tracked audit transitions to terminal. Do not credit that other job:
          // keep polling the original job_id, whose terminal proof is mandatory.
          console.warn('CAPABILITY_STRESS_RESUME_OTHER_JOB: continue exact job polling');
        } else {
          assert(['RUNNING', 'QUEUED', 'RETRYING'].includes(String(resumed?.status || '')),
            'CAPABILITY_STRESS_RESUME_STATUS_INVALID');
        }
      } else {
        console.log(`Persistent stress resume attempt returned HTTP ${resume.status}.`);
      }
    }
    await sleep(2000);
  }

  assert(terminalBody, 'CAPABILITY_STRESS_TERMINAL_TIMEOUT');
  const r = validateTerminal(terminalBody, jobId);
  const proof = {
    schema: 'mel.persistent-capability-stress-live-proof/v1',
    deployed_sha: EXPECTED_SHA || null,
    job_id: r.job_id,
    status: r.status,
    progress: r.progress,
    counts: r?.report?.counts || {},
    contracts: r?.report?.contracts || {},
    coverage: summarizeStressCoverage(r),
    retry_pass: r?.report?.retry_pass === true,
    remaining_runtime_failures: Array.isArray(r?.summary?.remaining_runtime_failures)
      ? r.summary.remaining_runtime_failures.slice(0, 100)
      : [],
    blocked_count: Number(r?.summary?.blocked_count || 0),
    completed_at: r.completed_at || r?.report?.completed_at || null,
    persistent: true,
    secret_values_exposed: false,
  };
  await fs.writeFile('persistent-capability-stress-live-proof.json', JSON.stringify(proof, null, 2), 'utf8');
  console.log(JSON.stringify(proof, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(String(error?.code || error?.message || error));
    process.exit(1);
  });
}
