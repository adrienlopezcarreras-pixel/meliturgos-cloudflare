import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');

test('automatic production release requires the exact current main SHA before any backup or mutation', () => {
  const identity = workflow.indexOf('      - name: Prove release pointer belongs to the current main history');
  const guard = workflow.indexOf('if [ "$GITHUB_EVENT_NAME" = "push" ] && [ "$SOURCE_SHA" != "$EXPECTED_SHA" ]; then', identity);
  const failure = workflow.indexOf('Autonomous release rejected', guard);
  const backup = workflow.indexOf('      - name: Refresh current production backup through ephemeral worker');
  assert.ok(identity >= 0, 'identity gate must exist');
  assert.ok(guard > identity, 'push-only equality check must be in identity gate');
  assert.ok(failure > guard && failure < backup, 'mismatched main SHA must fail closed before production backup');
});

test('manual release still requires explicit approval and autonomous policy is confined to the dedicated release branch', () => {
  assert.ok(workflow.includes('test "$APPROVAL" = "DEPLOY_APPROVED"'));
  assert.ok(workflow.includes('test "$GITHUB_REF" = "refs/heads/release/mel-hardware-v0.1.0"'));
  assert.ok(workflow.includes('AUTONOMOUS_RELEASE_POLICY: \'enabled\''));
  assert.ok(workflow.includes('OWNER_MAX_AUTORELEASE: ${{ github.event_name == \'workflow_dispatch\' && inputs.owner_max_autorelease && \'true\' || \'false\' }}'));
});
