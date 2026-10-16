import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI browser length header and URL bytes share one absolute deadline before rendering',async()=>{
  const receiver=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  const start=receiver.indexOf('private fun receiveBrowser('),end=receiver.indexOf('private fun renderWebPage(',start);
  assert.ok(start>=0&&end>start);
  const browser=receiver.slice(start,end);
  const read=browser.indexOf('MiniBrowserRequestReader.readUrl(input, socket)');
  const validate=browser.indexOf('MiniBrowserUrlPolicy.allows(url)');
  const render=browser.indexOf('renderWebPage(url, width, height)');
  assert.ok(read>=0&&validate>read&&render>validate);
  const reader=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniBrowserRequestReader.kt',import.meta.url),'utf8');
  assert.match(reader,/MAX_REQUEST_NANOS = 30L \* 1_000_000_000L/);
  assert.match(reader,/val started = clockNanos\(\)/);
  assert.match(reader,/val header = MiniMediaChunkReader\.read\(input, 2, socket, timeoutMs, withinDeadline\)/);
  assert.match(reader,/val bytes = MiniMediaChunkReader\.read\(input, size, socket, timeoutMs, withinDeadline\)/);
});
