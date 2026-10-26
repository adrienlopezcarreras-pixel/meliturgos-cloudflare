import test from 'node:test';
import assert from 'node:assert/strict';
import { answerOwnedDeviceConversation } from '../src/devices/waveshare-terminal-api.js';

test('the phone and MINI get a short conversational answer, never a coding model', async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, input) {
        calls.push({ model, tokens: input.max_tokens });
        return { response: 'Je suis là.' };
      },
    },
  };
  const answer = await answerOwnedDeviceConversation('bonjour', env);
  assert.equal(answer.ok, true);
  assert.equal(answer.response_mode, 'device-conversation');
  assert.equal(answer.text, 'Je suis là.');
  assert.equal(calls[0].model, '@cf/zai-org/glm-4.7-flash');
  assert.equal(calls[0].tokens, 120);
  assert.equal(await answerOwnedDeviceConversation('va sur wikipedia.org', env), null);
});
