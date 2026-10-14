import {triadConversationPresentation, triadReadinessPresentation} from "./triad-presentation-contract.js";

// Side-effect-free projection. Each client can render this same snapshot using
// its existing authenticated channel; this code never sends a command.
const KINDS=["mini","android","companion"];
const LEVELS=["UNAVAILABLE","CONNECTED","VERIFIED","DEGRADED"];
export function projectTriadSnapshot({turn,devices,observedAtMs}) {
  if (!turn || !Number.isSafeInteger(turn.revision) || turn.revision<0 ||
      !Number.isSafeInteger(observedAtMs) || observedAtMs<turn.updatedAtMs) {
    throw new Error("TRIAD_SNAPSHOT_INVALID");
  }
  if (!Array.isArray(devices) || devices.length!==KINDS.length) throw new Error("TRIAD_DEVICES_INCOMPLETE");
  const unique=new Set();
  const views=devices.map(device=>{
    if (!device || !KINDS.includes(device.kind) || unique.has(device.kind)) throw new Error("TRIAD_DEVICE_DUPLICATE_OR_UNKNOWN");
    unique.add(device.kind);
    if (!LEVELS.includes(device.stage) || typeof device.protocolReady!=="boolean") throw new Error("TRIAD_DEVICE_STATUS_INVALID");
    if (device.stage==="VERIFIED" && !device.protocolReady) throw new Error("TRIAD_DEVICE_NOT_VERIFIED");
    if (device.kind==="mini" && device.stage==="VERIFIED" && device.sessionAckVerified!==true) throw new Error("TRIAD_MINI_ACK_MISSING");
    if (device.kind==="companion" && device.stage==="VERIFIED" && device.authorized!==true) throw new Error("TRIAD_COMPANION_AUTH_MISSING");
    return Object.freeze({kind:device.kind,...triadReadinessPresentation(device.stage)});
  });
  const expired=turn.expiresAtMs!==null && observedAtMs>=turn.expiresAtMs;
  const active=["WAKE_DETECTED","CAPTURING","TRANSCRIBING","THINKING","RESPONDING"].includes(turn.state);
  const conversation=triadConversationPresentation(expired && active?"EXPIRED":turn.state);
  const android=views.find(v=>v.kind==="android");
  return Object.freeze({
    schema:"mel.triad.presentation.v1",
    revision:turn.revision,
    observedAtMs,
    turnId:turn.turnId,
    conversation,
    devices:Object.freeze(views),
    // The microphone indicator is a claimed UI state, not proof of OS capture.
    microphoneIndicator:conversation.microphoneShownActive && android.verified?"listening":"off",
    readyForCrossDeviceDisplay:views.every(v=>v.verified)&&!expired
  });
}
