import { prepareDevelopmentRequest, authorizeDevelopmentPlan } from '../evolution/development-preflight.js';

function requireAdapter(name, value) {
  if (typeof value !== 'function') {
    throw Object.assign(new Error(`MODULE_LAB_ADAPTER_REQUIRED:${name}`), {
      code: 'MODULE_LAB_ADAPTER_REQUIRED',
      stage: name,
      status: 500,
    });
  }
  return value;
}

function requireStageEvidence(stage, value, predicate, code) {
  if (!predicate(value)) {
    throw Object.assign(new Error(code), { code, stage, status: 409 });
  }
  return value;
}

function sanitizedArtifact(value) {
  if (value == null) return null;
  const raw = JSON.stringify(value);
  if (/(?:password|api[_ -]?key|authorization|bearer\s|\btoken\b|\botp\b|secret\s*[=:])/i.test(raw)) {
    throw Object.assign(new Error('MODULE_LAB_SECRET_LIKE_ARTIFACT'), {
      code: 'MODULE_LAB_SECRET_LIKE_ARTIFACT',
      status: 400,
    });
  }
  if (raw.length > 100_000) {
    throw Object.assign(new Error('MODULE_LAB_ARTIFACT_TOO_LARGE'), {
      code: 'MODULE_LAB_ARTIFACT_TOO_LARGE',
      status: 413,
    });
  }
  return JSON.parse(raw);
}

/**
 * Canonical GEN2-16 development path.
 *
 * Invariants:
 * - Council preflight is always first.
 * - Code inspection must complete before a spec can be authorized.
 * - Generation cannot happen before the plan gate.
 * - Validation, tests, sandbox and security review all fail closed.
 * - This function stops at CANDIDATE. Activation remains a separate release gate.
 */
export async function runModuleLabPipeline({
  env,
  goal,
  context = {},
  pool,
  minResponses = 2,
  inspect,
  spec,
  generate,
  validate,
  test,
  sandbox,
  securityReview,
} = {}) {
  const stages = [];

  const preflight = await prepareDevelopmentRequest({
    env,
    goal,
    context,
    pool,
    minResponses,
  });
  stages.push({ stage: 'AI_STATE_OF_PLAY', status: 'PASS' });

  const inspection = sanitizedArtifact(await requireAdapter('inspect', inspect)({
    goal: preflight.goal,
    council: preflight.council,
    context,
  }));
  requireStageEvidence(
    'inspect',
    inspection,
    value => value?.status === 'COMPLETE' && Array.isArray(value?.evidence) && value.evidence.length > 0,
    'MODULE_LAB_INSPECTION_INCOMPLETE',
  );
  stages.push({ stage: 'INSPECTION', status: 'PASS' });

  const authorization = authorizeDevelopmentPlan(preflight, inspection);
  stages.push({ stage: 'PLAN_GATE', status: 'PASS' });

  const specification = sanitizedArtifact(await requireAdapter('spec', spec)({
    goal: preflight.goal,
    council: preflight.council,
    inspection,
    authorization,
    context,
  }));
  requireStageEvidence(
    'spec',
    specification,
    value => value?.status === 'COMPLETE' && typeof value?.module_id === 'string' && value.module_id.trim().length > 0
      && Array.isArray(value?.acceptance_criteria) && value.acceptance_criteria.length > 0,
    'MODULE_LAB_SPEC_INCOMPLETE',
  );
  stages.push({ stage: 'SPEC', status: 'PASS' });

  const generated = sanitizedArtifact(await requireAdapter('generate', generate)({
    goal: preflight.goal,
    specification,
    inspection,
    council: preflight.council,
    context,
  }));
  requireStageEvidence(
    'generate',
    generated,
    value => value?.status === 'GENERATED' && typeof value?.candidate_ref === 'string' && value.candidate_ref.trim().length > 0,
    'MODULE_LAB_GENERATION_INCOMPLETE',
  );
  stages.push({ stage: 'GENERATE', status: 'PASS' });

  const validation = sanitizedArtifact(await requireAdapter('validate', validate)({
    specification,
    generated,
    context,
  }));
  requireStageEvidence(
    'validate',
    validation,
    value => value?.status === 'PASS',
    'MODULE_LAB_VALIDATION_FAILED',
  );
  stages.push({ stage: 'VALIDATE', status: 'PASS' });

  const testResult = sanitizedArtifact(await requireAdapter('test', test)({
    specification,
    generated,
    validation,
    context,
  }));
  requireStageEvidence(
    'test',
    testResult,
    value => value?.status === 'PASS' && Number(value?.tests_run || 0) > 0 && Number(value?.tests_failed || 0) === 0,
    'MODULE_LAB_TESTS_FAILED',
  );
  stages.push({ stage: 'TEST', status: 'PASS' });

  const sandboxResult = sanitizedArtifact(await requireAdapter('sandbox', sandbox)({
    specification,
    generated,
    test: testResult,
    context,
  }));
  requireStageEvidence(
    'sandbox',
    sandboxResult,
    value => value?.status === 'PASS',
    'MODULE_LAB_SANDBOX_FAILED',
  );
  stages.push({ stage: 'SANDBOX', status: 'PASS' });

  const security = sanitizedArtifact(await requireAdapter('securityReview', securityReview)({
    specification,
    generated,
    validation,
    test: testResult,
    sandbox: sandboxResult,
    context,
  }));
  requireStageEvidence(
    'securityReview',
    security,
    value => value?.status === 'PASS' && value?.blocking_findings !== true,
    'MODULE_LAB_SECURITY_REVIEW_FAILED',
  );
  stages.push({ stage: 'SECURITY_REVIEW', status: 'PASS' });

  return {
    ok: true,
    status: 'CANDIDATE',
    goal: preflight.goal,
    module_id: specification.module_id,
    candidate_ref: generated.candidate_ref,
    activation_allowed: false,
    release_gate_required: true,
    stages,
    evidence: {
      council: preflight.council,
      inspection,
      specification,
      generated,
      validation,
      test: testResult,
      sandbox: sandboxResult,
      security,
    },
  };
}
