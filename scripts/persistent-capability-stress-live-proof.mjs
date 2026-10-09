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
  const done = Number(r?.progress?.done || 0);
  const total = Number(r?.progress?.total || 0);
  assert(total > 0 && done === total, 'CAPABILITY_STRESS_PROGRESS_INCOMPLETE');
  assert(r?.report?.persistent === true && String(r?.report?.job_id || '') === String(r?.job_id || ''), 'CAPABILITY_STRESS_REPORT_NOT_DURABLE');
  return r;
}

async function callCapability(payload, outputPath) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(BASE_URL + '/api/gen2/capabilities/execute', {
      method: 'POST',
      headers: {
        'x-mel-release-smoke': '1',
        'x-mel-launch-bootstrap': TOKEN,
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

  let start = null;
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    const result = await callCapability({ id: 'capability.audit', input: { deep: true } }, 'stress-start.json');
    if (result.status === 200) {
      start = validateStart(result.body);
      break;
    }
    console.log(`Persistent stress auth/propagation attempt ${attempt}/15 returned HTTP ${result.status}.`);
    await sleep(2000);
  }
  assert(start, 'CAPABILITY_STRESS_START_TIMEOUT');
  const jobId = String(start.job_id);
  console.log(`Persistent stress started: ${jobId}`);

  let terminalBody = null;
  let lastDone = 0;
  for (let attempt = 1; attempt <= 240; attempt += 1) {
    const result = await callCapability({ id: 'capability.audit.status', input: { job_id: jobId } }, 'stress-status.json');
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
    assert(done >= lastDone, 'CAPABILITY_STRESS_PROGRESS_REGRESSED');
    lastDone = done;
    const status = String(r?.status || '');
    console.log(`Persistent stress ${jobId}: status=${status} progress=${done}/${total} current=${String(r?.progress?.current_capability||"none").slice(0,160)} pass=${Number(r?.progress?.pass||1)}`);
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
      if (resume.status !== 200) {
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
