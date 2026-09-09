export { MODULE_PIPELINE, MODULE_STATES, transition } from '../core/lifecycle/extension.js';
import { port } from '../core/contracts.js';
import { requireStateOfPlayCouncil } from '../teachers/model-council.js';

/**
 * Development policy:
 * 0. Mandatory multi-AI state-of-play council.
 * 1. Synthesize what already exists, missing information, options, risks and tests.
 * 2. Only then enter need/spec/generation.
 *
 * Each stage stores immutable artifact hashes + version + input/output + failure code.
 * Resume from last successful stage. Never rerun side effects without idempotency key.
 * TODO adapters persist stages in module_lab_stages using (run_id,stage) uniqueness.
 */
export const MODULE_DEVELOPMENT_POLICY = Object.freeze({
  first_stage: 'AI_STATE_OF_PLAY',
  coding_before_state_of_play: false,
  minimum_independent_ai_responses: 2,
  synthesis_required: true,
  reuse_existing_components_first: true,
  evidence_and_test_plan_required: true
});

export function authorizeModuleDevelopment(councilReport) {
  requireStateOfPlayCouncil(councilReport);
  return { authorized: true, next: 'need' };
}

export const methods = ['need','spec','manifest','generate','validate','test','sandbox','securityReview','candidate','activate','monitor','rollback'];
export const createModuleLab = adapters => port('module-lab',methods,adapters);
