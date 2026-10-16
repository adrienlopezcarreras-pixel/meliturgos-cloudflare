import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url);
const between=(src,from,to)=>{
  const start=src.indexOf(from),end=src.indexOf(to,start+1);
  assert.ok(start>=0&&end>start, 'missing '+from);
  return src.slice(start,end);
};

test('MINI accepts clients only from the listener epoch and passes that epoch through dispatch',async()=>{
  const src=await readFile(source,'utf8');
  const start=between(src,'fun ensureStarted(', 'private fun credentials(');
  assert.match(start,/Thread\(\{ acceptLoop\(epoch\) \}/);
  const accept=between(src,'private fun acceptLoop(sessionEpoch: Long)', 'private fun readFully(');
  assert.match(accept,/while \(started\.get\(\) && hotspotEpoch\.get\(\) == sessionEpoch\)/);
  assert.match(accept,/if \(hotspotEpoch\.get\(\) != sessionEpoch\)/);
  assert.ok(accept.indexOf('if (hotspotEpoch.get() != sessionEpoch)')<accept.indexOf('activeClients.add(socket)'));
  assert.match(accept,/handleClient\(socket, sessionEpoch\)/);
  const dispatch=between(src,'private fun handleClient(socket: Socket, sessionEpoch: Long)', 'private fun receivePhoto(');
  assert.match(dispatch,/if \(!started\.get\(\) \|\| hotspotEpoch\.get\(\) != sessionEpoch\) return/);
  for(const signature of [
    'receivePhoto(input, safeName(name, "mel-mini-photo.jpg"), client, sessionEpoch)',
    'receiveVideo(input, safeName(name, "mel-mini-video.avi"), width, height, fps, client, sessionEpoch)',
    'receiveAudio(input, safeName(name, "mel-mini-audio.wav"), sampleRate, channels, client, sessionEpoch)'
  ]) assert.ok(dispatch.includes(signature),signature);
});

test('MINI forbids publishing stale photo/video/audio even after hotspot STOP and restart',async()=>{
  const src=await readFile(source,'utf8');
  assert.match(src,/private val publicationGate = Any\(\)/);
  const ranges=[
    between(src,'private fun receivePhoto(', 'private fun receiveVideo('),
    between(src,'private fun receiveVideo(', 'private fun receiveAudio('),
    between(src,'private fun receiveAudio(', 'private fun receiveBrowser(')
  ];
  for(const body of ranges){
    assert.match(body,/sessionEpoch: Long/);
    assert.match(body,/if \(!writeAndPublish\(uri, sessionEpoch\)/);
  }
  const write=between(src,'private fun writeAndPublish(', 'private fun publish(');
  assert.match(write,/sessionEpoch: Long/);
  const gate=write.indexOf('synchronized(publicationGate)');
  const active=write.indexOf('if (!started.get()) return false',gate);
  const epoch=write.indexOf('if (hotspotEpoch.get() != sessionEpoch) return false',active);
  const publish=write.indexOf('publish(uri)',epoch);
  const done=write.indexOf('completed = true',publish);
  assert.ok(gate>=0&&active>gate&&epoch>active&&publish>epoch&&done>publish);
  assert.match(write,/if \(!completed\)[\s\S]*contentResolver\.delete\(uri, null, null\)/);
  const close=between(src,'fun close()', 'private fun stopActiveClients(');
  const stopGate=close.indexOf('synchronized(publicationGate)');
  const invalidated=close.indexOf('hotspotEpoch.incrementAndGet()',stopGate);
  const stopped=close.indexOf('started.set(false)',invalidated);
  assert.ok(stopGate>=0&&invalidated>stopGate&&stopped>invalidated);
});
