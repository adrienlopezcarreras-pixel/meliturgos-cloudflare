import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt',import.meta.url),'utf8');
test('speech languages have a user-visible control and persist chosen locale',()=>{
 assert.match(source,/listOf\("auto", "fr-FR", "es-ES", "pt-PT", "pt-BR"\)/);
 assert.match(source,/getSharedPreferences\("mel_voice", MODE_PRIVATE\)/);
 assert.match(source,/putString\("recognition_language", next\)/);
 assert.match(source,/testTag\("speech-language-cycle"\)/);
 assert.match(source,/onVoiceLanguageCycle = ::cycleSpeechLanguage/);
});
test('legacy Android never claims unsupported automatic language switching',()=>{
 const start=source.indexOf('private fun cycleSpeechLanguage()');
 const end=source.indexOf('private fun startRecorderFallback(',start);
 const voice=source.slice(start,end);
 assert.match(voice,/Build\.VERSION\.SDK_INT >= 34/);
 assert.match(voice,/speechLanguages\.filter \{ it != "auto" \}/);
 assert.match(voice,/RecognizerIntent\.EXTRA_LANGUAGE, activeLanguage/);
 assert.match(voice,/Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.UPSIDE_DOWN_CAKE/);
 assert.match(voice,/RecognizerIntent\.EXTRA_ENABLE_LANGUAGE_SWITCH/);
 assert.match(voice,/activeLanguage != "auto"/);
});
