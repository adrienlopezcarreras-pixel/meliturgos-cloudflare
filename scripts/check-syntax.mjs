import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, extname, join, resolve } from 'node:path';

const ROOT_FILES = ['worker.js'];
const ROOT_DIRS = ['src', 'scripts', 'tests', 'browser-companion/chatgpt-collector'];
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

// Every static import of the deployed code must resolve: a module importing a
// file or package that does not exist parses fine but breaks at runtime (an
// autonomous change once added `import { env } from '$fresh/runtime.ts'`).
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const packages = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {}), ...Object.keys(pkg.optionalDependencies || {})]);
const builtins = new Set(builtinModules);
const SPEC = /(?:^|[\s;}])(?:import|export)\s+(?:[^'"`;]*?\sfrom\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
export function unresolvedImports(file, source) {
  const missing = [];
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  for (const match of code.matchAll(SPEC)) {
    const spec = match[1] || match[2];
    if (!spec) continue;
    if (spec.startsWith('.') || spec.startsWith('/')) {
      if (!existsSync(resolve(dirname(file), spec))) missing.push(spec);
      continue;
    }
    if (spec.startsWith('node:') || spec.startsWith('cloudflare:') || builtins.has(spec)) continue;
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (!packages.has(name)) missing.push(spec);
  }
  return missing;
}
for (const file of files.filter(f => f === 'worker.js' || f.startsWith('src' + '/'))) {
  const missing = unresolvedImports(file, await readFile(file, 'utf8'));
  if (!missing.length) continue;
  failures += 1;
  process.stderr.write(`\nUnresolved import in ${file}: ${missing.join(', ')}\n`);
}

if (failures > 0) {
  console.error(`\n${failures} syntax/import check failure(s) across ${files.length} JavaScript modules.`);
  process.exit(1);
}
console.log(`Syntax check passed for ${files.length} JavaScript modules.`);
