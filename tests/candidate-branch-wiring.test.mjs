import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function loadWrangler() {
  const raw = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

test('candidate deployment reads and develops the exact clean MEL branch', () => {
  const config = loadWrangler();
  assert.equal(config.vars.MEL_GITHUB_BRANCH, 'candidate/mel-clean-autonomy');
  assert.equal(config.vars.MEL_TEACHER_BRANCH, 'candidate/mel-clean-autonomy');
  assert.match(config.vars.MEL_GITHUB_REPOSITORY, /meliturgos-cloudflare$/);
});

test('candidate config never silently points autonomy back to superseded branches', () => {
  const raw = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.doesNotMatch(raw, /release\/mel-2026-09-10-r3-3/);
  assert.doesNotMatch(raw, /candidate\/augmentio-core/);
});
