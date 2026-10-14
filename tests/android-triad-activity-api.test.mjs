import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {sqliteD1} from "./helpers/sqlite-d1.mjs";

const origin="https://mel.test";
const ownerAuth="Basic "+Buffer.from("adrien:test").toString("base64");
const envFor=DB=>({DB,MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test"});
async function pair(env,id) {
  const ticket=await worker.fetch(new Request(origin+"/api/android/v1/pair-code",{
    method:"POST",headers:{authorization:ownerAuth,"content-type":"application/json"},body:"{}"
  }),env);
  assert.equal(ticket.status,200);
  const {code}=await ticket.json();
  const response=await worker.fetch(new Request(origin+"/api/android/v1/pair",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({pair_code:code,device_id:id,name:"Test phone",app_version:"test",protocol_version:"1.0"})
  }),env);
  assert.equal(response.status,200);
  return response.json();
}
function request(path,android,method="GET",body=undefined) {
  return new Request(origin+path,{
    method,headers:{authorization:"Bearer "+android.token,"x-mel-device-id":android.device_id,
      ...(body!==undefined?{"content-type":"application/json"}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
}
async function fetchActivity(env,android,method="GET",body=undefined) {
  const response=await worker.fetch(request("/api/android/v1/triad-activity",android,method,body),env);
  return {http:response.status,...await response.json()};
}

test("triad activity requires a paired device token and stores only an enumerated phase",async()=>{
  const DB=sqliteD1();
  try {
    const env=envFor(DB);
    const unauth=await worker.fetch(new Request(origin+"/api/android/v1/triad-activity",{method:"POST",
      headers:{"content-type":"application/json"},body:'{"phase":"CAPTURING"}'}),env);
    assert.equal(unauth.status,401);
    const android=await pair(env,"triad-android-a");
    const first=await fetchActivity(env,android,"GET");
    assert.equal(first.state,"UNAVAILABLE");
    assert.equal(first.phase,null);
    const response=await fetchActivity(env,android,"POST",{phase:"CAPTURING"});
    assert.equal(response.http,200);
    assert.equal(response.phase,"CAPTURING");
    assert.equal(response.expires_at_ms-response.observed_at_ms,30000);
    const current=await fetchActivity(env,android);
    assert.equal(current.state,"FRESH");
    assert.equal(current.phase,"CAPTURING");
    assert.equal(JSON.stringify(current).includes(android.token),false);
    assert.equal(JSON.stringify(current).includes(android.device_id),false);
    const stored=await DB.prepare("SELECT phase FROM android_triad_activity WHERE device_id=?")
      .bind(android.device_id).first();
    assert.deepEqual(stored,{phase:"CAPTURING"});
    for(const body of [{phase:"FICTITIOUS"},{phase:"THINKING",text:"sensitive words"},
      {phase:"RESPONDING",turnId:"forged"},{phase:34},null,[]]){
      const invalid=await fetchActivity(env,android,"POST",body);
      assert.equal(invalid.http,400);
      assert.equal(invalid.code,"TRIAD_ACTIVITY_INVALID");
    }
    assert.equal((await fetchActivity(env,android)).phase,"CAPTURING");
  } finally {DB.close();}
});

test("triad phase is isolated per device, expires, and denies revoked credentials",async()=>{
  const DB=sqliteD1();
  try {
    const env=envFor(DB);
    const a=await pair(env,"triad-owner-a");
    const b=await pair(env,"triad-owner-b");
    await fetchActivity(env,a,"POST",{phase:"THINKING"});
    assert.equal((await fetchActivity(env,b)).state,"UNAVAILABLE");
    await fetchActivity(env,b,"POST",{phase:"RESPONDING"});
    assert.equal((await fetchActivity(env,a)).phase,"THINKING");
    assert.equal((await fetchActivity(env,b)).phase,"RESPONDING");
    await DB.prepare("UPDATE android_triad_activity SET observed_at=? WHERE device_id=?")
      .bind(Date.now()-40000,a.device_id).run();
    const expired=await fetchActivity(env,a);
    assert.equal(expired.state,"UNAVAILABLE");
    assert.equal(expired.phase,null);
    await DB.prepare("UPDATE android_triad_activity SET observed_at=? WHERE device_id=?")
      .bind(Date.now()+60000,a.device_id).run();
    assert.equal((await fetchActivity(env,a)).state,"UNAVAILABLE");
    const revoked=await worker.fetch(new Request(origin+"/api/android/v1/revoke",{
      method:"POST",headers:{authorization:ownerAuth,"content-type":"application/json"},
      body:JSON.stringify({device_id:b.device_id})
    }),env);
    assert.equal(revoked.status,200);
    assert.equal((await fetchActivity(env,b)).http,401);
  } finally {DB.close();}
});
