import assert from "node:assert/strict";
import {copyFile,unlink,readFile} from "node:fs/promises";
const testWorker="/tmp/meliturgos-knowledge-test.mjs";
await copyFile(new URL("../worker.js",import.meta.url),testWorker);
const {default:worker}=await import("file://"+testWorker+"?v="+Date.now());
const auth="Basic "+Buffer.from("adrien:test").toString("base64");
function env(initialStatus="running"){let importStatus=initialStatus;const db={prepare(sql){const s={bind(){return s},run:async()=>({meta:{changes:1,last_row_id:1}}),first:async()=>{if(/PRAGMA quick_check/.test(sql))return{quick_check:"ok"};if(/knowledge_sources/.test(sql))return{id:"src-1",name:"Doc",source_date:1700000000000,confidence:.8,rights:"read",status:"active"};if(/idempotency_key/.test(sql))return null;if(/knowledge_imports/.test(sql))return{id:"imp-1",status:importStatus,passage_count:1};return{n:0}},all:async()=>({results:/knowledge_passages/.test(sql)?[{id:1,source_id:"src-1",title:"Doc",text:"texte contrôlé",source_date:1700000000000,confidence:.8,rights:"read",name:"Doc",kind:"document",author:"Auteur",url:"https://example.com"}]:[]})};if(/UPDATE knowledge_imports/.test(sql))s.run=async()=>({meta:{changes:1}});return s},batch:async()=>[]};return{MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test",OWNER_NAME:"Adrien",DB:db,MEDIA_BUCKET:{put:async()=>{throw Error("R2 interdit")}}}}
async function call(path,{method="GET",body,authorized=true,status="running"}={}){const h=authorized?{Authorization:auth}:{};if(body!==undefined)h["content-type"]="application/json";return worker.fetch(new Request("https://meliturgos.test"+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env(status))}
{
 const r=await call("/api/knowledge/source",{method:"POST",body:{authorized:true,name:"x",kind:"web",url:"http://127.0.0.1/a"}});assert.equal(r.status,400);assert.equal((await r.json()).code,"SOURCE_INVALID");
 const s=await call("/api/knowledge/source",{method:"POST",body:{authorized:true,name:"x",kind:"web",url:"https://example.com/a",provenance:"catalogue"}});assert.equal(s.status,200);assert.equal((await s.json()).provenance,"catalogue");
 const secretAttempt=await call("/api/knowledge/source",{method:"POST",body:{authorized:true,name:"x",author:"token=abc",kind:"web",url:"https://example.com"}});assert.ok([400,403].includes(secretAttempt.status));assert.doesNotMatch(await secretAttempt.text(),/abc/);
}
{
 const r=await call("/api/knowledge/import",{method:"POST",body:{source_id:"src-1",idempotency_key:"k1",text:""}});assert.equal(r.status,400);assert.equal((await r.json()).code,"IMPORT_INVALID");
 const r2=await call("/api/knowledge/import",{method:"POST",body:{source_id:"src-1",idempotency_key:"k1",text:"texte autorisé"}});assert.equal(r2.status,201);assert.equal((await r2.json()).status,"completed");
}
{
 const r=await call("/api/knowledge/search?q=texte");const b=await r.json();assert.equal(r.status,200);assert.equal(b.results[0].confidence,.8);assert.equal(b.results[0].citation.source_id,"src-1");
 const revoked=await call("/api/knowledge/source/src-1/revoke",{method:"POST",body:{}});assert.equal(revoked.status,200);assert.equal((await revoked.json()).logical,true);
}
for(const [action,status] of [["pause","running"],["resume","paused"],["cancel","running"]]){const r=await call("/api/knowledge/import/imp-1/"+action,{method:"POST",body:{},status});assert.equal(r.status,200);assert.equal((await r.json()).status,{pause:"paused",resume:"running",cancel:"cancelled"}[action])}
assert.equal((await call("/api/knowledge/search?q=texte",{authorized:false})).status,401);
assert.equal((await call("/api/diagnostic")).status,200);
const source=await readFile(new URL("../worker.js",import.meta.url),"utf8");assert.match(source,/safeExternalUrl/);assert.match(source,/ON CONFLICT\(source_id,content_hash\) DO NOTHING/);assert.match(source,/knowledge-panel/);assert.doesNotMatch(source,/api[_ -]?key\s*:/i);
await unlink(testWorker);console.log("knowledge-controlled: import, déduplication, recherche, provenance, révocation, contrôles et secrets validés");
