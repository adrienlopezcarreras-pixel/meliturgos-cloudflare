import { runAugmentioStateOfPlay } from '../teachers/augmentio-council.js';
import { requireStateOfPlayCouncil } from '../teachers/model-council.js';

function boundedGoal(value) {
  const goal = String(value || '').trim();
  if (!goal) throw Object.assign(new Error('DEVELOPMENT_GOAL_REQUIRED'), { code: 'DEVELOPMENT_GOAL_REQUIRED', status: 400 });
  if (goal.length > 4000) throw Object.assign(new Error('DEVELOPMENT_GOAL_TOO_LONG'), { code: 'DEVELOPMENT_GOAL_TOO_LONG', status: 400 });
  return goal;
}

/**
 * First mandatory stage of every MEL capability/module evolution request.
 * This function deliberately does NOT inspect code or generate a patch before
 * the independent multi-AI state-of-play has completed successfully.
 */
export async function prepareDevelopmentRequest({ env, goal, context = {}, minResponses = 2, pool } = {}) {
  const objective = boundedGoal(goal);
  const council = await runAugmentioStateOfPlay({
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
  requireStateOfPlayCouncil(council);

  return {
    ok: true,
    stage: 'AI_STATE_OF_PLAY_COMPLETE',
    goal: objective,
    development_allowed: false,
    code_inspection_allowed: true,
    code_generation_allowed: false,
    council,
    next: 'INSPECT_EXISTING_CODE_AND_REUSE_BEFORE_SPEC'
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
