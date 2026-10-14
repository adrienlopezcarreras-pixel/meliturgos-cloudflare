import test from "node:test";
import assert from "node:assert/strict";
import {createTriadObserver} from "../src/devices/triad-observer.js";
import {miniLinkV2Fact,androidSessionFact,windowsCompanionFact} from "../src/devices/triad-native-signal-adapters.js";
test("native observations do not elevate transport-only connections",()=>{
 const o=createTriadObserver(100);
 o.observeDevice(miniLinkV2Fact({observedAtMs:101,gattConnected:true,encrypted:true,sessionOkAck:false}));
 o.observeDevice(androidSessionFact({observedAtMs:101,appRunning:true,authenticated:false,sessionConnected:true}));
 o.observeDevice(windowsCompanionFact({observedAtMs:101,processOnline:true,deviceAuthorized:true,channelApproved:true,haltActive:true}));
 assert.equal(o.snapshot(102).readyForCrossDeviceDisplay,false);
 assert.ok(o.snapshot(102).devices.every(x=>!x.verified));
});
test("three independently verified native signals produce readiness then expire",()=>{
 const o=createTriadObserver(100,1000);
 o.observeDevice(miniLinkV2Fact({observedAtMs:101,gattConnected:true,encrypted:true,sessionOkAck:true}));
 o.observeDevice(androidSessionFact({observedAtMs:101,appRunning:true,authenticated:true,sessionConnected:true}));
 o.observeDevice(windowsCompanionFact({observedAtMs:101,processOnline:true,deviceAuthorized:true,channelApproved:true,haltActive:false}));
 assert.equal(o.snapshot(102).readyForCrossDeviceDisplay,true);
 assert.equal(o.snapshot(1102).readyForCrossDeviceDisplay,false);
});
