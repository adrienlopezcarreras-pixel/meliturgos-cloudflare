export { MODULE_PIPELINE, MODULE_STATES, transition } from '../core/lifecycle/extension.js';
import { port } from '../core/contracts.js';
/** Each stage stores immutable artifact hashes + version + input/output + failure code.
 * Resume from last successful stage. Never rerun side effects without idempotency key.
 * TODO adapters persist stages in module_lab_stages using (run_id,stage) uniqueness.
 */
export const methods = ['need','spec','manifest','generate','validate','test','sandbox','securityReview','candidate','activate','monitor','rollback'];
export const createModuleLab = adapters => port('module-lab',methods,adapters);
