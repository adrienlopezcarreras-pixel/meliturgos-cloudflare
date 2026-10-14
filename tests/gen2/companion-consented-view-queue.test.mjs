import test from 'node:test';
import assert from 'node:assert/strict';
import {queueConsentedDesktopView} from '../../src/portability/companion-consented-view-queue.js';
import {DESKTOP_SESSION_SCHEMA} from '../../src/portability/companion-desktop-session-policy.js';
const now=1800000000000;
const device={id:'paired-windows',name:'PC',platform:'windows',halted:0,last_seen_at:now-1000,metadata:'{}'};
const session={schema:DESKTOP_SESSION_SCHEMA,session_id:'s'.repeat(24),challenge:'c'.repeat(24),device_id:device.id,scope:'view',owner_authenticated:true,local_approved:true,issued_at:now-1000,expires_at:now+60000};
const deviceKey=new Uint8Array(32).fill(9);
async function proof(){const p={schema:'mel.companion.local-consent-proof/v1',session_id:session.session_id,challenge:session.challenge,device_id:device.id,scope:session.scope,expires_at:session.expires_at};const k=await crypto.subtle.importKey('raw',deviceKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);const v=[p.schema,p.session_id,p.challenge,p.device_id,p.scope,String(p.expires_at)].join('\\n');return {...p,mac:[...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,'0')).join('')};}
function database(){const used=new Set(),commands=[];return {commands,prepare(sql){let args=[];const stmt={bind(...p){args=p;return stmt},async first(){return device},async run(){if(/INSERT OR IGNORE/.test(sql)){const key=args[0]+args[1];if(used.has(key))return {meta:{changes:0}};used.add(key);return {meta:{changes:1}};}if(/INSERT INTO computer_commands/.test(sql))commands.push(args);return {success:true};}};return stmt;}}}
test('only authenticated single-use approval queues one view-only request',async()=>{const db=database(),p=await proof(),env={DB:db};const args={session,proof:p,deviceKey,now};const first=await queueConsentedDesktopView(env,args);assert.equal(first.status,'PENDING');assert.equal(db.commands.length,1);const plan=JSON.parse(db.commands[0][3]);assert.equal(plan.screen_capture_only,true);assert.equal(plan.action,'desktop.view.request');assert.equal(plan.requires_local_stop,true);assert.equal((await queueConsentedDesktopView(env,args)).code,'DESKTOP_CONSENT_REPLAY_OR_UNCONFIRMED');assert.equal(db.commands.length,1);});
test('invalid proof never queues desktop command',async()=>{const db=database(),p=await proof();const out=await queueConsentedDesktopView({DB:db},{session,proof:{...p,mac:'0'.repeat(64)},deviceKey,now});assert.equal(out.code,'DESKTOP_CONSENT_PROOF_INVALID');assert.equal(db.commands.length,0);});

test('failed DB insert does not report a queued screen request',async()=>{
 const p=await proof(),db=database(),original=db.prepare.bind(db);
 db.prepare=sql=>{
   const statement=original(sql);
   if(/INSERT INTO computer_commands/.test(sql)) statement.run=async()=>({success:false,meta:{changes:0}});
   return statement;
 };
 const out=await queueConsentedDesktopView({DB:db},{session,proof:p,deviceKey,now});
 assert.equal(out.ok,false);
 assert.equal(out.code,'DESKTOP_VIEW_QUEUE_WRITE_UNCONFIRMED');
});
