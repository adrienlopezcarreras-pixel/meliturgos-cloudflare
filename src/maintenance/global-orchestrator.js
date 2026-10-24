import { RESET_SCOPES, globalCleanupReadiness, assertNoActiveWorkLeases } from './global-reset.js';
import { withMaintenanceLease } from './maintenance-gate.js';

/**
 * An injected orchestration boundary: NO production adapter is supplied here.
 * A caller must independently attest a restored snapshot and every domain
 * handler before ANY lease is acquired. It must also verify completed work
 * independently before producers resume.
 */
export async function executeGlobalMaintenance({
  db, ownerApproved=false, proofProvider, handlers={}, stopProducers,
  verifyProducersStopped, verifyFinalState, recover, leaseId, now=()=>Date.now()
}={}) {
  if (ownerApproved !== true) throw Error('MAINTENANCE_OWNER_APPROVAL_REQUIRED');
  if (typeof proofProvider !== 'function' || typeof stopProducers !== 'function' ||
      typeof verifyProducersStopped !== 'function' || typeof verifyFinalState !== 'function' ||
      typeof recover !== 'function') throw Error('MAINTENANCE_REQUIRED_ADAPTERS_MISSING');
  const proofs=await proofProvider();
  const readiness=globalCleanupReadiness(proofs);
  if (!readiness.ready) return {status:'BLOCKED',mutated:false,blockers:readiness.blockers};
  // A running signed WORK DAG lease must not be interrupted by maintenance.
  await assertNoActiveWorkLeases(db,{now:now()});
  if (RESET_SCOPES.some(scope=>typeof handlers[scope] !== 'function'))
    throw Error('MAINTENANCE_DOMAIN_HANDLER_MISSING');
  // The final verifier must check actual producer state, active projections,
  // preserved patrimony, and absence of stale work, never trust handler claims.
  return withMaintenanceLease(db,{
    leaseId,now,
    run:async()=>{
      await stopProducers();
      if ((await verifyProducersStopped()) !== true)
        throw Error('MAINTENANCE_PRODUCERS_NOT_STOPPED');
      const results={};
      for (const scope of RESET_SCOPES) {
        results[scope]=await handlers[scope]();
      }
      return {results};
    },
    recover,
    verify:async context=>{
      const result=await verifyFinalState(context);
      return result?.independently_verified === true && result?.reconciled === true
        ? result : {independently_verified:false,reconciled:false};
    }
  });
}
