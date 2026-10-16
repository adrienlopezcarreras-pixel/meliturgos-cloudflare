import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const file=new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url);

test('MINI empty video end marker never publishes header-only AVI', async()=>{
  const src=await readFile(file,'utf8');
  const video=src.slice(src.indexOf('private fun receiveVideo('),src.indexOf('private fun receiveAudio('));
  const counter=video.indexOf('var framesReceived = 0');
  const increment=video.indexOf('framesReceived++');
  const reject=video.indexOf('if (framesReceived == 0) return');
  const entry=video.indexOf('val uri = createMediaStoreEntry(');
  assert.ok(counter>=0 && increment>counter && reject>increment && entry>reject);
  assert.match(video,/if \(size == 0\) break/);
  assert.match(video,/avi\.addFrame\(readFully\(input, size\)\)/);
});

test('MINI audio requires nonzero complete PCM16 channel frames before MediaStore', async()=>{
  const src=await readFile(file,'utf8');
  const audio=src.slice(src.indexOf('private fun receiveAudio('),src.indexOf('private fun receiveBrowser('));
  const noAudio=audio.indexOf('pcmBytes == 0L');
  const aligned=audio.indexOf('pcmBytes % (channels * 2L) != 0L');
  const media=audio.indexOf('val uri = createMediaStoreEntry(');
  assert.ok(noAudio>=0 && aligned>noAudio && media>aligned);
  assert.match(audio,/if \(size == 0\) break/);
  assert.match(audio,/writeWavHeader\(output, pcmBytes\.toInt\(\), sampleRate, channels\)/);
});
