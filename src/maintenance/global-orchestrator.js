import { RESET_SCOPES, globalCleanupReadiness, assertNoActiveWorkLeases } from './global-reset.js';
import { withMaintenanceLease, checkpointMaintenanceLease } from './maintenance-gate.js';

/**
 * An injected orchestration boundary: NO production adapter is supplied here.
 * A caller must independently attest a restored snapshot and every domain
 * handler before ANY lease is acquired. Stop evidence is collected after the
 * fence and shutdown, then all proofs are refreshed before any reset. Completed
 * work is independently verified before producers resume.
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
  // Shutdown evidence cannot exist before this coordinator stops producers.
  // Only that runtime prerequisite is deferred; restore/domain gates stay here.
  const preflightBlockers=readiness.blockers.filter(code=>code!=='PRODUCER_FENCE_NOT_VERIFIED');
  if (preflightBlockers.length) return {status:'BLOCKED',mutated:false,blockers:preflightBlockers};
  // A running signed WORK DAG lease must not be interrupted by maintenance.
  await assertNoActiveWorkLeases(db,{now:now()});
  if (RESET_SCOPES.some(scope=>typeof handlers[scope] !== 'function'))
    throw Error('MAINTENANCE_DOMAIN_HANDLER_MISSING');
  // The final verifier must check actual producer state, active projections,
  // preserved patrimony, and absence of stale work, never trust handler claims.
  return withMaintenanceLease(db,{
    leaseId,now,
    run:async()=>{
      await checkpointMaintenanceLease(db,{leaseId,phase:'STOPPING_PRODUCERS',now:now()});
      await stopProducers();
      if ((await verifyProducersStopped()) !== true)
        throw Error('MAINTENANCE_PRODUCERS_NOT_STOPPED');
      // Drain WORK again after producer shutdown (#2609).
      await assertNoActiveWorkLeases(db,{now:now()});
      // A stop callback's return value is not proof. Require fresh, complete
      // evidence from the independent provider, including restore and domains.
      const stoppedReadiness=globalCleanupReadiness(await proofProvider());
      if (!stoppedReadiness.ready) {
        throw Object.assign(new Error('MAINTENANCE_POST_STOP_PROOF_REQUIRED'), {
          code:'MAINTENANCE_POST_STOP_PROOF_REQUIRED',blockers:stoppedReadiness.blockers,
        });
      }
      await checkpointMaintenanceLease(db,{leaseId,phase:'PRODUCERS_STOPPED',now:now()});
      const results={};
      for (const scope of RESET_SCOPES) {
        await checkpointMaintenanceLease(db,{leaseId,phase:'RESET_STARTED',scope,now:now()});
        results[scope]=await handlers[scope]();
        await checkpointMaintenanceLease(db,{leaseId,phase:'RESET_COMPLETED',scope,now:now()});
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
