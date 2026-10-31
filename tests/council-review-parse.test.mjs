import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdict } from '../src/evolution/council-review.js';

// 30/10: gpt-oss-120b and gemma-4 reviews of FOUNDER-04 were UNPARSEABLE_REVIEW
// because the first-to-last brace match swallowed code and prose around them.
test('the verdict object is found among quoted code, fences and prose', () => {
  const text = 'Analyse : function f(){ return {a:1} }\n```json\n{"verdict":"REJECT","blocking":["test manquant {cas}"],"summary":"ok"}\n```\nFin {x}.';
  assert.deepEqual(parseVerdict(text), { verdict: 'REJECT', blocking: ['test manquant {cas}'], summary: 'ok' });
  assert.equal(parseVerdict('{"verdict":"MAYBE"}'), null);
  assert.equal(parseVerdict('pas de JSON'), null);
});

import { runCouncilReview, sensitiveDiff } from '../src/evolution/council-review.js';
const approve = '{"verdict":"APPROVE","blocking":[],"summary":"ok"}';
const reject = '{"verdict":"REJECT","blocking":["bug"],"summary":"non"}';
function aiEnv(answers) {
  const asked = [];
  return { asked, env: { AI: { run: async model => { asked.push(model); return { response: answers[model] ?? approve }; } } } };
}
const models = ['m1', 'm2', 'm3', 'm4'];

// Owner decision 31/10: two models first; unanimity on a non-sensitive diff decides.
test('two unanimous approvals of a non-sensitive diff decide without the other models', async () => {
  const { env, asked } = aiEnv({});
  const result = await runCouncilReview(env, { diff: 'diff --git a/src/teachers/x.js b/src/teachers/x.js', models });
  assert.equal(result.decision, 'APPROVED');
  assert.equal(result.stage, 'TWO_MODEL_UNANIMOUS');
  assert.deepEqual(asked, ['m1', 'm2']);
});

test('a rejection or a sensitive path calls the full council', async () => {
  const split = aiEnv({ m2: reject });
  await runCouncilReview(split.env, { diff: 'diff --git a/src/teachers/x.js b/src/teachers/x.js', models });
  assert.ok(split.asked.length > 2);
  const core = aiEnv({});
  const result = await runCouncilReview(core.env, { diff: 'diff --git a/src/evolution/autonomy-runtime-core.js b/src/evolution/autonomy-runtime-core.js', models });
  assert.notEqual(result.stage, 'TWO_MODEL_UNANIMOUS');
  assert.ok(core.asked.length > 2);
  assert.equal(sensitiveDiff('EDIT .github/workflows/deploy.yml'), true);
  assert.equal(sensitiveDiff('no paths at all'), true);
});
