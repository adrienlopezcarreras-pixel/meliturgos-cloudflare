import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI media receiver caps active connections before starting client workers',async()=>{
  const src=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  assert.match(src,/MAX_ACTIVE_MEDIA_CLIENTS = 4/);
  const accept=src.slice(src.indexOf('private fun acceptLoop()'),src.indexOf('private fun readFully('));
  const cap=accept.indexOf('activeClients.size >= MAX_ACTIVE_MEDIA_CLIENTS');
  const add=accept.indexOf('activeClients.add(socket)');
  const thread=accept.indexOf('Thread({');
  assert.ok(cap>=0 && cap < add && add < thread);
  const reject=accept.slice(cap,add);
  assert.match(reject,/socket.close\(\)/);
  assert.match(reject,/continue/);
  assert.match(accept,/finally \{\s*activeClients\.remove\(socket\)/);
  const close=src.slice(src.indexOf('fun close()'),src.indexOf('private class AviMjpegWriter('));
  assert.match(close,/stopActiveClients\(\)/);
  assert.match(close,/activeClients\.clear\(\)/);
});
