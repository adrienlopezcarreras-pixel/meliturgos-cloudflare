import test from 'node:test';
import assert from 'node:assert/strict';
import {maybeHandleComputerApi} from '../src/devices/computer-companion-api.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

const origin='https://mel.test/api/computer/v1/';
const owner='Basic '+Buffer.from('owner:secret').toString('base64');

async function setup(){
 const DB=sqliteD1();
 const objects=new Map(),heads=[];
 const env={DB,MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret',
  MEDIA_BUCKET:{async head(key){heads.push(key);return objects.get(key)??null}}};
 const send=(path,{body,auth=owner,headers={}}={})=>maybeHandleComputerApi(new Request(origin+path,
   {method:'POST',headers:{...(auth?{authorization:auth}:{}),'content-type':'application/json',...headers},
    body:JSON.stringify(body??{})}),env);
 const pairCode=await send('pair-code');
 assert.equal(pairCode.status,200);
 const {code}=await pairCode.json();
 const pair=await send('pair',{auth:null,body:{pair_code:code,computer_id:'chat-pc',platform:'windows'}});
 assert.equal(pair.status,200);
 const {token}=await pair.json();
 const dAuth='Bearer '+token;
 const deviceHeaders={'x-mel-computer-id':'chat-pc'};
 const insert=async(commandId,steps,status='RUNNING')=>{
  const plan={schema:'mel.devices.computer-use.v1',session_id:'chat-session',
   device:{id:'chat-pc',capabilities:['computer.use']},steps};
  await DB.prepare('INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)')
   .bind(commandId,'chat-pc','chat-session',JSON.stringify(plan),status,Date.now()).run();
 };
 const report=(commandId,result,ok=true)=>send('result',{auth:dAuth,headers:deviceHeaders,
  body:{command_id:commandId,ok,result}});
 const expected=commandId=>{
  const key='computer/screenshots/chat-pc/'+commandId+'.png';
  return {key,url:origin+'screenshot?key='+encodeURIComponent(key)};
 };
 return {DB,env,objects,heads,report,insert,expected};
}

test('native chat screen.capture cannot report successful image without R2 object',async()=>{
 const {DB,objects,heads,report,insert,expected}=await setup();
 try{
  await insert('chat-shot',[{id:'step-1',action:'screen.capture'}]);
  const {key,url}=expected('chat-shot');
  const output={action:'screen.capture',screenshot_key:key,view_url:url};
  const invalid=await report('chat-shot',{outputs:[]});
  assert.equal(invalid.status,409);
  assert.equal((await invalid.json()).code,'SCREENSHOT_RESULT_PROOF_INVALID');
  assert.deepEqual(heads,[]);
  const spoof=await report('chat-shot',{outputs:[{...output,screenshot_key:'computer/screenshots/other-pc/chat-shot.png'}]});
  assert.equal(spoof.status,409);
  assert.equal((await spoof.json()).code,'SCREENSHOT_RESULT_PROOF_INVALID');
  let response=await report('chat-shot',{outputs:[output]});
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'SCREENSHOT_RESULT_IMAGE_MISSING');
  assert.deepEqual(heads,[key]);
  let row=await DB.prepare('SELECT status FROM computer_commands WHERE id=?').bind('chat-shot').first();
  assert.equal(row.status,'RUNNING');
  objects.set(key,{size:128});
  response=await report('chat-shot',{outputs:[output]});
  assert.equal(response.status,200);
  assert.equal((await response.json()).ok,true);
  row=await DB.prepare('SELECT status,result_json FROM computer_commands WHERE id=?').bind('chat-shot').first();
  assert.equal(row.status,'SUCCEEDED');
  assert.equal(JSON.parse(row.result_json).outputs[0].screenshot_key,key);
  assert.equal((await report('chat-shot',{outputs:[output]})).status,409);
 }finally{DB.close();}
});

test('multi-step chat plan enforces screenshot output position, HALT and local access opt-out',async()=>{
 const {DB,objects,report,insert,expected}=await setup();
 try{
  await insert('combo-shot',[{id:'step-1',action:'cursor.move'},{id:'step-2',action:'screen.capture'}]);
  const {key,url}=expected('combo-shot');
  const move={action:'cursor.move'};
  const shot={action:'screen.capture',screenshot_key:key,view_url:url};
  objects.set(key,{size:32});
  const wrong=await report('combo-shot',{outputs:[shot,move]});
  assert.equal(wrong.status,409);
  assert.equal((await wrong.json()).code,'SCREENSHOT_RESULT_PROOF_INVALID');
  await DB.prepare('UPDATE computer_devices SET halted=1 WHERE id=?').bind('chat-pc').run();
  let response=await report('combo-shot',{outputs:[move,shot]});
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'SCREENSHOT_RESULT_AUTH_INVALID');
  await DB.prepare('UPDATE computer_devices SET halted=0,metadata=? WHERE id=?')
   .bind(JSON.stringify({remote_access_enabled:false}),'chat-pc').run();
  response=await report('combo-shot',{outputs:[move,shot]});
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'SCREENSHOT_RESULT_AUTH_INVALID');
  await DB.prepare('UPDATE computer_devices SET metadata=? WHERE id=?')
   .bind(JSON.stringify({remote_access_enabled:true}),'chat-pc').run();
  assert.equal((await report('combo-shot',{outputs:[move,shot]})).status,200);
 }finally{DB.close();}
});

test('non-screenshot chat results and failed screenshot reports retain their previous behavior',async()=>{
 const {DB,report,insert}=await setup();
 try{
  await insert('other-job',[{id:'step-1',action:'cursor.move'}]);
  let response=await report('other-job',{outputs:[{action:'cursor.move'}]});
  assert.equal(response.status,200);
  await insert('failed-shot',[{id:'step-1',action:'screen.capture'}]);
  response=await report('failed-shot',{error_code:'SCREENSHOT_LOCAL_STOP_ACTIVE'},false);
  assert.equal(response.status,200);
  const row=await DB.prepare('SELECT status FROM computer_commands WHERE id=?').bind('failed-shot').first();
  assert.equal(row.status,'FAILED');
 }finally{DB.close();}
});
