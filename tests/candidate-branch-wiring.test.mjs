import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setDefaultCapabilityEnvironment } from '../src/capabilities/default-bus.js';

const CANONICAL_BRANCH = 'candidate/mentor-guarded-zero-euro-20260912';

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

test('candidate deployment reads and develops the current guarded candidate branch', () => {
  const config = loadWrangler();
  assert.equal(config.vars.MEL_GITHUB_BRANCH, CANONICAL_BRANCH);
  assert.equal(config.vars.MEL_TEACHER_BRANCH, CANONICAL_BRANCH);
  assert.match(config.vars.MEL_GITHUB_REPOSITORY, /meliturgos-cloudflare$/);
});

test('capability bus fallback remains fail-closed on a candidate branch when bindings are absent', () => {
  const state = setDefaultCapabilityEnvironment({});
  assert.match(state.github_branch, /^candidate\//);
  assert.match(state.teacher_branch, /^candidate\//);
  assert.match(state.github_repository, /meliturgos-cloudflare$/);
});

test('runtime autonomy and Teacher transports never silently point to production or superseded branches', () => {
  for (const relative of runtimeBranchSources) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /release\/mel-2026-09-10-r3-3/);
    assert.doesNotMatch(source, /release\/mel-2026-09-10-r3['"]/);
    assert.doesNotMatch(source, /candidate\/mel-clean-autonomy/);
  }
});
