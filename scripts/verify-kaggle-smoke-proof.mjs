#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function fail(code) { throw new Error(code); }
function fileNamed(root, name) {
  const found = [];
  function walk(dir, depth) {
    if (depth > 7) fail('KAGGLE_SMOKE_OUTPUT_DEPTH_EXCEEDED');
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile() && entry.name === name) found.push(path);
    }
  }
  walk(root, 0);
  if (found.length !== 1) fail('KAGGLE_SMOKE_PROOF_FILE_MISSING_OR_DUPLICATE:' + name);
  if (statSync(found[0]).size < 1) fail('KAGGLE_SMOKE_PROOF_FILE_EMPTY:' + name);
  return found[0];
}

export function verifyKaggleSmoke({ proof, evidence, started, progress, expectedSha, expectedCycle, evidenceDigest, progressDigest }) {
  const sha = String(expectedSha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha) || !Number.isInteger(expectedCycle) || expectedCycle < 0)
    fail('KAGGLE_SMOKE_EXPECTED_IDENTITY_INVALID');
  if (proof?.schema !== 'mel.kaggle-real-smoke-proof/v1'
      || proof?.status !== 'KAGGLE_SINGLE_STEP_SMOKE_PASSED')
    fail('KAGGLE_SMOKE_GENUINE_PROOF_MISSING');
  if (String(proof.source_sha || '').toLowerCase() !== sha || Number(proof.cycle) !== expectedCycle)
    fail('KAGGLE_SMOKE_EXACT_SOURCE_MISMATCH');
  if (Number(proof.global_step) !== 1 || Number(evidence?.training_metrics?.global_step) !== 1
      || Number(started?.max_steps) !== 1)
    fail('KAGGLE_SMOKE_OPTIMIZER_STEP_NOT_PROVEN');
  if (started?.cuda_available !== true || typeof started?.gpu !== 'string' || !started.gpu
      || proof?.cuda_available !== true || String(proof.gpu) !== started.gpu)
    fail('KAGGLE_SMOKE_REAL_GPU_NOT_PROVEN');
  if (!Array.isArray(progress) || !progress.some(row => row?.event === 'STEP' && Number(row.global_step) === 1)
      || !Array.isArray(proof.optimizer_step_events) || !proof.optimizer_step_events.includes(1))
    fail('KAGGLE_SMOKE_STEP_EVENT_NOT_PROVEN');
  if (String(proof.training_evidence_sha256 || '') !== evidenceDigest
      || String(proof.training_progress_sha256 || '') !== progressDigest)
    fail('KAGGLE_SMOKE_ARTIFACT_HASH_MISMATCH');
  if (proof.adapter_activated !== false || proof.benchmark_verified !== false)
    fail('KAGGLE_SMOKE_UNVERIFIED_PROMOTION_CLAIM');
  return {
    schema:'mel.kaggle-smoke-validation/v1',
    status:'SMOKE_STEP_VERIFIED',
    source_sha:sha,
    cycle:expectedCycle,
    global_step:1,
    gpu:started.gpu,
    train_loss: evidence?.training_metrics?.train_loss ?? null,
    training_evidence_sha256:evidenceDigest,
    training_progress_sha256:progressDigest,
    benchmark_verified:false,
    adapter_validated:false,
    adapter_activated:false,
    secret_values_exposed:false,
  };
}

export function verifyKaggleSmokeFiles({ inputDir, expectedSha, expectedCycle }) {
  const root = resolve(inputDir);
  const jsonFile = name => {
    const data = readFileSync(fileNamed(root, name));
    return { data, parsed: JSON.parse(data.toString('utf8')) };
  };
  const proof = jsonFile('kaggle-smoke-proof.json').parsed;
  const evidence = jsonFile('training-evidence.json');
  const started = jsonFile('training-started.json').parsed;
  const progress = readFileSync(fileNamed(root, 'training-progress.jsonl'));
  const rows = progress.toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const digest = b => 'sha256:' + createHash('sha256').update(b).digest('hex');
  return verifyKaggleSmoke({
    proof,evidence:evidence.parsed,started,progress:rows,expectedSha,expectedCycle,
    evidenceDigest:digest(evidence.data),
    progressDigest:digest(progress),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [inputDir,expectedSha,cycleText,outputPath] = process.argv.slice(2);
    const result=verifyKaggleSmokeFiles({inputDir,expectedSha,expectedCycle:Number(cycleText)});
    if (outputPath) writeFileSync(outputPath, JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode=1;
  }
}
