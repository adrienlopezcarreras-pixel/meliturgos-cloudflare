import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { extname, join } from 'node:path';

const ROOT_FILES = ['worker.js'];
const ROOT_DIRS = ['src', 'scripts', 'tests'];
const EXTENSIONS = new Set(['.js', '.mjs']);

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.isFile() && EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = [...ROOT_FILES];
for (const dir of ROOT_DIRS) files.push(...await collect(dir));
files.sort();

let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status === 0) continue;
  failures += 1;
  process.stderr.write(`\nSyntax check failed: ${file}\n`);
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

if (failures > 0) {
  console.error(`\n${failures} syntax check failure(s) across ${files.length} JavaScript modules.`);
  process.exit(1);
}
console.log(`Syntax check passed for ${files.length} JavaScript modules.`);
