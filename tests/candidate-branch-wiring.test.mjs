import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setDefaultCapabilityEnvironment } from '../src/capabilities/default-bus.js';

function loadWrangler() {
  const raw = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

const runtimeBranchSources = [
  '../wrangler.jsonc',
  '../src/capabilities/default-bus.js',
  '../src/evolution/autonomy-runtime.js',
  '../src/evolution/autonomy-implementation-planner.js',
  '../src/evolution/autonomy-bridge-preparer.js',
  '../src/teachers/github-completion-reconciler.js',
  '../src/teachers/github-request-mirror.js',
  '../src/teachers/github-reply-reconciler.js',
];

test('candidate deployment reads and develops the exact clean MEL branch', () => {
  const config = loadWrangler();
  assert.equal(config.vars.MEL_GITHUB_BRANCH, 'candidate/mel-clean-autonomy');
  assert.equal(config.vars.MEL_TEACHER_BRANCH, 'candidate/mel-clean-autonomy');
  assert.match(config.vars.MEL_GITHUB_REPOSITORY, /meliturgos-cloudflare$/);
});

test('capability bus safe defaults also remain on the clean candidate when bindings are absent', () => {
  const state = setDefaultCapabilityEnvironment({});
  assert.equal(state.github_branch, 'candidate/mel-clean-autonomy');
  assert.equal(state.teacher_branch, 'candidate/mel-clean-autonomy');
  assert.match(state.github_repository, /meliturgos-cloudflare$/);
});

test('runtime autonomy and Teacher transports never silently point back to superseded branches', () => {
  for (const relative of runtimeBranchSources) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /release\/mel-2026-09-10-r3-3/);
    assert.doesNotMatch(source, /release\/mel-2026-09-10-r3['"]/);
    assert.doesNotMatch(source, /candidate\/augmentio-core/);
    assert.match(source, /candidate\/mel-clean-autonomy/, relative);
  }
});
