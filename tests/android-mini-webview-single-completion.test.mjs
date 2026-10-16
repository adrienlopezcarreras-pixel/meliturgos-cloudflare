import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI WebView preview is captured, destroyed and unblocked exactly once',async()=>{
  const src=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  const begin=src.indexOf('private fun renderWebPage(');
  const end=src.indexOf('private fun createMediaStoreEntry(',begin);
  assert.ok(begin>=0&&end>begin);
  const fn=src.slice(begin,end);
  assert.match(fn,/val completed = AtomicBoolean\(false\)/);
  assert.match(fn,/val captureScheduled = AtomicBoolean\(false\)/);
  assert.match(fn,/!captureScheduled\.compareAndSet\(false, true\)/);
  // Main-thread capture and deadline callbacks share a single completion gate.
  assert.equal(fn.split('completed.compareAndSet(false, true)').length-1,2);
  const scheduled=fn.indexOf('Handler(context.mainLooper).postDelayed({');
  const capture=fn.indexOf('result = runCatching',scheduled);
  const captureGate=fn.indexOf('if (completed.compareAndSet(false, true))',scheduled);
  assert.ok(captureGate>=0&&capture>captureGate);
  assert.match(fn,/finally \{\s*bitmap.recycle\(\)/);
  const timeout=fn.lastIndexOf('Handler(context.mainLooper).postDelayed({');
  assert.ok(timeout>capture);
  assert.ok(fn.indexOf('if (completed.compareAndSet(false, true))',timeout)>timeout);
  assert.equal(fn.split('latch.countDown()').length-1,2);
  assert.equal(fn.split('view.destroy()').length-1,1);
  assert.equal(fn.split('web.destroy()').length-1,1);
  assert.match(fn,/latch\.await\(16, TimeUnit\.SECONDS\)/);
});
