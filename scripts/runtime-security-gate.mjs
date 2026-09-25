import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

import {
  createSupplyChainAttestation,
  serializeSupplyChainAttestation,
} from '../src/security/supply-chain-attestation.js';
import {
  auditEvidence,
  releaseGateExitCode,
} from '../src/security/runtime-security-gate-policy.js';

const ATTESTATION_FILE = 'runtime-supply-chain-attestation.json';
const REQUIRE_RELEASE_ELIGIBLE = process.argv.includes('--require-release-eligible')
  || process.env.MEL_REQUIRE_RELEASE_ELIGIBLE === '1';

function run(args) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(npm, args, {
    encoding: 'utf8',
    env: process.env,
  });
}

async function sourceFiles() {
  const packageJsonText = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const packageLockText = await readFile(new URL('../package-lock.json', import.meta.url), 'utf8');
  return {
    packageJson: JSON.parse(packageJsonText),
    packageLock: JSON.parse(packageLockText),
    packageLockText,
  };
}

const files = await sourceFiles();

const tree = run(['ls', '--omit=dev', '--all', '--json']);
const treeVerified = tree.status === 0;

const audit = run(['audit', '--omit=dev', '--audit-level=high', '--json']);
const auditResult = auditEvidence(audit);

let exitCode = 0;

let attestation;
try {
  attestation = await createSupplyChainAttestation({
    commit: process.env.GITHUB_SHA || process.env.MEL_DEPLOYED_GIT_SHA || 'unknown',
    branch: process.env.GITHUB_REF_NAME || process.env.MEL_DEPLOYED_GIT_BRANCH || 'local',
    packageJson: files.packageJson,
    packageLock: files.packageLock,
    packageLockText: files.packageLockText,
    audit: auditResult.evidence,
    generatedAt: new Date().toISOString(),
    schemaVersion: process.env.MEL_DB_SCHEMA_VERSION || 'unknown',
    configVersion: process.env.MEL_CONFIG_VERSION || files.packageJson.version || 'unknown',
    ci: {
      run_id: process.env.GITHUB_RUN_ID || '',
      workflow: process.env.GITHUB_WORKFLOW || '',
      repository: process.env.GITHUB_REPOSITORY || '',
      event: process.env.GITHUB_EVENT_NAME || '',
      dependency_tree_verified: treeVerified,
    },
  });
  await writeFile(
    ATTESTATION_FILE,
    serializeSupplyChainAttestation(attestation) + '\n',
    'utf8',
  );
} catch (error) {
  process.stderr.write(`SUPPLY_CHAIN_ATTESTATION_FAILED: ${error?.code || error?.message || error}\n`);
  process.exit(1);
}

exitCode = releaseGateExitCode({
  treeVerified,
  treeStatus: tree.status,
  auditExitCode: auditResult.exitCode,
  releaseEligible: attestation.release_eligible,
  requireReleaseEligible: REQUIRE_RELEASE_ELIGIBLE,
});

const summary = {
  ok: exitCode === 0,
  dependency_tree_verified: treeVerified,
  audit_status: attestation.audit.status,
  audit_verified: attestation.audit.verified,
  vulnerabilities: attestation.audit.vulnerabilities,
  release_eligible: attestation.release_eligible,
  blockers: attestation.gate.blockers,
  source_commit: attestation.source.commit,
  sbom_components: attestation.sbom.component_count,
  sbom_sha256: attestation.sbom_sha256,
  attestation_sha256: attestation.integrity.attestation_sha256,
  attestation_file: ATTESTATION_FILE,
};

if (!treeVerified) {
  process.stderr.write(tree.stderr || tree.stdout || 'npm ls failed\n');
}
if (auditResult.exitCode !== 0) {
  process.stderr.write(audit.stdout || audit.stderr || 'npm audit failed\n');
}
if (REQUIRE_RELEASE_ELIGIBLE && attestation.release_eligible !== true) {
  const blockers = attestation.gate.blockers.join(',') || 'SUPPLY_CHAIN_RELEASE_NOT_ELIGIBLE';
  process.stderr.write('SUPPLY_CHAIN_RELEASE_BLOCKED: ' + blockers + '\n');
}

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
process.exit(exitCode);
