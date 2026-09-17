import assert from "node:assert/strict";
import {copyFile,unlink} from "node:fs/promises";

const testWorker="/tmp/meliturgos-voice-test.mjs";
await copyFile(new URL("../worker.js",import.meta.url),testWorker);
const {default:worker}=await import("file://"+testWorker+"?v="+Date.now());
const auth="Basic "+Buffer.from("adrien:test-password").toString("base64");

function env({ai=true}={}){return{
 MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test-password",OWNER_NAME:"Adrien",
 DB:{prepare(sql){return{bind(){return this},run:async()=>({meta:{changes:0,last_row_id:1}}),first:async()=>String(sql).includes("PRAGMA")?{quick_check:"ok"}:{n:0},all:async()=>({results:[]})}},batch:async()=>[]},
 ...(ai?{AI:{run:async()=>({text:"bonjour depuis le micro"})}}:{})
}}

async function transcribe(bindings=env(),audio=new Blob(["audio"],{type:"audio/webm"})){const form=new FormData();form.append("audio",audio,"voice.webm");return worker.fetch(new Request("https://meliturgos.test/api/voice/transcribe",{method:"POST",headers:{Authorization:auth},body:form}),bindings)}

{
 const response=await transcribe();
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,text:"bonjour depuis le micro",language:"fr",model:"@cf/openai/whisper-large-v3-turbo",stored:false});
}
{
 const response=await transcribe(env({ai:false}));
 assert.equal(response.status,503);
 const body=await response.json();
 assert.equal(body.fallback,"text");
 assert.equal(body.available,false);
}
{
 const response=await worker.fetch(new Request("https://meliturgos.test/api/voice/transcribe",{method:"POST",headers:{Authorization:auth,"content-type":"application/json"},body:"{}"}),env());
 assert.equal(response.status,415);
 assert.equal((await response.json()).code,"AUDIO_REQUIRED");
}

const fs=await import("node:fs/promises");
const source=await fs.readFile(new URL("../worker.js",import.meta.url),"utf8");
const uiSource=await fs.readFile(new URL("../src/pages/mvp-interface-v3.js",import.meta.url),"utf8");
assert.ok(source.includes("MediaRecorder"));
assert.ok(source.includes("mel-avatar"));
assert.ok(source.includes("getTracks().forEach"));
assert.ok(source.includes('fallback:"text"'));
assert.ok(uiSource.includes("navigator.mediaDevices?.getUserMedia"));
assert.ok(uiSource.includes("new MediaRecorder"));
assert.ok(uiSource.includes("/api/voice/transcribe"));
assert.ok(uiSource.includes("getTracks().forEach"));
assert.ok(uiSource.includes("Reconnaissance vocale et enregistrement micro indisponibles."));
assert.ok(uiSource.includes("avatar.addEventListener('click'"));
await unlink(testWorker);
console.log("voice-mobile: transcription serveur, fallback MediaRecorder Firefox/Android, auth et libération micro validés");
