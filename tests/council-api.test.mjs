import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
const env = {
  MELITURGOS_USER: 'adrien',
  MELITURGOS_PASSWORD: 'test',
  AI: {
    run: async (model, payload) => ({
      response: `diagnostic ${model}: ${payload?.messages?.at(-1)?.content?.slice(0, 40) || ''}`
    })
  }
};

async function post(path, body) {
  return worker.fetch(new Request('https://mel.test' + path, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }), env, {});
}

test('Council endpoint consults multiple configured zero-cost models', async () => {
  const response = await post('/api/gen2/council/state-of-play', { goal: 'Créer une compétence calendrier', minResponses: 2 });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.phase, 'STATE_OF_PLAY_BEFORE_DEVELOPMENT');
  assert.equal(body.development_allowed, true);
  assert.ok(body.responses.length >= 2);
  assert.ok(body.responses.every(x => x.answer?.provenance?.model));
});

test('evolution preflight endpoint stops before code generation', async () => {
  const response = await post('/api/gen2/evolution/preflight', { goal: 'Ajouter une compétence agenda', minResponses: 2 });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.stage, 'AI_STATE_OF_PLAY_COMPLETE');
  assert.equal(body.development_allowed, false);
  assert.equal(body.code_inspection_allowed, true);
  assert.equal(body.code_generation_allowed, false);
  assert.ok(body.council.responses.length >= 2);
});

test('Council endpoint requires a goal', async () => {
  const response = await post('/api/gen2/council/state-of-play', {});
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'COUNCIL_GOAL_REQUIRED');
});
