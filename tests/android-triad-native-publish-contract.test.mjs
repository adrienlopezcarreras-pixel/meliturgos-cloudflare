import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");

test("Android's real avatar phases connect to authenticated, content-free telemetry",async()=>{
  const [activity,model,client,projection]=await Promise.all([
    read("android-companion/app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt"),
    read("android-companion/app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt"),
    read("android-companion/app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt"),
    read("android-companion/app/src/main/java/fr/veriteinterdite/mel/MelTriadConversationActivity.kt")
  ]);
  assert.match(activity,/model\.reportLocalConversationActivity\(recording\.value\)/);
  assert.match(model,/triadConversationActivity\(stateNow\.session, recording,/);
  assert.match(model,/Channel<String>\(Channel\.CONFLATED\)/);
  assert.match(model,/canPublishTriadConversationPhase\(stateNow\.session, phase\)/);
  assert.match(model,/client\.publishTriadActivity\(phase\)/);
  assert.match(client,/jsonRequest\("\/api\/android\/v1\/triad-activity", "POST",/);
  assert.match(client,/JSONObject\(\)\.put\("phase", phase\), timeoutMs = 5_000/);
  assert.match(projection,/session == SessionStage\.CONNECTED && phase in setOf/);
});

test("server's receiving route enforces pairing and rejects unexpected payload fields",async()=>{
  const server=await read("src/devices/android-companion-api.js");
  assert.match(server,/await authorizeDevice\(request,env\)/);
  assert.match(server,/ANDROID_API_BASE\+"\/triad-activity" && request.method === "POST"/);
  assert.match(server,/Object\.keys\(body\)\.length!==1/);
  assert.match(server,/ANDROID_TRIAD_TTL_MS=30_000/);
});
