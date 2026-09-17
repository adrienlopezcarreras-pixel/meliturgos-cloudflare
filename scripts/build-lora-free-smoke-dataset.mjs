#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { BOOTSTRAP_CORRECTIONS } from '../src/learning/bootstrap-corrections.js';

const output = process.argv[2] || 'artifacts/lora-free-smoke/dataset.jsonl';
const rows = [];
for (let i = 0; i < 50; i += 1) {
  const row = BOOTSTRAP_CORRECTIONS[i % BOOTSTRAP_CORRECTIONS.length];
  rows.push({
    messages: [
      { role: 'system', content: 'Tu es MEL. Applique précisément les corrections validées.' },
      { role: 'user', content: `[validation-smoke-${i + 1}] ${String(row.input || row.task || '').slice(0, 800)}` },
      { role: 'assistant', content: String(row.after || '').slice(0, 1200) },
    ],
    source: 'mel-bootstrap-validated',
    source_id: row.id,
  });
}
await writeFile(output, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
console.log(JSON.stringify({ output, examples: rows.length, unique_source_lessons: new Set(rows.map(r => r.source_id)).size }));
