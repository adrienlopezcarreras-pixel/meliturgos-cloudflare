import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function authHeaders() {
  return {
    authorization: 'Basic ' + btoa('test:test-only'),
    'content-type': 'application/json',
  };
}

test('current pope identity is forced through the stable Vatican source and reaches inference with tail evidence', async () => {
  const webCalls = [];
  const aiCalls = [];
  const longPrefix = 'historique '.repeat(1800);
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    MEL_WEB_MIN_INTERVAL_MS: 0,
    MEL_WEB_FETCH: async url => {
      webCalls.push(String(url));
      assert.equal(String(url), 'https://www.vatican.va/content/vatican/fr/holy-father.html');
      return new Response(
        '<html><head><title>Pontifes</title></head><body>' + longPrefix +
        '<table><tr><td>266</td><td>François</td><td>fin 21.IV.2025</td></tr>' +
        '<tr><td>267</td><td>Léon XIV</td><td>Robert Francis Prevost</td><td>pontificat en cours</td></tr></table></body></html>',
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    },
    AI: {
      async run(model, input) {
        aiCalls.push({ model, messages: input.messages });
        return { response: 'Le pape actuel est Léon XIV (Robert Francis Prevost), d’après le Vatican.' };
      },
    },
  };

  const response = await worker.fetch(new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text: "Comment s'appelle le pape ?", conversation_id: 'pope-current' }),
  }), env);
  const data = await response.json();

  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.text, 'Le pape actuel est Léon XIV (Robert Francis Prevost), d’après le Vatican.');
  assert.deepEqual(webCalls, ['https://www.vatican.va/content/vatican/fr/holy-father.html']);
  assert.equal(aiCalls.length, 1);
  assert.ok(data.capability_used.includes('web.research'));
  const system = aiCalls[0].messages.find(message => message.role === 'system')?.content || '';
  assert.match(system, /FAIT ACTUEL STRICT/);
  assert.match(system, /Léon XIV/);
  assert.match(system, /Robert Francis Prevost/);
  assert.match(system, /vatican\.va/);
});

test('strict current officeholder facts fail closed when authoritative evidence is unavailable', async () => {
  let aiCalls = 0;
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    MEL_WEB_MIN_INTERVAL_MS: 0,
    MEL_WEB_FETCH: async () => { throw new Error('network unavailable'); },
    AI: {
      async run() {
        aiCalls += 1;
        return { response: 'guess' };
      },
    },
  };

  const response = await worker.fetch(new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text: "Quel est le nom du pape ?", conversation_id: 'pope-no-proof' }),
  }), env);
  const data = await response.json();

  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.model, 'deterministic-current-fact-guard');
  assert.equal(data.verified_current_fact, false);
  assert.equal(aiCalls, 0);
  assert.match(data.text, /ne peux pas confirmer/i);
  assert.match(data.text, /ne pas deviner/i);
});

test('historical officeholder questions are not mislabeled as current facts', async () => {
  const webCalls = [];
  let aiCalls = 0;
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    MEL_WEB_MIN_INTERVAL_MS: 0,
    MEL_WEB_FETCH: async url => {
      webCalls.push(String(url));
      return new Response('unexpected', { status: 500 });
    },
    AI: {
      async run() {
        aiCalls += 1;
        return { response: 'Question historique traitée sans prétendre vérifier le titulaire actuel.' };
      },
    },
  };

  const response = await worker.fetch(new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text: 'Qui était le pape en 1978 ?', conversation_id: 'pope-history' }),
  }), env);
  const data = await response.json();

  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(aiCalls, 1);
  assert.equal(webCalls.length, 0);
  assert.notEqual(data.model, 'deterministic-current-fact-guard');
});
