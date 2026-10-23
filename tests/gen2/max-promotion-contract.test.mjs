import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('MEL candidate is kept in sync with main and promoted only under MAX with green full CI', async () => {
  const s = await read('.github/workflows/mel-candidate-promotion.yml');
  assert.match(s, /cron: '37 \* \* \* \*'/);
  assert.match(s, /CANDIDATE_FAST_FORWARDED_TO_MAIN/);
  assert.match(s, /MAIN_MERGED_INTO_CANDIDATE/);
  assert.match(s, /CANDIDATE_MAIN_CONFLICT/);
  assert.match(s, /j\.max_autonomy===true&&j\.paused!==true/);
  assert.match(s, /full-candidate-ci\.yml\/runs\?head_sha=\$CAND/);
  assert.match(s, /x\.c==="success"/);
  // Promotion is a fast-forward of main (never a force push) and comes last.
  const promote = s.indexOf('git -c http.https://github.com/.extraheader= push');
  assert.ok(promote > s.indexOf('if [ "$MAX" != "true" ]') && promote > s.indexOf('if [ "$OK" != "success" ]'));
  assert.doesNotMatch(s, /push --force|push -f /);
});

test('cloud bridge starts the full candidate suite and requires fresh review when candidate advances', async () => {
  const s = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  assert.match(s, /actions\/workflows\/full-candidate-ci\.yml\/dispatches/);
  assert.match(s, /TEACHER_APPROVAL_CANDIDATE_SHA_STALE/);
  assert.doesNotMatch(s, /git rebase/);
  assert.match(s, /"\$REMOTE_SHA" = "\$CANDIDATE_SHA"/);
});
