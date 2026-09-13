import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../src/index.js';

process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';

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
  assert.equal(body.development_allowed, false);
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
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'COUNCIL_GOAL_REQUIRED');
});

test('Gen2 Council, evolution and Work preflight APIs execute through CapabilityBus', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /import\s+\{\s*runAugmentioStateOfPlay\s*\}/);
  assert.doesNotMatch(source, /import\s+\{\s*prepareDevelopmentRequest\s*\}/);
  assert.match(source, /runtime\.bus\.execute\(['"]evolution\.preflight['"]/);
  assert.match(source, /capabilityId\s*=\s*path\s*===\s*['"]\/api\/gen2\/council\/state-of-play['"][\s\S]*['"]council\.state-of-play['"][\s\S]*['"]evolution\.preflight['"]/);
  assert.match(source, /runtime\.bus\.execute\(capabilityId/);
});
