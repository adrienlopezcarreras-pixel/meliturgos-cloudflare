#!/usr/bin/env node
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createLoraTrainingPlan } from '../src/learning/lora-plan.js';

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

function numberArg(args, key, fallback) {
  const raw = args.get(key);
  if (raw == null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`INVALID_NUMERIC_ARG:${key}`);
  return value;
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return `sha256:${hash.digest('hex')}`;
}

async function countJsonl(path) {
  let count = 0;
  const input = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) count += 1;
  }
  return count;
}

async function main() {
  const args = argsMap(process.argv.slice(2));
  const dataset = args.get('--dataset');
  const output = args.get('--output');
  if (!dataset || !output) {
    throw new Error('USAGE: create-lora-plan.mjs --dataset <jsonl> --output <plan.json> [--epochs 1]');
  }
  const info = await stat(dataset);
  if (!info.isFile() || info.size <= 0) throw new Error('LORA_DATASET_NOT_FOUND');

  const [datasetDigest, examples] = await Promise.all([sha256File(dataset), countJsonl(dataset)]);
  const plan = createLoraTrainingPlan({
    id: args.get('--id') || `mel-lora-${Date.now()}`,
    dataset_digest: datasetDigest,
    examples,
    rank: numberArg(args, '--rank', 8),
    alpha: numberArg(args, '--alpha', 16),
    dropout: numberArg(args, '--dropout', 0.05),
    learning_rate: numberArg(args, '--learning-rate', 2e-4),
    epochs: numberArg(args, '--epochs', 2),
    seed: numberArg(args, '--seed', 42),
    quantization: 'none',
    status: 'READY_FOR_TRAINING',
  });

  await new Promise((resolve, reject) => {
    const stream = createWriteStream(output, { encoding: 'utf8' });
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(JSON.stringify(plan, null, 2) + '\n');
  });

  process.stdout.write(JSON.stringify({
    status: 'READY_FOR_TRAINING',
    plan_id: plan.id,
    examples: plan.examples,
    dataset_digest: plan.dataset_digest,
    training_manifest_digest: plan.training_manifest_digest,
    output,
  }, null, 2) + '\n');
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
