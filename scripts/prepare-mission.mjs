// Build prepared/<ROADMAP-ID>.json from a branch: each changed file's full
// content plus the sha256 of its version on main (the base it must match).
// Usage: node scripts/prepare-mission.mjs MEL-CHAT-01 <branch> "<summary>"
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
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
// Two pending packages touching the same file is a trap: the first applied to
// the candidate moves the base of the second, the guard then fails the whole
// candidate CI, and the mission that happened to be running is sent to repair
// although nothing is wrong with it (01/11: CHAT-08 punished for MANIFEST-08).
// Refuse the collision here, where it costs one message instead of a CI cycle.
const taken = new Map();
for (const file of (() => { try { return readdirSync('prepared'); } catch { return []; } })()) {
  if (!file.endsWith('.json') || file === `${id}.json`) continue;
  let other;
  try { other = JSON.parse(readFileSync(`prepared/${file}`, 'utf8')); } catch { continue; }
  for (const change of other.changes || []) {
    // A package already identical to main is delivered and harmless.
    let base = null;
    try { base = git('show', `origin/main:${change.path}`); } catch {}
    if (base !== null && base === change.content) continue;
    taken.set(change.path, other.roadmap_id || file);
  }
}
const collisions = changes.filter(change => taken.has(change.path))
  .map(change => `${change.path} (déjà pris par ${taken.get(change.path)})`);
if (collisions.length && process.env.PREPARE_ALLOW_COLLISION !== 'true') {
  throw new Error('PREPARED_PACKAGE_FILE_COLLISION: ' + collisions.join(' ; ')
    + '\nAttendre la preuve de cette mission, ou PREPARE_ALLOW_COLLISION=true en sachant que le perdant devra être rebâti.');
}
if (collisions.length) console.warn('ATTENTION collision acceptée : ' + collisions.join(' ; '));
mkdirSync('prepared', { recursive: true });
writeFileSync(`prepared/${id}.json`, JSON.stringify({ roadmap_id: id, summary, tests: ['test'], changes }, null, 2) + '\n');
console.log(`prepared/${id}.json`, changes.map(c => c.path).join(', '));
