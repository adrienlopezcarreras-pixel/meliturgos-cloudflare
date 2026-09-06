import assert from "node:assert/strict";
import {copyFile,unlink,readFile} from "node:fs/promises";
const testWorker="/tmp/meliturgos-specialists-test.mjs";
await copyFile(new URL("../worker.js",import.meta.url),testWorker);
const {default:worker}=await import("file://"+testWorker+"?v="+Date.now());
const auth="Basic "+Buffer.from("adrien:test").toString("base64");
function env(){const st={bind(){return this},run:async()=>({meta:{changes:0,last_row_id:1}}),first:async()=>({n:0,quick_check:"ok"}),all:async()=>({results:[]})};return{MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test",OWNER_NAME:"Adrien",DB:{prepare(sql){const s=Object.create(st);if(String(sql).includes("PRAGMA quick_check"))s.first=async()=>({quick_check:"ok"});return s},batch:async()=>[]},MEDIA_BUCKET:{put:async()=>{throw Error("private")}}}}
async function call(path,authorized=true){return worker.fetch(new Request("https://meliturgos.test"+path,{headers:authorized?{Authorization:auth}:{}}),env())}
{
 const r=await call("/api/tools/specialists/status"),b=await r.json();assert.equal(r.status,200);assert.equal(b.specialists.length,7);for(const s of b.specialists){assert.equal(s.available,false);assert.equal(s.effective_status,"disabled");assert.equal(s.fallback,"general_model");assert.ok(s.permissions.length)}
 for(const [q,id] of [["recherche cette source","knowledge"],["rappelle ce souvenir","memory"],["enregistre cet audio","voice"],["montre cette photo","multimedia"],["enseigne-moi","professor"]]){const x=await (await call("/api/tools/specialists/select?q="+encodeURIComponent(q))).json();assert.equal(x.specialist,id);assert.equal(x.selected,"general_model");assert.equal(x.active,false);assert.equal(x.simulation,true);assert.match(x.reason,/désactivé/)}
 const denied=await (await call("/api/tools/specialists/select?q=résume&tool=media.write")).json();assert.equal(denied.tool_allowed,false);
 assert.equal((await call("/api/tools/specialists/status",false)).status,401);
 assert.match(await (await call("/professor")).text(),/specialist-router/);
 assert.equal((await call("/api/diagnostic")).status,200);
}
const source=await readFile(new URL("../worker.js",import.meta.url),"utf8");assert.match(source,/SPECIALISTS/);assert.match(source,/specialistForTask/);assert.match(source,/general_model/);assert.match(source,/permissions/);assert.doesNotMatch(source,/fine[- ]?tuning|LoRA|réentraînement/i);
await unlink(testWorker);console.log("specialists-router: profils, routage, permissions, fallback, désactivation et auth validés");
