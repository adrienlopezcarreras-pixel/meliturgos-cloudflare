import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {sqliteD1} from "./helpers/sqlite-d1.mjs";

const envFor=DB=>({DB,MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test"});
const ownerAuth="Basic "+Buffer.from("adrien:test").toString("base64");
async function pairAndroid(env) {
  const codeResult=await worker.fetch(new Request("https://mel.test/api/android/v1/pair-code",{
    method:"POST",headers:{authorization:ownerAuth,"content-type":"application/json"},body:"{}"
  }),env);
  assert.equal(codeResult.status,200);
  const {code}=await codeResult.json();
  const response=await worker.fetch(new Request("https://mel.test/api/android/v1/pair",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({pair_code:code,device_id:"android-triad-reader",name:"MEL Android",
      app_version:"test",protocol_version:"1.0"})
  }),env);
  assert.equal(response.status,200);
  return response.json();
}
async function status(env,token=null) {
  const headers=token?{authorization:"Bearer "+token,"x-mel-device-id":"android-triad-reader"}:{};
  const response=await worker.fetch(new Request("https://mel.test/api/android/v1/windows-presence",{headers}),env);
  return {http:response.status,body:await response.json()};
}

test("Windows presence requires authorized Android token and never reveals PC identifiers",async()=>{
  const DB=sqliteD1();
  try{
    const env=envFor(DB);
    assert.equal((await status(env)).http,401);
    const android=await pairAndroid(env);
    const empty=await status(env,android.token);
    assert.equal(empty.http,200);
    assert.equal(empty.body.known,false);
    assert.equal(empty.body.online,false);
    assert.equal(empty.body.owner_control_verified,false);
    await DB.prepare('CREATE TABLE IF NOT EXISTS computer_devices(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,name TEXT NOT NULL,platform TEXT NOT NULL,capabilities TEXT NOT NULL,allowed_apps TEXT NOT NULL,halted INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,metadata TEXT NOT NULL DEFAULT "{}")').run();
    const now=Date.now();
    await DB.prepare("INSERT INTO computer_devices(id,token_hash,name,platform,capabilities,allowed_apps,halted,created_at,last_seen_at,metadata) VALUES(?,?,?,?,?,?,0,?,?,?)")
      .bind("secret-pc-id","secret-token-hash","Private PC","windows","[]","[]",now,now,"{}").run();
    const live=await status(env,android.token);
    assert.equal(live.body.online,true);
    assert.equal(live.body.owner_control_verified,false);
    assert.equal(JSON.stringify(live.body).includes("secret-pc-id"),false);
    assert.equal(JSON.stringify(live.body).includes("Private PC"),false);
    await DB.prepare("UPDATE computer_devices SET halted=1 WHERE id=?").bind("secret-pc-id").run();
    const halted=await status(env,android.token);
    assert.equal(halted.body.halted,true);
    assert.equal(halted.body.online,false);
    await DB.prepare("UPDATE computer_devices SET halted=0,last_seen_at=? WHERE id=?")
      .bind(now-90000,"secret-pc-id").run();
    assert.equal((await status(env,android.token)).body.online,false);
  }finally{DB.close();}
});
