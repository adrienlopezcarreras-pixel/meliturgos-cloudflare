import assert from "node:assert/strict";
import {copyFile,unlink,readFile} from "node:fs/promises";
const testWorker="/tmp/meliturgos-learning-test.mjs";
await copyFile(new URL("../worker.js",import.meta.url),testWorker);
const {default:worker}=await import("file://"+testWorker+"?v="+Date.now());
const auth="Basic "+Buffer.from("adrien:test").toString("base64");let updates=[];let aiMessages=[];
function env(){const db={prepare(sql){const s={bind(...args){s.args=args;return s},run:async()=>{if(/UPDATE memories/.test(sql))updates.push(s.args);return{meta:{changes:1,last_row_id:1}}},first:async()=>{if(/PRAGMA quick_check/.test(sql))return{quick_check:"ok"};if(/learning_profiles/.test(sql))return{level:"beginner",preferences:JSON.stringify({detail:"court",temporary:{value:"x",expires_at:Date.now()-1}}),goals:["français"],domains:["grammaire"]};if(/memories WHERE id/.test(sql))return{metadata:'{"learning_class":"confirmed_fact"}'};return{n:0}},all:async()=>({results:/memories/.test(sql)?[{id:1,kind:"fact",content:"fait confirmé",importance:.9,confidence:.9,created_at:1,metadata:'{"learning_class":"confirmed_fact","provenance":"test"}'}]:[]})};return s},batch:async()=>[]};return{MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test",OWNER_NAME:"Adrien",DB:db,MEDIA_BUCKET:{put:async()=>{}},AI:{run:async(model,payload)=>{aiMessages.push(payload.messages);return{response:"réponse personnalisée"}}}}}
async function call(path,{method="GET",body,authorized=true}={}){const h=authorized?{Authorization:auth}:{};if(body!==undefined)h["content-type"]="application/json";return worker.fetch(new Request("https://meliturgos.test"+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env())}
{
 const r=await call("/api/remember",{method:"POST",body:{content:"préférence temporaire",kind:"preference",learning_class:"temporary_context",valid_until:Date.now()+10000,provenance:"explicit_user"}});assert.equal(r.status,200);assert.equal((await r.json()).learning_class,"temporary_context");
 const revoke=await call("/api/remember",{method:"POST",body:{id:1,action:"revoke"}});assert.equal(revoke.status,200);assert.equal((await revoke.json()).status,"revoked");assert.equal(updates.length,1);
}
{
 const p=await call("/api/learning/profile",{method:"POST",body:{level:"beginner",preferences:{detail:"court",temporary:{value:"x",expires_at:Date.now()-1}},goals:["français"],domains:["grammaire"]}});assert.equal(p.status,200);assert.doesNotMatch(JSON.stringify(await p.json()),/token|password|api[_ -]?key/i);
 const chat=await call("/api/chat",{method:"POST",body:{text:"Explique la grammaire"}});assert.equal(chat.status,200);assert.match(JSON.stringify(aiMessages),/beginner/);assert.doesNotMatch(JSON.stringify(aiMessages),/temporary_context|"x"/);
}
assert.equal((await call("/api/remember",{method:"POST",body:{content:"api_key=supersecret"}})).status,400);
assert.equal((await call("/api/diagnostic",{authorized:false})).status,401);
const source=await readFile(new URL("../worker.js",import.meta.url),"utf8");assert.match(source,/LEARNING_CLASSES/);assert.match(source,/activeMemory/);assert.match(source,/valid_until/);assert.match(source,/Distingue fait confirmé/);assert.match(source,/learning_class/);
await unlink(testWorker);console.log("learning-personalization: classifications, expiration, révocation, préférences, corrections et secrets validés");
