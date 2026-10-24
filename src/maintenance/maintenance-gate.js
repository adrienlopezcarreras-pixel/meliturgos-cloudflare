// Owner maintenance lease: TEMPORARY and explicitly released on verified
// completion or safe rollback. No implicit permanent PAUSED flag.
// A scheduler treats expired leases as unsafe until recovery confirms outcome.
export const MAINTENANCE_FENCE_ID = 'mel-global-maintenance-fence';
const MAX_LEASE_MS = 60 * 60 * 1000;

export async function readMaintenanceFence(db, { now = Date.now() } = {}) {
  if (!db?.prepare) return {paused:true,reason:'DB_UNAVAILABLE'};
  try {
    const row = await db.prepare(
      'SELECT status,metadata_json FROM dev_bridge_state WHERE bridge_id=? LIMIT 1'
    ).bind(MAINTENANCE_FENCE_ID).first();
    if (!row) return {paused:false,reason:null};
    const status=String(row.status || '').toUpperCase();
    if (status !== 'PAUSED') return {paused:false,reason:null};
    let metadata;
    try {metadata=JSON.parse(row.metadata_json || '{}');}
    catch {return {paused:true,reason:'INVALID_MAINTENANCE_LEASE'};}
    if (!Number.isSafeInteger(metadata.expires_at) || !metadata.lease_id) {
      return {paused:true,reason:'UNVERIFIED_MAINTENANCE_LEASE'};
    }
    return {paused:true,reason:now >= metadata.expires_at ?
      'EXPIRED_MAINTENANCE_REQUIRES_RECOVERY' : 'MAINTENANCE_IN_PROGRESS'};
  } catch {
    return {paused:true,reason:'DB_READ_FAILED'};
  }
}

export async function startMaintenanceLease(db, {leaseId, now=Date.now(), ttlMs=MAX_LEASE_MS} = {}) {
  if (!db?.prepare || !String(leaseId || '').trim()) throw Error('MAINTENANCE_LEASE_INPUT_REQUIRED');
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(ttlMs) || ttlMs<1000 || ttlMs>MAX_LEASE_MS)
    throw Error('MAINTENANCE_LEASE_DURATION_INVALID');
  const current=await readMaintenanceFence(db,{now});
  if (current.paused) throw Error('MAINTENANCE_ALREADY_PAUSED_OR_RECOVERY_REQUIRED');
  const meta=JSON.stringify({lease_id:leaseId,started_at:now,expires_at:now+ttlMs});
  const result=await db.prepare(
    "INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,'PAUSED',?) ON CONFLICT(bridge_id) DO UPDATE SET last_seen=excluded.last_seen,status='PAUSED',metadata_json=excluded.metadata_json WHERE dev_bridge_state.status!='PAUSED'"
  ).bind(MAINTENANCE_FENCE_ID,now,meta).run();
  if (Number(result?.meta?.changes)!==1) throw Error('MAINTENANCE_LEASE_CONFLICT');
  return {lease_id:leaseId,expires_at:now+ttlMs};
}

// Call after ALL scopes are verified clean, or after an aborted maintenance
// has been safely reconciled. A stale owner cannot release another lease.
export async function finishMaintenanceLease(db, {leaseId, reconciled=false, now=Date.now()} = {}) {
  if (!db?.prepare || !String(leaseId || '').trim()) throw Error('MAINTENANCE_LEASE_INPUT_REQUIRED');
  if (reconciled !== true) throw Error('MAINTENANCE_RECONCILIATION_REQUIRED');
  const result=await db.prepare(
    "UPDATE dev_bridge_state SET status='RUNNING',last_seen=?,metadata_json=? WHERE bridge_id=? AND status='PAUSED' AND json_extract(metadata_json,'$.lease_id')=?"
  ).bind(now,JSON.stringify({last_completed_at:now,last_lease_id:leaseId}),
    MAINTENANCE_FENCE_ID,leaseId).run();
  if (Number(result?.meta?.changes)!==1) throw Error('MAINTENANCE_RELEASE_CONFLICT');
  return {paused:false,released:true};
}

/**
 * Lifecycle coordinator. The operation must return an independently checked
 * reconciliation result. On failure, recovery must explicitly reconcile before
 * WORK can resume; the lease is never silently abandoned.
 */
export async function withMaintenanceLease(db,{
  leaseId,now=()=>Date.now(),ttlMs,run,recover,verify
}={}) {
  if (typeof run !== 'function') throw Error('MAINTENANCE_RUN_REQUIRED');
  // Independent verification must exist BEFORE acquiring a production pause.
  if (typeof verify !== 'function') throw Error('MAINTENANCE_INDEPENDENT_VERIFIER_REQUIRED');
  await startMaintenanceLease(db,{leaseId,now:now(),ttlMs});
  let result;
  let recovered=false;
  try {
    result=await run();
  } catch (error) {
    if (typeof recover !== 'function') throw error;
    result=await recover(error);
    recovered=true;
  }
  // Never trust a self-reported {reconciled:true} from a cleanup worker.
  // If verification throws or rejects, keep the fence and require recovery.
  const proof=await verify({leaseId,result,recovered});
  if (proof?.reconciled !== true || proof?.independently_verified !== true) {
    throw Error('MAINTENANCE_INDEPENDENT_RECONCILIATION_REQUIRED');
  }
  await finishMaintenanceLease(db,{leaseId,reconciled:true,now:now()});
  return {status:recovered?'RECOVERED':'COMPLETED',reconciled:true,result};
}
