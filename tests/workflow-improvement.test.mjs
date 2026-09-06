import assert from "node:assert/strict";
import {copyFile,unlink,readFile} from "node:fs/promises";
const testWorker="/tmp/meliturgos-workflow-test.mjs";
await copyFile(new URL("../worker.js",import.meta.url),testWorker);
const {default:worker}=await import("file://"+testWorker+"?v="+Date.now());
const auth="Basic "+Buffer.from("adrien:test").toString("base64");
function env(){const statement={bind(){return this},run:async()=>({meta:{changes:0,last_row_id:1}}),first:async()=>({n:2,quick_check:"ok"}),all:async()=>({results:[]})};return{MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test",OWNER_NAME:"Adrien",DB:{prepare(sql){const s=Object.create(statement);if(String(sql).includes("PRAGMA quick_check"))s.first=async()=>({quick_check:"ok"});return s},batch:async()=>[]},MEDIA_BUCKET:{put:async()=>{throw Error("R2 privé")}}}}
async function call(path,body,authorized=true){const h=authorized?{Authorization:auth}:{};if(body!==undefined)h["content-type"]="application/json";return worker.fetch(new Request("https://meliturgos.test"+path,{method:body===undefined?"GET":"POST",headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env())}
{
 const r=await call("/api/tools/workflows/status");assert.equal(r.status,200);const b=await r.json();assert.deepEqual(b.workflows.map(x=>x.workflow),["professor","knowledge","voice","connectors","memory","media"]);for(const x of b.workflows)for(const k of ["success_count","error_count","duration_ms","feedback_count","retest_quality","cost_estimated_usd","error_classes"])assert.ok(Object.hasOwn(x,k));
 const v=await call("/api/tools/workflows/variant?workflow=voice&variant=fast&simulation=true");assert.equal(v.status,200);const p=(await v.json()).proposal;assert.equal(p.executed,false);assert.equal(p.active,false);assert.match(p.rollback,/stable/);assert.ok(p.stable_comparison.criteria.includes("duration_ms"));
 assert.equal((await call("/api/tools/workflows/variant?workflow=voice&variant=fast")).status,409);
 assert.equal((await call("/api/tools/workflows/variant?workflow=unknown&simulation=true")).status,404);
 assert.equal((await call("/api/tools/workflows/status",undefined,false)).status,401);
 assert.equal((await call("/api/diagnostic")).status,200);
}
const source=await readFile(new URL("../worker.js",import.meta.url),"utf8");assert.match(source,/workflowErrorClass/);assert.match(source,/WORKFLOW_VARIANTS/);assert.match(source,/stable_comparison/);assert.match(source,/workflow-improvements/);assert.match(source,/PRAGMA quick_check/);assert.doesNotMatch(source,/training|LoRA|retrain/i);
await unlink(testWorker);console.log("workflow-improvement: métriques, classification, variante sandbox, comparaison et auth validés");
