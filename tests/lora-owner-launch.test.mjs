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
