import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isProfessorCodeRole, runNativeInference } from '../src/api/native-chat.js';

test('only Professor Code activates the developer role', () => {
  assert.equal(isProfessorCodeRole({ surface: 'mel-full', role: 'developer', requested_mode: 'code' }), true);
  assert.equal(isProfessorCodeRole({ surface: 'mel-full', role: 'assistant', requested_mode: 'conversation' }), false);
  assert.equal(isProfessorCodeRole({ surface: 'mel-full', role: 'developer', requested_mode: 'conversation' }), false);
  assert.equal(isProfessorCodeRole({ surface: 'mel-full', role: 'assistant', requested_mode: 'code' }), false);
  assert.equal(isProfessorCodeRole({ surface: 'mel-normal', role: 'developer', requested_mode: 'code' }), false);
  assert.equal(isProfessorCodeRole(undefined), false);
});

test('Professor Code uses a real CODE model task; normal conversation retains classification', async () => {
  const models = [];
  const env = { AI: { run: async model => { models.push(model); return { response: 'ok' }; } } };
  const messages = [{ role: 'user', content: 'bonjour' }];
  const code = await runNativeInference({ env, messages, text: 'bonjour', taskOverride: 'CODE' });
  const normal = await runNativeInference({ env, messages, text: 'bonjour' });
  assert.equal(code.task, 'CODE');
  assert.notEqual(normal.task, 'CODE');
  assert.equal(models.length, 2);
});

test('only explicit Professor Code bypasses plain chat prompt and receives developer instructions', async () => {
  const source = await readFile(new URL('../src/api/native-chat.js', import.meta.url), 'utf8');
  assert.match(source, /const professorCodeChat = isProfessorCodeRole\(body\?\.intent_context\)/);
  assert.match(source, /const plainChatTurn = !professorCodeChat && !releaseSmoke/);
  assert.match(source, /professorCodeChat\s*\? 'MODE PROFESSEUR — CODE/);
  assert.match(source, /taskOverride: voiceReply \? 'FAST' : \(professorCodeChat \? 'CODE'/);
  assert.doesNotMatch(source, /const developerRole = body\?/);
});
