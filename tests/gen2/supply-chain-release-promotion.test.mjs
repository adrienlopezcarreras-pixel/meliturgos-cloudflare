import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  auditEvidence,
  releaseGateExitCode,
} from '../../src/security/runtime-security-gate-policy.js';

test('MEL-SEC-03 classifies registry outage as unverified evidence', () => {
  const value = auditEvidence({
    status: 1,
    stdout: '',
    stderr: 'npm error code EAI_AGAIN: registry.npmjs.org unavailable',
  });

  assert.equal(value.registryFailure, true);
  assert.equal(value.exitCode, 0);
  assert.equal(value.evidence.verified, false);
  assert.equal(value.evidence.status, 'AUDIT_REGISTRY_UNAVAILABLE');
});

test('MEL-SEC-03 evidence-only CI can preserve outage attestation without promotion', () => {
  const exitCode = releaseGateExitCode({
    treeVerified: true,
    treeStatus: 0,
    auditExitCode: 0,
    releaseEligible: false,
    requireReleaseEligible: false,
  });
  assert.equal(exitCode, 0);
});

test('MEL-SEC-03 production promotion fails closed when release is not eligible', () => {
  const exitCode = releaseGateExitCode({
    treeVerified: true,
    treeStatus: 0,
    auditExitCode: 0,
    releaseEligible: false,
    requireReleaseEligible: true,
  });
  assert.equal(exitCode, 42);
});

test('MEL-SEC-03 keeps stronger dependency or audit failure codes', () => {
  assert.equal(releaseGateExitCode({
    treeVerified: false,
    treeStatus: 7,
    auditExitCode: 0,
    releaseEligible: false,
    requireReleaseEligible: true,
  }), 7);

  assert.equal(releaseGateExitCode({
    treeVerified: true,
    treeStatus: 0,
    auditExitCode: 9,
    releaseEligible: false,
    requireReleaseEligible: true,
  }), 9);
});

test('MEL-SEC-03 production workflow explicitly requires release eligibility', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/deploy-cloudflare-release.yml', import.meta.url),
    'utf8',
  );
  assert.match(
    workflow,
    /node scripts\/runtime-security-gate\.mjs --require-release-eligible/,
  );
});

test('MEL-SEC-03 eligible promotion remains green', () => {
  const exitCode = releaseGateExitCode({
    treeVerified: true,
    treeStatus: 0,
    auditExitCode: 0,
    releaseEligible: true,
    requireReleaseEligible: true,
  });
  assert.equal(exitCode, 0);
});
