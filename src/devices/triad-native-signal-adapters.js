// Translate observed native health signals into the shared triad observer.
// No device I/O, no inferred authentication, no remote control.
export function miniLinkV2Fact(signal) {
  if (!signal || !Number.isSafeInteger(signal.observedAtMs)) throw new Error("TRIAD_MINI_SIGNAL_INVALID");
  const connected=signal.gattConnected===true;
  const verified=connected && signal.encrypted===true && signal.sessionOkAck===true;
  return {kind:"mini",observedAtMs:signal.observedAtMs,
    stage:verified?"VERIFIED":connected?"CONNECTED":"UNAVAILABLE",
    protocolReady:verified,sessionAckVerified:verified};
}
export function androidSessionFact(signal) {
  if (!signal || !Number.isSafeInteger(signal.observedAtMs)) throw new Error("TRIAD_ANDROID_SIGNAL_INVALID");
  const connected=signal.appRunning===true;
  const verified=connected && signal.authenticated===true && signal.sessionConnected===true;
  return {kind:"android",observedAtMs:signal.observedAtMs,
    stage:verified?"VERIFIED":connected?"CONNECTED":"UNAVAILABLE",
    protocolReady:verified,authenticated:verified};
}
export function windowsCompanionFact(signal) {
  if (!signal || !Number.isSafeInteger(signal.observedAtMs)) throw new Error("TRIAD_WINDOWS_SIGNAL_INVALID");
  const connected=signal.processOnline===true;
  const verified=connected && signal.deviceAuthorized===true && signal.channelApproved===true &&
    signal.haltActive===false;
  return {kind:"companion",observedAtMs:signal.observedAtMs,
    stage:verified?"VERIFIED":connected?"CONNECTED":"UNAVAILABLE",
    protocolReady:verified,authorized:verified};
}
