#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const finite = value => typeof value === 'number' && Number.isFinite(value);

// Completed HTTP calls do not imply that a LoRA adapter passed its gates.
export function assessLoraBenchmarkReadiness(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, code: 'LORA_BENCHMARK_RESULT_INVALID' };
  }
  const { baseline, candidate } = value;
  if (!finite(baseline) || !finite(candidate) ||
      !Array.isArray(value.baseline_case_errors) ||
      !Array.isArray(value.candidate_case_errors)) {
    return { ok: false, code: 'LORA_BENCHMARK_EVIDENCE_INCOMPLETE' };
  }
  const case_error_counts = {
    baseline: value.baseline_case_errors.length,
    candidate: value.candidate_case_errors.length,
  };
  const common = { baseline, candidate, case_error_counts };
  if (case_error_counts.baseline || case_error_counts.candidate) {
    return { ...common, ok: false, code: 'LORA_BENCHMARK_CASE_ERRORS' };
  }
  if (value.canonical_gate_passed !== true || value.impact_gate_passed !== true ||
      candidate < baseline) {
    return { ...common, ok: false, code: 'LORA_BENCHMARK_QUALITY_GATES_FAILED' };
  }
  if (value.activation_requested === true && value.activated !== true) {
    return { ...common, ok: false, code: 'LORA_ACTIVATION_NOT_VERIFIED' };
  }
  if (value.activation_requested !== true && value.activated === true) {
    return { ...common, ok: false, code: 'LORA_UNREQUESTED_ACTIVATION' };
  }
  return { ...common, ok: true, code: value.activated === true
    ? 'LORA_ACTIVATED_VERIFIED' : 'LORA_BENCHMARK_PASSED_NOT_ACTIVATED' };
}

export async function runCli(filename) {
  if (!filename) throw new Error('LORA_BENCHMARK_RESULT_FILE_REQUIRED');
  const data = JSON.parse(await readFile(filename, 'utf8'));
  const result = assessLoraBenchmarkReadiness(data);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv[2]).catch(() => {
    // Do not print raw benchmark JSON, which can contain private responses.
    console.error('LORA_BENCHMARK_EVIDENCE_READ_FAILED');
    process.exitCode = 1;
  });
}
