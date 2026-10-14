import test from 'node:test';
import assert from 'node:assert/strict';
import {maybeHandleComputerApi} from '../src/devices/computer-companion-api.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

test('HALT activated while screenshot body streams prevents bucket write',async()=>{
 const DB=sqliteD1();
 const stored=[];
 try{
  const env={DB,MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret',MEDIA_BUCKET:{async put(key){stored.push(key)}}};
  const basic='Basic '+Buffer.from('owner:secret').toString('base64');
  const pairCode=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair-code',{
   method:'POST',headers:{authorization:basic,'content-type':'application/json'},body:'{}'
  }),env);
  assert.equal(pairCode.status,200);
  const {code}=await pairCode.json();
  const pair=await maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/pair',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({pair_code:code,computer_id:'race-pc',platform:'windows'})
  }),env);
  assert.equal(pair.status,200);
  const {token}=await pair.json();
  await DB.prepare('INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)')
   .bind('race-command','race-pc','race-session','{}','RUNNING',Date.now()).run();

  let signalPull;
  const bodyReading=new Promise(resolve=>{signalPull=resolve});
  let resume;
  const releaseBody=new Promise(resolve=>{resume=resolve});
  let pulls=0;
  const stream=new ReadableStream({
   start(controller){controller.enqueue(Uint8Array.from([137,80,78,71,13,10,26,10]));},
   async pull(controller){
    if(pulls++===0){signalPull();await releaseBody;}
    controller.close();
   }
  });
  const upload=maybeHandleComputerApi(new Request('https://mel.test/api/computer/v1/screenshot?command_id=race-command',{
   method:'POST',duplex:'half',headers:{authorization:'Bearer '+token,'x-mel-computer-id':'race-pc','content-type':'image/png'},body:stream
  }),env);
  await bodyReading;
  await DB.prepare("UPDATE computer_devices SET halted=1 WHERE id='race-pc'").run();
  resume();
  const response=await upload;
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'SCREENSHOT_AUTH_REVOKED_DURING_UPLOAD');
  assert.deepEqual(stored,[]);
 }finally{DB.close();}
});
