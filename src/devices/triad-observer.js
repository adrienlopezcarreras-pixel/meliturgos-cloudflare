import {createTriadTurn,advanceTriadTurn} from "./triad-conversation-state.js";
import {projectTriadSnapshot} from "./triad-snapshot-projection.js";

// Read-only coordinator: no network, microphone, BLE or PC side effects.
// Native clients supply observed facts; missing evidence is never promoted to VERIFIED.
export function createTriadObserver(startMs=Date.now()) {
  let turn=createTriadTurn(startMs);
  const devices=new Map(["mini","android","companion"].map(kind=>[kind,{
    kind,stage:"UNAVAILABLE",protocolReady:false,sessionAckVerified:false,authorized:false
  }]));
  return Object.freeze({
    observeTurn(event) {
      turn=advanceTriadTurn(turn,event);
      return turn;
    },
    observeDevice(fact) {
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
      return item;
    },
    snapshot(atMs=Date.now()) {
      return projectTriadSnapshot({turn,devices:[...devices.values()],observedAtMs:atMs});
    }
  });
}
