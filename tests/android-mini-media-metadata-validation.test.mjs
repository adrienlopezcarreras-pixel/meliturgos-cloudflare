import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI malformed audio/video metadata cannot be silently coerced into valid formats',async()=>{
  const src=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  const from=src.indexOf('private fun handleClient(');
  const to=src.indexOf('private fun receivePhoto(',from);
  assert.ok(from>=0 && to>from);
  const handle=src.slice(from,to);
  assert.match(handle,/val fps = input\.readUnsignedByte\(\)/);
  assert.match(handle,/val sampleRate = input\.readInt\(\)/);
  assert.match(handle,/val channels = input\.readUnsignedByte\(\)/);
  assert.doesNotMatch(handle,/\.coerceIn\(/);
  assert.match(handle,/2 -> if \(fps in 1\.\.30\)/);
  assert.match(handle,/3 -> if \(sampleRate in 8_000\.\.96_000 && channels in 1\.\.2\)/);
  // Image and browser types do not require arbitrary audio/video metadata.
  assert.match(handle,/1 -> receivePhoto\(/);
  assert.match(handle,/4 -> receiveBrowser\(/);
});
