#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CANONICAL_LORA_DATASET_VERSION,
  CANONICAL_LORA_LESSON_COUNT,
  canonicalLoraRows,
} from '../src/learning/lora-canonical-dataset.js';

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
  const output = args.get('--output');
  if (!output) throw new Error('USAGE: export-canonical-lora-dataset.mjs --output <dataset.jsonl>');
  const rows = canonicalLoraRows();
  if (rows.length < CANONICAL_LORA_LESSON_COUNT) throw new Error('CANONICAL_LORA_EXPORT_COUNT_BELOW_MINIMUM');
  const target = path.resolve(output);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  process.stdout.write(JSON.stringify({
    status: 'CANONICAL_LORA_DATASET_READY',
    dataset_version: CANONICAL_LORA_DATASET_VERSION,
    examples: rows.length,
    first_lesson: rows[0]?.lesson_id || null,
    last_lesson: rows.at(-1)?.lesson_id || null,
    output: target,
  }, null, 2) + '\n');
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
