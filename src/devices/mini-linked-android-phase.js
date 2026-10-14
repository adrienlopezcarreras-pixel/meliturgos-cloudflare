// MINI Link V2 read-only conversation-phase contract.
// A physical MINI sees activity only from an Android device associated with
// that MINI in android_mini_links. No text, audio, turn IDs or control rights.
const PHASES=new Set([
  "IDLE","CAPTURING","TRANSCRIBING","THINKING","RESPONDING","OTHER_BUSY","ERROR"
]);
const TTL_MS=30_000;
export async function readLinkedAndroidActivity(env,miniDeviceId,now=Date.now(),androidDeviceId=null) {
  const unavailable={ok:true,schema:"mel.mini.linked-android-phase.v1",
    source:"android",state:"UNAVAILABLE",phase:null,
    observed_at_ms:null,expires_at_ms:null,conversation_synced:false};
  if(typeof miniDeviceId!=="string"||!miniDeviceId.trim()||
     !Number.isSafeInteger(now)||now<0)return unavailable;
  try {
    const delegated=androidDeviceId!==null;
    if(delegated && (typeof androidDeviceId!=="string"||!androidDeviceId.trim()))
      return unavailable;
    const where=delegated
      ? "WHERE l.mini_device_id=? AND l.android_device_id=? AND t.revoked_at IS NULL "
      : "WHERE l.mini_device_id=? AND t.revoked_at IS NULL ";
    const query=env.DB.prepare(
      "SELECT a.phase,a.observed_at FROM android_mini_links l "+
      "JOIN android_triad_activity a ON a.device_id=l.android_device_id "+
      "JOIN android_device_tokens t ON t.device_id=l.android_device_id "+
      where+"ORDER BY a.observed_at DESC LIMIT 1"
    );
    const row=await (delegated
      ? query.bind(miniDeviceId,androidDeviceId)
      : query.bind(miniDeviceId)).first();
    if(!row||!PHASES.has(row.phase))return unavailable;
    const at=Number(row.observed_at);
    if(!Number.isSafeInteger(at)||at<=0||at>now||now-at>TTL_MS)return unavailable;
    return {ok:true,schema:"mel.mini.linked-android-phase.v1",
      source:"android",state:"FRESH",phase:row.phase,
      observed_at_ms:at,expires_at_ms:at+TTL_MS,conversation_synced:false};
  }catch{
    // Unpaired MINI, absent table, or database failure cannot imply readiness.
    return unavailable;
  }
}
