import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeDesktopCompanionSession} from '../../src/portability/companion-desktop-authorization-gate.js';
import {DESKTOP_SESSION_SCHEMA} from '../../src/portability/companion-desktop-session-policy.js';
const now=1800000000000;
const device={id:'windows-1',name:'Win',platform:'windows',halted:0,last_seen_at:now-10,metadata:'{}'};
const session={schema:DESKTOP_SESSION_SCHEMA,session_id:'s'.repeat(24),challenge:'c'.repeat(24),device_id:device.id,scope:'view',owner_authenticated:true,local_approved:true,issued_at:now-1000,expires_at:now+20000};
const deviceKey=new Uint8Array(32).fill(11);
async function makeProof(){
 const p={schema:'mel.companion.local-consent-proof/v1',session_id:session.session_id,challenge:session.challenge,device_id:device.id,scope:'view',expires_at:session.expires_at};
 const key=await crypto.subtle.importKey('raw',deviceKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const data=[p.schema,p.session_id,p.challenge,p.device_id,p.scope,String(p.expires_at)].join('\\n');
 const signed=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(data)));
 return {...p,mac:[...signed].map(x=>x.toString(16).padStart(2,'0')).join('')};
}
function fakeDb(row=device){const used=new Set();return {prepare(sql){let args=[];const statement={bind(...a){args=a;return statement},async first(){return row},async run(){if(/INSERT OR IGNORE/.test(sql)){const k=args[0]+':'+args[1];if(used.has(k))return {meta:{changes:0}};used.add(k);return {meta:{changes:1}};}return {success:true}}};return statement;}}}
test('authorization integrates paired Windows presence, authentic proof, and one-time consumption',async()=>{
 const env={DB:fakeDb()},proof=await makeProof();const args={session,proof,deviceKey,now};
 assert.equal((await authorizeDesktopCompanionSession(env,args)).ok,true);
 assert.equal((await authorizeDesktopCompanionSession(env,args)).code,'DESKTOP_CONSENT_REPLAY_OR_UNCONFIRMED');
});
test('authorization fails closed for offline, halted, missing key and altered MAC',async()=>{
 const proof=await makeProof();const args={session,proof,deviceKey,now};
 assert.equal((await authorizeDesktopCompanionSession({DB:fakeDb({...device,last_seen_at:now-30000})},args)).code,'COMPANION_SOVEREIGNTY_DEVICE_OFFLINE');
 assert.equal((await authorizeDesktopCompanionSession({DB:fakeDb({...device,halted:1})},args)).code,'OWNER_HALT_ACTIVE');
 assert.equal((await authorizeDesktopCompanionSession({DB:fakeDb()}, {...args,deviceKey:null})).code,'DESKTOP_DEVICE_KEY_REQUIRED');
 assert.equal((await authorizeDesktopCompanionSession({DB:fakeDb()}, {...args,proof:{...proof,mac:'0'.repeat(64)}})).code,'DESKTOP_CONSENT_PROOF_INVALID');
});
