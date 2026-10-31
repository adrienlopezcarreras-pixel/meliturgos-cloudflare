import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROADMAP_CODE_CONTRACTS } from '../src/roadmap/roadmap-code-contracts.js';

// A contract whose regression tests never load its code can only be closed by
// a diff the Council cannot verify (31/10: MANIFEST-05's test imported a file
// its contract forbade). Every contract must reach at least one code path.
const deps = file => { try { return [...fs.readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => path.normalize(path.join(path.dirname(file), m[1]))); } catch { return []; } };
function reach(starts) { const seen = new Set(); const stack = [...starts]; while (stack.length) { const f = stack.pop(); if (seen.has(f)) continue; seen.add(f); stack.push(...deps(f)); } return seen; }

test('every roadmap contract has a regression test that loads one of its code paths', () => {
  const unreached = [];
  for (const [id, contract] of Object.entries(ROADMAP_CODE_CONTRACTS)) {
    const code = contract.code_paths.filter(p => p.startsWith('src/'));
    if (!code.length) continue;
    // A test path that does not exist yet is the regression MAX must create.
    if (contract.test_paths.some(p => !fs.existsSync(p))) continue;
    const loaded = reach(contract.test_paths.filter(p => fs.existsSync(p)).map(p => path.normalize(p)));
    if (!code.some(p => loaded.has(path.normalize(p)))) unreached.push(id);
  }
  assert.deepEqual(unreached, []);
});
