import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../windows-companion/MEL-Companion.cs",import.meta.url),"utf8");

test("native Windows Companion consumes only paired, passive Android phase endpoint",()=>{
  assert.match(source,/AndroidTriadActivityLabel\(\)/);
  assert.match(source,/Http\(Server \+ "\/api\/computer\/v1\/triad-activity", "GET", null, DeviceHeaders\(\)\)/);
  assert.match(source,/Convert\.ToString\(schema\) != "mel\.triad\.android-presence\.v1"/);
  assert.match(source,/Convert\.ToString\(state\) != "FRESH"/);
  assert.match(source,/Convert\.ToBoolean\(verified\)/);
  assert.match(source,/if \(end <= now \|\| end > now \+ 35000L\) return unavailable/);
  for(const phase of ["IDLE","CAPTURING","TRANSCRIBING","THINKING","RESPONDING","OTHER_BUSY","ERROR"]){
    assert.ok(source.includes('case "'+phase+'":'),"Missing display phase "+phase);
  }
  assert.match(source,/default: return unavailable;/);
});

test("native Windows UI polls on a worker thread, does not control the PC, and defaults unavailable",()=>{
  assert.match(source,/triadActivityStatus=LabelAt\(this,"Android : activité non vérifiée"/);
  assert.match(source,/triadPoll=new System\.Windows\.Forms\.Timer\{Interval=10000\}/);
  assert.match(source,/ThreadPool\.QueueUserWorkItem\(/);
  assert.match(source,/if \(!Visible \|\| IsDisposed \|\| Interlocked\.Exchange\(ref triadRefreshing, 1\) != 0\) return/);
  assert.match(source,/BeginInvoke\(\(MethodInvoker\)delegate/);
  const start=source.indexOf("public static string AndroidTriadActivityLabel()");
  const end=source.indexOf("public static List<Dictionary<string, object>> Devices()",start);
  assert.ok(start>0&&end>start);
  const method=source.slice(start,end);
  assert.doesNotMatch(method,/\/commands|\/pc-control|\/result|\/power|Process\.Start|File\.Write/);
  assert.match(method,/catch \{ return unavailable; \}/);
});
