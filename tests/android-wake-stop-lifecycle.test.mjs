import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('android-companion/app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt','utf8');
const trainer=readFileSync('android-companion/app/src/main/java/fr/veriteinterdite/mel/WakePhraseTrainer.kt','utf8');

test('OK MEL stop requests worker interruption before recognizer cleanup',()=>{
 const method=source.match(/private fun stopWakeWordListening\(\)\s*\{([\s\S]*?)\n    \}/)?.[1];
 assert.ok(method,'wake stop method exists');
 assert.match(method,/wakeDetectorStop\s*=\s*true/);
 assert.match(method,/wakeDetectorThread\?\.interrupt\(\)/);
 assert.ok(method.indexOf('wakeDetectorStop = true') < method.indexOf('wakeDetectorThread?.interrupt()'));
});

test('OK MEL releases microphone when detector exits',()=>{
 assert.match(trainer,/while\s*\(shouldContinue\(\)\)/);
 assert.match(trainer,/finally\s*\{[\s\S]*?recorder\.release\(\)/);
});

test('activity pause stops wake listener and conversation',()=>{
 assert.match(source,/override fun onPause\(\)\s*\{\s*appResumed\s*=\s*false[\s\S]*?stopWakeWordListening\(\)/);
});
