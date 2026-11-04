import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/mel-pr-council-review.yml', import.meta.url), 'utf8');

test('historical Council audit requires immutable PR head and merge ancestry, not a frozen main tip', () => {
  const marker = 'Recheck immutable head and main after all independent votes';
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0);
  const end = workflow.indexOf('Record exact-SHA audit provenance', start);
  assert.ok(end > start);
  const step = workflow.slice(start, end);
  assert.match(step, /CURRENT_HEAD.*MEL_COUNCIL_HEAD_SHA/);
  assert.match(step, /POST_MERGE_AUDIT_ONLY/);
  assert.match(step, /git merge-base --is-ancestor "\$MEL_COUNCIL_MERGE_SHA" "\$LIVE_MAIN"/);
  assert.match(step, /COUNCIL_HISTORICAL_MERGE_NO_LONGER_IN_MAIN/);
  assert.match(step, /elif \[ "\$CURRENT_MAIN" != "\$MEL_COUNCIL_MAIN_SHA" \]/);
  assert.doesNotMatch(step, /\[ "\$CURRENT_HEAD" != "\$MEL_COUNCIL_HEAD_SHA" \] \|\| \[ "\$CURRENT_MAIN"/);
  assert.match(step, /rm -f council-verdict\.json/);
});

test('historical receipts cannot authorize a release retroactively', () => {
  assert.match(workflow, /retroactive_premerge_approval:false/);
  assert.match(workflow, /release_authorized:false/);
  assert.match(workflow, /POST_MERGE_AUDIT_APPROVED/);
});
