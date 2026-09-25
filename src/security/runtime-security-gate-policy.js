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

export function auditEvidence(result = {}) {
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
  const registryFailure = /400 Bad Request|Invalid package tree|endpoint is being retired|audit endpoint returned an error|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout|registry[^\n]*(?:unavailable|unreachable)|network error/i.test(message);
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
    exitCode: Number.isInteger(result.status) && result.status !== 0 ? result.status : 1,
    registryFailure: false,
    payload,
  };
}

export function releaseGateExitCode({
  treeVerified,
  treeStatus,
  auditExitCode,
  releaseEligible,
  requireReleaseEligible = false,
} = {}) {
  let exitCode = 0;
  if (treeVerified !== true) {
    exitCode = Number.isInteger(treeStatus) && treeStatus !== 0 ? treeStatus : 1;
  }
  if (Number.isInteger(auditExitCode) && auditExitCode !== 0) {
    exitCode = auditExitCode;
  }
  if (requireReleaseEligible && releaseEligible !== true && exitCode === 0) {
    exitCode = 42;
  }
  return exitCode;
}
