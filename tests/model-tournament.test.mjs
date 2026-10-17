import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runModelTournament, rankedStreamModels, resetRankedModelCache, tournamentCandidates } from '../src/models/model-tournament.js';
import { streamModelCandidates } from '../src/api/chat-stream.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const answers = {
  good: m => /17 × 23/.test(m) ? '391' : /plan/.test(m) ? '1. a\n2. b\n3. c\n4. d' : 'VIOLETTE-58',
  half: m => /17 × 23/.test(m) ? '391' : 'je ne sais pas',
  down: () => { throw Object.assign(new Error('x'), { code: 'MODEL_UNAVAILABLE' }); },
};

test('the nightly tournament ranks models by correctness on MEL tasks, then the chat follows it', async () => {
  resetRankedModelCache();
  const db = sqliteD1();
  const behaviour = { '@cf/a/strong': 'good', '@cf/b/weak': 'half', '@cf/c/dead': 'down' };
  const env = { DB: db, AI: { async run(model, input) { return { response: answers[behaviour[model]](input.messages.at(-1).content) }; } } };
  const result = await runModelTournament(env, { models: Object.keys(behaviour) });
  assert.deepEqual(result.ranking.map(r => [r.model, r.passed]), [['@cf/a/strong', 3], ['@cf/b/weak', 1], ['@cf/c/dead', 0]]);
  const order = await rankedStreamModels(env);
  assert.deepEqual(order.slice(0, 2), ['@cf/a/strong', '@cf/b/weak']);
  assert.equal(order.includes('@cf/c/dead'), false, 'a model that passed nothing is not used');
  assert.equal(streamModelCandidates([{ content: 'hi' }], {}, order)[0], '@cf/a/strong');
});

test('without any tournament yet, the static free-model order applies', async () => {
  resetRankedModelCache();
  const order = await rankedStreamModels({ DB: sqliteD1() });
  assert.equal(order[0], '@cf/openai/gpt-oss-120b');
});

test('extra candidates come from configuration, ids validated', () => {
  const list = tournamentCandidates({ MEL_MODEL_CANDIDATES: '@cf/new/model-x, not a model, @cf/qwen/qwen3.8-27b' });
  assert.ok(list.includes('@cf/new/model-x') && list.includes('@cf/qwen/qwen3.8-27b'));
  assert.equal(list.includes('not a model'), false);
});

test('the daily cron runs the tournament', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const i = source.indexOf('const tasks = dailySelfAuditCron');
  assert.ok(source.indexOf('runModelTournament(env)', i) > i);
});
