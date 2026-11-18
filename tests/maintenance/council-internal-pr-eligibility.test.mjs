import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyCouncilRoute, internalDiscoveryCi } from '../../scripts/council-internal-pr-eligibility.cjs';

const workflow = readFileSync(new URL('../../.github/workflows/mel-pr-council-review.yml', import.meta.url), 'utf8');
const trusted = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
const sha = 'fa10cf2e6a5b5f0649f0b2cfed9dc07d497e00b5';

function base(overrides = {}) {
  return {
    prNumber: 3244,
    base: 'main',
    repo: trusted,
    trustedRepo: trusted,
    head: sha,
    expectedSha: sha,
    state: 'open',
    event: 'workflow_run',
    ownerManual: false,
    ...overrides,
  };
}

test('a new same-repository PR is discovery only and cannot vote or authorize release', () => {
  const route = classifyCouncilRoute(base());
  assert.equal(route.route, 'internal_discovery');
  assert.equal(route.vote, false);
  assert.equal(route.release_authorized, false);
});

test('forks, closed PRs, changed SHAs and non-main bases stay refused', () => {
  assert.equal(classifyCouncilRoute(base({ repo: 'fork/meliturgos-cloudflare' })).code, 'COUNCIL_FORK_DENIED');
  assert.equal(classifyCouncilRoute(base({ state: 'closed' })).code, 'COUNCIL_PR_NOT_ALLOWLISTED');
  assert.equal(classifyCouncilRoute(base({ head: 'a'.repeat(40) })).code, 'COUNCIL_SHA_MISMATCH');
  assert.equal(classifyCouncilRoute(base({ expectedSha: 'b'.repeat(40) })).code, 'COUNCIL_SHA_MISMATCH');
  assert.equal(classifyCouncilRoute(base({ base: 'via-build' })).code, 'COUNCIL_BASE_NOT_MAIN');
  assert.equal(classifyCouncilRoute(base({ event: 'schedule', state: 'open' })).code, 'COUNCIL_PR_NOT_ALLOWLISTED');
});

test('legacy and owner-manual profiles stay distinct from internal discovery', () => {
  assert.equal(classifyCouncilRoute(base({ prNumber: 3094, state: 'closed', event: 'schedule' })).route, 'legacy');
  assert.equal(classifyCouncilRoute(base({ prNumber: 3244, ownerManual: true, event: 'workflow_dispatch' })).route, 'owner_manual');
});

test('green exact checks do not become a Council vote or a MAX unblock', () => {
  const latest = new Map([
    ['professor-audit', { conclusion: 'success' }],
    ['gen2-17-targeted', { conclusion: 'success' }],
    ['gen2-17-full-suite', { conclusion: 'success' }],
    ['full-validation', { conclusion: 'success' }],
    ['max-cloud-scheduler', { conclusion: 'success' }],
  ]);
  const report = internalDiscoveryCi(latest);
  assert.equal(report.status, 'ci_green_no_vote');
  assert.equal(report.ready, false);
  assert.equal(report.council_vote, false);
  assert.equal(report.release_authorized, false);
  assert.equal(report.teacher_approval, false);
  assert.equal(report.max_unblocked, false);
  latest.set('professor-audit', { conclusion: null });
  assert.equal(internalDiscoveryCi(latest).status, 'ci_not_green_no_vote');
});

test('workflow discovers same-repo PRs without removing legacy gates or starting a vote', () => {
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /MEL_COUNCIL_INTERNAL_DISCOVERY=true/);
  assert.match(workflow, /COUNCIL_PR_NOT_ALLOWLISTED/);
  assert.match(workflow, /ready=false/);
  assert.match(workflow, /COUNCIL_INTERNAL_DISCOVERY_CI_GREEN_NO_VOTE/);
  assert.match(workflow, /needs\.preflight\.outputs\.ready == 'true'/);
  assert.match(workflow, /release_authorized:false/);
  assert.match(workflow, /fix\/max-owner-stop-pauses-runtime-20261104/);
  assert.doesNotMatch(workflow, /gh pr merge/);
});
