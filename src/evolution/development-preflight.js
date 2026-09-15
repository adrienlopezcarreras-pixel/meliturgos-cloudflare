import { runAugmentioStateOfPlay } from '../teachers/augmentio-council.js';
import { requireStateOfPlayCouncil } from '../teachers/model-council.js';

function boundedGoal(value) {
  const goal = String(value || '').trim();
  if (!goal) throw Object.assign(new Error('DEVELOPMENT_GOAL_REQUIRED'), { code: 'DEVELOPMENT_GOAL_REQUIRED', status: 400 });
  if (goal.length > 4000) throw Object.assign(new Error('DEVELOPMENT_GOAL_TOO_LONG'), { code: 'DEVELOPMENT_GOAL_TOO_LONG', status: 400 });
  return goal;
}

function degradedZeroCostCouncil({ objective, context, error }) {
  return {
    status: 'DEGRADED',
    degraded: true,
    degraded_reason: 'NOT_ENOUGH_ZERO_COST_PROVIDERS',
    phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',
    goal: objective,
    context: {
      ...context,
      development_stage: 'PRE_CODE_STATE_OF_PLAY',
      rule: 'ASK_MULTIPLE_AIS_BEFORE_CODE_INSPECTION_OR_GENERATION',
      budget_policy: 'ZERO_ADDED_COST_FAIL_CLOSED',
      council_policy: 'DEGRADED_TEACHER_ESCALATION_ZERO_COST_SHORTAGE',
    },
    responses: [],
    failures: [{
      member: null,
      error: 'COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS',
    }],
    eligible_providers: Array.isArray(error?.eligible) ? [...error.eligible] : [],
    required_providers: Number(error?.required || 2),
    required_roles_succeeded: [],
    required_roles_missing: [
      'ARCHITECTURE_REUSE',
      'SECURITY_GOVERNANCE',
      'TESTS_EVIDENCE',
      'PRODUCT_INTEGRATION',
    ],
    all_required_roles_satisfied: false,
    synthesis: {
      status: 'SKIPPED_NO_ZERO_COST_QUORUM',
      coordinator: 'MEL',
      provider_id: null,
      provenance: null,
      text: '',
      attempted: Array.isArray(error?.eligible) ? [...error.eligible] : [],
    },
    evidence_required: true,
    development_allowed: false,
    council_ready_for_teacher: true,
    teacher_required: true,
    teacher_role: 'CHATGPT_EXTERNAL_ARCHITECT_REVIEWER',
    next: 'EXTERNAL_TEACHER_REVIEW_WITHOUT_MULTI_AI_QUORUM',
  };
}

/**
 * First mandatory stage of every MEL capability/module evolution request.
 * This function deliberately does NOT inspect code or generate a patch before
 * the independent multi-AI state-of-play has completed successfully.
 *
 * If the zero-added-cost policy leaves too few providers, MEL does not spend
 * money and does not retry forever. The Council is explicitly marked DEGRADED
 * and escalated to the external Teacher. Code inspection may continue so the
 * Teacher receives evidence, but generation remains forbidden here.
 */
export async function prepareDevelopmentRequest({ env, goal, context = {}, minResponses = 2, pool } = {}) {
  const objective = boundedGoal(goal);
  let council;
  try {
    council = await runAugmentioStateOfPlay({
      env,
      goal: objective,
      context: {
        ...context,
        development_stage: 'PRE_CODE_STATE_OF_PLAY',
        rule: 'ASK_MULTIPLE_AIS_BEFORE_CODE_INSPECTION_OR_GENERATION'
      },
      minResponses: Math.max(2, Number(minResponses) || 2),
      pool
    });
  } catch (error) {
    if (String(error?.code || '') !== 'COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS') throw error;
    council = degradedZeroCostCouncil({ objective, context, error });
  }
  requireStateOfPlayCouncil(council);

  return {
    ok: true,
    stage: 'AI_STATE_OF_PLAY_COMPLETE',
    degraded: council?.degraded === true,
    goal: objective,
    development_allowed: false,
    code_inspection_allowed: true,
    code_generation_allowed: false,
    council,
    next: council?.degraded === true
      ? 'INSPECT_EXISTING_CODE_THEN_ESCALATE_TO_TEACHER'
      : 'INSPECT_EXISTING_CODE_AND_REUSE_BEFORE_SPEC'
  };
}

/** Second gate: code generation is allowed only after code inspection is supplied. */
export function authorizeDevelopmentPlan(preflight, inspection) {
  if (!preflight || preflight.stage !== 'AI_STATE_OF_PLAY_COMPLETE' || preflight.code_inspection_allowed !== true) {
    throw Object.assign(new Error('AI_PREFLIGHT_REQUIRED'), { code: 'AI_PREFLIGHT_REQUIRED' });
  }
  if (!inspection || inspection.status !== 'COMPLETE' || !Array.isArray(inspection.evidence) || inspection.evidence.length === 0) {
    throw Object.assign(new Error('CODE_INSPECTION_REQUIRED'), { code: 'CODE_INSPECTION_REQUIRED' });
  }
  if (preflight?.council?.degraded === true || preflight?.council?.status === 'DEGRADED') {
    throw Object.assign(new Error('TEACHER_REVIEW_REQUIRED_FOR_DEGRADED_COUNCIL'), {
      code: 'TEACHER_REVIEW_REQUIRED_FOR_DEGRADED_COUNCIL'
    });
  }
  return {
    ok: true,
    stage: 'DEVELOPMENT_PLAN_AUTHORIZED',
    development_allowed: true,
    code_generation_allowed: true,
    council: preflight.council,
    inspection,
    next: 'SPEC_THEN_MODULE_LAB'
  };
}
