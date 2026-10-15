import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const root='android-companion/app/src/main/java/fr/veriteinterdite/mel/';
test('explicit Android CPU/PC consent is off by default, saved and used in retries',async()=>{
 const vm=await read(root+'MelViewModel.kt');
 assert.match(vm,/preferCompanionCompute: Boolean = false/);
 assert.match(vm,/prefs.getBoolean\("prefer_companion_compute", false\)/);
 assert.match(vm,/fun setPreferCompanionCompute\(enabled: Boolean\)/);
 assert.match(vm,/putBoolean\("prefer_companion_compute", enabled\)/);
 assert.equal((vm.match(/preferCompanionCompute = _state\.value\.preferCompanionCompute && !voice/g)||[]).length,2);
});
test('settings UI exposes explicit on/off switch separate from Windows consent',async()=>{
 const ui=await read(root+'MainActivity.kt');
 assert.match(ui,/onPreferCompanionCompute = model::setPreferCompanionCompute/);
 assert.match(ui,/settings-companion-compute/);
 assert.match(ui,/onPreferCompanionCompute\(!state.preferCompanionCompute\)/);
 assert.match(ui,/autorisation Windows obligatoire/);
});
test('Android request forwards both switches, never to voice requests',async()=>{
 const cli=await read(root+'MelApiClient.kt'),route=await read('src/devices/android-companion-api.js');
 assert.match(cli,/\.put\("prefer_companion_compute", preferCompanionCompute && !voice\)/);
 assert.match(cli,/\.put\("use_companion_compute", preferCompanionCompute && !voice\)/);
 assert.match(route,/prefer_companion_compute:body.prefer_companion_compute === true && inputSource === "text"/);
 assert.match(route,/use_companion_compute:body.use_companion_compute === true && inputSource === "text"/);
});
