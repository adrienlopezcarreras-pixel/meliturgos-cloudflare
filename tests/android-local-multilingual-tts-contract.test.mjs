import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const tts=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelVoicePlayer.kt',import.meta.url),'utf8');
const vm=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',import.meta.url),'utf8');

test('voice answers honor same persisted manual FR/ES/PT language as Android recognition',()=>{
 assert.match(vm,/getSharedPreferences\("mel_voice", Context\.MODE_PRIVATE\)/);
 assert.match(vm,/getString\("recognition_language", "fr-FR"\)/);
 for(const lang of ['es-ES','pt-PT','pt-BR'])
  assert.ok(vm.includes('"'+lang+'" -> "'+lang+'"'),lang+' selection not routed');
 assert.match(vm,/MelVoicePlayer\.playSystemVoice\(appContext, answer, spokenLanguage\)/);
 assert.match(vm,/else -> "fr-FR" \/\/ AUTO cannot assert a detected response language/);
});
test('TTS selects exact language before playback and fails closed without installed language',()=>{
 const system=tts.slice(tts.indexOf('fun playSystemVoice('),tts.indexOf('private fun speakSystemFrenchChunk('));
 for(const lang of ['fr-FR','es-ES','pt-PT','pt-BR'])assert.ok(system.includes('"'+lang+'"'));
 assert.match(system,/selectSystemVoice\(tts, main, Locale\.forLanguageTag\(tag\), myGeneration\)/);
 assert.match(system,/tts\.isLanguageAvailable\(locale\)/);
 assert.match(system,/tts\.setLanguage\(locale\)/);
 assert.match(system,/TextToSpeech\.LANG_MISSING_DATA/);
 assert.match(system,/TextToSpeech\.LANG_NOT_SUPPORTED/);
 assert.match(system,/if \(!it\.isNetworkConnectionRequired\) score \+= 10_000/);
 assert.match(system,/playbackGeneration != generation\) throw MelPlaybackInterruptedException/);
});
test('original French voice entrypoint remains backward compatible',()=>{
 assert.match(tts,/fun playSystemFrench\(context: Context, text: String\): Long =\s*playSystemVoice\(context, text, "fr-FR"\)/);
});
