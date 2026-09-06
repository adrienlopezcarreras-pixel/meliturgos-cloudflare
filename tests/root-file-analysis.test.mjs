import assert from "node:assert/strict";
import {copyFile,unlink} from "node:fs/promises";
const tmp="/tmp/meliturgos-root-file-analysis.test.mjs";
await copyFile(new URL("../worker.js",import.meta.url),tmp);
const {default:worker}=await import("file://"+tmp+"?v="+Date.now());
const auth="Basic "+Buffer.from("adrien:test").toString("base64");
let aiCalls=0, writes=0;
const stmt={bind(){return this},run:async()=>({meta:{changes:0}}),first:async()=>({n:0,quick_check:"ok"}),all:async()=>({results:[]})};
const env={MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test",DB:{prepare(q){if(/^\s*(INSERT|UPDATE|DELETE)/i.test(q))writes++;return Object.create(stmt)},batch:async()=>[]},AI:{run:async(_m,{messages}={})=>{aiCalls++;return {response:"Résumé et analyse sûrs"}}}};
async function analyze(name,type,data){const f=new FormData();f.append("file",new Blob([data],{type}),name);const h=new Headers({Authorization:auth});return worker.fetch(new Request("https://test/api/files/analyze",{method:"POST",headers:h,body:f}),env)}
let r=await analyze("note.txt","text/plain","bonjour MELITURGOS");let j=await r.json();assert.equal(r.status,200);assert.equal(j.status,"analyzed");assert.match(j.preview_text,/bonjour/);
r=await analyze("photo.png","image/png","PNG");j=await r.json();assert.equal(j.status,"preview_only");
r=await analyze("song.mp3","audio/mpeg","MP3");j=await r.json();assert.equal(j.status,"analyzed");
r=await analyze("clip.mp4","video/mp4","MP4");j=await r.json();assert.equal(j.status,"preview_only");
r=await analyze("archive.zip","application/zip","ZIP");j=await r.json();assert.equal(j.status,"unsupported");
r=await analyze("script.js","application/javascript","globalThis.__executed=true");j=await r.json();assert.equal(j.status,"analyzed");assert.equal(globalThis.__executed,undefined);assert.ok(aiCalls>=2);assert.equal(writes,0);
await unlink(tmp);console.log("root-file-analysis: TXT image MP3 video ZIP JS, sécurité et absence d'écriture validés");
