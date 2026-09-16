import { detectCapabilityGap } from './capability-gap-detector.js';
import { authorizeDevelopmentPlan } from './development-preflight.js';

const MODES = new Set(['propose', 'generate']);

function fail(stage, reason, extra = {}) {
  return { ok: false, stage, reason, ...extra };
}

function buildModuleSpec({ gap, authorization, context }) {
  return {
    kind: 'MODULE_EVOLUTION_REQUEST',
    goal: gap.goal,
    gap: {
      classification: gap.classification,
      confidence: gap.confidence,
      best_match: gap.best_match,
      candidates: gap.candidates,
    },
    context: context && typeof context === 'object' ? context : {},
    authorization: {
      stage: authorization.stage,
      next: authorization.next,
    },
    constraints: {
      candidate_only: true,
      commit_allowed: false,
      deployment_allowed: false,
      runtime_mutation_allowed: false,
      separate_validation_required: true,
    },
  };
}

/**
 * Connects MEL's capability-gap detector to an injected Module Lab adapter.
 *
 * This coordinator deliberately performs no repository write, commit, deploy,
 * runtime mutation or provider purchase. It only reuses an existing capability
 * or, for a real gap, asks Module Lab for a proposal/generation after the
 * existing Council + code-inspection development gate has authorized it.
 */
export async function planModuleEvolution({
  goal,
  capabilities = [],
  threshold = 2,
  preflight,
  inspection,
  moduleLab,
  mode = 'propose',
  allowGeneration = false,
  context = {},
} = {}) {
  const gap = detectCapabilityGap({ goal, capabilities, threshold });

  if (gap.classification === 'MATCHED_AVAILABLE') {
    return {
      ok: true,
      stage: 'REUSE_EXISTING_CAPABILITY',
      gap,
      next: 'USE_EXISTING_CAPABILITY',
    };
  }

  if (gap.classification === 'MATCHED_BUT_BLOCKED') {
    return fail('EXISTING_CAPABILITY_BLOCKED', 'INSPECT_BLOCKING_DEPENDENCY', {
      gap,
      next: gap.next_action,
    });
  }

  if (gap.classification === 'AMBIGUOUS') {
    return fail('GAP_REVIEW_REQUIRED', 'AMBIGUOUS_CAPABILITY_MATCH', {
      gap,
      next: gap.next_action,
    });
  }

  let authorization;
  try {
    authorization = authorizeDevelopmentPlan(preflight, inspection);
  } catch (error) {
    return fail('DEVELOPMENT_NOT_AUTHORIZED', String(error?.code || error?.message || 'DEVELOPMENT_NOT_AUTHORIZED'), {
      gap,
      next: 'COMPLETE_COUNCIL_AND_CODE_INSPECTION',
    });
  }

  const requestedMode = String(mode || 'propose').trim().toLowerCase();
  if (!MODES.has(requestedMode)) {
    return fail('MODULE_LAB_MODE_REJECTED', 'UNSUPPORTED_MODULE_LAB_MODE', { gap, authorization });
  }

  if (!moduleLab || typeof moduleLab !== 'object') {
    return fail('MODULE_LAB_UNAVAILABLE', 'MODULE_LAB_ADAPTER_REQUIRED', { gap, authorization });
  }

  const spec = buildModuleSpec({ gap, authorization, context });

  if (requestedMode === 'generate' && allowGeneration !== true) {
    return fail('GENERATION_APPROVAL_REQUIRED', 'EXPLICIT_GENERATION_APPROVAL_REQUIRED', {
      gap,
      authorization,
      spec,
    });
  }

  const method = requestedMode === 'generate' ? 'generateModule' : 'proposeModule';
  if (typeof moduleLab[method] !== 'function') {
    return fail('MODULE_LAB_UNAVAILABLE', `MODULE_LAB_${method.toUpperCase()}_REQUIRED`, {
      gap,
      authorization,
      spec,
    });
  }

  try {
    const result = await moduleLab[method](spec);
    return {
      ok: true,
      stage: requestedMode === 'generate' ? 'MODULE_GENERATION_READY' : 'MODULE_PROPOSAL_READY',
      gap,
      authorization,
      spec,
      result,
      next: 'VALIDATE_MODULE_ARTIFACTS_SEPARATELY',
    };
  } catch (error) {
    return fail('MODULE_LAB_FAILED', String(error?.code || error?.message || 'MODULE_LAB_FAILED'), {
      gap,
      authorization,
      spec,
      next: 'INSPECT_MODULE_LAB_FAILURE_WITHOUT_SIDE_EFFECTS',
    });
  }
}
