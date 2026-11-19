import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/ui-entry.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createConversationService } from '../src/conversations/conversation-service.js';

const ORIGIN = 'https://mel.example';
const auth = { authorization:'Basic '+Buffer.from('owner:fixture-password').toString('base64') };
const envWithDb = () => ({
  MELITURGOS_USER:'owner', MELITURGOS_PASSWORD:'fixture-password',
  DB:sqliteD1(),
});
const get = (env, path, headers={}) => worker.fetch(
  new Request(ORIGIN+path,{method:'GET',headers}),env,{waitUntil(){}},
);

test('VIA conversation by ID requires operator authentication and a valid single ID',async()=>{
  const env=envWithDb();
  const forbidden=await get(env,'/api/mel/conversations/by-id?id=example');
  assert.equal(forbidden.status,401);
  for(const suffix of ['','?id=','?id=../../bad','?id=x&id=y','?id=foo&other=bar']){
    const invalid=await get(env,'/api/mel/conversations/by-id'+suffix,auth);
    assert.equal(invalid.status,400,suffix);
  }
});

test('VIA resume reads the selected MEL conversation, never replaces it with latest',async()=>{
  const env=envWithDb();
  const store=createConversationService(env);
  await store.ensureConversation('old-via-chat','owner','Conversation VIA');
  await store.archiveMessage({conversationId:'old-via-chat',role:'user',content:'Première demande'});
  await store.archiveMessage({conversationId:'old-via-chat',role:'assistant',content:'Première réponse'});
  await store.ensureConversation('new-mel-chat','owner','Autre conversation');
  await store.archiveMessage({conversationId:'new-mel-chat',role:'user',content:'Question plus récente'});

  const response=await get(env,'/api/mel/conversations/by-id?id=old-via-chat',auth);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.conversation.id,'old-via-chat');
  assert.ok(body.messages.some(row=>row.content==='Première réponse'));
  assert.ok(body.messages.every(row=>row.conversationId==='old-via-chat'||row.conversation_id==='old-via-chat'));
  assert.equal(body.source,'owner-archive-by-id');
});

test('VIA resume cannot read a conversation owned by someone else',async()=>{
  const env=envWithDb();
  const store=createConversationService(env);
  await store.ensureConversation('another-user-chat','another-owner','Private');
  await store.archiveMessage({conversationId:'another-user-chat',role:'user',content:'Secret'});
  const result=await get(env,'/api/mel/conversations/by-id?id=another-user-chat',auth);
  assert.equal(result.status,404);
  const payload=await result.json();
  assert.equal(payload.code,'CONVERSATION_NOT_FOUND');
});
