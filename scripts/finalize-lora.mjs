#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
  const baseUrl = String(args.get('--url') || process.env.MEL_BASE_URL || '').replace(/\/+$/, '');
  const password = String(process.env.MELITURGOS_PASSWORD || '').trim();
  if (!args.get('--dir') || !baseUrl) {
    throw new Error('USAGE: finalize-lora.mjs --dir <trained-adapter-dir> --url <MEL_BASE_URL>');
  }
  if (!password) throw new Error('MELITURGOS_PASSWORD_REQUIRED');

  const [plan, artifact] = await Promise.all([
    readFile(path.join(dir, 'lora-plan.json'), 'utf8').then(JSON.parse),
    readFile(path.join(dir, 'artifact-evidence.json'), 'utf8').then(JSON.parse),
  ]);
  if (!artifact.finetune_id) throw new Error('LORA_FINETUNE_ID_REQUIRED_BEFORE_BENCHMARK');

  const response = await fetch(baseUrl + '/api/learning/lora/benchmark', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${password}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ plan, artifact, activate: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.detail || data?.error || `HTTP_${response.status}`);
  }

  const summary = {
    status: data.activated ? 'ACTIVE' : 'BENCHMARKED_NOT_ACTIVATED',
    plan_id: data.plan_id || plan.id,
    finetune_id: artifact.finetune_id,
    baseline: data?.baseline?.overall ?? null,
    candidate: data?.candidate?.overall ?? null,
    gain: data?.decision?.overall_gain ?? data?.decision?.exact_evidence?.measured_gain ?? null,
    decision: data?.decision?.reason || null,
    activated: data.activated === true,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  if (!summary.activated) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
