// Read-only desktop request claim policy. It never executes or exposes desktop actions.
export function evaluateDesktopViewClaim({plan,device,now=Date.now()}={}) {
  if (!plan || plan.schema!=='mel.companion.desktop-view-request/v1' ||
      plan.action!=='desktop.view.request' || plan.screen_capture_only!==true ||
      plan.requires_local_stop!==true) return {ok:false,code:'DESKTOP_VIEW_PLAN_FORBIDDEN'};
  if (!device || device.id!==plan.device_id || String(device.platform||'').toLowerCase()!=='windows') {
    return {ok:false,code:'DESKTOP_VIEW_DEVICE_MISMATCH'};
  }
  if (device.halted===true || Number(device.halted)===1) return {ok:false,code:'DESKTOP_VIEW_OWNER_HALT'};
  const seen=Number(device.last_seen_at);
  if (!Number.isFinite(seen)||seen<=0||seen>now||now-seen>20_000) {
    return {ok:false,code:'DESKTOP_VIEW_DEVICE_OFFLINE'};
  }
  const expiry=Number(plan.expires_at);
  if (!Number.isFinite(expiry)||expiry<=now||expiry>now+300_000) {
    return {ok:false,code:'DESKTOP_VIEW_EXPIRED'};
  }
  if (typeof plan.session_id!=='string'||!plan.session_id.trim()) {
    return {ok:false,code:'DESKTOP_VIEW_SESSION_INVALID'};
  }
  return {ok:true,device_id:device.id,expires_at:expiry,action:'desktop.view.request'};
}
