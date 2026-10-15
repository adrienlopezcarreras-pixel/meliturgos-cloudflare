import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const native=await readFile(new URL('../../windows-companion/MEL-Companion.cs',import.meta.url),'utf8');
const build=await readFile(new URL('../../scripts/build-windows-release.ps1',import.meta.url),'utf8');
test('Windows package installs the benchmark for explicit UI launch only',()=>{
 assert.match(native,/LocalAiBenchmarkPath = Path.Combine\(MelDir, "MEL-Local-AI-Benchmark\.ps1"\)/);
 assert.match(native,/File\.Copy\(packagedBenchmark, LocalAiBenchmarkPath, true\)/);
 assert.match(build,/MEL-Local-AI-Benchmark\.ps1/);
 assert.match(native,/ButtonAt\(this,"Tester IA locale",475,0,175,RunLocalAiBenchmark\)/);
 assert.doesNotMatch(native.slice(native.indexOf('public static void InstallFiles('),native.indexOf('public static void ConfigureStartup(')),/Process\.Start\(.*LocalAiBenchmark/);
});
test('benchmark button is manual, respects CPU opt-in and never blocks WinForms thread',()=>{
 const section=native.slice(native.indexOf('void RunLocalAiBenchmark('),native.indexOf('void RePair(',native.indexOf('void RunLocalAiBenchmark(')));
 assert.match(section,/MelApp\.ConfigBool\("local_compute_enabled"\)/);
 assert.match(section,/MessageBoxButtons\.YesNo/);
 assert.match(section,/ThreadPool\.QueueUserWorkItem/);
 assert.match(section,/WaitForExit\(45000\)/);
 assert.match(section,/-AllowUserActivity/);
 assert.match(section,/gpu/i);
 assert.match(section,/Gain GPU non prouvé/);
 assert.doesNotMatch(section,/InvokeWebRequest|UploadFile|HttpWebRequest|SendMail/);
});
