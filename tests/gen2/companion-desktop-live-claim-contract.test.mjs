import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateDesktopViewClaim} from '../../src/portability/companion-desktop-view-claim-policy.js';
const source=readFileSync(new URL('../../src/devices/computer-companion-api.js',import.meta.url),'utf8');
test('actual Companion command claim handler invokes desktop view safety policy before setting RUNNING',()=>{
 const start=source.indexOf('async function claim(env,a)');
 const end=source.indexOf('async function result(',start);
 assert.ok(start>0&&end>start);
 const handler=source.slice(start,end);
 assert.ok(handler.indexOf('evaluateDesktopViewClaim(')>0);
 assert.ok(handler.indexOf('evaluateDesktopViewClaim(')<handler.indexOf('SET status=?,claimed_at=?'));
 assert.match(handler,/COMPUTER_COMMAND_CLAIM_UNCONFIRMED/);
 assert.match(handler,/Number\(claimed\.meta\?\.changes\)!==1/);
});
test('claim policy rejects stale/expired/halted desktop requests',()=>{
 const now=1800000000000;
 const plan={schema:'mel.companion.desktop-view-request/v1',action:'desktop.view.request',screen_capture_only:true,requires_local_stop:true,session_id:'s',device_id:'w',expires_at:now+1000};
 const device={id:'w',platform:'windows',halted:0,last_seen_at:now-100};
 assert.equal(evaluateDesktopViewClaim({plan,device,now}).ok,true);
 assert.equal(evaluateDesktopViewClaim({plan,device:{...device,halted:1},now}).ok,false);
 assert.equal(evaluateDesktopViewClaim({plan:{...plan,expires_at:now},device,now}).ok,false);
});
