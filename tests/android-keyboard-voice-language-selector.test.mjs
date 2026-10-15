import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const code=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',import.meta.url),'utf8');
test('chat keyboard and voice home use the same persisted speech language state',()=>{
 const screen=code.slice(code.indexOf('private fun ConversationScreen('),code.indexOf('private fun TechBackdrop('));
 // Both panels receive the same Compose state + callback; no local stale copy.
 assert.match(code,/MobileSection\.KEYBOARD -> SectionSurface[\s\S]*?KeyboardPanel\([\s\S]*?voiceLanguage = voiceLanguage,[\s\S]*?onVoiceLanguageCycle = onVoiceLanguageCycle/);
 assert.match(code,/MobileSection\.MEL -> MiniHomePanel\([\s\S]*?voiceLanguage = voiceLanguage,[\s\S]*?onVoiceLanguageCycle = onVoiceLanguageCycle/);
 assert.match(code,/onVoiceLanguageCycle = ::cycleSpeechLanguage/);
 assert.doesNotMatch(screen,/rememberSaveable\s*\{\s*mutableStateOf\("fr-FR"\)/);
});
test('keyboard language button is accessible without starting microphone and blocked during recording',()=>{
 const keyboard=code.slice(code.indexOf('private fun KeyboardPanel('),code.indexOf('private fun ',code.indexOf('private fun KeyboardPanel(')+1));
 assert.match(keyboard,/testTag\("keyboard-speech-language-cycle"\)/);
 assert.match(keyboard,/onClick = onVoiceLanguageCycle/);
 assert.match(keyboard,/enabled = !recording && !state\.busy/);
 assert.match(keyboard,/voiceLanguage == "auto"/);
});
