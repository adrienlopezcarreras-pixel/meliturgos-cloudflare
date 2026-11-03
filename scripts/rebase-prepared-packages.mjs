import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sha = text => createHash('sha256').update(text).digest('hex');

// Another mission may append to a file a prepared package also extends.
// Keep that package applicable: same base, both sides only added text.
export function rebasePreparedChange({ committed, current, content, baseSha }) {
  if (current == null) return null;
  if (sha(current) === baseSha || current === content) return null;
  if (committed == null || sha(committed) !== baseSha) return { conflict: true };
  if (!content.startsWith(committed) || !current.startsWith(committed)) return { conflict: true };
  const suffix = content.slice(committed.length);
  const merged = current.endsWith(suffix) ? current : current + suffix;
  return { content: merged, baseSha: sha(current) };
}

export function rebasePreparedPackages(root, { readCommitted } = {}) {
  const dir = path.join(root, 'prepared');
  if (!fs.existsSync(dir)) return [];
  const read = readCommitted || (file => {
    try { return execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8' }); }
    catch { return null; }
  });
  const written = [];
  for (const name of fs.readdirSync(dir).filter(file => file.endsWith('.json')).sort()) {
    const filePath = path.join(dir, name);
    const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(pkg.changes)) continue;
    let changed = false;
    for (const change of pkg.changes) {
      const rel = String(change.path || '');
      if (!rel || rel.split('/').includes('..')) continue;
      const currentPath = path.join(root, rel);
      const current = fs.existsSync(currentPath) ? fs.readFileSync(currentPath, 'utf8') : null;
      const next = rebasePreparedChange({
        committed: read(rel),
        current,
        content: String(change.content || ''),
        baseSha: String(change.base_sha256 || ''),
      });
      if (!next || next.conflict) continue;
      change.content = next.content;
      change.base_sha256 = next.baseSha;
      changed = true;
    }
    if (!changed) continue;
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
    written.push(`prepared/${name}`);
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const written = rebasePreparedPackages(process.cwd());
  fs.writeFileSync('prepared-rebase-paths.txt', written.join('\n') + (written.length ? '\n' : ''));
  process.stdout.write(written.join('\n') + '\n');
}
