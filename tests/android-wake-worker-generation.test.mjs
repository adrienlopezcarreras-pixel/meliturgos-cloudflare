import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activity = readFileSync('android-companion/app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt', 'utf8');
const get = (from, to) => {
  const start = activity.indexOf(from);
  const end = activity.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, 'Kotlin method anchors must exist');
  return activity.slice(start, end);
};
const start = get('private fun ensureWakeWordListening()', 'private fun stopWakeWordListening()');
const stop = get('private fun stopWakeWordListening()', 'private fun scheduleWakeWordRestart()');

test('OK MEL does not launch another microphone worker while previous AudioRecord lives', () => {
  assert.match(start, /wakeDetectorThread\?\.isAlive == true/);
  assert.match(start, /if \(!appResumed \|\| wakeListening/);
});
test('STOP revokes the generation, flags cancellation and interrupts the worker before restart', () => {
  assert.match(stop, /wakeSessionGeneration\+\+/);
  assert.match(stop, /wakeDetectorStop = true/);
  assert.match(stop, /wakeDetectorThread\?\.interrupt\(\)/);
  assert.ok(stop.indexOf('wakeDetectorStop = true') < stop.indexOf('wakeDetectorThread?.interrupt()'));
});
test('stale microphone callbacks never activate voice or erase newer worker', () => {
  assert.match(start, /val wakeGeneration = \+\+wakeSessionGeneration/);
  assert.match(start, /if \(wakeGeneration != wakeSessionGeneration\)/);
  assert.match(start, /return@runOnUiThread/);
  const stale = start.indexOf('if (wakeGeneration != wakeSessionGeneration)');
  const clear = start.indexOf('wakeDetectorThread = null');
  const activate = start.indexOf('voiceConversationActive.value = true');
  assert.ok(stale > 0 && stale < clear && clear < activate);
});
test('resume recovers listening only after old worker exits and activity is visible', () => {
  assert.match(start, /wakeDetectorThread\?\.isAlive != true && appResumed/);
  assert.match(start, /mainHandler.postDelayed\(\{ ensureWakeWordListening\(\) \}, 250L\)/);
  assert.match(start, /wakeDetectorStop && appResumed/);
});
