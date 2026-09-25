import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyChatExecutionPath, CHAT_EXECUTION_PATHS } from '../../src/api/chat-execution-path.js';
import { handleNativeChat } from '../../src/api/native-chat.js';

test('bounded social messages use FAST while context-dependent or tool-like requests remain STANDARD', () => {
  for (const text of ['Bonjour', 'Merci beaucoup !', 'Comment ça va ?', 'Qui es-tu ?']) {
    assert.equal(classifyChatExecutionPath({ text }).mode, CHAT_EXECUTION_PATHS.FAST);
  }

  assert.equal(classifyChatExecutionPath({
    text: 'Continue',
    focus: { elliptical: true },
  }).mode, CHAT_EXECUTION_PATHS.STANDARD);

  assert.equal(classifyChatExecutionPath({
    text: 'Bonjour',
    inferredCapability: { id: 'web.research' },
  }).mode, CHAT_EXECUTION_PATHS.STANDARD);

  assert.equal(classifyChatExecutionPath({
    text: 'Merci',
    body: { parallel: true },
  }).mode, CHAT_EXECUTION_PATHS.STANDARD);

  assert.equal(classifyChatExecutionPath({
    text: 'Explique pourquoi le ciel est bleu',
  }).mode, CHAT_EXECUTION_PATHS.STANDARD);
});

test('FAST path selects the fast model and omits heavy runtime context', async () => {
  const calls = [];
  const env = {
    MELITURGOS_USER: 'adrien',
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        return { response: 'Salut !' };
      },
    },
  };

  const request = new Request('https://mel.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: 'Bonjour',
      conversation_id: 'fast-path-test',
    }),
  });

  const response = await handleNativeChat(request, env, { authorized: true });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.execution_path, 'FAST');
  assert.equal(body.execution_path_reason, 'BOUNDED_SOCIAL');
  assert.equal(body.model, '@cf/zai-org/glm-4.7-flash');
  assert.equal(body.memory_count, 0);
  assert.deepEqual(body.capability_used, []);
  assert.deepEqual(body.capability_manifest, []);
  assert.equal(calls.length, 1);

  const system = String(calls[0]?.input?.messages?.find(message => message.role === 'system')?.content || '');
  assert.match(system, /FAST PATH MEL/);
  assert.doesNotMatch(system, /CAPABILITY_MANIFEST runtime actuel/);
  assert.doesNotMatch(system, /ARCHITECTURE MEL/);
  assert.ok(system.length < 2000, `fast-path system prompt too large: ${system.length}`);
});

test('FAST classifier fails closed when a capability is explicitly requested', () => {
  const result = classifyChatExecutionPath({
    text: 'Bonjour',
    body: { capability: { id: 'echo', input: { value: 'x' } } },
  });
  assert.equal(result.mode, CHAT_EXECUTION_PATHS.STANDARD);
  assert.equal(result.reason, 'CAPABILITY_REQUIRED');
});
