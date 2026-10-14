import {createTriadTurn,advanceTriadTurn} from "./triad-conversation-state.js";
import {projectTriadSnapshot} from "./triad-snapshot-projection.js";
import {miniLinkV2Fact,androidSessionFact,windowsCompanionFact} from "./triad-native-signal-adapters.js";

// Read-only coordinator: no network, microphone, BLE or PC side effects.
// Native clients supply observed facts; missing evidence is never promoted to VERIFIED.
export function createTriadObserver(startMs=Date.now(), freshnessMs=30_000) {
  if (!Number.isSafeInteger(freshnessMs) || freshnessMs<1000 || freshnessMs>300_000) throw new Error("TRIAD_FRESHNESS_INVALID");
  let turn=createTriadTurn(startMs);
  const observedAt=new Map();
  const devices=new Map(["mini","android","companion"].map(kind=>[kind,{
    kind,stage:"UNAVAILABLE",protocolReady:false,sessionAckVerified:false,authorized:false
  }]));
  return Object.freeze({
    observeTurn(event) {
      turn=advanceTriadTurn(turn,event);
      return turn;
    },
    observeNative(kind, signal) {
      if (kind === "mini") return this.observeDevice(miniLinkV2Fact(signal));
      if (kind === "android") return this.observeDevice(androidSessionFact(signal));
      if (kind === "companion") return this.observeDevice(windowsCompanionFact(signal));
      throw new Error("TRIAD_NATIVE_SOURCE_INVALID");
    },
    observeDevice(fact) {
      if (!Number.isSafeInteger(fact?.observedAtMs) || fact.observedAtMs<startMs) throw new Error("TRIAD_OBSERVATION_TIME");
      if (fact.observedAtMs < (observedAt.get(fact.kind) ?? startMs)) throw new Error("TRIAD_OBSERVATION_STALE");
      if (!fact || !devices.has(fact.kind)) throw new Error("TRIAD_DEVICE_KIND");
      if (!["UNAVAILABLE","CONNECTED","VERIFIED","DEGRADED"].includes(fact.stage)) throw new Error("TRIAD_DEVICE_STAGE");
      const ready=fact.protocolReady===true;
      const verified=fact.stage==="VERIFIED";
      if (verified && !ready) throw new Error("TRIAD_PROTOCOL_UNPROVEN");
      if (fact.kind==="mini" && verified && fact.sessionAckVerified!==true) throw new Error("TRIAD_MINI_SESSION_UNPROVEN");
      if (fact.kind==="companion" && verified && fact.authorized!==true) throw new Error("TRIAD_COMPANION_AUTH_UNPROVEN");
      if (fact.kind==="android" && verified && fact.authenticated!==true) throw new Error("TRIAD_ANDROID_AUTH_UNPROVEN");
      const item=Object.freeze({kind:fact.kind,stage:fact.stage,protocolReady:ready,
        sessionAckVerified:fact.sessionAckVerified===true,authorized:fact.authorized===true});
      devices.set(fact.kind,item);
      observedAt.set(fact.kind,fact.observedAtMs);
      return item;
    },
    snapshot(atMs=Date.now()) {
      if (!Number.isSafeInteger(atMs) || atMs<startMs) throw new Error("TRIAD_SNAPSHOT_TIME");
      const current=[...devices.values()].map(device=>{
        const last=observedAt.get(device.kind);
        return last!==undefined && (last>atMs || atMs-last>freshnessMs)
          ? {...device,stage:"DEGRADED",protocolReady:false,sessionAckVerified:false,authorized:false}
          : device;
      });
      return projectTriadSnapshot({turn,devices:current,observedAtMs:atMs});
    }
  });
}
