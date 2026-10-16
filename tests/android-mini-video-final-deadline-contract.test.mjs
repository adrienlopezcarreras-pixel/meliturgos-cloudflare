import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI video rejects frame read crossing 180s and never publishes timed-out recording',async()=>{
  const src=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  const start=src.indexOf('private fun receiveVideo(');
  const end=src.indexOf('private fun receiveAudio(',start);
  assert.ok(start>=0 && end>start);
  const fn=src.slice(start,end);
  const reserve=fn.indexOf('if (!budget.reserve(size)) return');
  const read=fn.indexOf('val jpeg = MiniMediaChunkReader.read(input, size, socket, budget::remainingSocketTimeoutMs, budget::withinDeadline)');
  const check=fn.indexOf('if (!budget.withinDeadline()) return',read);
  const add=fn.indexOf('avi.addFrame(jpeg)');
  const last=fn.indexOf('if (framesReceived == 0 || !budget.withinDeadline()) return');
  const media=fn.indexOf('val uri = createMediaStoreEntry(');
  assert.ok(reserve>=0 && reserve<read && read<check && check<add);
  assert.ok(last>add && media>last);
  assert.match(fn,/if \(!budget.withinDeadline\(\)\) return[\s\S]*val size = MiniMediaChunkReader\.readInt\(input, socket, budget::remainingSocketTimeoutMs, budget::withinDeadline\)/);
});
