import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCompanionLocalConsent} from '../../src/portability/companion-local-consent-proof.js';
import {DESKTOP_SESSION_SCHEMA} from '../../src/portability/companion-desktop-session-policy.js';
const now=1800000000000;
const device={id:'paired-windows',platform:'windows',halted:0,last_seen_at:now-1000};
const session={schema:DESKTOP_SESSION_SCHEMA,session_id:'s'.repeat(24),challenge:'c'.repeat(24),device_id:device.id,scope:'interactive',owner_authenticated:true,local_approved:true,issued_at:now-1000,expires_at:now+60000};
const deviceKey=new Uint8Array(32).fill(17);
const schema='mel.companion.local-consent-proof/v1';
async function proof(s=session){
 const p={schema,session_id:s.session_id,challenge:s.challenge,device_id:s.device_id,scope:s.scope,expires_at:s.expires_at};
 const key=await crypto.subtle.importKey('raw',deviceKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const payload=[p.schema,p.session_id,p.challenge,p.device_id,p.scope,String(p.expires_at)].join('\\n');
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload)));
 return {...p,mac:[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')};
}
test('accepts only a cryptographically authenticated device-bound local approval',async()=>{
 const p=await proof();
 assert.equal((await verifyCompanionLocalConsent({session,device,proof:p,deviceKey,now,requestedScope:'interactive'})).authenticated_local_proof,true);
 for(const changed of [{mac:'0'.repeat(64)},{challenge:'other'.repeat(5)},{device_id:'other-device'},{scope:'view'}]){
  assert.equal((await verifyCompanionLocalConsent({session,device,proof:{...p,...changed},deviceKey,now,requestedScope:'interactive'})).ok,false);
 }
});
test('rejects absent key, stale heartbeat, revoked session and scope escalation',async()=>{
 const p=await proof();
 const run=overrides=>verifyCompanionLocalConsent({session,device,proof:p,deviceKey,now,...overrides});
 assert.equal((await run({deviceKey:null})).code,'DESKTOP_DEVICE_KEY_REQUIRED');
 assert.equal((await run({device:{...device,last_seen_at:now-21000}})).code,'DESKTOP_DEVICE_OFFLINE');
 assert.equal((await run({session:{...session,revoked:true}})).code,'DESKTOP_SESSION_REVOKED');
 assert.equal((await run({session:{...session,scope:'view'},requestedScope:'interactive'})).code,'DESKTOP_INTERACTIVE_CONSENT_REQUIRED');
});
