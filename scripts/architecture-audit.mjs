#!/usr/bin/env node
// MEL-AUDIT-04: weekly architecture audit read from the repository itself.
// Findings: oversized source files, src modules no test imports, LEGACY files
// still imported, exported function names defined in several modules.
// Usage: node scripts/architecture-audit.mjs [repoRoot] > report.json
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_LINES = 1500;
const root = path.resolve(process.argv[2] || '.');

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (/\.(m?js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

function importsOf(file, source, rel) {
  const found = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[1] || match[2] || match[3];
    if (spec?.startsWith('.')) found.push(rel(path.resolve(path.dirname(file), spec)));
  }
  return found;
}

export async function auditArchitecture(repoRoot = root) {
  const rel = file => path.relative(repoRoot, file).split(path.sep).join('/');
  const srcFiles = await walk(path.join(repoRoot, 'src'));
  const testFiles = await walk(path.join(repoRoot, 'tests'));
  const sources = new Map();
  for (const file of [...srcFiles, ...testFiles]) sources.set(file, await readFile(file, 'utf8'));

  const oversized = srcFiles
    .map(file => ({ path: rel(file), lines: sources.get(file).split('\n').length }))
    .filter(row => row.lines > MAX_LINES)
    .sort((a, b) => b.lines - a.lines);

  const testedModules = new Set(testFiles.flatMap(file => importsOf(file, sources.get(file), rel)));
  const untested = srcFiles.map(rel).filter(name => !testedModules.has(name)).sort();

  const legacy = new Set(srcFiles.filter(file => /^[ \t]*\/\/[ \t]*LEGACY_DO_NOT_USE\b/m.test(sources.get(file))).map(rel));
  const legacyImported = [];
  for (const file of srcFiles) {
    for (const target of importsOf(file, sources.get(file), rel)) {
      if (legacy.has(target) && !legacy.has(rel(file))) legacyImported.push({ path: target, imported_by: rel(file) });
    }
  }

  const owners = new Map();
  for (const file of srcFiles) {
    for (const match of sources.get(file).matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) {
      owners.set(match[1], [...(owners.get(match[1]) || []), rel(file)]);
    }
  }
  // onRequest* handlers are the page routing convention, not duplicates.
  const duplicateExports = [...owners].filter(([name, files]) => files.length > 1 && !/^onRequest/.test(name))
    .map(([name, files]) => ({ name, files })).sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name));

  return {
    schema: 'mel.architecture-audit/v1',
    source_files: srcFiles.length,
    test_files: testFiles.length,
    max_lines: MAX_LINES,
    oversized,
    untested_modules: untested,
    legacy_imported: legacyImported,
    duplicate_exports: duplicateExports,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(JSON.stringify(await auditArchitecture(root), null, 2) + '\n');
}
