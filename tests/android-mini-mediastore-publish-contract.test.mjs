import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url);

test('MINI media sink publishes only after successful write and rolls back failed pending entry', async()=>{
  const src=await readFile(source,'utf8');
  const begin=src.indexOf('private fun writeAndPublish(');
  const end=src.indexOf('private fun publish(',begin);
  assert.ok(begin>=0&&end>begin);
  const helper=src.slice(begin,end);
  assert.match(helper,/openOutputStream\(uri, "w"\) \?: return false/);
  assert.match(helper,/output\.use \{ writer\(it\) \}/);
  assert.match(helper,/publish\(uri\)/);
  assert.match(helper,/completed = true/);
  assert.match(helper,/finally \{/);
  assert.match(helper,/if \(!completed\)/);
  assert.match(helper,/contentResolver\.delete\(uri, null, null\)/);

  for (const [startLabel,endLabel] of [
    ['private fun receivePhoto(','private fun receiveVideo('],
    ['private fun receiveVideo(','private fun receiveAudio('],
    ['private fun receiveAudio(','private fun receiveBrowser('],
  ]) {
    const from=src.indexOf(startLabel);
    const to=src.indexOf(endLabel,from);
    assert.ok(from>=0&&to>from,startLabel);
    const receiver=src.slice(from,to);
    assert.match(receiver,/if \(!writeAndPublish\(uri, sessionEpoch\)/,startLabel);
    assert.doesNotMatch(receiver,/\bpublish\(uri\)/,startLabel);
    assert.doesNotMatch(receiver,/contentResolver\.openOutputStream\(uri/,startLabel);
  }
});
