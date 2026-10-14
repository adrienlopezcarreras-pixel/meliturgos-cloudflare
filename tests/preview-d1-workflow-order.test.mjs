import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('isolated D1 read-only preflight precedes migration', () => {
  const workflow = readFileSync('.github/workflows/deploy-candidate-preview.yml', 'utf8');
  const isolation = workflow.indexOf('- name: Require isolated preview resource identities before any mutation');
  const preflight = workflow.indexOf('- name: Verify isolated preview D1 account access (read-only)');
  const migration = workflow.indexOf('- name: Initialize isolated preview D1');
  assert.ok(isolation >= 0 && isolation < preflight && preflight < migration);
  const section = workflow.slice(preflight, migration);
  assert.match(section, /checkPreviewD1Access/);
  assert.match(section, /if \(!result\.ok\) process\.exitCode = 1/);
});
