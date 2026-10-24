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
  // main is pushed with the owner token (main requires PRs); match the refspec.
  const promote = s.indexOf('"$CAND:refs/heads/main"');
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

test('a Council rejection resets the candidate to main content instead of blocking promotion', async () => {
  const s = await read('.github/workflows/mel-candidate-promotion.yml');
  const reject = s.indexOf('if [ "$DECISION" = "REJECTED" ]');
  assert.ok(reject > s.indexOf('COUNCIL_REVIEW $CAND'));
  assert.ok(reject < s.indexOf('"$CAND:refs/heads/main"', reject));
  assert.match(s.slice(reject, reject + 800), /git push origin "HEAD:refs\/heads\/\$CANDIDATE"/);
});

test('candidate publication uses atomic expected-head lease rather than unchecked branch push', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  assert.match(workflow, /git push --force-with-lease="refs\/heads\/\$CANDIDATE_BRANCH:\$CANDIDATE_SHA"/);
  assert.match(workflow, /REMOTE_SHA" = "\$CANDIDATE_SHA"/);
  assert.doesNotMatch(workflow, /\|\| git push origin "HEAD:\$CANDIDATE_BRANCH"/);
});

test('candidate CI dispatch refuses a branch advanced beyond the published SHA', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  assert.match(workflow, /DISPATCH_HEAD="\$\(git ls-remote origin/);
  assert.match(workflow, /"\$DISPATCH_HEAD" != "\$NEW_SHA"/);
  assert.match(workflow, /CANDIDATE_HEAD_MOVED_BEFORE_CI_DISPATCH/);
});

test('full candidate CI rejects promotion for a superseded candidate SHA', async () => {
  const workflow = await read('.github/workflows/full-candidate-ci.yml');
  assert.match(workflow, /EXPECTED_SHA:/);
  assert.match(workflow, /github\.sha/);
  assert.match(workflow, /CANDIDATE_CI_SHA_SUPERSEDED/);
  assert.match(workflow, /remote_sha" != "\$EXPECTED_SHA"/);
  assert.ok(workflow.indexOf('Verify tested SHA remains current candidate HEAD') < workflow.indexOf('Dispatch candidate promotion'));
});
