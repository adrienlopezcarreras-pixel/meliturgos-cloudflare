import test from 'node:test';
import assert from 'node:assert/strict';
import { injectEvolutionPreflightCapability, inferCapabilityInspectionIntent, inferCommunicationAuditIntent, buildIntentRoutingContext } from '../src/evolution/chat-intent.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createConversationService } from '../src/conversations/conversation-service.js';
import { classifySemanticOwnerIntent } from '../src/evolution/semantic-intent.js';

test('deterministic capability inspection understands natural French formulations', () => {
  const shallow = [
    'Quelles sont tes capacités réelles ?',
    'MEL, liste tes compétences actives',
    'Que sais-tu faire actuellement ?',
    'Montre-moi les outils que tu peux vraiment utiliser',
  ];
  for (const text of shallow) {
    const routed = inferCapabilityInspectionIntent(text);
    assert.equal(routed?.id, 'capability.audit', text);
    assert.equal(routed?.input?.deep, false, text);
  }

  const deep = [
    'Teste toutes tes capacités réellement',
    'Vérifie tes compétences pour de vrai',
    'Fais un audit complet de tes outils',
  ];
  for (const text of deep) {
    const routed = inferCapabilityInspectionIntent(text);
    assert.equal(routed?.id, 'capability.audit', text);
    assert.equal(routed?.input?.deep, true, text);
  }
});

test('normal chat injects capability.audit instead of generic text-only self-description', async () => {
  const request = new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Teste toutes tes capacités réellement', conversation_id: 'conv-cap-1' }),
  });
  const prepared = await injectEvolutionPreflightCapability(request);
  const body = await prepared.json();
  assert.equal(body.capability?.id, 'capability.audit');
  assert.equal(body.capability?.input?.deep, true);
  assert.equal(body.intent_routing?.intent, 'CAPABILITY_STATUS');
});

test('semantic router can classify an elliptical capability-status follow-up', async () => {
  const env = {
    AI: {
      async run() {
        return { response: JSON.stringify({ intent: 'CAPABILITY_STATUS', resolved_goal: '', confidence: 0.98 }) };
      },
    },
  };
  const result = await classifySemanticOwnerIntent({
    env,
    text: 'et lesquelles marchent vraiment ?',
    context: 'USER: Parle-moi de tes modules et de tes capacités MEL.\nMEL: Je vais distinguer ce qui existe de ce qui est prévu.',
  });
  assert.equal(result?.intent, 'CAPABILITY_STATUS');
  assert.equal(result?.resolvedGoal, '');
});


test('communication log audit routes to conversation.audit', async () => {
  assert.deepEqual(inferCommunicationAuditIntent('regarde tes logs de communication avec moi et analyse tes contradictions'), { id:'conversation.audit', input:{ allConversations:false } });
  const request = new Request('https://mel.example/api/chat', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ text:'audite nos échanges et tes réponses incohérentes', conversation_id:'conv-audit' }),
  });
  const body = await (await injectEvolutionPreflightCapability(request)).json();
  assert.equal(body.capability?.id, 'conversation.audit');
  assert.equal(body.capability?.input?.conversationId, 'conv-audit');
  assert.equal(body.capability?.input?.allConversations, false);
  assert.equal(body.intent_routing?.intent, 'COMMUNICATION_AUDIT');
});

test('semantic routing context is rebuilt from real recent conversation history', async () => {
  const DB = sqliteD1();
  try {
    const service = createConversationService({ DB });
    await service.archiveMessage({ conversationId:'ctx-1', role:'user', content:'Modifie uniquement la communication de MEL, pas ShardVault.', timestamp:1 });
    await service.archiveMessage({ conversationId:'ctx-1', role:'assistant', content:'Je reste sur les réponses et la cohérence.', timestamp:2 });
    const context = await buildIntentRoutingContext({ conversation_id:'ctx-1', intent_context:{ surface:'mel-normal' } }, { DB });
    assert.match(context, /communication de MEL/i);
    assert.match(context, /pas ShardVault/i);
    assert.match(context, /UI_CONTEXT/);
    assert.doesNotMatch(context, /\[object Object\]/);
  } finally { DB.close(); }
});


test('global communication audit does not get trapped in the current conversation', async () => {
  const request = new Request('https://mel.example/api/chat', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ text:"fais un audit général de tout ce qu'on a échangé ensemble", conversation_id:'current-only' }),
  });
  const body = await (await injectEvolutionPreflightCapability(request)).json();
  assert.equal(body.capability?.id, 'conversation.audit');
  assert.equal(body.capability?.input?.allConversations, true);
  assert.equal(body.capability?.input?.conversationId, undefined);
});
