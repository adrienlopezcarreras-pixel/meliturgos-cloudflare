import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createConversationService } from '../src/conversations/conversation-service.js';
import { handleNativeChat } from '../src/api/native-chat.js';

function request(text, conversationId='quality-live') {
  return new Request('https://mel.example/api/chat', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({text,conversation_id:conversationId}),
  });
}

test('elliptical turn without any reliable anchor asks a deterministic clarification without AI', async () => {
  const DB=sqliteD1();
  try {
    const response=await handleNativeChat(request('go','clarify-empty'),{DB},{authorized:true});
    const data=await response.json();
    assert.equal(response.status,200);
    assert.equal(data.model,'deterministic-clarification');
    assert.equal(data.response_focus?.needs_clarification,true);
    assert.match(data.text,/continue quoi exactement/i);
  } finally {
    DB.close();
  }
});

test('native chat blocks a severe off-topic generation and records the quality incident', async () => {
  const DB=sqliteD1();
  try {
    const service=createConversationService({DB});
    await service.archiveMessage({
      conversationId:'quality-live',
      role:'user',
      content:'améliore la cohérence des réponses de MEL et sa connaissance de ses capacités',
      timestamp:1,
    });
    await service.archiveMessage({
      conversationId:'quality-live',
      role:'assistant',
      content:'Je reste sur ce chantier.',
      timestamp:2,
    });

    const env={
      DB,
      AI:{
        async run(){
          return {response:'Les abeilles vivent dans des ruches et produisent du miel au printemps.'};
        },
      },
    };
    const response=await handleNativeChat(request('continue'),env,{authorized:true});
    const data=await response.json();
    assert.equal(response.status,200);
    assert.equal(data.response_quality?.guarded,true);
    assert.ok(data.response_quality?.issue_codes?.includes('POSSIBLE_OFF_TOPIC'));
    assert.match(data.text,/reste uniquement sur ce périmètre/i);
    assert.doesNotMatch(data.text,/abeilles vivent/i);
    const count=await DB.prepare('SELECT COUNT(*) n FROM mel_response_quality_events').first();
    assert.equal(Number(count.n),1);
  } finally {
    DB.close();
  }
});
