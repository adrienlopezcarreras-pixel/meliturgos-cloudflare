import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  completionMatrixToJson,
  completionMatrixToMarkdown,
  generateCompletionMatrix,
} from '../src/roadmap/completion-matrix.js';

function parseArgs(argv) {
  const options = { format: 'markdown', output: null, timestamp: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.format = 'json';
    else if (arg === '--markdown' || arg === '--md') options.format = 'markdown';
    else if (arg === '--timestamp') options.timestamp = true;
    else if (arg === '--output' || arg === '-o') {
      const next = argv[index + 1];
      if (!next || next.startsWith('-')) throw new Error('COMPLETION_MATRIX_OUTPUT_PATH_REQUIRED');
      options.output = next;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`COMPLETION_MATRIX_UNKNOWN_ARGUMENT:${arg}`);
    }
  }
  return options;
}

function help() {
  return [
    'Usage: node scripts/generate-completion-matrix.mjs [options]',
    '',
    'Options:',
    '  --markdown, --md   Emit Markdown (default)',
    '  --json             Emit JSON',
    '  --timestamp        Include the current ISO timestamp',
    '  --output, -o PATH  Write to PATH instead of stdout',
    '  --help, -h         Show this help',
    '',
  ].join('\n');
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(help());
  process.exit(0);
}

const matrix = generateCompletionMatrix({
  generatedAt: options.timestamp ? new Date() : null,
});
const rendered = options.format === 'json'
  ? completionMatrixToJson(matrix)
  : completionMatrixToMarkdown(matrix);

if (options.output) {
  const target = path.resolve(options.output);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, rendered, 'utf8');
  process.stdout.write(`${target}\n`);
} else {
  process.stdout.write(rendered);
}
