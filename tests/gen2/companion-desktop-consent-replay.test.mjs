import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeVerifiedDesktopConsent} from '../../src/portability/companion-desktop-consent-replay.js';
import {DESKTOP_SESSION_SCHEMA} from '../../src/portability/companion-desktop-session-policy.js';
const now=1800000000000;
const device={id:'paired-windows',platform:'windows',halted:0,last_seen_at:now-100};
const session={schema:DESKTOP_SESSION_SCHEMA,session_id:'s'.repeat(24),challenge:'c'.repeat(24),device_id:device.id,scope:'interactive',owner_authenticated:true,local_approved:true,issued_at:now-1000,expires_at:now+60000};
const deviceKey=new Uint8Array(32).fill(5);
async function signedProof(){
 const p={schema:'mel.companion.local-consent-proof/v1',session_id:session.session_id,challenge:session.challenge,device_id:session.device_id,scope:session.scope,expires_at:session.expires_at};
 const k=await crypto.subtle.importKey('raw',deviceKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const msg=[p.schema,p.session_id,p.challenge,p.device_id,p.scope,String(p.expires_at)].join('\\n');
 const mac=await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(msg));
 return {...p,mac:[...new Uint8Array(mac)].map(x=>x.toString(16).padStart(2,'0')).join('')};
}
function db(){const seen=new Set();return {prepare(sql){let args=[];const x={bind(...v){args=v;return x},async run(){if(/INSERT OR IGNORE/.test(sql)){const key=args.slice(0,2).join(':');if(seen.has(key))return {meta:{changes:0}};seen.add(key);return {meta:{changes:1}};}return {success:true};}};return x;}}}
test('consent nonce is only consumed once after authenticated approval',async()=>{
 const env={DB:db()},proof=await signedProof();
 const opts={session,device,proof,deviceKey,requestedScope:'interactive',now};
 assert.equal((await consumeVerifiedDesktopConsent(env,opts)).ok,true);
 assert.equal((await consumeVerifiedDesktopConsent(env,opts)).code,'DESKTOP_CONSENT_REPLAY_OR_UNCONFIRMED');
});
test('tampered consent never reaches the write',async()=>{
 const env={DB:db()},proof=await signedProof();
 assert.equal((await consumeVerifiedDesktopConsent(env,{session,device,proof:{...proof,mac:'0'.repeat(64)},deviceKey,now})).code,'DESKTOP_CONSENT_PROOF_INVALID');
 assert.equal((await consumeVerifiedDesktopConsent(env,{session,device,proof,deviceKey,now,requestedScope:'interactive'})).ok,true);
});
