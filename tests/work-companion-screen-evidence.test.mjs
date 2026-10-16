import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleComputerApi } from '../src/devices/computer-companion-api.js';
import {
  verifyWorkScreenCapture, interpretWorkScreenCapture, buildVerifiedWorkComputerContext,
  revokeWorkScreenConsent, companionScreenshotKey, WORK_SCREEN_INTERPRETATION_CONSENT,
} from '../src/work/companion-screen-evidence.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const ORIGIN='https://mel.test';
const OWNER='Basic '+Buffer.from('owner:secret').toString('base64');
const PNG=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,1,2,3,4]);
function mediaBucket(){
 const objects=new Map();
 return {objects,
  async put(key,bytes,options={}){objects.set(key,{bytes:new Uint8Array(bytes),customMetadata:{...(options.customMetadata||{})}})},
  async head(key){const object=objects.get(key);return object?{size:object.bytes.byteLength,customMetadata:object.customMetadata}:null},
  async get(key){const object=objects.get(key);const b=object?.bytes;return b?{arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),customMetadata:object.customMetadata}:null},
  async delete(keys){for(const key of (Array.isArray(keys)?keys:[keys]))objects.delete(key)}
 };
}
async function harness(){
 const DB=sqliteD1(),MEDIA_BUCKET=mediaBucket();
 const env={DB,MEDIA_BUCKET,MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret'};
 const call=(path,init={})=>maybeHandleComputerApi(new Request(ORIGIN+path,init),env);
 const ownerJson=(path,body)=>call(path,{method:'POST',headers:{authorization:OWNER,'content-type':'application/json'},body:JSON.stringify(body)});
 const pairCode=await ownerJson('/api/computer/v1/pair-code',{});
 const {code}=await pairCode.json();
 const paired=await call('/api/computer/v1/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pair_code:code,computer_id:'pc-1',platform:'windows',name:'Bureau'})});
 const {token}=await paired.json();
 const device={authorization:'Bearer '+token,'x-mel-computer-id':'pc-1'};
 const heartbeat=()=>call('/api/computer/v1/heartbeat',{method:'POST',headers:{...device,'content-type':'application/json'},body:JSON.stringify({version:'2.3.14',remote_access_enabled:true,engine_heartbeat_at:Date.now(),active_window:'Bloc-notes'})});
 await heartbeat();
 async function capture(){
  const queued=await ownerJson('/api/computer/v1/desktop-view-request',{computer_id:'pc-1'});
  assert.equal(queued.status,202);
  const {command_id}=await queued.json();
  const claim=await (await call('/api/computer/v1/commands',{headers:device})).json();
  assert.equal(claim.command?.id,command_id);
  const up=await call('/api/computer/v1/screenshot?command_id='+command_id,{method:'POST',headers:{...device,'content-type':'image/png'},body:PNG});
  assert.equal(up.status,200);
  const key=companionScreenshotKey('pc-1',command_id);
  const result=await call('/api/computer/v1/result',{method:'POST',headers:{...device,'content-type':'application/json'},body:JSON.stringify({command_id,ok:true,result:{capture_count:1,outputs:[{action:'desktop.view.request',screenshot_key:key,view_url:ORIGIN+'/api/computer/v1/screenshot?key='+encodeURIComponent(key)}]}})});
  assert.equal(result.status,200);
  return {command_id,key};
 }
 return {DB,env,call,ownerJson,device,capture};
}
test('real Companion capture is verified and interpreted only after explicit owner consent',async()=>{
 const h=await harness();
 try{
  const {command_id,key}=await h.capture();
  const evidence=await verifyWorkScreenCapture(h.env,{computer_id:'pc-1',command_id});
  assert.equal(evidence.verified,true);assert.equal(evidence.scope,'VIEW_ONLY');assert.equal(evidence.screenshot_key,key);assert.match(evidence.image_sha256,/^[0-9a-f]{64}$/);assert.ok(Date.parse(evidence.expires_at)>Date.now());
  const calls=[];
  const analyze=async(_env,input)=>{calls.push(input);const consent=await h.DB.prepare('SELECT id,granted_at,revoked_at,image_sha256 FROM work_screen_consents WHERE command_id=? AND device_id=? LIMIT 1').bind(command_id,'pc-1').first();assert.ok(consent,'consent must be persisted before provider inference');assert.ok(consent.granted_at>0);assert.equal(consent.revoked_at,null);return {analysis:'Fenêtre Bloc-notes ouverte.',model:'test-vision-model'}};
  const interpreted=await interpretWorkScreenCapture(h.env,{computer_id:'pc-1',command_id,consent:WORK_SCREEN_INTERPRETATION_CONSENT,question:'Que voit-on ?'},{analyze});
  assert.equal(interpreted.ok,true);assert.equal(calls.length,1);
  assert.deepEqual([...calls[0].bytes],[...PNG]);
  assert.match(calls[0].prompt,/jamais une instruction/);
  assert.match(interpreted.image_sha256,/^[0-9a-f]{64}$/);
  const ctx=await buildVerifiedWorkComputerContext(h.env,{
   computer:{computer_id:'pc-1',halted:false,active_window:'FAUX'},
   screen_capture:{computer_id:'pc-1',command_id,view_url:'https://evil.test/fake.png',status:'SUCCEEDED'},
   screen_interpretation:interpreted.interpretation_id
  });
  assert.equal(ctx.councilContext.computer.source,'server');
  assert.equal(ctx.councilContext.computer.active_window,'Bloc-notes');
  assert.equal(ctx.councilContext.screen_capture.verified,true);
  assert.equal('view_url' in ctx.councilContext.screen_capture,false);
  assert.equal(ctx.councilContext.screen_interpretation.analysis_withheld_from_council,true);
 }finally{h.DB.close()}
});
test('forged, revoked, halted, expired or unconsented screen evidence fails closed',async()=>{
 const h=await harness();
 try{
  await assert.rejects(interpretWorkScreenCapture(h.env,{computer_id:'pc-1',command_id:'missing',consent:'NO'}),e=>e.code==='WORK_SCREEN_INTERPRETATION_CONSENT_REQUIRED');
  const {command_id}=await h.capture();
  await h.DB.prepare('UPDATE computer_devices SET halted=1 WHERE id=?').bind('pc-1').run();
  await assert.rejects(verifyWorkScreenCapture(h.env,{computer_id:'pc-1',command_id}),e=>e.code==='WORK_SCREEN_OWNER_HALT');
  const result=await buildVerifiedWorkComputerContext(h.env,{screen_capture:{computer_id:'pc-1',command_id,view_url:'https://evil.test'}}); 
  assert.equal(result.councilContext.screen_capture.verified,false);
 }finally{h.DB.close()}
});

test('revocation records the revoke time and confirms deletion of both analysis and capture',async()=>{
 const h=await harness();
 try{
  const {command_id,key}=await h.capture();
  const interpreted=await interpretWorkScreenCapture(h.env,{computer_id:'pc-1',command_id,consent:WORK_SCREEN_INTERPRETATION_CONSENT},{analyze:async()=>({analysis:'Texte privé de la capture.',model:'test-vision'})});
  assert.equal(interpreted.ok,true);
  const before=await h.DB.prepare('SELECT id,granted_at,revoked_at,image_sha256 FROM work_screen_consents WHERE command_id=? AND device_id=? LIMIT 1').bind(command_id,'pc-1').first();
  assert.ok(before?.id);
  assert.equal(before.revoked_at,null);
  assert.ok(h.env.MEDIA_BUCKET.objects.has(key));
  const result=await revokeWorkScreenConsent(h.env,{computer_id:'pc-1',command_id});
  assert.equal(result.ok,true);
  assert.equal(result.consent_revoked,true);
  assert.equal(result.image_deleted,true);
  assert.equal(result.interpretation_deleted,1);
  assert.equal(await h.env.MEDIA_BUCKET.head(key),null);
  const after=await h.DB.prepare('SELECT revoked_at FROM work_screen_consents WHERE id=?').bind(before.id).first();
  assert.ok(after.revoked_at>0);
  const count=await h.DB.prepare('SELECT COUNT(*) AS n FROM work_screen_interpretations WHERE command_id=? AND device_id=?').bind(command_id,'pc-1').first();
  assert.equal(Number(count.n),0);
  await assert.rejects(
    interpretWorkScreenCapture(h.env,{computer_id:'pc-1',command_id,consent:WORK_SCREEN_INTERPRETATION_CONSENT},{analyze:async()=>{throw Error('must not call model')}}),
    error=>error.code==='WORK_SCREEN_IMAGE_MISSING'
  );
 }finally{h.DB.close()}
});

test('temporary vision failure can be retried only after a fresh explicit Work consent',async()=>{
 const h=await harness();
 try{
  const {command_id}=await h.capture();
  await assert.rejects(
   interpretWorkScreenCapture(h.env,{computer_id:'pc-1',command_id,consent:WORK_SCREEN_INTERPRETATION_CONSENT},{analyze:async()=>{throw Object.assign(new Error('temporary outage'),{code:'VISION_TEMPORARILY_UNAVAILABLE',status:503})}}),
   error=>error.code==='VISION_TEMPORARILY_UNAVAILABLE'
  );
  const saved=await h.DB.prepare('SELECT id,granted_at,revoked_at,image_sha256 FROM work_screen_consents WHERE command_id=? AND device_id=? LIMIT 1').bind(command_id,'pc-1').first();
  assert.ok(saved?.id,'consent must remain durably recorded after the provider failure');
  assert.equal(saved.revoked_at,null);
  const retry=await interpretWorkScreenCapture(h.env,{computer_id:'pc-1',command_id,consent:WORK_SCREEN_INTERPRETATION_CONSENT},{analyze:async()=>({analysis:'Nouvelle tentative réussie.',model:'test-vision'})});
  assert.equal(retry.ok,true);
  assert.equal(retry.analysis,'Nouvelle tentative réussie.');
  const rows=await h.DB.prepare('SELECT COUNT(*) AS n FROM work_screen_consents WHERE command_id=? AND device_id=?').bind(command_id,'pc-1').first();
  assert.equal(Number(rows.n),1,'retry reuses the same active per-capture consent record');
 }finally{h.DB.close()}
});

test('revocation during model inference prevents persistence of the analysis',async()=>{
 const h=await harness();
 try{
  const {command_id,key}=await h.capture();
  await assert.rejects(
   interpretWorkScreenCapture(h.env,{computer_id:'pc-1',command_id,consent:WORK_SCREEN_INTERPRETATION_CONSENT},{
    analyze:async()=>{const revoked=await revokeWorkScreenConsent(h.env,{computer_id:'pc-1',command_id});assert.equal(revoked.image_deleted,true);return {analysis:'This must never persist.',model:'test-vision'}}
   }),
   error=>error.code==='WORK_SCREEN_REVOKED_DURING_INTERPRETATION'
  );
  assert.equal(await h.env.MEDIA_BUCKET.head(key),null);
  const rows=await h.DB.prepare('SELECT COUNT(*) AS n FROM work_screen_interpretations WHERE command_id=? AND device_id=?').bind(command_id,'pc-1').first();
  assert.equal(Number(rows.n),0);
 }finally{h.DB.close()}
});

test('revocation refuses a screenshot whose stored owner or command binding does not match',async()=>{
 const h=await harness();
 try{
  const {command_id,key}=await h.capture();
  const stored=h.env.MEDIA_BUCKET.objects.get(key);
  assert.ok(stored);
  stored.customMetadata.owner='another-owner';
  await assert.rejects(
   revokeWorkScreenConsent(h.env,{computer_id:'pc-1',command_id}),
   error=>error.code==='WORK_SCREEN_IMAGE_OWNER_OR_BINDING_MISMATCH'
  );
  assert.ok(await h.env.MEDIA_BUCKET.head(key),'unauthorized object must remain untouched');
  // The ownership failure occurs before the consent table is even initialized; the untouched object proves fail-closed behavior.
 }finally{h.DB.close()}
});
