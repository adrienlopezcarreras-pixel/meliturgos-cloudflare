import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseVerdict, decide, runCouncilReview } from '../src/evolution/council-review.js';

test('council verdicts and majority rule', async () => {
  assert.equal(parseVerdict('x {"verdict":"approve"} y').verdict, 'APPROVE');
  const A = { verdict: 'APPROVE' }, R = { verdict: 'REJECT' }, N = { verdict: null };
  assert.equal(decide([A, A, R, N]), 'APPROVED');
  assert.equal(decide([A, R, R, A]), 'REJECTED');
  assert.equal(decide([A, N, N, N]), 'INSUFFICIENT_REVIEWERS');
  const env = { AI: { async run(m) { return { response: m.includes('gemma') ? 'oops' : '{"verdict":"REJECT","blocking":["import inexistant"]}' }; } } };
  assert.equal((await runCouncilReview(env, { diff: '+x' })).decision, 'REJECTED');
  const wf = await readFile(new URL('../.github/workflows/mel-candidate-promotion.yml', import.meta.url), 'utf8');
  assert.ok(wf.indexOf('/api/internal/council-review') > 0 && wf.indexOf('git push origin "$CAND:refs/heads/main"') > wf.indexOf('/api/internal/council-review'));
  assert.match(wf, /DECISION" != "APPROVED"/);
});
