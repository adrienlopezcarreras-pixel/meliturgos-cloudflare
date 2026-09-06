import assert from "node:assert/strict";
import {copyFile,unlink} from "node:fs/promises";
const testWorker="/tmp/meliturgos-reliability-test.mjs";
await copyFile(new URL("../worker.js",import.meta.url),testWorker);
const {default:worker}=await import("file://"+testWorker+"?v="+Date.now());

const auth="Basic "+Buffer.from("adrien:test-password").toString("base64"),writes=[];
function env({ai=true,media=true}={}){return{
 MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test-password",OWNER_NAME:"Adrien",
 DB:{prepare(sql){return{bind(...args){this.args=args;return this},run:async()=>{if(/^\s*(?:INSERT|UPDATE|DELETE)/i.test(sql))writes.push(sql);return{meta:{changes:sql.includes("INSERT OR IGNORE")?1:0,last_row_id:1}}},first:async()=>String(sql).includes("PRAGMA quick_check")?{quick_check:"ok"}:{n:String(sql).includes("memories")?3:1},all:async()=>({results:String(sql).includes("memories")?[{id:1,kind:"fact",content:"private-memory",importance:.8,confidence:.8,metadata:"{}"}]:[{id:1,user_text:"private-question",assistant_text:"private-answer",model:"test"}]})}},batch:async()=>[]},
 ...(ai?{AI:{run:async()=>({response:"ok"})}}:{}),...(media?{MEDIA_BUCKET:{put:async()=>{throw Error("unexpected R2 write")}}}:{})
}}
async function request(path,{method="GET",payload,bindings=env(),authenticated=true}={}){const headers=authenticated?{Authorization:auth}:{};if(payload!==undefined)headers["content-type"]="application/json";return worker.fetch(new Request("https://meliturgos.test"+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)}),bindings)}
async function json(path,options){const response=await request(path,options);return{response,body:await response.json()}}

for(const path of ["/professor","/professor/"]){const response=await request(path);assert.equal(response.status,200);assert.match(await response.text(),/Mode Professeur/)}
for(const path of ["/api/status","/api/diagnostic","/api/export"]){assert.equal((await request(path,{authenticated:false})).status,401)}

{
 const {body}=await json("/api/status");
 assert.equal(body.version,"0.2.5-rc.1");
 assert.equal(body.checks.d1,"ok");
 assert.equal(body.checks.workers_ai.status,"configured_not_probed");
 assert.equal(body.checks.media_bucket.public_access,false);
 assert.equal(body.checks.authentication.status,"active");
 assert.ok(Number.isFinite(body.latency_ms));
 assert.deepEqual(body.errors,[]);
}
{
 const {body}=await json("/api/diagnostic");
 assert.equal(body.checks.d1.status,"ok");
 assert.deepEqual(body.errors,[]);
 const serialized=JSON.stringify(body);
 assert.doesNotMatch(serialized,/test-password|private-memory|private-question|private-answer/);
}
{
 const {body}=await json("/api/diagnostic",{bindings:env({ai:false,media:false})});
 assert.equal(body.ok,false);
 assert.deepEqual(body.errors.map(e=>e.code),["AI_BINDING_MISSING","MEDIA_BUCKET_MISSING"]);
 assert.doesNotMatch(JSON.stringify(body),/password|token|secret|private-memory/i);
}
let exported;
{
 const result=await json("/api/export");exported=result.body;
 assert.equal(result.response.status,200);
 assert.equal(exported.restore.policy,"add_only");
 assert.equal(exported.restore.interactions_restored,false);
 assert.equal(exported.memories.length,1);
 assert.equal(exported.interactions.length,1);
}
const restorePayload={memories:exported.memories};
{
 const before=writes.length,result=await json("/api/import",{method:"POST",payload:restorePayload});
 assert.equal(result.response.status,409);
 assert.equal(result.body.code,"RESTORE_CONFIRMATION_REQUIRED");
 assert.equal(writes.length,before);
}
let checksum;
{
 const before=writes.length,result=await json("/api/import",{method:"POST",payload:{...restorePayload,simulation:true}});checksum=result.body.simulation_checksum;
 assert.equal(result.response.status,200);assert.equal(result.body.writes,0);assert.equal(writes.length,before);
}
{
 const before=writes.length,result=await json("/api/import",{method:"POST",payload:{...restorePayload,confirmation:"RESTORE_ADD_ONLY",simulation_checksum:"wrong"}});
 assert.equal(result.response.status,409);assert.equal(writes.length,before);
}
{
 const result=await json("/api/import",{method:"POST",payload:{...restorePayload,confirmation:"RESTORE_ADD_ONLY",simulation_checksum:checksum}});
 assert.equal(result.response.status,200);assert.equal(result.body.policy,"add_only");assert.equal(result.body.overwritten,0);
 assert.ok(writes.some(sql=>sql.includes("INSERT OR IGNORE INTO memories")));
 assert.ok(!writes.some(sql=>sql.includes("UPDATE memories")||sql.includes("DELETE FROM memories")||sql.includes("INSERT INTO interactions")));
}

await unlink(testWorker);
console.log("reliability-restore: routes, auth, health, export et restauration validés");
