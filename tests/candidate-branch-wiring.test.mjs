import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setDefaultCapabilityEnvironment } from '../src/capabilities/default-bus.js';

function loadWrangler() {
  const raw = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

const executableBranchSources = [
  '../wrangler.jsonc',
  '../src/capabilities/default-bus.js',
  '../src/evolution/autonomy-runtime.js',
  '../src/evolution/autonomy-implementation-planner.js',
  '../src/evolution/autonomy-bridge-preparer.js',
  '../src/teachers/github-completion-reconciler.js',
  '../src/teachers/github-reply-reconciler.js',
];

const teacherTransportSources = [
  '../wrangler.jsonc',
  '../src/teachers/github-request-mirror.js',
];

test('candidate deployment reads and develops the exact clean MEL branch', () => {
  const config = loadWrangler();
  assert.equal(config.vars.MEL_GITHUB_BRANCH, 'candidate/mel-clean-autonomy');
  assert.equal(config.vars.MEL_TEACHER_BRANCH, 'candidate/mel-clean-autonomy');
  assert.equal(config.vars.MEL_TEACHER_TRANSPORT_BRANCH, 'teacher-bridge/runtime');
  assert.match(config.vars.MEL_TEACHER_REPLIES_URL, /refs\/heads\/teacher-bridge\/runtime\/teacher-bridge\/replies\.jsonl$/);
  assert.match(config.vars.MEL_TEACHER_COMPLETIONS_URL, /refs\/heads\/teacher-bridge\/runtime\/teacher-bridge\/completions\.jsonl$/);
  assert.match(config.vars.MEL_GITHUB_REPOSITORY, /meliturgos-cloudflare$/);
});

test('capability bus safe defaults also remain on the clean candidate when bindings are absent', () => {
  const state = setDefaultCapabilityEnvironment({});
  assert.equal(state.github_branch, 'candidate/mel-clean-autonomy');
  assert.equal(state.teacher_branch, 'candidate/mel-clean-autonomy');
  assert.match(state.github_repository, /meliturgos-cloudflare$/);
});

test('runtime executable code never silently points back to superseded branches', () => {
  for (const relative of executableBranchSources) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /release\/mel-2026-09-10-r3-3/);
    assert.doesNotMatch(source, /release\/mel-2026-09-10-r3['"]/);
    assert.doesNotMatch(source, /candidate\/augmentio-core/);
    assert.match(source, /candidate\/mel-clean-autonomy/, relative);
  }
});

test('Teacher transport is explicitly isolated from the executable candidate branch', () => {
  for (const relative of teacherTransportSources) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /release\/mel-2026-09-10-r3-3/);
    assert.doesNotMatch(source, /candidate\/augmentio-core/);
    assert.match(source, /teacher-bridge\/runtime/, relative);
  }

  const mirror = readFileSync(new URL('../src/teachers/github-request-mirror.js', import.meta.url), 'utf8');
  assert.match(mirror, /TEACHER_MIRROR_TRANSPORT_BRANCH_INVALID/);
  assert.doesNotMatch(mirror, /MEL_TEACHER_BRANCH\s*\|\|/);
});
