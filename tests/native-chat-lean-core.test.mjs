import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNativeChat } from '../src/api/native-chat.js';

const headers = {
  authorization: 'Basic ' + btoa('test:test-only'),
  'content-type': 'application/json',
};

async function sendOrdinaryChat(text) {
  const calls = [];
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    AI: {
      async run(model, payload) {
        calls.push({model, payload});
        return {response: 'Réponse naturelle et utile, avec une explication claire et des exemples concrets : ' + text.slice(0, 100)};
      }
    }
  };
  const request = new Request('https://mel.test/api/chat', {
    method: 'POST', headers,
    body: JSON.stringify({ text, conversation_id: 'lean-chat-' + text.length }),
  });
  const response = await handleNativeChat(request, env);
  return { response, data: await response.json(), calls };
}

test('Bonjour reaches one model with an ordinary conversational prompt, not the MEL runtime registry', async () => {
  const {response,data,calls} = await sendOrdinaryChat('Bonjour MEL.');
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.match(data.text, /^Réponse naturelle et utile/);
  assert.equal(calls.length, 1);
  const system = calls[0].payload.messages.find(row => row.role === 'system')?.content || '';
  assert.match(system, /Réponds en français/);
  assert.doesNotMatch(system, /CAPABILITY_MANIFEST runtime actuel/);
  assert.doesNotMatch(system, /AUTO-OBSERVATION RUNTIME/);
  assert.doesNotMatch(system, /VÉRITÉ ACCÈS CODE/);
  assert.doesNotMatch(system, /STATUTS OPÉRATIONNELS/);
  assert.ok(system.length < 12000, 'ordinary chat should not carry a huge operations handbook');
});

test('non-action explanation still produces a normal answer, not a diagnostic', async () => {
  const {response,data,calls} = await sendOrdinaryChat('Explique-moi simplement pourquoi la mer est salée.');
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(calls.length, 1);
  assert.match(data.text, /Réponse naturelle et utile/);
  assert.notEqual(data.response_mode, 'durable-work');
  assert.notEqual(data.response_mode, 'deterministic-self-state');
  const system = calls[0].payload.messages.find(row => row.role === 'system')?.content || '';
  assert.doesNotMatch(system, /CAPABILITY_MANIFEST runtime actuel/);
});

test('large creative explanation uses one response model, without an operational capability dump', async () => {
  const text = 'Explique en profondeur les liens entre musique, narration et émotions humaines, avec des exemples inventés, une analyse progressive, des limites, puis une conclusion. Ne fais aucune action extérieure.';
  const {response,data,calls} = await sendOrdinaryChat(text);
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(calls.length, 1);
  assert.match(data.text, /Réponse naturelle et utile/);
  assert.doesNotMatch(calls[0].payload.messages.find(row => row.role === 'system')?.content || '', /CAPABILITY_MANIFEST runtime actuel/);
});
