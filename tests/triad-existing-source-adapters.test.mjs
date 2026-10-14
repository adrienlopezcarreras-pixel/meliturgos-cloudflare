import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createTriadObserver} from "../src/devices/triad-observer.js";
import {miniLinkV2ClientFlowFact,androidMelUiStateFact,windowsDeviceRecordFact} from "../src/devices/triad-existing-source-adapters.js";

const computer={id:"windows-12345678",platform:"windows",online:true,halted:false,
  last_seen_at:101,metadata:{remote_access_enabled:true}};

test("actual Android Link V2 flow cannot equate GATT connection with session approval",()=>{
  const connected=miniLinkV2ClientFlowFact({observedAtMs:101,miniReady:true,protocolReady:false});
  assert.equal(connected.stage,"CONNECTED");
  assert.equal(connected.protocolReady,false);
  const verified=miniLinkV2ClientFlowFact({observedAtMs:102,miniReady:true,protocolReady:true});
  assert.equal(verified.stage,"VERIFIED");
  assert.equal(miniLinkV2ClientFlowFact({observedAtMs:103,miniReady:false,protocolReady:true}).stage,"UNAVAILABLE");
});

test("actual MelUiState CONNECTED after heartbeat is distinguishable from VERIFYING",()=>{
  assert.equal(androidMelUiStateFact({observedAtMs:101,session:"VERIFYING"}).stage,"CONNECTED");
  assert.equal(androidMelUiStateFact({observedAtMs:102,session:"CONNECTED"}).stage,"VERIFIED");
  assert.equal(androidMelUiStateFact({observedAtMs:103,session:"ERROR"}).stage,"DEGRADED");
  assert.throws(()=>androidMelUiStateFact({observedAtMs:104,session:"UNKNOWN"}),/SESSION_UNKNOWN/);
});

test("Companion API device record alone cannot establish owner approval",()=>{
  assert.equal(windowsDeviceRecordFact({observedAtMs:101,device:computer}).stage,"CONNECTED");
  assert.equal(windowsDeviceRecordFact({observedAtMs:101,device:computer,localOwnerApproval:true}).stage,"CONNECTED");
  assert.equal(windowsDeviceRecordFact({observedAtMs:101,device:computer,authenticatedChannel:true}).stage,"CONNECTED");
  assert.equal(windowsDeviceRecordFact({observedAtMs:101,device:computer,
    authenticatedChannel:true,localOwnerApproval:true}).stage,"VERIFIED");
  assert.equal(windowsDeviceRecordFact({observedAtMs:101,device:{...computer,halted:true},
    authenticatedChannel:true,localOwnerApproval:true}).stage,"DEGRADED");
  assert.equal(windowsDeviceRecordFact({observedAtMs:101,device:{...computer,metadata:{}},
    authenticatedChannel:true,localOwnerApproval:true}).stage,"CONNECTED");
  assert.throws(()=>windowsDeviceRecordFact({observedAtMs:101,device:{...computer,platform:"android"}}),/PLATFORM/);
});

test("shared observer consumes actual native field names with true readiness gating",()=>{
  const observer=createTriadObserver(100,1000);
  observer.observeExistingSource("mini",{observedAtMs:101,miniReady:true,protocolReady:true});
  observer.observeExistingSource("android",{observedAtMs:101,session:"CONNECTED"});
  observer.observeExistingSource("companion",{observedAtMs:101,device:computer});
  assert.equal(observer.snapshot(102).readyForCrossDeviceDisplay,false);
  observer.observeExistingSource("companion",{observedAtMs:102,device:computer,
    authenticatedChannel:true,localOwnerApproval:true});
  assert.equal(observer.snapshot(103).readyForCrossDeviceDisplay,true);
  assert.equal(observer.snapshot(1104).readyForCrossDeviceDisplay,false);
});

test("adapter fields remain aligned with the existing code definitions",async()=>{
  const root=new URL("../",import.meta.url);
  const [link,ui,pc]=await Promise.all([
    readFile(new URL("android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt",root),"utf8"),
    readFile(new URL("android-companion/app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt",root),"utf8"),
    readFile(new URL("src/devices/computer-companion-api.js",root),"utf8")
  ]);
  assert.match(link,/val miniReady = MutableStateFlow\(false\)/);
  assert.match(link,/val protocolReady = MutableStateFlow\(false\)/);
  assert.match(link,/frame\.payload\.toString\(Charsets\.UTF_8\) != "SESSION_OK"/);
  assert.match(ui,/session = SessionStage\.CONNECTED/);
  assert.match(pc,/halted:Number\(r\.halted\)===1/);
  assert.match(pc,/online:Date\.now\(\)-Number\(r\.last_seen_at\|\|0\)<35000/);
});
