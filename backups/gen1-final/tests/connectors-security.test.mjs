import assert from "node:assert/strict";
import {copyFile,unlink,readFile} from "node:fs/promises";

const testWorker="/tmp/meliturgos-connectors-test.mjs";
await copyFile(new URL("../worker.js",import.meta.url),testWorker);
const {default:worker}=await import("file://"+testWorker+"?v="+Date.now());
const auth="Basic "+Buffer.from("adrien:test").toString("base64");
function env(){const statement={bind(){return this},run:async()=>({meta:{changes:0,last_row_id:1}}),first:async()=>({n:0,quick_check:"ok"}),all:async()=>({results:[]})};return{MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test",OWNER_NAME:"Adrien",DB:{prepare(sql){const s=Object.create(statement);if(String(sql).includes("PRAGMA"))s.first=async()=>({quick_check:"ok"});return s},batch:async()=>[]},MEDIA_BUCKET:{put:async()=>{throw Error("must not write")}}}}
async function call(path,body,authorized=true){const headers=authorized?{Authorization:auth}:{};if(body!==undefined)headers["content-type"]="application/json";return worker.fetch(new Request("https://meliturgos.test"+path,{method:body===undefined?"GET":"POST",headers,body:body===undefined?undefined:JSON.stringify(body)}),env())}
{
 const response=await call("/api/tools/connectors/registry");
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.mode,"read_only");
 assert.equal(body.usage_journal.persisted,false);
 for(const c of body.connectors){assert.equal(c.available,false);assert.equal(c.status,"disabled");assert.equal(c.authorization,"not_configured");assert.equal(c.last_checked,null);assert.equal(c.supports_write,false);assert.match(c.reason,/identifiant|stockage/)}
}
{
 const body=await (await call("/api/tools/connectors/gmail/status")).json();
 assert.equal(body.status,"disabled");assert.equal(body.available,false);assert.equal(body.last_verification,null);assert.equal(body.error,null);assert.equal(body.mode,"read_only");
 assert.equal((await call("/api/tools/connectors/unknown/status")).status,404);
}
assert.equal((await call("/api/tools/connectors/gmail/usage")).status,200);
{
 const response=await call("/api/tasks",{type:"email",idempotency_key:"connector-dry-run",simulation:true});
 const body=await response.json();assert.equal(response.status,200);assert.equal(body.executed,false);assert.equal(body.task.state,"simulated");
}
{
 const response=await call("/api/tasks",{type:"email",idempotency_key:"connector-write-denied"});
 assert.equal(response.status,403);assert.equal((await response.json()).code,"HUMAN_APPROVAL_REQUIRED");
}
assert.equal((await call("/api/tools/connectors/registry",undefined,false)).status,401);
const source=await readFile(new URL("../worker.js",import.meta.url),"utf8");
assert.match(source,/MediaRecorder/);assert.match(source,/voice-stop/);assert.match(source,/CONNECTOR_REGISTRY/);assert.match(source,/secrets hors D1, logs et mémoire/);
await unlink(testWorker);
console.log("connectors-security: lecture seule, absence d’identifiants, auth, dry-run et refus écriture validés");
