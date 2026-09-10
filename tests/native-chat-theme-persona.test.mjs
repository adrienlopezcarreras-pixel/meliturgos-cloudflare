import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNativeChat } from '../src/api/native-chat.js';

function request(theme) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + btoa('test:test-only'),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ text: 'Bonjour MEL', ui_theme: theme, conversation_id: `theme-${theme}` }),
  });
}

async function run(theme) {
  const calls = [];
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    AI: {
      async run(_model, input) {
        calls.push(input);
        return { response: `ok-${theme}` };
      },
    },
  };
  const response = await handleNativeChat(request(theme), env);
  const data = await response.json();
  return { response, data, calls };
}

test('Granada, Aviation, Paladin and Amazon are no longer silently downgraded to classic', async () => {
  const expected = {
    granada: 'CATHÉDRALE DE GRENADE',
    aviation: 'AVIATION 1940s',
    paladin: 'PALADIN LIGHT FULL PLATE',
    amazon: 'DIADÈME DU GRIFFON',
  };
  for (const [theme, marker] of Object.entries(expected)) {
    const { response, data, calls } = await run(theme);
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.active_theme, theme);
    assert.equal(calls.length, 1);
    const system = calls[0].messages.find(message => message.role === 'system')?.content || '';
    assert.match(system, new RegExp(marker));
    assert.match(system, new RegExp(`thème visuel/persona actif est ${theme}`, 'i'));
  }
});

test('unknown theme remains fail-safe classic', async () => {
  const { data, calls } = await run('made-up-theme');
  assert.equal(data.active_theme, 'classic');
  const system = calls[0].messages.find(message => message.role === 'system')?.content || '';
  assert.match(system, /MODE CLASSIQUE/);
});
