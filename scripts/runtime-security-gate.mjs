import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

import {
  assertRuntimeSupplyChain,
  normalizeNpmAuditEvidence,
} from '../src/security/supply-chain.js';

function run(args) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(npm, args, {
    encoding: 'utf8',
    env: process.env,
  });
}

function fail(message, code = 1) {
  process.stderr.write(String(message || 'Runtime supply-chain gate failed') + '\n');
  process.exit(code || 1);
}

const tree = run(['ls', '--omit=dev', '--all', '--json']);
if (tree.status !== 0) {
  fail(tree.stderr || tree.stdout || 'npm ls runtime tree failed', tree.status);
}

const auditRun = run(['audit', '--omit=dev', '--audit-level=high', '--json']);
let auditPayload;
try {
  auditPayload = JSON.parse(auditRun.stdout || '');
} catch {
  fail(auditRun.stderr || auditRun.stdout || 'npm audit returned non-JSON evidence');
}

let audit;
try {
  audit = normalizeNpmAuditEvidence(auditPayload);
} catch (error) {
  fail(`${error?.code || error?.message || 'SUPPLY_CHAIN_NPM_AUDIT_UNVERIFIED'}\n${auditRun.stderr || auditRun.stdout || ''}`);
}

let packageJson;
let packageLock;
try {
  packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  packageLock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
} catch (error) {
  fail(error?.message || 'Runtime package metadata unreadable');
}

let result;
try {
  result = assertRuntimeSupplyChain({
    packageJson,
    packageLock,
    audit,
  });
} catch (error) {
  fail(error?.code || error?.message || 'Runtime supply-chain policy rejected');
}

if (auditRun.status !== 0) {
  fail(auditRun.stderr || auditRun.stdout || 'npm audit exited non-zero despite parsed evidence', auditRun.status);
}

const output = process.env.MEL_RUNTIME_SBOM_OUTPUT || 'runtime-sbom.json';
await writeFile(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
process.stdout.write(JSON.stringify({
  ok: true,
  schema: result.schema,
  components: result.sbom.component_count,
  direct_runtime_dependencies: result.sbom.direct_runtime_dependencies,
  vulnerabilities: result.audit.vulnerabilities,
  sbom_output: output,
}, null, 2) + '\n');
