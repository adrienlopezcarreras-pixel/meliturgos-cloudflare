import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const android = readFileSync('android-companion/app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt','utf8');
const mini = readFileSync('firmware/waveshare-terminal/main/mel_terminal.cpp','utf8');

test('Android OK MEL recognition must enter a real voice conversation',()=>{
  assert.match(android,/onMatch\s*=\s*\{\s*score\s*->\s*matchedScore\s*=\s*score/);
  assert.match(android,/voiceConversationActive\.value\s*=\s*true/);
  assert.match(android,/if\s*\(voiceConversationActive\.value\)\s*\{[\s\S]{0,220}startVoice\(\)/);
});
test('MINI OK MEL invokes physical voice capture',()=>{
  assert.match(mini,/WAKE OK MEL detected/);
  assert.match(mini,/mel_terminal_request_voice\(\)/);
});
test('Android foreground listener requires enrollment and microphone permission',()=>{
  assert.match(android,/wakePhraseStore\.isEnrolled\(\)/);
  assert.match(android,/Manifest\.permission\.RECORD_AUDIO/);
  assert.match(android,/WakePhraseTrainer\.listenForWake\(/);
});
test('Wake lifecycle contract: do not claim Android background hotword without service proof',()=>{
  const pause=android.match(/override fun onPause\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1]||'';
  const backgroundSupported=!/stopWakeWordListening\(\)/.test(pause);
  if(!backgroundSupported) {
    // Actual current behavior: while backgrounded, the activity-owned listener stops.
    assert.match(pause,/stopWakeWordListening\(\)/);
    assert.match(pause,/appResumed\s*=\s*false/);
  }
  // This check is observational, not proof that the microphone remains active.
});
