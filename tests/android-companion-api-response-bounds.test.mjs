import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const file = new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt', import.meta.url);
const source = await readFile(file,'utf8');

test('Android API uses the tested bounded reader on success, error and media paths',()=>{
  assert.match(source,/MiniHttpResponseBounds\.read\(stream, limit\)/);
  assert.match(source,/HTTP_RESPONSE_TOO_LARGE/);
  assert.match(source,/MAX_JSON_RESPONSE_BYTES = 8 \* 1024 \* 1024/);
  assert.match(source,/MAX_TRANSCRIPTION_RESPONSE_BYTES = 512 \* 1024/);
  assert.match(source,/MAX_MEDIA_RESPONSE_BYTES = 8 \* 1024 \* 1024/);
  assert.match(source,/MAX_ERROR_RESPONSE_BYTES = 64 \* 1024/);
  assert.doesNotMatch(source,/\.readText\(\)|\.readBytes\(\)/);
});
test('JSON and media paths enforce limits, including unknown-length responses',()=>{
  const api=source.slice(source.indexOf('private fun boundedResponse('), source.indexOf('/**\n     * Owner credentials'));
  assert.match(api,/declaredLength > limit/);
  assert.match(api,/MiniHttpResponseBounds\.read\(stream, limit\)/);
  assert.match(api,/if \(status in 200\.\.299\) maxBodyBytes else MAX_ERROR_RESPONSE_BYTES/);
  assert.match(api,/connection\.inputStream, MAX_MEDIA_RESPONSE_BYTES/);
  assert.match(api,/connection\.errorStream, MAX_ERROR_RESPONSE_BYTES/);
});
test('speech transcription responses use their own smaller ceiling',()=>{
  const transcribe=source.slice(source.indexOf('fun transcribe('),source.indexOf('fun syncAndAck('));
  assert.match(transcribe,/readJson\(connection, maxBodyBytes = MAX_TRANSCRIPTION_RESPONSE_BYTES\)/);
});
