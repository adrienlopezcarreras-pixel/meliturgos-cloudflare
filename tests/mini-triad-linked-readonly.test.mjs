import test from "node:test";
import assert from "node:assert/strict";
import {maybeHandleWaveshareTerminalApi,WAVESHARE_TERMINAL_MODEL} from "../src/devices/waveshare-terminal-api.js";
import {sqliteD1} from "./helpers/sqlite-d1.mjs";

const origin="https://mel.test";
const owner="Basic "+Buffer.from("adrien:test").toString("base64");
const envFor=DB=>({DB,MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test"});

async function pair(env,id) {
  const response=await maybeHandleWaveshareTerminalApi(new Request(origin+"/api/device/v1/pair",{
    method:"POST",headers:{authorization:owner,"content-type":"application/json"},
    body:JSON.stringify({device_id:id,model:WAVESHARE_TERMINAL_MODEL,
      protocol_version:"1.0",name:"MINI"})
  }),env);
  assert.equal(response.status,200);
  return response.json();
}
async function read(env,mini,token=mini.token) {
  const response=await maybeHandleWaveshareTerminalApi(
    new Request(origin+"/api/device/v1/triad-activity",{
      headers:{authorization:"Bearer "+token,"x-mel-device-id":mini.device_id}
    }),env);
  return {http:response.status,...await response.json()};
}
async function android(DB) {
  await DB.prepare("CREATE TABLE android_device_tokens(device_id TEXT PRIMARY KEY,revoked_at INTEGER)").run();
  await DB.prepare("CREATE TABLE android_triad_activity(device_id TEXT PRIMARY KEY,phase TEXT NOT NULL,observed_at INTEGER NOT NULL)").run();
  await DB.prepare("INSERT INTO android_device_tokens(device_id,revoked_at) VALUES(?,NULL)")
    .bind("android-identified-private").run();
}
test("paired MINI reads a recent phase only from explicitly linked Android device",async()=>{
  const DB=sqliteD1();
  try {
    const env=envFor(DB);
    const a=await pair(env,"mini-a");
    const b=await pair(env,"mini-b");
    const unauthorized=await maybeHandleWaveshareTerminalApi(
      new Request(origin+"/api/device/v1/triad-activity"),env);
    assert.equal(unauthorized.status,401);
    assert.equal((await read(env,a,"wrong")).http,401);
    await android(DB);
    const now=Date.now();
    await DB.prepare("INSERT INTO android_triad_activity(device_id,phase,observed_at) VALUES(?,?,?)")
      .bind("android-identified-private","RESPONDING",now).run();
    assert.equal((await read(env,a)).state,"UNAVAILABLE");
    await DB.prepare("INSERT INTO android_mini_links(android_device_id,mini_device_id,linked_at,last_seen_at) VALUES(?,?,?,?)")
      .bind("android-identified-private",a.device_id,now,now).run();
    const live=await read(env,a);
    assert.equal(live.http,200);
    assert.equal(live.state,"FRESH");
    assert.equal(live.phase,"RESPONDING");
    assert.equal(live.conversation_synced,false);
    assert.equal(live.expires_at_ms-live.observed_at_ms,30000);
    assert.equal(JSON.stringify(live).includes("android-identified-private"),false);
    assert.equal(JSON.stringify(live).includes("mini-a"),false);
    assert.equal((await read(env,b)).state,"UNAVAILABLE");
    await DB.prepare("UPDATE device_tokens SET revoked_at=? WHERE device_id=?")
      .bind(Date.now(),a.device_id).run();
    assert.equal((await read(env,a)).http,401);
  }finally{DB.close();}
});

test("MINI remote phase refuses revoked, stale, future and unknown activity",async()=>{
  const DB=sqliteD1();
  try {
    const env=envFor(DB);
    const mini=await pair(env,"mini-ttl");
    await android(DB);
    const now=Date.now();
    await DB.prepare("INSERT INTO android_mini_links(android_device_id,mini_device_id,linked_at,last_seen_at) VALUES(?,?,?,?)")
      .bind("android-identified-private",mini.device_id,now,now).run();
    for(const [phase,offset] of [["THINKING",-35000],["RESPONDING",70000],["UNPROVEN",0]]){
      await DB.prepare("INSERT INTO android_triad_activity(device_id,phase,observed_at) VALUES(?,?,?) "+
        "ON CONFLICT(device_id) DO UPDATE SET phase=excluded.phase,observed_at=excluded.observed_at")
        .bind("android-identified-private",phase,Date.now()+offset).run();
      const r=await read(env,mini);
      assert.equal(r.state,"UNAVAILABLE");
      assert.equal(r.phase,null);
    }
    await DB.prepare("UPDATE android_triad_activity SET phase='CAPTURING',observed_at=?")
      .bind(Date.now()).run();
    assert.equal((await read(env,mini)).state,"FRESH");
    await DB.prepare("UPDATE android_device_tokens SET revoked_at=? WHERE device_id=?")
      .bind(Date.now(),"android-identified-private").run();
    assert.equal((await read(env,mini)).state,"UNAVAILABLE");
  }finally{DB.close();}
});
