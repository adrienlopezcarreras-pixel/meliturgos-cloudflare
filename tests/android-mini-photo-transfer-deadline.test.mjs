import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI photo uploads apply transfer deadline before MediaStore insert', async()=>{
  const src=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  const begin=src.indexOf('private fun receivePhoto('),end=src.indexOf('private fun receiveVideo(',begin);
  assert.ok(begin>=0&&end>begin);
  const fn=src.slice(begin,end);
  const read=fn.indexOf('MiniPhotoDeadlineReader.readSized(input, beforeRead = { socket.soTimeout = it })');
  const jpeg=fn.indexOf('MiniJpegFrameSignature.hasMarkers(bytes)');
  const create=fn.indexOf('val uri = createMediaStoreEntry(');
  assert.ok(read>=0&&jpeg>read&&create>jpeg);
  const cap=src.match(/private const val MAX_PHOTO_BYTES = MiniPhotoDeadlineReader\.MAX_PHOTO_BYTES/);
  assert.ok(cap);
  const reader=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniPhotoDeadlineReader.kt',import.meta.url),'utf8');
  assert.match(reader,/MAX_DURATION_NANOS = 180L \* 1_000_000_000L/);
  assert.match(reader,/MINI_PHOTO_STALLED/);
  assert.match(reader,/MINI_PHOTO_TIMEOUT/);
  assert.match(reader,/MINI_PHOTO_INCOMPLETE/);
  assert.match(reader,/beforeRead\(remainingMs\)/);
  // Photo length header and JPEG bytes share the same monotonic start time.
  assert.ok(reader.includes('val started = clockNanos()'));
  assert.ok(reader.includes('val header = readBytes(input, 4, beforeRead, clockNanos, started)'));
  assert.ok(reader.includes('require(size in 1..MAX_PHOTO_BYTES)'));
  assert.ok(reader.includes('return readBytes(input, size, beforeRead, clockNanos, started)'));
});
