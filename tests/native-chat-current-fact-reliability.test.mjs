import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { JSDOM } from 'jsdom';
import { CHAT_RICH_RENDERER_SOURCE } from '../src/pages/chat-rich-renderer.js';
import { inferCurrentFactVerificationPolicy } from '../src/api/current-fact-reliability.js';

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
    body: JSON.stringify({ text: 'montre moi une photo du pape', conversation_id: 'pope-photo' }),
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

test('a mistyped request for a photo of the pope still requires the current Vatican fact', () => {
  const policy = inferCurrentFactVerificationPolicy('donne moi un photo du papae');
  assert.equal(policy?.strict, true);
  assert.equal(policy?.role, 'pope');
});

test('a narrated tool call is replaced and the official portrait is shown', async () => {
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    MEL_WEB_MIN_INTERVAL_MS: 0,
    MEL_WEB_FETCH: async () => new Response(
      '<html><head><title>Léon XIV</title><meta property="og:image" content="https://www.vatican.va/content/dam/vatican/holy-father/leo-xiv.jpg"></head><body>Léon XIV</body></html>',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    ),
    AI: { async run() { return { response: 'We need to invoke the web.research tool.' }; } },
  };
  const response = await worker.fetch(new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text: 'montre moi un photo du pape', conversation_id: 'pope-image' }),
  }), env);
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.match(data.text, /Léon XIV/);
  assert.match(data.text, /!\[[^\]]*\]\(https:\/\/www\.vatican\.va\/content\/dam\/vatican\/holy-father\/leo-xiv\.jpg\)/);
  assert.doesNotMatch(data.text, /need to invoke/i);
});

test('a model that claims a generated pope photo is not reported as an image', async () => {
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    MEL_WEB_MIN_INTERVAL_MS: 0,
    MEL_WEB_FETCH: async () => new Response(
      '<html><head><title>Léon XIV</title></head><body>Léon XIV</body></html>',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    ),
    AI: { async run() { return { response: 'Voici la photo du Pape que je t’ai générée. Si mon outil de génération d’image est disponible, il affichera l’image ici.' }; } },
  };
  const response = await worker.fetch(new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text: 'Montre-moi une photo du pape ici.', conversation_id: 'pope-fake' }),
  }), env);
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.match(data.text, /n’a pas été obtenue|n'a pas été obtenue/);
  assert.doesNotMatch(data.text, /générée|affichera l’image/);
  assert.equal(data.tool_results.find(row => row.capability === 'image.render')?.status, 'FAILED');
  assert.equal(data.tool_results.find(row => row.capability === 'image.render')?.error, 'IMAGE_NOT_DELIVERED');
});

test('an autonomy tick asked from chat is queued instead of blocking the reply', async () => {
  let ran = false;
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    AI: { async run() { ran = true; return { response: 'ne doit pas partir' }; } },
  };
  const response = await worker.fetch(new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text: 'continue', capability: { id: 'autonomy.tick', input: {} }, conversation_id: 'tick-detach' }),
  }), env);
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(ran, false);
  assert.match(data.text, /moteur persistant/);
  assert.equal(data.tool_results.find(row => row.capability === 'autonomy.tick')?.status, 'QUEUED');
  assert.equal(data.advanced, false);
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


for (const [label, modelText] of [
  ['already visible image', '![portrait](https://www.vatican.va/portrait.jpg)'],
  ['image syntax as inline code', '`![portrait](https://www.vatican.va/portrait.jpg)`'],
  ['URL cited as prose', 'Source : https://www.vatican.va/portrait.jpg'],
  ['image syntax inside code', '```markdown\n![portrait](https://www.vatican.va/portrait.jpg)\n```'],
]) test('public image delivery renders a validated image despite ' + label, async () => {
  const env = {
    MELITURGOS_USER:'test', MELITURGOS_PASSWORD:'test-only', MEL_WEB_MIN_INTERVAL_MS:0,
    MEL_WEB_FETCH: async () => new Response('<html><head><title>Léon XIV</title><meta property="og:image" content="https://www.vatican.va/portrait.jpg"></head><body>Léon XIV</body></html>', {headers:{'content-type':'text/html'}}),
    AI:{async run(){return {response:modelText};}},
  };
  const response = await worker.fetch(new Request('https://mel.example/api/chat', {
    method:'POST',headers:authHeaders(),body:JSON.stringify({text:'montre moi une image du pape',conversation_id:'media-'+label}),
  }),env);
  const data=await response.json();
  assert.equal(response.status,200);
  const outsideCode=data.text.replace(/```[\s\S]*?```/g,'');
  assert.match(outsideCode,/!\[[^\]]*\]\(https:\/\/www\.vatican\.va\/portrait\.jpg\)/);
  assert.equal(data.tool_results.find(row=>row.capability==='image.render')?.status,'SUCCEEDED',JSON.stringify(data.text));
  const dom=new JSDOM('<div id="host"></div>',{url:'https://mel.example/',runScripts:'outside-only'});
  try {
    dom.window.eval(CHAT_RICH_RENDERER_SOURCE);
    const host=dom.window.document.getElementById('host');
    assert.equal(dom.window.melRenderRichText(host,data.text),true);
    assert.equal(host.querySelectorAll('img').length,1,'one actual image element, no duplicate or code-only image');
    assert.equal(host.querySelector('img').src,'https://www.vatican.va/portrait.jpg');
  } finally { dom.window.close(); }

});
