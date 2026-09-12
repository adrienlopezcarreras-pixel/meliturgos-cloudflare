import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMentorChat, buildLocalGuardAdvice } from '../src/api/mentor-api.js';

function mentorRequest(text, context = []) {
  return new Request('https://mel.local/api/gen2/mentor/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, context }),
  });
}

test('Mentor works locally with zero external inference by default', async () => {
  const response = await handleMentorChat(mentorRequest('Conseille MEL sur la prochaine étape.'), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.provider, 'local-guard');
  assert.equal(body.control_mode, 'advisory-read-only');
  assert.equal(body.billing_policy, 'zero-euro-fail-closed');
  assert.equal(body.external_inference_used, false);
  assert.match(body.text, /lecture\/conseil uniquement/i);
});

test('Mentor guard requires Adrien approval for spending and destructive actions', () => {
  const advice = buildLocalGuardAdvice('Achète des crédits puis déploie en production et force push.');
  assert.match(advice, /Aucune dépense/i);
  assert.match(advice, /Action sensible/i);
  assert.match(advice, /autorisation explicite d’Adrien/i);
});

test('Workers AI cannot run unless both free-mode switches are enabled', async () => {
  let calls = 0;
  const env = {
    AI: { run: async () => { calls += 1; return { response: 'Conseil distant.' }; } },
    MEL_MENTOR_FREE_AI_ENABLED: 'true',
    MEL_MENTOR_ACCOUNT_CONFIRMED_FREE: 'false',
  };
  const response = await handleMentorChat(mentorRequest('Relis MEL.'), env);
  const body = await response.json();
  assert.equal(calls, 0);
  assert.equal(body.provider, 'local-guard');
  assert.equal(body.external_inference_used, false);
});

test('Workers AI enrichment is advisory-only after explicit free-account confirmation', async () => {
  let calls = 0;
  const env = {
    AI: { run: async () => { calls += 1; return { response: '1. Risque faible.\n2. Tester.\n3. Garder le SHA.' }; } },
    MEL_MENTOR_FREE_AI_ENABLED: 'true',
    MEL_MENTOR_ACCOUNT_CONFIRMED_FREE: 'true',
    MEL_MENTOR_FREE_MODEL: '@cf/zai-org/glm-4.7-flash',
  };
  const response = await handleMentorChat(mentorRequest('Relis MEL.'), env);
  const body = await response.json();
  assert.equal(calls, 1);
  assert.equal(body.provider, 'workers-ai');
  assert.equal(body.control_mode, 'advisory-read-only');
  assert.equal(body.billing_policy, 'zero-euro-explicitly-confirmed');
  assert.equal(body.external_inference_used, true);
});
