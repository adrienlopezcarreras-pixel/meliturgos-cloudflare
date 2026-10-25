import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

const explanation='Je distingue deux vérifications. Pour MAX, je m’appuie sur la lecture du contrôle et sur les blocages observés, sans lancer de cycle. Pour les images, il faut vérifier séparément la récupération du fichier et son chargement dans le navigateur. Une recherche acceptée ne prouve pas à elle seule qu’une image a été affichée.';
function request(text,mode='conversation'){
 return new Request('https://mel.example/api/chat',{method:'POST',headers:{authorization:'Basic '+btoa('fixture:local-only'),'content-type':'application/json'},body:JSON.stringify({text,capability:{id:'autonomy.status',input:{}},intent_context:{surface:'mel-full',requested_mode:mode,role:mode==='code'?'developer':'assistant'}})});
}
async function fixture(t){
 const DB=sqliteD1({maintenanceFence:true});t.after(()=>DB.close());
 const metadata=JSON.stringify({paused:false,max_autonomy:true,source:'owner-fixture',owner_control_version:7});
 await DB.prepare('INSERT INTO dev_bridge_state VALUES(?,?,?,?)').bind('mel-autonomy-control',1,'MAX_AUTONOMY',metadata).run();
 return {DB,metadata};
}
for(const mode of ['conversation','code'])test('an explanatory status read answers every question through inference, mode='+mode,async t=>{
 const {DB,metadata}=await fixture(t);const calls=[];
 const response=await worker.fetch(request('Explique pourquoi MAX est bloqué et pourquoi les images ne sont pas affichées',mode),{DB,MELITURGOS_USER:'fixture',MELITURGOS_PASSWORD:'local-only',AI:{async run(model,input){calls.push({model,input});return {response:explanation};}}});
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.ok(calls.length>0);
 assert.match(result.text,/Je distingue deux vérifications/);assert.match(result.text,/chargement dans le navigateur/);
 assert.match(result.text,/État d’autonomie vérifié/);assert.match(result.text,/MAX est activé/);
 assert.ok(JSON.stringify(calls[0].input.messages).includes('autonomy.status'));
 assert.ok(result.tool_results.some(row=>row.capability==='autonomy.status'&&row.status==='SUCCEEDED'));
 assert.ok(!result.tool_results.some(row=>['autonomy.tick','evolution.enqueue','computer.quick'].includes(row.capability)));
 assert.equal((await DB.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?').bind('mel-autonomy-control').first()).metadata_json,metadata);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM dev_jobs').first()).n,0);
});

test('a simple status read keeps its fast factual answer without model calls',async t=>{
 const {DB}=await fixture(t);let calls=0;
 const result=await(await worker.fetch(request('Quel est le statut de MAX ?'),{DB,MELITURGOS_USER:'fixture',MELITURGOS_PASSWORD:'local-only',AI:{async run(){calls++;throw Error('UNNECESSARY_INFERENCE');}}})).json();
 assert.equal(calls,0);assert.equal(result.response_mode,'autonomy-status');assert.match(result.text,/État d’autonomie vérifié/);
});

test('an unavailable status read is reported as a read failure, not a failed cycle',async()=>{
 const result=await(await worker.fetch(request('Quel est le statut de MAX ?'),{MELITURGOS_USER:'fixture',MELITURGOS_PASSWORD:'local-only'})).json();
 assert.match(result.text,/lire l’état/);assert.match(result.text,/DB_BINDING_MISSING/);
 assert.doesNotMatch(result.text,/cycle.*exécuter/);
});

test('a model-suggested autonomy command cannot turn an explanatory read into execution',async t=>{
 const {DB,metadata}=await fixture(t);
 const result=await(await worker.fetch(request('Explique pourquoi MAX est bloqué et comment vérifier les images'),{DB,MELITURGOS_USER:'fixture',MELITURGOS_PASSWORD:'local-only',AI:{async run(){return {response:JSON.stringify({tool:'autonomy.tick',input:{}})};}}})).json();
 assert.ok(!result.tool_results.some(row=>row.capability==='autonomy.tick'));
 assert.doesNotMatch(result.text,/"tool"|"input"/);
 assert.match(result.text,/État d’autonomie vérifié/);
 assert.equal((await DB.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?').bind('mel-autonomy-control').first()).metadata_json,metadata);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM dev_jobs').first()).n,0);
});
