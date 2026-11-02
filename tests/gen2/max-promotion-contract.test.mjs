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
  assert.doesNotMatch(s, /push --force(?:\\s|$)|push -f /);
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
  const block = s.slice(reject, s.indexOf('"$CAND:refs/heads/main"', reject));
  assert.match(block, /git push --force-with-lease="refs\/heads\/\$CANDIDATE:\$CAND" origin "HEAD:refs\/heads\/\$CANDIDATE"/);
  // A rejection must not destroy the work of jobs the Council did not blame.
  assert.match(block, /revert_paths/);
  assert.match(block, /git diff --name-only "\$MAIN" "\$CAND" > council\.revert/);
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

test('Council never reviews a truncated candidate diff', async () => {
  const workflow = await read('.github/workflows/mel-candidate-promotion.yml');
  assert.match(workflow, /COUNCIL_DIFF_EXCEEDS_REVIEW_LIMIT/);
  assert.match(workflow, /DIFF_BYTES.*-gt 48000/);
  assert.doesNotMatch(workflow, /git diff[^\n]*\| head -c 48000/);
  assert.ok(workflow.indexOf('COUNCIL_DIFF_EXCEEDS_REVIEW_LIMIT') < workflow.indexOf('COUNCIL_REVIEW $CAND'));
});

test('all candidate reconciliation writes carry the originally fetched candidate SHA as a lease', async () => {
  const workflow = await read('.github/workflows/mel-candidate-promotion.yml');
  assert.match(workflow, /--force-with-lease="refs\/heads\/\$CANDIDATE:\$CAND" origin "\$MAIN:refs\/heads\/\$CANDIDATE"/);
  assert.equal((workflow.match(/--force-with-lease="refs\/heads\/\$CANDIDATE:\$CAND" origin "HEAD:refs\/heads\/\$CANDIDATE"/g) || []).length, 2);
  assert.doesNotMatch(workflow, /git push origin "(?:HEAD|\$MAIN):refs\/heads\/\$CANDIDATE"/);
});

test('candidate CI dispatch rejects GitHub errors rather than falsely reporting a successful launch', async () => {
  const workflow = await read('.github/workflows/mel-candidate-promotion.yml');
  const start = workflow.indexOf('dispatch_ci() {');
  const end = workflow.indexOf('if [ "$MAIN" = "$CAND" ]', start);
  const snippet = workflow.slice(start, end);
  assert.match(snippet, /--fail-with-body/);
  assert.match(snippet, /FULL_CANDIDATE_CI_DISPATCH_FAILED/);
  assert.match(snippet, /FULL_CANDIDATE_CI_DISPATCH_UNACKNOWLEDGED/);
  assert.match(snippet, /\[ "\$code" != "204" \]/);
  assert.doesNotMatch(snippet, /\|\| true/);
});

test('production release dispatch must acknowledge both candidate promotion paths', async () => {
  const workflow = await read('.github/workflows/mel-candidate-promotion.yml');
  const helper = workflow.slice(workflow.indexOf('dispatch_release() {'),workflow.indexOf('if [ "$MAIN" = "$CAND" ]'));
  assert.match(helper, /--fail-with-body/);
  assert.match(helper, /PRODUCTION_RELEASE_DISPATCH_FAILED/);
  assert.match(helper, /PRODUCTION_RELEASE_DISPATCH_UNACKNOWLEDGED/);
  assert.match(helper, /\[ "\$code" != "204" \]/);
  assert.equal((workflow.match(/^\s*dispatch_release$/gm)||[]).length,2);
  assert.doesNotMatch(workflow,/PRODUCTION_RELEASE_DISPATCH http=\$code/);
});

test('Bridge permits only nonoverlapping descendant SHA rebase before mandatory full tests', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  assert.match(workflow,/git merge-base --is-ancestor "\$CANDIDATE_SHA" "\$HEAD_SHA"/);
  assert.match(workflow,/git --literal-pathspecs diff --quiet "\$CANDIDATE_SHA" "\$HEAD_SHA" -- "\$\{APPROVED_PATHS\[@\]\}"/);
  assert.match(workflow,/TEACHER_APPROVAL_CANDIDATE_SHA_STALE_OVERLAPPING_FILES/);
  assert.match(workflow,/APPROVED_SNAPSHOT_SHA=\$CANDIDATE_SHA/);
  assert.match(workflow,/CANDIDATE_SHA=\$HEAD_SHA/);
  assert.ok(workflow.indexOf('CANDIDATE_DISJOINT_REBASE') < workflow.indexOf('- name: Run exact bounded requested tests'));
});

test('Bridge file-list validation failure cannot be swallowed by shell process substitution', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  const snippet = workflow.slice(workflow.indexOf('CANDIDATE_SHA_STALE_NON_ANCESTOR'),workflow.indexOf('CANDIDATE_DISJOINT_REBASE'));
  assert.match(snippet,/node - > "\$RUNNER_TEMP\/mel-approved-paths\.bin" <<'NODE'/);
  assert.match(snippet,/mapfile -d '' -t APPROVED_PATHS < "\$RUNNER_TEMP\/mel-approved-paths\.bin"/);
  assert.doesNotMatch(snippet,/mapfile[^\n]*< <\(node/);
  assert.match(snippet,/process\.exit\(2\)/);
});

test('GEN2-42 obtains complete candidate ancestry before disjoint approved SHA reconciliation', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  const section = workflow.slice(workflow.indexOf('- name: Checkout exact approved candidate'),workflow.indexOf('- name: Apply bounded approved files'));
  assert.match(section,/git fetch origin "\$CANDIDATE_BRANCH"/);
  assert.doesNotMatch(section,/git fetch origin "\$CANDIDATE_BRANCH" --depth=/);
  assert.match(section,/git merge-base --is-ancestor "\$CANDIDATE_SHA" "\$HEAD_SHA"/);
});

test('candidate hygiene failure reporting never reads NO_CHANGES before initialization', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  const section = workflow.slice(workflow.indexOf('- name: Commit and push exact candidate change'),workflow.indexOf('- name: Report cloud bridge result'));
  assert.ok(section.indexOf('NO_CHANGES=false') < section.indexOf('HYGIENE_OUTPUT='));
  assert.ok(section.indexOf('NO_CHANGES=false') < section.indexOf('echo "no_changes=$NO_CHANGES"'));
});

test('Bridge conflict detection treats approved paths literally, never as Git magic pathspecs', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  assert.match(workflow,/git --literal-pathspecs diff --quiet/);
  assert.doesNotMatch(workflow,/if ! git diff --quiet "\$CANDIDATE_SHA"/);
});

test('Bridge file writes reject parent path segments, not safe filenames containing double dots', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  const apply = workflow.slice(workflow.indexOf('- name: Apply bounded approved files'),workflow.indexOf('- name: Run exact bounded requested tests'));
  assert.match(apply,/rel\.split\('\/'\)\.includes\('\.\.'\)/);
  assert.doesNotMatch(apply,/rel\.includes\('\.\.'\)/);
});

test('Bridge overlap validation and apply share segment-level parent traversal policy', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  const checkout = workflow.slice(workflow.indexOf('- name: Checkout exact approved candidate'),workflow.indexOf('- name: Apply bounded approved files'));
  const apply = workflow.slice(workflow.indexOf('- name: Apply bounded approved files'),workflow.indexOf('- name: Run exact bounded requested tests'));
  assert.match(checkout,/path\.split\('\/'\)\.includes\('\.\.'\)/);
  assert.doesNotMatch(checkout,/path\.includes\('\.\.'\)/);
  assert.match(apply,/rel\.split\('\/'\)\.includes\('\.\.'\)/);
});

test('successful GEN2-42 candidate CI dispatch publishes candidate_ready before D1 result reporting', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  const success = workflow.slice(workflow.indexOf('if [ "$code" != "204" ]; then'), workflow.indexOf('- name: Report cloud bridge result to production D1'));
  assert.match(success,/echo "candidate_ready=false" >> "\$GITHUB_OUTPUT"/);
  assert.match(success,/^\s*echo "candidate_ready=true" >> "\$GITHUB_OUTPUT"/m);
  const successPosition = success.lastIndexOf('echo "candidate_ready=true"');
  assert.ok(successPosition > success.indexOf('exit 0'));
  assert.match(workflow,/CANDIDATE_READY: \$\{\{ steps\.commit\.outputs\.candidate_ready \}\}/);
});

test('Bridge reporting preserves commit-stage repair diagnostics ahead of green tests', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  const report = workflow.slice(workflow.indexOf('- name: Report cloud bridge result to production D1'),workflow.indexOf('- name: Persist claimed bridge failure before exit'));
  assert.match(report,/base\.status==='REPAIR_REQUIRED' \|\| !testsPassed/);
  assert.match(report,/commitOk && candidateReady/);
  assert.doesNotMatch(report,/: 'FAILED';/);
});

test('approved rebase inspection never stages its temporary file with candidate code', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  assert.match(workflow,/node - > "\$RUNNER_TEMP\/mel-approved-paths\.bin"/);
  assert.match(workflow,/mapfile -d '' -t APPROVED_PATHS < "\$RUNNER_TEMP\/mel-approved-paths\.bin"/);
  assert.doesNotMatch(workflow,/node - > approved-paths\.bin/);
});

test('GEN2-42 stages only Teacher-approved paths and never generated test outputs', async () => {
  const workflow = await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  const commit=workflow.slice(workflow.indexOf('- name: Commit and push exact candidate change'),workflow.indexOf('- name: Report cloud bridge result'));
  assert.match(commit,/git --literal-pathspecs add -- "\$\{STAGE_PATHS\[@\]\}"/);
  assert.match(commit,/job\.files_json/);
  assert.doesNotMatch(commit,/git add --all/);
});

test('approved-file staging rejects ambiguous dot or backslash path segments', async () => {
 const workflow=await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
 const stage=workflow.slice(workflow.indexOf('mel-stage-paths.bin'),workflow.indexOf('HYGIENE_OUTPUT='));
 assert.match(stage,/p\.includes\('\\\\'\)/);
 assert.match(stage,/p\.split\('\/'\)\.includes\('\.'\)/);
 assert.match(stage,/git --literal-pathspecs add/);
});

test('exact approved staging rejects raw backslash paths instead of normalizing them', async () => {
 const workflow=await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
 const stage=workflow.slice(workflow.indexOf('mel-stage-paths.bin'),workflow.indexOf('HYGIENE_OUTPUT='));
 assert.match(stage,/const p=String\(item\?\.path\|\|''\);/);
 assert.doesNotMatch(stage,/const p=String\(item\?\.path\|\|''\)\.replace/);
 assert.match(stage,/p\.includes\('\\\\'\)/);
});

test('Bridge follow-up tick dispatch JSON remains outside the git worktree', async () => {
  const workflow=await read('.github/workflows/gen2-42-apply-ready-bridge.yml');
  const followup=workflow.slice(workflow.indexOf('- name: Continue autonomy after persisted bridge result'),workflow.indexOf('- name: Upload sanitized apply evidence'));
  assert.match(followup,/\$RUNNER_TEMP\/mel-autonomy-next-dispatch\.json/);
  assert.doesNotMatch(followup,/> autonomy-next-dispatch\.json/);
});
