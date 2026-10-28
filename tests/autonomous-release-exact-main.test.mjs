import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');

test('automatic production release requires a commit of current main history before any backup or mutation', () => {
  const identity = workflow.indexOf('      - name: Prove release pointer belongs to the current main history');
  const guard = workflow.indexOf('if { [ "$GITHUB_EVENT_NAME" = "push" ] || [ "$AUTONOMOUS_DISPATCH" = "true" ]; } && ! git merge-base --is-ancestor "$EXPECTED_SHA" "$SOURCE_SHA"; then', identity);
  const failure = workflow.indexOf('Autonomous release rejected', guard);
  const backup = workflow.indexOf('      - name: Refresh current production backup through ephemeral worker');
  assert.ok(identity >= 0, 'identity gate must exist');
  assert.ok(guard > identity, 'automatic releases must prove the pointer is in main history inside the identity gate');
  assert.ok(failure > guard && failure < backup, 'a pointer outside main history must fail closed before production backup');
  const advance = workflow.indexOf('test "$MAIN_ADVANCE_COUNT" -le 25', guard);
  assert.ok(advance > guard && advance < backup, 'the deployed commit may lag main by at most 25 commits');
});

test('manual release still requires explicit approval and autonomous policy is confined to the dedicated release branch', () => {
  assert.ok(workflow.includes('test "$APPROVAL" = "DEPLOY_APPROVED"'));
  assert.ok(workflow.includes('test "$GITHUB_REF" = "refs/heads/release/mel-hardware-v0.1.0"'));
  assert.ok(workflow.includes('AUTONOMOUS_RELEASE_POLICY: \'enabled\''));
  assert.ok(workflow.includes('OWNER_MAX_AUTORELEASE: ${{ github.event_name != \'workflow_dispatch\' && \'false\' || (inputs.owner_max_autorelease && \'true\' || \'false\') }}'));
});

test('MEL autonomous dispatch uses a distinct non-human release policy and restricted actor identity', () => {
  assert.ok(workflow.includes('AUTONOMOUS_DISPATCH: ${{ github.event_name == \'workflow_dispatch\' && inputs.autonomous_release'));
  assert.ok(workflow.includes('test "$APPROVAL" = "AUTONOMOUS_POLICY"'));
  assert.ok(workflow.includes('test "$RELEASE_BRANCH" = "release/mel-hardware-v0.1.0"'));
  assert.ok(workflow.includes('adrienlopezcarreras-pixel|github-actions\\[bot\\]'));
});
