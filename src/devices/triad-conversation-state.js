// Cross-device conversation state reducer. Pure JS: no I/O, no hardware claims.
// Consumers may forward events over their existing authenticated channels.
export const TRIAD_STATES = Object.freeze([
  "IDLE","WAKE_DETECTED","CAPTURING","TRANSCRIBING","THINKING","RESPONDING",
  "HALTED","PERMISSION_REVOKED","LINK_LOST","EXPIRED","ERROR"
]);

const NEXT = Object.freeze({
  IDLE: ["WAKE_DETECTED"],
  WAKE_DETECTED: ["CAPTURING"],
  CAPTURING: ["TRANSCRIBING"],
  TRANSCRIBING: ["THINKING"],
  THINKING: ["RESPONDING"],
  RESPONDING: ["IDLE"]
});
const INTERRUPT = new Set(["HALTED","PERMISSION_REVOKED","LINK_LOST","EXPIRED","ERROR"]);
const ACTIVE = new Set(["WAKE_DETECTED","CAPTURING","TRANSCRIBING","THINKING","RESPONDING"]);
const SOURCES = new Set(["android","mini","companion","backend"]);
const MAX_TURN_ID = 96;

export function createTriadTurn(nowMs = Date.now()) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("TRIAD_TIME_INVALID");
  return Object.freeze({state:"IDLE",turnId:null,deviceId:null,updatedAtMs:nowMs,expiresAtMs:null,revision:0,reason:null});
}

// Immutable, deterministic reduction: no synthesized ACKs or implied device readiness.
// Event: { type, source, turnId, deviceId, atMs, expiresAtMs?, reason? }.
// A terminal interrupt must be acknowledged by a NEW user-authorized WAKE_DETECTED.
export function advanceTriadTurn(previous, event) {
  if (!previous || !TRIAD_STATES.includes(previous.state)) throw new Error("TRIAD_STATE_INVALID");
  if (!event || typeof event !== "object" || !TRIAD_STATES.includes(event.type)) throw new Error("TRIAD_EVENT_INVALID");
  if (!SOURCES.has(event.source)) throw new Error("TRIAD_SOURCE_INVALID");
  if (!Number.isSafeInteger(event.atMs) || event.atMs < previous.updatedAtMs) throw new Error("TRIAD_CLOCK_REGRESSION");
  if (typeof event.turnId !== "string" || !/^[a-zA-Z0-9_-]{8,96}$/.test(event.turnId)) throw new Error("TRIAD_TURN_ID_INVALID");
  if (typeof event.deviceId !== "string" || !/^[a-zA-Z0-9_.:-]{2,96}$/.test(event.deviceId)) throw new Error("TRIAD_DEVICE_ID_INVALID");

  const freshWake = event.type === "WAKE_DETECTED" && (previous.state === "IDLE" || INTERRUPT.has(previous.state));
  if (freshWake) {
    if (event.source !== "android" && event.source !== "mini") throw new Error("TRIAD_WAKE_SOURCE_INVALID");
    if (previous.turnId === event.turnId) throw new Error("TRIAD_TURN_REPLAY");
    if (!Number.isSafeInteger(event.expiresAtMs) || event.expiresAtMs <= event.atMs || event.expiresAtMs - event.atMs > 300000) {
      throw new Error("TRIAD_EXPIRY_INVALID");
    }
    return Object.freeze({state:event.type,turnId:event.turnId,deviceId:event.deviceId,updatedAtMs:event.atMs,
      expiresAtMs:event.expiresAtMs,revision:previous.revision+1,reason:null});
  }
  if (event.turnId !== previous.turnId || event.deviceId !== previous.deviceId) throw new Error("TRIAD_TURN_MISMATCH");
  if (previous.expiresAtMs == null || event.atMs >= previous.expiresAtMs) {
    if (event.type !== "EXPIRED" || !ACTIVE.has(previous.state)) throw new Error("TRIAD_TURN_EXPIRED");
  }
  if (ACTIVE.has(previous.state) && INTERRUPT.has(event.type)) {
    if (!event.reason || typeof event.reason !== "string" || event.reason.length > 160) throw new Error("TRIAD_INTERRUPT_REASON_REQUIRED");
  } else if (!NEXT[previous.state]?.includes(event.type)) {
    throw new Error("TRIAD_TRANSITION_DENIED");
  }
  return Object.freeze({...previous,state:event.type,updatedAtMs:event.atMs,revision:previous.revision+1,
    reason:INTERRUPT.has(event.type)?event.reason:null});
}
