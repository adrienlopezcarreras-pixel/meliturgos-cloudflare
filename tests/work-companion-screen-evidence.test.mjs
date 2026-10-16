import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleComputerApi } from '../src/devices/computer-companion-api.js';
import {
  verifyWorkScreenCapture, interpretWorkScreenCapture, buildVerifiedWorkComputerContext,
  companionScreenshotKey, WORK_SCREEN_INTERPRETATION_CONSENT,
} from '../src/work/companion-screen-evidence.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const ORIGIN='https://mel.test';
const OWNER='Basic '+Buffer.from('owner:secret').toString('base64');
const PNG=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,1,2,3,4]);
function mediaBucket(){
 const objects=new Map();
 return {objects,
  async put(key,bytes){objects.set(key,new Uint8Array(bytes))},
  async head(key){const b=objects.get(key);return b?{size:b.byteLength}:null},
  async get(key){const b=objects.get(key);return b?{arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}:null}
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
  assert.equal(evidence.verified,true);assert.equal(evidence.scope,'VIEW_ONLY');assert.equal(evidence.screenshot_key,key);
  const calls=[];
  const analyze=async(_env,input)=>{calls.push(input);return {analysis:'Fenêtre Bloc-notes ouverte.',model:'test-vision-model'}};
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
