import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseEnv} from 'node:util';
// Explicitly opt in only against the isolated local Wrangler instance.
const base=process.env.MEL_LOCAL_TEST_URL;
test('isolated Wrangler: authentication, deterministic chat and persisted history',{skip:!base},async()=>{
 assert.equal(new URL(base).hostname,'127.0.0.1');
 const env={...JSON.parse(fs.readFileSync('wrangler.jsonc','utf8')).vars,...parseEnv(fs.readFileSync('.dev.vars','utf8'))};
 const authorization='Basic '+Buffer.from(env.MELITURGOS_USER+':'+env.MELITURGOS_PASSWORD).toString('base64');
 for(const auth of [false,true]) for(const path of ['/','/mvp']) {
  const r=await fetch(base+path,{headers:auth?{authorization}:{}});
  console.log(auth?'AUTH':'NO AUTH',path,r.status,r.headers.get('content-type'));
  assert.equal(r.status,auth?200:401);
  if(auth)assert.match(r.headers.get('content-type'),/^text\/html/);
 }
 const id=crypto.randomUUID();
 // This existing statistics branch reads local SQL and does NOT invoke Workers AI.
 const r=await fetch(base+'/api/chat',{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({text:'Combien de conversations avons-nous échangées ?',conversation_id:id,device_id:'local-http-test'})});
 const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));assert.equal(data.model,'d1-statistics');assert.equal(data.model_attempts,0);
 const history=await fetch(base+'/api/gen2/conversations/messages?conversation_id='+id,{headers:{authorization}});
 const stored=await history.json();assert.equal(stored.messages.length,2);assert.equal(stored.messages[1].content,data.text);
 console.log('HTTP chat=200; IA calls=0; persisted archive messages=2');
});
