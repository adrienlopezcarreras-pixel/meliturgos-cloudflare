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
