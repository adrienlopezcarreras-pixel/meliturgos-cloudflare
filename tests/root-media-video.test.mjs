import assert from "node:assert/strict";
import {copyFile,unlink} from "node:fs/promises";

const testWorker="/tmp/meliturgos-root-media-video.test.mjs";
await copyFile(new URL("../worker.js",import.meta.url),testWorker);
const {default:worker}=await import("file://"+testWorker+"?v="+Date.now());
const auth="Basic "+Buffer.from("adrien:test").toString("base64");
let puts=0,sql=[];
const statement={bind(){return this},run:async()=>({meta:{changes:0,last_row_id:0}}),first:async()=>({n:0,quick_check:"ok"}),all:async()=>({results:[]})};
const env={MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test",OWNER_NAME:"Adrien",DB:{prepare(query){sql.push(String(query));return Object.create(statement)},batch:async()=>[]},MEDIA_BUCKET:{put:async()=>{puts++}},AI:{run:async()=>({response:"ok"})}};
async function request(path,options={}){const headers=new Headers(options.headers||{});headers.set("Authorization",auth);return worker.fetch(new Request("https://meliturgos.test"+path,{...options,headers}),env)}

{
 const response=await request("/");assert.equal(response.status,200);const html=await response.text();
 assert.match(html,/type="file" accept="\*\/\*"/);assert.match(html,/Déposer ici/);assert.match(html,/Assistant vidéo/);assert.match(html,/controls playsinline muted/);assert.match(html,/URL\.createObjectURL/);assert.match(html,/textContent/);assert.doesNotMatch(html,/href="https?:\/\//);
}
{
 const form=new FormData();form.append("file",new Blob(["unknown"],{type:"application/octet-stream"}),"archive.xyz");const before=sql.filter(x=>/^\s*(INSERT|UPDATE|DELETE)/i.test(x)).length;const response=await request("/api/media/root-upload",{method:"POST",body:form});const body=await response.json();assert.equal(response.status,201);assert.equal(body.mime_type,"application/octet-stream");assert.equal(body.analysis_supported,false);assert.match(body.message,/analyse non disponible/);assert.equal(body.private,true);assert.equal(puts,1);assert.equal(sql.filter(x=>/^\s*(INSERT|UPDATE|DELETE)/i.test(x)).length,before);assert.equal(Object.hasOwn(body,"url"),false);
}
{
 const response=await request("/api/avatar/video",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:"test"})});assert.equal(response.status,503);assert.equal((await response.json()).code,"AVATAR_PROVIDER_NOT_CONFIGURED");
}
await unlink(testWorker);
console.log("root-media-video: interface, dépôt inconnu, aperçu local et fallback avatar validés");
