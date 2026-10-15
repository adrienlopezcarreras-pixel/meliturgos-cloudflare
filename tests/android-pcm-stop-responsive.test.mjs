import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelVoicePlayer.kt',import.meta.url),'utf8');
const pcm=source.slice(source.indexOf('fun playPcm48kMono('),source.indexOf('private fun isLikelyMp3(',source.indexOf('fun playPcm48kMono(')));

test('PCM speaker retains MINI 48k mono format and generation-scoped cancellation',()=>{
 assert.match(source,/private const val SAMPLE_RATE = 48_000/);
 assert.match(pcm,/AudioFormat\.CHANNEL_OUT_MONO/);
 assert.match(pcm,/AudioFormat\.ENCODING_PCM_16BIT/);
 assert.match(pcm,/playbackGeneration \+= 1L/);
 assert.match(pcm,/val myGeneration = synchronized\(lock\)/);
 assert.match(pcm,/playbackGeneration != myGeneration\) throw MelPlaybackInterruptedException\(\)/);
});
test('STOP VOIX no longer waits for entire PCM length or double-releases another track',()=>{
 assert.doesNotMatch(pcm,/Thread\.sleep\(durationMs \+ 180L\)/);
 assert.match(pcm,/Thread\.sleep\(remaining\.coerceIn\(1L, 80L\)\)/);
 assert.match(pcm,/if \(activeTrack === track\) stopLocked\(\)/);
 assert.doesNotMatch(pcm,/else\s*\{\s*runCatching \{ track\.stop\(\) \}\s*track\.release\(\)/);
});
