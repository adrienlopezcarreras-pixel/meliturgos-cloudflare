// Passive cross-device conversation metadata only.
// A paired Windows Companion may read the latest fresh Android phase, never
// message text, audio, turn identifiers, or authority for desktop commands.
// Revoke/HALT are checked by the invoking authenticated computer route.
const PHASES = new Set([
  "IDLE","CAPTURING","TRANSCRIBING","THINKING","RESPONDING","OTHER_BUSY","ERROR"
]);
const TTL_MS=30_000;

export async function readAndroidTriadActivityForCompanion(env,now=Date.now()) {
  const unavailable={ok:true,schema:"mel.triad.android-presence.v1",
    source:"android",state:"UNAVAILABLE",phase:null,
    observed_at_ms:null,expires_at_ms:null,owner_control_verified:false};
  if(!Number.isSafeInteger(now)||now<0)throw new Error("TRIAD_READ_TIME_INVALID");
  if(!env?.DB)return unavailable;
  try{
    const row=await env.DB.prepare(
      "SELECT a.phase,a.observed_at FROM android_triad_activity a "+
      "JOIN android_device_tokens t ON t.device_id=a.device_id "+
      "WHERE t.revoked_at IS NULL ORDER BY a.observed_at DESC LIMIT 1"
    ).first();
    if(!row||!PHASES.has(row.phase))return unavailable;
    const at=Number(row.observed_at);
    if(!Number.isSafeInteger(at)||at<=0||at>now||now-at>TTL_MS)return unavailable;
    return {ok:true,schema:"mel.triad.android-presence.v1",source:"android",
      state:"FRESH",phase:row.phase,observed_at_ms:at,
      expires_at_ms:at+TTL_MS,owner_control_verified:false};
  }catch{
    // Missing tables or unavailable D1 do not grant any "online" proof.
    return unavailable;
  }
}
