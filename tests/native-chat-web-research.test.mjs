import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function authHeaders() {
  return {
    authorization: 'Basic ' + btoa('test:test-only'),
    'content-type': 'application/json',
  };
}

test('natural chat web request executes web.research and injects sourced evidence into MEL inference context', async () => {
  const webCalls = [];
  const aiCalls = [];
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    MEL_WEB_MIN_INTERVAL_MS: 0,
    MEL_WEB_FETCH: async (url) => {
      webCalls.push(String(url));
      if (String(url).startsWith('https://www.google.com/search?')) {
        return new Response('<html><head><title>Google results</title><meta name="description" content="SOURCE GOOGLE ACTUELLE"></head><body>Résultats publics</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (String(url).startsWith('https://duckduckgo.com/html/?q=')) {
        return new Response('<html><head><title>DuckDuckGo results</title><meta name="description" content="SOURCE DDG ACTUELLE"></head><body>Autres résultats publics</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    },
    AI: {
      async run(model, input) {
        aiCalls.push({ model, messages: input.messages });
        return { response: 'Voici les informations publiques trouvées.' };
      },
    },
  };

  const response = await worker.fetch(new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      text: 'Cherche sur internet les dernières informations sur Cloudflare Workers',
      conversation_id: 'web-integration',
    }),
  }), env);
  const data = await response.json();

  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.text, 'Voici les informations publiques trouvées.');
  assert.equal(aiCalls.length, 1, 'explicit deterministic web intent must not spend an extra semantic-classifier call');
  assert.equal(webCalls.length, 2);
  assert.ok(webCalls.some(url => url.startsWith('https://www.google.com/search?')));
  assert.ok(webCalls.some(url => url.startsWith('https://duckduckgo.com/html/?q=')));

  const system = aiCalls[0].messages.find(message => message.role === 'system')?.content || '';
  assert.match(system, /TOOL_RESULT_1/);
  assert.match(system, /web\.research/);
  assert.match(system, /SOURCE GOOGLE ACTUELLE/);
  assert.match(system, /SOURCE DDG ACTUELLE/);
  assert.match(system, /https:\/\/www\.google\.com\/search/);
  assert.match(system, /provenance/);
});

test('private connected-data wording is not silently rerouted to public web research', async () => {
  const webCalls = [];
  const aiCalls = [];
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    MEL_WEB_MIN_INTERVAL_MS: 0,
    MEL_WEB_FETCH: async (url) => {
      webCalls.push(String(url));
      return new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    },
    AI: {
      async run(model, input) {
        aiCalls.push({ model, messages: input.messages });
        return { response: 'Je traite la demande sans prétendre avoir consulté le web public.' };
      },
    },
  };

  const response = await worker.fetch(new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      text: 'Regarde mes mails Gmail et trouve les derniers messages reçus',
      conversation_id: 'private-integration',
    }),
  }), env);
  const data = await response.json();

  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(webCalls.length, 0);
  assert.equal(aiCalls.length, 1);
  const system = aiCalls[0].messages.find(message => message.role === 'system')?.content || '';
  assert.doesNotMatch(system, /\[TOOL_RESULT_1\][\s\S]*web\.research/);
});
