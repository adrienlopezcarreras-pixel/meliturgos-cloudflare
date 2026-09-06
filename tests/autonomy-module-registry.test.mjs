import assert from "node:assert/strict";
import {copyFile,unlink} from "node:fs/promises";
const tmp="/tmp/meliturgos-modules.test.mjs";await copyFile(new URL("../worker.js",import.meta.url),tmp);const {default:worker}=await import("file://"+tmp+"?v="+Date.now());
const auth="Basic "+Buffer.from("adrien:test").toString("base64"),stmt={bind(){return this},run:async()=>({meta:{changes:0}}),first:async()=>({n:0,quick_check:"ok"}),all:async()=>({results:[]})};
const env={MELITURGOS_PASSWORD:"test",DB:{prepare(){return Object.create(stmt)},batch:async()=>[]}};
const r=await worker.fetch(new Request("https://local/api/modules/registry",{headers:{Authorization:auth}}),env);assert.equal(r.status,200);const j=await r.json();assert.ok(j.modules.some(m=>m.id==="development_runner"));assert.ok(j.modules.some(m=>m.state==="disabled"));const u=await worker.fetch(new Request("https://local/api/modules/registry"),env);assert.equal(u.status,401);await unlink(tmp);console.log("autonomy-module-registry: registre, états et auth validés");
