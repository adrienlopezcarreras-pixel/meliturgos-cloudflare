import test from "node:test";
import assert from "node:assert/strict";
import {sqliteD1} from "./helpers/sqlite-d1.mjs";
import {maybeHandleAndroidCompanionApi} from "../src/devices/android-companion-api.js";
import {maybeHandleWaveshareTerminalApi} from "../src/devices/waveshare-terminal-api.js";

const root="https://mel.test";
const ownerAuth="Basic "+Buffer.from("adrien:test").toString("base64");
const envFor=DB=>({DB,MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test"});
async function pairAndroid(env,id) {
  const ticket=await maybeHandleAndroidCompanionApi(new Request(root+"/api/android/v1/pair-code",{
    method:"POST",headers:{authorization:ownerAuth,"content-type":"application/json"},body:"{}"
  }),env);
  assert.equal(ticket.status,200);
  const {code}=await ticket.json();
  const res=await maybeHandleAndroidCompanionApi(new Request(root+"/api/android/v1/pair",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({pair_code:code,device_id:id,name:"Android",app_version:"test",protocol_version:"1.0"})
  }),env);
  assert.equal(res.status,200);
  return res.json();
}
async function pairMini(env,id) {
  const res=await maybeHandleWaveshareTerminalApi(new Request(root+"/api/device/v1/pair",{
    method:"POST",headers:{authorization:ownerAuth,"content-type":"application/json"},
    body:JSON.stringify({device_id:id,protocol_version:"1.0"})
  }),env);
  assert.equal(res.status,200);
  return res.json();
}
async function readDelegated(env,phone,miniId,tokenOverride=null){
  const res=await maybeHandleAndroidCompanionApi(new Request(root+"/api/android/v1/mini/triad-activity",{
    headers:{authorization:"Bearer "+(tokenOverride??phone.token),
      "x-mel-device-id":phone.device_id,"x-mel-mini-device-id":miniId}
  }),env);
  return {http:res.status,...await res.json()};
}
async function publish(env,phone,phase){
  const res=await maybeHandleAndroidCompanionApi(new Request(root+"/api/android/v1/triad-activity",{
    method:"POST",headers:{authorization:"Bearer "+phone.token,"x-mel-device-id":phone.device_id,
      "content-type":"application/json"},body:JSON.stringify({phase})
  }),env);
  assert.equal(res.status,200);
}
async function direct(env,mini) {
  const res=await maybeHandleWaveshareTerminalApi(new Request(root+"/api/device/v1/triad-activity",{
    headers:{authorization:"Bearer "+mini.token,"x-mel-device-id":mini.device_id}
  }),env);
  return {http:res.status,...await res.json()};
}
test("Android delegated MINI phase is authenticated and restricted to the linked source phone",async()=>{
  const DB=sqliteD1();
  try{
    const env=envFor(DB);
    const a=await pairAndroid(env,"phone-a");
    const b=await pairAndroid(env,"phone-b");
    const mini=await pairMini(env,"mini-a");
    const anotherMini=await pairMini(env,"mini-b");
    await publish(env,a,"CAPTURING");
    assert.equal((await readDelegated(env,a,mini.device_id,"wrong")).http,401);
    assert.equal((await readDelegated(env,a,"unknown-mini")).http,403);
    const original=await readDelegated(env,a,mini.device_id);
    assert.equal(original.http,200);
    assert.equal(original.state,"FRESH");
    assert.equal(original.phase,"CAPTURING");
    assert.equal(original.conversation_synced,false);
    const now=Date.now();
    await DB.prepare("INSERT INTO android_mini_links(android_device_id,mini_device_id,linked_at,last_seen_at) VALUES(?,?,?,?)")
      .bind(b.device_id,mini.device_id,now,now).run();
    await publish(env,b,"RESPONDING");
    assert.equal((await direct(env,mini)).phase,"RESPONDING");
    const projectedA=await readDelegated(env,a,mini.device_id);
    assert.equal(projectedA.phase,"CAPTURING");
    assert.equal(JSON.stringify(projectedA).includes("phone-a"),false);
    assert.equal(JSON.stringify(projectedA).includes("phone-b"),false);
    assert.equal((await direct(env,anotherMini)).state,"UNAVAILABLE");
  } finally {DB.close();}
});

test("revocation or expiry prevents delegated MINI from observing previous Android phases",async()=>{
  const DB=sqliteD1();
  try{
    const env=envFor(DB);
    const a=await pairAndroid(env,"phone-revoked");
    const mini=await pairMini(env,"mini-revoked");
    await publish(env,a,"THINKING");
    assert.equal((await readDelegated(env,a,mini.device_id)).state,"FRESH");
    await DB.prepare("UPDATE android_triad_activity SET observed_at=? WHERE device_id=?")
      .bind(Date.now()-40000,a.device_id).run();
    assert.equal((await readDelegated(env,a,mini.device_id)).state,"UNAVAILABLE");
    await publish(env,a,"RESPONDING");
    await DB.prepare("UPDATE android_device_tokens SET revoked_at=? WHERE device_id=?")
      .bind(Date.now(),a.device_id).run();
    assert.equal((await readDelegated(env,a,mini.device_id)).http,401);
    assert.equal((await direct(env,mini)).state,"UNAVAILABLE");
  } finally {DB.close();}
});
