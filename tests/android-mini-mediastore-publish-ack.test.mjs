import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI MediaStore publication requires an acknowledged update',async()=>{
  const src=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  const fn=src.slice(src.indexOf('private fun publish('),src.indexOf('private fun String.ensureSuffix(',src.indexOf('private fun publish(')));
  assert.match(fn,/val updated = context\.contentResolver\.update\(/);
  assert.match(fn,/MediaStore\.MediaColumns\.IS_PENDING, 0/);
  assert.match(fn,/check\(updated == 1\) \{ "MINI_MEDIA_PUBLISH_FAILED" \}/);
  const writer=src.slice(src.indexOf('private fun writeAndPublish('),src.indexOf('private fun publish('));
  assert.ok(writer.indexOf('publish(uri)')>=0);
  assert.ok(writer.indexOf('completed = true')>writer.indexOf('publish(uri)'));
  assert.match(writer,/if \(!completed\)/);
  assert.match(writer,/contentResolver\.delete\(uri, null, null\)/);
});
