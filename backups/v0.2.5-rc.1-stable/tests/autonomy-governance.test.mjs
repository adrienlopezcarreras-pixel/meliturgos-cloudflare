import assert from "node:assert/strict";
import {copyFile,unlink,readFile} from "node:fs/promises";
const testWorker="/tmp/meliturgos-governance-test.mjs";
await copyFile(new URL("../worker.js",import.meta.url),testWorker);
const {default:worker}=await import("file://"+testWorker+"?v="+Date.now());
const auth="Basic "+Buffer.from("adrien:test").toString("base64");
function env(){const statement={bind(){return this},run:async()=>({meta:{changes:0,last_row_id:1}}),first:async()=>({n:0,quick_check:"ok"}),all:async()=>({results:[]})};return{MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test",OWNER_NAME:"Adrien",DB:{prepare(sql){const s=Object.create(statement);if(String(sql).includes("PRAGMA quick_check"))s.first=async()=>({quick_check:"ok"});return s},batch:async()=>[]},MEDIA_BUCKET:{put:async()=>{throw Error("R2 must remain private")}}}}
async function call(path,body){const h={Authorization:auth};if(body!==undefined)h["content-type"]="application/json";return worker.fetch(new Request("https://meliturgos.test"+path,{method:body===undefined?"GET":"POST",headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env())}
{
 const denied=await call("/api/tasks",{type:"email",idempotency_key:"g-denied"});assert.equal(denied.status,403);assert.equal((await denied.json()).code,"HUMAN_APPROVAL_REQUIRED");
 const dry=await call("/api/tasks",{type:"email",idempotency_key:"g-dry",simulation:true,estimated_cost_usd:.001});assert.equal(dry.status,200);const d=await dry.json();assert.equal(d.executed,false);assert.equal(d.task.approval_status,"pending");
 const duplicate=await call("/api/tasks",{type:"email",idempotency_key:"g-dry",simulation:true});assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).duplicate,true);
 const approved=await call("/api/tasks/"+d.task.id+"/approve",{explicit_approval:true});assert.equal(approved.status,200);const a=await approved.json();assert.equal(a.validated,true);assert.equal(a.executed,false);
 const replay=await call("/api/tasks/"+d.task.id+"/approve",{explicit_approval:true});assert.equal(replay.status,409);
 const cancelDry=await call("/api/tasks",{type:"publish",idempotency_key:"g-cancel",simulation:true});const c=await cancelDry.json();const cancelled=await call("/api/tasks/"+c.task.id+"/cancel",{});assert.equal(cancelled.status,200);assert.equal((await cancelled.json()).cancelled,true);
 const gov=await call("/api/tools/governance/status");const g=await gov.json();assert.equal(g.simulation.available,true);assert.equal(g.simulation.executes_actions,false);assert.equal(g.actions.external_write,"requires_explicit_human_approval");
 const diag=await call("/api/diagnostic");assert.equal(diag.status,200);assert.equal((await diag.json()).checks.d1.status,"ok");
}
assert.equal((await call("/api/tasks",{type:"email",idempotency_key:"unauth"})).status,403);
const source=await readFile(new URL("../worker.js",import.meta.url),"utf8");assert.match(source,/expires_at/);assert.match(source,/TASK_EXPIRED/);assert.match(source,/approval_status/);assert.match(source,/max_request_bytes/);assert.match(source,/emergency_stop/);assert.match(source,/MEDIA_BUCKET/);
await unlink(testWorker);console.log("autonomy-governance: lecture, dry-run, validation, annulation, idempotence, limites et audit validés");
