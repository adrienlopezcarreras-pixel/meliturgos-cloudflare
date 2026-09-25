const SHA40 = /^[0-9a-f]{40}$/i;

function selfHealingError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function stable(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined) continue;
      out[key] = stable(child);
    }
    return out;
  }
  return String(value);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeTests(tests = []) {
  return (Array.isArray(tests) ? tests : []).slice(0, 100).map(row => ({
    name: clean(row?.name || row?.command || 'test', 200),
    command: clean(row?.command || '', 300),
    passed: row?.passed === true,
    exit_code: Number.isFinite(Number(row?.exit_code)) ? Number(row.exit_code) : null,
    error: row?.error ? clean(row.error, 500) : null,
  }));
}

function candidateOnly(branch) {
  return String(branch || '').startsWith('candidate/');
}

function normalizeFailure(failure = {}) {
  return {
    code: clean(failure?.code || failure?.error || 'UNKNOWN_FAILURE', 160),
    repairable: failure?.repairable === true,
    regression: failure?.regression === true,
    tests: normalizeTests(failure?.tests || failure?.failed_tests || []),
    evidence: stable(failure?.evidence || {}),
  };
}

export async function createSelfHealingPlan({
  evolution_id = '',
  candidate = {},
  lastKnownGood = {},
  failure = {},
  created_at = Date.now(),
} = {}) {
  const branch = clean(candidate?.branch || candidate?.candidate_branch, 240);
  const fromSha = clean(candidate?.sha || candidate?.candidate_sha, 80).toLowerCase();
  const toSha = clean(lastKnownGood?.sha || lastKnownGood?.candidate_sha, 80).toLowerCase();
  const normalizedFailure = normalizeFailure(failure);
  const timestamp = Number(created_at);

  if (!evolution_id) throw selfHealingError('SELF_HEALING_EVOLUTION_ID_REQUIRED');
  if (!candidateOnly(branch)) {
    return Object.freeze({
      status: 'BLOCKED_UNSAFE_TARGET',
      action: 'NONE',
      reason: 'CANDIDATE_BRANCH_REQUIRED',
      candidate_only: true,
      production_mutation_allowed: false,
      promotion_allowed: false,
      requires_explicit_approval: true,
      target: { branch: branch || null, from_sha: SHA40.test(fromSha) ? fromSha : null, to_sha: null },
      failure: normalizedFailure,
    });
  }
  if (!SHA40.test(fromSha)) throw selfHealingError('SELF_HEALING_CANDIDATE_SHA_REQUIRED');
  if (!Number.isInteger(timestamp) || timestamp <= 0) throw selfHealingError('SELF_HEALING_CREATED_AT_INVALID');

  let action = 'ESCALATE';
  let reason = 'NO_SAFE_AUTOMATED_REPAIR';
  if ((normalizedFailure.regression || normalizedFailure.tests.some(test => !test.passed))
      && SHA40.test(toSha)
      && toSha !== fromSha) {
    action = 'ROLLBACK_AND_RETEST';
    reason = 'VERIFIED_PREVIOUS_CANDIDATE_AVAILABLE';
  } else if (normalizedFailure.repairable) {
    action = 'REPAIR_AND_RETEST';
    reason = 'BOUNDED_REPAIR_ALLOWED';
  }

  const core = {
    evolution_id: clean(evolution_id, 220),
    action,
    reason,
    candidate_only: true,
    production_mutation_allowed: false,
    promotion_allowed: false,
    requires_explicit_approval: true,
    target: {
      branch,
      from_sha: fromSha,
      to_sha: action === 'ROLLBACK_AND_RETEST' ? toSha : null,
    },
    failure: normalizedFailure,
    created_at: timestamp,
  };
  const digest = await sha256Hex(core);
  return Object.freeze({
    ...core,
    status: action === 'ESCALATE' ? 'ESCALATION_REQUIRED' : 'READY_FOR_APPROVAL',
    plan_id: `self-heal-${digest.slice(0, 32)}`,
    plan_sha256: digest,
  });
}

export async function verifySelfHealingPlan(plan) {
  if (!plan || typeof plan !== 'object') return { ok: false, code: 'SELF_HEALING_PLAN_REQUIRED' };
  if (!candidateOnly(plan?.target?.branch)) return { ok: false, code: 'CANDIDATE_BRANCH_REQUIRED' };
  if (!SHA40.test(String(plan?.target?.from_sha || ''))) return { ok: false, code: 'SELF_HEALING_CANDIDATE_SHA_REQUIRED' };
  if (plan.action === 'ROLLBACK_AND_RETEST' && !SHA40.test(String(plan?.target?.to_sha || ''))) {
    return { ok: false, code: 'SELF_HEALING_ROLLBACK_SHA_REQUIRED' };
  }
  if (!['ROLLBACK_AND_RETEST', 'REPAIR_AND_RETEST', 'ESCALATE'].includes(String(plan.action || ''))) {
    return { ok: false, code: 'SELF_HEALING_ACTION_INVALID' };
  }
  if (plan.production_mutation_allowed !== false || plan.promotion_allowed !== false || plan.candidate_only !== true) {
    return { ok: false, code: 'SELF_HEALING_POLICY_INVALID' };
  }

  const core = {
    evolution_id: clean(plan.evolution_id, 220),
    action: plan.action,
    reason: plan.reason,
    candidate_only: true,
    production_mutation_allowed: false,
    promotion_allowed: false,
    requires_explicit_approval: true,
    target: stable(plan.target),
    failure: stable(plan.failure),
    created_at: Number(plan.created_at),
  };
  const digest = await sha256Hex(core);
  if (digest !== String(plan.plan_sha256 || '')) return { ok: false, code: 'SELF_HEALING_PLAN_DIGEST_MISMATCH' };
  if (`self-heal-${digest.slice(0, 32)}` !== String(plan.plan_id || '')) return { ok: false, code: 'SELF_HEALING_PLAN_ID_MISMATCH' };
  return { ok: true, code: 'SELF_HEALING_PLAN_VERIFIED' };
}

function assertExactApproval(plan, approval = {}) {
  if (approval?.approved !== true) throw selfHealingError('SELF_HEALING_EXPLICIT_APPROVAL_REQUIRED', 409);
  if (clean(approval?.plan_id, 80) !== plan.plan_id) throw selfHealingError('SELF_HEALING_APPROVAL_PLAN_MISMATCH', 409);
  if (clean(approval?.candidate_branch, 240) !== plan.target.branch) throw selfHealingError('SELF_HEALING_APPROVAL_BRANCH_MISMATCH', 409);
  if (clean(approval?.from_sha, 80).toLowerCase() !== plan.target.from_sha) throw selfHealingError('SELF_HEALING_APPROVAL_SHA_MISMATCH', 409);
  if (plan.action === 'ROLLBACK_AND_RETEST'
      && clean(approval?.to_sha, 80).toLowerCase() !== plan.target.to_sha) {
    throw selfHealingError('SELF_HEALING_APPROVAL_ROLLBACK_SHA_MISMATCH', 409);
  }
  const actor = clean(approval?.actor, 160);
  if (!actor) throw selfHealingError('SELF_HEALING_APPROVAL_ACTOR_REQUIRED', 409);
  return {
    actor,
    approved_at: Number(approval?.approved_at || Date.now()),
  };
}

function summarizeTestResult(result) {
  const tests = normalizeTests(result?.tests || result);
  const failed = tests.filter(test => !test.passed);
  return {
    tests,
    total: tests.length,
    passed: tests.length - failed.length,
    failed: failed.length,
    all_passed: tests.length > 0 && failed.length === 0,
  };
}

export async function executeApprovedSelfHealing(plan, {
  approval,
  rollbackCandidate,
  repairCandidate,
  testCandidate,
} = {}) {
  const verified = await verifySelfHealingPlan(plan);
  if (!verified.ok) throw selfHealingError(verified.code, 409);
  if (plan.action === 'ESCALATE') throw selfHealingError('SELF_HEALING_ESCALATION_ONLY', 409);
  const approved = assertExactApproval(plan, approval);
  if (typeof testCandidate !== 'function') throw selfHealingError('SELF_HEALING_TEST_ADAPTER_REQUIRED', 503);

  let candidateSha = plan.target.from_sha;
  let change = null;

  if (plan.action === 'ROLLBACK_AND_RETEST') {
    if (typeof rollbackCandidate !== 'function') throw selfHealingError('SELF_HEALING_ROLLBACK_ADAPTER_REQUIRED', 503);
    change = await rollbackCandidate({
      branch: plan.target.branch,
      from_sha: plan.target.from_sha,
      to_sha: plan.target.to_sha,
      plan_id: plan.plan_id,
    });
    candidateSha = clean(change?.candidate_sha || plan.target.to_sha, 80).toLowerCase();
    if (candidateSha !== plan.target.to_sha) throw selfHealingError('SELF_HEALING_ROLLBACK_RESULT_SHA_MISMATCH', 409);
  } else {
    if (typeof repairCandidate !== 'function') throw selfHealingError('SELF_HEALING_REPAIR_ADAPTER_REQUIRED', 503);
    change = await repairCandidate({
      branch: plan.target.branch,
      from_sha: plan.target.from_sha,
      failure: stable(plan.failure),
      plan_id: plan.plan_id,
    });
    candidateSha = clean(change?.candidate_sha, 80).toLowerCase();
    if (!SHA40.test(candidateSha)) throw selfHealingError('SELF_HEALING_REPAIR_RESULT_SHA_REQUIRED', 409);
  }

  const tested = summarizeTestResult(await testCandidate({
    branch: plan.target.branch,
    candidate_sha: candidateSha,
    plan_id: plan.plan_id,
  }));

  return Object.freeze({
    ok: tested.all_passed,
    status: tested.all_passed ? 'CANDIDATE_VERIFIED' : 'TESTS_FAILED',
    plan_id: plan.plan_id,
    action: plan.action,
    approval: approved,
    candidate: {
      branch: plan.target.branch,
      sha: candidateSha,
    },
    change: stable(change || {}),
    tests: tested,
    candidate_only: true,
    production_touched: false,
    promotion_allowed: false,
    next: tested.all_passed ? 'HUMAN_OR_RELEASE_GATE_REVIEW' : 'REPAIR_OR_ESCALATE',
  });
}
