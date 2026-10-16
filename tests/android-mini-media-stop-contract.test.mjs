import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI media STOP closes accepted sockets and rejects late publishing',async()=>{
  const src=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  assert.match(src,/activeClients = ConcurrentHashMap\.newKeySet<Socket>\(\)/);
  const accept=src.slice(src.indexOf('private fun acceptLoop()'),src.indexOf('private fun readFully('));
  assert.match(accept,/activeClients\.add\(socket\)/);
  assert.match(accept,/if \(!started\.get\(\)\)/);
  assert.match(accept,/finally \{\s*activeClients\.remove\(socket\)/);
  const closed=src.slice(src.indexOf('fun close()'),src.indexOf('private class AviMjpegWriter('));
  assert.ok(closed.indexOf('started.set(false)')>=0);
  assert.ok(closed.indexOf('stopActiveClients()')>closed.indexOf('started.set(false)'));
  assert.match(closed,/for \(client in activeClients\) runCatching \{ client\.close\(\) \}/);
  assert.match(closed,/activeClients\.clear\(\)/);
  const hotspot=src.slice(src.indexOf('override fun onStopped()'),src.indexOf('override fun onFailed('));
  assert.match(hotspot,/started\.set\(false\)/);
  assert.match(hotspot,/serverSocket\?\.close\(\)/);
  assert.match(hotspot,/serverSocket = null/);
  assert.match(hotspot,/stopActiveClients\(\)/);
  const helper=src.slice(src.indexOf('private fun writeAndPublish('),src.indexOf('private fun publish('));
  assert.ok(helper.indexOf('if (!started.get()) return false')>=0);
  assert.ok(helper.indexOf('publish(uri)')>helper.indexOf('if (!started.get()) return false'));
  assert.match(helper,/if \(!completed\)/);
  assert.match(helper,/contentResolver\.delete\(uri, null, null\)/);
});
