// Build prepared/<ROADMAP-ID>.json from a branch: each changed file's full
// content plus the sha256 of its version on main (the base it must match).
// Usage: node scripts/prepare-mission.mjs MEL-CHAT-01 <branch> "<summary>"
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { ROADMAP_CODE_CONTRACTS } from '../src/roadmap/roadmap-code-contracts.js';

const [id, branch, summary = ''] = process.argv.slice(2);
const contract = ROADMAP_CODE_CONTRACTS[id];
if (!contract || !branch) throw new Error('usage: prepare-mission <ROADMAP-ID> <branch> [summary]');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26 });
const changed = git('diff', '--name-only', `origin/main...${branch}`).split('\n').filter(Boolean)
  .filter(path => [...contract.code_paths, ...contract.test_paths].includes(path));
if (!changed.length) throw new Error('no contract file changed on ' + branch);
const changes = changed.map(path => {
  let base = null;
  try { base = git('show', `origin/main:${path}`); } catch {}
  return { path, base_sha256: base === null ? 'new' : createHash('sha256').update(base).digest('hex'),
    content: git('show', `${branch}:${path}`), reason: summary };
});
mkdirSync('prepared', { recursive: true });
writeFileSync(`prepared/${id}.json`, JSON.stringify({ roadmap_id: id, summary, tests: ['test'], changes }, null, 2) + '\n');
console.log(`prepared/${id}.json`, changes.map(c => c.path).join(', '));
