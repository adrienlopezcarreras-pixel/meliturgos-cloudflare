import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bridgePublicationFailureOnly } from '../src/evolution/autonomy-runtime-core.js';

test('autonomy runtime retries REPAIR_REQUIRED executor failures without discarding approved package', async () => {
  const source = await readFile(new URL('../src/evolution/autonomy-runtime-core.js', import.meta.url), 'utf8');
  assert.match(source, /jobStatus === 'REPAIR_REQUIRED'/);
  assert.match(source, /executorFailure = jobStatus === 'REPAIR_REQUIRED' && \(failedTests\.length === 0 \|\| bridgePublicationFailureOnly\(failedTests\)\)/);
  assert.match(source, /OWNER_MAX_EXECUTOR_FAILURE/);
  assert.match(source, /runtime_retry/);
  assert.match(source, /status: 'TEACHER_APPROVED'/);
  assert.match(source, /if \(!executorFailure\) \{[\s\S]*delete result\.implementation_proposal;[\s\S]*delete result\.bridge_package;[\s\S]*delete result\.bridge_preparation;/);
});

test('candidate branch races and bounded CI-dispatch errors preserve approved package for safe retry', () => {
  for (const [command,error] of [
    ['git.push','CANDIDATE_PUSH_NOT_FAST_FORWARD'],
    ['git.ls-remote','CANDIDATE_HEAD_MOVED_BEFORE_CI_DISPATCH'],
    ['github.actions.workflow_dispatch','FULL_CANDIDATE_CI_DISPATCH_FAILED'],
  ]) {
    assert.equal(bridgePublicationFailureOnly([{command,error,passed:false}]),true,error);
  }
  // One genuine code/test failure must invalidate the generated implementation.
  for (const bad of [
    [],
    [{command:'test',error:'TEST_COMMAND_FAILED',passed:false}],
    [{command:'git.push',error:'CANDIDATE_HYGIENE_FAILED',passed:false}],
    [{command:'git.push',error:'CANDIDATE_PUSH_NOT_FAST_FORWARD',passed:true}],
    [{command:'github.actions.workflow_dispatch',error:'UNKNOWN_ERROR',passed:false}],
    [{command:'git.push',error:'CANDIDATE_PUSH_NOT_FAST_FORWARD',passed:false},
      {command:'test',error:'TEST_COMMAND_FAILED',passed:false}],
  ]) assert.equal(bridgePublicationFailureOnly(bad),false,JSON.stringify(bad));
});
