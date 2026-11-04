import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { planCouncilDiffBatches } from '../../src/evolution/council-diff-batches.js';
import { handleCouncilBatchedReview } from '../../src/evolution/council-batch-review.js';

const head = 'a'.repeat(40), base = 'b'.repeat(40);
const hash = value => createHash('sha256').update(value).digest('hex');
const diff = 'diff --git a/src/small-change.js b/src/small-change.js\n' +
  '--- a/src/small-change.js\n+++ b/src/small-change.js\n' +
  '@@ -1 +1 @@\n-old\n+new\n';
const plan = planCouncilDiffBatches(diff);
const common = { head, base, root_sha256: hash(diff), batch_count: plan.batchCount,
  total_bytes: plan.totalBytes, file_count: plan.fileCount };
const reviewers = [
  { model: 'model-a', verdict: 'APPROVE', summary: 'full small diff checked' },
  { model: 'model-b', verdict: 'APPROVE', summary: 'security checked' },
  { model: 'model-c', verdict: 'APPROVE', summary: 'integration checked' },
];
const vote = async () => ({ decision: 'APPROVED', reviews: reviewers });

test('one small Council batch still requires a distinct final independent quorum', async () => {
  assert.equal(plan.batchCount, 1);
  assert.ok(plan.totalBytes < 48_000);
  const db = sqliteD1({maintenanceFence: true});
  const call = (body, review = vote) => handleCouncilBatchedReview({ DB: db }, body,
    { review, cryptoImpl: webcrypto, now: 1 });
  let votes = 0;
  const countVote = async () => { votes++; return vote(); };
  const chunk = plan.batches[0];
  try {
    const premature = await call({ ...common, mode: 'final' }, countVote);
    assert.equal(premature.status, 409);
    assert.equal(premature.result.code, 'COUNCIL_BATCH_REVIEWS_INCOMPLETE');
    const part = await call({ ...common, mode: 'batch', batch_index: 1,
      batch_sha256: hash(chunk.diff), diff: chunk.diff }, countVote);
    assert.equal(part.result.batch_decision, 'APPROVED');
    const outcome = await call({ ...common, mode: 'final' }, countVote);
    assert.equal(outcome.result.decision, 'APPROVED');
    assert.equal(outcome.result.complete_review, true);
    assert.equal(outcome.result.release_authorized, false);
    assert.equal(votes, 2, 'independent per-batch and final votes are both required');
    const cached = await call({ ...common, mode: 'final' }, async () => {
      throw Error('cached vote should be independently proven');
    });
    assert.equal(cached.result.cached, true);
  } finally { db.close(); }
});

test('one small post-merge batch cannot impersonate pre-merge approval', async () => {
  assert.equal(plan.batchCount, 1);
  const db = sqliteD1({maintenanceFence: true});
  const call = body => handleCouncilBatchedReview({ DB: db }, body,
    { review: vote, cryptoImpl: webcrypto, now: 2 });
  try {
    const chunk = plan.batches[0];
    const part = await call({ ...common, mode: 'batch', audit_only: true,
      batch_index: 1, batch_sha256: hash(chunk.diff), diff: chunk.diff });
    assert.equal(part.result.batch_decision, 'APPROVED');
    const audit = await call({ ...common, mode: 'final', audit_only: true });
    assert.equal(audit.result.decision, 'POST_MERGE_AUDIT_APPROVED');
    assert.equal(audit.result.release_authorized, false);
    const premerge = await call({ ...common, mode: 'final' });
    assert.equal(premerge.result.code, 'COUNCIL_BATCH_REVIEWS_INCOMPLETE');
    const row = await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?')
      .bind('council-review:' + head).first();
    assert.equal(row ?? null, null);
  } finally { db.close(); }
});

test('small diff runner accepts one batch but never zero batches', () => {
  const runner = readFileSync(new URL('../../scripts/run-council-batch-review.mjs',
    import.meta.url), 'utf8');
  assert.match(runner, /planned\.batchCount<1/);
  assert.doesNotMatch(runner, /planned\.batchCount<2/);
});
