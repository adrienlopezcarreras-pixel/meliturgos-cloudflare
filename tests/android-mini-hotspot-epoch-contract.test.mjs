import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI hotspot callbacks cannot resurrect revoked or superseded media sessions',async()=>{
  const source=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  assert.match(source,/hotspotEpoch = AtomicLong\(0\)/);
  const ensure=source.slice(source.indexOf('fun ensureStarted('),source.indexOf('private fun credentials('));
  assert.match(ensure,/val epoch = hotspotEpoch\.incrementAndGet\(\)/);
  const started=ensure.slice(ensure.indexOf('override fun onStarted('),ensure.indexOf('override fun onStopped()'));
  assert.ok(started.indexOf('hotspotEpoch.get() != epoch')>=0);
  assert.ok(started.indexOf('runCatching { value.close() }')>=0);
  assert.ok(started.lastIndexOf('hotspotEpoch.get() != epoch')>started.indexOf('val pair = credentials(value)'));
  assert.ok(started.lastIndexOf('hotspotEpoch.get() != epoch')<started.indexOf('currentConfig = config'));
  const stopped=ensure.slice(ensure.indexOf('override fun onStopped()'),ensure.indexOf('override fun onFailed('));
  assert.match(stopped,/if \(hotspotEpoch\.get\(\) != epoch\) return/);
  assert.match(stopped,/close\(\)/);
  const failed=ensure.slice(ensure.indexOf('override fun onFailed('));
  assert.match(failed,/if \(hotspotEpoch\.get\(\) != epoch\) return/);
  const close=source.slice(source.indexOf('fun close()'),source.indexOf('private class AviMjpegWriter('));
  assert.ok(close.indexOf('hotspotEpoch.incrementAndGet()')>=0);
  assert.ok(close.indexOf('started.set(false)')>close.indexOf('hotspotEpoch.incrementAndGet()'));
  assert.match(close,/stopActiveClients\(\)/);
});

test('MINI media token is rotated before each fresh hotspot start and issued consistently',async()=>{
  const src=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  assert.match(src,/@Volatile private var token = newSessionToken\(\)/);
  assert.match(src,/private fun newSessionToken\(\): String = ByteArray\(24\)/);
  assert.match(src,/SecureRandom\(\)\.nextBytes\(it\)/);
  const start=src.slice(src.indexOf('fun ensureStarted('),src.indexOf('private fun credentials('));
  const fresh=start.indexOf('if (!started.compareAndSet(false, true)) return');
  const rotate=start.indexOf('token = newSessionToken()');
  const listen=start.indexOf('serverSocket = ServerSocket(PORT)');
  const expose=start.indexOf('val config = Config(pair.first, pair.second, PORT, token)');
  assert.ok(fresh>=0&&rotate>fresh&&listen>rotate&&expose>listen);
  const stop=src.slice(src.indexOf('fun close()'),src.indexOf('private class AviMjpegWriter('));
  assert.ok(stop.indexOf('started.set(false)')>=0);
  assert.ok(stop.indexOf('currentConfig = null')>stop.indexOf('started.set(false)'));
  assert.ok(stop.indexOf('stopActiveClients()')>stop.indexOf('currentConfig = null'));
  assert.match(src,/constantTimeEquals\(token, suppliedToken\)/);
});
