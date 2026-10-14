import test from "node:test";
import assert from "node:assert/strict";
import {createTriadObserver} from "../src/devices/triad-observer.js";

test("triad observer starts unavailable and does not infer device readiness",()=>{
 const observer=createTriadObserver(100);
 const view=observer.snapshot(101);
 assert.equal(view.devices.length,3);
 assert.equal(view.readyForCrossDeviceDisplay,false);
 assert.ok(view.devices.every(x=>!x.verified));
});
test("triad observer rejects unauthenticated verification",()=>{
 const observer=createTriadObserver(100);
 assert.throws(()=>observer.observeDevice({kind:"mini",stage:"VERIFIED",protocolReady:true,observedAtMs:101}),/SESSION_UNPROVEN/);
 assert.throws(()=>observer.observeDevice({kind:"companion",stage:"VERIFIED",protocolReady:true,observedAtMs:101}),/AUTH_UNPROVEN/);
 assert.throws(()=>observer.observeDevice({kind:"android",stage:"VERIFIED",protocolReady:true,observedAtMs:101}),/AUTH_UNPROVEN/);
});
test("triad observer exposes only evidence-backed readiness",()=>{
 const observer=createTriadObserver(100);
 observer.observeDevice({kind:"mini",stage:"VERIFIED",protocolReady:true,sessionAckVerified:true,observedAtMs:101});
 observer.observeDevice({kind:"android",stage:"VERIFIED",protocolReady:true,authenticated:true,observedAtMs:101});
 observer.observeDevice({kind:"companion",stage:"VERIFIED",protocolReady:true,authorized:true,observedAtMs:101});
 assert.equal(observer.snapshot(101).readyForCrossDeviceDisplay,true);
 observer.observeDevice({kind:"mini",stage:"DEGRADED",protocolReady:false,observedAtMs:102});
 assert.equal(observer.snapshot(102).readyForCrossDeviceDisplay,false);
});

test("triad observer marks stale verified devices degraded",()=>{
 const observer=createTriadObserver(100,1000);
 observer.observeDevice({kind:"mini",stage:"VERIFIED",protocolReady:true,sessionAckVerified:true,observedAtMs:101});
 observer.observeDevice({kind:"android",stage:"VERIFIED",protocolReady:true,authenticated:true,observedAtMs:101});
 observer.observeDevice({kind:"companion",stage:"VERIFIED",protocolReady:true,authorized:true,observedAtMs:101});
 assert.equal(observer.snapshot(1100).readyForCrossDeviceDisplay,true);
 assert.equal(observer.snapshot(1102).readyForCrossDeviceDisplay,false);
 assert.throws(()=>observer.observeDevice({kind:"mini",stage:"CONNECTED",protocolReady:false,observedAtMs:100}),/STALE/);
});
