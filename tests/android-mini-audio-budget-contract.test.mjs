import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI audio receiver reserves budget before reading and writing each PCM chunk',async()=>{
  const source=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  const start=source.indexOf('private fun receiveAudio(');
  const end=source.indexOf('private fun receiveBrowser(',start);
  assert.ok(start>=0&&end>start);
  const audio=source.slice(start,end);
  const reserve=audio.indexOf('budget.reserve(size)');
  const read=audio.indexOf('val bytes = readFully(input, size)');
  const written=audio.indexOf('output.write(bytes)');
  const publish=audio.indexOf('val uri = createMediaStoreEntry(');
  assert.ok(reserve>=0 && reserve<read && read<written && written<publish);
  assert.match(audio,/val budget = MiniAudioTransferBudget\(\)/);
  assert.match(audio,/if \(!budget.withinDeadline\(\)\) return/);
  assert.match(audio,/if \(!budget.reserve\(size\)\) return/);
  const outside=audio.slice(written,publish);
  // The deadline may be combined with the nonempty-PCM guard.
  assert.ok(
    outside.includes('if (!budget.withinDeadline()) return') ||
    outside.includes('if (!budget.withinDeadline() || pcmBytes == 0L) return')
  );
});
