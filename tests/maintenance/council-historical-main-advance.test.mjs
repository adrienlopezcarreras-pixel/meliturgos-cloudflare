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

test('Council keeps release gates while allowing only the pinned maintenance PR profile', () => {
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'fix\/council-historical-audit-main-advance-20261104'/);
  assert.match(workflow, /MEL_COUNCIL_PR_NUMBER=\$PR_NUMBER/);
  assert.match(workflow, /3103\) test "\$STATE" = "open"/);
  assert.match(workflow, /COUNCIL_PR_NOT_ALLOWLISTED/);
  assert.match(workflow, /prNumber==='3094'\?releaseMandatory:maintenanceMandatory/);
  const release = workflow.slice(workflow.indexOf('const releaseMandatory=['),workflow.indexOf('const maintenanceMandatory='));
  for (const name of [
    'gen2-17-targeted', 'gen2-17-full-suite', 'monitor-contract',
    'encrypted-backup', 'professor-audit', 'shardvault-targeted',
    'public-chat-targeted', 'public-chat-full-suite', 'durable-work',
    'node-validation', 'lora-runtime-contract', 'self-audit-contract',
    'MEL WORK free validation (no Vercel, no deployment)',
  ]) assert.ok(release.includes(name), name);
  assert.match(workflow, /const maintenanceMandatory=\['gen2-17-targeted','gen2-17-full-suite','encrypted-backup'\]/);
  assert.match(workflow, /const pending=mandatory\.filter\(name=>latest\.get\(name\)\?\.conclusion!=='success'\)/);
  assert.match(workflow, /const unfinished=\[\.\.\.latest\.values\(\)\]\.filter/);
});

test('scheduled Council audit and maintenance review have disjoint slots and exact selection', () => {
  assert.match(workflow, /- cron: '47 \*\/2 \* \* \*'/);
  assert.match(workflow, /- cron: '17 1-23\/2 \* \* \*'/);
  assert.match(workflow, /'47 \*\/2 \* \* \*'\) SELECTED_PR=3094/);
  assert.match(workflow, /'17 1-23\/2 \* \* \*'\) SELECTED_PR=3103/);
  assert.match(workflow, /COUNCIL_UNRECOGNIZED_SCHEDULE/);
  assert.match(workflow, /META="\$\(gh api "repos\/\$GITHUB_REPOSITORY\/pulls\/\$SELECTED_PR"/);
  assert.match(workflow, /echo "pr_number=\$SELECTED_PR" >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /if \[ "\$SELECTED_PR" != 3094 \]; then/);
  assert.match(workflow, /Maintenance PR merged; do not substitute historical release audit/);
});
