import { ZeroEuroGovernor } from './zero-euro-governor.js';
import { createDefaultAugmentioPool } from './default-pool.js';
import { withStoredZeroCostProofs } from './zero-cost-proof-store.js';

// Prove governor behavior, not inference quality, billing or provider availability.
// The separate measured-neuron reservation remains mandatory for real calls.
// No model invocation, health request, fabricated positive authorization or write.
export async function verifyZeroEuroPolicy(env = {}) {
  const current = await withStoredZeroCostProofs(env);
  if (typeof current?.AI?.run !== 'function') throw Object.assign(new Error('ZERO_EURO_RUNTIME_PROOF_REQUIRED'), { code: 'ZERO_EURO_RUNTIME_PROOF_REQUIRED' });
  const governor = new ZeroEuroGovernor();
  const authorized = createDefaultAugmentioPool(current).list({ capability: 'CODE' })
    .filter(candidate => candidate.costProvenance?.source === 'cloudflare-workers-free-plan-short-lived-proof'
      && governor.allows(candidate));
  if (!authorized.length) throw Object.assign(new Error('ZERO_EURO_RUNTIME_PROOF_REQUIRED'), { code: 'ZERO_EURO_RUNTIME_PROOF_REQUIRED' });
  const candidate = authorized[0], proof = candidate.costProvenance;
  const reject = (changes, code) => [{ ...candidate, ...changes }, code];
  const cases = [
    reject({ costProvenance: null, cost_provenance: null }, 'ZERO_EURO_PROVENANCE_REQUIRED'),
    reject({ costProvenance: { ...proof, addedCost: null, added_cost: null } }, 'ZERO_EURO_ADDED_COST_UNKNOWN'),
    reject({ costProvenance: { ...proof, addedCost: 1 } }, 'ZERO_EURO_ADDED_COST_NOT_ZERO'),
    reject({ costProvenance: { ...proof, authorization: { ...proof.authorization, approved: false } } }, 'ZERO_EURO_AUTHORIZATION_REQUIRED'),
    reject({ estimatedCost: null, cost: null }, 'ZERO_EURO_COST_UNKNOWN'),
    reject({ estimatedCost: 1 }, 'ZERO_EURO_BUDGET_EXCEEDED'),
    reject({ id: candidate.id + '-identity-probe' }, 'ZERO_EURO_AUTHORIZATION_REQUIRED'),
  ];
  const failed = () => Object.assign(new Error('ZERO_EURO_RUNTIME_GUARD_FAILED'), { code: 'ZERO_EURO_RUNTIME_GUARD_FAILED' });
  for (const [blocked, expected] of cases) {
    const result = governor.evaluate(blocked);
    if (result.allowed !== false || result.code !== expected || governor.allows(blocked) !== false) throw failed();
    let denied = false;
    try { governor.assertAllowed(blocked); }
    catch (error) { if (error?.code !== expected) throw failed(); denied = true; }
    if (!denied) throw failed();
  }
  if (governor.evaluate(candidate).allowed !== true || !governor.allows(candidate)
    || governor.assertAllowed(candidate) !== true) throw failed();
  return { ok: true, negative_checks: cases.length, authorized_providers: authorized.length };
}
