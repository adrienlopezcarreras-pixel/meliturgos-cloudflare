// Server-side policy only. This does not grant control of a Windows desktop.
export const DESKTOP_SESSION_SCHEMA = 'mel.companion.desktop-session/v1';
export const DESKTOP_SESSION_MAX_MS = 5 * 60 * 1000;
const SCOPES = new Set(['view', 'interactive']);

export function evaluateDesktopSession({
  session, device, now=Date.now(), requestedScope='view',
}={}) {
  if (!SCOPES.has(requestedScope)) return {ok:false,code:'DESKTOP_SCOPE_FORBIDDEN'};
  if (!session || session.schema !== DESKTOP_SESSION_SCHEMA) return {ok:false,code:'DESKTOP_SESSION_INVALID'};
  if (!device || device.id !== session.device_id || String(device.platform||'').toLowerCase() !== 'windows') {
    return {ok:false,code:'DESKTOP_DEVICE_MISMATCH'};
  }
  // Local approval must be backed by a fresh device heartbeat, not a stale record.
  const lastSeen=Number(device.last_seen_at);
  if (!Number.isFinite(lastSeen) || lastSeen<=0 || lastSeen>now || now-lastSeen>20_000) {
    return {ok:false,code:'DESKTOP_DEVICE_OFFLINE'};
  }
  if (device.halted === true || Number(device.halted) === 1 || session.revoked === true) {
    return {ok:false,code:'DESKTOP_SESSION_REVOKED'};
  }
  if (session.owner_authenticated !== true || session.local_approved !== true) {
    return {ok:false,code:'DESKTOP_LOCAL_CONSENT_REQUIRED'};
  }
  const issued=Number(session.issued_at);
  const expires=Number(session.expires_at);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued>now || expires<=now ||
      expires<=issued || expires-issued>DESKTOP_SESSION_MAX_MS) {
    return {ok:false,code:'DESKTOP_SESSION_EXPIRED_OR_UNBOUNDED'};
  }
  if (requestedScope==='interactive' && session.scope!=='interactive') {
    return {ok:false,code:'DESKTOP_INTERACTIVE_CONSENT_REQUIRED'};
  }
  if (!SCOPES.has(session.scope)) return {ok:false,code:'DESKTOP_SCOPE_FORBIDDEN'};
  return {ok:true,device_id:device.id,scope:requestedScope,expires_at:expires};
}
