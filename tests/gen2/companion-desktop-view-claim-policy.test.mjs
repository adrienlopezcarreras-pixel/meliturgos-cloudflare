import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDesktopViewClaim} from '../../src/portability/companion-desktop-view-claim-policy.js';
const now=1800000000000;
const device={id:'windows-1',platform:'windows',halted:0,last_seen_at:now-100};
const plan={schema:'mel.companion.desktop-view-request/v1',action:'desktop.view.request',screen_capture_only:true,requires_local_stop:true,session_id:'session-1',device_id:device.id,expires_at:now+30000};
const run=(p=plan,d=device)=>evaluateDesktopViewClaim({plan:p,device:d,now});
test('read-only view request can be claimed with fresh authorization metadata',()=>assert.equal(run().ok,true));
test('claim refuses expired session, local HALT and stale heartbeat',()=>{
 assert.equal(run({...plan,expires_at:now}).code,'DESKTOP_VIEW_EXPIRED');
 assert.equal(run(plan,{...device,halted:1}).code,'DESKTOP_VIEW_OWNER_HALT');
 assert.equal(run(plan,{...device,last_seen_at:now-30000}).code,'DESKTOP_VIEW_DEVICE_OFFLINE');
});
test('claim rejects altered plan, non-Windows and other device',()=>{
 assert.equal(run({...plan,action:'desktop.keyboard'}).code,'DESKTOP_VIEW_PLAN_FORBIDDEN');
 assert.equal(run({...plan,screen_capture_only:false}).code,'DESKTOP_VIEW_PLAN_FORBIDDEN');
 assert.equal(run(plan,{...device,id:'other'}).code,'DESKTOP_VIEW_DEVICE_MISMATCH');
 assert.equal(run(plan,{...device,platform:'android'}).code,'DESKTOP_VIEW_DEVICE_MISMATCH');
});
