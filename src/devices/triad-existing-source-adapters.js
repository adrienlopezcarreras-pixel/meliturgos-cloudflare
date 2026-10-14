// Translate exact fields exposed by existing native MEL sources.
// These functions are pure: trusted collectors still have to supply records.
// Do not treat a transport connection as permission for device control.

function time(signal) {
  if (!signal || !Number.isSafeInteger(signal.observedAtMs) || signal.observedAtMs < 0) {
    throw new Error("TRIAD_SOURCE_OBSERVED_AT_REQUIRED");
  }
  return signal.observedAtMs;
}

// MelLinkV2ClientService companion object exposes miniReady and protocolReady
// StateFlows. protocolReady becomes true only on validated SESSION_OK.
export function miniLinkV2ClientFlowFact(signal) {
  const observedAtMs=time(signal);
  const connected=signal.miniReady===true;
  const verified=connected && signal.protocolReady===true;
  return Object.freeze({kind:"mini",observedAtMs,stage:verified?"VERIFIED":connected?"CONNECTED":"UNAVAILABLE",
    protocolReady:verified,sessionAckVerified:verified});
}

// MelViewModel.MelUiState.session is DISCONNECTED, VERIFYING, CONNECTED or ERROR.
// CONNECTED follows a successful authenticated MEL API heartbeat.
export function androidMelUiStateFact(signal) {
  const observedAtMs=time(signal);
  const session=signal.session;
  if (!["DISCONNECTED","VERIFYING","CONNECTED","ERROR"].includes(session)) throw new Error("TRIAD_ANDROID_SESSION_UNKNOWN");
  const connected=session==="VERIFYING" || session==="CONNECTED";
  const verified=session==="CONNECTED";
  return Object.freeze({kind:"android",observedAtMs,
    stage:verified?"VERIFIED":session==="ERROR"?"DEGRADED":connected?"CONNECTED":"UNAVAILABLE",
    protocolReady:verified,authenticated:verified});
}

// computer-companion-api.normalizeDevice() returns online, halted, platform,
// metadata.remote_access_enabled and last_seen_at. The API record alone
// NEVER proves consent to execute: it is CONNECTED at most. A separate,
// trusted, current local owner consent signal is required for VERIFIED.
export function windowsDeviceRecordFact(signal) {
  const observedAtMs=time(signal);
  const device=signal.device;
  if (!device || typeof device !== "object") throw new Error("TRIAD_WINDOWS_DEVICE_MISSING");
  if (String(device.platform||"").toLowerCase()!=="windows") throw new Error("TRIAD_WINDOWS_PLATFORM");
  const online=device.online===true;
  const halted=device.halted===true;
  const allowed=online && !halted && device.metadata?.remote_access_enabled===true &&
    signal.localOwnerApproval===true && signal.authenticatedChannel===true;
  return Object.freeze({kind:"companion",observedAtMs,
    stage:allowed?"VERIFIED":halted?"DEGRADED":online?"CONNECTED":"UNAVAILABLE",
    protocolReady:allowed,authorized:allowed});
}
