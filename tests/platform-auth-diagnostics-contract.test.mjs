import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/activate-platform-capabilities.yml',import.meta.url),'utf8');

test('pull request runs diagnostics contract without production mutation', () => {
  assert.match(workflow,/auth-diagnostics-contract:\n\s+if: github\.event_name == 'pull_request'/);
  assert.match(workflow,/node --test tests\/platform-auth-diagnostics-contract\.test\.mjs/);
  assert.match(workflow,/activate-and-prove:\n\s+if: github\.event_name != 'pull_request'/);
});

test('401 diagnostic is sanitized and does not echo secret headers or bodies', () => {
  assert.match(workflow,/REDACTED_AUTH_ERROR/);
  assert.match(workflow,/\^\[A-Z0-9_:-\]\{1,96\}\$/);
  assert.match(workflow,/Non-transient authorization failure; refusing further retries/);
  assert.match(workflow,/INVALID_BOOTSTRAP_TOKEN\|BOOTSTRAP_TOKEN_NOT_READY\|UNSPECIFIED_401/);
  assert.doesNotMatch(workflow,/cat\s+"?\$\{out\}"?/);
});
