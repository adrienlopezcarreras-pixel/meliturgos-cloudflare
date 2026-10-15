import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelVoicePlayer.kt',import.meta.url),'utf8');
const mp3=source.slice(source.indexOf('fun playMp3('),source.indexOf('fun playSystemFrench(',source.indexOf('fun playMp3(')));
test('MP3 cache file cleaned in finally even when stopped, timed out, or prepare fails',()=>{
 assert.match(mp3,/val file = File\.createTempFile/);
 assert.match(mp3,/val player = try \{[\s\S]*MediaPlayer\(\)/);
 assert.match(mp3,/try \{[\s\S]*player\.prepare\(\)/);
 assert.match(mp3,/finally \{[\s\S]*file\.delete\(\)/);
 assert.match(mp3,/if \(playbackGeneration != myGeneration\) throw MelPlaybackInterruptedException\(\)/);
 assert.match(mp3,/MP3_PLAYBACK_TIMEOUT/);
 assert.match(mp3,/MP3_PLAYBACK_FAILED/);
});
test('only current owner releases active MediaPlayer, or pre-registration failure',()=>{
 assert.match(mp3,/registered = true/);
 assert.match(mp3,/if \(activePlayer === player\) \{[\s\S]*activePlayer = null/);
 assert.match(mp3,/else if \(!registered\) \{[\s\S]*player\.release\(\)/);
 assert.doesNotMatch(mp3,/file\.delete\(\)[\s\S]*if \(playbackGeneration != myGeneration\)/);
});
