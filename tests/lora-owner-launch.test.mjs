import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import entry from '../src/professor-live-learning-entry.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { runLoraTrainingHeartbeat } from '../src/learning/lora-training-heartbeat.js';

test('training launch endpoint rejects unauthenticated requests before dispatch',async()=>{
  const response=await entry.fetch(new Request('https://mel.example/api/learning/lora/train',{method:'POST'}),{MELITURGOS_PASSWORD:'fixture-password'},{});
  assert.equal(response.status,401);
});

test('Professor launch returns a typed diagnostic on a failed dispatch, never an opaque HTTP 503',async()=>{
  const source=await readFile(new URL('../src/professor-live-learning-entry.js',import.meta.url),'utf8');
  assert.match(source,/code: String\(result\.error \|\| result\.status \|\| 'LORA_TRAINING_LAUNCH_UNAVAILABLE'\)/);
});

test('manual and automatic launch cannot dispatch concurrently through D1',async t=>{
  const DB=sqliteD1();t.after(()=>DB.close());
  await DB.prepare('CREATE TABLE dev_bridge_state(bridge_id TEXT PRIMARY KEY,last_seen INTEGER,status TEXT,metadata_json TEXT)').run();
  let release,started;
  const reached=new Promise(resolve=>{started=resolve;});
  const blocked=new Promise(resolve=>{release=resolve;});
  let calls=0;
  const env={DB,MEL_GITHUB_TOKEN:'fixture',MEL_LORA_CONTINUOUS_TRAINING:'true'};
  const options={force:true,manualSingleCycle:true,engine:{benchmarks:async()=>[]},fetchImpl:async()=>{calls++;started();await blocked;return Response.json({workflow_runs:[{id:1,status:'in_progress'}]});}};
  const first=runLoraTrainingHeartbeat(env,options);
  await reached;
  assert.equal((await runLoraTrainingHeartbeat(env,options)).status,'TRAINING_LAUNCH_PENDING');
  release();assert.equal((await first).status,'TRAINING_CHAIN_ACTIVE');assert.equal(calls,1);
});

test('LoRA page exposes one authenticated single-cycle launch action and its result',async()=>{
  const page=await readFile(new URL('../src/pages/full-interface-v2.js',import.meta.url),'utf8');
  assert.equal((page.match(/id="freeLoraTrain"/g)||[]).length,1);
  assert.match(page,/Lancer un entraînement/);assert.match(page,/jfetch\('\/api\/learning\/lora\/train',\{method:'POST'/);
  assert.match(page,/Entraînement non lancé/);
});

test('a failed status refresh cannot turn an acknowledged launch into a false failure',async()=>{
  const page=await readFile(new URL('../src/pages/full-interface-v2.js',import.meta.url),'utf8');
  const start=page.indexOf("qs('#freeLoraTrain').onclick=");
  const end=page.indexOf("qs('#freeLoraRefresh').onclick=",start);
  const button={},message={};
  const qs=id=>id==='#freeLoraTrain'?button:message;
  new Function('qs','jfetch','panelLoadedAt','loadFreeLoraStatus',page.slice(start,end))(qs,async()=>({ok:true,dispatched:true}),new Map(),async()=>{throw Error('status temporarily unavailable');});
  await button.onclick();
  assert.match(message.textContent,/Entraînement demandé/);assert.equal(button.disabled,false);
});
