import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI photo uploads apply transfer deadline before MediaStore insert', async()=>{
  const src=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  const begin=src.indexOf('private fun receivePhoto('),end=src.indexOf('private fun receiveVideo(',begin);
  assert.ok(begin>=0&&end>begin);
  const fn=src.slice(begin,end);
  const size=fn.indexOf('size !in 1..MAX_PHOTO_BYTES');
  const read=fn.indexOf('MiniPhotoDeadlineReader.read(input, size)');
  const jpeg=fn.indexOf('MiniJpegFrameSignature.hasMarkers(bytes)');
  const create=fn.indexOf('val uri = createMediaStoreEntry(');
  assert.ok(size>=0&&read>size&&jpeg>read&&create>jpeg);
  const cap=src.match(/private const val MAX_PHOTO_BYTES = MiniPhotoDeadlineReader\.MAX_PHOTO_BYTES/);
  assert.ok(cap);
  const reader=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniPhotoDeadlineReader.kt',import.meta.url),'utf8');
  assert.match(reader,/MAX_DURATION_NANOS = 180L \* 1_000_000_000L/);
  assert.match(reader,/MINI_PHOTO_STALLED/);
  assert.match(reader,/MINI_PHOTO_TIMEOUT/);
  assert.match(reader,/MINI_PHOTO_INCOMPLETE/);
});
