#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

function argsMap(argv) {
  const out = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out.set(key, value);
  }
  return out;
}

async function main() {
  const args = argsMap(process.argv.slice(2));
  const dir = path.resolve(args.get('--dir') || '');
  const activateRaw = String(args.get('--activate') ?? 'true').trim().toLowerCase();
  const activate = !['false', '0', 'no', 'off'].includes(activateRaw);
  const allowNotActivatedRaw = String(args.get('--allow-not-activated') ?? 'false').trim().toLowerCase();
  const allowNotActivated = ['true', '1', 'yes', 'on'].includes(allowNotActivatedRaw);
  const baseUrl = String(args.get('--url') || process.env.MEL_BASE_URL || '').replace(/\/+$/, '');
  const password = String(process.env.MELITURGOS_PASSWORD || '').trim();
  if (!args.get('--dir') || !baseUrl) {
    throw new Error('USAGE: finalize-lora.mjs --dir <trained-adapter-dir> --url <MEL_BASE_URL>');
  }
  if (!password) throw new Error('MELITURGOS_PASSWORD_REQUIRED');

  const [plan, artifact, approval] = await Promise.all([
    readFile(path.join(dir, 'lora-plan.json'), 'utf8').then(JSON.parse),
    readFile(path.join(dir, 'artifact-evidence.json'), 'utf8').then(JSON.parse),
    readFile(path.join(dir, 'approval-evidence.json'), 'utf8').then(JSON.parse),
  ]);
  if (!artifact.finetune_id) throw new Error('LORA_FINETUNE_ID_REQUIRED_BEFORE_BENCHMARK');

  // The canonical LoRA benchmark can legitimately run for more than five
  // minutes. Node's built-in fetch/undici path can terminate a response that
  // has not produced headers within its transport timeout, so use curl here
  // with an explicit bounded 20-minute request window.
  const requestPath = path.join(dir, '.benchmark-request.json');
  await writeFile(requestPath, JSON.stringify({ plan, artifact, approval, activate }), 'utf8');
  let stdout;
  try {
    ({ stdout } = await execFileAsync('curl', [
      '--silent',
      '--show-error',
      '--max-time', '1200',
      '--connect-timeout', '30',
      '--request', 'POST',
      '--header', `Authorization: Bearer ${password}`,
      '--header', 'content-type: application/json',
      '--data-binary', `@${requestPath}`,
      '--write-out', '\\n__MEL_HTTP_STATUS__:%{http_code}',
      baseUrl + '/api/learning/lora/benchmark',
    ], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 1_230_000,
    }));
  } catch (error) {
    throw new Error(`LORA_BENCHMARK_TRANSPORT_FAILED: ${String(error?.message || error)}`);
  }

  const marker = '\n__MEL_HTTP_STATUS__:';
  const markerIndex = stdout.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error('LORA_BENCHMARK_HTTP_STATUS_MISSING');
  const rawBody = stdout.slice(0, markerIndex);
  const httpStatus = Number(stdout.slice(markerIndex + marker.length).trim());
  const responseOk = Number.isInteger(httpStatus) && httpStatus >= 200 && httpStatus < 300;
  let data = {};
  try { data = JSON.parse(rawBody || '{}'); } catch {}

  const evidencePath = path.join(dir, 'benchmark-evidence.json');
  await writeFile(evidencePath, JSON.stringify({
    schema: 'mel.lora-canonical-benchmark-evidence.v1',
    measured_at: new Date().toISOString(),
    http_status: httpStatus,
    response_ok: responseOk,
    data,
  }, null, 2) + '\n', 'utf8');
  if (!responseOk || data?.ok === false) {
    throw new Error(data?.detail || data?.error || `HTTP_${httpStatus}`);
  }

  const summary = {
    status: data.activated ? 'ACTIVE' : 'BENCHMARKED_NOT_ACTIVATED',
    plan_id: data.plan_id || plan.id,
    finetune_id: artifact.finetune_id,
    approval_id: approval.approval_id || null,
    activation_requested: activate,
    baseline: data?.baseline?.overall ?? null,
    candidate: data?.candidate?.overall ?? null,
    gain: data?.decision?.overall_gain ?? data?.decision?.exact_evidence?.measured_gain ?? null,
    decision: data?.decision?.reason || null,
    activated: data.activated === true,
    next_stage: data?.next_stage || data?.impact?.comparison?.next_stage || null,
    impact_gate_passed: data?.impact_gate_passed === true,
    canonical_gate_passed: data?.canonical_gate_passed === true,
    activation_blocker: data?.activation_blocker || null,
    impact: data?.impact?.comparison || null,
    benchmark_evidence_file: evidencePath,
    baseline_case_errors: Array.isArray(data?.baseline?.cases)
      ? data.baseline.cases.filter((row) => row?.error).map((row) => ({ id: row.id, error: row.error }))
      : [],
    candidate_case_errors: Array.isArray(data?.candidate?.cases)
      ? data.candidate.cases.filter((row) => row?.error).map((row) => ({ id: row.id, error: row.error }))
      : [],
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  if (!summary.activated && !allowNotActivated) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
