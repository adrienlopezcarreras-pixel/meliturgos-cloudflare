import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferNegativeFeedbackCouncilRecovery,
  inferSafeCouncilRecoveryRetry,
} from '../src/api/native-chat.js';

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
