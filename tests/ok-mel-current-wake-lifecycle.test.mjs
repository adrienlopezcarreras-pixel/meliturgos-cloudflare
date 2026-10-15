import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('android-companion/app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt', 'utf8');
const trainer = readFileSync('android-companion/app/src/main/java/fr/veriteinterdite/mel/WakePhraseTrainer.kt', 'utf8');
const mini = readFileSync('firmware/waveshare-terminal/main/mel_terminal.cpp', 'utf8');
const method = (start, end) => {
  const a = main.indexOf(start), b = main.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'source boundary missing: ' + start);
  return main.slice(a, b);
};

test('Android wake microphone starts only while resumed, enrolled and explicitly permitted', () => {
  const s = method('private fun ensureWakeWordListening()', 'private fun stopWakeWordListening()');
  assert.match(s, /!appResumed\s*\|\|/);
  assert.match(s, /wakePhraseStore\.isEnrolled\(\)/);
  assert.match(s, /Manifest\.permission\.RECORD_AUDIO/);
  assert.match(s, /SessionStage\.CONNECTED/);
  assert.match(s, /wakeDetectorThread\?\.isAlive == true/);
  assert.match(s, /WakePhraseTrainer\.listenForWake/);
});
test('stopping wake word invalidates old generation and interrupts worker', () => {
  const s = method('private fun stopWakeWordListening()', 'private fun scheduleWakeWordRestart()');
  const generation = s.indexOf('wakeSessionGeneration++'), stopping = s.indexOf('wakeDetectorStop = true'),
    interruption = s.indexOf('wakeDetectorThread?.interrupt()');
  assert.ok(generation >= 0 && stopping > generation && interruption > stopping);
});
test('a stopped worker cannot re-activate voice conversation after resume', () => {
  const s = method('private fun ensureWakeWordListening()', 'private fun stopWakeWordListening()');
  assert.match(s, /wakeGeneration != wakeSessionGeneration/);
  assert.match(s, /return@runOnUiThread/);
  assert.match(s, /matchedScore != null && !wakeDetectorStop && appResumed/);
  assert.match(s, /voiceConversationActive\.value = true/);
});
test('activity background transition stops microphone and live conversation', () => {
  const s = method('override fun onPause()', 'override fun onDestroy()');
  assert.match(s, /appResumed = false/);
  assert.match(s, /voiceConversationActive\.value = false/);
  assert.match(s, /stopWakeWordListening\(\)/);
});
test('wake trainer releases AudioRecord even after failure or cancellation', () => {
  const s = trainer.slice(trainer.indexOf('fun listenForWake('));
  assert.match(s, /while \(shouldContinue\(\)\)/);
  assert.match(s, /finally\s*\{[\s\S]*?recorder\.release\(\)/);
});
test('MINI detected wake requests a real local voice capture', () => {
  const at = mini.indexOf('WAKE OK MEL detected');
  assert.ok(at > 0);
  assert.match(mini.slice(at, at + 300), /mel_terminal_request_voice\(\)/);
});
test('this is a foreground wake contract, not evidence of Android locked-screen hotword', () => {
  // A live background microphone service requires its own Android test and consent proof.
  assert.match(main, /override fun onPause\(\)/);
  assert.doesNotMatch(main, /startForegroundService\(Intent\(this, MelWakeForegroundService::class\.java\)\)/);
});

test('transient microphone errors have at most three progressive restarts', () => {
  const source = method('private fun ensureWakeWordListening()', 'private fun stopWakeWordListening()');
  assert.match(source, /result\.isFailure && !wakeDetectorStop/);
  assert.match(source, /wakeRetryFailures = \(wakeRetryFailures \+ 1\)\.coerceAtMost\(4\)/);
  assert.match(source, /if \(wakeRetryFailures <= 3\)/);
  assert.match(source, /1_500L \* \(1L shl \(wakeRetryFailures - 1\)\)/);
  assert.match(source, /wakeRetryFailures = 0/);
});
test('a delayed retry is invalidated by STOP or a newer generation', () => {
  const source = method('private fun ensureWakeWordListening()', 'private fun stopWakeWordListening()');
  assert.match(source, /val retryGeneration = wakeSessionGeneration/);
  assert.match(source, /retryGeneration == wakeSessionGeneration/);
  assert.match(source, /appResumed && !wakeDetectorStop/);
  assert.match(source, /wakeDetectorThread\?\.isAlive != true/);
  const resume = method('override fun onResume()', 'override fun onPause()');
  assert.match(resume, /wakeRetryFailures = 0/);
});
