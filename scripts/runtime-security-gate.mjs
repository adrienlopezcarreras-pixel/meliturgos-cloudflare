import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

import {
  createSupplyChainAttestation,
  serializeSupplyChainAttestation,
} from '../src/security/supply-chain-attestation.js';

const ATTESTATION_FILE = 'runtime-supply-chain-attestation.json';

function run(args) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(npm, args, {
    encoding: 'utf8',
    env: process.env,
  });
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); }
  catch { return fallback; }
}

function vulnerabilities(payload) {
  const counts = payload?.metadata?.vulnerabilities || {};
  return {
    low: Math.max(0, Number(counts.low || 0) || 0),
    moderate: Math.max(0, Number(counts.moderate || 0) || 0),
    high: Math.max(0, Number(counts.high || 0) || 0),
    critical: Math.max(0, Number(counts.critical || 0) || 0),
  };
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

function auditEvidence(result) {
  const payload = parseJson(result.stdout, {});
  const counts = vulnerabilities(payload);
  if (result.status === 0) {
    return {
      evidence: {
        verified: true,
        source: 'npm-audit-runtime-ci',
        status: 'VERIFIED',
        vulnerabilities: counts,
      },
      exitCode: 0,
      registryFailure: false,
      payload,
    };
  }

  const highRisk = counts.high > 0 || counts.critical > 0;
  if (highRisk) {
    return {
      evidence: {
        verified: true,
        source: 'npm-audit-runtime-ci',
        status: 'VULNERABILITIES_DETECTED',
        vulnerabilities: counts,
      },
      exitCode: 1,
      registryFailure: false,
      payload,
    };
  }

  const message = String(
    payload?.error?.summary
      || payload?.error?.detail
      || result.stderr
      || result.stdout
      || ''
  );
  const registryFailure = /400 Bad Request|Invalid package tree|endpoint is being retired|audit endpoint returned an error/i.test(message);
  if (registryFailure) {
    return {
      evidence: {
        verified: false,
        source: 'npm-audit-runtime-ci',
        status: 'AUDIT_REGISTRY_UNAVAILABLE',
        vulnerabilities: counts,
        note: 'npm audit registry endpoint unavailable; release eligibility remains blocked in attestation.',
      },
      exitCode: 0,
      registryFailure: true,
      payload,
    };
  }

  return {
    evidence: {
      verified: false,
      source: 'npm-audit-runtime-ci',
      status: 'AUDIT_FAILED',
      vulnerabilities: counts,
      note: String(result.stderr || result.stdout || 'npm audit failed').slice(0, 1000),
    },
    exitCode: result.status || 1,
    registryFailure: false,
    payload,
  };
}

const files = await sourceFiles();

const tree = run(['ls', '--omit=dev', '--all', '--json']);
const treeVerified = tree.status === 0;

const audit = run(['audit', '--omit=dev', '--audit-level=high', '--json']);
const auditResult = auditEvidence(audit);

let exitCode = 0;
if (!treeVerified) exitCode = tree.status || 1;
if (auditResult.exitCode !== 0) exitCode = auditResult.exitCode;

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

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
process.exit(exitCode);
