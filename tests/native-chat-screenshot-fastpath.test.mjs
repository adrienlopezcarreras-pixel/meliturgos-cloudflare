import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleNativeChat } from '../src/api/native-chat.js';
import { inferNativeComputerCapability } from '../src/api/native-chat.js';
import { registerComputerRuntimeCapabilities } from '../src/capabilities/computer-runtime-capabilities.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const url='https://mel.example/api/chat';
const prompt='Fais une capture de l’écran de mon PC Windows connecté via Companion et affiche le résultat réel.';
function request(text=prompt){
 return new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,conversation_id:'screenshot-test'})});
}
async function initialize(db){
 const actions=new Map();
 registerComputerRuntimeCapabilities({discover(meta,handler){actions.set(meta.id,handler)}},{db});
 await actions.get('computer.status')({});
}
test('Windows screenshot intent is selected without an AI provider',()=>{
 assert.deepEqual(inferNativeComputerCapability(prompt),{id:'computer.quick',input:{kind:'screenshot'}});
});

test('direct screenshot chat fails quickly and truthfully if no Companion is authorized',async()=>{
 const db=sqliteD1();
 try{
  const response=await handleNativeChat(request(),{DB:db,MELITURGOS_USER:'owner'},{authorized:true});
  const data=await response.json();
  assert.equal(response.status,409);
  assert.equal(data.ok,false);
  assert.equal(data.code,'COMPUTER_NO_AUTHORIZED_ONLINE_DEVICE');
  assert.equal(data.computer_command,undefined);
 }finally{db.close()}
});

test('direct screenshot chat returns an exact queued ID without slow AI and never claims a completed capture',async()=>{
 const db=sqliteD1();
 try{
  await initialize(db);
  const now=Date.now();
  await db.prepare('INSERT INTO computer_devices(id,token_hash,name,platform,capabilities,allowed_apps,halted,created_at,last_seen_at,metadata) VALUES(?,?,?,?,?,?,?,?,?,?)')
   .bind('pc-win','token','Windows PC','windows',JSON.stringify(['computer.use']),JSON.stringify(['notepad']),0,now,now,
      JSON.stringify({remote_access_enabled:true,engine_heartbeat_at:now,allowed_paths:[]})).run();
  const response=await handleNativeChat(request(),{DB:db,MELITURGOS_USER:'owner'},{authorized:true});
  const data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.ok,true);
  assert.equal(data.response_mode,'computer-capture-pending');
  assert.equal(data.computer_command.status,'PENDING');
  assert.equal(data.computer_command.computer_id,'pc-win');
  assert.ok(data.computer_command.command_id);
  assert.equal(data.tool_results[0].status,'QUEUED');
  const row=await db.prepare('SELECT * FROM computer_commands WHERE id=?').bind(data.computer_command.command_id).first();
  assert.equal(row.status,'PENDING');
  assert.deepEqual(JSON.parse(row.plan_json).steps.map(x=>x.action),['screen.capture']);
 }finally{db.close()}
});

test('full interface waits for SUCCEEDED and exact command before presenting the image',async()=>{
 const html=await readFile(new URL('../src/pages/full-interface-v2.js',import.meta.url),'utf8');
 assert.match(html,/function followChatComputerScreenshot\(command\)/);
 assert.match(html,/item\?\.id===commandId/);
 assert.match(html,/result\.status!=='SUCCEEDED'/);
 assert.match(html,/COMPUTER_CAPTURE_PROOF_MISSING/);
 assert.match(html,/verifiedUrl\.pathname!=='\\/api\\/computer\\/v1\\/screenshot'/);
 assert.match(html,/void followChatComputerScreenshot\(d\.computer_command\)/);
});
