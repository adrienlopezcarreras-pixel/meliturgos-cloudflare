import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parse } from 'acorn';

const run = promisify(execFile);
const CONTRACT_FILE = 'src/roadmap/roadmap-code-contracts.js';
function literal(node) {
  if (node?.type === 'Literal') return node.value;
  if (node?.type === 'ArrayExpression') return node.elements.map(literal);
  if (node?.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(property => {
    if (property.type !== 'Property' || property.computed || property.kind !== 'init') throw Error('CONTRACT_SNAPSHOT_UNSUPPORTED_EXPRESSION');
    return [property.key.name ?? property.key.value, literal(property.value)];
  }));
  throw Error('CONTRACT_SNAPSHOT_UNSUPPORTED_EXPRESSION');
}
export function contractSnapshot(source) {
  // Inspect syntax, never execute code from a PR or from the baseline commit.
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const declarations = ast.body.flatMap(node => node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration' ? node.declaration.declarations : []);
  const revision = literal(declarations.find(node => node.id.name === 'ROADMAP_CODE_CONTRACT_REVISION')?.init);
  const frozen = declarations.find(node => node.id.name === 'ROADMAP_CODE_CONTRACTS')?.init;
  if (typeof revision !== 'string' || frozen?.type !== 'CallExpression' || frozen.callee?.object?.name !== 'Object' || frozen.callee?.property?.name !== 'freeze' || frozen.arguments.length !== 1) throw Error('CONTRACT_SNAPSHOT_INVALID');
  return { revision, contracts: literal(frozen.arguments[0]) };
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
export function unversionedContractChanges(before, after) {
  const scope = ({ revision, ...rest }) => JSON.stringify(canonical(rest));
  return Object.entries(after.contracts).filter(([id, current]) => {
    const previous = before.contracts[id];
    return previous && scope(previous) !== scope(current)
      && (previous.revision || before.revision) === (current.revision || after.revision);
  }).map(([id]) => id);
}
export async function checkPullRequestContractRevisions({ env = process.env, cwd = process.cwd() } = {}) {
  if (!['pull_request', 'pull_request_target'].includes(env.GITHUB_EVENT_NAME)) return { skipped: true };
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  const base = event.pull_request?.base?.sha;
  if (!/^[a-f0-9]{40}$/.test(String(base || ''))) throw Error('CONTRACT_REVISION_BASE_REQUIRED');
  try { await run('git', ['cat-file', '-e', base], { cwd }); }
  catch { await run('git', ['fetch', '--no-tags', '--depth=1', 'origin', base], { cwd, timeout: 60000 }); }
  const { stdout: original } = await run('git', ['show', base + ':' + CONTRACT_FILE], { cwd, maxBuffer: 2 * 1024 * 1024 });
  const current = await readFile(new URL(CONTRACT_FILE, pathToFileURL(cwd.endsWith('/') ? cwd : cwd + '/')), 'utf8');
  const changed = unversionedContractChanges(contractSnapshot(original), contractSnapshot(current));
  if (changed.length) throw Error('ROADMAP_CONTRACT_REVISION_REQUIRED:' + changed.join(','));
  return { ok: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkPullRequestContractRevisions().catch(error => { console.error(error.message); process.exitCode = 1; });
}
