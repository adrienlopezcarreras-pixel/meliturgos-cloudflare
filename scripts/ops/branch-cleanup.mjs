#!/usr/bin/env node
// Deletes remote branches whose content is already in main: either an ancestor
// of main or exactly the head of a merged PR (squash merges). Dry run unless
// APPLY=true. Protected prefixes and branches of open PRs are never touched.
const PROTECTED = ['main', 'master'];
const PROTECTED_PREFIXES = ['candidate/', 'release/', 'archive/', 'backup', 'baseline/', 'teacher-bridge/', 'hotfix/', 'production/', 'prod/', 'stable/', 'restore/', 'recovery/', 'snapshot/'];

export function deletableBranches({ branches, openHeads, mergedHeads, ancestorOfMain }) {
  const out = [];
  for (const { name, sha } of branches) {
    if (PROTECTED.includes(name) || PROTECTED_PREFIXES.some(p => name.startsWith(p)) || openHeads.has(name)) continue;
    if (mergedHeads.get(name) === sha) out.push({ name, sha, why: 'merged-pr-head' });
    else if (ancestorOfMain(name)) out.push({ name, sha, why: 'ancestor-of-main' });
  }
  return out;
}

async function gh(path, { method = 'GET' } = {}) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok && res.status !== 204) throw new Error(`${method} ${path.split('?')[0]} -> HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function pages(path) {
  const all = [];
  for (let page = 1; page <= 100; page += 1) {
    const rows = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

async function main() {
  const { execFileSync } = await import('node:child_process');
  const apply = process.env.APPLY === 'true';
  const branches = (await pages('branches')).map(b => ({ name: b.name, sha: b.commit.sha }));
  const openHeads = new Set((await pages('pulls?state=open')).map(p => p.head.ref));
  const mergedHeads = new Map((await pages('pulls?state=closed')).filter(p => p.merged_at).map(p => [p.head.ref, p.head.sha]));
  const ancestorOfMain = name => {
    try { execFileSync('git', ['merge-base', '--is-ancestor', `origin/${name}`, 'origin/main'], { stdio: 'ignore' }); return true; } catch { return false; }
  };
  const targets = deletableBranches({ branches, openHeads, mergedHeads, ancestorOfMain });
  console.log(JSON.stringify({ branches: branches.length, deletable: targets.length, apply }));
  let deleted = 0, failed = 0;
  for (const t of targets) {
    if (!apply) continue;
    try { await gh(`git/refs/heads/${t.name.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' }); deleted += 1; }
    catch (error) { failed += 1; console.log(`FAILED ${t.name}: ${error.message}`); }
  }
  // Name -> SHA list lets any deleted branch be recreated.
  const { writeFileSync } = await import('node:fs');
  writeFileSync('branch-cleanup-backup.json', JSON.stringify(targets, null, 1));
  console.log(JSON.stringify({ deleted, failed }));
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exitCode = 1; });
