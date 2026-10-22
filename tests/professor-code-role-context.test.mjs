import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveProfessorChatInferenceRoute, runNativeInference } from '../src/api/native-chat.js';

// [ChatGPT-GPT6] Regression for the Professor-only role and model contract.
// The Normal client and its routing must remain completely untouched.
test('Professor Code uses one authoritative gate for developer context and model routing', async () => {
  const source = await readFile(new URL('../src/api/native-chat.js', import.meta.url), 'utf8');
  assert.match(source, /const professorRoute = resolveProfessorChatInferenceRoute\(body\?\.intent_context\)/);
  assert.equal((source.match(/const professorRoute = resolveProfessorChatInferenceRoute\(/g) || []).length, 1);
  assert.match(source, /const professorCodeChat = professorRoute\?\.task === 'CODE'/);
  assert.match(source, /const plainChatTurn = !releaseSmoke/);
  assert.match(source, /const professorDeveloperInstruction = professorCodeChat/);
  assert.equal((source.match(/    professorDeveloperInstruction,/g)||[]).length, 2, 'both streamed and operational prompts use developer role');
  assert.match(source, /professorCodeChat\s*\n\s*\? 'MODE PROFESSEUR — CODE/);
  assert.match(source, /parallel: professorCodeChat \? false : parallel/);
  assert.doesNotMatch(source, /const developerRole = body\?/);
});

test('Normal is never routed to developer models or instructions', async () => {
  assert.equal(resolveProfessorChatInferenceRoute({ surface: 'mel-normal', role: 'developer', requested_mode: 'code' }), null);
  assert.equal(resolveProfessorChatInferenceRoute({ surface: 'mel-full', role: 'developer', requested_mode: 'conversation' }), null);
  assert.equal(resolveProfessorChatInferenceRoute({ surface: 'mel-full', role: 'assistant', requested_mode: 'code' }), null);
  const chat = resolveProfessorChatInferenceRoute({ surface: 'mel-full', role: 'assistant', requested_mode: 'conversation' });
  const code = resolveProfessorChatInferenceRoute({ surface: 'mel-full', role: 'developer', requested_mode: 'code' });
  assert.equal(chat.task, 'GENERAL');
  assert.equal(code.task, 'CODE');
  assert.notEqual(chat.model, code.model);
  const models = [];
  const env = { AI: { async run(model) { models.push(model); return { response: 'ok' }; } } };
  for (const route of [chat, code]) {
    const result = await runNativeInference({
      env, messages: [{ role: 'user', content: 'bonjour' }],
      text: 'bonjour', taskOverride: route.task, preferredModel: route.model, parallel: false,
    });
    assert.equal(result.model, route.model);
  }
  assert.deepEqual(models, [chat.model, code.model]);
});
