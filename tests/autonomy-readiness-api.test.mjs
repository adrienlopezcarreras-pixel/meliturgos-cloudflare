import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { maybeHandleAutonomyApi } from '../src/evolution/autonomy-api.js';

const auth = `Basic ${Buffer.from('test:pw').toString('base64')}`;
const CANDIDATE_HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CANDIDATE_BRANCH = 'candidate/mel-clean-autonomy';
const TEST_ROADMAP = Object.freeze([
  { id: 'TEST-READY-01', title: 'Synthetic readiness autonomy', status: 'IN_PROGRESS', next: 'test', priority: 'P0' },
]);

function fixture() {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'pw',
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_GITHUB_BRANCH: CANDIDATE_BRANCH,
    MEL_TEACHER_BRANCH: CANDIDATE_BRANCH,
    MEL_TEACHER_APPROVED_BRANCH: CANDIDATE_BRANCH,
    AI: { async run(model) { return { response: `ack:${model}` }; } },
  };
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes('teacher-bridge/replies.jsonl')) return new Response('', { status: 200 });
    if (target.includes('teacher-bridge/completions.jsonl')) return new Response('', { status: 200 });
    if (target.includes('/commits/candidate%2Fmel-clean-autonomy')) return Response.json({ sha: CANDIDATE_HEAD_SHA });
    if (target.startsWith('https://api.github.com/')) return new Response('fixture rate limit', { status: 403 });
    if (target.startsWith('https://raw.githubusercontent.com/')) return new Response('export const fixture = true;\n', { status: 200, headers: { etag: 'fixture' } });
    return new Response('not found', { status: 404 });
  };
  return { repository, env, fetchImpl };
}

test('/api/gen2/autonomy/status is an authenticated alias with evidence-based readiness', async () => {
  const f = fixture();
  const response = await maybeHandleAutonomyApi(
    new Request('http://mel/api/gen2/autonomy/status', { headers: { authorization: auth } }),
    f.env,
    { repository: f.repository, fetchImpl: f.fetchImpl, roadmap: TEST_ROADMAP },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.readiness.self_development_ready, false);
  assert.equal(body.readiness.status, 'BUILDING_AUTONOMY');
  assert.ok(body.readiness.blockers.includes('LIVE_COUNCIL_ZERO_COST_NOT_PROVEN'));
});

test('manual tick without independently verified live Council remains unverified', async () => {
  const f = fixture();
  const response = await maybeHandleAutonomyApi(
    new Request('http://mel/api/gen2/autonomy/tick', { method: 'POST', headers: { authorization: auth } }),
    f.env,
    { repository: f.repository, fetchImpl: f.fetchImpl, roadmap: TEST_ROADMAP },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  // The full npm test runner deliberately grants signed zero-cost
  // provenance to Node-only mocked Workers AI; standalone CI does not.
  // Neither mode is evidence of real paid inference or self-development.
  const nodeMockGovernor = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS === '1';
  assert.ok(['VERIFIED','NOT_VERIFIED'].includes(body.tick.runtime_proof.status));
  assert.equal(body.state.readiness.gates.live_council_zero_cost, nodeMockGovernor);
  // The public API intentionally exposes gate booleans and blockers, but
  // not detailed internal proof records; repository-level tests exercise
  // mandatory Council role/synthesis/identity evidence separately.
  assert.equal(body.state.readiness.blockers.includes('LIVE_COUNCIL_ZERO_COST_NOT_PROVEN'), !nodeMockGovernor);
  assert.equal(body.state.readiness.gates.runtime_teacher_round_trip, false);
  assert.equal(body.state.readiness.self_development_ready, false);
});
