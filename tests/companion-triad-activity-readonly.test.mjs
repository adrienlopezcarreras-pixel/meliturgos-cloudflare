import test from "node:test";
import assert from "node:assert/strict";
import {maybeHandleComputerApi} from "../src/devices/computer-companion-api.js";
import {sqliteD1} from "./helpers/sqlite-d1.mjs";

const root="https://mel.test";
const auth="Basic "+Buffer.from("adrien:test").toString("base64");
async function pair(env){
  const res=await maybeHandleComputerApi(new Request(root+"/api/computer/v1/pair",{
    method:"POST",headers:{authorization:auth,"content-type":"application/json"},
    body:JSON.stringify({computer_id:"pc-triad-readonly",name:"MEL Windows",platform:"windows"})
  }),env);
  assert.equal(res.status,200);
  return res.json();
}
async function read(env,paired,tokenOverride=null){
  const res=await maybeHandleComputerApi(new Request(root+"/api/computer/v1/triad-activity",{
    headers:{authorization:"Bearer "+(tokenOverride??paired.token),
      "x-mel-computer-id":paired.computer.id}
  }),env);
  return {http:res.status,...await res.json()};
}
async function initAndroid(DB){
  await DB.prepare("CREATE TABLE android_device_tokens(device_id TEXT PRIMARY KEY,revoked_at INTEGER)").run();
  await DB.prepare("CREATE TABLE android_triad_activity(device_id TEXT PRIMARY KEY,phase TEXT NOT NULL,observed_at INTEGER NOT NULL)").run();
  await DB.prepare("INSERT INTO android_device_tokens(device_id,revoked_at) VALUES(?,NULL)").bind("android-private-id").run();
}

test("paired Windows reads only a fresh Android phase, no content or control claims",async()=>{
  const DB=sqliteD1();
  try {
    const env={DB,MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test"};
    const paired=await pair(env);
    assert.equal((await read(env,paired,"wrong-token")).http,401);
    const before=await read(env,paired);
    assert.equal(before.state,"UNAVAILABLE");
    await initAndroid(DB);
    await DB.prepare("INSERT INTO android_triad_activity(device_id,phase,observed_at) VALUES(?,?,?)")
      .bind("android-private-id","CAPTURING",Date.now()).run();
    const current=await read(env,paired);
    assert.equal(current.http,200);
    assert.equal(current.state,"FRESH");
    assert.equal(current.phase,"CAPTURING");
    assert.equal(current.owner_control_verified,false);
    assert.equal(current.expires_at_ms-current.observed_at_ms,30000);
    assert.equal(JSON.stringify(current).includes("android-private-id"),false);
    assert.equal(JSON.stringify(current).includes("MEL Windows"),false);
    await DB.prepare("UPDATE computer_devices SET halted=1 WHERE id=?")
      .bind("pc-triad-readonly").run();
    const halt=await read(env,paired);
    assert.equal(halt.http,409);
    assert.equal(halt.code,"TRIAD_COMPANION_HALTED");
  }finally{DB.close();}
});

test("revoked, future, unknown and stale Android events never show remotely as active",async()=>{
  const DB=sqliteD1();
  try {
    const env={DB,MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test"};
    const paired=await pair(env);
    await initAndroid(DB);
    for(const [phase,offset] of [["RESPONDING",-31000],["RESPONDING",60000],["FORGED",0]]){
      await DB.prepare("INSERT INTO android_triad_activity(device_id,phase,observed_at) VALUES(?,?,?) "+
        "ON CONFLICT(device_id) DO UPDATE SET phase=excluded.phase,observed_at=excluded.observed_at")
        .bind("android-private-id",phase,Date.now()+offset).run();
      const r=await read(env,paired);
      assert.equal(r.state,"UNAVAILABLE");
      assert.equal(r.phase,null);
    }
    await DB.prepare("UPDATE android_triad_activity SET phase=?,observed_at=? WHERE device_id=?")
      .bind("THINKING",Date.now(),"android-private-id").run();
    await DB.prepare("UPDATE android_device_tokens SET revoked_at=? WHERE device_id=?")
      .bind(Date.now(),"android-private-id").run();
    assert.equal((await read(env,paired)).state,"UNAVAILABLE");
  }finally{DB.close();}
});
