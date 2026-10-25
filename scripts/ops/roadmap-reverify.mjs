#!/usr/bin/env node
// Monthly re-verification of DONE_VERIFIED roadmap items: run every test file,
// and list the verified roadmap ids named by any test file that fails now.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { flattenRoadmap, isClosedRoadmapStatus } from '../../src/roadmap/master-roadmap.js';
import { roadmapIdsInText } from '../../src/roadmap/roadmap-regressions.js';

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.test.mjs')) files.push(path);
  }
})('tests');

const verified = new Set(flattenRoadmap().filter(item => isClosedRoadmapStatus(item.status)).map(item => item.id));
const failing = [];
for (const file of files) {
  const run = spawnSync(process.execPath, ['--test', file], { env: { ...process.env, MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS: '1' }, encoding: 'utf8', timeout: 180_000 });
  if (run.status !== 0) failing.push(file);
}
const regressed = [...new Set(failing.flatMap(file => roadmapIdsInText(readFileSync(file, 'utf8'))))].filter(id => verified.has(id));
const report = { tests: files.length, failing, regressed };
writeFileSync('roadmap-reverify.json', JSON.stringify(report, null, 1));
console.log(JSON.stringify({ tests: files.length, failing: failing.length, regressed }));
