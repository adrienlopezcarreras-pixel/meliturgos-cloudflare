import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const code=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelViewModel.kt',import.meta.url),'utf8');
const block=code.slice(code.indexOf('    fun sync() {'),code.indexOf('    private fun localTextPreview('));
test('Android applies sync before acknowledging checkpoint; no pre-UI syncAndAck',()=>{
 const download=block.indexOf('client.sync(conversationId)');
 const state=block.indexOf('_state.update { current ->');
 const ack=block.indexOf('client.ack(conversationId, checkpointId, checkpointTimestamp)');
 assert.ok(download>=0&&state>download&&ack>state);
 assert.doesNotMatch(block,/client.syncAndAck/);
 assert.match(block,/SYNC_CHECKPOINT_INVALID/);
});
test('ACK failure preserves visible messages and flags retryable state',()=>{
 assert.match(block,/catch \(error: Throwable\) \{[\s\S]*?Sync ACK en attente/);
 assert.match(block,/Messages reçus · accusé de réception à réessayer/);
 assert.match(block,/mergeSyncedMessages\(current.messages, incoming\)/);
});
