import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleNativeChat,
  inferNegativeFeedbackCouncilRecovery,
  inferSafeCouncilRecoveryRetry,
} from '../src/api/native-chat.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createConversationService } from '../src/conversations/conversation-service.js';

process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';

const recent = [
  { role: 'user', content: 'lance un stress test' },
  { role: 'assistant', content: "Je n'ai pas réussi à lancer le test." },
];

for (const feedback of ['non', "tu n'y arrives pas", 'ça ne marche pas', "ce n'est pas ça", 'réessaie']) {
  test('negative owner feedback triggers Council recovery: ' + feedback, () => {
    const recovery = inferNegativeFeedbackCouncilRecovery(feedback, recent);
    assert.ok(recovery);
    assert.equal(recovery.original_request, 'lance un stress test');
    assert.match(recovery.failed_response, /pas réussi/i);
  });
}

test('bare non answering an assistant question does not trigger a Council', () => {
  const recovery = inferNegativeFeedbackCouncilRecovery('non', [
    { role: 'user', content: 'veux-tu continuer ?' },
    { role: 'assistant', content: 'Veux-tu que je lance le test ?' },
  ]);
  assert.equal(recovery, null);
});

test('explicit failure wording still triggers after a question', () => {
  const recovery = inferNegativeFeedbackCouncilRecovery("tu n'y arrives pas", [
    { role: 'user', content: 'lance le test' },
    { role: 'assistant', content: 'Veux-tu que je réessaie ?' },
  ]);
  assert.ok(recovery);
});

test('Council recovery retries a safe read/test capability', () => {
  const recovery = inferNegativeFeedbackCouncilRecovery("tu n'y arrives pas", recent);
  assert.deepEqual(inferSafeCouncilRecoveryRetry(recovery, recent), {
    id: 'capability.audit',
    input: { deep: true },
    execution_intent: 'GLOBAL_CAPABILITY_STRESS_TEST',
  });
});

test('Council recovery never silently retries a computer action', () => {
  const recovery = inferNegativeFeedbackCouncilRecovery("ça ne marche pas", [
    { role: 'user', content: 'ouvre Firefox sur mon PC' },
    { role: 'assistant', content: "Je n'ai pas réussi à ouvrir Firefox." },
  ]);
  assert.ok(recovery);
  assert.equal(inferSafeCouncilRecoveryRetry(recovery, []), null);
});

test('unrelated negative sentence does not trigger without a previous user/assistant pair', () => {
  assert.equal(inferNegativeFeedbackCouncilRecovery('non', []), null);
});


test('native /api/chat launches Model Council end-to-end after explicit owner failure feedback', async () => {
  const DB = sqliteD1();
  try {
    const conversationId = 'negative-feedback-council-e2e';
    const service = createConversationService({ DB });
    await service.archiveMessage({
      conversationId,
      role: 'user',
      content: 'explique-moi clairement le fonctionnement du système',
      timestamp: 1,
    });
    await service.archiveMessage({
      conversationId,
      role: 'assistant',
      content: 'Réponse précédente insuffisante.',
      timestamp: 2,
    });

    const calls = [];
    const env = {
      DB,
      MELITURGOS_USER: 'owner',
      AI: {
        async run(model, payload) {
          calls.push({ model, payload });
          return { response: `réponse corrigée via ${model}` };
        },
      },
    };
    const request = new Request('https://mel.test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: "tu n'y arrives pas",
        conversation_id: conversationId,
      }),
    });

    const response = await handleNativeChat(request, env, { authorized: true });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.council_recovery?.triggered, true);
    assert.equal(body.council_recovery?.council_status, 'SUCCEEDED');
    assert.equal(body.council_recovery?.learning_validated, false);
    assert.equal(body.council_recovery?.xp_awarded, false);
    assert.ok(body.capability_used.includes('model.council'));
    assert.ok(body.tool_results.some(row => row.capability === 'model.council' && row.status === 'SUCCEEDED'));
    assert.ok(calls.length >= 4);
  } finally {
    DB.close();
  }
});
