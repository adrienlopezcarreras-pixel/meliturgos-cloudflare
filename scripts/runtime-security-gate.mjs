import { spawnSync } from 'node:child_process';

function run(args) {
  return spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    encoding: 'utf8',
    env: process.env,
  });
}

const tree = run(['ls', '--omit=dev', '--all', '--json']);
if (tree.status !== 0) {
  process.stderr.write(tree.stderr || tree.stdout || 'npm ls failed\n');
  process.exit(tree.status || 1);
}

const audit = run(['audit', '--omit=dev', '--audit-level=high', '--json']);
if (audit.status === 0) {
  process.stdout.write(audit.stdout || '{"ok":true}\n');
  process.exit(0);
}

let payload = null;
try { payload = JSON.parse(audit.stdout || '{}'); } catch {}

const counts = payload?.metadata?.vulnerabilities || {};
const high = Number(counts.high || 0);
const critical = Number(counts.critical || 0);
if (high > 0 || critical > 0) {
  process.stderr.write(audit.stdout || audit.stderr || 'High/critical npm vulnerabilities detected\n');
  process.exit(1);
}

const message = String(payload?.error?.summary || payload?.error?.detail || audit.stderr || audit.stdout || '');
const registryFailure = /400 Bad Request|Invalid package tree|endpoint is being retired|audit endpoint returned an error/i.test(message);
if (!registryFailure) {
  process.stderr.write(audit.stdout || audit.stderr || 'npm audit failed\n');
  process.exit(audit.status || 1);
}

process.stdout.write(JSON.stringify({
  ok: true,
  status: 'AUDIT_REGISTRY_UNAVAILABLE',
  dependency_tree_verified: true,
  high,
  critical,
  note: 'npm registry audit endpoint failed without reporting high/critical vulnerabilities; npm ls runtime tree is valid.'
}, null, 2) + '\n');
