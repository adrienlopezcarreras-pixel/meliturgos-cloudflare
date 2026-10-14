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
 assert.throws(()=>observer.observeDevice({kind:"mini",stage:"VERIFIED",protocolReady:true}),/SESSION_UNPROVEN/);
 assert.throws(()=>observer.observeDevice({kind:"companion",stage:"VERIFIED",protocolReady:true}),/AUTH_UNPROVEN/);
 assert.throws(()=>observer.observeDevice({kind:"android",stage:"VERIFIED",protocolReady:true}),/AUTH_UNPROVEN/);
});
test("triad observer exposes only evidence-backed readiness",()=>{
 const observer=createTriadObserver(100);
 observer.observeDevice({kind:"mini",stage:"VERIFIED",protocolReady:true,sessionAckVerified:true});
 observer.observeDevice({kind:"android",stage:"VERIFIED",protocolReady:true,authenticated:true});
 observer.observeDevice({kind:"companion",stage:"VERIFIED",protocolReady:true,authorized:true});
 assert.equal(observer.snapshot(101).readyForCrossDeviceDisplay,true);
 observer.observeDevice({kind:"mini",stage:"DEGRADED",protocolReady:false});
 assert.equal(observer.snapshot(102).readyForCrossDeviceDisplay,false);
});
