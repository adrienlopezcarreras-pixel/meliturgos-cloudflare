import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNativeChat } from '../src/api/native-chat.js';
import { createConversationService } from '../src/conversations/conversation-service.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

function request(text = 'Lis mes mails Gmail', conversation = 'connected-replay', id = 'owner-message-1') {
  return new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: { authorization: 'Basic ' + btoa('test:test-only'), 'content-type': 'application/json' },
    body: JSON.stringify({ text, conversation_id: conversation, client_message_id: id }),
  });
}

test('a completed connected read replays its archived response without any model, provider or archive duplicate', async () => {
  const DB = sqliteD1();
  try {
    const service = createConversationService({ DB });
    const metadata = { client_message_id: 'owner-message-1' };
    await service.archiveMessage({ conversationId:'connected-replay', role:'user', content:'Lis mes mails Gmail', metadata });
    await service.archiveMessage({ conversationId:'connected-replay', role:'assistant', content:'gmail.messages.search : échec — GMAIL_AUTH_REQUIRED', metadata, capabilitiesUsed:[] });
    let called = 0;
    const forbidden = async () => { called += 1; throw new Error('NO_MODEL_OR_PROVIDER_ON_REPLAY'); };
    const env = { DB, MELITURGOS_USER:'test', MELITURGOS_PASSWORD:'test-only', AI:{ run:forbidden }, MEL_PLATFORM_FETCH:forbidden, MEL_GITHUB_FETCH:forbidden };
    const response = await handleNativeChat(request(), env);
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.replayed, true);
    assert.match(data.text, /GMAIL_AUTH_REQUIRED/);
    assert.deepEqual(data.tool_results, []);
    assert.deepEqual(data.capability_used, []);
    assert.equal(called, 0);
    assert.equal((await service.getMessages('connected-replay')).length, 2);
    const conflict = await handleNativeChat(request('Lis mon agenda'), env);
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, 'CLIENT_MESSAGE_ID_CONFLICT');
    assert.equal(called, 0);
  } finally { DB.close(); }
});

test('a partial turn and another conversation cannot be mistaken for a completed read receipt', async () => {
  const DB = sqliteD1();
  try {
    const service = createConversationService({ DB });
    const metadata = { client_message_id:'owner-message-1' };
    await service.archiveMessage({ conversationId:'connected-replay', role:'user', content:'Lis mes mails Gmail', metadata });
    assert.equal(await service.getArchivedTurn('connected-replay', 'owner-message-1'), null);
    await service.archiveMessage({ conversationId:'connected-replay', role:'assistant', content:'Lecture archivée', metadata });
    assert.equal(await service.getArchivedTurn('different-conversation', 'owner-message-1'), null);
    assert.equal(await service.getArchivedTurn('connected-replay', 'different-message'), null);
  } finally { DB.close(); }
});

test('a completed connected read lookup failure stops before models and providers', async () => {
  const DB = sqliteD1();
  try {
    await createConversationService({ DB }).migrate();
    const prepare = DB.prepare.bind(DB);
    DB.prepare = sql => {
      if (sql.includes('AND id IN (?, ?)')) throw new Error('database unavailable');
      return prepare(sql);
    };
    let calls = 0;
    const response = await handleNativeChat(request(), { DB, MELITURGOS_USER:'test', MELITURGOS_PASSWORD:'test-only', AI:{ async run() { calls += 1; } } });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'CHAT_REPLAY_LOOKUP_FAILED');
    assert.equal(calls, 0);
  } finally { DB.close(); }
});


test('a completed connected tool response renders human text instead of raw tool-call JSON', async () => {
  const DB = sqliteD1();
  try {
    const service = createConversationService({ DB });
    const metadata = { client_message_id:'owner-message-1' };
    await service.archiveMessage({ conversationId:'connected-replay', role:'user', content:'Lis mes mails Gmail', metadata });
    await service.archiveMessage({
      conversationId:'connected-replay', role:'assistant',
      content:'Gmail : aucun message trouvé dans la boîte de réception.',
      metadata, capabilitiesUsed:['gmail.messages.search'],
    });
    const response = await handleNativeChat(request(), {
      DB, MELITURGOS_USER:'test', MELITURGOS_PASSWORD:'test-only',
      AI:{ async run() { throw new Error('MODEL_MUST_NOT_RUN'); } },
    });
    assert.equal(response.status,200);
    const result = await response.json();
    assert.equal(result.replayed,true);
    assert.match(result.text,/Gmail : aucun message/);
    assert.doesNotMatch(result.text,/"(?:tool_calls|function_call|arguments|tool_results)"\s*:/);
    assert.doesNotMatch(result.text,/^\s*[\[{]/);
  } finally { DB.close(); }
});
