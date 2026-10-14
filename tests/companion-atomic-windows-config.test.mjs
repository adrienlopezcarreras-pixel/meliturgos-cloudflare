import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Windows Companion writes complete owner permission snapshots atomically',async()=>{
 const source=await readFile(new URL('../windows-companion/MEL-Companion.cs',import.meta.url),'utf8');
 const writer=source.slice(source.indexOf('public static void WriteConfigAtomically('),
  source.indexOf('public static void SaveConfig('));
 assert.match(writer,/Directory\.CreateDirectory\(MelDir\)/);
 assert.match(writer,/Guid\.NewGuid\(\)\.ToString\("N"\)/);
 assert.match(writer,/File\.WriteAllText\(temp, Json\.Serialize\(snapshot\), new UTF8Encoding\(false\)\)/);
 assert.match(writer,/File\.Replace\(temp, ConfigPath, null, true\)/);
 assert.match(writer,/File\.Move\(temp, ConfigPath\)/);
 assert.match(writer,/finally/);
 assert.match(writer,/File\.Delete\(temp\)/);
 assert.doesNotMatch(writer,/File\.WriteAllText\(ConfigPath/);

 const initial=source.slice(source.indexOf('public static void SaveConfig('),
  source.indexOf('public static List<string> ConfigList('));
 assert.match(initial,/d\["remote_access_enabled"\] = false/);
 assert.match(initial,/WriteConfigAtomically\(d\)/);
 assert.doesNotMatch(initial,/File\.WriteAllText\(ConfigPath/);

 const permissions=source.slice(source.indexOf('public static void SavePermissions('),
  source.indexOf('public static void RestartCompanion('));
 assert.match(permissions,/new Dictionary<string, object>\(Config\)/);
 assert.match(permissions,/next\["remote_access_enabled"\] = remoteAccessEnabled/);
 assert.match(permissions,/WriteConfigAtomically\(next\)/);
 assert.match(permissions,/Config = next/);
 assert.match(permissions,/RestartCompanion\(\)/);
 assert.ok(permissions.indexOf('WriteConfigAtomically(next)')<permissions.indexOf('Config = next'));
 assert.ok(permissions.indexOf('Config = next')<permissions.indexOf('RestartCompanion()'));
 assert.doesNotMatch(permissions,/File\.WriteAllText\(ConfigPath/);
 assert.equal(source.includes('File.WriteAllText(ConfigPath'),false,
  'All direct truncating writes of the owner configuration must be removed');
});

test('Windows engine keeps fail-closed fresh permission checks after the atomic write',async()=>{
 const source=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
 const packaged=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
 assert.equal(source,packaged);
 const check=source.slice(source.indexOf('function Assert-LocalRemoteAccess {'),
  source.indexOf('function Assert-UnattendedCapturePermission {'));
 assert.match(check,/Test-Path -LiteralPath \$ConfigPath -PathType Leaf/);
 assert.match(check,/Get-Content -Raw -Encoding UTF8 -LiteralPath \$ConfigPath/);
 assert.match(check,/\$current\.remote_access_enabled -ne \$true/);
 assert.match(check,/REMOTE_ACCESS_DISABLED_LOCALLY/);
});
