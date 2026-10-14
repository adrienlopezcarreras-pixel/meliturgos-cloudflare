import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDesktopSession,DESKTOP_SESSION_SCHEMA} from '../../src/portability/companion-desktop-session-policy.js';

const now=1_800_000_000_000;
const device={id:'paired-windows',platform:'windows',halted:0};
const session={schema:DESKTOP_SESSION_SCHEMA,device_id:device.id,scope:'interactive',owner_authenticated:true,local_approved:true,issued_at:now-1000,expires_at:now+60_000};
const check=(overrides={},target=device,requestedScope='interactive')=>evaluateDesktopSession({session:{...session,...overrides},device:target,now,requestedScope});

test('desktop session requires local approval and authenticated owner',()=>{
  assert.deepEqual(check({local_approved:false}),{ok:false,code:'DESKTOP_LOCAL_CONSENT_REQUIRED'});
  assert.deepEqual(check({owner_authenticated:false}),{ok:false,code:'DESKTOP_LOCAL_CONSENT_REQUIRED'});
});
test('desktop session expires and is revocable by local HALT',()=>{
  assert.equal(check({expires_at:now}).ok,false);
  assert.equal(check({expires_at:now+6*60_000}).ok,false);
  assert.equal(check({revoked:true}).code,'DESKTOP_SESSION_REVOKED');
  assert.equal(check({}, {...device,halted:1}).code,'DESKTOP_SESSION_REVOKED');
});
test('desktop scope cannot escalate and device is pinned to paired Windows',()=>{
  assert.equal(check({scope:'view'}).code,'DESKTOP_INTERACTIVE_CONSENT_REQUIRED');
  assert.equal(check({}, {...device,id:'another-device'}).code,'DESKTOP_DEVICE_MISMATCH');
  assert.equal(check({}, {...device,platform:'android'}).code,'DESKTOP_DEVICE_MISMATCH');
  assert.equal(check({},device,'system.exec').code,'DESKTOP_SCOPE_FORBIDDEN');
  assert.equal(check().ok,true);
});
